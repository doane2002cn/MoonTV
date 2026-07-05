import { API_CONFIG, ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';

export interface CmsCategory {
  type_id: number;
  type_name: string;
  type_pid: number;
  source: string;
  source_name: string;
}

interface CmsApiItem {
  vod_id: string | number;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  type_name?: string;
}

const SHORT_DRAMA_KEYWORDS = ['短剧', '爽文'];

export function isShortDramaCategory(typeName: string): boolean {
  if (typeName.includes('短片') || typeName.includes('擦边')) {
    return false;
  }
  return SHORT_DRAMA_KEYWORDS.some((kw) => typeName.includes(kw));
}

function mapApiItem(item: CmsApiItem, apiSite: ApiSite): SearchResult {
  let episodes: string[] = [];

  if (item.vod_play_url) {
    const m3u8Regex = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
    const vodPlayUrlArray = item.vod_play_url.split('$$$');
    vodPlayUrlArray.forEach((url: string) => {
      const matches = url.match(m3u8Regex) || [];
      if (matches.length > episodes.length) {
        episodes = matches;
      }
    });
  }

  episodes = Array.from(new Set(episodes)).map((link: string) => {
    link = link.substring(1);
    const parenIndex = link.indexOf('(');
    return parenIndex > 0 ? link.substring(0, parenIndex) : link;
  });

  return {
    id: item.vod_id.toString(),
    title: item.vod_name.trim().replace(/\s+/g, ' '),
    poster: item.vod_pic,
    episodes,
    source: apiSite.key,
    source_name: apiSite.name,
    class: item.vod_class,
    year: item.vod_year
      ? item.vod_year.match(/\d{4}/)?.[0] || ''
      : 'unknown',
    desc: cleanHtmlTags(item.vod_content || ''),
    type_name: item.type_name,
    douban_id: item.vod_douban_id,
  };
}

export async function getCategoriesFromApi(
  apiSite: ApiSite
): Promise<CmsCategory[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${apiSite.api}?ac=list`, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const classes = data?.class;
    if (!Array.isArray(classes)) {
      return [];
    }

    return classes
      .filter((c: { type_name?: string }) =>
        isShortDramaCategory(c.type_name || '')
      )
      .map(
        (c: {
          type_id: number;
          type_name: string;
          type_pid?: number;
        }) => ({
          type_id: c.type_id,
          type_name: c.type_name,
          type_pid: c.type_pid ?? 0,
          source: apiSite.key,
          source_name: apiSite.name,
        })
      );
  } catch {
    return [];
  }
}

export async function getVideosByCategory(
  apiSite: ApiSite,
  typeId: number,
  page: number
): Promise<{
  list: SearchResult[];
  page: number;
  pagecount: number;
  total: number;
}> {
  const empty = { list: [], page: 1, pagecount: 0, total: 0 };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const url = `${apiSite.api}?ac=videolist&t=${typeId}&pg=${page}`;
    const response = await fetch(url, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return empty;
    }

    const data = await response.json();
    if (!data?.list || !Array.isArray(data.list)) {
      return empty;
    }

    return {
      list: data.list.map((item: CmsApiItem) => mapApiItem(item, apiSite)),
      page: data.page || page,
      pagecount: data.pagecount || 1,
      total: data.total || data.list.length,
    };
  } catch {
    return empty;
  }
}