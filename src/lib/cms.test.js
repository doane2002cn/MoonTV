/* eslint-env jest */
import {
  buildCategoryListUrl,
  expandShortDramaClasses,
  getCategoriesFromApi,
  getVirtualShortDramaTypes,
  isShortDramaCategory,
} from '@/lib/cms';

// 2026-09-26 从上游 ?ac=list 抓取的分类，用于回归短剧分类适配
const JISU_CLASSES = [
  { type_id: 1, type_pid: 0, type_name: '电视剧' },
  { type_id: 2, type_pid: 0, type_name: '电影' },
  { type_id: 3, type_pid: 1, type_name: '欧美剧' },
  { type_id: 4, type_pid: 1, type_name: '香港剧' },
  { type_id: 5, type_pid: 1, type_name: '韩剧' },
  { type_id: 6, type_pid: 1, type_name: '日剧' },
  { type_id: 7, type_pid: 1, type_name: '马泰剧' },
  { type_id: 8, type_pid: 0, type_name: '伦理片' },
  { type_id: 9, type_pid: 2, type_name: '动作片' },
  { type_id: 10, type_pid: 2, type_name: '爱情片' },
  { type_id: 11, type_pid: 2, type_name: '喜剧片' },
  { type_id: 12, type_pid: 2, type_name: '科幻片' },
  { type_id: 13, type_pid: 2, type_name: '恐怖片' },
  { type_id: 14, type_pid: 2, type_name: '剧情片' },
  { type_id: 15, type_pid: 2, type_name: '战争片' },
  { type_id: 16, type_pid: 2, type_name: '纪录片' },
  { type_id: 17, type_pid: 0, type_name: '动漫' },
  { type_id: 20, type_pid: 1, type_name: '内地剧' },
  { type_id: 23, type_pid: 2, type_name: '动画片' },
  { type_id: 24, type_pid: 17, type_name: '中国动漫' },
  { type_id: 25, type_pid: 17, type_name: '日本动漫' },
  { type_id: 26, type_pid: 17, type_name: '欧美动漫' },
  { type_id: 27, type_pid: 0, type_name: '综艺' },
  { type_id: 28, type_pid: 1, type_name: '台湾剧' },
  { type_id: 29, type_pid: 0, type_name: '体育赛事' },
  { type_id: 30, type_pid: 27, type_name: '大陆综艺' },
  { type_id: 31, type_pid: 27, type_name: '日韩综艺' },
  { type_id: 32, type_pid: 27, type_name: '港台综艺' },
  { type_id: 33, type_pid: 27, type_name: '欧美综艺' },
  { type_id: 34, type_pid: 2, type_name: '灾难片' },
  { type_id: 35, type_pid: 2, type_name: '悬疑片' },
  { type_id: 36, type_pid: 2, type_name: '犯罪片' },
  { type_id: 37, type_pid: 2, type_name: '奇幻片' },
  { type_id: 38, type_pid: 0, type_name: '短剧' },
  { type_id: 39, type_pid: 0, type_name: '预告片' },
  { type_id: 40, type_pid: 29, type_name: '足球' },
  { type_id: 41, type_pid: 29, type_name: '篮球' },
  { type_id: 42, type_pid: 29, type_name: '台球' },
  { type_id: 43, type_pid: 29, type_name: '其他赛事' },
  { type_id: 45, type_pid: 38, type_name: '古装仙侠' },
  { type_id: 46, type_pid: 38, type_name: '现代都市' },
  { type_id: 47, type_pid: 38, type_name: '穿越年代' },
  { type_id: 48, type_pid: 38, type_name: '言情总裁' },
  { type_id: 49, type_pid: 38, type_name: '重生民国' },
  { type_id: 50, type_pid: 38, type_name: '反转爽剧' },
  { type_id: 52, type_pid: 38, type_name: '脑洞悬疑' },
  { type_id: 53, type_pid: 38, type_name: '擦边短剧' },
  { type_id: 54, type_pid: 38, type_name: 'AI漫剧' },
];

const MDZY_CLASSES = [
  { type_id: 1, type_pid: 0, type_name: '国产动漫' },
  { type_id: 6, type_pid: 0, type_name: '里番动漫' },
  { type_id: 7, type_pid: 0, type_name: '电影' },
  { type_id: 8, type_pid: 0, type_name: '连续剧' },
  { type_id: 25, type_pid: 7, type_name: '短片' },
  { type_id: 26, type_pid: 8, type_name: '国产剧' },
  { type_id: 38, type_pid: 8, type_name: '短剧' },
  { type_id: 39, type_pid: 7, type_name: '伦理片' },
  { type_id: 40, type_pid: 0, type_name: '体育' },
  { type_id: 41, type_pid: 40, type_name: '足球' },
  { type_id: 42, type_pid: 0, type_name: 'AI漫剧' },
];

const namesOf = (classes) =>
  expandShortDramaClasses(classes).map((c) => c.type_name);

