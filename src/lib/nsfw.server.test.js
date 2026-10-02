/* eslint-env jest */
import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';

import {
  createNsfwToken,
  getNsfwSessionKey,
  isNsfwUnlocked,
} from '@/lib/nsfw.server';

// jsdom 环境没有 TextEncoder / crypto，补齐后再测服务端签名
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}
if (typeof global.crypto === 'undefined') {
  global.crypto = webcrypto;
}

const authCookie = (data) => encodeURIComponent(JSON.stringify(data));

describe('NSFW 解锁状态', () => {
  beforeAll(() => {
    process.env.PASSWORD = 'site-password';
    process.env.NSFW_PASSWORD = 'nsfw-password';
  });

  it('按账号解析会话标识，localStorage 模式回落到固定标识', () => {
    expect(getNsfwSessionKey(authCookie({ username: 'alice' }))).toBe('alice');
    expect(getNsfwSessionKey(authCookie({ password: 'site-password' }))).toBe(
      'local'
    );
    expect(getNsfwSessionKey('not-json')).toBeNull();
    expect(getNsfwSessionKey(undefined)).toBeNull();
  });

  it('没有解锁 Cookie 时判定为未解锁', async () => {
    const auth = authCookie({ username: 'alice' });
    expect(await isNsfwUnlocked({ auth })).toBe(false);
    expect(await isNsfwUnlocked({ auth, nsfw: 'forged-token' })).toBe(false);
  });

  it('本人解锁后放行，换个账号登录仍为未解锁', async () => {
    const alice = authCookie({ username: 'alice' });
    const bob = authCookie({ username: 'bob' });
    const aliceToken = await createNsfwToken('alice');

    expect(await isNsfwUnlocked({ auth: alice, nsfw: aliceToken })).toBe(true);
    // 关键：同一个浏览器里 alice 解锁过，bob 登录后不能继承
    expect(await isNsfwUnlocked({ auth: bob, nsfw: aliceToken })).toBe(false);
  });

  it('未登录或未配置密码时不放行', async () => {
    const auth = authCookie({ username: 'alice' });
    const token = await createNsfwToken('alice');

    expect(await isNsfwUnlocked({ nsfw: token })).toBe(false);

    const backup = process.env.PASSWORD;
    delete process.env.PASSWORD;
    delete process.env.NSFW_PASSWORD;
    expect(await isNsfwUnlocked({ auth, nsfw: token })).toBe(false);
    process.env.PASSWORD = backup;
  });
});
