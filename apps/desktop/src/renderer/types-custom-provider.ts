/** Renderer-side custom provider types (mirrors main/custom-providers). */

export type CustomProviderRuntime = 'codex' | 'claude-code' | 'pi';
export type CustomProviderAuth = 'apiKey' | 'oauth' | 'none';
export type CustomProviderProtocol =
  | 'openai-responses'
  | 'chat-completions'
  | 'anthropic-messages';

export type CustomProviderPresetId =
  | 'deepseek'
  | 'dashscope'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'custom';

export interface CustomProviderHeader {
  name: string;
  value: string;
}

export interface CustomProviderModel {
  id: string;
  label: string;
  contextTokens?: number;
}

export interface CustomProvider {
  id: string;
  name: string;
  runtime: CustomProviderRuntime;
  auth: CustomProviderAuth;
  protocol: CustomProviderProtocol;
  baseUrl: string;
  requestPath?: string;
  apiKey?: string;
  headers?: CustomProviderHeader[];
  models: CustomProviderModel[];
}
