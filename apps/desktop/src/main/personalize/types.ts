/**
 * Unified personalize asset model (PERSONALIZE-MODULE.md §2.2).
 */

export type PersonalizeKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'connector'
  | 'agent'
  | 'doc'
  | 'system';

export type PersonalizeOriginApp =
  | 'gemini'
  | 'claude'
  | 'codex'
  | 'workbuddy'
  | 'cursor'
  | 'xyai'
  | 'openxyos'
  | 'other';

export type PersonalizeAssetSource =
  | 'local-scan'
  | 'import'
  | 'openxyos'
  | 'builtin'
  | 'user';

export type PersonalizeStatus =
  | 'discovered'
  | 'imported'
  | 'installed'
  | 'enabled'
  | 'disabled';

/** List filter source tabs in the UI. */
export type PersonalizeListSource = 'studio' | 'local' | 'openxyos';

export type PersonalAsset = {
  id: string;
  kind: PersonalizeKind;
  name: string;
  source: PersonalizeAssetSource;
  originApp?: PersonalizeOriginApp;
  status: PersonalizeStatus;
  /** Absolute path or relative ref under personalize/; always shown for scan safety. */
  pathOrRef: string;
  manifest?: Record<string, unknown>;
  version?: string;
  interopId?: string;
  /** Optional short description for UI. */
  description?: string;
};

export type ScanProbeEnv = {
  home: string;
  appData: string;
  localAppData: string;
  platform: NodeJS.Platform;
};

export type DiscoveredRaw = Omit<
  PersonalAsset,
  'id' | 'source' | 'status'
> & {
  /** Stable key used to derive id (originApp + kind + path). */
  discoveryKey: string;
};
