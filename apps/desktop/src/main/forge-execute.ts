/**
 * Thin Forge executor: scaffold workspace files → pack (catalog row) →
 * personalize `installAsset`. Optional biz push when OpenXYOS is present.
 * Does not invent a second store or an Agent Loop.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  interopKindForForge,
  type ForgeAssetKind,
  type ForgeRequest,
  type ForgeResult,
  type InteropAssetKind,
} from '@xyai/contracts';
import { forgePlan } from '@xyai/core-runtime';
import { installAsset } from './personalize/actions.js';
import { discoveryId } from './personalize/paths.js';
import { upsertAsset } from './personalize/store.js';
import type { PersonalAsset, PersonalizeKind } from './personalize/types.js';

function personalizeToForgeKind(kind: PersonalizeKind): ForgeAssetKind {
  if (kind === 'connector') return 'plugin';
  return kind;
}

export type ForgeBizPush = (input: {
  id: string;
  kind: InteropAssetKind;
  name: string;
  description?: string;
  payload: Record<string, unknown>;
}) => Promise<unknown> | unknown;

let bizPush: ForgeBizPush | null = null;

/**
 * @param next Optional OpenXYOS / interop pusher; null disables the biz path
 */
export function configureForgeBiz(next: ForgeBizPush | null): void {
  bizPush = next;
}

export function forgeDiscoveryKey(
  kind: string,
  absPath: string,
): string {
  return `workspace|${kind}|${absPath}`;
}

/**
 * Register a workspace folder as discovered so {@link installAsset} can see it.
 * @param asset Catalog row pointing at the workspace source
 */
export function packForgeAsset(asset: PersonalAsset): PersonalAsset {
  return upsertAsset({
    ...asset,
    status: 'discovered',
    source: asset.source || 'user',
    originApp: asset.originApp || 'xyai',
  });
}

function writeScaffold(
  workspaceDir: string,
  workspaceRel: string,
  files: { relativePath: string; contents: string }[],
): string {
  const abs = path.join(workspaceDir, workspaceRel);
  mkdirSync(abs, { recursive: true });
  const root = path.resolve(abs);
  for (const f of files) {
    const dest = path.resolve(abs, f.relativePath);
    if (dest !== root && !dest.startsWith(root + path.sep)) continue;
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, f.contents, 'utf8');
  }
  return abs;
}

/** Best-effort biz push. No-op when OpenXYOS / interop is not configured. */
export async function notifyForgeBiz(asset: PersonalAsset): Promise<void> {
  if (!bizPush) return;
  try {
    const kind = interopKindForForge(personalizeToForgeKind(asset.kind));
    await bizPush({
      id: asset.id,
      kind,
      name: asset.name,
      description: asset.description,
      payload: {
        personalizeId: asset.id,
        pathOrRef: asset.pathOrRef,
        manifest: asset.manifest || {},
      },
    });
  } catch {
    /* Biz path is optional; personalize install already succeeded. */
  }
}

/**
 * Run Cindy-shaped scaffold → pack → installAsset.
 * Empty / chat requests return `{ ok: true, noop: true }` and write nothing.
 * @param request Planner input (kind / name / files / workspaceRel)
 * @param workspaceDir Studio cwd (`userData/workspace`)
 */
export async function executeForge(
  request: ForgeRequest,
  workspaceDir: string,
): Promise<ForgeResult> {
  const plan = forgePlan(request);
  if (plan.action === 'noop') {
    return {
      ok: true,
      noop: true,
      stage: 'noop',
      message: plan.reason,
    };
  }

  const abs = writeScaffold(workspaceDir, plan.workspaceRel!, plan.files);
  const id = discoveryId(forgeDiscoveryKey(plan.kind!, abs));
  const packed = packForgeAsset({
    id,
    kind: plan.personalizeKind as PersonalizeKind,
    name: plan.name!,
    source: 'user',
    originApp: 'xyai',
    status: 'discovered',
    pathOrRef: abs,
    description: `工作目录 ${plan.kind}`,
    manifest: { workspaceDir: abs, forge: true },
  });

  const inst = installAsset(packed.id);
  if (!inst.ok || !inst.asset) {
    return {
      ok: false,
      stage: 'pack',
      kind: plan.kind,
      name: plan.name,
      workspaceRel: plan.workspaceRel,
      personalizeKind: plan.personalizeKind,
      assetId: packed.id,
      message: inst.message || 'installAsset failed',
    };
  }

  await notifyForgeBiz(inst.asset);
  return {
    ok: true,
    stage: 'install',
    kind: plan.kind,
    name: plan.name,
    workspaceRel: plan.workspaceRel,
    personalizeKind: plan.personalizeKind,
    assetId: inst.asset.id,
  };
}
