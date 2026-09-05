/** XYAI Studio desktop — preload：为窗口 shell 暴露空间切换，为浏览器工具栏暴露多标签/收藏夹 IPC。 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('xyosShell', {
  /** 请求主进程切换空间（'dev' | 'biz' | 'eco' | 'browser' | 'about'）。 */
  switch: (space: string): void => {
    ipcRenderer.send('xyos:switch', space)
  },
  /** 订阅主进程的空间变更通知。 */
  onSpaceChange: (callback: (space: string) => void): void => {
    ipcRenderer.on('xyos:space-changed', (_event, space: string) => callback(space))
  },
  /** 读取当前全局亮/暗主题状态。 */
  getTheme: (): Promise<unknown> => ipcRenderer.invoke('xyai:theme-get'),
  /** 循环切换：跟随系统 → 亮色 → 暗色。 */
  cycleTheme: (): Promise<unknown> => ipcRenderer.invoke('xyai:theme-cycle'),
  /** 订阅主题变更（preference + dark）。 */
  onThemeChange: (callback: (state: unknown) => void): void => {
    ipcRenderer.on('xyai:theme-changed', (_event, state: unknown) => callback(state))
  },
})

contextBridge.exposeInMainWorld('xyosBrowser', {
  /** 新建浏览器标签页。 */
  newTab: (): void => { ipcRenderer.send('xyos:browser-new-tab') },
  /** 关闭指定标签页。 */
  closeTab: (id: number): void => { ipcRenderer.send('xyos:browser-close-tab', id) },
  /** 激活指定标签页。 */
  activateTab: (id: number): void => { ipcRenderer.send('xyos:browser-activate-tab', id) },
  /** 当前标签页导航到地址。 */
  navigate: (url: string): void => { ipcRenderer.send('xyos:browser-navigate', url) },
  back: (): void => { ipcRenderer.send('xyos:browser-back') },
  forward: (): void => { ipcRenderer.send('xyos:browser-forward') },
  reload: (): void => { ipcRenderer.send('xyos:browser-reload') },
  home: (): void => { ipcRenderer.send('xyos:browser-home') },
  /** 收藏当前标签页。 */
  addBookmark: (): void => { ipcRenderer.send('xyos:browser-bookmark-add') },
  removeBookmark: (url: string): void => { ipcRenderer.send('xyos:browser-bookmark-remove', url) },
  /** 在当前标签页打开收藏的地址。 */
  openBookmark: (url: string): void => { ipcRenderer.send('xyos:browser-bookmark-open', url) },
  /** 订阅浏览器状态（标签 / 收藏夹 / 当前地址）。 */
  onState: (callback: (state: unknown) => void): void => {
    ipcRenderer.on('xyos:browser-state', (_event, state: unknown) => callback(state))
  },
})

/** Narrow bridge for the XYAI-owned Founders navigation.  The renderer never
 * receives filesystem paths, tokens, provider keys, or process controls. */
