import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '请求无效' }, { status: 400 });
  }
}