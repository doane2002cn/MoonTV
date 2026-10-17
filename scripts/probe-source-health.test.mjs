import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

import {
  buildRecord,
  describeError,
  probeOne,
  snippet,
} from './probe-source-health.mjs';

let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    switch (url.pathname) {
      case '/good':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 1, list: [{ vod_id: 1 }] }));
        break;
      case '/empty':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 1, list: [] }));
        break;
      case '/html':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Just a moment...</body></html>');
        break;
      case '/500':
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('boom');
        break;
      case '/slow':
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 1, list: [{}] }));
        }, 5_000);
        break;
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('网络异常映射成可读类别', () => {
  assert.equal(
    describeError({
      cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND x' },
    }),
    'DNS: getaddrinfo ENOTFOUND x'
  );
  assert.equal(
    describeError({ cause: { code: 'ECONNREFUSED', message: 'refused' } }),
    'Connection refused'
  );
  assert.equal(describeError({ name: 'AbortError' }), 'Timeout');
});

test('NotJSON 只截取前 60 个字符', () => {
  const text = '  <html>\n' + 'x'.repeat(200);
  const body = snippet(text);
  assert.ok(body.startsWith('<html>'));
  assert.equal(body.length, 60);
});

test('合法 JSON 且 list 非空才算 ok', async () => {
  const good = await probeOne({ api: `${base}/good` });
  assert.equal(good.ok, true);
  assert.equal(good.http_status, 200);
  assert.equal(good.items, 1);
  assert.equal(good.error, '');

  const empty = await probeOne({ api: `${base}/empty` });
  assert.equal(empty.ok, false);
  assert.equal(empty.items, 0);
  assert.equal(empty.error, 'EmptyList');

  const html = await probeOne({ api: `${base}/html` });
  assert.equal(html.ok, false);
  assert.match(html.error, /^NotJSON: <html>/);

  const failed = await probeOne({ api: `${base}/500` });
  assert.equal(failed.ok, false);
  assert.equal(failed.http_status, 500);
  assert.equal(failed.error, 'HTTP 500');
});

test('连接被拒绝与超时能被识别', async () => {
  // 先占用再释放一个端口，保证随后连接会被拒绝
  const probeServer = http.createServer();
  await new Promise((resolve) => probeServer.listen(0, '127.0.0.1', resolve));
  const closedPort = probeServer.address().port;
  await new Promise((resolve) => probeServer.close(resolve));

  const refused = await probeOne(
    { api: `http://127.0.0.1:${closedPort}/api.php/provide/vod` },
    { timeoutMs: 2_000 }
  );
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'Connection refused');

  const slow = await probeOne({ api: `${base}/slow` }, { timeoutMs: 300 });
  assert.equal(slow.ok, false);
  assert.equal(slow.error, 'Timeout');
});

test('consecutive_fails 递增，成功归零并刷新 last_ok', () => {
  const site = { key: 'demo', name: '演示源', api: 'https://example.com/api' };
  const probe = {
    probe_url: 'https://example.com/api?ac=videolist&pg=1',
    ok: false,
    http_status: 503,
    items: 0,
    latency_ms: 100,
    checked_at: '2026-10-18T09:20:00+08:00',
    error: 'HTTP 503',
  };

  const first = buildRecord(site, probe, undefined);
  assert.equal(first.consecutive_fails, 1);
  assert.equal(first.last_ok, null);
  assert.equal(first.error, 'HTTP 503');

  const second = buildRecord(site, probe, first);
  assert.equal(second.consecutive_fails, 2);
  assert.equal(second.last_ok, null);

  const recovered = buildRecord(
    site,
    { ...probe, ok: true, http_status: 200, items: 20, error: '' },
    second
  );
  assert.equal(recovered.consecutive_fails, 0);
  assert.equal(recovered.last_ok, '2026-10-18T09:20:00+08:00');
  assert.equal(recovered.ok, true);
});

test('失败时保留上一次成功时间', () => {
  const site = { key: 'demo', name: '演示源', api: 'https://example.com/api' };
  const probe = {
    probe_url: 'https://example.com/api?ac=videolist&pg=1',
    ok: false,
    http_status: null,
    items: 0,
    latency_ms: 12_000,
    checked_at: '2026-10-18T21:20:00+08:00',
    error: 'Timeout',
  };
  const record = buildRecord(site, probe, {
    consecutive_fails: 2,
    last_ok: '2026-10-18T09:20:00+08:00',
  });
  assert.equal(record.consecutive_fails, 3);
  assert.equal(record.last_ok, '2026-10-18T09:20:00+08:00');
});
