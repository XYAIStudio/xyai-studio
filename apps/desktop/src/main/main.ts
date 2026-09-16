/**
 * Electron main — thin host window + IPC to CodexHost.
 */

import path from 'node:path';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const host = new CodexHost();

function preloadPath(): string {
  return path.join(__dirname, '../preload/preload.cjs');
}

function rendererIndex(): string {
  return path.join(__dirname, '../renderer/index.html');
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
