/** Electron application shell for the loopback DeepSeek Harness Web Host. */

import { existsSync, appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
  safeStorage,
  Tray,
  WebContentsView,
  type Event,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type MenuItemConstructorOptions,
} from 'electron'
import { createHostSupervisor, spawnDshWeb, type HostSupervisor } from './host-supervisor.ts'
import { spawnXyosBackend } from './xyos-backend.ts'
import { KB_MENTION_OVERLAY_HTML } from './kb-mention-overlay.ts'
import { probeLocalModels, streamLocalModelChat, type LocalModelProbeResult } from './xyai-core/local-model-probe.ts'
import { createDesktopLifecycle, type DesktopLifecycle } from './window-lifecycle.ts'
import { SHELL_HTML } from './shell.ts'
import { ABOUT_HTML } from './about.ts'
import { BROWSER_CHROME_HTML } from './browser-chrome.ts'
import { evaluateAgentBlueprint } from './xyai-core/agent-production.ts'
import { TaskLedger } from './xyai-core/task-ledger.ts'
import { DevelopmentSessionRegistry } from './xyai-core/development-session.ts'
import { discoverTasksInSelectedRoot, importExternalTask } from './xyai-core/external-task-import.ts'
import { KnowledgeAssetStore } from './xyai-core/knowledge-asset-store.ts'
import { KnowledgeParseService } from './xyai-core/knowledge-parse-service.ts'
import { preflightKnowledgeRoot } from './xyai-core/knowledge-indexer.ts'
import { buildGroundedLocalModelPrompt, buildKnowledgeChatAnswer, chunkAnswerStream } from './xyai-core/knowledge-chat.ts'
import { CloudKnowledgeStore } from './xyai-core/cloud-knowledge-store.ts'
import { appendImaNote, createImaNote, getImaMediaInfo, getImaNoteContent, importImaLocalFile, importImaUrls, listImaNotebooks, listImaNotes, searchImaNotes, type ImaUploadFileResult } from './xyai-core/ima-client.ts'
import { McpReviewRegistry } from './xyai-core/mcp-review-registry.ts'
import { scanAgentCatalog, installSkillFiles, removeSkillFiles, installPluginFiles, removePluginFiles, importSkillDirectory, importPluginDirectory, collectOpenablePaths, type AgentCatalog } from './xyai-core/agent-capability-center.ts'
import { PRODUCTION_LINES, ProductionTracker, type ProductionLine } from './xyai-core/production-tracker.ts'
import { ProductionFactory } from './xyai-core/production-factory.ts'
import { redactDiagnosticText, sanitizeDiagnosticUrl } from './diagnostics.ts'
import { CredentialVault, startCredentialBroker, type CredentialBroker } from './credential-vault.ts'
import { ModelMarketplaceService } from './model-marketplace/service.ts'
import { FOUNDERS_SIDEBAR_HTML } from './founders-sidebar.ts'
import { FOUNDERS_PANEL_HTML } from './founders-panel.ts'
import {
  cycleThemePreference,
  dshApplyThemeScript,
  loadThemePreference,
  resolveThemeDark,
  saveThemePreference,
  syncDshThemePreference,
  XYAI_SURFACE_HARDEN_CSS,
  XYAI_WELCOME_DARK_CSS,
  type XyaiThemePreference,
  type XyaiThemeState,
} from './xyai-theme.ts'

const APP_NAME = 'XYAI Studio'
/**
 * The Electron Chromium GPU process can fail before application boot on some
 * Windows installations when its D3D runtime is incomplete.  This affects
 * only page compositing; XYAI local inference continues to use llama.cpp's
 * independent Vulkan/NVIDIA runtime.  A deployment may opt back into the
 * Chromium GPU path explicitly after validating its driver stack.
 */
const rendererGpuRequested = process.env.XYAI_RENDERER_GPU?.trim().toLowerCase() === 'on'
if (process.platform === 'win32' && !rendererGpuRequested) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  // On affected Windows driver stacks Chromium still spawns a GPU utility
  // process for software composition.  Keeping that work in-process avoids
  // the missing-DLL crash while llama.cpp remains a separate native process.
  app.commandLine.appendSwitch('in-process-gpu')
}
/**
 * Acceptance runs must be able to start alongside a user's installed release.
 * Production launches leave this unset and retain the stable application name
 * and single-instance behavior.
 */
const acceptanceInstance = process.env.XYAI_STUDIO_ACCEPTANCE_INSTANCE?.trim()
if (acceptanceInstance) {
  const suffix = acceptanceInstance.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 48) || 'isolated'
  app.setName(`${APP_NAME} (${suffix})`)
  // A controlled acceptance runner can live under a writable build directory
  // while a user's installed application keeps the normal AppData default.
  // This prevents a locked/read-only roaming profile from killing Electron
  // before the desktop bootstrap has a chance to create its diagnostic log.
  const requestedAcceptanceUserData = process.env.XYAI_STUDIO_ACCEPTANCE_USER_DATA?.trim()
  const acceptanceUserData = requestedAcceptanceUserData === undefined || requestedAcceptanceUserData === ''
    ? join(app.getPath('appData'), `${APP_NAME}-${suffix}`)
    : resolve(requestedAcceptanceUserData)
  app.setPath('userData', acceptanceUserData)
  app.setPath('sessionData', join(acceptanceUserData, 'session'))
}
/**
 * An acceptance build may run alongside an installed build or another
 * acceptance build.  Isolate its loopback XYOS port so a second desktop
 * process does not wait forever on the primary instance's port 3030.
 * Explicit XYOS_DESKTOP_PORT always wins for controlled deployments.
 */
function defaultXyosDesktopPort(instance: string | undefined): string {
  if (instance === undefined || instance === '') return '3030'
  let hash = 0
  for (const character of instance) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return String(31_000 + (hash % 1_000))
}
const xyosDesktopPort = process.env.XYOS_DESKTOP_PORT ?? defaultXyosDesktopPort(acceptanceInstance)
const WINDOW_WIDTH = 1440
const WINDOW_HEIGHT = 920
const TOP_BAR_HEIGHT = 44
const BROWSER_CHROME_HEIGHT = 112
const DESKTOP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = resolve(DESKTOP_DIR, '../..')
/** 桌面端诊断日志（GUI 模式 stdout/stderr 不落盘，写文件便于排查）。 */
const DESKTOP_LOG = process.env.XYOS_DESKTOP_LOG ?? join(app.getPath('userData'), 'xyos-studio-desktop.log')
function desktopLog(message: string): void {
  try { appendFileSync(DESKTOP_LOG, `[${new Date().toISOString()}] ${message}\n`) } catch { /* ignore */ }
}

/** 静默运行：除用户主动选择文件夹/文件外，所有提示只写日志，不再弹任何窗口。 */
const SILENT_OVERLAY_PRELUDE = '(() => { const log = function (level, prefix, message) { try { console[level]("[XYAI] " + prefix + ": " + String(message)) } catch (_err) {} }; try { window.alert = function (message) { log("warn", "silent-alert", message) }; window.confirm = function (message) { const text = String(message || ""); if (/完全访问|danger-full-access/.test(text)) { log("warn", "silent-confirm-denied-consent", text); return false }; log("info", "silent-confirm-accepted", text); return true }; window.prompt = function (message) { log("info", "silent-prompt-cancelled", message); return null }; const style = document.createElement("style"); style.textContent = "#kb-toast{display:none !important;visibility:hidden !important}"; (document.head || document.documentElement).appendChild(style) } catch (error) { log("warn", "silent-init-failed", String(error)) } })()'
async function silentMessageBox(parentOrOptions: unknown, maybeOptions?: MessageBoxOptions) {
  const options = (maybeOptions ?? parentOrOptions) as MessageBoxOptions
  desktopLog('[silent-message-box] ' + (options.type ?? 'info') + ': ' + (options.message ?? '') + (options.detail !== undefined ? ' — ' + options.detail : ''))
  return { response: options.defaultId ?? options.cancelId ?? 0, checkboxChecked: false }
}
function installSilentOverlay(view: WebContentsView | undefined): void {
  if (view === undefined) return
  const inject = (): void => {
    if (view.webContents.isDestroyed()) return
    void view.webContents.executeJavaScript(SILENT_OVERLAY_PRELUDE).catch((error: unknown) => desktopLog('silent overlay install failed: ' + redactDiagnosticText(String(error))))
  }
  view.webContents.on('did-finish-load', inject)
  setTimeout(inject, 1200)
}
type SpaceId = 'dev' | 'biz' | 'eco' | 'browser' | 'about'
/** 内置浏览器默认首页。 */
const BROWSER_HOME = process.env.XYOS_BROWSER_HOME ?? 'https://www.baidu.com'
/** 生态空间首页（cnxy.ai，可用 XYOS_ECO_URL 覆盖）。 */
const ECO_URL = process.env.XYOS_ECO_URL ?? 'https://cnxy.ai/'

let mainWindow: BrowserWindow | undefined
let dshView: WebContentsView | undefined
let xyosView: WebContentsView | undefined
let ecoView: WebContentsView | undefined
let aboutView: WebContentsView | undefined
let browserChromeView: WebContentsView | undefined
let foundersSidebarView: WebContentsView | undefined
let foundersPanelView: WebContentsView | undefined
let kbMentionView: WebContentsView | undefined
let currentSpace: SpaceId = 'dev'
let tray: Tray | undefined
let host: HostSupervisor | undefined
let xyosHost: HostSupervisor | undefined
let lifecycle: DesktopLifecycle | undefined
let hostOrigin: string | undefined
let xyosOrigin: string | undefined
let bootQuitPromise: Promise<void> | undefined
let quitReleased = false
let taskLedger: TaskLedger | undefined
let developmentSessions: DevelopmentSessionRegistry | undefined
let credentialBroker: CredentialBroker | undefined
let credentialVault: CredentialVault | undefined
let knowledgeAssets: KnowledgeAssetStore | undefined
let knowledgeParseService: KnowledgeParseService | undefined
let cloudKnowledge: CloudKnowledgeStore | undefined
let mcpReviews: McpReviewRegistry | undefined
let productionTracker: ProductionTracker | undefined
let productionFactory: ProductionFactory | undefined
let modelMarketplace: ModelMarketplaceService | undefined
let localModelProbe: LocalModelProbeResult | undefined
let agentCatalogCache: AgentCatalog | undefined

type FoundersModule = 'workspace' | 'production' | 'customization' | 'plugins' | 'knowledge' | 'model-marketplace' | 'account'
let activeFoundersModule: FoundersModule = 'workspace'
let foundersAccount: { authenticated: boolean; email?: string; nickname?: string; tenantName?: string } = { authenticated: false }
let foundersAccessToken: string | undefined
let activeFactoryProjectId: string | undefined
let kbMentionExpanded = false
let imaConfigured = false
let dschPageActive = false
/** 全局亮/暗主题偏好（K-001）；默认跟随系统，持久化于 userData。 */
let themePreference: XyaiThemePreference = 'system'

interface BrowserTab {
  readonly id: number
  readonly view: WebContentsView
  url: string
  title: string
}
interface Bookmark { title: string; url: string }

const browserTabs: BrowserTab[] = []
let nextBrowserTabId = 1
let activeBrowserTabId = 0
let bookmarks: Bookmark[] = []

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { title: 'XYAI 国际站', url: 'https://cnxy.ai/' },
  { title: 'XYAI Labs 中国站', url: 'https://www.cnxyai.com/' },
  { title: 'XYAI Studio', url: 'https://www.cnxyai.cn/' },
  { title: '生态伙伴链接中枢', url: 'https://ai.cnxy.tech/' },
  { title: '百度', url: 'https://www.baidu.com/' },
]

/** Resolve artifacts from the checkout in development and resourcesPath when packaged. */
function hostPaths(): { nodeExecutable: string; cliEntry: string; cwd: string; electronRunAsNode: boolean } {
  if (!app.isPackaged) {
    return {
      nodeExecutable: process.env.DSH_DESKTOP_NODE_EXECUTABLE ?? 'node',
      cliEntry: join(REPOSITORY_ROOT, 'apps/cli/lib/bin.js'),
      cwd: process.cwd(),
      electronRunAsNode: false,
    }
  }
  return {
    nodeExecutable: process.execPath,
    cliEntry: join(process.resourcesPath, 'host/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    cwd: app.getPath('home'),
    electronRunAsNode: true,
  }
}

/** Resolve the backend bundled with this application, never a historical checkout. */
function xyosBackendDir(): string {
  if (!app.isPackaged) return join(REPOSITORY_ROOT, 'xyos-backend')
  const bundled = join(process.resourcesPath, 'xyos-backend')
  const installedComponent = join(app.getPath('userData'), 'components', 'xyos-backend')
  return existsSync(join(bundled, 'node_modules', 'tsx', 'dist', 'cli.mjs')) ? bundled : installedComponent
}

/** The core edition can launch without XYOS; the local business space is then installable later. */
function hasLocalXyosBackend(): boolean {
  return existsSync(join(xyosBackendDir(), 'node_modules', 'tsx', 'dist', 'cli.mjs'))
}

/** Resolve the XYOS frontend bundled with this application. */
function xyosDistDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'dist')
    : join(REPOSITORY_ROOT, 'xyos-dist')
}

