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

// 虚拟分类的 type_id 起始值，避开上游真实分类 id
const VIRTUAL_TYPE_OFFSET = 900000;

interface VirtualShortDramaType {
  id: number;
  name: string;
  keyword: string;
  baseType: number;
}

// 部分上游（如魔都资源）只提供扁平短剧分类，这里用「上游分类 + 标题关键词」
// 组合出类型标签，关键词条数为 2026-09-26 实测值
const VIRTUAL_SHORT_DRAMA_TYPES: Record<
  string,
  Omit<VirtualShortDramaType, 'id'>[]
> = {
  mdzy: [
    { name: '重生', keyword: '重生', baseType: 38 },
    { name: '离婚', keyword: '离婚', baseType: 38 },
    { name: '穿越', keyword: '穿越', baseType: 38 },
    { name: '闪婚', keyword: '闪婚', baseType: 38 },
    { name: '萌宝', keyword: '萌宝', baseType: 38 },
    { name: '系统', keyword: '系统', baseType: 38 },
    { name: '千金', keyword: '千金', baseType: 38 },
    { name: '总裁', keyword: '总裁', baseType: 38 },
  ],
};

export function getVirtualShortDramaTypes(
  sourceKey: string
): VirtualShortDramaType[] {
  return (VIRTUAL_SHORT_DRAMA_TYPES[sourceKey] || []).map((item, index) => ({
    ...item,
    id: VIRTUAL_TYPE_OFFSET + index,
  }));
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
  const data = await fetchUpstreamJson(`${apiSite.api}?ac=list`, 8000);
  if (!data || !Array.isArray(data.class)) {
    return [];
  }
  return data.class;
}

interface CmsApiResponse {
  class?: CmsApiClass[];
  list?: CmsApiItem[];
  page?: number;
  pagecount?: number;
  total?: number;
}

const UPSTREAM_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 上游会偶发 502（实测豆瓣资源约五成失败率），重试能显著提高成功率
async function fetchUpstreamJson(
  url: string,
  timeoutMs: number
): Promise<CmsApiResponse | null> {
  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: API_CONFIG.search.headers,
        signal: controller.signal,
      });
      if (response.ok) {
        return (await response.json()) as CmsApiResponse;
      }
    } catch {
      // 超时或网络异常，继续重试
    } finally {
      clearTimeout(timeoutId);
    }
    if (attempt < UPSTREAM_ATTEMPTS) {
      await sleep(400 * attempt);
    }
  }
  return null;
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
  const categories = expandShortDramaClasses(classes).map((c) =>
    toCmsCategory(c, apiSite)
  );

  const virtualTypes = getVirtualShortDramaTypes(apiSite.key);
  if (virtualTypes.length === 0) {
    return categories;
  }

  // 虚拟类型紧跟它所属的上游分类，其余分类保持原顺序
  const baseType = virtualTypes[0].baseType;
  const baseIndex = categories.findIndex((c) => c.type_id === baseType);
  const virtualCategories: CmsCategory[] = virtualTypes.map((item) => ({
    type_id: item.id,
    type_name: item.name,
    type_pid: baseType,
    source: apiSite.key,
    source_name: apiSite.name,
  }));

  if (baseIndex < 0) {
    return [...categories, ...virtualCategories];
  }
  return [
    ...categories.slice(0, baseIndex + 1),
    ...virtualCategories,
    ...categories.slice(baseIndex + 1),
  ];
}

export function buildCategoryListUrl(
  apiSite: ApiSite,
  typeId: number,
  page: number
): string {
  const virtual = getVirtualShortDramaTypes(apiSite.key).find(
    (item) => item.id === typeId
  );
  if (virtual) {
    const keyword = encodeURIComponent(virtual.keyword);
    return `${apiSite.api}?ac=videolist&t=${virtual.baseType}&wd=${keyword}&pg=${page}`;
  }
  return `${apiSite.api}?ac=videolist&t=${typeId}&pg=${page}`;
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
    const data = await fetchUpstreamJson(
      buildCategoryListUrl(apiSite, typeId, page),
      10000
    );
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
