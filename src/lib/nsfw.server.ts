import { NextRequest } from 'next/server';

export const NSFW_COOKIE_NAME = 'nsfw';
export const NSFW_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// NSFW 解锁密钥：优先使用独立密码，未配置时回落到站点密码
function getNsfwSecret(): string {
  return process.env.NSFW_PASSWORD || process.env.PASSWORD || '';
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseAuthCookie(
  value?: string
): { username?: string; password?: string } | null {
  if (!value) return null;
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
}

// 会话标识：DB 存储模式取用户名，localStorage 模式只有站点密码
export function getNsfwSessionKey(authCookieValue?: string): string | null {
  const auth = parseAuthCookie(authCookieValue);
  if (!auth) return null;
  if (auth.username) return auth.username;
  if (auth.password) return 'local';
  return null;
}

// 令牌与账号绑定，换个账号登录就自动回到未解锁状态
export async function createNsfwToken(sessionKey: string): Promise<string> {
  const secret = getNsfwSecret();
  if (!secret || !sessionKey) return '';
  return hmacHex(secret, `nsfw:${sessionKey}`);
}

export async function isNsfwUnlocked(cookies: {
  auth?: string;
  nsfw?: string;
}): Promise<boolean> {
  const sessionKey = getNsfwSessionKey(cookies.auth);
  if (!sessionKey || !cookies.nsfw) return false;
  const expected = await createNsfwToken(sessionKey);
  return expected !== '' && expected === cookies.nsfw;
}

export function readNsfwCookies(request: NextRequest): {
  auth?: string;
  nsfw?: string;
} {
  return {
    auth: request.cookies.get('auth')?.value,
    nsfw: request.cookies.get(NSFW_COOKIE_NAME)?.value,
  };
}

export async function isNsfwUnlockedFromRequest(
  request: NextRequest
): Promise<boolean> {
  return isNsfwUnlocked(readNsfwCookies(request));
}

export function nsfwCookieOptions(maxAge: number) {
  return {
    path: '/',
    maxAge,
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: false,
  };
}
