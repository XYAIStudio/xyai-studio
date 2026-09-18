/**
 * Dev ↔ Biz asset interop — file manifests under userData/interop/.
 * Optionally mirrors packages into OpenXYOS uploads/xyai-inbox/ when a root is known.
 * Agents: POST /api/xyai/agents/import (JWT + X-XYAI-Interop).
 * Knowledge: POST /api/xyai/knowledge/import.
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
  buildAgentImportBody,
  buildAgentPublishPlan,
  buildKnowledgeImportBody,
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
  fileId?: number;
  noteId?: number;
};

export type InteropHostOptions = {
  userDataDir: string;
  /** Absolute OpenXYOS runtime root (optional mirror target). */
  openXyosRoot?: () => string | null | undefined;
  /** Running OpenXYOS base URL for optional notify (best-effort). */
  openXyosBaseUrl?: () => string | null | undefined;
  /** Shared secret for X-XYAI-Interop header (default studio). */
  interopSecret?: () => string | null | undefined;
  /** Tenant JWT required by OpenXYOS `/api/xyai/*` import routes. */
  openXyosAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
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
    // Agents → 备选员工; knowledge → OpenXYOS 知识库 files/notes.
    if (asset.kind === 'agent') {
      this.lastPublishResult = await this.publishAgentToOpenXyos(asset);
    } else if (asset.kind === 'knowledge-mount') {
      this.lastPublishResult = await this.publishKnowledgeToOpenXyos(asset);
    } else {
      void this.notifyOpenXyos(asset).catch(() => {
        /* optional for other kinds */
      });
      this.lastPublishResult = {
        ok: true,
        skipped: true,
        message: '非 agent/知识库资产仅写入互通清单',
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
    } else if (installed.kind === 'knowledge-mount') {
      this.lastPublishResult = await this.publishKnowledgeToOpenXyos(installed);
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
    } else if (space === 'biz' && selected.kind === 'knowledge-mount') {
      this.lastPublishResult = await this.publishKnowledgeToOpenXyos(selected);
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

  private async interopHeaders(): Promise<Record<string, string>> {
    const secret =
      this.opts.interopSecret?.()?.trim() ||
      process.env.XYAI_INTEROP_SECRET?.trim() ||
      'studio';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-XYAI-Interop': secret,
    };
    const token = await this.resolveAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async resolveAccessToken(): Promise<string | null> {
    try {
      const raw = await this.opts.openXyosAccessToken?.();
      const token = typeof raw === 'string' ? raw.trim() : '';
      return token || null;
    } catch {
      return null;
    }
  }

  private parseImportIds(data: {
    talent_id?: number;
    employee_id?: number;
    file_id?: number;
    note_id?: number;
    talent?: { id?: number; action?: string };
    employee?: { id?: number; action?: string };
  }): {
    talentId?: number;
    employeeId?: number;
    fileId?: number;
    noteId?: number;
    talentAction?: string;
    employeeAction?: string;
  } {
    return {
      talentId: data.talent_id ?? data.talent?.id,
      employeeId: data.employee_id ?? data.employee?.id,
      fileId: data.file_id,
      noteId: data.note_id,
      talentAction: data.talent?.action,
      employeeAction: data.employee?.action,
    };
  }

  /**
   * POST agent into OpenXYOS talent_pool (recruited) + reserve employees.
   */
  async publishAgentToOpenXyos(asset: InteropAsset): Promise<OpenXyosPublishResult> {
    if (asset.kind !== 'agent') {
      return { ok: true, skipped: true, message: '非 agent，跳过备选员工写入' };
    }
    const plan = buildAgentPublishPlan(asset);
    const base = this.opts.openXyosBaseUrl?.();
    if (!base) {
      return {
        ok: false,
        message:
          'OpenXYOS 未运行：已写入本地互通清单；启动业务空间后请再点「安装/注册」以同步到备选员工',
        agentType: plan.agentType,
      };
    }
    const token = await this.resolveAccessToken();
    if (!token) {
      return {
        ok: false,
        message:
          'OpenXYOS 未登录：导入需要租户 JWT。请先在业务空间登录（demo 账号即可），再点「安装/注册」',
        agentType: plan.agentType,
      };
    }
    const root = base.replace(/\/+$/, '');
    const url = `${root}/api/xyai/agents/import`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: await this.interopHeaders(),
        body: JSON.stringify(buildAgentImportBody(asset)),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          skipped?: boolean;
          message?: string;
          agent_type?: string;
          talent_id?: number;
          employee_id?: number;
          talent?: { id?: number; action?: string };
          employee?: { id?: number; action?: string };
        };
      };
      if (!res.ok || body.success === false) {
        return {
          ok: false,
          message: `OpenXYOS 导入失败：${body.error || `HTTP ${res.status}`}（本地互通清单仍有效）`,
          agentType: plan.agentType,
        };
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
      const ids = this.parseImportIds(data);
      return {
        ok: true,
        message:
          data.message ||
          '已同步到人机资源 → 备选员工（可编辑 / 录用；不会出现在人才市场）',
        agentType: data.agent_type || plan.agentType,
        ...ids,
      };
    } catch (err) {
      const lastErr = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `OpenXYOS 导入失败：${lastErr}（本地互通清单仍有效）`,
        agentType: plan.agentType,
      };
    }
  }

  /**
   * POST knowledge-mount into OpenXYOS knowledge_files (folder=/) + knowledge_notes.
   */
  async publishKnowledgeToOpenXyos(asset: InteropAsset): Promise<OpenXyosPublishResult> {
    if (asset.kind !== 'knowledge-mount') {
      return { ok: true, skipped: true, message: '非知识库，跳过知识库写入' };
    }
    const base = this.opts.openXyosBaseUrl?.();
    if (!base) {
      return {
        ok: false,
        message:
          'OpenXYOS 未运行：已写入本地互通清单；启动业务空间后请再点「安装/注册」以同步到知识库',
      };
    }
    const token = await this.resolveAccessToken();
    if (!token) {
      return {
        ok: false,
        message:
          'OpenXYOS 未登录：知识库导入需要租户 JWT。请先在业务空间登录，再点「安装/注册」',
      };
    }
    const url = `${base.replace(/\/+$/, '')}/api/xyai/knowledge/import`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: await this.interopHeaders(),
        body: JSON.stringify(buildKnowledgeImportBody(asset)),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          skipped?: boolean;
          message?: string;
          file_id?: number;
          note_id?: number;
        };
      };
      if (!res.ok || body.success === false) {
        return {
          ok: false,
          message: `OpenXYOS 知识库导入失败：${body.error || `HTTP ${res.status}`}（本地互通清单仍有效）`,
        };
      }
      const data = body.data || {};
      return {
        ok: true,
        skipped: data.skipped,
        message: data.message || '已写入 OpenXYOS 知识库（文件 + 笔记，刷新知识库页可见）',
        fileId: data.file_id,
        noteId: data.note_id,
      };
    } catch (err) {
      const lastErr = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `OpenXYOS 知识库导入失败：${lastErr}（本地互通清单仍有效）`,
      };
    }
  }

  private async notifyOpenXyos(asset: InteropAsset): Promise<void> {
    const base = this.opts.openXyosBaseUrl?.();
    if (!base) return;
    try {
      await fetch(`${base.replace(/\/+$/, '')}/api/xyai/inbox`, {
        method: 'POST',
        headers: await this.interopHeaders(),
        body: JSON.stringify({ asset }),
      });
    } catch {
      /* inbox route is optional — file bridge is enough */
    }
  }
}

export function createInteropHost(opts: InteropHostOptions): InteropHost {
  return new InteropHost(opts);
}

export {
  deriveAgentTypeFromInteropId,
  buildAgentPublishPlan,
  buildAgentImportBody,
  buildKnowledgeImportBody,
};
export type { InteropAsset, InteropAssetKind };
