/** Renderer typings for the preload-exposed API */

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

export interface XyaiApi {
  getStatus: () => Promise<XyaiStatus>;
  sendMessage: (content: string) => Promise<{ ok: true }>;
  onEvent: (callback: (event: XyaiAgentEvent) => void) => () => void;
}

declare global {
  interface Window {
    xyai: XyaiApi;
  }
}

export {};