/** Keep DSH and XYOS mutable state out of the install directory. */
function localRuntimePaths(): { dshHome: string; databasePath: string; uploadPath: string; xyosWorkspacePath: string; taskLedgerPath: string; developmentSessionsPath: string; credentialVaultPath: string; cloudKnowledgeRegistryPath: string; knowledgeAssetRegistryPath: string; knowledgeAssetContentDirectory: string; knowledgeParseDirectory: string; mcpReviewRegistryPath: string; productionRunsPath: string; productionFactoryPath: string; productionWorkspaceRoot: string } {
  const root = join(app.getPath('userData'), 'runtime')
  return {
    dshHome: join(root, 'dsh'),
    databasePath: join(root, 'xyos', 'data', 'xiongyuan.db'),
    uploadPath: join(root, 'xyos', 'uploads'),
    xyosWorkspacePath: join(root, 'xyos', 'runtime-workspace'),
    // Development-space work is XYAI-owned and survives Harness changes.
    taskLedgerPath: join(root, 'xyai', 'task-ledger.json'),
    developmentSessionsPath: join(root, 'xyai', 'development-sessions.json'),
    credentialVaultPath: join(root, 'xyai', 'credential-vault.json'),
    cloudKnowledgeRegistryPath: join(root, 'xyai', 'cloud-knowledge.json'),
    knowledgeAssetRegistryPath: join(root, 'xyai', 'knowledge-assets.json'),
    knowledgeAssetContentDirectory: join(root, 'xyai', 'knowledge-content'),
    knowledgeParseDirectory: join(root, 'xyai', 'knowledge-parse'),
    mcpReviewRegistryPath: join(root, 'xyai', 'mcp-review-registry.json'),
    productionRunsPath: join(root, 'xyai', 'production-runs.json'),
    productionFactoryPath: join(root, 'xyai', 'production-factory.json'),
    productionWorkspaceRoot: join(root, 'xyai', 'production-projects'),
  }
}

/**
 * Stage the original, verified IndustryAgent client into the active DSH
 * profile. The installed application sources this package from its own host
 * closure; it never loads a historical checkout at runtime.
 */
function installMigratedIndustryAgent(dshHome: string): void {
  const source = app.isPackaged
    ? join(process.resourcesPath, 'host/node_modules/dsh-plugin-desktop')
    : join(REPOSITORY_ROOT, 'packages/client/xyai-industry-agent')
  const profileDirectory = join(dshHome, 'profiles', 'web')
  const destination = join(profileDirectory, 'node_modules', 'dsh-plugin-desktop')
  const client = join(source, 'lib', 'client.js')
  if (!existsSync(client)) throw new Error(`migrated IndustryAgent client is missing: ${client}`)
  mkdirSync(join(profileDirectory, 'node_modules'), { recursive: true })
  cpSync(source, destination, { recursive: true, dereference: true, force: true })

  const patchPath = join(dshHome, 'cordis.patch.yml')
  const clientMarker = '# XYAI Studio: migrated IndustryAgent client'
  const workspaceMarker = '# XYAI Studio: migrated IndustryAgent workspace routes'
  const workspacePickerMarker = '# XYAI Studio: desktop workspace picker fallback'
  const localGgufMarker = '# XYAI Studio: bundled local GGUF runtime'
  const ollamaProviderMarker = '# XYAI Studio: local Ollama model provider'
  const existing = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
  const clientPatch = `${clientMarker}\n- insert:\n    - id: xyai-industry-agent\n      name: dsh-plugin-desktop\n`
  const workspacePatch = `${workspaceMarker}\n- insert:\n    - id: xyai-skill-workspace\n      name: dsh-plugin-desktop/skill-workspace\n`
  // The upstream Win32 picker runs in DSH's standalone Node host.  In the
  // packaged Electron closure that worker can exit before creating its COM
  // dialog.  XYAI intercepts the visible "add workspace" action through our
  // main-process picker, while this browse composition keeps a usable DSH
  // fallback for every other workspace request.
  const workspacePickerPatch = `${workspacePickerMarker}\n- id: directory-picker\n  disabled: true\n- insert:\n    - id: xyai-directory-picker-browse\n      name: '@deepseek-ai/dsh-host-directory-picker-browse'\n    - id: xyai-ui-directory-picker-browse\n      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'\n`
  const localGgufPatch = `${localGgufMarker}\n- insert:\n    - id: xyai-local-gguf\n      name: dsh-plugin-desktop/local-gguf\n`
  const ollamaProviderPatch = `${ollamaProviderMarker}\n- insert:\n    - id: xyai-ollama-provider\n      name: dsh-plugin-desktop/ollama-provider\n`
  if (!existing.includes(clientMarker)) appendFileSync(patchPath, `${separator}${clientPatch}`)
  if (!existing.includes(workspaceMarker)) appendFileSync(patchPath, `${existsSync(patchPath) && readFileSync(patchPath, 'utf8').endsWith('\n') ? '' : '\n'}${workspacePatch}`)
  if (!existing.includes(workspacePickerMarker)) appendFileSync(patchPath, `${existsSync(patchPath) && readFileSync(patchPath, 'utf8').endsWith('\n') ? '' : '\n'}${workspacePickerPatch}`)
  if (!existing.includes(localGgufMarker)) appendFileSync(patchPath, `${existsSync(patchPath) && readFileSync(patchPath, 'utf8').endsWith('\n') ? '' : '\n'}${localGgufPatch}`)
  if (!existing.includes(ollamaProviderMarker)) appendFileSync(patchPath, `${existsSync(patchPath) && readFileSync(patchPath, 'utf8').endsWith('\n') ? '' : '\n'}${ollamaProviderPatch}`)
  desktopLog('migrated IndustryAgent client and workspace routes staged in DSH web profile')
}

function assertHostArtifacts(paths: ReturnType<typeof hostPaths>): void {
  if (paths.nodeExecutable.includes('/') && !existsSync(paths.nodeExecutable)) {
    throw new Error(`desktop Node runtime is missing: ${paths.nodeExecutable}`)
  }
  if (!existsSync(paths.cliEntry)) {
    throw new Error(`desktop Host entry is missing: ${paths.cliEntry}; run pnpm run build first`)
  }
}

/** 应用图标候选（窗口/托盘），dev 取源码目录，打包取 desktop-resources。 */
function appIconPath(name: string): string | undefined {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, `desktop-resources/${name}`)]
    : [join(DESKTOP_DIR, `resources/${name}`)]
  return candidates.find(candidate => existsSync(candidate))
}

/** 关于我们页面 logo（dev 取源码 resources，打包取 desktop-resources），转 base64 data URI。 */
/** 应用图标（icon.png）转 base64 data URI；由沙箱 preload 同步索取并缓存，避免重复读盘。 */
let cachedDesktopAppIconDataUri: string | undefined
function desktopAppIconDataUri(): string {
  if (cachedDesktopAppIconDataUri !== undefined) return cachedDesktopAppIconDataUri
  const path = appIconPath('icon.png')
  try {
    cachedDesktopAppIconDataUri = path === undefined ? '' : `data:image/png;base64,${readFileSync(path).toString('base64')}`
  } catch {
    cachedDesktopAppIconDataUri = ''
  }
  return cachedDesktopAppIconDataUri
}

function aboutLogoDataUri(): string {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'desktop-resources/logo.png')
    : join(DESKTOP_DIR, 'resources/logo.png')
  try {
    if (existsSync(path)) return `data:image/png;base64,${readFileSync(path).toString('base64')}`
  } catch { /* ignore */ }
  return ''
}

/** Load the app-local tray template, with an empty fallback for incomplete staging. */
function trayImage(): Electron.NativeImage {
  const path = process.platform === 'win32'
    ? appIconPath('xyos-tray.png') ?? appIconPath('icon.png')
    : appIconPath('trayTemplate.png')
  const image = path === undefined ? nativeImage.createEmpty() : nativeImage.createFromPath(path)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function isExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isXyosUrl(raw: string): boolean {
  return xyosOrigin !== undefined && hasOrigin(raw, xyosOrigin)
}

function hasOrigin(raw: string, expected: string): boolean {
  try {
    return new URL(raw).origin === expected
  } catch {
    return false
  }
}

/** Install navigation and permission policy before the first renderer loads. */
function hardenSession(): void {
  const desktopSession = session.defaultSession
  desktopSession.setPermissionCheckHandler(() => false)
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })

  // 诊断：记录 XYOS 静态资源实际响应 Content-Type（排查 MIME 异常）
  desktopSession.webRequest.onHeadersReceived(
    { urls: ['*://127.0.0.1/*', '*://localhost/*'] },
    (details, callback) => {
      const path = details.url.replace(/^https?:\/\/[^/]+/, '')
      if (isXyosUrl(details.url) && (path.endsWith('.css') || path.endsWith('.js'))) {
        const ct = details.responseHeaders?.['content-type']
          ?? details.responseHeaders?.['Content-Type']
          ?? details.responseHeaders?.['CONTENT-TYPE']
        desktopLog(`webRequest ${path.split('/').pop()} -> ${JSON.stringify(ct)}`)
      }
      callback({})
    },
  )

  // 桌面端不需要 PWA service worker（与本地后端静态服务/缓存逻辑冲突），阻止注册
  desktopSession.webRequest.onBeforeRequest(
    { urls: ['*://127.0.0.1/*', '*://localhost/*'] },
    (details, callback) => {
      const path = details.url.replace(/^https?:\/\/[^/]+/, '')
      const blocked = /sw\.js$|registerSW\.js$|workbox-[^/]+\.js$/.test(path)
      if (isXyosUrl(details.url) && blocked) {
        desktopLog(`webRequest blocked sw: ${path}`)
        callback({ cancel: true })
        return
      }
      callback({})
    },
  )
}

/** 视图区（顶栏之下）与窗口尺寸同步。 */
function layoutViews(): void {
  if (mainWindow === undefined) return
  const [width = 0, height = 0] = mainWindow.getContentSize()
  const bounds = { x: 0, y: TOP_BAR_HEIGHT, width, height: Math.max(0, height - TOP_BAR_HEIGHT) }
  dshView?.setBounds(bounds)
  xyosView?.setBounds(bounds)
  ecoView?.setBounds(bounds)
  aboutView?.setBounds(bounds)
  browserChromeView?.setBounds({ x: 0, y: TOP_BAR_HEIGHT, width, height: BROWSER_CHROME_HEIGHT })
  const tabBounds = { x: 0, y: TOP_BAR_HEIGHT + BROWSER_CHROME_HEIGHT, width, height: Math.max(0, height - TOP_BAR_HEIGHT - BROWSER_CHROME_HEIGHT) }
  for (const tab of browserTabs) tab.view.setBounds(tabBounds)
  const foundersWidth = Math.min(328, Math.max(264, Math.floor(width * 0.25)))
  foundersSidebarView?.setBounds({ x: 0, y: TOP_BAR_HEIGHT, width: foundersWidth, height: Math.max(0, height - TOP_BAR_HEIGHT) })
  foundersPanelView?.setBounds({ x: foundersWidth, y: TOP_BAR_HEIGHT, width: Math.max(0, width - foundersWidth), height: Math.max(0, height - TOP_BAR_HEIGHT) })
  if (kbMentionView !== undefined) {
    const kbW = kbMentionExpanded ? 420 : 240
    const kbH = kbMentionExpanded ? 520 : 48
    kbMentionView.setBounds({ x: width - kbW - 16, y: TOP_BAR_HEIGHT + Math.max(0, height - TOP_BAR_HEIGHT) - kbH - 16, width: kbW, height: kbH })
  }
}

