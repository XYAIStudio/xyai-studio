/**
 * OpenXYOS 宿主侧桥接 stub。
 * 组件未安装（占位 submodule 无真实内容）时 healthCheck 返回 not-installed；
 * 检测到 package.json 等安装标记时返回 ok + reason: submodule-present。
 */

import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { XyosBridge, XyosHealthStatus } from '@xyai/contracts';

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
 * 判定 OpenXYOS 是否“已安装”：存在真实入口文件（如 package.json 或 server 主文件），
 * 而非仅有 README / .gitkeep 占位。
 */
export async function isOpenXyosInstalled(componentRoot: string): Promise<boolean> {
  const markers = ['package.json', 'dist/index.js', 'src/main.ts', 'bin/openxyos'];
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
          hint: 'git submodule add <url> components/openxyos',
        },
      };
    }
    return {
      ok: true,
      reason: 'submodule-present',
      details: { componentRoot: this.componentRoot },
    };
  }
}

export function createXyosBridge(options?: XyosBridgeOptions): StubXyosBridge {
  return new StubXyosBridge(options);
}
