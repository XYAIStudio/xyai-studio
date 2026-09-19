/**
 * Forge planner: empty request → no-op; otherwise scaffold path + personalize kind.
 * Does not write files or run an Agent Loop; the host executes the plan.
 */

import {
  inferForgeKindFromWorkspaceRel,
  normalizeForgeAssetKind,
  workspaceFolderForKind,
  type ForgeAssetKind,
  type ForgeFile,
  type ForgeRequest,
  type ForgeResult,
  type ForgeStage,
  type TurnCapability,
} from '@xyai/contracts';

export type {
  ForgeAssetKind,
  ForgeFile,
  ForgeRequest,
  ForgeResult,
  ForgeStage,
};

export type ForgePlanReason = 'empty-request' | 'chat-capability' | 'ready';

export interface ForgePlan {
  action: 'noop' | 'run';
  reason: ForgePlanReason;
  kind?: ForgeAssetKind;
  name?: string;
  workspaceRel?: string;
  personalizeKind?: ForgeAssetKind;
  files: ForgeFile[];
}

/**
 * Strip path separators and `..` so a name can sit under one workspace folder.
 * @param name User or model-supplied asset name
 */
export function sanitizeForgeName(name: string): string {
  const trimmed = (name || '')
    .trim()
    .replace(/[/\\]+/g, '-')
    .replace(/\.\./g, '');
  const cleaned = trimmed
    .replace(/[^\w.\-\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'asset';
}

/**
 * @param kind Canonical kind
 * @param name Sanitized asset name
 * @returns Workspace-relative folder (`plugins/demo`)
 */
export function workspaceRelForForge(
  kind: ForgeAssetKind,
  name: string,
): string {
  return `${workspaceFolderForKind(kind)}/${sanitizeForgeName(name)}`;
}

/**
 * Personalize catalog kind is the forge kind (doc / system included).
 * @param kind Canonical forge kind
 */
export function personalizeKindForForge(kind: ForgeAssetKind): ForgeAssetKind {
  return kind;
}

function lastRelSegment(workspaceRel: string): string {
  const parts = workspaceRel.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function normalizeFiles(files: ForgeFile[] | undefined): ForgeFile[] {
  const out: ForgeFile[] = [];
  for (const f of files ?? []) {
    const relativePath = (f.relativePath || '').trim().replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) {
      continue;
    }
    out.push({
      relativePath,
      contents: typeof f.contents === 'string' ? f.contents : '',
    });
  }
  return out;
}

/**
 * Decide whether a forge request should write + install.
 * Empty requests and `capability: 'chat'` are no-ops and do not change
 * stream vs tools routing. PermissionMode is not an input.
 * @param request Kind / name / files / optional workspaceRel
 */
export function forgePlan(request: ForgeRequest | undefined): ForgePlan {
  const empty = (reason: ForgePlanReason): ForgePlan => ({
    action: 'noop',
    reason,
    files: [],
  });
  if (!request) return empty('empty-request');
  const capability: TurnCapability | undefined = request.capability;
  if (capability === 'chat') return empty('chat-capability');

  const files = normalizeFiles(request.files);
  const nameRaw = (request.name || '').trim();
  const relHint = (request.workspaceRel || '').trim().replace(/\\/g, '/');
  const kind =
    normalizeForgeAssetKind(request.kind) ??
    inferForgeKindFromWorkspaceRel(relHint);

  if (!nameRaw && !relHint && !files.length) {
    return empty('empty-request');
  }

  const name = sanitizeForgeName(
    nameRaw || lastRelSegment(relHint) || 'asset',
  );
  const resolvedKind = kind ?? 'plugin';
  const workspaceRel = (relHint || workspaceRelForForge(resolvedKind, name)).replace(
    /^\/+/,
    '',
  );

  return {
    action: 'run',
    reason: 'ready',
    kind: resolvedKind,
    name,
    workspaceRel,
    personalizeKind: personalizeKindForForge(resolvedKind),
    files,
  };
}
