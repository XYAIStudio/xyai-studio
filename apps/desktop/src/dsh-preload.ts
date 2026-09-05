/**
 * Narrow bridge for the XYAI-owned DSH development view.
 *
 * The development view remains sandboxed and cannot access Node or arbitrary
 * filesystem APIs. It may only ask the Electron main process to present the
 * user-initiated knowledge-folder chooser.
 */
import { contextBridge, ipcRenderer } from 'electron'

/** Installed program icon as a data URI, resolved synchronously by the
 * main process: the DSH view is sandboxed and cannot touch the filesystem.
 * An empty string means no icon was found; consumers already fall back. */
const appIconDataUri = ipcRenderer.sendSync('xyai:desktop-app-icon-data-uri') as string

function subscribe(channel: string, callback: (value: unknown) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

contextBridge.exposeInMainWorld('xyaiDesktop', {
  appIconDataUri,
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('xyai:pick-directory'),
  // Keep the prior narrow name for already-installed knowledge-base views.
  pickKnowledgeDirectory: (): Promise<string | null> => ipcRenderer.invoke('xyai:pick-directory'),
  mountKnowledgeDirectory: (): Promise<unknown> => ipcRenderer.invoke('xyai:founders-mount-knowledge'),
  renameKnowledgeMount: (id: string, name: string): Promise<void> => ipcRenderer.invoke('xyai:founders-rename-knowledge', id, name),
  unmountKnowledge: (id: string): Promise<void> => ipcRenderer.invoke('xyai:founders-unmount-knowledge', id),
  getFoundersState: (): Promise<unknown> => ipcRenderer.invoke('xyai:founders-state'),
  listKnowledgeChildren: (id: string, path = ''): Promise<unknown> => ipcRenderer.invoke('xyai:founders-list-knowledge-children', id, path),
  // A first conversation must not require a user-selected repository.  The
  // main process owns this private, packaged-app workspace path.
  ensureDefaultWorkspace: (): Promise<string> => ipcRenderer.invoke('xyai:ensure-default-workspace'),
  // Model marketplace: these messages are intentionally scoped to the
  // current XYAI development WebContents and are validated again in main.
  requestHardwareRefresh: (): void => { ipcRenderer.send('xyai:model-marketplace-refresh') },
  requestModelRecommend: (): void => { ipcRenderer.send('xyai:model-marketplace-recommend') },
  requestLocalModels: (): void => { ipcRenderer.send('xyai:model-marketplace-local-models') },
  requestOllamaStatus: (): void => { ipcRenderer.send('xyai:model-marketplace-ollama-status') },
  requestOllamaModels: (): void => { ipcRenderer.send('xyai:model-marketplace-ollama-models') },
  startOllama: (): void => { ipcRenderer.send('xyai:model-marketplace-start-ollama') },
  pullNativeModel: (modelId: string): void => { ipcRenderer.send('xyai:model-marketplace-pull-native', modelId) },
  pullOllamaModel: (modelId: string): void => { ipcRenderer.send('xyai:model-marketplace-pull-ollama', modelId) },
  benchmarkLocalModel: (filePath: string): void => { ipcRenderer.send('xyai:model-marketplace-benchmark', filePath) },
  routeModel: (): void => { ipcRenderer.send('xyai:model-marketplace-route') },
  // Compatibility with the mature model-marketplace client: its initial GPU
  // subscription is the same full hardware snapshot used by the newer bridge.
  onGpuInfo: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-refresh', callback),
  onHardwareRefresh: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-refresh', callback),
  onModelRecommend: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-recommend', callback),
  onLocalModels: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-local-models', callback),
  onOllamaStatus: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-ollama-status', callback),
  onOllamaModels: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-ollama-models', callback),
  onOllamaPullProgress: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-ollama-progress', callback),
  onNativeModelPullProgress: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-native-progress', callback),
  onLocalModelBenchmark: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-benchmark', callback),
  onModelRoute: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-route', callback),
  // Cloud credentials are deliberately left to XYOS tenant settings.  Expose
  // a safe unavailable status so a legacy model-marketplace panel cannot
  // crash or silently persist a secret outside the unified account system.
  requestCredentialStatus: (reference: string): void => { ipcRenderer.send('xyai:model-marketplace-credential-status', reference) },
  setCredential: (reference: string, value: string): void => { ipcRenderer.send('xyai:model-marketplace-credential-set', reference, value) },
  onCredentialStatus: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-credential-status', callback),
  onCredentialSet: (callback: (value: unknown) => void): (() => void) => subscribe('xyai:model-marketplace-credential-set', callback),
})
