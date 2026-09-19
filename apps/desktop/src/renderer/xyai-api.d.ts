export interface CloudProviderConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
}

export interface CloudProvidersSettings {
  openai: CloudProviderConfig;
  deepseek: CloudProviderConfig;
  openrouter: CloudProviderConfig;
  anthropic: CloudProviderConfig;
}

export interface XyaiStatus {
  isMock: boolean;
  binarySource: string | null;
  binaryPath: string | null;
  /** Current modelRef (e.g. codex:gpt-5 / ollama:qwen2.5). */
  modelId?: string;
  forceMock?: boolean;
  engineMode?: 'auto' | 'local-stream' | 'codex-oss' | 'dsh' | 'claude';
  localModelViaHarness?: boolean;
  harnesses?: { id: string; enabled: boolean }[];
  models?: { id: string; label: string; hint?: string }[];
  localModels?: { id: string; label: string; hint?: string }[];
  activeSessionId?: string;
  sessions?: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  }[];
  isSending?: boolean;
  accessMode?: AccessMode;
}

export type AccessMode = 'default' | 'auto' | 'full';

export interface XyaiSettings {
  /** Persisted modelRef used by TurnController. */
  modelId: string;
  forceMock: boolean;
  codexBin: string;
  cloudProviders: CloudProvidersSettings;
  customProviders?: import('./types-custom-provider.js').CustomProvider[];
  accessMode?: AccessMode;
  engineMode?: 'auto' | 'local-stream' | 'codex-oss' | 'dsh' | 'claude';
  localModelViaHarness?: boolean;
}

export interface XyaiAgentEvent {
  type: string;
  timestamp: string;
  sessionId: string;
  taskId?: string;
  payload?: unknown;
}


export type CollabSessionKind = 'dm' | 'group';

export type CollabSessionMeta = {
  sessionId: string;
  kind: CollabSessionKind;
  projectId: string;
  taskId: string;
  agentIds: string[];
  title?: string;
};

