import { NextRequest, NextResponse } from 'next/server';

import { isNsfwUnlockedFromRequest } from '@/lib/nsfw.server';

export const runtime = 'edge';

// 前端启动时查询当前账号的解锁状态（不做动态渲染，避免 Pages 构建失败）
export async function GET(request: NextRequest) {
  const unlocked = await isNsfwUnlockedFromRequest(request);
  return NextResponse.json(
    { unlocked },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
