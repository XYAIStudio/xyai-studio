/**
 * Electron main — thin host window + IPC to CodexHost.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import type { AgentEvent } from '@xyai/contracts';
import { CodexHost } from './codex-host.js';

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

function getHost(): CodexHost {
  if (!host) host = new CodexHost();
  return host;
}

/** Resolve preload; prefer asar.unpacked when electron-builder unpacks it. */
function preloadPath(): string {
  const appPath = app.getAppPath();
  const candidates = [
    // unpacked sibling of app.asar
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
  // Last resort: path inside asar (Electron can still load it)
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
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: 'XYAI Studio',
    backgroundColor: '#1a1b1e',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      // Packaged preload + asar is unreliable with sandbox:true on Windows NSIS builds.
      // Keep contextIsolation; revisit sandbox after asarUnpack is proven.
      sandbox: false,
    },
  });

  void mainWindow.loadFile(indexHtml);

  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow!.webContents
      .executeJavaScript('typeof window.xyai + \"|\" + (window.xyai ? Object.keys(window.xyai).join(\",\") : \"\")')
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
  ipcMain.handle('xyai:status', () => {
    try {
      return getHost().getStatus();
    } catch (err) {
      console.error('[xyai] status failed', err);
      return {
        isMock: true,
        binarySource: null,
        binaryPath: null,
      };
    }
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
}

app.whenReady().then(async () => {
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
  void host?.dispose();
});