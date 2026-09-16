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
  return path.dirname(fileURLToPath(import.meta.url));
}
const moduleDir = getModuleDir();

let mainWindow: BrowserWindow | null = null;
const host = new CodexHost();

function preloadPath(): string {
  // dist/main/main.js → ../preload; pack-out/main.cjs → ./preload
  const candidates = [
    path.join(moduleDir, 'preload.cjs'),
    path.join(moduleDir, '../preload/preload.cjs'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

function rendererIndex(): string {
  const candidates = [
    path.join(moduleDir, 'renderer/index.html'),
    path.join(moduleDir, '../renderer/index.html'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
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
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: 'XYAI Studio',
    backgroundColor: '#1a1b1e',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void mainWindow.loadFile(rendererIndex());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('xyai:status', () => host.getStatus());

  ipcMain.handle(
    'xyai:chat-send',
    async (event, payload: { content?: unknown }) => {
      const content =
        typeof payload?.content === 'string' ? payload.content : '';
      const sender = event.sender;
      for await (const ev of host.sendMessage(content)) {
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
  await host.ensureStarted();
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
  void host.dispose();
});
