import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { isNsfwCategory } from '@/lib/nsfw';
import { isNsfwUnlockedFromRequest } from '@/lib/nsfw.server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  }

  const config = await getConfig();
  const apiSites = config.SourceConfig.filter((site) => !site.disabled);
  const searchPromises = apiSites.map((site) => searchFromApi(site, query));

  try {
    const unlocked = await isNsfwUnlockedFromRequest(request);
    const results = await Promise.all(searchPromises);
    const flattenedResults = results.flat();
    // 未解锁的账号直接从服务端剔除伦理内容，不再依赖前端隐藏
    const visibleResults = unlocked
      ? flattenedResults
      : flattenedResults.filter(
          (item) => !isNsfwCategory(item.type_name || '')
        );
    const cacheTime = await getCacheTime();

    return NextResponse.json(
      { results: visibleResults },
      {
        // 内容取决于当前账号是否解锁，不能进共享缓存
        headers: unlocked
          ? { 'Cache-Control': 'private, no-store' }
          : { 'Cache-Control': `private, max-age=${cacheTime}` },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
