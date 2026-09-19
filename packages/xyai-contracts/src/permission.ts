/** Approval policy only. Never used to choose chat vs tools routing. */

/** Core approval policy (Cindy-shaped; XYAI omits the long `bypassPermissions` name). */
export type PermissionMode = 'ask' | 'default' | 'auto' | 'bypass';

/**
 * Persisted composer 「使用权限」 chip.
 * Maps onto PermissionMode: default/auto/full → default/auto/bypass.
 * There is no chip for `ask` yet.
 */
export type AccessMode = 'default' | 'auto' | 'full';

export const PERMISSION_MODES = ['ask', 'default', 'auto', 'bypass'] as const;
export const ACCESS_MODES = ['default', 'auto', 'full'] as const;

/**
 * @param v Unknown persisted or IPC value
 * @returns A valid PermissionMode; unknown values become `default`
 */
export function normalizePermissionMode(v: unknown): PermissionMode {
  if (v === 'ask' || v === 'default' || v === 'auto' || v === 'bypass') return v;
  return 'default';
}

/**
 * @param v Unknown persisted or IPC value
 * @returns A valid AccessMode; unknown values become `default`
 */
export function normalizeAccessMode(v: unknown): AccessMode {
  if (v === 'default' || v === 'auto' || v === 'full') return v;
  return 'default';
}

/**
 * Map the persisted chip onto Core approval policy.
 * `full` → `bypass`; `default` / `auto` stay. `ask` has no chip.
 * @param mode Composer accessMode
 * @returns PermissionMode used as approval policy only
 */
export function accessModeToPermissionMode(mode: AccessMode): PermissionMode {
  if (mode === 'full') return 'bypass';
  return mode;
}

/**
 * Map Core approval policy back onto the persisted chip.
 * `bypass` → `full`; `ask` has no chip so it becomes `default`.
 * @param mode Core PermissionMode
 * @returns AccessMode for settings / UI
 */
export function permissionModeToAccessMode(mode: PermissionMode): AccessMode {
  if (mode === 'bypass') return 'full';
  if (mode === 'ask') return 'default';
  return mode;
}