function foundersState(): Record<string, unknown> {
  const tasks = taskLedger?.list() ?? []
  const taskTitles = new Map(tasks.map(task => [task.id, task.title]))
  const factoryProjects = productionFactory?.listProjects() ?? []
  const selectedFactoryProjectId = activeFactoryProjectId !== undefined && factoryProjects.some(project => project.id === activeFactoryProjectId) ? activeFactoryProjectId : factoryProjects[0]?.id
  const factoryState = selectedFactoryProjectId === undefined ? undefined : productionFactory?.projectState(selectedFactoryProjectId)
  return {
    activeModule: activeFoundersModule,
    account: { ...foundersAccount },
    tasks: tasks.map(task => ({ id: task.id, title: task.title, goal: task.goal, status: task.status, updatedAt: task.updatedAt })),
    sessions: (developmentSessions?.list() ?? []).map(item => ({ id: item.id, title: item.title, state: item.state, updatedAt: item.updatedAt })),
    knowledgeAssets: (knowledgeAssets?.list() ?? []).map(item => ({ id: item.id, name: item.name, importedAt: item.importedAt, totalBytes: item.totalBytes, files: item.files.map(file => ({ path: file.path, bytes: file.bytes })) })),
    knowledgeMounts: (knowledgeAssets?.listMounts() ?? []).map(item => ({ id: item.id, name: item.name, rootPath: item.rootPath, mountedAt: item.mountedAt, status: item.status })),
    knowledgeParse: Object.fromEntries((knowledgeAssets?.listMounts() ?? []).map(item => [item.id, knowledgeParseService?.stateFor(item.id) ?? { scanning: false, busy: false, summary: { total: 0, pending: 0, parsing: 0, ready: 0, failed: 0 } }])),
    cloudKnowledgeMounts: (cloudKnowledge?.list() ?? []).map(item => ({ id: item.id, kind: item.kind, name: item.name, knowledgeBaseId: item.knowledgeBaseId, mountedAt: item.mountedAt })),
    imaConfigured,
    plugins: (mcpReviews?.list() ?? []).map(item => ({ id: item.id, name: item.name, command: item.command, credentialNames: item.credentialNames, status: item.status, registeredAt: item.registeredAt, reviewedAt: item.reviewedAt })),
    ...(agentCatalogCache === undefined ? {} : { agentCatalog: agentCatalogCache }),
    productionRuns: (productionTracker?.list() ?? []).map(item => ({ id: item.id, taskId: item.taskId, taskTitle: taskTitles.get(item.taskId), goal: item.goal, status: item.status, stages: item.stages, updatedAt: item.updatedAt })),
    factory: {
      activeProjectId: selectedFactoryProjectId,
      projects: factoryProjects.map(project => ({ id: project.id, name: project.name, goal: project.goal, systemBase: project.systemBase, updatedAt: project.updatedAt })),
      ...(factoryState === undefined ? {} : {
        project: { id: factoryState.project.id, name: factoryState.project.name, goal: factoryState.project.goal, systemBase: factoryState.project.systemBase },
        ...(factoryState.contract === undefined ? {} : { contract: factoryState.contract }),
        assets: factoryState.assets.map(asset => ({ id: asset.id, line: asset.line, name: asset.name, status: asset.status, inputIds: asset.inputIds, updatedAt: asset.updatedAt, metadata: foundersAssetMetadata(asset.metadata) })),
        events: factoryState.events.slice(-30).map(event => ({ id: event.id, assetId: event.assetId, line: event.line, kind: event.kind, message: event.message, createdAt: event.createdAt })),
      }),
    },
  }
}

/** Renderer state is informative only: never leak internal artifact locations,
 * local filenames, provider credentials, or future secret-bearing metadata. */
function foundersAssetMetadata(metadata: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const allowed = ['files', 'totalBytes', 'records', 'trainingRecords', 'evaluationRecords', 'format', 'method', 'quantization', 'trainingRuntime', 'productionType', 'industry', 'gateCount', 'gatePassed', 'reviewGate', 'systemBase']
  return Object.fromEntries(allowed.flatMap(key => metadata[key] === undefined ? [] : [[key, metadata[key]]]))
}

function broadcastFoundersState(): void {
  const state = foundersState()
  for (const view of [foundersSidebarView, foundersPanelView]) {
    if (view !== undefined && !view.webContents.isDestroyed()) view.webContents.send('xyai:founders-state', state)
  }
}

/** 能力中心扫描结果缓存；面板每次打开先取缓存，用户点“重新识别”时再全量重扫。 */
function refreshAgentCatalog(broadcast: boolean): AgentCatalog {
  const runtime = localRuntimePaths()
  agentCatalogCache = scanAgentCatalog({ dshHome: runtime.dshHome })
  desktopLog(`agent capability center: skills=${agentCatalogCache.skills.length} plugins=${agentCatalogCache.plugins.length} builtins=${agentCatalogCache.builtins.length}`)
  if (broadcast) broadcastFoundersState()
  return agentCatalogCache
}

function refreshFoundersVisibility(): void {
  const devActive = currentSpace === 'dev'
  foundersSidebarView?.setVisible(devActive)
  foundersPanelView?.setVisible(devActive && activeFoundersModule !== 'workspace')
  dshView?.setVisible(devActive && activeFoundersModule === 'workspace')
  const workspaceChatActive = devActive && activeFoundersModule === 'workspace' && !dschPageActive
  kbMentionView?.setVisible(workspaceChatActive)
  if (!workspaceChatActive) {
    kbMentionExpanded = false
    if (kbMentionView !== undefined && !kbMentionView.webContents.isDestroyed()) kbMentionView.webContents.send('xyai:kb-mention-reset')
  }
}

function selectFoundersModule(module: FoundersModule): void {
  dschPageActive = false
  if (module === 'model-marketplace') {
    activeFoundersModule = 'workspace'
    dschPageActive = true
    refreshFoundersVisibility()
    void dshView?.webContents.executeJavaScript(`(() => {
      let rendered = false
      const render = () => {
      const root = document.body
      if (root.textContent?.includes('根据本机硬件推荐')) return true
      const box = document.createElement('section')
      box.style.cssText = 'padding:32px;max-width:900px;font:16px system-ui;color:var(--xyai-mm-fg,#172033);background:var(--xyai-mm-bg,#f8fafc);min-height:100vh;color-scheme:light dark'
      const dark = document.body.hasAttribute('data-ds-dark-theme')
      if (dark) { box.style.setProperty('--xyai-mm-fg','#e8eef7'); box.style.setProperty('--xyai-mm-bg','#0e141c'); box.style.colorScheme='dark' }
      box.innerHTML = '<h1>模型广场</h1><p>根据本机硬件推荐适合安装的本地小模型；是否安装由用户自行决定。</p><div id="xyai-model-marketplace-status">正在检测本机硬件…</div><button id="xyai-model-marketplace-refresh">刷新推荐</button><div id="xyai-model-marketplace-list" style="margin-top:20px"></div>'
      root.replaceChildren(box)
      const api = window.xyaiDesktop
      const status = document.getElementById('xyai-model-marketplace-status')
      const list = document.getElementById('xyai-model-marketplace-list')
      api?.onHardwareRefresh?.(v => { status.textContent = '硬件检测完成：' + (v?.gpuName || v?.memory || '已获取硬件信息') })
      api?.onModelRecommend?.(v => { const models = v?.models || []; const cardBg = dark ? '#1a2332' : '#fff'; const cardBorder = dark ? '#2c394b' : '#d9e1ec'; list.innerHTML = models.length ? models.map(m => '<article style="padding:16px;border:1px solid '+cardBorder+';background:'+cardBg+';border-radius:10px;margin:8px 0;color:inherit"><b>'+String(m.name||m.id)+'</b><p>'+String(m.description||m.reason||'本地模型')+'</p><button data-model="'+String(m.id)+'">下载安装</button></article>').join('') : '<p>暂无推荐模型，请刷新硬件检测。</p>'; list.querySelectorAll('[data-model]').forEach(b => b.onclick=()=>api?.pullNativeModel?.(b.dataset.model)) })
      document.getElementById('xyai-model-marketplace-refresh').onclick=()=>{api?.requestHardwareRefresh?.();api?.requestModelRecommend?.();api?.requestLocalModels?.()}
      api?.requestHardwareRefresh?.(); api?.requestModelRecommend?.(); api?.requestLocalModels?.()
      return true
      }
      const tick = () => { if (!rendered) rendered = render(); if (!rendered) setTimeout(tick, 250) }
      tick()
    })()`).catch((error: unknown) => desktopLog(`model marketplace view failed: ${redactDiagnosticText(String(error))}`))
    broadcastFoundersState()
    return
  }
  if (module === 'knowledge') {
    activeFoundersModule = 'knowledge'
    refreshFoundersVisibility()
    broadcastFoundersState()
    desktopLog('founders module selected: knowledge -> XYAI Founders knowledge view')
    return
  }
  if (module === 'customization') {
    activeFoundersModule = 'workspace'
    dschPageActive = true
    refreshFoundersVisibility()
    void dshView?.webContents.executeJavaScript(`(() => { [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '智能体定制')?.click() })()`).catch((error: unknown) => desktopLog(`agent customization activation failed: ${redactDiagnosticText(String(error))}`))
    broadcastFoundersState()
    return
  }
  activeFoundersModule = module
  refreshFoundersVisibility()
  broadcastFoundersState()
  desktopLog(`founders module selected: ${module}`)
}

/** 规范化用户输入的网址（补全协议；非 http(s) 走搜索引擎）。 */
function normalizeNavInput(raw: string): string {
  const t = raw.trim()
  if (!t) return BROWSER_HOME
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/i.test(t)) return `https://${t}`
  return `https://www.baidu.com/s?wd=${encodeURIComponent(t)}`
}

/** 切换可见空间（默认开发空间）。 */
function switchSpace(space: SpaceId): void {
  if (space === currentSpace) return
  currentSpace = space
  refreshFoundersVisibility()
  xyosView?.setVisible(space === 'biz')
  ecoView?.setVisible(space === 'eco')
  aboutView?.setVisible(space === 'about')
  browserChromeView?.setVisible(space === 'browser')
  refreshBrowserVisibility()
  mainWindow?.webContents.send('xyos:space-changed', space)
  desktopLog(`space switched to ${space}`)
}

/** 按当前空间与活动标签刷新各浏览器标签视图可见性。 */
function refreshBrowserVisibility(): void {
  for (const tab of browserTabs) {
    tab.view.setVisible(currentSpace === 'browser' && tab.id === activeBrowserTabId)
  }
}

function activeBrowserTab(): BrowserTab | undefined {
  return browserTabs.find(t => t.id === activeBrowserTabId)
}

/** 把浏览器状态（标签 / 收藏夹 / 当前地址）推送给工具栏。 */
function broadcastBrowserState(): void {
  if (browserChromeView === undefined) return
  const active = activeBrowserTab()
  browserChromeView.webContents.send('xyos:browser-state', {
    tabs: browserTabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.id === activeBrowserTabId })),
    bookmarks,
    activeTabId: activeBrowserTabId,
    activeUrl: active?.url ?? '',
    canGoBack: active?.view.webContents.navigationHistory.canGoBack() ?? false,
    canGoForward: active?.view.webContents.navigationHistory.canGoForward() ?? false,
  })
}

/** 新建浏览器标签；页面弹窗（target=_blank）也走这里，从而留在应用内。 */
function openBrowserTab(url: string, activate: boolean): void {
  if (mainWindow === undefined) return
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } })
  const tab: BrowserTab = { id: nextBrowserTabId++, view, url, title: url }
  const wc = view.webContents
  wc.on('did-navigate', (_event, u) => { tab.url = u; broadcastBrowserState() })
  wc.on('did-navigate-in-page', (_event, u) => { tab.url = u; broadcastBrowserState() })
  wc.on('page-title-updated', (_event, title) => { tab.title = title; broadcastBrowserState() })
  wc.on('did-start-loading', () => broadcastBrowserState())
  wc.on('did-stop-loading', () => broadcastBrowserState())
  wc.setWindowOpenHandler(({ url: popup }) => {
    if (isExternalUrl(popup)) openBrowserTab(popup, true)
    return { action: 'deny' }
  })
  instrumentView(`browser-tab-${tab.id}`, view)
  browserTabs.push(tab)
  mainWindow.contentView.addChildView(view)
  void wc.loadURL(url)
  if (activate || browserTabs.length === 1) activeBrowserTabId = tab.id
  layoutViews()
  refreshBrowserVisibility()
  broadcastBrowserState()
}

function closeBrowserTab(id: number): void {
  const idx = browserTabs.findIndex(t => t.id === id)
  if (idx === -1) return
  const tab = browserTabs.splice(idx, 1)[0]
  if (tab === undefined) return
  mainWindow?.contentView.removeChildView(tab.view)
  tab.view.webContents.close()
  if (id === activeBrowserTabId) {
    activeBrowserTabId = browserTabs[Math.min(idx, browserTabs.length - 1)]?.id ?? 0
  }
  refreshBrowserVisibility()
  broadcastBrowserState()
}

function activateBrowserTab(id: number): void {
  if (!browserTabs.some(t => t.id === id)) return
  activeBrowserTabId = id
  refreshBrowserVisibility()
  broadcastBrowserState()
}

function navigateActiveBrowserTab(raw: string): void {
  const active = activeBrowserTab()
  if (active === undefined) return
  const target = normalizeNavInput(raw)
  void active.view.webContents.loadURL(target).catch((error: unknown) => {
    desktopLog(`browser nav failed: ${redactDiagnosticText(String(error))}`)
  })
}

function bookmarksFile(): string {
  return join(app.getPath('userData'), 'browser-bookmarks.json')
}

