const AUTH_ENDPOINT = '/.netlify/functions/auth';

export async function authenticateWithKey(key) {
  const response = await fetch(AUTH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ key }),
  });

  let payload = null;
  try { payload = await response.json(); } catch {}

  if (!response.ok || !payload?.ok) {
    const error = payload?.error || `AUTH_${response.status}`;
    return { ok: false, error };
  }

  return {
    ok: true,
    expiresIn: payload.expiresIn || null,
  };
}

export async function promptForAccessKey() {
  const key = window.prompt('TAKY Mobile 인증키를 입력하세요. 이 기기에서는 인증 후 세션이 유지됩니다.');
  if (key === null) return { ok: false, cancelled: true, error: 'AUTH_CANCELLED' };
  if (!key.trim()) return { ok: false, error: 'EMPTY_ACCESS_KEY' };
  return authenticateWithKey(key.trim());
}
