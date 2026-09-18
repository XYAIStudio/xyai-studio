/**
 * Dev ↔ Biz asset interop — file manifests under userData/interop/.
 * Optionally mirrors packages into OpenXYOS uploads/xyai-inbox/ when a root is known.
 * Agent assets: auto-publish into OpenXYOS talent_pool + reserve employees via HTTP.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  InteropAsset,
  InteropAssetKind,
  XyosInteropBridge,
} from '@xyai/contracts';
import {
  buildAgentPublishPlan,
  deriveAgentTypeFromInteropId,
} from './interop-publish.js';

export type InteropStorePaths = {
  root: string;
  outbox: string;
  inbox: string;
  installedBiz: string;
  installedDev: string;
  packages: string;
};

export function interopPaths(userDataDir: string): InteropStorePaths {
  const root = path.join(userDataDir, 'interop');
  return {
    root,
    outbox: path.join(root, 'outbox.json'),
    inbox: path.join(root, 'inbox.json'),
    installedBiz: path.join(root, 'installed-biz.json'),
    installedDev: path.join(root, 'installed-dev.json'),
    packages: path.join(root, 'packages'),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function readList(file: string): InteropAsset[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return Array.isArray(raw) ? (raw as InteropAsset[]) : [];
  } catch {
    return [];
  }
}

function writeList(file: string, list: InteropAsset[]): void {
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
}

function upsert(list: InteropAsset[], asset: InteropAsset): InteropAsset[] {
  const i = list.findIndex((a) => a.id === asset.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = asset;
    return next;
  }
  return [...list, asset];
}

export type OpenXyosPublishResult = {
  ok: boolean;
  skipped?: boolean;
  message: string;
  agentType?: string;
  talentId?: number;
  employeeId?: number;
  talentAction?: string;
  employeeAction?: string;
};

export type InteropHostOptions = {
  userDataDir: string;
  /** Absolute OpenXYOS runtime root (optional mirror target). */
  openXyosRoot?: () => string | null | undefined;
  /** Running OpenXYOS base URL for optional notify (best-effort). */
  openXyosBaseUrl?: () => string | null | undefined;
  /** Shared secret for X-XYAI-Interop header (default studio). */
  interopSecret?: () => string | null | undefined;
};

export class InteropHost implements XyosInteropBridge {
  private readonly paths: InteropStorePaths;
  private readonly opts: InteropHostOptions;
  /** Last OpenXYOS publish result (for IPC / UI tips). */
  lastPublishResult: OpenXyosPublishResult | null = null;

  constructor(opts: InteropHostOptions) {
    this.opts = opts;
    this.paths = interopPaths(opts.userDataDir);
    if (!existsSync(this.paths.root)) {
      mkdirSync(this.paths.root, { recursive: true });
    }
    if (!existsSync(this.paths.packages)) {
      mkdirSync(this.paths.packages, { recursive: true });
    }
  }

