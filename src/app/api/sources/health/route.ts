import { NextResponse } from 'next/server';

import snapshot from '../../../../../public/docs/sources_health.json';

export const runtime = 'edge';

// 定时任务把最新清单提交到 main，这里直接读仓库里的文件，
// 避免依赖 Pages 重新部署（机器人推送不会触发构建）。
const RAW_URL =
  'https://raw.githubusercontent.com/doane2002cn/MoonTV/main/public/docs/sources_health.json';
const CACHE_SECONDS = 300;

type FetchInitWithCache = RequestInit & {
  cf?: { cacheTtl?: number; cacheEverything?: boolean };
};

export async function GET() {
  let payload: unknown = snapshot;
  let origin = 'snapshot';

  try {
    // 不使用边缘缓存：机器人提交后要尽快可见；对外响应仍由 Cache-Control 控制
    const response = await fetch(`${RAW_URL}?t=${Date.now()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'moontv-source-health',
      },
      cache: 'no-store',
      cf: { cacheTtl: 0, cacheEverything: false },
    } as FetchInitWithCache);

    if (response.ok) {
      payload = await response.json();
      origin = 'github';
    }
  } catch {
    // 取不到最新清单时退回构建内置快照，保证接口始终可用
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      'X-Health-Source': origin,
    },
  });
}
