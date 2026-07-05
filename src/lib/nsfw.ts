import { SearchResult } from '@/lib/types';

/** 上游 CMS 分类名关键词（仅匹配 type_name，不匹配标题） */
export const NSFW_CATEGORY_KEYWORDS = [
  '伦理片',
  '里番动漫',
  '里番',
  '福利片',
  '福利视频',
  '写真热舞',
  '擦边短剧',
  '港台三级',
  '韩国伦理',
  '西方伦理',
  '日本伦理',
  '伦理',
  '福利',
  '写真',
  '擦边',
  '三级',
  '无码',
  '有码',
  '日本无码',
  '日本有码',
  '色情片',
  '同性片',
  '国产传媒',
  '制服诱惑',
  '门事件',
  '萝莉少女',
  'SWAG',
  '网红主播',
  'cosplay',
  '黑丝诱惑',
];

const NSFW_EXACT_TYPE_NAMES = new Set([
  '伦理',
  '福利',
  '写真',
  '三级',
  '擦边',
  '伦理片',
  '里番动漫',
  '福利片',
  '福利视频',
  '写真热舞',
  '擦边短剧',
  '港台三级',
]);

export function isNsfwCategory(typeName: string): boolean {
  const name = (typeName || '').trim();
  if (!name) return false;
  if (NSFW_EXACT_TYPE_NAMES.has(name)) return true;
  return NSFW_CATEGORY_KEYWORDS.some(
    (kw) => kw.length > 2 && name.includes(kw)
  );
}

export function isNsfwItem(item: Pick<SearchResult, 'type_name'>): boolean {
  return isNsfwCategory(item.type_name || '');
}

export function partitionSearchResults(results: SearchResult[]): {
  safe: SearchResult[];
  ethics: SearchResult[];
} {
  const safe: SearchResult[] = [];
  const ethics: SearchResult[] = [];
  results.forEach((item) => {
    if (isNsfwItem(item)) {
      ethics.push(item);
    } else {
      safe.push(item);
    }
  });
  return { safe, ethics };
}