function loadBookmarks(): Bookmark[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(bookmarksFile(), 'utf8'))
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((b): b is Bookmark =>
        typeof b === 'object' && b !== null && typeof (b as Bookmark).url === 'string' && typeof (b as Bookmark).title === 'string')
      if (valid.length > 0) return valid
    }
  } catch { /* 首次运行或文件损坏：使用默认收藏 */ }
  return DEFAULT_BOOKMARKS.map(b => ({ ...b }))
}

function persistBookmarks(): void {
  try { writeFileSync(bookmarksFile(), JSON.stringify(bookmarks, null, 2)) } catch { /* ignore */ }
}

function addBookmark(): void {
  const active = activeBrowserTab()
  if (active === undefined) return
  if (bookmarks.some(b => b.url === active.url)) return
  bookmarks.push({ title: active.title || active.url, url: active.url })
  persistBookmarks()
  broadcastBrowserState()
}

function removeBookmark(url: string): void {
  bookmarks = bookmarks.filter(b => b.url !== url)
  persistBookmarks()
  broadcastBrowserState()
}

/** 视图诊断：记录加载结果与页面 JS 错误（便于排查空白/加载失败）。 */
function instrumentView(name: string, view: WebContentsView): void {
  view.webContents.on('did-finish-load', () => {
    desktopLog(`view ${name}: did-finish-load ${sanitizeDiagnosticUrl(view.webContents.getURL())}`)
  })
  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    desktopLog(`view ${name}: did-fail-load ${code} ${redactDiagnosticText(description)} ${sanitizeDiagnosticUrl(url)}`)
  })
  view.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    desktopLog(`view ${name}: console[${level}] ${redactDiagnosticText(String(message), 200)} (${sanitizeDiagnosticUrl(sourceId)}:${line})`)
  })
  view.webContents.on('render-process-gone', (_event, details) => {
    desktopLog(`view ${name}: render-process-gone ${JSON.stringify(details)}`)
  })
}

/** 当前主题快照（偏好 + 解析后的暗色布尔值）。 */
function themeState(): XyaiThemeState {
  return {
    preference: themePreference,
    dark: resolveThemeDark(themePreference, nativeTheme.shouldUseDarkColors),
  }
}

/** 把主题推送给顶栏 shell、Founders 面板与 DSH 工作台。 */
function broadcastTheme(state: XyaiThemeState = themeState()): void {
  if (mainWindow !== undefined && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('xyai:theme-changed', state)
  }
  for (const view of [foundersSidebarView, foundersPanelView, kbMentionView, dshView]) {
    if (view === undefined || view.webContents.isDestroyed()) continue
    view.webContents.send('xyai:theme-changed', state)
  }
  if (dshView !== undefined && !dshView.webContents.isDestroyed()) {
    void dshView.webContents.executeJavaScript(dshApplyThemeScript(state.dark, state.preference)).catch((error: unknown) => {
      desktopLog(`theme apply on dsh failed: ${redactDiagnosticText(String(error))}`)
    })
  }
}

/**
 * 应用主题偏好：持久化、同步 DSH settings、nativeTheme，并广播到各视图。
 * @param preference - 用户选择的偏好。
 * @param persistDsh - 是否写入 `$DSH_HOME/settings.yaml`（启动时若尚未就绪可跳过）。
 */
function applyThemePreference(preference: XyaiThemePreference, persistDsh = true): XyaiThemeState {
  themePreference = preference
  saveThemePreference(app.getPath('userData'), preference)
  nativeTheme.themeSource = preference
  if (persistDsh) {
    try {
      syncDshThemePreference(localRuntimePaths().dshHome, preference)
    } catch (error: unknown) {
      desktopLog(`sync dsh theme preference failed: ${redactDiagnosticText(String(error))}`)
    }
  }
  const state = themeState()
  broadcastTheme(state)
  desktopLog(`theme applied: preference=${state.preference} dark=${String(state.dark)}`)
  return state
}

/** 覆盖 DSH 设计系统 token：弹窗/浮层改不透明实底；暗色用深色实底，并修复工作台欢迎页对比度。
 * 注意：DSH 主题把 alias tokens 作为 body 的 inline 变量注入，:root 覆盖无效；
 * 必须在 body（含 data-ds-dark-theme）上以 !important 覆盖。 */
function hardenDshSurfaces(view: WebContentsView): void {
  const css = `${XYAI_SURFACE_HARDEN_CSS}\n${XYAI_WELCOME_DARK_CSS}`
  const inject = (): void => {
    if (view.webContents.isDestroyed()) return
    void view.webContents.insertCSS(css).then(() => {
      desktopLog('view dsh: surface + welcome dark tokens patched')
    }).catch((error: unknown) => {
      desktopLog(`view dsh: insertCSS failed: ${redactDiagnosticText(String(error))}`)
    })
    const state = themeState()
    void view.webContents.executeJavaScript(dshApplyThemeScript(state.dark, state.preference)).catch((error: unknown) => {
      desktopLog(`theme apply on dsh ready failed: ${redactDiagnosticText(String(error))}`)
    })
  }
  view.webContents.on('dom-ready', inject)
  view.webContents.on('did-finish-load', inject)
}

/** 在主窗口内容区挂载开发/业务/生态三个空间、内置浏览器与关于我们视图。 */
function mountViews(origin: string, xyosOrigin?: string): void {
  const window = mainWindow
  if (window === undefined) throw new Error('main window is not ready')
  const commonPrefs = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }

  // 开发空间：DeepSeek Harness Web UI
  const devUrl = new URL(origin)
  devUrl.searchParams.set('dsh-desktop-platform', process.platform)
  // Historical XYAI IndustryAgent client uses this explicit environment
  // contract before registering its real conversation-view contribution.
  devUrl.searchParams.set('dsh-desktop-mode', 'xyai')
  if (xyosOrigin !== undefined) devUrl.searchParams.set('dsh-xyos-origin', xyosOrigin)
  const foundersPreload = join(DESKTOP_DIR, 'lib/preload.cjs')
  foundersSidebarView = new WebContentsView({ webPreferences: { ...commonPrefs, preload: foundersPreload } })
  foundersPanelView = new WebContentsView({ webPreferences: { ...commonPrefs, preload: foundersPreload } })
  foundersSidebarView.setVisible(true)
  foundersPanelView.setVisible(false)
  window.contentView.addChildView(foundersSidebarView)
  window.contentView.addChildView(foundersPanelView)
  void foundersSidebarView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(FOUNDERS_SIDEBAR_HTML)}`)
  void foundersPanelView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(FOUNDERS_PANEL_HTML)}`)
  kbMentionView = new WebContentsView({ webPreferences: { ...commonPrefs, preload: foundersPreload } })
  kbMentionView.setVisible(false)
  window.contentView.addChildView(kbMentionView)
  void kbMentionView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(KB_MENTION_OVERLAY_HTML)}`)

  dshView = new WebContentsView({
    webPreferences: { ...commonPrefs, preload: join(DESKTOP_DIR, 'lib/dsh-preload.cjs') },
  })
  dshView.setVisible(true)
  dshView.webContents.on('will-navigate', (event, url) => {
    if (hasOrigin(url, origin)) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })
  dshView.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  instrumentView('dsh', dshView)
  hardenDshSurfaces(dshView)
  window.contentView.addChildView(dshView)
  void dshView.webContents.loadURL(devUrl.href)
  installSilentOverlay(foundersSidebarView)
  installSilentOverlay(foundersPanelView)
  installSilentOverlay(kbMentionView)
  installSilentOverlay(dshView)

  // The proven, migrated DSH client owns the development sidebar and every
  // production route.  Do not place a second Electron-owned mock sidebar or
  // panel above it: that would hide the original AI production lines,
  // knowledge base, account entry, and IndustryAgent wizard from users.

  // 业务空间：XYAI Studio
  xyosView = new WebContentsView({ webPreferences: { ...commonPrefs } })
  xyosView.setVisible(false)
  xyosView.webContents.on('will-navigate', (event, url) => {
    if (xyosOrigin !== undefined && hasOrigin(url, xyosOrigin)) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })
  xyosView.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  instrumentView('xyos', xyosView)
  window.contentView.addChildView(xyosView)
  void xyosView.webContents.loadURL(xyosOrigin ?? `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>XYOS 本地服务</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#101828;font:16px/1.6 system-ui,"Microsoft YaHei",sans-serif}.card{max-width:560px;margin:24px;padding:32px;border:1px solid #e4e7ec;border-radius:18px;background:#fff;box-shadow:0 18px 44px rgba(16,24,40,.08)}h1{margin:0 0 10px;font-size:24px}p{color:#475467}.hint{margin-top:20px;padding:12px 14px;border-radius:10px;background:#f2f4f7;color:#344054}</style><main class="card"><h1>XYOS 本地服务尚未安装</h1><p>当前为轻量核心版。开发空间、知识库与已配置的本地模型仍可使用；本机业务空间、账户服务和智能体安装需要安装 XYOS 本地运行包。</p><p class="hint">安装包上传后，可在“设置 → 本机能力与系统依赖”一键下载安装；也可改用完整离线版。</p></main>`)}`)

  // 生态空间：cnxy.ai
  ecoView = new WebContentsView({ webPreferences: { ...commonPrefs } })
  ecoView.setVisible(false)
  ecoView.webContents.on('will-navigate', (event, url) => {
    if (hasOrigin(url, ECO_URL)) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })
  ecoView.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  instrumentView('eco', ecoView)
  window.contentView.addChildView(ecoView)
  void ecoView.webContents.loadURL(ECO_URL)

  // 内置浏览器空间：工具栏 + 多标签
  bookmarks = loadBookmarks()
  browserChromeView = new WebContentsView({ webPreferences: { ...commonPrefs, preload: join(DESKTOP_DIR, 'lib/preload.cjs') } })
  browserChromeView.setVisible(false)
  browserChromeView.webContents.on('did-finish-load', () => broadcastBrowserState())
  window.contentView.addChildView(browserChromeView)
  void browserChromeView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(BROWSER_CHROME_HTML)}`)
  openBrowserTab(BROWSER_HOME, false)

  // 关于我们：本地静态页（cnxy.ai 毛玻璃风格）
  aboutView = new WebContentsView({ webPreferences: { ...commonPrefs } })
  aboutView.setVisible(false)
  aboutView.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })
  aboutView.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  instrumentView('about', aboutView)
  window.contentView.addChildView(aboutView)
  void aboutView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ABOUT_HTML.replace('__LOGO__', aboutLogoDataUri()))}`)

  layoutViews()
  refreshFoundersVisibility()
}