export type CollabTask = {
  id: string;
  projectId: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CollabProject = {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
};

export type CollabRailState = {
  version: 1;
  projects: CollabProject[];
  tasks: CollabTask[];
  sessions: CollabSessionMeta[];
  collapsedProjects: string[];
  collapsedTasks: string[];
};


export type KbKind = 'local' | 'cloud';
export type CloudKbProviderId = 'ima' | 'http';

export type KbMount = {
  id: string;
  kind: KbKind;
  name: string;
  sourceRoot?: string;
  indexRoot: string;
  provider?: CloudKbProviderId;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeStoresState = {
  version: 1;
  mounts: KbMount[];
  defaultIndexRoot: string;
};

export type KbCitation = {
  id: string;
  kbId: string;
  title: string;
  relativePath: string;
  sourcePath: string;
  sourceUrl?: string;
  openHref: string;
  snippet: string;
};

export type KbPreviewResult = {
  ok: boolean;
  kind: string;
  filename: string;
  relativePath: string;
  ext: string;
  sizeBytes: number;
  summary?: string;
  html?: string;
  text?: string;
  base64?: string;
  /** Streamed custom-protocol URL for large PDFs */
  previewUrl?: string;
  openPath?: string;
  mime?: string;
  parseStatus?: string;
  warn?: string;
  message?: string;
};

export type KbParseableFile = {
  path: string;
  relativePath: string;
  name: string;
  ext: string;
  sizeBytes: number;
  mtimeMs: number;
};

export type InteropAssetKind =
  | 'agent'
  | 'knowledge-mount'
  | 'model-provider'
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'connector';

export type InteropAsset = {
  id: string;
  kind: InteropAssetKind;
  name: string;
  description?: string;
  payload: Record<string, unknown>;
  direction: 'dev-to-biz' | 'biz-to-dev';
  status: 'pending' | 'installed' | 'selected';
  createdAt: string;
  updatedAt: string;
  sourceSpace: 'dev' | 'biz';
};

export interface XyaiApi {
  getStatus(): Promise<XyaiStatus>;
  getSettings?: () => Promise<{ settings: XyaiSettings; status: XyaiStatus }>;
  setSettings?: (
    partial: Partial<XyaiSettings>,
  ) => Promise<{ settings: XyaiSettings; status: XyaiStatus }>;
  testCustomProvider?: (
    draft: import('./types-custom-provider.js').CustomProvider,
  ) => Promise<{ ok: boolean; message: string }>;
  fetchCustomProviderModels?: (
    draft: import('./types-custom-provider.js').CustomProvider,
  ) => Promise<{
    ok: boolean;
    message: string;
    models?: { id: string; label: string }[];
  }>;
  listSessions?: () => Promise<NonNullable<XyaiStatus['sessions']>>;
  createSession?: (
    title?: string,
  ) => Promise<{
    session: NonNullable<XyaiStatus['sessions']>[number];
    status: XyaiStatus;
  }>;
  switchSession?: (
    id: string,
  ) => Promise<{ ok: boolean; status: XyaiStatus }>;
  deleteSession?: (
    id: string,
  ) => Promise<{ ok: boolean; status: XyaiStatus }>;
  sendMessage(content: string): Promise<{ ok: true }>;
  stopTurn?: () => Promise<{ ok: boolean }>;
  onEvent(callback: (event: XyaiAgentEvent) => void): () => void;
  modelSnapshot(input?: {
    extraRoots?: string[];
    mode?: 'common' | 'manual' | 'full';
    fullDisk?: boolean;
  }): Promise<any>;
  pickModelScanDir?: () => Promise<{ ok: boolean; path: string }>;
  registerModel?: (input: {
    id?: string;
    displayName?: string;
    source?: string;
    path?: string;
  }) => Promise<{ ok: boolean; message: string; status?: XyaiStatus }>;
  speedTestModel?: (
    modelRef: string,
    options?: { force?: boolean },
  ) => Promise<{
    ok: boolean;
    message: string;
    tokensPerSec?: number;
    elapsedMs?: number;
    evalCount?: number;
    cached?: boolean;
  }>;
  hardwareUsage?(): Promise<{
    ramTotalMb: number;
    ramUsedMb: number;
    ramUsedPct: number;
    gpus: {
      name: string;
      vramTotalMb: number | null;
      vramUsedMb: number | null;
      vramUsedPct: number | null;
      utilizationPct: number | null;
    }[];
    pressure: 'ok' | 'elevated' | 'critical';
    gpuAccelHint?: string;
    collectedAt: string;
  }>;
  installModelDep(): Promise<{ ok: boolean; message: string }>;
  startOllama?(): Promise<{
    ok: boolean;
    running: boolean;
    started: boolean;
    message: string;
    status?: XyaiStatus;
  }>;
  pullModel(name: string): Promise<{ ok: boolean; message: string }>;
  onPullProgress(
    callback: (data: { name: string; line: string }) => void,
  ): () => void;
  collabGet?: () => Promise<CollabRailState>;
  collabProjectCreate?: (input: {
    name: string;
    cwd?: string;
  }) => Promise<CollabRailState>;
  collabProjectUpdate?: (input: {
    id: string;
    name?: string;
    cwd?: string;
  }) => Promise<CollabRailState>;
  collabProjectDelete?: (input: { id: string }) => Promise<CollabRailState>;
  collabTaskCreate?: (input: {
    projectId: string;
    name: string;
  }) => Promise<CollabRailState>;
  collabTaskUpdate?: (input: {
    id: string;
    name?: string;
    archived?: boolean;
  }) => Promise<CollabRailState>;
  collabTaskDelete?: (input: { id: string }) => Promise<CollabRailState>;
  collabSessionUpsert?: (meta: CollabSessionMeta) => Promise<CollabRailState>;
  collabSessionRemove?: (input: {
    sessionId: string;
  }) => Promise<CollabRailState>;
  collabSetCollapsed?: (input: {
    projectId?: string;
    taskId?: string;
    collapsed: boolean;
  }) => Promise<CollabRailState>;
  collabPickDirectory?: () => Promise<{ ok: boolean; path: string }>;
  studioWorkspacePath?: () => Promise<{ path: string }>;
  pickFiles?: () => Promise<{ ok: boolean; paths: string[] }>;
  openExternal?: (url: string) => Promise<{ ok: boolean; message?: string }>;

  kbGetState?: () => Promise<KnowledgeStoresState>;
  kbSetIndexDir?: (input: {
    indexRoot: string;
    kbId?: string;
  }) => Promise<{
    ok: boolean;
    state: KnowledgeStoresState;
    message?: string;
  }>;
  kbPickDirectory?: (title?: string) => Promise<{ ok: boolean; path: string }>;
  kbMountLocal?: (input: {
    sourceRoot: string;
    name?: string;
    indexRoot?: string;
  }) => Promise<KnowledgeStoresState>;
  kbMountCloud?: (input: {
    name: string;
    provider: CloudKbProviderId;
    config: {
      baseUrl?: string;
      clientId?: string;
      apiKey?: string;
      knowledgeBaseId?: string;
      useMock?: boolean;
      extra?: Record<string, string>;
    };
    indexRoot?: string;
  }) => Promise<KnowledgeStoresState>;
  kbMountIma?: (input: {
    name?: string;
    clientId: string;
    apiKey: string;
    knowledgeBaseId: string;
    baseUrl?: string;
    indexRoot?: string;
    useMock?: boolean;
  }) => Promise<KnowledgeStoresState>;
  kbListImaBases?: (input: {
    clientId: string;
    apiKey: string;
    baseUrl?: string;
    query?: string;
  }) => Promise<{
    ok: boolean;
    bases: { id: string; title: string }[];
    message?: string;
  }>;
  kbUnmount?: (kbId: string) => Promise<KnowledgeStoresState>;
  kbListFiles?: (kbId: string) => Promise<{
    ok: boolean;
    files: KbParseableFile[];
    skipped: { path: string; reason: string }[];
    indexedRelativePaths?: string[];
    message?: string;
    statusTip?: string;
  }>;
  kbListCloud?: (kbId: string) => Promise<{
    ok: boolean;
    files: {
      id: string;
      name: string;
      path: string;
      url?: string;
      mock?: boolean;
    }[];
    stub: boolean;
    message?: string;
  }>;
  kbStartParse?: (kbId: string) => Promise<unknown>;
  kbStopParse?: (kbId: string) => Promise<unknown>;
  kbParseJob?: (kbId: string) => Promise<unknown>;
  kbSaveDistill?: (
    kbId: string,
    outDir: string,
  ) => Promise<{
    ok: boolean;
    message?: string;
    outDir?: string;
    digestPath?: string;
    mode?: string;
    model?: string | null;
  }>;
  kbSaveNote?: (input: {
    kbId?: string;
    destDir?: string;
    filename: string;
    markdown: string;
  }) => Promise<{ ok: boolean; path?: string; message?: string }>;
  clipboardWrite?: (input: {
    text: string;
    html?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  chatListTargets?: () => Promise<{
    ok: boolean;
    sessions: NonNullable<XyaiStatus['sessions']>;
    personalizeAgents: { id: string; name: string; hint?: string }[];
    multiWindow: boolean;
  }>;
  kbPreviewFile?: (input: {
    kbId: string;
    path: string;
    relativePath?: string;
    parseStatus?: string;
  }) => Promise<KbPreviewResult>;
  onKbParseProgress?: (callback: (job: unknown) => void) => () => void;
  kbSearch?: (input: {
    kbIds: string[];
    query: string;
    limit?: number;
  }) => Promise<{
    hits: unknown[];
    citations: KbCitation[];
    context: string;
    emptyIndexNames?: string[];
    emptyIndexNotes?: string[];
  }>;
  kbGetCitations?: (input: {
    kbIds: string[];
    query: string;
    limit?: number;
  }) => Promise<{ citations: KbCitation[] }>;
  kbOpenCitation?: (input: {
    sourcePath?: string;
    openHref?: string;
    showInFolder?: boolean;
  }) => Promise<{ ok: boolean; message?: string }>;
  extractAttachment?: (
    filePath: string,
  ) => Promise<{ ok: boolean; text: string; message?: string; warn?: string }>;
  interopListOutgoing?: () => Promise<InteropAsset[]>;
  interopListIncoming?: () => Promise<InteropAsset[]>;
  interopListPendingBiz?: () => Promise<InteropAsset[]>;
  interopListInstalledBiz?: () => Promise<InteropAsset[]>;
  interopListInstalledDev?: () => Promise<InteropAsset[]>;
  interopPushToBiz?: (input: {
    id?: string;
    kind: InteropAssetKind;
    name: string;
    description?: string;
    payload?: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    asset?: InteropAsset;
    message?: string;
    publishOk?: boolean;
    publishMessage?: string;
  }>;
  interopPushToDev?: (input: {
    kind: InteropAssetKind;
    name: string;
    description?: string;
    payload?: Record<string, unknown>;
  }) => Promise<{ ok: boolean; asset?: InteropAsset; message?: string }>;
  interopInstall?: (
    assetId: string,
  ) => Promise<{
    ok: boolean;
    asset?: InteropAsset;
    message?: string;
    publishOk?: boolean;
    publishMessage?: string;
  }>;
  interopRegisterDev?: (
    assetId: string,
  ) => Promise<{ ok: boolean; asset?: InteropAsset; message?: string }>;
  interopSelect?: (
    assetId: string,
    space: 'dev' | 'biz',
  ) => Promise<{
    ok: boolean;
    asset?: InteropAsset;
    message?: string;
    publishOk?: boolean;
    publishMessage?: string;
  }>;

  personalizeList?: (input?: {
    kind?: string;
    source?: string;
  }) => Promise<{ ok: boolean; items: unknown[]; kind: string; source: string }>;
  personalizeScan?: (input?: {
    kind?: string;
    extraRoots?: string[];
  }) => Promise<{
    ok: boolean;
    items: unknown[];
    scannedAt: string;
    rootsProbed: number;
    kind: string;
  }>;
  personalizeImport?: (input: {
    id: string;
  }) => Promise<{ ok: boolean; asset?: unknown; message?: string }>;
  personalizeInstall?: (input: {
    id: string;
  }) => Promise<{ ok: boolean; asset?: unknown; message?: string }>;
  personalizeSetEnabled?: (input: {
    id: string;
    enabled: boolean;
  }) => Promise<{ ok: boolean; asset?: unknown; message?: string }>;

  assetRegistryList?: (input?: {
    space?: 'dev' | 'biz';
    kind?: string;
    origin?: 'personalize' | 'workspace' | 'openxyos';
  }) => Promise<{ ok: boolean; items: unknown[] }>;
  assetRegistryGet?: (
    id: string,
  ) => Promise<{ ok: boolean; item?: unknown }>;
  assetRegistryPromote?: (
    id: string,
  ) => Promise<{ ok: boolean; noop?: boolean; item?: unknown; message?: string }>;

    openXyosResolve?: () => Promise<{
    ok: boolean;
    root: string;
    url?: string;
    mode: string;
    message: string;
    canOpenFolder: boolean;
  }>;
  openXyosRestartServices?: () => Promise<{
    ok: boolean;
    root: string;
    url?: string;
    mode: string;
    message: string;
    canOpenFolder: boolean;
  }>;
  openXyosOpenFolder?: () => Promise<{ ok: boolean; message?: string }>;
}

declare global {
  interface Window {
    xyai: XyaiApi;
  }
}

export {};
