import { NextRequest, NextResponse } from 'next/server';

import {
  createNsfwToken,
  getNsfwSessionKey,
  NSFW_COOKIE_MAX_AGE,
  NSFW_COOKIE_NAME,
  nsfwCookieOptions,
} from '@/lib/nsfw.server';

export const runtime = 'edge';

// 校验 NSFW 密码，成功后为当前账号签发解锁 Cookie
export async function POST(request: NextRequest) {
  const sitePassword = process.env.PASSWORD;
  if (!sitePassword) {
    return NextResponse.json({ error: '站点未配置密码' }, { status: 503 });
  }

  try {
    const { password } = await request.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    const nsfwPassword = process.env.NSFW_PASSWORD || sitePassword;
    if (password !== nsfwPassword) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }

    const sessionKey = getNsfwSessionKey(request.cookies.get('auth')?.value);
    if (!sessionKey) {
      return NextResponse.json(
        { error: '登录状态无效，请重新登录' },
        { status: 401 }
      );
    }

    const token = await createNsfwToken(sessionKey);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      NSFW_COOKIE_NAME,
      token,
      nsfwCookieOptions(NSFW_COOKIE_MAX_AGE)
    );
    return response;
  } catch {
    return NextResponse.json({ error: '请求无效' }, { status: 400 });
  }
}

// 关闭开关时清掉解锁 Cookie
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(NSFW_COOKIE_NAME, '', nsfwCookieOptions(0));
  return response;
}