async function createMainWindow(): Promise<BrowserWindow> {
  if (hostOrigin === undefined) {
    throw new Error('desktop development space is not ready')
  }
  const windowIcon = process.platform === 'win32' ? appIconPath('icon.png') : undefined
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    frame: process.platform === 'win32',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(windowIcon !== undefined ? { icon: windowIcon } : {}),
    ...(process.platform === 'darwin' ? {} : {
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#ffffff',
        height: TOP_BAR_HEIGHT,
      },
    }),
    ...(process.platform === 'darwin' ? {
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar' as const,
      visualEffectState: 'followWindow' as const,
    } : {}),
    ...(process.platform === 'win32' ? {
      backgroundMaterial: 'acrylic' as const,
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
    } : {
      transparent: true,
      backgroundColor: '#00000000',
    }),
    // Acceptance instances keep an unambiguous native title without changing
    // the production title, so they can be cold-started alongside an install.
    title: app.getName(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(DESKTOP_DIR, 'lib/preload.cjs'),
    },
  })
  mainWindow = window
  window.on('close', (event) => { lifecycle?.onWindowClose(event) })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  window.on('resize', () => { layoutViews() })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // 窗口自身只承载顶栏 shell（本地 data URL），无外部导航
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })

  mountViews(hostOrigin, xyosOrigin)
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SHELL_HTML)}`)
  if (!lifecycle?.isQuitting) window.show()
  return window
}

/** 空间切换 / 浏览器多标签与收藏夹 IPC（来自顶栏与浏览器工具栏）。 */
async function getLocalModelStatus(): Promise<LocalModelProbeResult> {
  if (localModelProbe === undefined) localModelProbe = await probeLocalModels()
  return localModelProbe
}

async function refreshLocalModelStatus(): Promise<LocalModelProbeResult> {
  localModelProbe = await probeLocalModels()
  return localModelProbe
}

function setupIpc(): void {
  ipcMain.on('xyai:desktop-app-icon-data-uri', (event) => {
    event.returnValue = desktopAppIconDataUri()
  })
  ipcMain.on('xyos:switch', (_event, space: unknown) => {
    const s = space === 'biz' ? 'biz' : space === 'eco' ? 'eco' : space === 'browser' ? 'browser' : space === 'about' ? 'about' : 'dev'
    switchSpace(s)
  })
  ipcMain.handle('xyai:theme-get', (): XyaiThemeState => themeState())
  ipcMain.handle('xyai:theme-cycle', (): XyaiThemeState => applyThemePreference(cycleThemePreference(themePreference)))
  ipcMain.handle('xyai:theme-set', (_event, raw: unknown): XyaiThemeState => {
    const next = raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
    return applyThemePreference(next)
  })
  ipcMain.on('xyos:browser-new-tab', () => { openBrowserTab(BROWSER_HOME, true) })
  ipcMain.on('xyos:browser-close-tab', (_event, id: unknown) => { if (typeof id === 'number') closeBrowserTab(id) })
  ipcMain.on('xyos:browser-activate-tab', (_event, id: unknown) => { if (typeof id === 'number') activateBrowserTab(id) })
  ipcMain.on('xyos:browser-navigate', (_event, url: unknown) => { if (typeof url === 'string') navigateActiveBrowserTab(url) })
  ipcMain.on('xyos:browser-back', () => { activeBrowserTab()?.view.webContents.navigationHistory.goBack() })
  ipcMain.on('xyos:browser-forward', () => { activeBrowserTab()?.view.webContents.navigationHistory.goForward() })
  ipcMain.on('xyos:browser-reload', () => { activeBrowserTab()?.view.webContents.reload() })
  ipcMain.on('xyos:browser-home', () => { navigateActiveBrowserTab(BROWSER_HOME) })
  ipcMain.on('xyos:browser-bookmark-add', () => { addBookmark() })
  ipcMain.on('xyos:browser-bookmark-remove', (_event, url: unknown) => { if (typeof url === 'string') removeBookmark(url) })
  ipcMain.on('xyos:browser-bookmark-open', (_event, url: unknown) => { if (typeof url === 'string') navigateActiveBrowserTab(url) })
  ipcMain.on('xyai:founders-select-module', (_event, raw: unknown) => {
    const module: FoundersModule = raw === 'production' || raw === 'customization' || raw === 'plugins' || raw === 'knowledge' || raw === 'model-marketplace' || raw === 'account' ? raw : 'workspace'
    selectFoundersModule(module)
  })
  const pickXyaiDirectory = async (event: IpcMainInvokeEvent): Promise<string | null> => {
    if (dshView === undefined || event.sender.id !== dshView.webContents.id) {
      throw new Error('本机目录选择仅允许由 XYAI Founders 开发空间发起')
    }
    const selection = await (mainWindow === undefined ? dialog.showOpenDialog({
      title: '选择要挂接的本机知识文件夹',
      properties: ['openDirectory'],
    }) : dialog.showOpenDialog(mainWindow, {
      title: '选择要挂接的本机知识文件夹',
      properties: ['openDirectory'],
    }))
    return selection.canceled ? null : selection.filePaths[0] ?? null
  }
  ipcMain.handle('xyai:pick-directory', pickXyaiDirectory)
  // Compatibility with a previously packaged knowledge-base bridge.
  ipcMain.handle('xyai:knowledge-pick-directory', pickXyaiDirectory)
  ipcMain.handle('xyai:ensure-default-workspace', async (event): Promise<string> => {
    if (dshView === undefined || event.sender.id !== dshView.webContents.id) {
      throw new Error('默认工作区仅允许由 XYAI Founders 开发空间创建')
    }
    const workspace = join(localRuntimePaths().dshHome, 'workspaces', '我的工作区')
    mkdirSync(workspace, { recursive: true })
    return workspace
  })
  ipcMain.handle('xyai:founders-state', () => foundersState())
  ipcMain.handle('xyai:founders-import-tasks', async () => {
    await importExternalTasksFromDialog()
    broadcastFoundersState()
  })
  ipcMain.handle('xyai:founders-import-knowledge', async () => {
    await importKnowledgeAssetFromDialog()
    broadcastFoundersState()
  })
    const registerKnowledgeMount = async (selected: string) => {
    if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
    const mount = await knowledgeAssets.mountDirectory(selected)
    desktopLog(`knowledge mount registered: id=${mount.id} root=${mount.rootPath}`)
    if (knowledgeParseService !== undefined) {
      await knowledgeParseService.startMount(mount.id, mount.rootPath)
      void knowledgeParseService.runNow(mount.id)
    }
    broadcastFoundersState()
    return { id: mount.id, name: mount.name, rootPath: mount.rootPath, mountedAt: mount.mountedAt, status: mount.status }
  }
  ipcMain.handle('xyai:founders-mount-knowledge', async (event) => {
    const selected = await pickXyaiDirectory(event)
    if (!selected) return null
    return registerKnowledgeMount(selected)
  })
  ipcMain.handle('xyai:founders-knowledge-pick-dir', async (event) => pickXyaiDirectory(event))
  ipcMain.handle('xyai:founders-knowledge-precheck', async (_event, rootPath: unknown) => {
    if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
    if (typeof rootPath !== 'string' || rootPath.trim() === '') throw new Error('请先选择要预检的文件夹路径')
    const pre = await preflightKnowledgeRoot(rootPath.trim())
    const normalized = pre.rootPath.toLocaleLowerCase()
    const duplicate = (knowledgeAssets.listMounts() ?? []).find(mount => mount.rootPath.toLocaleLowerCase() === normalized) ?? null
    return {
      rootPath: pre.rootPath,
      exists: pre.exists,
      isDirectory: pre.isDirectory,
      readable: pre.readable,
      warnings: pre.warnings,
      alreadyMounted: duplicate === null ? null : { id: duplicate.id, name: duplicate.name },
    }
  })
  ipcMain.handle('xyai:founders-knowledge-mount-path', async (_event, rootPath: unknown) => {
    if (typeof rootPath !== 'string' || rootPath.trim() === '') throw new Error('请先选择要挂接的文件夹路径')
    return registerKnowledgeMount(rootPath.trim())
  })
  ipcMain.handle('xyai:founders-list-knowledge-children', async (_event, id: unknown, relativePath: unknown) => {
    if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
    if (typeof id !== 'string' || (relativePath !== undefined && typeof relativePath !== 'string')) throw new Error('invalid knowledge tree request')
    return knowledgeAssets.listMountChildren(id, relativePath as string | undefined)
  })
  ipcMain.handle('xyai:founders-read-mounted-knowledge', async (_event, id: unknown, relativePath: unknown) => {
    if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
    if (typeof id !== 'string' || typeof relativePath !== 'string') throw new Error('invalid knowledge file request')
    return knowledgeAssets.readMountedFile(id, relativePath)
  })
  ipcMain.handle('xyai:founders-unmount-knowledge', async (_event, id: unknown) => {
    if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
    if (typeof id !== 'string') throw new Error('invalid knowledge mount id')
    await knowledgeAssets.unmount(id)
    if (knowledgeParseService !== undefined) await knowledgeParseService.detach(id)
    broadcastFoundersState()
  })
  ipcMain.handle('xyai:founders-rename-knowledge', async (_event, id: unknown, name: unknown) => {
    if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
    if (typeof id !== 'string' || typeof name !== 'string') throw new Error('invalid knowledge rename request')
    await knowledgeAssets.renameMount(id, name)
    broadcastFoundersState()
  })
  ipcMain.handle('xyai:knowledge-parse-refresh', async (_event, id: unknown) => {
    if (knowledgeParseService === undefined) throw new Error('XYAI knowledge parse service is not ready')
    if (typeof id !== 'string') throw new Error('invalid knowledge mount id')
    knowledgeParseService.refresh(id)
    return true
  })
  ipcMain.handle('xyai:knowledge-parse-files', async (_event, id: unknown) => {
    if (knowledgeParseService === undefined) throw new Error('XYAI knowledge parse service is not ready')
    if (typeof id !== 'string') throw new Error('invalid knowledge mount id')
    return knowledgeParseService.listFiles(id)
  })
  ipcMain.handle('xyai:knowledge-parse-retry-failed', async (_event, id: unknown) => {
    if (knowledgeParseService === undefined) throw new Error('XYAI knowledge parse service is not ready')
    if (typeof id !== 'string') throw new Error('invalid knowledge mount id')
    const retried = await knowledgeParseService.retryFailed(id)
    broadcastFoundersState()
    return retried
  })
  ipcMain.handle('xyai:knowledge-parse-preview', async (_event, id: unknown, relativePath: unknown) => {
    if (knowledgeParseService === undefined) throw new Error('XYAI knowledge parse service is not ready')
    if (typeof id !== 'string' || typeof relativePath !== 'string') throw new Error('invalid knowledge preview request')
    return knowledgeParseService.preview(id, relativePath)
  })
    ipcMain.on('xyai:kb-mention-toggle', () => { kbMentionExpanded = !kbMentionExpanded; layoutViews() })
  ipcMain.on('xyai:kb-mention-close', () => { kbMentionExpanded = false; layoutViews() })
  ipcMain.handle('xyai:knowledge-chat-model-status', async () => getLocalModelStatus())
  ipcMain.handle('xyai:knowledge-chat-model-refresh', async () => refreshLocalModelStatus())
  ipcMain.handle('xyai:knowledge-chat-ask', async (event, input: unknown) => {
    if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
    if (knowledgeParseService === undefined) throw new Error('XYAI knowledge parse service is not ready')
    const kbSleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const question = typeof value.question === 'string' ? value.question.trim().slice(0, 1200) : ''
    if (question === '') throw new Error('请先输入要问的问题')
    const rawMount = value.mountId === undefined || value.mountId === null ? null : value.mountId
    const mountId = typeof rawMount === 'string' && rawMount !== '' ? rawMount : null
    const mounts = (knowledgeAssets.listMounts() ?? []).map((m) => ({ id: m.id, name: m.name }))
    const cloudMount = mountId === null ? undefined : (cloudKnowledge?.list() ?? []).find((m) => m.id === mountId)
    if (cloudMount !== undefined && cloudKnowledge !== undefined) {
      const cloudResult = await cloudKnowledge.answer(cloudMount.id, question)
      const sender = event.sender
      const sendEvent = (payload: Record<string, unknown>): void => { if (!sender.isDestroyed()) sender.send('xyai:knowledge-chat-event', payload) }
      sendEvent({ type: 'start', question: cloudResult.question, scopeLabel: cloudResult.scopeLabel, mode: 'cloud' })
      for (const piece of chunkAnswerStream(cloudResult.text)) { sendEvent({ type: 'delta', text: piece }); await kbSleepMs(16) }
      sendEvent({ type: 'sources', sources: cloudResult.sources, matchedDocs: cloudResult.matchedDocs })
      sendEvent({ type: 'done' })
      return { ...cloudResult, answerMode: 'cloud' }
    }
    if (mountId !== null && mounts.findIndex((m) => m.id === mountId) === -1) throw new Error('所选知识库不存在或已解除挂接')
    const corpus = {
      listReady: (id: string): { readonly relPath: string }[] => {
        try {
          return (knowledgeParseService?.listFiles(id) ?? []).filter((row) => row.status === 'ready').map((row) => ({ relPath: row.relPath }))
        } catch {
          return []
        }
      },
      readText: async (id: string, relPath: string): Promise<string | undefined> => {
        try {
          return await knowledgeParseService?.preview(id, relPath)
        } catch {
          return undefined
        }
      },
    }
    const result = await buildKnowledgeChatAnswer(corpus, mounts, { question, scopeMountId: mountId })
    const sender = event.sender
    const sendEvent = (payload: Record<string, unknown>): void => {
      if (!sender.isDestroyed()) sender.send('xyai:knowledge-chat-event', payload)
    }
    const emitCorpusAnswer = async (): Promise<void> => {
      sendEvent({ type: 'start', question: result.question, scopeLabel: result.scopeLabel, scannedDocs: result.scannedDocs, mode: 'corpus' })
      for (const piece of chunkAnswerStream(result.text)) {
        sendEvent({ type: 'delta', text: piece })
        await kbSleepMs(16)
      }
      sendEvent({ type: 'sources', sources: result.sources, matchedDocs: result.matchedDocs })
      sendEvent({ type: 'done' })
    }
    const modelStatus = await getLocalModelStatus()
    const preferredModel = modelStatus.ready ? modelStatus.models[0] : undefined
    if (preferredModel === undefined || result.sources.length === 0) {
      await emitCorpusAnswer()
      return { ...result, answerMode: 'corpus', model: preferredModel }
    }
    try {
      const prompt = buildGroundedLocalModelPrompt(result)
      let modelText = ''
      sendEvent({ type: 'start', question: result.question, scopeLabel: result.scopeLabel, scannedDocs: result.scannedDocs, mode: 'local-model', model: preferredModel })
      await streamLocalModelChat(preferredModel, prompt, (delta: string): void => {
        modelText += delta
        sendEvent({ type: 'delta', text: delta })
      })
      const text = modelText.trim() === '' ? result.text : modelText.trim()
      sendEvent({ type: 'sources', sources: result.sources, matchedDocs: result.matchedDocs })
      sendEvent({ type: 'done' })
      return { ...result, text, answerMode: 'local-model', model: preferredModel }
    } catch (error: unknown) {
      desktopLog(`local model answer failed, falling back to corpus: ${redactDiagnosticText(String(error))}`)
      await emitCorpusAnswer()
      return { ...result, answerMode: 'corpus-fallback', model: preferredModel }
    }
  })
  ipcMain.handle('xyai:ima-configure', async (_event, input: unknown) => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const clientId = typeof value.clientId === 'string' ? value.clientId.trim() : ''
    const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : ''
    await cloudKnowledge.setCredentials(clientId, apiKey)
    imaConfigured = true
    broadcastFoundersState()
    return { configured: true }
  })
  ipcMain.handle('xyai:ima-list-knowledge-bases', async () => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    const bases = await cloudKnowledge.listKnowledgeBases()
    return { bases }
  })
  ipcMain.handle('xyai:ima-mount', async (_event, input: unknown) => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const knowledgeBaseId = typeof value.knowledgeBaseId === 'string' ? value.knowledgeBaseId.trim() : ''
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    if (knowledgeBaseId === '') throw new Error('请选择要挂接的 ima 知识库')
    const mount = await cloudKnowledge.add(knowledgeBaseId, name)
    broadcastFoundersState()
    return mount
  })
  ipcMain.handle('xyai:ima-unmount', async (_event, id: unknown) => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    if (typeof id !== 'string') throw new Error('invalid cloud mount id')
    await cloudKnowledge.remove(id)
    broadcastFoundersState()
  })
  ipcMain.handle('xyai:ima-list-items', async (_event, input: unknown) => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const mountId = typeof value.mountId === 'string' ? value.mountId : ''
    const folderId = typeof value.folderId === 'string' && value.folderId !== '' ? value.folderId : undefined
    if (mountId === '') throw new Error('invalid cloud mount id')
    const items = await cloudKnowledge.listItems(mountId, folderId)
    return { items }
  })
  ipcMain.handle('xyai:ima-read-item', async (_event, input: unknown) => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const mediaId = typeof value.mediaId === 'string' ? value.mediaId.trim() : ''
    if (mediaId === '') throw new Error('invalid media id')
    const credentials = await cloudKnowledge.credentials()
    if (credentials === undefined) throw new Error('尚未连接 ima，请先填写 Client ID 与 API Key')
    return getImaMediaInfo(credentials, mediaId)
  })
  ipcMain.handle('xyai:ima-tool', async (_event, input: unknown) => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const action = typeof value.action === 'string' ? value.action : ''
    const credentials = await cloudKnowledge.credentials()
    if (credentials === undefined) throw new Error('尚未连接 ima，请先填写 Client ID 与 API Key')
    const arg = (typeof value.args === 'object' && value.args !== null ? value.args : {}) as Record<string, unknown>
    switch (action) {
      case 'list_notebooks': return { items: await listImaNotebooks(credentials) }
      case 'list_notes': return { items: await listImaNotes(credentials, typeof arg.folderId === 'string' ? arg.folderId : undefined) }
      case 'search_notes': {
        const keyword = typeof arg.keyword === 'string' ? arg.keyword.trim() : ''
        if (keyword === '') throw new Error('请提供要检索的关键词')
        return { items: await searchImaNotes(credentials, keyword, arg.searchType === 1 ? 1 : 0) }
      }
      case 'read_note': {
        const noteId = typeof arg.noteId === 'string' ? arg.noteId.trim() : ''
        if (noteId === '') throw new Error('请提供笔记 ID')
        return { content: await getImaNoteContent(credentials, noteId) }
      }
      case 'create_note': {
        const content = typeof arg.content === 'string' ? arg.content : ''
        if (content.trim() === '') throw new Error('笔记内容不能为空')
        const noteId = await createImaNote(credentials, content, typeof arg.folderId === 'string' ? arg.folderId : undefined, typeof arg.folderName === 'string' ? arg.folderName : undefined)
        return { noteId }
      }
      case 'append_note': {
        const noteId = typeof arg.noteId === 'string' ? arg.noteId.trim() : ''
        const content = typeof arg.content === 'string' ? arg.content : ''
        if (noteId === '' || content.trim() === '') throw new Error('请提供笔记 ID 与要追加的内容')
        const id = await appendImaNote(credentials, noteId, content)
        return { noteId: id }
      }
      case 'import_urls': {
        const mountId = typeof arg.mountId === 'string' ? arg.mountId : ''
        const urls = Array.isArray(arg.urls) ? arg.urls.filter((item): item is string => typeof item === 'string') : []
        const mount = mountId === '' ? undefined : cloudKnowledge.get(mountId)
        if (mount === undefined) throw new Error('请选择要导入的目标 ima 知识库')
        if (urls.length === 0) throw new Error('请提供要导入的网页链接（1-10 个）')
        return { results: await importImaUrls(credentials, mount.knowledgeBaseId, urls) }
      }
      default: throw new Error('未知的 ima 工具操作：' + action)
    }
  })
  ipcMain.handle('xyai:ima-upload-local-files', async (_event, input: unknown) => {
    if (cloudKnowledge === undefined) throw new Error('云知识库服务未就绪')
    const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const mountId = typeof value.mountId === 'string' ? value.mountId : ''
    const mount = mountId === '' ? undefined : cloudKnowledge.get(mountId)
    if (mount === undefined) throw new Error('请选择要上传到的 ima 知识库')
    const credentials = await cloudKnowledge.credentials()
    if (credentials === undefined) throw new Error('尚未连接 ima，请先填写 Client ID 与 API Key')
    const filters = [{ name: 'ima 支持的文件', extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'markdown', 'html', 'htm', 'png', 'jpg', 'jpeg', 'webp', 'epub', 'mp3', 'm4a', 'wav', 'aac'] }]
    const pickTitle = '上传文件到 ima「' + mount.name + '」（传到知识库根目录）'
    const selection = await (mainWindow === undefined ? dialog.showOpenDialog({
      title: pickTitle,
      properties: ['openFile', 'multiSelections'],
      filters,
    }) : dialog.showOpenDialog(mainWindow, {
      title: pickTitle,
      properties: ['openFile', 'multiSelections'],
      filters,
    }))
    if (selection.canceled || selection.filePaths.length === 0) return { canceled: true, results: [] }
    const results: ImaUploadFileResult[] = []
    for (const filePath of selection.filePaths) {
      results.push(await importImaLocalFile(credentials, { knowledgeBaseId: mount.knowledgeBaseId, filePath }))
    }
    const okCount = results.filter((item) => item.ok).length
    desktopLog('xyai:ima-upload-local-files: ' + String(results.length) + ' picked, ' + String(okCount) + ' uploaded to ' + mount.name)
    broadcastFoundersState()
    return { canceled: false, results }
  })
ipcMain.handle('xyai:founders-create-production', async (_event, input: unknown) => {
    if (productionTracker === undefined) throw new Error('XYAI production tracker is not ready')
    const value = foundersObject(input)
    const taskId = foundersText(value.taskId, '关联任务')
    const goal = foundersText(value.goal, '运行目标')
    const sourceLines = Array.isArray(value.lines) ? value.lines : []
    const lines = sourceLines.filter((line): line is ProductionLine => typeof line === 'string' && PRODUCTION_LINES.includes(line as ProductionLine))
    if (lines.length === 0) throw new Error('至少选择一条生产线')
    const run = await productionTracker.create(taskId, goal, lines)
    broadcastFoundersState()
    return { id: run.id, status: run.status }
  })
  ipcMain.handle('xyai:founders-register-plugin', async (_event, input: unknown) => {
    if (mcpReviews === undefined) throw new Error('XYAI MCP 审查登记尚未就绪')
    const value = foundersObject(input)
    const server = await mcpReviews.register({ name: value.name, command: value.command, args: value.args, credentialNames: value.credentialNames })
    broadcastFoundersState()
    return { id: server.id, status: server.status }
  })
  ipcMain.handle('xyai:founders-agent-catalog-refresh', async (): Promise<Record<string, number>> => {
    const catalog = refreshAgentCatalog(true)
    return { skills: catalog.skills.length, plugins: catalog.plugins.length, builtins: catalog.builtins.length }
  })
  ipcMain.handle('xyai:founders-agent-skill-install', async (_event, input: unknown) => {
    const value = foundersObject(input)
    if (agentCatalogCache === undefined) refreshAgentCatalog(false)
    if (agentCatalogCache === undefined) throw new Error('能力清单尚未就绪，请稍后重试')
    const sourceDir = foundersText(value.sourceDir, '技能来源目录')
    const targetRootId = foundersText(value.targetRootId, '安装目标')
    const outcome = installSkillFiles(agentCatalogCache, sourceDir, targetRootId)
    if (outcome.ok && outcome.destination !== '') {
      agentCatalogCache = scanAgentCatalog({ dshHome: localRuntimePaths().dshHome })
      broadcastFoundersState()
    }
    return outcome
  })
  ipcMain.handle('xyai:founders-agent-skill-remove', async (_event, input: unknown) => {
    const value = foundersObject(input)
    if (agentCatalogCache === undefined) refreshAgentCatalog(false)
    if (agentCatalogCache === undefined) throw new Error('能力清单尚未就绪，请稍后重试')
    const targetRootId = foundersText(value.targetRootId, '安装目标')
    const dirName = foundersText(value.dirName, '技能目录名')
    const outcome = removeSkillFiles(agentCatalogCache, targetRootId, dirName)
    if (outcome.ok) {
      agentCatalogCache = scanAgentCatalog({ dshHome: localRuntimePaths().dshHome })
      broadcastFoundersState()
    }
    return outcome
  })
  ipcMain.handle('xyai:founders-agent-plugin-install', async (_event, input: unknown) => {
    const value = foundersObject(input)
    if (agentCatalogCache === undefined) refreshAgentCatalog(false)
    if (agentCatalogCache === undefined) throw new Error('能力清单尚未就绪，请稍后重试')
    const sourceDir = foundersText(value.sourceDir, '插件来源目录')
    const outcome = installPluginFiles(agentCatalogCache, sourceDir)
    if (outcome.ok) {
      agentCatalogCache = scanAgentCatalog({ dshHome: localRuntimePaths().dshHome })
      broadcastFoundersState()
    }
    return outcome
  })
  ipcMain.handle('xyai:founders-agent-plugin-remove', async (_event, input: unknown) => {
    const value = foundersObject(input)
    if (agentCatalogCache === undefined) refreshAgentCatalog(false)
    if (agentCatalogCache === undefined) throw new Error('能力清单尚未就绪，请稍后重试')
    const dirName = foundersText(value.dirName, '插件目录名')
    const outcome = removePluginFiles(agentCatalogCache, dirName)
    if (outcome.ok) {
      agentCatalogCache = scanAgentCatalog({ dshHome: localRuntimePaths().dshHome })
      broadcastFoundersState()
    }
    return outcome
  })
  ipcMain.handle('xyai:founders-agent-skill-import-local', async () => {
    if (agentCatalogCache === undefined) refreshAgentCatalog(false)
    if (agentCatalogCache === undefined) throw new Error('能力清单尚未就绪，请稍后重试')
    const selection = await (mainWindow === undefined ? dialog.showOpenDialog({
      title: '选择要导入的 Skills 文件夹（需含 SKILL.md）',
      properties: ['openDirectory'],
    }) : dialog.showOpenDialog(mainWindow, {
      title: '选择要导入的 Skills 文件夹（需含 SKILL.md）',
      properties: ['openDirectory'],
    }))
    if (selection.canceled || selection.filePaths[0] === undefined) return { ok: false, cancelled: true, message: '已取消。' }
    const outcome = importSkillDirectory(agentCatalogCache, selection.filePaths[0])
    if (outcome.ok) {
      agentCatalogCache = scanAgentCatalog({ dshHome: localRuntimePaths().dshHome })
      broadcastFoundersState()
    }
    return outcome
  })
  ipcMain.handle('xyai:founders-agent-plugin-import-local', async () => {
    if (agentCatalogCache === undefined) refreshAgentCatalog(false)
    if (agentCatalogCache === undefined) throw new Error('能力清单尚未就绪，请稍后重试')
    const selection = await (mainWindow === undefined ? dialog.showOpenDialog({
      title: '选择要导入的插件文件夹',
      properties: ['openDirectory'],
    }) : dialog.showOpenDialog(mainWindow, {
      title: '选择要导入的插件文件夹',
      properties: ['openDirectory'],
    }))
    if (selection.canceled || selection.filePaths[0] === undefined) return { ok: false, cancelled: true, message: '已取消。' }
    const outcome = importPluginDirectory(agentCatalogCache, selection.filePaths[0])
    if (outcome.ok) {
      agentCatalogCache = scanAgentCatalog({ dshHome: localRuntimePaths().dshHome })
      broadcastFoundersState()
    }
    return outcome
  })
  ipcMain.handle('xyai:founders-agent-open-path', async (_event, rawPath: unknown) => {
    if (agentCatalogCache === undefined) refreshAgentCatalog(false)
    if (agentCatalogCache === undefined) throw new Error('能力清单尚未就绪，请稍后重试')
    const target = foundersText(rawPath, '目录')
    if (!collectOpenablePaths(agentCatalogCache).has(target)) throw new Error('仅允许打开本页已识别的能力目录')
    const error = await shell.openPath(target)
    if (error !== '') throw new Error('无法打开目录：' + error)
    return { ok: true }
  })
  ipcMain.handle('xyai:factory-create-project', async (_event, input: unknown) => {
    if (productionFactory === undefined) throw new Error('七大 AI 生产线尚未就绪')
    const project = await productionFactory.createProject(foundersObject(input))
    activeFactoryProjectId = project.id
    broadcastFoundersState()
    return { id: project.id }
  })
  ipcMain.handle('xyai:factory-select-project', (_event, projectId: unknown) => {
    if (productionFactory === undefined) throw new Error('七大 AI 生产线尚未就绪')
    const id = foundersText(projectId, '生产项目')
    productionFactory.projectState(id)
    activeFactoryProjectId = id
    broadcastFoundersState()
  })
  ipcMain.handle('xyai:factory-save-contract', async (_event, input: unknown) => {
    if (productionFactory === undefined) throw new Error('七大 AI 生产线尚未就绪')
    const value = foundersObject(input); const projectId = foundersText(value.projectId, '生产项目')
    const contract = await productionFactory.saveContract(projectId, value)
    broadcastFoundersState()
    return contract
  })
  ipcMain.handle('xyai:factory-create-asset', async (_event, input: unknown) => {
    if (productionFactory === undefined) throw new Error('七大 AI 生产线尚未就绪')
    const value = foundersObject(input); const projectId = foundersText(value.projectId, '生产项目')
    const asset = await productionFactory.createAsset(projectId, value)
    broadcastFoundersState()
    return { id: asset.id, status: asset.status }
  })
  ipcMain.handle('xyai:factory-create-agent', async (_event, input: unknown) => {
    if (productionFactory === undefined) throw new Error('七大 AI 生产线尚未就绪')
    const value = foundersObject(input); const projectId = foundersText(value.projectId, '生产项目')
    const asset = await productionFactory.createAgentBlueprint(projectId, value)
    broadcastFoundersState()
    return { id: asset.id, status: asset.status }
  })
  ipcMain.handle('xyai:custom-agent-generate', async (_event, input: unknown) => await generateCustomAgent(input))
  ipcMain.handle('xyai:custom-agent-job', async (_event, id: unknown) => await customAgentJob(foundersText(id, '生成任务')))
  ipcMain.handle('xyai:factory-feedback', async (_event, input: unknown) => {
    if (productionFactory === undefined) throw new Error('七大 AI 生产线尚未就绪')
    const value = foundersObject(input)
    await productionFactory.feedback(foundersText(value.projectId, '生产项目'), foundersText(value.assetId, '生产线资产'), value.message)
    broadcastFoundersState()
  })
  ipcMain.handle('xyai:founders-authenticate', async (_event, input: unknown) => await authenticateFounders(input))

  /** Model operations are available only to the sandboxed XYAI development view. */
  const requireModelMarketplaceSender = (event: IpcMainEvent): ModelMarketplaceService => {
    if (dshView === undefined || event.sender.id !== dshView.webContents.id) {
      throw new Error('模型广场仅允许由 XYAI Founders 开发空间发起')
    }
    if (modelMarketplace === undefined) throw new Error('模型广场尚未就绪')
    return modelMarketplace
  }
  const publishSnapshot = async (event: IpcMainEvent): Promise<void> => {
    const service = requireModelMarketplaceSender(event)
    try {
      const snapshot = await service.snapshot()
      if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-refresh', snapshot)
    } catch (cause) {
      if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-refresh', { error: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  ipcMain.on('xyai:model-marketplace-refresh', event => { void publishSnapshot(event) })
  ipcMain.on('xyai:model-marketplace-recommend', event => {
    void (async () => {
      try {
        const snapshot = await requireModelMarketplaceSender(event).snapshot()
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-recommend', { models: snapshot.models })
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-recommend', { models: [], error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-local-models', event => {
    void (async () => {
      try {
        const snapshot = await requireModelMarketplaceSender(event).snapshot()
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-local-models', { models: snapshot.localModels })
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-local-models', { models: [], error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-ollama-status', event => {
    void (async () => {
      try {
        const snapshot = await requireModelMarketplaceSender(event).snapshot()
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-status', snapshot.ollamaStatus)
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-status', { installed: false, running: false, error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-ollama-models', event => {
    void (async () => {
      try {
        const snapshot = await requireModelMarketplaceSender(event).snapshot()
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-models', { models: snapshot.ollamaModels })
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-models', { models: [], error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-start-ollama', event => {
    void (async () => {
      try {
        const status = await requireModelMarketplaceSender(event).startOllama()
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-status', status)
        await publishSnapshot(event)
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-status', { installed: true, running: false, startError: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-pull-native', (event, rawModelId: unknown) => {
    if (typeof rawModelId !== 'string' || rawModelId.trim() === '') return
    void (async () => {
      try {
        const service = requireModelMarketplaceSender(event)
        await service.pullNative(rawModelId, progress => {
          if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-native-progress', { modelName: rawModelId, ...progress })
        })
        await publishSnapshot(event)
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-native-progress', { modelName: rawModelId, status: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-pull-ollama', (event, rawModelId: unknown) => {
    if (typeof rawModelId !== 'string' || rawModelId.trim() === '') return
    void (async () => {
      try {
        const service = requireModelMarketplaceSender(event)
        for await (const progress of service.pullOllama(rawModelId)) {
          if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-progress', { modelName: rawModelId, ...progress })
        }
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-progress', { modelName: rawModelId, status: 'done', percent: 100 })
        await publishSnapshot(event)
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-ollama-progress', { modelName: rawModelId, status: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-benchmark', (event, rawPath: unknown) => {
    if (typeof rawPath !== 'string' || rawPath.trim() === '') return
    void (async () => {
      try {
        const result = await requireModelMarketplaceSender(event).benchmark(rawPath)
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-benchmark', { filePath: rawPath, result })
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-benchmark', { filePath: rawPath, error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
  ipcMain.on('xyai:model-marketplace-route', event => {
    void (async () => {
      try {
        const snapshot = await requireModelMarketplaceSender(event).snapshot()
        // Do not route by filesystem scan order: an 8 GiB GPU could otherwise
        // default to a much larger model just because its filename sorts first.
        // Prefer the already-deployed small Chinese/general or coding models;
        // the user can always select a larger local model explicitly.
        const preferred = snapshot.localModels.find(model => /qwen2\.5.*coder.*3b/i.test(model.fileName))
          ?? snapshot.localModels.find(model => /qwen3.*1[._-]?7b/i.test(model.fileName))
          ?? snapshot.localModels.find(model => /gemma.*270m/i.test(model.fileName))
          ?? snapshot.localModels[0]
        const routes = preferred === undefined ? [] : [{
          capability: { displayName: preferred.inferredName, backend: 'XYAI 本地 GGUF', contextWindow: 8192 },
          reasons: ['已按本机硬件优先选择已部署的轻量本地模型；可在对话输入框的“XYAI 本地模型”中切换为其他已注册模型。'],
        }]
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-route', { routes })
      } catch (cause) {
        if (!event.sender.isDestroyed()) event.sender.send('xyai:model-marketplace-route', { routes: [], error: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
  })
}

function foundersObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('请求格式不正确')
  return value as Record<string, unknown>
}

function foundersText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${label}不能为空`)
  return text
}

