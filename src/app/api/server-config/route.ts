/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { normalizeEthicsConfig } from '@/lib/ethics.config';
import RuntimeConfig from '@/lib/runtime';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  const shortDramaCategory = config.CustomCategories.find(
    (category) =>
      !category.disabled &&
      category.mode === 'cms' &&
      (category.sources?.length || 0) > 0
  );
  const ethicsConfig = normalizeEthicsConfig(
    (
      RuntimeConfig as unknown as {
        ethics_config?: Parameters<typeof normalizeEthicsConfig>[0];
      }
    ).ethics_config
  );
  const enabledSourceKeys = new Set(
    config.SourceConfig.filter((site) => !site.disabled).map((site) => site.key)
  );
  const shortDramaSources = (shortDramaCategory?.sources || []).filter(
    (source) => enabledSourceKeys.has(source)
  );
  const ethicsSources = ethicsConfig.sources.filter((source) =>
    enabledSourceKeys.has(source)
  );
  const result = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    Categories: {
      ShortDrama: {
        Enabled: shortDramaSources.length > 0,
        Sources: shortDramaSources,
      },
      Ethics: {
        Enabled: ethicsSources.length > 0,
        Sources: ethicsSources,
        PasswordRequired: true,
      },
    },
  };
  return NextResponse.json(result);
}
