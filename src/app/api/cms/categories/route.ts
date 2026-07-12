import { NextResponse } from 'next/server';

import { getCategoriesFromApi, getEthicsCategoriesFromApi } from '@/lib/cms';
import { getCacheTime, getConfig } from '@/lib/config';
import {
  getEthicsSourcesString,
  normalizeEthicsConfig,
} from '@/lib/ethics.config';
import runtimeConfig from '@/lib/runtime';

export const runtime = 'edge';

function getFileEthicsConfig() {
  return normalizeEthicsConfig(
    (
      runtimeConfig as unknown as {
        ethics_config?: Parameters<typeof normalizeEthicsConfig>[0];
      }
    ).ethics_config
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') || 'short-drama';
  const ethicsConfig = getFileEthicsConfig();
  const defaultSources =
    kind === 'ethics' ? getEthicsSourcesString(ethicsConfig) : 'mdzy,jisu';
  const sourcesParam = searchParams.get('sources') || defaultSources;

  const config = await getConfig();
  const sourceKeys = sourcesParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const apiSites = config.SourceConfig.filter(
    (site) => !site.disabled && sourceKeys.includes(site.key)
  );

  if (apiSites.length === 0) {
    return NextResponse.json({ categories: [] });
  }

  try {
    const results = await Promise.all(
      apiSites.map((site) =>
        kind === 'ethics'
          ? getEthicsCategoriesFromApi(site, ethicsConfig)
          : getCategoriesFromApi(site)
      )
    );
    const categories = results.flat();
    const cacheTime = await getCacheTime();

    return NextResponse.json(
      { categories },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  } catch {
    return NextResponse.json({ error: '获取分类失败' }, { status: 500 });
  }
}
