/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { Settings } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { CmsCategory } from '@/lib/cms';
import {
  getNsfwEnabled,
  subscribeNsfwChange,
  verifyAndEnableNsfw,
} from '@/lib/nsfw.client';
import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

const DEFAULT_SOURCES = 'mdzy,jisu,zuid,wujin,bfzy';

function EthicsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [nsfwEnabled, setNsfwEnabledState] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [categories, setCategories] = useState<CmsCategory[]>([]);
  const [videos, setVideos] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeSource, setActiveSource] = useState('');
  const [activeTypeId, setActiveTypeId] = useState(0);

  const loadingRef = useRef<HTMLDivElement>(null);

  const sourcesParam =
    (typeof window !== 'undefined' &&
      (window as any).RUNTIME_CONFIG?.ETHICS_SOURCES) ||
    DEFAULT_SOURCES;

  const sourceList = sourcesParam.split(',').map((s: string) => s.trim());
  const sourceCategories = categories.filter((c) => c.source === activeSource);

  useEffect(() => {
    setNsfwEnabledState(getNsfwEnabled());
    return subscribeNsfwChange(setNsfwEnabledState);
  }, []);

  const fetchCategories = useCallback(async () => {
    const res = await fetch(
      `/api/cms/categories?kind=ethics&sources=${encodeURIComponent(sourcesParam)}`
    );
    const data = await res.json();
    return (data.categories || []) as CmsCategory[];
  }, [sourcesParam]);

  const fetchVideos = useCallback(
    async (source: string, typeId: number, page: number) => {
      const res = await fetch(
        `/api/cms/list?source=${encodeURIComponent(source)}&t=${typeId}&pg=${page}`
      );
      return res.json();
    },
    []
  );

  const loadContent = useCallback(
    async (source: string, typeId: number) => {
      setLoading(true);
      setVideos([]);
      setCurrentPage(1);
      setHasMore(true);
      const data = await fetchVideos(source, typeId, 1);
      setVideos(data.list || []);
      setHasMore((data.page || 1) < (data.pagecount || 1));
      setLoading(false);
    },
    [fetchVideos]
  );

  useEffect(() => {
    if (!nsfwEnabled) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        const cats = await fetchCategories();
        setCategories(cats);

        const urlSource = searchParams.get('source');
        const urlTypeId = searchParams.get('t');
        let source = urlSource || '';
        let typeId = urlTypeId ? parseInt(urlTypeId, 10) : 0;

        if (!source || !sourceList.includes(source)) {
          source =
            sourceList.find((s: string) =>
              cats.some((c) => c.source === s)
            ) || sourceList[0];
        }

        const catsForSource = cats.filter((c) => c.source === source);
        if (!typeId || !catsForSource.some((c) => c.type_id === typeId)) {
          typeId = catsForSource[0]?.type_id || 0;
        }

        setActiveSource(source);
        setActiveTypeId(typeId);

        if (source && typeId) {
          await loadContent(source, typeId);
        } else {
          setLoading(false);
        }
      } catch {
        setVideos([]);
        setHasMore(false);
        setLoading(false);
      }
    };

    init();
  }, [nsfwEnabled]);

  const handleSourceChange = async (source: string) => {
    const catsForSource = categories.filter((c) => c.source === source);
    const typeId = catsForSource[0]?.type_id || 0;
    setActiveSource(source);
    setActiveTypeId(typeId);
    router.replace(`/ethics?source=${source}&t=${typeId}`, { scroll: false });
    if (typeId) await loadContent(source, typeId);
  };

  const handleCategoryChange = async (typeId: number) => {
    setActiveTypeId(typeId);
    router.replace(`/ethics?source=${activeSource}&t=${typeId}`, {
      scroll: false,
    });
    await loadContent(activeSource, typeId);
  };

  useEffect(() => {
    if (currentPage <= 1 || !activeSource || !activeTypeId || !nsfwEnabled) {
      return;
    }

    const loadMore = async () => {
      setIsLoadingMore(true);
      try {
        const data = await fetchVideos(activeSource, activeTypeId, currentPage);
        setVideos((prev) => [...prev, ...(data.list || [])]);
        setHasMore((data.page || currentPage) < (data.pagecount || 1));
      } catch {
        setHasMore(false);
      } finally {
        setIsLoadingMore(false);
      }
    };

    loadMore();
  }, [currentPage]);

  useEffect(() => {
    if (!hasMore || isLoadingMore || loading || !loadingRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loading]);

  const uniqueSources = Array.from(
    new Map(categories.map((c) => [c.source, c.source_name])).entries()
  ).map(([key, name]) => ({ key, name }));

  if (!nsfwEnabled) {
    return (
      <PageLayout activePath='/ethics'>
        <div className='px-4 sm:px-10 py-16 max-w-lg mx-auto text-center'>
          <div className='rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-8'>
            <h1 className='text-xl font-bold text-gray-900 dark:text-gray-100 mb-3'>
              伦理片内容已隐藏
            </h1>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed'>
              为保护浏览安全，伦理片 / 里番 / 福利 / 写真热舞 / 擦边短剧 /
              港台三级等内容默认不可见。请输入密码开启 NSFW 后查看。
            </p>
            <input
              type='password'
              className='w-full mb-2 px-3 py-2.5 border border-amber-300 dark:border-amber-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500'
              placeholder='输入密码'
              value={unlockPassword}
              onChange={(e) => {
                setUnlockPassword(e.target.value);
                setUnlockError('');
              }}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && unlockPassword) {
                  setUnlocking(true);
                  const result = await verifyAndEnableNsfw(unlockPassword);
                  setUnlocking(false);
                  if (!result.ok) setUnlockError(result.error || '密码错误');
                  else setUnlockPassword('');
                }
              }}
              disabled={unlocking}
            />
            {unlockError && (
              <p className='text-xs text-red-500 mb-2'>{unlockError}</p>
            )}
            <button
              onClick={async () => {
                if (!unlockPassword) {
                  setUnlockError('请输入密码');
                  return;
                }
                setUnlocking(true);
                setUnlockError('');
                const result = await verifyAndEnableNsfw(unlockPassword);
                setUnlocking(false);
                if (!result.ok) {
                  setUnlockError(result.error || '密码错误');
                  return;
                }
                setUnlockPassword('');
              }}
              disabled={unlocking}
              className='w-full mb-3 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors'
            >
              {unlocking ? '验证中...' : '验证密码并开启'}
            </button>
            <p className='text-xs text-gray-500 dark:text-gray-500 flex items-center justify-center gap-1'>
              <Settings className='w-3.5 h-3.5' />
              也可在用户菜单 → 设置 中开启
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/ethics'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 mb-10'>
        <div className='mb-6'>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100'>
            伦理片
          </h1>
          <p className='mt-1 text-sm text-amber-600 dark:text-amber-400'>
            NSFW 内容已开启 · 仅限成人观看
          </p>
        </div>

        {uniqueSources.length > 1 && (
          <div className='mb-4 overflow-x-auto scrollbar-hide'>
            <div className='inline-flex gap-2 p-1 bg-gray-200/80 dark:bg-gray-700/80 rounded-full'>
              {uniqueSources.map(({ key, name }) => (
                <button
                  key={key}
                  onClick={() => handleSourceChange(key)}
                  className={`px-4 py-1.5 text-sm rounded-full whitespace-nowrap transition-all duration-200 ${
                    activeSource === key
                      ? 'bg-white dark:bg-gray-500 text-gray-900 dark:text-gray-100 shadow-sm font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {sourceCategories.length > 0 && (
          <div className='mb-6 overflow-x-auto scrollbar-hide'>
            <div className='inline-flex gap-2 flex-wrap'>
              {sourceCategories.map((cat) => (
                <button
                  key={`${cat.source}-${cat.type_id}`}
                  onClick={() => handleCategoryChange(cat.type_id)}
                  className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap border transition-all duration-200 ${
                    activeTypeId === cat.type_id
                      ? 'bg-amber-500 text-white border-amber-500 font-medium'
                      : 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400'
                  }`}
                >
                  {cat.type_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className='flex justify-center items-center h-40'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500' />
          </div>
        ) : (
          <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
            {videos.map((item) => (
              <div key={`${item.source}-${item.id}`} className='w-full'>
                <VideoCard
                  id={item.id}
                  title={item.title}
                  poster={item.poster}
                  episodes={item.episodes.length || 1}
                  source={item.source}
                  source_name={item.source_name}
                  year={item.year}
                  from='search'
                  type='tv'
                />
              </div>
            ))}
            {videos.length === 0 && (
              <div className='col-span-full text-center text-gray-500 py-12 dark:text-gray-400'>
                暂无伦理片内容
              </div>
            )}
          </div>
        )}

        {hasMore && !loading && (
          <div
            ref={loadingRef}
            className='flex justify-center items-center h-16 mt-4'
          >
            {isLoadingMore && (
              <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500' />
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function EthicsPage() {
  return (
    <Suspense>
      <EthicsPageClient />
    </Suspense>
  );
}