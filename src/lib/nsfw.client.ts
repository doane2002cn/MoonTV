export const NSFW_ENABLED_KEY = 'enableNsfw';
export const NSFW_CHANGED_EVENT = 'nsfwSettingChanged';

export function getNsfwEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem(NSFW_ENABLED_KEY);
  if (saved === null) return false;
  try {
    return JSON.parse(saved) as boolean;
  } catch {
    return saved === 'true';
  }
}

export function setNsfwEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NSFW_ENABLED_KEY, JSON.stringify(enabled));
  window.dispatchEvent(
    new CustomEvent(NSFW_CHANGED_EVENT, { detail: enabled })
  );
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