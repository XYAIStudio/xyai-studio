/**
 * Construct an AgentRuntime by harness id from the assembly profile.
 * Codex is the only enabled runtime today; dsh/claude return stubs.
 */

import type { AgentRuntime, AssemblyProfile } from '@xyai/contracts';
import {
  CodexAdapter,
  createCodexAdapter,
  type CodexAdapterOptions,
} from '@xyai/adapter-codex';
import { createDshAdapter } from '@xyai/adapter-dsh';
import { createClaudeAdapter } from '@xyai/adapter-claude';
import { getHarnessById, isHarnessEnabled } from '@xyai/core';
import { DEFAULT_STUDIO_ASSEMBLY } from './default-profile.js';

export type KnownHarnessId = 'codex' | 'dsh' | 'claude';

export function isKnownHarnessId(id: string): id is KnownHarnessId {
  return id === 'codex' || id === 'dsh' || id === 'claude';
}

export interface CreateAdapterForHarnessOptions extends CodexAdapterOptions {
  profile?: AssemblyProfile;
}

/**
 * @param harnessId Assembly harness id
 * @param options Codex options (ignored by stubs) + optional profile
 */
export function createAdapterForHarnessId(
  harnessId: string,
  options: CreateAdapterForHarnessOptions = {},
): AgentRuntime {
  const profile = options.profile ?? DEFAULT_STUDIO_ASSEMBLY;
  if (!isKnownHarnessId(harnessId)) {
    throw new Error(`unknown harness id: ${harnessId}`);
  }
  const row = getHarnessById(profile, harnessId);
  if (!row) {
    throw new Error(`harness ${harnessId} is not listed in the assembly profile`);
  }
  switch (harnessId) {
    case 'codex':
      return createCodexAdapter({
        forceMock: options.forceMock,
        binaryPath: options.binaryPath,
        cwd: options.cwd,
        sandbox: options.sandbox,
      });
    case 'dsh':
      return createDshAdapter();
    case 'claude':
      return createClaudeAdapter();
    default: {
      const _never: never = harnessId;
      throw new Error(`unhandled harness id: ${_never}`);
    }
  }
}

/**
 * Host currently drives turns through CodexAdapter APIs (isMock / binary / abort).
 * @param options Codex binary / mock options
 */
export function createCodexHostAdapter(
  options: CreateAdapterForHarnessOptions = {},
): CodexAdapter {
  const runtime = createAdapterForHarnessId('codex', options);
  if (!(runtime instanceof CodexAdapter)) {
    throw new Error('assembly: expected Codex adapter for harness id codex');
  }
  return runtime;
}

/**
 * @param profile Assembly profile
 * @param id Requested harness
 * @returns id when listed; first enabled harness otherwise
 */
export function resolveListedHarnessId(
  profile: AssemblyProfile,
  id: string,
): string {
  if (getHarnessById(profile, id)) return id;
  const firstEnabled = profile.harnesses.find((h) => h.enabled);
  return firstEnabled?.id ?? 'codex';
}

export function harnessEnabledInProfile(
  profile: AssemblyProfile,
  id: string,
): boolean {
  return isHarnessEnabled(profile, id);
}
