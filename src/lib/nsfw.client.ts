export const NSFW_CHANGED_EVENT = 'nsfwSettingChanged';

// 解锁状态以服务端按账号签发的 Cookie 为准，这里只缓存本次会话的判定结果
let cachedEnabled = false;
let stateRequest: Promise<boolean> | null = null;

export function getNsfwEnabled(): boolean {
  return cachedEnabled;
}

export function setNsfwEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  cachedEnabled = enabled;
  window.dispatchEvent(
    new CustomEvent(NSFW_CHANGED_EVENT, { detail: enabled })
  );
}

// 页面加载后向服务端确认当前账号是否已解锁
export async function loadNsfwState(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (stateRequest) return stateRequest;

  stateRequest = (async () => {
    try {
      const res = await fetch('/api/nsfw/state', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const unlocked = data?.unlocked === true;
        setNsfwEnabled(unlocked);
        return unlocked;
      }
    } catch {
      // 网络异常时按未解锁处理
    }
    setNsfwEnabled(false);
    return false;
  })();

  return stateRequest;
}

export async function verifyAndEnableNsfw(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/nsfw/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || '密码错误' };
    }
    setNsfwEnabled(true);
    return { ok: true };
  } catch {
    return { ok: false, error: '网络错误，请稍后重试' };
  }
}

// 关闭开关需要清掉服务端 Cookie，否则刷新后会再次变成已解锁
export async function disableNsfw(): Promise<void> {
  try {
    await fetch('/api/nsfw/verify', { method: 'DELETE' });
  } catch {
    // 请求失败也要先隐藏本会话的内容
  }
  setNsfwEnabled(false);
}

export function subscribeNsfwChange(
  handler: (enabled: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const listener = (e: Event) => {
    const detail = (e as CustomEvent<boolean>).detail;
    handler(typeof detail === 'boolean' ? detail : getNsfwEnabled());
  };

  window.addEventListener(NSFW_CHANGED_EVENT, listener);
  return () => window.removeEventListener(NSFW_CHANGED_EVENT, listener);
}