contextBridge.exposeInMainWorld('xyaiFounders', {
  selectModule: (module: string): void => { ipcRenderer.send('xyai:founders-select-module', module) },
  getState: (): Promise<unknown> => ipcRenderer.invoke('xyai:founders-state'),
  onState: (callback: (state: unknown) => void): void => {
    ipcRenderer.on('xyai:founders-state', (_event, state: unknown) => callback(state))
  },
  importTasks: (): Promise<void> => ipcRenderer.invoke('xyai:founders-import-tasks'),
  importKnowledge: (): Promise<void> => ipcRenderer.invoke('xyai:founders-import-knowledge'),
  mountKnowledge: (): Promise<unknown> => ipcRenderer.invoke('xyai:founders-mount-knowledge'),
  /** 向导式挂接：只弹出目录选择框，不产生任何挂接副作用。 */
  knowledgePickDirectory: (): Promise<string | null> => ipcRenderer.invoke('xyai:founders-knowledge-pick-dir'),
  /** 向导式挂接：对候选路径做只读预检（存在/可读/是否已挂接），不改变任何状态。 */
  knowledgePrecheck: (rootPath: string): Promise<unknown> => ipcRenderer.invoke('xyai:founders-knowledge-precheck', rootPath),
  /** 向导式挂接：确认后按用户给定的文件夹路径挂接并立即启动解析。 */
  knowledgeMountPath: (rootPath: string): Promise<unknown> => ipcRenderer.invoke('xyai:founders-knowledge-mount-path', rootPath),
  listKnowledgeChildren: (id: string, relativePath?: string): Promise<unknown> => ipcRenderer.invoke('xyai:founders-list-knowledge-children', id, relativePath),
  readMountedKnowledge: (id: string, relativePath: string): Promise<string> => ipcRenderer.invoke('xyai:founders-read-mounted-knowledge', id, relativePath),
  unmountKnowledge: (id: string): Promise<void> => ipcRenderer.invoke('xyai:founders-unmount-knowledge', id),
  knowledgeParseFiles: (id: string): Promise<unknown> => ipcRenderer.invoke('xyai:knowledge-parse-files', id),
  knowledgeParseRefresh: (id: string): Promise<boolean> => ipcRenderer.invoke('xyai:knowledge-parse-refresh', id),
  knowledgeParseRetryFailed: (id: string): Promise<number> => ipcRenderer.invoke('xyai:knowledge-parse-retry-failed', id),
  knowledgeParsePreview: (id: string, relativePath: string): Promise<string | undefined> => ipcRenderer.invoke('xyai:knowledge-parse-preview', id, relativePath),
  createProduction: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:founders-create-production', input),
  registerPlugin: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:founders-register-plugin', input),
  createFactoryProject: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:factory-create-project', input),
  selectFactoryProject: (projectId: string): Promise<void> => ipcRenderer.invoke('xyai:factory-select-project', projectId),
  saveFactoryContract: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:factory-save-contract', input),
  createFactoryAsset: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:factory-create-asset', input),
  createFactoryAgent: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:factory-create-agent', input),
  generateCustomAgent: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:custom-agent-generate', input),
  getCustomAgentJob: (id: string): Promise<unknown> => ipcRenderer.invoke('xyai:custom-agent-job', id),
  sendFactoryFeedback: (input: unknown): Promise<void> => ipcRenderer.invoke('xyai:factory-feedback', input),
  authenticate: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:founders-authenticate', input),  /** W-105 本地知识问答：发送问题，主进程流式推送事件并在结束时返回答案摘要。 */
  knowledgeChatAsk: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:knowledge-chat-ask', input),
  /** W-105 订阅知识问答流式事件（start/delta/sources/done），返回退订函数。 */
  knowledgeChatStream: (callback: (payload: unknown) => void): (() => void) => {
    const listener = (_event: { readonly sender: unknown }, payload: unknown): void => callback(payload)
    ipcRenderer.on('xyai:knowledge-chat-event', listener)
    return (): void => { ipcRenderer.removeListener('xyai:knowledge-chat-event', listener) }
  },
  /** W-105b 叠加层：展开/收起并让主进程同步尺寸。 */
  kbMentionToggle: (): void => { ipcRenderer.send('xyai:kb-mention-toggle') },
  kbMentionClose: (): void => { ipcRenderer.send('xyai:kb-mention-close') },
  kbMentionOnReset: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('xyai:kb-mention-reset', listener)
    return (): void => { ipcRenderer.removeListener('xyai:kb-mention-reset', listener) }
  },
  /** W-201 本机模型就绪度。 */
  knowledgeChatModelStatus: (): Promise<unknown> => ipcRenderer.invoke('xyai:knowledge-chat-model-status'),
  knowledgeChatModelRefresh: (): Promise<unknown> => ipcRenderer.invoke('xyai:knowledge-chat-model-refresh'),
  /** W-106 ima 云知识库：保存凭据（系统级加密，凭据永不下发渲染进程）。 */
  imaConfigure: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:ima-configure', input),
  imaListKnowledgeBases: (): Promise<unknown> => ipcRenderer.invoke('xyai:ima-list-knowledge-bases'),
  imaMount: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:ima-mount', input),
  imaUnmount: (id: string): Promise<void> => ipcRenderer.invoke('xyai:ima-unmount', id),
  imaListItems: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:ima-list-items', input),
  imaReadItem: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:ima-read-item', input),
  /** W-106 ima 工具调用（读/查/写/导入能力，按官方接口边界诚实降级）。 */
  imaTool: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:ima-tool', input),
  imaUploadLocalFiles: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:ima-upload-local-files', input),
  /** 能力中心：全量重扫本机各智能体的插件/技能并广播新清单。 */
  agentCatalogRefresh: (): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-catalog-refresh'),
  /** 能力中心：把某个已识别技能目录安装到目标软件技能根。 */
  agentSkillInstall: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-skill-install', input),
  /** 能力中心：从目标软件技能根移除指定技能目录。 */
  agentSkillRemove: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-skill-remove', input),
  /** 能力中心：把已识别插件导入到本应用 plugins/imported。 */
  agentPluginInstall: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-plugin-install', input),
  /** 能力中心：移除本应用导入的插件副本。 */
  agentPluginRemove: (input: unknown): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-plugin-remove', input),
  /** 能力中心：选择本机 Skills 文件夹并导入。 */
  agentSkillImportLocal: (): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-skill-import-local'),
  /** 能力中心：选择本机插件文件夹并导入。 */
  agentPluginImportLocal: (): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-plugin-import-local'),
  /** 能力中心：打开已识别能力所在的目录（主进程校验白名单）。 */
  agentOpenPath: (path: string): Promise<unknown> => ipcRenderer.invoke('xyai:founders-agent-open-path', path),
  /** K-001 全局主题：读取 / 循环切换 / 订阅。 */
  getTheme: (): Promise<unknown> => ipcRenderer.invoke('xyai:theme-get'),
  cycleTheme: (): Promise<unknown> => ipcRenderer.invoke('xyai:theme-cycle'),
  onThemeChange: (callback: (state: unknown) => void): (() => void) => {
    const listener = (_event: { readonly sender: unknown }, state: unknown): void => callback(state)
    ipcRenderer.on('xyai:theme-changed', listener)
    return (): void => { ipcRenderer.removeListener('xyai:theme-changed', listener) }
  },

})