/** Authenticate only through the bundled local XYOS backend.  Passwords and
 * returned bearer tokens never cross back into either Founders renderer. */
async function authenticateFounders(input: unknown): Promise<Record<string, unknown>> {
  if (xyosOrigin === undefined) throw new Error('XYOS 本地服务尚未启动')
  const value = foundersObject(input)
  const mode = value.mode === 'register' ? 'register' : 'login'
  const email = foundersText(value.email, '邮箱').slice(0, 320)
  const password = foundersText(value.password, '密码')
  if (password.length < 6) throw new Error('密码至少需要 6 位')
  const response = await fetch(`${xyosOrigin}/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(mode === 'register' && typeof value.nickname === 'string' && value.nickname.trim() ? { nickname: value.nickname.trim().slice(0, 80) } : {}),
      ...(mode === 'register' && typeof value.company === 'string' && value.company.trim() ? { company: value.company.trim().slice(0, 120) } : {}),
    }),
  })
  const body: unknown = await response.json().catch(() => undefined)
  const result = foundersObject(body)
  if (!response.ok || result.success !== true) {
    throw new Error(typeof result.error === 'string' ? result.error : '认证未完成')
  }
  const data = foundersObject(result.data)
  const tokens = foundersObject(data.tokens)
  const accessToken = typeof tokens.accessToken === 'string' ? tokens.accessToken : ''
  if (!accessToken) throw new Error('认证响应未提供有效访问令牌')
  foundersAccessToken = accessToken
  const user = foundersObject(data.user)
  foundersAccount = {
    authenticated: true,
    email: typeof user.email === 'string' ? user.email : email,
    ...(typeof user.nickname === 'string' && user.nickname ? { nickname: user.nickname } : {}),
    ...(typeof data.tenant === 'object' && data.tenant !== null && !Array.isArray(data.tenant) && typeof (data.tenant as Record<string, unknown>).name === 'string' ? { tenantName: (data.tenant as Record<string, unknown>).name as string } : {}),
  }
  desktopLog(`founders account authenticated: ${foundersAccount.email ?? 'unknown'}`)
  broadcastFoundersState()
  return { account: { ...foundersAccount } }
}

async function generateCustomAgent(input: unknown): Promise<Record<string, unknown>> {
  if (xyosOrigin === undefined || foundersAccessToken === undefined) throw new Error('请先在左下角登录或注册 XYOS 账号')
  const value = foundersObject(input); const blueprint = evaluateAgentBlueprint(value)
  const sourceIds = Array.isArray(value.knowledgeAssetIds) ? value.knowledgeAssetIds.filter((id): id is string => typeof id === 'string').slice(0, 5) : []
  const documents = (await Promise.all(sourceIds.map(async id => {
    const source = knowledgeAssets?.list().find(asset => asset.id === id); if (source === undefined) throw new Error('所选知识资产不存在')
    return (await knowledgeAssets?.exportTextCorpus(id) ?? []).slice(0, 20).map(item => ({ name: item.path, content: item.text.slice(0, 2 * 1024 * 1024) }))
  }))).flat().slice(0, 20)
  const response = await fetch(`${xyosOrigin}/api/industry-agent/generate`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${foundersAccessToken}` }, body: JSON.stringify({ name: blueprint.name, industry: blueprint.industry, description: blueprint.description, productionType: blueprint.productionType, productionSpec: blueprint.productionSpec, productionGates: blueprint.productionGates, ...(blueprint.workflow === undefined ? {} : { workflow: blueprint.workflow }), ...(blueprint.team === undefined ? {} : { team: blueprint.team }), ...(typeof value.experience === 'string' ? { experience: value.experience } : {}), documents }) })
  const result = foundersObject(await response.json().catch(() => undefined)); if (!response.ok || result.success !== true) throw new Error(typeof result.error === 'string' ? result.error : '智能体生成未启动')
  return foundersObject(result.data)
}
async function customAgentJob(id: string): Promise<Record<string, unknown>> {
  if (xyosOrigin === undefined || foundersAccessToken === undefined) throw new Error('请先登录 XYOS 账号')
  const response = await fetch(`${xyosOrigin}/api/industry-agent/jobs/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${foundersAccessToken}` } }); const result = foundersObject(await response.json().catch(() => undefined)); if (!response.ok || result.success !== true) throw new Error(typeof result.error === 'string' ? result.error : '无法查询生成任务'); return foundersObject(result.data)
}

