#!/usr/bin/env node
/**
 * 源站健康探测发布器
 *
 * 读取 config.json 的 api_site，对每个源发一次最小请求
 * （?ac=videolist&pg=1），把结果写到 public/docs/sources_health.json，
 * 供下游消费。
 *
 * 判定 ok 的条件：HTTP 200 + 合法 JSON + list 非空，缺一不可。
 * consecutive_fails 与 last_ok 从上一次发布结果继承，成功即归零。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 6;
const NOT_JSON_CHARS = 60;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** 统一的北京时间格式：2026-10-18T09:20:00+08:00 */
export function nowInShanghai(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

export function snippet(text, max = NOT_JSON_CHARS) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** 把底层网络异常映射成可读类别 */
export function describeError(error) {
  if (!error) return 'Unknown';
  if (error.name === 'AbortError') return 'Timeout';

  const cause = error.cause || {};
  const code = String(cause.code || error.code || '');
  const message = String(cause.message || error.message || error);

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `DNS: ${message}`;
    case 'ECONNREFUSED':
      return 'Connection refused';
    case 'ECONNRESET':
      return 'Connection reset';
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
    case 'UND_ERR_HEADERS_TIMEOUT':
    case 'UND_ERR_BODY_TIMEOUT':
      return 'Timeout';
    default:
      break;
  }
  if (/CERT|TLS|SSL/i.test(code)) return `TLS: ${code}`;
  return `Network: ${code ? `${code} ` : ''}${message}`.slice(0, 160);
}

/** 探测单个源，返回判定明细（不含历史状态） */
export async function probeOne(site, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = String(site.api || '').replace(/\/+$/, '');
  const probeUrl = `${base}?ac=videolist&pg=1`;
  const checkedAt = nowInShanghai();
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let ok = false;
  let httpStatus = null;
  let items = 0;
  let error = '';

  try {
    const response = await fetch(probeUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
    });
    httpStatus = response.status;
    const text = await response.text();

    if (!response.ok) {
      error = `HTTP ${response.status}`;
    } else {
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (data === null) {
        error = `NotJSON: ${snippet(text)}`;
      } else if (!Array.isArray(data.list) || data.list.length === 0) {
        error = 'EmptyList';
      } else {
        ok = true;
        items = data.list.length;
      }
    }
  } catch (err) {
    error = describeError(err);
  } finally {
    clearTimeout(timer);
  }

  return {
    probe_url: probeUrl,
    ok,
    http_status: httpStatus,
    items,
    latency_ms: Math.round(performance.now() - startedAt),
    checked_at: checkedAt,
    error,
  };
}

/** 合并探测结果与上一次发布状态 */
export function buildRecord(site, probe, previous) {
  const ok = probe.ok === true;
  const previousFails = Number.isInteger(previous?.consecutive_fails)
    ? previous.consecutive_fails
    : 0;

  return {
    key: site.key,
    name: site.name,
    api: site.api,
    probe_url: probe.probe_url,
    ok,
    http_status: probe.http_status,
    items: probe.items,
    latency_ms: probe.latency_ms,
    checked_at: probe.checked_at,
    last_ok: ok ? probe.checked_at : previous?.last_ok ?? null,
    consecutive_fails: ok ? 0 : previousFails + 1,
    error: probe.error || '',
  };
}

async function readPrevious(outPath) {
  try {
    const raw = await readFile(outPath, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const item of parsed?.sources ?? []) {
      if (item?.key) map.set(item.key, item);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}

/**
 * 对一份配置执行一轮探测，返回待发布的清单（不落盘）。
 * previous 是 Map<key, 上一次的条目>，用于延续连续失败计数与 last_ok。
 */
export async function probeConfig(config, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const previous = options.previous || new Map();

  const sites = Object.entries(config.api_site ?? {})
    .filter(([, site]) => site && typeof site.api === 'string' && site.api)
    .map(([key, site]) => ({
      key,
      name: site.name || key,
      api: site.api,
    }));

  const records = await mapPool(sites, concurrency, async (site) => {
    const probe = await probeOne(site, { timeoutMs });
    return buildRecord(site, probe, previous.get(site.key));
  });

  const okCount = records.filter((item) => item.ok).length;
  const payload = {
    generated_at: nowInShanghai(),
    summary: {
      total: records.length,
      ok: okCount,
      failed: records.length - okCount,
    },
    sources: records,
  };

  return payload;
}

/**
 * 执行一轮探测并写文件。
 * 可用 options 覆盖路径/超时/并发，方便本地测试与 NAS 复用。
 */
export async function runProbe(options = {}) {
  const root = options.root || process.cwd();
  const configPath = options.configPath || path.join(root, 'config.json');
  const outPath =
    options.outPath || path.join(root, 'public', 'docs', 'sources_health.json');

  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const previous = await readPrevious(outPath);
  const payload = await probeConfig(config, {
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    previous,
  });

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return payload;
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCli) {
  runProbe({
    configPath: process.env.SOURCE_HEALTH_CONFIG || undefined,
    outPath: process.env.SOURCE_HEALTH_OUT || undefined,
    timeoutMs: process.env.SOURCE_HEALTH_TIMEOUT_MS
      ? Number(process.env.SOURCE_HEALTH_TIMEOUT_MS)
      : undefined,
    concurrency: process.env.SOURCE_HEALTH_CONCURRENCY
      ? Number(process.env.SOURCE_HEALTH_CONCURRENCY)
      : undefined,
  })
    .then((payload) => {
      console.log(
        `probed ${payload.summary.total} sources: ok=${payload.summary.ok} failed=${payload.summary.failed}`
      );
      for (const item of payload.sources) {
        const state = item.ok ? 'OK  ' : 'FAIL';
        const detail = item.ok ? `${item.items} items` : item.error;
        console.log(
          `  ${state} ${item.key.padEnd(10)} ` +
            `${String(item.http_status ?? '-').padEnd(4)} ` +
            `${String(item.latency_ms).padStart(6)}ms  ${detail}`
        );
      }
      console.log(`wrote ${payload.generated_at}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
