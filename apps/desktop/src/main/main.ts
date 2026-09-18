/**
 * Electron main — thin host window + IPC to CodexHost / ModelHub.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import type { AgentEvent } from '@xyai/contracts';
import { CodexHost } from './codex-host.js';
import {
  findOpenXyosRuntimeRoot,
  getOpenXyosServerBaseUrl,
  resolveOpenXyos,
  restartOpenXyosServices,
  stopOpenXyosServer,
} from './openxyos-host.js';
import { createInteropHost, type InteropHost } from '@xyai/xyos-bridge';
import { setSettingsUserDataDir } from './settings.js';
import { ModelHubHost } from './model-hub-host.js';
import { normalizeCloudProviders } from './cloud-providers.js';
import { normalizeCustomProviders } from './custom-providers.js';
import {
  listOpenAiCompatModels,
  testOpenAiCompatConnection,
} from './openai-compat.js';
import {
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  loadCollabState,
  removeSessionMeta,
  setCollapsed,
  setCollabUserDataDir,
  updateProject,
  updateTask,
  upsertSessionMeta,
  type CollabSessionMeta,
  type SessionKind,
} from './collab-store.js';
import { KnowledgeHost } from './knowledge/knowledge-host.js';
import { registerKnowledgeIpc } from './knowledge/register-ipc.js';
import {
  registerPersonalizeIpc,
  setPersonalizeUserDataDir,
} from './personalize/register-ipc.js';
import {
  registerKbPreviewSchemePrivileged,
  registerKbPreviewProtocolHandler,
} from './knowledge/kb-preview-protocol.js';

declare const __xyai_module_dir: string | undefined;

function getModuleDir(): string {
  if (typeof __xyai_module_dir === 'string' && __xyai_module_dir.length > 0) {
    return __xyai_module_dir;
  }
  try {
    const u = import.meta.url;
    if (typeof u === 'string' && u.startsWith('file:')) {
      return path.dirname(fileURLToPath(u));
    }
  } catch {
    /* ignore */
  }
  return process.cwd();
}

const moduleDir = getModuleDir();

let mainWindow: BrowserWindow | null = null;
let host: CodexHost | null = null;
let modelHub: ModelHubHost | null = null;
let knowledgeHost: KnowledgeHost | null = null;
let interopHost: InteropHost | null = null;

function getInteropHost(): InteropHost {
  if (!interopHost) {
    interopHost = createInteropHost({
      userDataDir: app.getPath('userData'),
      openXyosRoot: () => findOpenXyosRuntimeRoot(),
      openXyosBaseUrl: () => getOpenXyosServerBaseUrl(),
      interopSecret: () =>
        process.env.XYAI_INTEROP_SECRET?.trim() || 'studio',
    });
  }
  return interopHost;
}

function getHost(): CodexHost {
  if (!host) {
    const ud = app.getPath('userData');
    setSettingsUserDataDir(ud);
    setCollabUserDataDir(ud);
    host = new CodexHost();
  }
  return host;
}

function getModelHub(): ModelHubHost {
  if (!modelHub) modelHub = new ModelHubHost(app.getPath('userData'));
  return modelHub;
}

function getKnowledgeHost(): KnowledgeHost {
  if (!knowledgeHost) {
    knowledgeHost = new KnowledgeHost(app.getPath('userData'), {
      onParseProgress: (job) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('xyai:kb-parse-progress', job);
          }
        }
      },
    });
  }
  return knowledgeHost;
}

function preloadPath(): string {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath + '.unpacked', 'preload.cjs'),
    path.join(path.dirname(appPath), 'app.asar.unpacked', 'preload.cjs'),
    path.join(appPath, 'preload.cjs'),
    path.join(moduleDir, 'preload.cjs'),
    path.join(moduleDir, '../preload/preload.cjs'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return path.join(appPath, 'preload.cjs');
}