/**
 * Native, user-initiated import entry.  This is deliberately separate from
 * DSH's renderer so an imported task never needs an external source at run
 * time and no untrusted page receives filesystem privileges.
 */
async function importExternalTasksFromDialog(): Promise<void> {
  if (taskLedger === undefined) throw new Error('XYAI task ledger is not ready')
  const parent = mainWindow
  const selected = await (parent === undefined ? dialog.showOpenDialog({
    title: '选择要导入的外部 AI 任务目录',
    properties: ['openDirectory'],
  }) : dialog.showOpenDialog(parent, {
    title: '选择要导入的外部 AI 任务目录',
    properties: ['openDirectory'],
  }))
  const root = selected.filePaths[0]
  if (selected.canceled || root === undefined) return
  const candidates = await discoverTasksInSelectedRoot({
    providerId: 'selected-external-source',
    providerLabel: '用户选择的外部任务目录',
    root,
  })
  if (candidates.length === 0) {
    await (parent === undefined ? silentMessageBox({ type: 'info', title: APP_NAME, message: '所选目录中没有发现可导入的任务元数据。' }) : silentMessageBox(parent, { type: 'info', title: APP_NAME, message: '所选目录中没有发现可导入的任务元数据。' }))
    return
  }
  const confirmationOptions: MessageBoxOptions = {
    type: 'question',
    buttons: [`导入 ${candidates.length} 项`, '取消'],
    defaultId: 0,
    cancelId: 1,
    title: '确认导入外部任务',
    message: `已在用户选择的目录中发现 ${candidates.length} 个任务记录。`,
    detail: '仅导入标题、目标和来源校验信息；不会复制原始聊天、密钥或运行依赖。导入后任务可独立于原目录恢复。',
  }
  const confirmation = await (parent === undefined ? silentMessageBox(confirmationOptions) : silentMessageBox(parent, confirmationOptions))
  if (confirmation.response !== 0) return
  let imported = 0
  let updated = 0
  for (const candidate of candidates) {
    const result = await importExternalTask(taskLedger, candidate)
    if (result.imported) imported += 1
    if (result.updated) updated += 1
  }
  desktopLog(`external task import: imported=${imported} updated=${updated} candidates=${candidates.length}`)
  const completionOptions: MessageBoxOptions = {
    type: 'info',
    title: '外部任务导入完成',
    message: `已本地化导入 ${imported} 项任务${updated ? `，更新 ${updated} 项来源记录` : ''}。`,
    detail: '任务账本保存在 XYAI Studio 用户数据目录；后续删除原始目录不会影响导入任务。',
  }
  await (parent === undefined ? silentMessageBox(completionOptions) : silentMessageBox(parent, completionOptions))
  broadcastFoundersState()
}

