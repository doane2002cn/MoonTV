#!/usr/bin/env node
/**
 * NAS 侧发布器：探测源站并把清单写回 GitHub（main）。
 *
 * 不依赖 git、不需要 clone 仓库：
 *   1. 从 GitHub 读取 config.json 与上一份清单（延续 consecutive_fails/last_ok）
 *   2. 本地探测
 *   3. 用 GitHub Contents API 提交 public/docs/sources_health.json
 *
 * 环境变量：
 *   MOONTV_GITHUB_TOKEN      必填，细粒度 token，仅需目标仓库 contents:write
 *   MOONTV_REPO              可选，默认 doane2002cn/MoonTV
 *   MOONTV_BRANCH            可选，默认 main
 *   SOURCE_HEALTH_CONFIG     可选，改为读取本地 config.json
 *   SOURCE_HEALTH_TIMEOUT_MS 可选，默认 12000
 *   SOURCE_HEALTH_CONCURRENCY 可选，默认 6
 *   MOONTV_PUBLISH_DRY_RUN=1 可选，只探测不发布
 */

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { probeConfig } from './probe-source-health.mjs';

const REPO = process.env.MOONTV_REPO || 'doane2002cn/MoonTV';
const BRANCH = process.env.MOONTV_BRANCH || 'main';
const FILE_PATH = 'public/docs/sources_health.json';
const TOKEN = process.env.MOONTV_GITHUB_TOKEN || '';
const DRY_RUN = process.env.MOONTV_PUBLISH_DRY_RUN === '1';

const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

function githubHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'moontv-source-health',
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function readConfig() {
  const localPath = process.env.SOURCE_HEALTH_CONFIG;
  if (localPath) {
    return JSON.parse(await readFile(localPath, 'utf8'));
  }
  return fetchJson(`${RAW_BASE}/config.json?t=${Date.now()}`, {
    headers: { 'User-Agent': 'moontv-source-health' },
  });
}

async function readPrevious() {
  const previous = new Map();
  try {
    const raw = await fetchJson(`${RAW_BASE}/${FILE_PATH}?t=${Date.now()}`, {
      headers: { 'User-Agent': 'moontv-source-health' },
    });
    for (const item of raw?.sources ?? []) {
      if (item?.key) previous.set(item.key, item);
    }
  } catch (error) {
    if (error.status !== 404) {
      console.warn(`读取上一份清单失败，将按首次发布处理：${error.message}`);
    }
  }
  return previous;
}

async function publish(payload) {
  if (!TOKEN) {
    throw new Error('缺少 MOONTV_GITHUB_TOKEN');
  }

  const content = Buffer.from(
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  ).toString('base64');
  const body = {
    message: 'chore(source-health): refresh health list (nas)',
    content,
    branch: BRANCH,
  };

  let sha = '';
  try {
    const meta = await fetchJson(
      `${API_URL}?ref=${encodeURIComponent(BRANCH)}&t=${Date.now()}`,
      { headers: githubHeaders() }
    );
    sha = meta.sha || '';
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const put = (nextSha) =>
    fetch(API_URL, {
      method: 'PUT',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSha ? { ...body, sha: nextSha } : body),
    });

  let response = await put(sha);

  // 并发写导致 sha 过期时，重新取一次再试
  if (response.status === 409) {
    const meta = await fetchJson(
      `${API_URL}?ref=${encodeURIComponent(BRANCH)}&t=${Date.now()}`,
      { headers: githubHeaders() }
    );
    response = await put(meta.sha);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`发布失败 HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.status;
}

async function main() {
  const config = await readConfig();
  const previous = await readPrevious();

  const payload = await probeConfig(config, {
    timeoutMs: Number(process.env.SOURCE_HEALTH_TIMEOUT_MS) || undefined,
    concurrency: Number(process.env.SOURCE_HEALTH_CONCURRENCY) || undefined,
    previous,
  });

  console.log(
    `probed ${payload.summary.total} sources: ok=${payload.summary.ok} ` +
      `failed=${payload.summary.failed} at ${payload.generated_at}`
  );
  for (const item of payload.sources) {
    if (!item.ok) {
      console.log(
        `  FAIL ${item.key} (fails=${item.consecutive_fails}): ${item.error}`
      );
    }
  }

  if (DRY_RUN) {
    console.log('dry run: skipped publishing');
    return;
  }

  const status = await publish(payload);
  console.log(`published ${FILE_PATH} -> ${BRANCH} (HTTP ${status})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
