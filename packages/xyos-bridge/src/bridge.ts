/**
 * OpenXYOS host-side bridge stub.
 * Detects submodule checkout via install markers (e.g. package.json).
 * Runtime health (HTTP) is a later milestone; detection ≠ service running.
 */

import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { XyosBridge, XyosHealthStatus } from '@xyai/contracts';

export const OPENXYOS_REPO_URL = 'https://github.com/XYAIStudio/openXYOS.git';

export interface XyosBridgeOptions {
  /** Absolute or relative path to components/openxyos */
  componentRoot?: string;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether OpenXYOS source/component appears present.
 * Treats package.json (and a few other markers) as installed-for-dev;
 * ignores README/.gitkeep-only placeholders.
 */
export async function isOpenXyosInstalled(componentRoot: string): Promise<boolean> {
  const markers = ['package.json', 'dist/index.js', 'backend/server.ts', 'bin/openxyos'];
  for (const m of markers) {
    if (await pathExists(path.join(componentRoot, m))) return true;
  }
  return false;
}

export class StubXyosBridge implements XyosBridge {
  private readonly componentRoot: string;

  constructor(options: XyosBridgeOptions = {}) {
    this.componentRoot =
      options.componentRoot ?? path.resolve(process.cwd(), 'components/openxyos');
  }

  async healthCheck(): Promise<XyosHealthStatus> {
    const installed = await isOpenXyosInstalled(this.componentRoot);
    if (!installed) {
      return {
        ok: false,
        reason: 'not-installed',
        details: {
          componentRoot: this.componentRoot,
          hint: `git submodule add ${OPENXYOS_REPO_URL} components/openxyos`,
          repo: OPENXYOS_REPO_URL,
        },
      };
    }
    return {
      ok: true,
      reason: 'submodule-present',
      details: {
        componentRoot: this.componentRoot,
        repo: OPENXYOS_REPO_URL,
        note: 'source detected; runtime HTTP probe not implemented yet',
      },
    };
  }
}

export function createXyosBridge(options?: XyosBridgeOptions): StubXyosBridge {
  return new StubXyosBridge(options);
}