const DBZY_CLASSES = [
  { type_id: 1, type_pid: 0, type_name: '电影' },
  { type_id: 2, type_pid: 0, type_name: '连续剧' },
  { type_id: 3, type_pid: 0, type_name: '综艺片' },
  { type_id: 4, type_pid: 0, type_name: '动漫' },
  { type_id: 5, type_pid: 1, type_name: '纪录片' },
  { type_id: 6, type_pid: 1, type_name: '动作片' },
  { type_id: 7, type_pid: 1, type_name: '爱情片' },
  { type_id: 8, type_pid: 1, type_name: '喜剧片' },
  { type_id: 13, type_pid: 2, type_name: '国产剧' },
  { type_id: 14, type_pid: 2, type_name: '香港剧' },
  { type_id: 20, type_pid: 1, type_name: '动漫电影' },
  { type_id: 25, type_pid: 3, type_name: '大陆综艺' },
  { type_id: 30, type_pid: 4, type_name: '国产动漫' },
  { type_id: 31, type_pid: 4, type_name: '日本动漫' },
  { type_id: 34, type_pid: 0, type_name: '伦理片' },
  { type_id: 36, type_pid: 0, type_name: '体育赛事' },
  { type_id: 37, type_pid: 0, type_name: '短剧大全' },
  { type_id: 38, type_pid: 36, type_name: '篮球' },
  { type_id: 43, type_pid: 37, type_name: '重生民国' },
  { type_id: 44, type_pid: 37, type_name: '穿越现代' },
  { type_id: 45, type_pid: 37, type_name: '反转爽剧' },
  { type_id: 46, type_pid: 37, type_name: '言情总裁' },
  { type_id: 47, type_pid: 37, type_name: '现代都市' },
  { type_id: 48, type_pid: 37, type_name: '古装仙侠' },
  { type_id: 49, type_pid: 37, type_name: '悬疑烧脑' },
  { type_id: 53, type_pid: 37, type_name: 'AI短剧' },
  { type_id: 54, type_pid: 37, type_name: '擦边短剧' },
  { type_id: 55, type_pid: 4, type_name: 'AI动漫' },
];

describe('短剧分类适配', () => {
  it('展开极速资源的短剧子分类，并去掉无内容的父分类', () => {
    expect(namesOf(JISU_CLASSES)).toEqual([
      '古装仙侠',
      '现代都市',
      '穿越年代',
      '言情总裁',
      '重生民国',
      '反转爽剧',
      '脑洞悬疑',
      'AI漫剧',
    ]);
  });

  it('保留魔都资源自身的短剧与 AI 漫剧分类', () => {
    expect(namesOf(MDZY_CLASSES)).toEqual(['短剧', 'AI漫剧']);
  });

  it('展开豆瓣资源的短剧子分类，并丢掉空父分类', () => {
    expect(namesOf(DBZY_CLASSES)).toEqual([
      '重生民国',
      '穿越现代',
      '反转爽剧',
      '言情总裁',
      '现代都市',
      '古装仙侠',
      '悬疑烧脑',
      'AI短剧',
    ]);
  });

  it('排除擦边短剧、短片，其它短剧关键词命中', () => {
    expect(isShortDramaCategory('擦边短剧')).toBe(false);
    expect(isShortDramaCategory('短片')).toBe(false);
    expect(isShortDramaCategory('AI漫剧')).toBe(true);
    expect(isShortDramaCategory('反转爽剧')).toBe(false);
    expect(isShortDramaCategory('短剧')).toBe(true);
  });

  it('给魔都资源生成关键词类型，且 id 远离上游分类 id', () => {
    const types = getVirtualShortDramaTypes('mdzy');
    expect(types.map((t) => t.name)).toEqual([
      '重生',
      '离婚',
      '穿越',
      '闪婚',
      '萌宝',
      '系统',
      '千金',
      '总裁',
    ]);
    expect(types.every((t) => t.baseType === 38)).toBe(true);
    expect(new Set(types.map((t) => t.id)).size).toBe(types.length);
    expect(Math.min(...types.map((t) => t.id))).toBeGreaterThanOrEqual(100000);
    expect(getVirtualShortDramaTypes('jisu')).toEqual([]);
  });

  it('关键词类型转成分类+关键词查询，普通分类保持原样', () => {
    const mdzy = {
      key: 'mdzy',
      name: '魔都资源',
      api: 'https://api.example.com/api.php/provide/vod',
    };
    const [first] = getVirtualShortDramaTypes('mdzy');
    expect(buildCategoryListUrl(mdzy, first.id, 3)).toBe(
      'https://api.example.com/api.php/provide/vod?ac=videolist&t=38&wd=%E9%87%8D%E7%94%9F&pg=3'
    );
    expect(buildCategoryListUrl(mdzy, 45, 1)).toBe(
      'https://api.example.com/api.php/provide/vod?ac=videolist&t=45&pg=1'
    );
  });

  it('上游首次 502 时重试，并把关键词类型插到短剧分类之后', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return { ok: false, status: 502 };
      }
      return {
        ok: true,
        json: async () => ({
          class: [{ type_id: 38, type_pid: 8, type_name: '短剧' }],
        }),
      };
    });

    try {
      const categories = await getCategoriesFromApi({
        key: 'mdzy',
        name: '魔都资源',
        api: 'https://api.example.com/api.php/provide/vod',
      });
      expect(calls).toEqual([
        'https://api.example.com/api.php/provide/vod?ac=list',
        'https://api.example.com/api.php/provide/vod?ac=list',
      ]);
      expect(categories.map((c) => c.type_name)).toEqual([
        '短剧',
        '重生',
        '离婚',
        '穿越',
        '闪婚',
        '萌宝',
        '系统',
        '千金',
        '总裁',
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
