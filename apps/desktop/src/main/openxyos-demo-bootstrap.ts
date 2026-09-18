/**
 * Ensure OpenXYOS demo login accounts exist after Studio restarts the stack.
 * Seed only creates demo@demo.com when the users table is empty; migrate only
 * fills user@demo.com. When a DB already has stray users, register via HTTP.
 */

export const OPENXYOS_DEMO_EMAIL = 'demo@demo.com';
export const OPENXYOS_DEMO_USER_EMAIL = 'user@demo.com';
export const OPENXYOS_DEMO_PASSWORD = 'openxyos-demo-2026';
/** Same length requirement as OpenXYOS seed (≥12). */
export const OPENXYOS_ADMIN_PASSWORD = 'openxyos-demo-2026';

export type DemoBootstrapResult = {
  ok: boolean;
  loginOk: boolean;
  registered: string[];
  details: string[];
};

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function readAccessToken(json: Record<string, unknown> | null): string | null {
  const data = json?.data;
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const tokens = rec.tokens;
  if (tokens && typeof tokens === 'object') {
    const access = (tokens as Record<string, unknown>).accessToken;
    if (typeof access === 'string' && access.trim()) return access.trim();
  }
  if (typeof rec.token === 'string' && rec.token.trim()) return rec.token.trim();
  return null;
}

export async function loginOpenXyosDemoAccessToken(
  baseUrl: string,
  email = OPENXYOS_DEMO_EMAIL,
  password = OPENXYOS_DEMO_PASSWORD,
): Promise<string | null> {
  const base = baseUrl.replace(/\/+$/, '');
  try {
    const { status, json } = await postJson(`${base}/api/auth/login`, {
      email,
      password,
    });
    if (status < 200 || status >= 300 || json?.success !== true) return null;
    return readAccessToken(json);
  } catch {
    return null;
  }
}

export async function tryDemoLogin(
  baseUrl: string,
  email = OPENXYOS_DEMO_EMAIL,
  password = OPENXYOS_DEMO_PASSWORD,
): Promise<boolean> {
  const base = baseUrl.replace(/\/+$/, '');
  try {
    const { status, json } = await postJson(`${base}/api/auth/login`, {
      email,
      password,
    });
    return status >= 200 && status < 300 && json?.success === true;
  } catch {
    return false;
  }
}

/**
 * Try login; if it fails, register missing demo accounts then retry login.
 * Safe to call repeatedly (409 / already-registered is ignored).
 */
export async function ensureOpenXyosDemoUsers(
  baseUrl: string,
  opts: { password?: string; fetchImpl?: typeof fetch } = {},
): Promise<DemoBootstrapResult> {
  const password = opts.password || OPENXYOS_DEMO_PASSWORD;
  const base = baseUrl.replace(/\/+$/, '');
  const details: string[] = [];
  const registered: string[] = [];

  const loginOkFirst = await tryDemoLogin(base, OPENXYOS_DEMO_EMAIL, password);
  if (loginOkFirst) {
    details.push(`login ok: ${OPENXYOS_DEMO_EMAIL}`);
    return { ok: true, loginOk: true, registered, details };
  }
  details.push(`login failed for ${OPENXYOS_DEMO_EMAIL}; attempting register`);

  const accounts: { email: string; nickname: string }[] = [
    { email: OPENXYOS_DEMO_EMAIL, nickname: '张总' },
    { email: OPENXYOS_DEMO_USER_EMAIL, nickname: '李员工' },
  ];

  for (const acc of accounts) {
    try {
      const { status, json } = await postJson(`${base}/api/auth/register`, {
        email: acc.email,
        password,
        nickname: acc.nickname,
      });
      if (status >= 200 && status < 300 && json?.success === true) {
        registered.push(acc.email);
        details.push(`registered ${acc.email}`);
      } else if (status === 409) {
        details.push(`already registered: ${acc.email}`);
      } else {
        const err =
          (json && typeof json.error === 'string' && json.error) ||
          `HTTP ${status}`;
        details.push(`register ${acc.email}: ${err}`);
      }
    } catch (err) {
      details.push(
        `register ${acc.email} error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const loginOk = await tryDemoLogin(base, OPENXYOS_DEMO_EMAIL, password);
  details.push(loginOk ? `login ok after bootstrap` : `login still failing`);
  return { ok: loginOk, loginOk, registered, details };
}

/** Documented curl for operators / QA. */
export function demoLoginCurlExample(baseUrl = 'http://127.0.0.1:3000'): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `curl -sS -X POST '${base}/api/auth/login' -H 'Content-Type: application/json' -d '{"email":"${OPENXYOS_DEMO_EMAIL}","password":"${OPENXYOS_DEMO_PASSWORD}"}'`;
}
