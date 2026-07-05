/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { CmsCategory } from '@/lib/cms';
import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

const DEFAULT_SOURCES = 'mdzy,jisu';

function ShortDramaPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<CmsCategory[]>([]);
  const [videos, setVideos] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [activeSource, setActiveSource] = useState('');
  const [activeTypeId, setActiveTypeId] = useState(0);

  const loadingRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sourcesParam =
    (typeof window !== 'undefined' &&
      (window as any).RUNTIME_CONFIG?.SHORT_DRAMA_SOURCES) ||
    DEFAULT_SOURCES;

  const sourceList = sourcesParam.split(',').map((s: string) => s.trim());

  const sourceCategories = categories.filter(
    (c) => c.source === activeSource
  );

  const fetchCategories = useCallback(async () => {
    const res = await fetch(
      `/api/cms/categories?sources=${encodeURIComponent(sourcesParam)}`
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

  // 初始化：加载分类并设置默认选中
  useEffect(() => {
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
          const data = await fetchVideos(source, typeId, 1);
          setVideos(data.list || []);
          setCurrentPage(1);
          setHasMore((data.page || 1) < (data.pagecount || 1));
        }
      } catch {
        setVideos([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // 切换源或分类时重新加载
  const handleSourceChange = useCallback(
    async (source: string) => {
      const catsForSource = categories.filter((c) => c.source === source);
      const typeId = catsForSource[0]?.type_id || 0;
      setActiveSource(source);
      setActiveTypeId(typeId);
      setLoading(true);
      setVideos([]);
      setCurrentPage(1);
      setHasMore(true);

      router.replace(
        `/short-drama?source=${source}&t=${typeId}`,
        { scroll: false }
      );

      if (typeId) {
        const data = await fetchVideos(source, typeId, 1);
        setVideos(data.list || []);
        setHasMore((data.page || 1) < (data.pagecount || 1));
      }
      setLoading(false);
    },
    [categories, fetchVideos, router]
  );

  const handleCategoryChange = useCallback(
    async (typeId: number) => {
      setActiveTypeId(typeId);
      setLoading(true);
      setVideos([]);
      setCurrentPage(1);
      setHasMore(true);

      router.replace(
        `/short-drama?source=${activeSource}&t=${typeId}`,
        { scroll: false }
      );

      const data = await fetchVideos(activeSource, typeId, 1);
      setVideos(data.list || []);
      setHasMore((data.page || 1) < (data.pagecount || 1));
      setLoading(false);
    },
    [activeSource, fetchVideos, router]
  );

  // 加载更多
  useEffect(() => {
    if (currentPage <= 1 || !activeSource || !activeTypeId) return;

    const loadMore = async () => {
      setIsLoadingMore(true);
      try {
        const data = await fetchVideos(
          activeSource,
          activeTypeId,
          currentPage
        );
        const newList = data.list || [];
        setVideos((prev) => [...prev, ...newList]);
        setHasMore((data.page || currentPage) < (data.pagecount || 1));
      } catch {
        setHasMore(false);
      } finally {
        setIsLoadingMore(false);
      }
    };

    loadMore();
  }, [currentPage]);

  // 无限滚动
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
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loading]);

  const activeSourceName =
    categories.find((c) => c.source === activeSource)?.source_name ||
    activeSource;

  const uniqueSources = Array.from(
    new Map(
      categories.map((c) => [c.source, c.source_name])
    ).entries()
  ).map(([key, name]) => ({ key, name }));

  return (
    <PageLayout activePath='/short-drama'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 mb-10'>
        {/* 页头 */}
        <div className='mb-6'>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100'>
            短剧
          </h1>
          <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
            按上游资源站分类浏览，数据来自采集源
          </p>
        </div>

        {/* 资源站切换 */}
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

        {/* 分类标签 */}
        {sourceCategories.length > 0 && (
          <div className='mb-6 overflow-x-auto scrollbar-hide'>
            <div className='inline-flex gap-2'>
              {sourceCategories.map((cat) => (
                <button
                  key={`${cat.source}-${cat.type_id}`}
                  onClick={() => handleCategoryChange(cat.type_id)}
                  className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap border transition-all duration-200 ${
                    activeTypeId === cat.type_id
                      ? 'bg-green-500 text-white border-green-500 font-medium'
                      : 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-green-400 hover:text-green-600 dark:hover:text-green-400'
                  }`}
                >
                  {cat.type_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 当前状态 */}
        {!loading && activeSourceName && (
          <p className='mb-4 text-xs text-gray-400 dark:text-gray-500'>
            {activeSourceName}
            {sourceCategories.find((c) => c.type_id === activeTypeId)
              ? ` · ${sourceCategories.find((c) => c.type_id === activeTypeId)?.type_name}`
              : ''}
          </p>
        )}

        {/* 片单网格 */}
        {loading ? (
          <div className='flex justify-center items-center h-40'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500' />
          </div>
        ) : (
          <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
            {videos.map((item) => (
              <div
                key={`${item.source}-${item.id}`}
                className='w-full'
              >
                <VideoCard
                  id={item.id}
                  title={item.title}
                  poster={item.poster}
                  episodes={item.episodes.length || 1}
                  source={item.source}
                  source_name={item.source_name}
                  douban_id={item.douban_id?.toString()}
                  year={item.year}
                  from='search'
                  type='tv'
                />
              </div>
            ))}
            {videos.length === 0 && (
              <div className='col-span-full text-center text-gray-500 py-12 dark:text-gray-400'>
                暂无短剧内容
              </div>
            )}
          </div>
        )}

        {/* 加载更多触发器 */}
        {hasMore && !loading && (
          <div
            ref={loadingRef}
            className='flex justify-center items-center h-16 mt-4'
          >
            {isLoadingMore && (
              <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500' />
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function ShortDramaPage() {
  return (
    <Suspense>
      <ShortDramaPageClient />
    </Suspense>
  );
}