  async listOutgoingAssets(): Promise<InteropAsset[]> {
    const out = readList(this.paths.outbox);
    const installed = readList(this.paths.installedBiz);
    const byId = new Map<string, InteropAsset>();
    for (const a of out) byId.set(a.id, a);
    for (const a of installed) byId.set(a.id, a);
    return [...byId.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async listIncomingAssets(): Promise<InteropAsset[]> {
    const inbox = readList(this.paths.inbox);
    const installed = readList(this.paths.installedDev);
    const byId = new Map<string, InteropAsset>();
    for (const a of inbox) byId.set(a.id, a);
    for (const a of installed) byId.set(a.id, a);
    return [...byId.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  listPendingBizInstalls(): InteropAsset[] {
    return readList(this.paths.outbox).filter(
      (a) => a.direction === 'dev-to-biz' && a.status === 'pending',
    );
  }

  listInstalledBiz(): InteropAsset[] {
    return readList(this.paths.installedBiz);
  }

  listInstalledDev(): InteropAsset[] {
    return readList(this.paths.installedDev);
  }

  async pushToBiz(
    input: Omit<
      InteropAsset,
      'id' | 'direction' | 'status' | 'createdAt' | 'updatedAt' | 'sourceSpace'
    > & { id?: string },
  ): Promise<InteropAsset> {
    const t = nowIso();
    const asset: InteropAsset = {
      id: input.id || `interop-${randomUUID()}`,
      kind: input.kind,
      name: input.name,
      description: input.description,
      payload: input.payload || {},
      direction: 'dev-to-biz',
      status: 'pending',
      createdAt: t,
      updatedAt: t,
      sourceSpace: 'dev',
    };
    this.writePackage(asset);
    writeList(this.paths.outbox, upsert(readList(this.paths.outbox), asset));
    this.mirrorToOpenXyosInbox(asset);
    // Auto-publish agents into 人才市场 + 备选员工 so push is immediately visible.
    if (asset.kind === 'agent') {
      this.lastPublishResult = await this.publishAgentToOpenXyos(asset);
    } else {
      void this.notifyOpenXyos(asset).catch(() => {
        /* optional for non-agent */
      });
      this.lastPublishResult = {
        ok: true,
        skipped: true,
        message: '非 agent 资产仅写入互通清单',
      };
    }
    return asset;
  }

  /**
   * Reverse path stub/real: push a biz-side asset into Studio inbox for dev registration.
   */
  pushToDev(
    input: Omit<
      InteropAsset,
      'id' | 'direction' | 'status' | 'createdAt' | 'updatedAt' | 'sourceSpace'
    > & { id?: string },
  ): InteropAsset {
    const t = nowIso();
    const asset: InteropAsset = {
      id: input.id || `interop-${randomUUID()}`,
      kind: input.kind,
      name: input.name,
      description: input.description,
      payload: input.payload || {},
      direction: 'biz-to-dev',
      status: 'pending',
      createdAt: t,
      updatedAt: t,
      sourceSpace: 'biz',
    };
    this.writePackage(asset);
    writeList(this.paths.inbox, upsert(readList(this.paths.inbox), asset));
    return asset;
  }

  async installIncoming(assetId: string): Promise<InteropAsset> {
    const outbox = readList(this.paths.outbox);
    const hit = outbox.find((a) => a.id === assetId);
    if (!hit) {
      throw new Error(`pending asset not found: ${assetId}`);
    }
    const installed: InteropAsset = {
      ...hit,
      status: 'installed',
      updatedAt: nowIso(),
    };
    writeList(
      this.paths.outbox,
      outbox.filter((a) => a.id !== assetId),
    );
    writeList(
      this.paths.installedBiz,
      upsert(readList(this.paths.installedBiz), installed),
    );
    if (installed.kind === 'agent') {
      this.lastPublishResult = await this.publishAgentToOpenXyos(installed);
    } else {
      this.lastPublishResult = {
        ok: true,
        skipped: true,
        message: '已安装到业务空间互通清单',
      };
    }
    return installed;
  }

  async pullInstallFromBiz(assetId: string): Promise<InteropAsset> {
    return this.installIncoming(assetId);
  }

  async registerInDev(assetId: string): Promise<InteropAsset> {
    const inbox = readList(this.paths.inbox);
    const hit = inbox.find((a) => a.id === assetId);
    if (!hit) {
      throw new Error(`inbox asset not found: ${assetId}`);
    }
    const installed: InteropAsset = {
      ...hit,
      status: 'installed',
      updatedAt: nowIso(),
    };
    writeList(
      this.paths.inbox,
      inbox.filter((a) => a.id !== assetId),
    );
    writeList(
      this.paths.installedDev,
      upsert(readList(this.paths.installedDev), installed),
    );
    return installed;
  }

  async selectAsset(
    assetId: string,
    space: 'dev' | 'biz',
  ): Promise<InteropAsset> {
    const file =
      space === 'biz' ? this.paths.installedBiz : this.paths.installedDev;
    const list = readList(file);
    const hit = list.find((a) => a.id === assetId);
    if (!hit) {
      throw new Error(`installed asset not found: ${assetId}`);
    }
    const selected: InteropAsset = {
      ...hit,
      status: 'selected',
      updatedAt: nowIso(),
    };
    writeList(file, upsert(list, selected));
    if (space === 'biz' && selected.kind === 'agent') {
      this.lastPublishResult = await this.publishAgentToOpenXyos(selected);
    }
    return selected;
  }

  private writePackage(asset: InteropAsset): void {
    const file = path.join(this.paths.packages, `${asset.id}.json`);
    writeFileSync(file, JSON.stringify(asset, null, 2), 'utf8');
  }

  private mirrorToOpenXyosInbox(asset: InteropAsset): void {
    const root = this.opts.openXyosRoot?.();
    if (!root) return;
    const inboxDir = path.join(root, 'uploads', 'xyai-inbox');
    try {
      if (!existsSync(inboxDir)) mkdirSync(inboxDir, { recursive: true });
      const dest = path.join(inboxDir, `${asset.id}.json`);
      const src = path.join(this.paths.packages, `${asset.id}.json`);
      if (existsSync(src)) copyFileSync(src, dest);
      else writeFileSync(dest, JSON.stringify(asset, null, 2), 'utf8');
    } catch {
      /* OpenXYOS root may be missing or read-only */
    }
  }

  private interopHeaders(): Record<string, string> {
    const secret =
      this.opts.interopSecret?.()?.trim() ||
      process.env.XYAI_INTEROP_SECRET?.trim() ||
      'studio';
    return {
      'Content-Type': 'application/json',
      'X-XYAI-Interop': secret,
    };
  }

  /**
   * POST agent into OpenXYOS talent_pool + reserve employees (idempotent).
   */
  async publishAgentToOpenXyos(asset: InteropAsset): Promise<OpenXyosPublishResult> {
    if (asset.kind !== 'agent') {
      return { ok: true, skipped: true, message: '非 agent，跳过人才市场写入' };
    }
    const plan = buildAgentPublishPlan(asset);
    const base = this.opts.openXyosBaseUrl?.();
    if (!base) {
      return {
        ok: false,
        message:
          'OpenXYOS 未运行：已写入本地互通清单；启动业务空间后请再点「安装/注册」以同步到人才市场',
        agentType: plan.agentType,
      };
    }
    const root = base.replace(/\/+$/, '');
    const urls = [`${root}/api/xyai/agents/import`, `${root}/api/xyai/inbox`];
    let lastErr = 'unknown';
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: this.interopHeaders(),
          body: JSON.stringify({ asset, tenant_id: 1 }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          data?: {
            skipped?: boolean;
            message?: string;
            agent_type?: string;
            talent?: { id?: number; action?: string };
            employee?: { id?: number; action?: string };
          };
        };
        if (!res.ok || body.success === false) {
          lastErr = body.error || `HTTP ${res.status}`;
          continue;
        }
        const data = body.data || {};
        if (data.skipped) {
          return {
            ok: true,
            skipped: true,
            message: data.message || '已跳过',
            agentType: plan.agentType,
          };
        }
        return {
          ok: true,
          message:
            data.message ||
            '已同步到人机资源 → 人才市场 / 备选员工',
          agentType: data.agent_type || plan.agentType,
          talentId: data.talent?.id,
          employeeId: data.employee?.id,
          talentAction: data.talent?.action,
          employeeAction: data.employee?.action,
        };
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    return {
      ok: false,
      message: `OpenXYOS 导入失败：${lastErr}（本地互通清单仍有效）`,
      agentType: plan.agentType,
    };
  }

  private async notifyOpenXyos(asset: InteropAsset): Promise<void> {
    const base = this.opts.openXyosBaseUrl?.();
    if (!base) return;
    try {
      await fetch(`${base.replace(/\/+$/, '')}/api/xyai/inbox`, {
        method: 'POST',
        headers: this.interopHeaders(),
        body: JSON.stringify({ asset }),
      });
    } catch {
      /* API may not exist yet — file bridge is enough */
    }
  }
}

export function createInteropHost(opts: InteropHostOptions): InteropHost {
  return new InteropHost(opts);
}

export { deriveAgentTypeFromInteropId, buildAgentPublishPlan };
export type { InteropAsset, InteropAssetKind };
