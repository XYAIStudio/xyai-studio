import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInteropHost } from './interop.js';

describe('InteropHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes agent Dev→Biz and installs as selectable candidate', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'interop-'));
    const oxy = mkdtempSync(path.join(tmpdir(), 'oxyos-'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          message: '已写入人才市场与备选员工',
          agent_type: 'xyai-test',
          talent: { id: 11, action: 'created' },
          employee: { id: 22, action: 'created' },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const host = createInteropHost({
        userDataDir: dir,
        openXyosRoot: () => oxy,
        openXyosBaseUrl: () => 'http://127.0.0.1:3000',
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
      expect(fetchMock).toHaveBeenCalled();
      const firstCall = fetchMock.mock.calls[0];
      expect(String(firstCall[0])).toContain('/api/xyai/agents/import');
      const init = firstCall[1] as { headers?: Record<string, string>; body?: string };
      expect(init.headers?.['X-XYAI-Interop']).toBe('studio');
      const body = JSON.parse(String(init.body)) as { asset: { kind: string } };
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
      // install re-publishes idempotently
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      const selected = await host.selectAsset(pushed.id, 'biz');
      expect(selected.status).toBe('selected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(oxy, { recursive: true, force: true });
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
});
