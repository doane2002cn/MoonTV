import { isNsfwCategory } from '@/lib/nsfw';

export interface EthicsConfig {
  sources: string[];
  categories: string[];
  allow_all: boolean;
}

export const DEFAULT_ETHICS_CONFIG: EthicsConfig = {
  sources: ['zuid', 'wujin'],
  categories: ['擦边短剧'],
  allow_all: false,
};

export function normalizeEthicsConfig(
  raw?: Partial<EthicsConfig> | null
): EthicsConfig {
  if (!raw) return DEFAULT_ETHICS_CONFIG;
  return {
    sources:
      raw.sources && raw.sources.length > 0
        ? raw.sources
        : DEFAULT_ETHICS_CONFIG.sources,
    categories:
      raw.categories && raw.categories.length > 0
        ? raw.categories
        : DEFAULT_ETHICS_CONFIG.categories,
    allow_all: raw.allow_all ?? false,
  };
}

export function createEthicsCategoryMatcher(
  config: EthicsConfig
): (typeName: string) => boolean {
  const normalized = normalizeEthicsConfig(config);
  if (normalized.allow_all) {
    return (typeName: string) => isNsfwCategory(typeName);
  }
  return (typeName: string) => {
    const name = (typeName || '').trim();
    if (!name) return false;
    return normalized.categories.some(
      (pattern) => name === pattern || name.includes(pattern)
    );
  };
}

export function getEthicsSourcesString(config: EthicsConfig): string {
  return normalizeEthicsConfig(config).sources.join(',');
}