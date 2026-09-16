/** AssemblyGraph loader/validator — 读取 JSON profile，校验 harnesses/modules */

import { readFile } from 'node:fs/promises';
import type { AssemblyProfile, AssemblyHarness, AssemblyModule } from '@xyai/contracts';

export interface AssemblyValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface AssemblyValidationResult {
  ok: boolean;
  profile: AssemblyProfile;
  issues: AssemblyValidationIssue[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateHarness(h: unknown, index: number): AssemblyValidationIssue[] {
  const issues: AssemblyValidationIssue[] = [];
  const base = `harnesses[${index}]`;
  if (!isObject(h)) {
    issues.push({ path: base, message: 'harness must be an object', severity: 'error' });
    return issues;
  }
  if (typeof h.id !== 'string' || !h.id) {
    issues.push({ path: `${base}.id`, message: 'id must be a non-empty string', severity: 'error' });
  }
  if (typeof h.adapter !== 'string' || !h.adapter) {
    issues.push({
      path: `${base}.adapter`,
      message: 'adapter must be a non-empty string',
      severity: 'error',
    });
  }
  if (typeof h.enabled !== 'boolean') {
    issues.push({ path: `${base}.enabled`, message: 'enabled must be boolean', severity: 'error' });
  }
  return issues;
}

function validateModule(m: unknown, index: number): AssemblyValidationIssue[] {
  const issues: AssemblyValidationIssue[] = [];
  const base = `modules[${index}]`;
  if (!isObject(m)) {
    issues.push({ path: base, message: 'module must be an object', severity: 'error' });
    return issues;
  }
  if (typeof m.id !== 'string' || !m.id) {
    issues.push({ path: `${base}.id`, message: 'id must be a non-empty string', severity: 'error' });
  }
  if (typeof m.enabled !== 'boolean') {
    issues.push({ path: `${base}.enabled`, message: 'enabled must be boolean', severity: 'error' });
  }
  return issues;
}

/** 校验已解析的 AssemblyProfile 形状与最小业务规则 */
export function validateAssemblyProfile(raw: unknown): AssemblyValidationResult {
  const issues: AssemblyValidationIssue[] = [];

  if (!isObject(raw)) {
    return {
      ok: false,
      profile: {
        productVersion: '',
        profileId: '',
        harnesses: [],
        modules: [],
        components: [],
      },
      issues: [{ path: '', message: 'profile must be a JSON object', severity: 'error' }],
    };
  }

  if (typeof raw.productVersion !== 'string' || !raw.productVersion) {
    issues.push({
      path: 'productVersion',
      message: 'productVersion must be a non-empty string',
      severity: 'error',
    });
  }
  if (typeof raw.profileId !== 'string' || !raw.profileId) {
    issues.push({
      path: 'profileId',
      message: 'profileId must be a non-empty string',
      severity: 'error',
    });
  }

  if (!Array.isArray(raw.harnesses)) {
    issues.push({ path: 'harnesses', message: 'harnesses must be an array', severity: 'error' });
  } else {
    raw.harnesses.forEach((h, i) => issues.push(...validateHarness(h, i)));
    const enabled = (raw.harnesses as AssemblyHarness[]).filter(
      (h) => isObject(h) && h.enabled === true,
    );
    if (enabled.length === 0) {
      issues.push({
        path: 'harnesses',
        message: 'at least one harness must be enabled',
        severity: 'error',
      });
    }
  }

  if (!Array.isArray(raw.modules)) {
    issues.push({ path: 'modules', message: 'modules must be an array', severity: 'error' });
  } else {
    raw.modules.forEach((m, i) => issues.push(...validateModule(m, i)));
  }

  if (raw.components !== undefined && !Array.isArray(raw.components)) {
    issues.push({ path: 'components', message: 'components must be an array', severity: 'error' });
  }

  const profile = raw as unknown as AssemblyProfile;
  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, profile, issues };
}

/** 从磁盘读取并校验装配图 JSON */
export async function loadAssemblyProfile(filePath: string): Promise<AssemblyValidationResult> {
  const text = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      profile: {
        productVersion: '',
        profileId: '',
        harnesses: [],
        modules: [],
        components: [],
      },
      issues: [{ path: filePath, message: `invalid JSON: ${message}`, severity: 'error' }],
    };
  }
  return validateAssemblyProfile(parsed);
}

/** 列出启用的模块 id（便于 beta 省略 ai-employees） */
export function enabledModuleIds(profile: AssemblyProfile): string[] {
  return profile.modules.filter((m: AssemblyModule) => m.enabled).map((m) => m.id);
}
