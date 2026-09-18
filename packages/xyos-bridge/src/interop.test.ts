import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInteropHost } from './interop.js';

describe('InteropHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes agent Dev→Biz with official import body + JWT', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'interop-'));
    const oxy = mkdtempSync(path.join(tmpdir(), 'oxyos-'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          message: '已写入备选员工',
          talent_id: 11,
          employee_id: 22,
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const host = createInteropHost({
        userDataDir: dir,
        openXyosRoot: () => oxy,
        openXyosBaseUrl: () => 'http://127.0.0.1:3000',
        openXyosAccessToken: () => 'demo-jwt',
      });
      const pushed = await host.pushToBiz({
        kind: 'agent',
        name: '通用智能体',
        description: 'AI智能助手',
        payload: { agentId: 'agent-general', subtitle: 'AI智能助手' },
      });
      expect(pushed.status).toBe('pending');
      expect(pushed.direction).toBe('dev-to-biz');
      expect(host.listPendingBizInstalls().some((a) => a.id === pushed.id)).toBe(
        true,
      );
      expect(host.lastPublishResult?.ok).toBe(true);
      expect(host.lastPublishResult?.employeeId).toBe(22);
      expect(fetchMock).toHaveBeenCalled();
      const firstCall = fetchMock.mock.calls[0];
      expect(String(firstCall[0])).toContain('/api/xyai/agents/import');
      const init = firstCall[1] as { headers?: Record<string, string>; body?: string };
      expect(init.headers?.['X-XYAI-Interop']).toBe('studio');
      expect(init.headers?.Authorization).toBe('Bearer demo-jwt');
      const body = JSON.parse(String(init.body)) as {
        name: string;
        external_id: string;
        employee_type: string;
        asset: { kind: string };
      };
      expect(body.name).toBe('通用智能体');
      expect(body.external_id).toBe(pushed.id);
      expect(body.employee_type).toBe('ai');
      expect(body.asset.kind).toBe('agent');

      const inboxFile = path.join(
        oxy,
        'uploads',
        'xyai-inbox',
        `${pushed.id}.json`,
      );
      expect(existsSync(inboxFile)).toBe(true);

      const installed = await host.installIncoming(pushed.id);
      expect(installed.status).toBe('installed');
      expect(host.listPendingBizInstalls().length).toBe(0);
      expect(host.listInstalledBiz().some((a) => a.id === pushed.id)).toBe(true);
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      const selected = await host.selectAsset(pushed.id, 'biz');
      expect(selected.status).toBe('selected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(oxy, { recursive: true, force: true });
    }
  });

  it('publishes knowledge-mount to /api/xyai/knowledge/import', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'interop-kb-'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { file_id: 7, note_id: 8, folder: '/' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const host = createInteropHost({
        userDataDir: dir,
        openXyosBaseUrl: () => 'http://127.0.0.1:3000',
        openXyosAccessToken: () => 'demo-jwt',
      });
      const pushed = await host.pushToBiz({
        kind: 'knowledge-mount',
        name: '政策库',
        payload: { kbId: 'kb-1', mountKind: 'local', sourceRoot: '/docs' },
      });
      expect(host.lastPublishResult?.ok).toBe(true);
      expect(host.lastPublishResult?.fileId).toBe(7);
      expect(host.lastPublishResult?.noteId).toBe(8);
      const firstCall = fetchMock.mock.calls[0];
      expect(String(firstCall[0])).toContain('/api/xyai/knowledge/import');
      const init = firstCall[1] as { headers?: Record<string, string>; body?: string };
      expect(init.headers?.Authorization).toBe('Bearer demo-jwt');
      const body = JSON.parse(String(init.body)) as {
        name: string;
        external_id: string;
        payload: { kbId: string };
      };
      expect(body.name).toBe('政策库');
      expect(body.external_id).toBe(pushed.id);
      expect(body.payload.kbId).toBe('kb-1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('supports reverse biz→dev register path for knowledge mounts', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'interop-rev-'));
    try {
      const host = createInteropHost({ userDataDir: dir });
      const asset = host.pushToDev({
        kind: 'knowledge-mount',
        name: '政策库',
        payload: { sourceRoot: '/docs/policy' },
      });
      expect(asset.direction).toBe('biz-to-dev');
      const registered = await host.registerInDev(asset.id);
      expect(registered.status).toBe('installed');
      expect(host.listInstalledDev().some((a) => a.id === asset.id)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('agent push without OpenXYOS base still keeps pending outbox', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'interop-nobase-'));
    try {
      const host = createInteropHost({ userDataDir: dir });
      const pushed = await host.pushToBiz({
        kind: 'agent',
        name: '离线助手',
        payload: {},
      });
      expect(pushed.status).toBe('pending');
      expect(host.lastPublishResult?.ok).toBe(false);
      expect(host.lastPublishResult?.message).toMatch(/OpenXYOS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('agent push without JWT reports login requirement', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'interop-notoken-'));
    try {
      const host = createInteropHost({
        userDataDir: dir,
        openXyosBaseUrl: () => 'http://127.0.0.1:3000',
      });
      const pushed = await host.pushToBiz({
        kind: 'agent',
        name: '未登录助手',
        payload: {},
      });
      expect(pushed.status).toBe('pending');
      expect(host.lastPublishResult?.ok).toBe(false);
      expect(host.lastPublishResult?.message).toMatch(/JWT|登录/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
