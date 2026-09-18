/**
 * Preload — contextBridge safe API for the renderer.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

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
  modelId: string;
  forceMock: boolean;
  models: { id: string; label: string }[];
  localModels: { id: string; label: string }[];
  activeSessionId: string;
  sessions: { id: string; title: string; createdAt: string; updatedAt: string }[];
  isSending: boolean;
  accessMode?: AccessMode;
}

export type AccessMode = 'default' | 'auto' | 'full';

export interface XyaiSettings {
  modelId: string;
  forceMock: boolean;
  codexBin: string;
  cloudProviders: CloudProvidersSettings;
  accessMode: AccessMode;
}

export interface XyaiAgentEvent {
  type: string;
  timestamp: string;
  sessionId: string;
  taskId?: string;
  payload?: unknown;
}


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

const api = {
  getStatus: (): Promise<XyaiStatus> => ipcRenderer.invoke('xyai:status'),

  getSettings: (): Promise<{ settings: XyaiSettings; status: XyaiStatus }> =>
    ipcRenderer.invoke('xyai:get-settings'),

  setSettings: (
    partial: Partial<XyaiSettings>,
  ): Promise<{ settings: XyaiSettings; status: XyaiStatus }> =>
    ipcRenderer.invoke('xyai:set-settings', partial),

  testCustomProvider: (
    draft: Record<string, unknown>,
  ): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('xyai:custom-provider-test', draft),

  fetchCustomProviderModels: (
    draft: Record<string, unknown>,
  ): Promise<{ ok: boolean; message: string; models: { id: string; label: string }[] }> =>
    ipcRenderer.invoke('xyai:custom-provider-fetch-models', draft),

  listSessions: (): Promise<XyaiStatus['sessions']> =>
    ipcRenderer.invoke('xyai:sessions-list'),

  createSession: (
    title?: string,
  ): Promise<{ session: XyaiStatus['sessions'][number]; status: XyaiStatus }> =>
    ipcRenderer.invoke('xyai:session-create', { title }),

  switchSession: (
    id: string,
  ): Promise<{ ok: boolean; status: XyaiStatus }> =>
    ipcRenderer.invoke('xyai:session-switch', { id }),

  deleteSession: (
    id: string,
  ): Promise<{ ok: boolean; status: XyaiStatus }> =>
    ipcRenderer.invoke('xyai:session-delete', { id }),

  modelSnapshot: (): Promise<unknown> => ipcRenderer.invoke('xyai:model-snapshot'),

  hardwareUsage: (): Promise<unknown> => ipcRenderer.invoke('xyai:hardware-usage'),

  installModelDep: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('xyai:model-install-dep'),

  startOllama: (): Promise<{
    ok: boolean;
    running: boolean;
    started: boolean;
    message: string;
    status?: XyaiStatus;
  }> => ipcRenderer.invoke('xyai:model-start-ollama'),

  pullModel: (name: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('xyai:model-pull', { name }),

  onPullProgress: (
    callback: (data: { name: string; line: string }) => void,
  ): (() => void) => {
    const listener = (
      _event: IpcRendererEvent,
      data: { name: string; line: string },
    ): void => {
      callback(data);
    };
    ipcRenderer.on('xyai:model-pull-progress', listener);
    return () => {
      ipcRenderer.removeListener('xyai:model-pull-progress', listener);
    };
  },

  sendMessage: (content: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke('xyai:chat-send', { content }),

  stopTurn: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('xyai:chat-stop'),

  onEvent: (callback: (event: XyaiAgentEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: XyaiAgentEvent): void => {
      callback(data);
    };
    ipcRenderer.on('xyai:chat-event', listener);
    return () => {
      ipcRenderer.removeListener('xyai:chat-event', listener);
    };
  },

  collabGet: (): Promise<unknown> => ipcRenderer.invoke('xyai:collab-get'),

  collabProjectCreate: (input: {
    name: string;
    cwd?: string;
  }): Promise<unknown> => ipcRenderer.invoke('xyai:collab-project-create', input),

  collabProjectUpdate: (input: {
    id: string;
    name?: string;
    cwd?: string;
  }): Promise<unknown> => ipcRenderer.invoke('xyai:collab-project-update', input),

  collabProjectDelete: (input: { id: string }): Promise<unknown> =>
    ipcRenderer.invoke('xyai:collab-project-delete', input),

  collabTaskCreate: (input: {
    projectId: string;
    name: string;
  }): Promise<unknown> => ipcRenderer.invoke('xyai:collab-task-create', input),

  collabTaskUpdate: (input: {
    id: string;
    name?: string;
    archived?: boolean;
  }): Promise<unknown> => ipcRenderer.invoke('xyai:collab-task-update', input),

  collabTaskDelete: (input: { id: string }): Promise<unknown> =>
    ipcRenderer.invoke('xyai:collab-task-delete', input),

  collabSessionUpsert: (meta: {
    sessionId: string;
    kind: 'dm' | 'group';
    projectId: string;
    taskId: string;
    agentIds: string[];
    title?: string;
  }): Promise<unknown> => ipcRenderer.invoke('xyai:collab-session-upsert', meta),

  collabSessionRemove: (input: { sessionId: string }): Promise<unknown> =>
    ipcRenderer.invoke('xyai:collab-session-remove', input),

  collabSetCollapsed: (input: {
    projectId?: string;
    taskId?: string;
    collapsed: boolean;
  }): Promise<unknown> => ipcRenderer.invoke('xyai:collab-set-collapsed', input),

  collabPickDirectory: (): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke('xyai:collab-pick-directory'),

  pickFiles: (): Promise<{ ok: boolean; paths: string[] }> =>
    ipcRenderer.invoke('xyai:pick-files'),

  openExternal: (url: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('xyai:open-external', { url }),

  // —— Knowledge base ——
  kbGetState: (): Promise<KnowledgeStoresState> =>
    ipcRenderer.invoke('xyai:kb-get-state'),

  kbSetIndexDir: (input: {
    indexRoot: string;
    kbId?: string;
  }): Promise<{
    ok: boolean;
    state: KnowledgeStoresState;
    message?: string;
  }> => ipcRenderer.invoke('xyai:kb-set-index-dir', input),

  kbPickDirectory: (title?: string): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke('xyai:kb-pick-directory', { title }),

  kbMountLocal: (input: {
    sourceRoot: string;
    name?: string;
    indexRoot?: string;
  }): Promise<KnowledgeStoresState> =>
    ipcRenderer.invoke('xyai:kb-mount-local', input),

  kbMountCloud: (input: {
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
  }): Promise<KnowledgeStoresState> =>
    ipcRenderer.invoke('xyai:kb-mount-cloud', input),

  kbMountIma: (input: {
    name?: string;
    clientId: string;
    apiKey: string;
    knowledgeBaseId: string;
    baseUrl?: string;
    indexRoot?: string;
    useMock?: boolean;
  }): Promise<KnowledgeStoresState> =>
    ipcRenderer.invoke('xyai:kb-mount-ima', input),

  kbListImaBases: (input: {
    clientId: string;
    apiKey: string;
    baseUrl?: string;
    query?: string;
  }): Promise<{
    ok: boolean;
    bases: { id: string; title: string }[];
    message?: string;
  }> => ipcRenderer.invoke('xyai:kb-list-ima-bases', input),

  kbUnmount: (kbId: string): Promise<KnowledgeStoresState> =>
    ipcRenderer.invoke('xyai:kb-unmount', { kbId }),

  kbListFiles: (
    kbId: string,
  ): Promise<{
    ok: boolean;
    files: {
      path: string;
      relativePath: string;
      name: string;
      ext: string;
      sizeBytes: number;
      mtimeMs: number;
    }[];
    skipped: { path: string; reason: string }[];
    indexedRelativePaths?: string[];
    message?: string;
    statusTip?: string;
  }> => ipcRenderer.invoke('xyai:kb-list-files', { kbId }),

  kbListCloud: (
    kbId: string,
  ): Promise<{
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
  }> => ipcRenderer.invoke('xyai:kb-list-cloud', { kbId }),

  kbStartParse: (kbId: string): Promise<unknown> =>
    ipcRenderer.invoke('xyai:kb-start-parse', { kbId }),

  kbStopParse: (kbId: string): Promise<unknown> =>
    ipcRenderer.invoke('xyai:kb-stop-parse', { kbId }),

  kbParseJob: (kbId: string): Promise<unknown> =>
    ipcRenderer.invoke('xyai:kb-parse-job', { kbId }),

  kbSaveDistill: (
    kbId: string,
    outDir: string,
  ): Promise<{
    ok: boolean;
    message?: string;
    outDir?: string;
    digestPath?: string;
    mode?: string;
    model?: string | null;
  }> => ipcRenderer.invoke('xyai:kb-save-distill', { kbId, outDir }),


  kbPreviewFile: (input: {
    kbId: string;
    path: string;
    relativePath?: string;
    parseStatus?: string;
  }): Promise<{
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
    mime?: string;
    parseStatus?: string;
    warn?: string;
    message?: string;
  }> => ipcRenderer.invoke('xyai:kb-preview-file', input),

  onKbParseProgress: (callback: (job: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, job: unknown): void => {
      callback(job);
    };
    ipcRenderer.on('xyai:kb-parse-progress', listener);
    return () => {
      ipcRenderer.removeListener('xyai:kb-parse-progress', listener);
    };
  },

  kbSearch: (input: {
    kbIds: string[];
    query: string;
    limit?: number;
  }): Promise<{
    hits: unknown[];
    citations: KbCitation[];
    context: string;
    emptyIndexNames: string[];
  }> => ipcRenderer.invoke('xyai:kb-search', input),

  kbGetCitations: (input: {
    kbIds: string[];
    query: string;
    limit?: number;
  }): Promise<{ citations: KbCitation[] }> =>
    ipcRenderer.invoke('xyai:kb-get-citations', input),

  kbOpenCitation: (input: {
    sourcePath?: string;
    openHref?: string;
    showInFolder?: boolean;
  }): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('xyai:kb-open-citation', input),

  extractAttachment: (
    filePath: string,
  ): Promise<{ ok: boolean; text: string; message?: string; warn?: string }> =>
    ipcRenderer.invoke('xyai:extract-attachment', { path: filePath }),


  interopListOutgoing: (): Promise<unknown[]> =>
    ipcRenderer.invoke('xyai:interop-list-outgoing'),
  interopListIncoming: (): Promise<unknown[]> =>
    ipcRenderer.invoke('xyai:interop-list-incoming'),
  interopListPendingBiz: (): Promise<unknown[]> =>
    ipcRenderer.invoke('xyai:interop-list-pending-biz'),
  interopListInstalledBiz: (): Promise<unknown[]> =>
    ipcRenderer.invoke('xyai:interop-list-installed-biz'),
  interopListInstalledDev: (): Promise<unknown[]> =>
    ipcRenderer.invoke('xyai:interop-list-installed-dev'),
  interopPushToBiz: (input: {
    kind: 'agent' | 'knowledge-mount' | 'model-provider';
    name: string;
    description?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:interop-push-to-biz', input),
  interopPushToDev: (input: {
    kind: 'agent' | 'knowledge-mount' | 'model-provider';
    name: string;
    description?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:interop-push-to-dev', input),
  interopInstall: (
    assetId: string,
  ): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:interop-install', { assetId }),
  interopRegisterDev: (
    assetId: string,
  ): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:interop-register-dev', { assetId }),
  interopSelect: (
    assetId: string,
    space: 'dev' | 'biz',
  ): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:interop-select', { assetId, space }),

  personalizeList: (input?: {
    kind?: string;
    source?: string;
  }): Promise<{ ok: boolean; items: unknown[]; kind: string; source: string }> =>
    ipcRenderer.invoke('xyai:personalize-list', input || {}),
  personalizeScan: (input?: {
    kind?: string;
    extraRoots?: string[];
  }): Promise<{
    ok: boolean;
    items: unknown[];
    scannedAt: string;
    rootsProbed: number;
    kind: string;
  }> => ipcRenderer.invoke('xyai:personalize-scan', input || {}),
  personalizeImport: (input: {
    id: string;
  }): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:personalize-import', input),
  personalizeInstall: (input: {
    id: string;
  }): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:personalize-install', input),
  personalizeSetEnabled: (input: {
    id: string;
    enabled: boolean;
  }): Promise<{ ok: boolean; asset?: unknown; message?: string }> =>
    ipcRenderer.invoke('xyai:personalize-set-enabled', input),

    openXyosResolve: (): Promise<{
    ok: boolean;
    root: string;
    url?: string;
    mode: string;
    message: string;
    canOpenFolder: boolean;
  }> => ipcRenderer.invoke('xyai:openxyos-resolve'),

  openXyosRestartServices: (): Promise<{
    ok: boolean;
    root: string;
    url?: string;
    mode: string;
    message: string;
    canOpenFolder: boolean;
  }> => ipcRenderer.invoke('xyai:openxyos-restart-services'),

  openXyosOpenFolder: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('xyai:openxyos-open-folder'),
};

contextBridge.exposeInMainWorld('xyai', api);

export type XyaiApi = typeof api;
