import { NextRequest, NextResponse } from 'next/server';

import { getVideosByCategory } from '@/lib/cms';
import { getCacheTime, getConfig } from '@/lib/config';
import { normalizeEthicsConfig } from '@/lib/ethics.config';
import { isNsfwUnlockedFromRequest } from '@/lib/nsfw.server';
import runtimeConfig from '@/lib/runtime';

export const runtime = 'edge';

// 伦理开关配置的来源站，这些站点的片单需要解锁后才能取
function getEthicsSources(): string[] {
  return normalizeEthicsConfig(
    (
      runtimeConfig as unknown as {
        ethics_config?: Parameters<typeof normalizeEthicsConfig>[0];
      }
    ).ethics_config
  ).sources;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get('source');
  const typeId = searchParams.get('t');
  const page = parseInt(searchParams.get('pg') || '1', 10);

  if (!source || !typeId) {
    return NextResponse.json(
      { list: [], page: 1, pagecount: 0, total: 0 },
      { status: 400 }
    );
  }

  const isEthicsSource = getEthicsSources().includes(source);
  if (isEthicsSource && !(await isNsfwUnlockedFromRequest(request))) {
    return NextResponse.json(
      { list: [], page: 1, pagecount: 0, total: 0, error: '未解锁伦理内容' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  const config = await getConfig();
  const apiSite = config.SourceConfig.find(
    (site) => site.key === source && !site.disabled
  );

  if (!apiSite) {
    return NextResponse.json(
      { list: [], page: 1, pagecount: 0, total: 0 },
      { status: 404 }
    );
  }

  try {
    const result = await getVideosByCategory(
      apiSite,
      parseInt(typeId, 10),
      page
    );

    const cacheTime = await getCacheTime();

    return NextResponse.json(result, {
      headers: isEthicsSource
        ? { 'Cache-Control': 'private, no-store' }
        : {
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
            'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          },
    });
  } catch {
    return NextResponse.json({ error: '获取片单失败' }, { status: 500 });
  }
}
