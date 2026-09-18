/** Shared chat renderer types (thin; mirrors xyai-api status slices). */

export type SessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ModelOption = { id: string; label: string; hint?: string };

export type XyaiStatus = {
  isMock: boolean;
  binarySource: string | null;
  binaryPath: string | null;
  modelId?: string;
  forceMock?: boolean;
  models?: ModelOption[];
  localModels?: ModelOption[];
  activeSessionId?: string;
  sessions?: SessionSummary[];
  isSending?: boolean;
  accessMode?: 'default' | 'auto' | 'full';
};

export type ChatCitation = {
  id: string;
  kbId: string;
  title: string;
  relativePath: string;
  sourcePath: string;
  sourceUrl?: string;
  openHref: string;
  snippet: string;
};

export type ChatMsgAction = {
  id: 'start-ollama';
  label: string;
};

export type ChatMsg = {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  text: string;
  streaming?: boolean;
  citations?: ChatCitation[];
  action?: ChatMsgAction;
};

export type AgentEvent = {
  type: string;
  sessionId: string;
  payload?: unknown;
};
