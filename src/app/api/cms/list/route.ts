import { NextResponse } from 'next/server';

import { getVideosByCategory } from '@/lib/cms';
import { getCacheTime, getConfig } from '@/lib/config';

export const runtime = 'edge';

export async function GET(request: Request) {
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
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch {
    return NextResponse.json({ error: '获取片单失败' }, { status: 500 });
  }
}