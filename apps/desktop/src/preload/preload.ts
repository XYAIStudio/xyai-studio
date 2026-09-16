/**
 * Preload — contextBridge safe API for the renderer.
 * Compiled to CommonJS (preload.cjs) so sandbox:true stays compatible.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

export interface XyaiStatus {
  isMock: boolean;
  binarySource: string | null;
  binaryPath: string | null;
}

export interface XyaiAgentEvent {
  type: string;
  timestamp: string;
  sessionId: string;
  taskId?: string;
  payload?: unknown;
}

const api = {
  getStatus: (): Promise<XyaiStatus> => ipcRenderer.invoke('xyai:status'),

  sendMessage: (content: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke('xyai:chat-send', { content }),

  onEvent: (callback: (event: XyaiAgentEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: XyaiAgentEvent): void => {
      callback(data);
    };
    ipcRenderer.on('xyai:chat-event', listener);
    return () => {
      ipcRenderer.removeListener('xyai:chat-event', listener);
    };
  },
};

contextBridge.exposeInMainWorld('xyai', api);

export type XyaiApi = typeof api;