function rendererIndex(): string {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'renderer', 'index.html'),
    path.join(moduleDir, 'renderer', 'index.html'),
    path.join(moduleDir, '../renderer', 'index.html'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return path.join(appPath, 'renderer', 'index.html');
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const preload = preloadPath();
  const indexHtml = rendererIndex();
  console.log('[xyai] appPath=', app.getAppPath());
  console.log('[xyai] preload=', preload, 'exists=', existsSync(preload));
  console.log('[xyai] renderer=', indexHtml, 'exists=', existsSync(indexHtml));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'XYAI Studio',
    backgroundColor: '#eef4ff',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  void mainWindow.loadFile(indexHtml);

  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow!.webContents
      .executeJavaScript(
        'typeof window.xyai + "|" + (window.xyai ? Object.keys(window.xyai).join(",") : "")',
      )
      .then((v) => console.log('[xyai] renderer bridge=', v))
      .catch((e) => console.error('[xyai] bridge probe failed', e));
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPathArg, error) => {
    console.error('[xyai] preload-error', preloadPathArg, error);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('xyai:get-settings', () => {
    const h = getHost();
    return { settings: h.getSettings(), status: h.getStatus() };
  });

  ipcMain.handle(
    'xyai:set-settings',
    async (_event, partial: Record<string, unknown>) => {
      const h = getHost();
      const accessModeRaw = partial.accessMode;
      const accessMode =
        accessModeRaw === 'default' ||
        accessModeRaw === 'auto' ||
        accessModeRaw === 'full'
          ? accessModeRaw
          : undefined;
      const settings = await h.applySettings({
        modelId: typeof partial.modelId === 'string' ? partial.modelId : undefined,
        forceMock:
          typeof partial.forceMock === 'boolean' ? partial.forceMock : undefined,
        codexBin: typeof partial.codexBin === 'string' ? partial.codexBin : undefined,
        cloudProviders:
          partial.cloudProviders && typeof partial.cloudProviders === 'object'
            ? normalizeCloudProviders(
                partial.cloudProviders as Parameters<
                  typeof normalizeCloudProviders
                >[0],
              )
            : undefined,
        customProviders: Array.isArray(partial.customProviders)
          ? normalizeCustomProviders(partial.customProviders)
          : undefined,
        accessMode,
      });
      return { settings, status: h.getStatus() };
    },
  );

  ipcMain.handle('xyai:sessions-list', () => getHost().listSessions());

  ipcMain.handle(
    'xyai:session-create',
    (_event, payload: { title?: unknown }) => {
      const title =
        typeof payload?.title === 'string' ? payload.title : undefined;
      const session = getHost().createSession(title);
      return { session, status: getHost().getStatus() };
    },
  );

  ipcMain.handle(
    'xyai:session-switch',
    (_event, payload: { id?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      const ok = Boolean(id && getHost().switchSession(id));
      return { ok, status: getHost().getStatus() };
    },
  );

  ipcMain.handle(
    'xyai:session-delete',
    async (_event, payload: { id?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return { ok: false, status: getHost().getStatus() };
      await getHost().deleteSession(id);
      return { ok: true, status: getHost().getStatus() };
    },
  );

  // —— Collab rail (projects / tasks / session meta) ——
  ipcMain.handle('xyai:collab-get', () => loadCollabState());

  ipcMain.handle(
    'xyai:collab-project-create',
    (_e, payload: { name?: unknown; cwd?: unknown }) => {
      const name = typeof payload?.name === 'string' ? payload.name : '未命名项目';
      const cwd = typeof payload?.cwd === 'string' ? payload.cwd : '';
      return createProject({ name, cwd });
    },
  );

  ipcMain.handle(
    'xyai:collab-project-update',
    (_e, payload: { id?: unknown; name?: unknown; cwd?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return loadCollabState();
      return updateProject(id, {
        name: typeof payload?.name === 'string' ? payload.name : undefined,
        cwd: typeof payload?.cwd === 'string' ? payload.cwd : undefined,
      });
    },
  );

  ipcMain.handle(
    'xyai:collab-project-delete',
    (_e, payload: { id?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return loadCollabState();
      return deleteProject(id);
    },
  );

  ipcMain.handle(
    'xyai:collab-task-create',
    (_e, payload: { projectId?: unknown; name?: unknown }) => {
      const projectId =
        typeof payload?.projectId === 'string' ? payload.projectId : '';
      const name = typeof payload?.name === 'string' ? payload.name : '未命名任务';
      if (!projectId) return loadCollabState();
      return createTask({ projectId, name });
    },
  );

  ipcMain.handle(
    'xyai:collab-task-update',
    (
      _e,
      payload: { id?: unknown; name?: unknown; archived?: unknown },
    ) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return loadCollabState();
      return updateTask(id, {
        name: typeof payload?.name === 'string' ? payload.name : undefined,
        archived:
          typeof payload?.archived === 'boolean' ? payload.archived : undefined,
      });
    },
  );

  ipcMain.handle(
    'xyai:collab-task-delete',
    (_e, payload: { id?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return loadCollabState();
      return deleteTask(id);
    },
  );

  ipcMain.handle(
    'xyai:collab-session-upsert',
    (_e, payload: CollabSessionMeta) => {
      if (!payload || typeof payload.sessionId !== 'string') {
        return loadCollabState();
      }
      const kind: SessionKind = payload.kind === 'group' ? 'group' : 'dm';
      return upsertSessionMeta({
        sessionId: payload.sessionId,
        kind,
        projectId: String(payload.projectId || 'proj-default'),
        taskId: String(payload.taskId || 'task-general'),
        agentIds: Array.isArray(payload.agentIds)
          ? payload.agentIds.filter((a) => typeof a === 'string')
          : ['agent-general'],
        title: typeof payload.title === 'string' ? payload.title : undefined,
      });
    },
  );

  ipcMain.handle(
    'xyai:collab-session-remove',
    (_e, payload: { sessionId?: unknown }) => {
      const sessionId =
        typeof payload?.sessionId === 'string' ? payload.sessionId : '';
      if (!sessionId) return loadCollabState();
      return removeSessionMeta(sessionId);
    },
  );

  ipcMain.handle(
    'xyai:collab-set-collapsed',
    (
      _e,
      payload: {
        projectId?: unknown;
        taskId?: unknown;
        collapsed?: unknown;
      },
    ) => {
      return setCollapsed({
        projectId:
          typeof payload?.projectId === 'string' ? payload.projectId : undefined,
        taskId: typeof payload?.taskId === 'string' ? payload.taskId : undefined,
        collapsed: payload?.collapsed === true,
      });
    },
  );

  ipcMain.handle('xyai:collab-pick-directory', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const opts = {
      properties: ['openDirectory' as const],
      title: '选择项目工作目录',
    };
    const res = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths[0]) {
      return { ok: false as const, path: '' };
    }
    return { ok: true as const, path: res.filePaths[0] };
  });

  ipcMain.handle('xyai:pick-files', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const opts = {
      properties: ['openFile' as const, 'multiSelections' as const],
      title: '选择要附加的文件',
    };
    const res = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths.length) {
      return { ok: false as const, paths: [] as string[] };
    }
    return { ok: true as const, paths: res.filePaths };
  });

  ipcMain.handle(
    'xyai:open-external',
    async (_event, payload: { url?: unknown }) => {
      const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
      if (!url || !/^https?:\/\//i.test(url)) {
        return { ok: false as const, message: 'invalid url' };
      }
      try {
        await shell.openExternal(url);
        return { ok: true as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, message };
      }
    },
  );

  ipcMain.handle('xyai:model-snapshot', async () => {
    return getModelHub().snapshot();
  });

  ipcMain.handle('xyai:model-install-dep', async () => {
    return getModelHub().installDependency();
  });

  ipcMain.handle(
    'xyai:model-pull',
    async (event, payload: { name?: unknown }) => {
      const name = typeof payload?.name === 'string' ? payload.name : '';
      if (!name) return { ok: false, message: 'missing model name' };
      const sender = event.sender;
      return getModelHub().pullModel(name, (line) => {
        if (!sender.isDestroyed()) {
          sender.send('xyai:model-pull-progress', { name, line });
        }
      });
    },
  );

  
  ipcMain.handle(
    'xyai:custom-provider-test',
    async (_event, payload: Record<string, unknown>) => {
      const baseUrl = typeof payload?.baseUrl === 'string' ? payload.baseUrl : '';
      const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey : '';
      const requestPath =
        typeof payload?.requestPath === 'string' ? payload.requestPath : undefined;
      const headers = Array.isArray(payload?.headers)
        ? (payload.headers as { name?: unknown; value?: unknown }[])
            .map((h) => ({
              name: typeof h?.name === 'string' ? h.name : '',
              value: typeof h?.value === 'string' ? h.value : '',
            }))
            .filter((h) => h.name)
        : [];
      return testOpenAiCompatConnection({
        baseUrl,
        apiKey,
        requestPath,
        headers,
      });
    },
  );

  ipcMain.handle(
    'xyai:custom-provider-fetch-models',
    async (_event, payload: Record<string, unknown>) => {
      const baseUrl = typeof payload?.baseUrl === 'string' ? payload.baseUrl : '';
      const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey : '';
      const headers = Array.isArray(payload?.headers)
        ? (payload.headers as { name?: unknown; value?: unknown }[])
            .map((h) => ({
              name: typeof h?.name === 'string' ? h.name : '',
              value: typeof h?.value === 'string' ? h.value : '',
            }))
            .filter((h) => h.name)
        : [];
      return listOpenAiCompatModels({ baseUrl, apiKey, headers });
    },
  );

ipcMain.handle('xyai:status', () => {
    try {
      return getHost().getStatus();
    } catch (err) {
      console.error('[xyai] status failed', err);
      return {
        isMock: true,
        binarySource: null,
        binaryPath: null,
        modelId: 'codex:gpt-5',
        forceMock: true,
        models: [],
        localModels: [],
        activeSessionId: '',
        sessions: [],
        isSending: false,
      };
    }
  });

  ipcMain.handle('xyai:chat-stop', () => {
    getHost().stopTurn();
    return { ok: true as const };
  });

  ipcMain.handle(
    'xyai:chat-send',
    async (event, payload: { content?: unknown }) => {
      const content =
        typeof payload?.content === 'string' ? payload.content : '';
      const sender = event.sender;
      for await (const ev of getHost().sendMessage(content)) {
        if (sender.isDestroyed()) break;
        sender.send('xyai:chat-event', ev as AgentEvent);
      }
      return { ok: true as const };
    },
  );

  
  ipcMain.handle('xyai:openxyos-resolve', async () => resolveOpenXyos());

  ipcMain.handle('xyai:openxyos-restart-services', async () => restartOpenXyosServices());

  ipcMain.handle('xyai:openxyos-open-folder', async () => {
    const res = await resolveOpenXyos();
    if (!res.root || res.root === '(unset)') {
      return { ok: false as const, message: 'no openxyos root' };
    }
    const err = await shell.openPath(res.root);
    return err
      ? ({ ok: false as const, message: err })
      : ({ ok: true as const });
  });

  // —— Dev ↔ Biz asset interop ——
  ipcMain.handle('xyai:interop-list-outgoing', async () => {
    return getInteropHost().listOutgoingAssets();
  });
  ipcMain.handle('xyai:interop-list-incoming', async () => {
    return getInteropHost().listIncomingAssets();
  });
  ipcMain.handle('xyai:interop-list-pending-biz', async () => {
    return getInteropHost().listPendingBizInstalls();
  });
  ipcMain.handle('xyai:interop-list-installed-biz', async () => {
    return getInteropHost().listInstalledBiz();
  });
  ipcMain.handle('xyai:interop-list-installed-dev', async () => {
    return getInteropHost().listInstalledDev();
  });
  ipcMain.handle(
    'xyai:interop-push-to-biz',
    async (
      _e,
      payload: {
        kind?: unknown;
        name?: unknown;
        description?: unknown;
        payload?: unknown;
      },
    ) => {
      const kind = payload?.kind;
      if (
        kind !== 'agent' &&
        kind !== 'knowledge-mount' &&
        kind !== 'model-provider'
      ) {
        return { ok: false as const, message: 'invalid kind' };
      }
      const name = typeof payload?.name === 'string' ? payload.name : '';
      if (!name) return { ok: false as const, message: 'missing name' };
      try {
        const host = getInteropHost();
        const asset = await host.pushToBiz({
          kind,
          name,
          description:
            typeof payload?.description === 'string'
              ? payload.description
              : undefined,
          payload:
            payload?.payload && typeof payload.payload === 'object'
              ? (payload.payload as Record<string, unknown>)
              : {},
        });
        const pub = host.lastPublishResult;
        return {
          ok: true as const,
          asset,
          publishOk: pub?.ok ?? true,
          publishMessage: pub?.message,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, message };
      }
    },
  );
  ipcMain.handle(
    'xyai:interop-install',
    async (_e, payload: { assetId?: unknown }) => {
      const assetId = typeof payload?.assetId === 'string' ? payload.assetId : '';
      if (!assetId) return { ok: false as const, message: 'missing assetId' };
      try {
        const host = getInteropHost();
        const asset = await host.installIncoming(assetId);
        const pub = host.lastPublishResult;
        return {
          ok: true as const,
          asset,
          publishOk: pub?.ok ?? true,
          publishMessage: pub?.message,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, message };
      }
    },
  );
  ipcMain.handle(
    'xyai:interop-register-dev',
    async (_e, payload: { assetId?: unknown }) => {
      const assetId = typeof payload?.assetId === 'string' ? payload.assetId : '';
      if (!assetId) return { ok: false as const, message: 'missing assetId' };
      try {
        const asset = await getInteropHost().registerInDev(assetId);
        return { ok: true as const, asset };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, message };
      }
    },
  );
  ipcMain.handle(
    'xyai:interop-select',
    async (_e, payload: { assetId?: unknown; space?: unknown }) => {
      const assetId = typeof payload?.assetId === 'string' ? payload.assetId : '';
      const space = payload?.space === 'dev' ? 'dev' : 'biz';
      if (!assetId) return { ok: false as const, message: 'missing assetId' };
      try {
        const host = getInteropHost();
        const asset = await host.selectAsset(assetId, space);
        const pub = host.lastPublishResult;
        return {
          ok: true as const,
          asset,
          publishOk: pub?.ok ?? true,
          publishMessage: pub?.message,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, message };
      }
    },
  );
  ipcMain.handle(
    'xyai:interop-push-to-dev',
    async (
      _e,
      payload: {
        kind?: unknown;
        name?: unknown;
        description?: unknown;
        payload?: unknown;
      },
    ) => {
      const kind = payload?.kind;
      if (
        kind !== 'agent' &&
        kind !== 'knowledge-mount' &&
        kind !== 'model-provider'
      ) {
        return { ok: false as const, message: 'invalid kind' };
      }
      const name = typeof payload?.name === 'string' ? payload.name : '';
      if (!name) return { ok: false as const, message: 'missing name' };
      try {
        const asset = getInteropHost().pushToDev({
          kind,
          name,
          description:
            typeof payload?.description === 'string'
              ? payload.description
              : undefined,
          payload:
            payload?.payload && typeof payload.payload === 'object'
              ? (payload.payload as Record<string, unknown>)
              : {},
        });
        return { ok: true as const, asset };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, message };
      }
    },
  );

  registerKnowledgeIpc(getKnowledgeHost, () => mainWindow);
  registerPersonalizeIpc();
}

registerKbPreviewSchemePrivileged();

app.whenReady().then(async () => {
  registerKbPreviewProtocolHandler();
  const ud = app.getPath('userData');
  setSettingsUserDataDir(ud);
  setCollabUserDataDir(ud);
  setPersonalizeUserDataDir(ud);
  getKnowledgeHost();
  buildMenu();
  registerIpc();
  try {
    await getHost().ensureStarted();
  } catch (err) {
    console.error('[xyai] ensureStarted failed', err);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopOpenXyosServer();
  void host?.dispose();
});