/** Explicit file selection only; copied content has no runtime source dependency. */
async function importKnowledgeAssetFromDialog(): Promise<void> {
  if (knowledgeAssets === undefined) throw new Error('XYAI knowledge asset store is not ready')
  const parent = mainWindow
  const selection = await (parent === undefined ? dialog.showOpenDialog({
    title: '选择要导入的知识文件', properties: ['openFile'],
  }) : dialog.showOpenDialog(parent, {
    title: '选择要导入的知识文件', properties: ['openFile'],
  }))
  if (selection.canceled || !selection.filePaths[0]) return
  const asset = await knowledgeAssets.importSelected(selection.filePaths[0])
  desktopLog(`knowledge asset imported: id=${asset.id} files=${asset.files.length} bytes=${asset.totalBytes}`)
  await (parent === undefined ? silentMessageBox({
    type: 'info', title: APP_NAME, message: '知识资产已复制到 XYAI 本地存储', detail: `已导入 ${asset.files.length} 个文件。原始位置不再是运行时依赖。`,
  }) : silentMessageBox(parent, {
    type: 'info', title: APP_NAME, message: '知识资产已复制到 XYAI 本地存储', detail: `已导入 ${asset.files.length} 个文件。原始位置不再是运行时依赖。`,
  }))
  broadcastFoundersState()
}

function createTray(): void {
  tray = new Tray(trayImage())
  tray.setToolTip(APP_NAME)
  const template: MenuItemConstructorOptions[] = [
    { label: '打开主窗口', click: () => { void lifecycle?.showWindow() } },
    { label: '导入外部 AI 任务…', click: () => { void importExternalTasksFromDialog().catch((error: unknown) => { desktopLog(`external task import failed: ${redactDiagnosticText(String(error))}`) }) } },
    { label: '导入知识资产…', click: () => { switchSpace('dev'); selectFoundersModule('knowledge'); void lifecycle?.showWindow() } },
    { label: '切换到业务空间（XYOS）', click: () => { switchSpace('biz'); void lifecycle?.showWindow() } },
    { label: '切换到生态空间（cnxy.ai）', click: () => { switchSpace('eco'); void lifecycle?.showWindow() } },
    { label: '关于我们', click: () => { switchSpace('about'); void lifecycle?.showWindow() } },
    { type: 'separator' },
    { label: '退出', click: () => { void requestAppQuit() } },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.on('click', () => { void lifecycle?.showWindow() })
}

function releaseAppQuit(): void {
  quitReleased = true
  tray?.destroy()
  tray = undefined
  app.quit()
}

/** Join explicit quit requests even while the Host or window is still starting. */
function requestAppQuit(): Promise<void> {
  if (lifecycle !== undefined) return lifecycle.requestQuit()
  bootQuitPromise ??= Promise.all([
    host?.shutdown() ?? Promise.resolve(),
    xyosHost?.shutdown() ?? Promise.resolve(),
    credentialBroker?.close() ?? Promise.resolve(),
  ]).catch((error: unknown) => {
    console.error('desktop shutdown failed:', error)
  }).then(() => {
    releaseAppQuit()
  })
  return bootQuitPromise
}

async function boot(): Promise<void> {
  if (bootQuitPromise !== undefined) return
  desktopLog('boot: start')
  const paths = hostPaths()
  desktopLog(`boot: hostPaths node=${paths.nodeExecutable} cli=${paths.cliEntry}`)
  assertHostArtifacts(paths)
  const runtime = localRuntimePaths()
  process.env.XYAI_COMPONENTS_DIR = join(app.getPath('userData'), 'components')
  installMigratedIndustryAgent(runtime.dshHome)
  themePreference = loadThemePreference(app.getPath('userData'))
  nativeTheme.themeSource = themePreference
  try {
    syncDshThemePreference(runtime.dshHome, themePreference)
  } catch (error: unknown) {
    desktopLog(`boot: sync dsh theme preference failed: ${redactDiagnosticText(String(error))}`)
  }
  nativeTheme.on('updated', () => {
    if (themePreference === 'system') broadcastTheme()
  })
  desktopLog(`boot: theme preference=${themePreference} dark=${String(themeState().dark)}`)
  modelMarketplace = new ModelMarketplaceService()
  taskLedger = new TaskLedger(runtime.taskLedgerPath)
  await taskLedger.load()
  desktopLog(`boot: xyai task ledger ready (${taskLedger.list().length} task(s))`)
  developmentSessions = new DevelopmentSessionRegistry(runtime.developmentSessionsPath, taskLedger)
  await developmentSessions.load()
  desktopLog(`boot: xyai development sessions ready (${developmentSessions.list().length} session(s))`)
  knowledgeAssets = new KnowledgeAssetStore(runtime.knowledgeAssetRegistryPath, runtime.knowledgeAssetContentDirectory)
  await knowledgeAssets.load()
  desktopLog(`boot: xyai knowledge assets ready (${knowledgeAssets.list().length} asset(s))`)
  mcpReviews = new McpReviewRegistry(runtime.mcpReviewRegistryPath)
  await mcpReviews.load()
  desktopLog(`boot: xyai MCP reviews ready (${mcpReviews.list().length} server(s))`)
  productionTracker = new ProductionTracker(runtime.productionRunsPath, taskLedger)
  await productionTracker.load()
  desktopLog(`boot: xyai production tracker ready (${productionTracker.list().length} run(s))`)
  productionFactory = new ProductionFactory(runtime.productionFactoryPath, runtime.productionWorkspaceRoot, knowledgeAssets, mcpReviews)
  await productionFactory.load()
  desktopLog(`boot: xyai production factory ready (${productionFactory.listProjects().length} project(s))`)
  credentialVault = new CredentialVault(runtime.credentialVaultPath, safeStorage)
  const startedCredentialBroker = await startCredentialBroker(credentialVault)
  credentialBroker = startedCredentialBroker
  desktopLog('boot: desktop credential broker ready')
  cloudKnowledge = new CloudKnowledgeStore(runtime.cloudKnowledgeRegistryPath, credentialVault)
  await cloudKnowledge.load()
  imaConfigured = await cloudKnowledge.hasCredentials()
  desktopLog(`boot: xyai cloud knowledge ready (${cloudKnowledge.list().length} ima mount(s))`)
  host = createHostSupervisor({
    spawnHost: () => spawnDshWeb({
      ...paths,
      env: {
        ...process.env,
        DSH_DESKTOP: '1',
        DSH_HOME: runtime.dshHome,
      },
    }),
    log: chunk => process.stderr.write(chunk),
    onUnexpectedExit: ({ code, signal }) => {
      console.error(`desktop Host exited unexpectedly (code ${String(code)}, signal ${String(signal)})`)
      void requestAppQuit()
    },
  })
  if (hasLocalXyosBackend()) {
    xyosHost = createHostSupervisor({
      readinessPrefix: 'xyos backend: ',
      spawnHost: () => spawnXyosBackend({
        nodeExecutable: paths.nodeExecutable,
        electronRunAsNode: paths.electronRunAsNode,
        backendDir: xyosBackendDir(),
        env: {
        ...process.env,
        // The verified IndustryAgent client uses XYOS's established desktop
        // origin as its account fallback.  Keep that contract stable so the
        // same XYOS users authenticate in development and business spaces.
        PORT: xyosDesktopPort,
        DATABASE_PATH: runtime.databasePath,
        XYOS_UPLOAD_DIR: runtime.uploadPath,
        XYOS_RUNTIME_WORKSPACE: runtime.xyosWorkspacePath,
        XYOS_DIST_DIR: xyosDistDir(),
        JWT_SECRET: process.env.XYOS_JWT_SECRET ?? 'xyos-studio-dev-jwt-2026',
        COOKIE_SECRET: process.env.XYOS_COOKIE_SECRET ?? 'xyos-studio-dev-cookie-2026',
        // This is a local desktop backend on loopback, not an internet-facing
        // SaaS endpoint.  Founders registration must work on a fresh install.
        PUBLIC_REGISTRATION_ENABLED: process.env.XYOS_PUBLIC_REGISTRATION_ENABLED ?? 'true',
        AIR_GAP_MODE: process.env.XYOS_AIR_GAP_MODE ?? 'false',
        XYAI_CREDENTIAL_BROKER_URL: startedCredentialBroker.origin,
        XYAI_CREDENTIAL_BROKER_TOKEN: startedCredentialBroker.token,
        },
      }),
      log: chunk => process.stderr.write(chunk),
      onUnexpectedExit: ({ code, signal }) => {
        console.error(`XYOS backend exited unexpectedly (code ${String(code)}, signal ${String(signal)})`)
        void requestAppQuit()
      },
    })
    xyosOrigin = await xyosHost.start()
    desktopLog(`boot: xyos backend ready at ${sanitizeDiagnosticUrl(xyosOrigin)}`)
  } else {
    desktopLog('boot: XYOS local runtime is not installed; starting core edition')
  }
  hostOrigin = await host.start()
  desktopLog(`boot: dsh web ready at ${sanitizeDiagnosticUrl(hostOrigin)}`)
  hardenSession()
  setupIpc()
  knowledgeParseService = new KnowledgeParseService(runtime.knowledgeParseDirectory)
  knowledgeParseService.onUpdate(() => broadcastFoundersState())
  knowledgeParseService.start()
  for (const mount of knowledgeAssets.listMounts()) {
    await knowledgeParseService.startMount(mount.id, mount.rootPath)
    void knowledgeParseService.runNow(mount.id)
  }
  desktopLog(`boot: xyai knowledge parse service ready (${knowledgeAssets.listMounts().length} mount(s) seeded)`)
  lifecycle = createDesktopLifecycle({
    getWindow: () => mainWindow,
    createWindow: createMainWindow,
    disposeHost: async () => {
      await host?.shutdown()
      await xyosHost?.shutdown()
      await credentialBroker?.close()
    },
    quit: releaseAppQuit,
    reportError: (error) => { console.error('desktop shutdown failed:', error) },
  })
  createTray()
  await lifecycle.showWindow()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { void lifecycle?.showWindow() })
  app.on('activate', () => { void lifecycle?.showWindow() })
  app.on('window-all-closed', () => {
    // Tray and Host own application lifetime on every platform.
  })
  app.on('before-quit', (event: Event) => {
    if (quitReleased) return
    event.preventDefault()
    void requestAppQuit()
  })
  app.whenReady().then(boot).catch(async (error: unknown) => {
    desktopLog(`boot failed: ${redactDiagnosticText(error instanceof Error ? error.stack ?? error.message : String(error), 1200)}`)
    console.error('desktop startup failed:', error)
    if (bootQuitPromise === undefined) {
      await silentMessageBox({
        type: 'error',
        title: `${APP_NAME} failed to start`,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    await requestAppQuit()
  })
  app.on('render-process-gone', (_event, _webContents, details) => {
    desktopLog(`render-process-gone: ${JSON.stringify(details)}`)
  })
}
