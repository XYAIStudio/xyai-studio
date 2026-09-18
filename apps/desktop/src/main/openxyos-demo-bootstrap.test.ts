import { describe, expect, it, vi } from 'vitest';
import {
  OPENXYOS_DEMO_EMAIL,
  OPENXYOS_DEMO_PASSWORD,
  demoLoginCurlExample,
  ensureOpenXyosDemoUsers,
  loginOpenXyosDemoAccessToken,
} from './openxyos-demo-bootstrap.js';

describe('openxyos-demo-bootstrap', () => {
  it('documents curl login verification', () => {
    const curl = demoLoginCurlExample('http://127.0.0.1:3000');
    expect(curl).toContain('/api/auth/login');
    expect(curl).toContain(OPENXYOS_DEMO_EMAIL);
    expect(curl).toContain(OPENXYOS_DEMO_PASSWORD);
  });

  it('returns ok when login already succeeds', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => ({ success: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = await ensureOpenXyosDemoUsers('http://127.0.0.1:3000/');
      expect(res.ok).toBe(true);
      expect(res.loginOk).toBe(true);
      expect(res.registered).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads accessToken from login JSON', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        success: true,
        data: { tokens: { accessToken: 'jwt-abc' } },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const token = await loginOpenXyosDemoAccessToken('http://127.0.0.1:3000');
      expect(token).toBe('jwt-abc');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('registers missing demo users then retries login', async () => {
    let loginCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/auth/login')) {
        loginCalls += 1;
        if (loginCalls === 1) {
          return {
            status: 401,
            json: async () => ({ success: false, error: '邮箱或密码错误' }),
          };
        }
        return { status: 200, json: async () => ({ success: true }) };
      }
      if (u.includes('/api/auth/register')) {
        return { status: 200, json: async () => ({ success: true }) };
      }
      return { status: 404, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = await ensureOpenXyosDemoUsers('http://127.0.0.1:3000');
      expect(res.ok).toBe(true);
      expect(res.registered).toContain(OPENXYOS_DEMO_EMAIL);
      expect(res.registered).toContain('user@demo.com');
      expect(loginCalls).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
