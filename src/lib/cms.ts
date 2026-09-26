import { API_CONFIG, ApiSite } from '@/lib/config';
import {
  createEthicsCategoryMatcher,
  EthicsConfig,
  normalizeEthicsConfig,
} from '@/lib/ethics.config';
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

const SHORT_DRAMA_KEYWORDS = ['短剧', '爽文', '漫剧'];
const SHORT_DRAMA_EXCLUDE_KEYWORDS = ['短片', '擦边'];

function isExcludedShortDramaCategory(typeName: string): boolean {
  return SHORT_DRAMA_EXCLUDE_KEYWORDS.some((kw) => typeName.includes(kw));
}

export function isShortDramaCategory(typeName: string): boolean {
  const name = (typeName || '').trim();
  if (!name || isExcludedShortDramaCategory(name)) {
    return false;
  }
  return SHORT_DRAMA_KEYWORDS.some((kw) => name.includes(kw));
}

interface CmsApiClass {
  type_id: number;
  type_name: string;
  type_pid?: number;
}

/**
 * 上游常把“短剧”做成父分类（如极速资源 type_id=38），剧集只挂在子分类上，
 * 父分类本身没有内容。这里把命中分类的子分类一并纳入，并去掉已有子分类的
 * 父级，避免页面默认落到空分类。
 */
export function expandShortDramaClasses(classes: CmsApiClass[]): CmsApiClass[] {
  const byId = new Map(classes.map((c) => [c.type_id, c]));
  const included = new Set<number>();

  classes.forEach((c) => {
    if (isShortDramaCategory(c.type_name)) {
      included.add(c.type_id);
    }
  });

  let changed = true;
  while (changed) {
    changed = false;
    classes.forEach((c) => {
      const pid = c.type_pid ?? 0;
      if (pid === 0 || !included.has(pid) || included.has(c.type_id)) {
        return;
      }
      if (isExcludedShortDramaCategory(c.type_name)) {
        return;
      }
      included.add(c.type_id);
      changed = true;
    });
  }

  const hasIncludedChild = new Set<number>();
  included.forEach((id) => {
    const visited = new Set<number>([id]);
    let pid = byId.get(id)?.type_pid ?? 0;
    while (pid !== 0 && !visited.has(pid)) {
      visited.add(pid);
      if (included.has(pid)) {
        hasIncludedChild.add(pid);
      }
      pid = byId.get(pid)?.type_pid ?? 0;
    }
  });

  return classes.filter(
    (c) => included.has(c.type_id) && !hasIncludedChild.has(c.type_id)
  );
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
    year: item.vod_year ? item.vod_year.match(/\d{4}/)?.[0] || '' : 'unknown',
    desc: cleanHtmlTags(item.vod_content || ''),
    type_name: item.type_name,
    douban_id: item.vod_douban_id,
  };
}

export async function getEthicsCategoriesFromApi(
  apiSite: ApiSite,
  ethicsConfig?: Partial<EthicsConfig>
): Promise<CmsCategory[]> {
  const matcher = createEthicsCategoryMatcher(
    normalizeEthicsConfig(ethicsConfig)
  );
  const classes = await fetchCmsClasses(apiSite);
  return classes
    .filter((c) => matcher(c.type_name || ''))
    .map((c) => toCmsCategory(c, apiSite));
}

async function fetchCmsClasses(apiSite: ApiSite): Promise<CmsApiClass[]> {
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
    return Array.isArray(data?.class) ? (data.class as CmsApiClass[]) : [];
  } catch {
    return [];
  }
}

function toCmsCategory(apiClass: CmsApiClass, apiSite: ApiSite): CmsCategory {
  return {
    type_id: apiClass.type_id,
    type_name: apiClass.type_name,
    type_pid: apiClass.type_pid ?? 0,
    source: apiSite.key,
    source_name: apiSite.name,
  };
}

export async function getCategoriesFromApi(
  apiSite: ApiSite
): Promise<CmsCategory[]> {
  const classes = await fetchCmsClasses(apiSite);
  return expandShortDramaClasses(classes).map((c) => toCmsCategory(c, apiSite));
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
