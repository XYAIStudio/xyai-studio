/**
 * Persist per-session transcript + rolling handoff under userData/sessions/
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  emptySessionMemory,
  type ChatMessage,
  type SessionMemoryState,
} from './context-pack.js';

export interface PersistedSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  memory: SessionMemoryState;
}

let overrideUserData: string | null = null;

export function setSessionUserDataDir(dir: string): void {
  overrideUserData = dir;
}

function root(): string {
  const base = overrideUserData || process.cwd();
  return path.join(base, 'sessions');
}

function sessionFile(id: string): string {
  const safe = id.replace(/[^\w.-]+/g, '_');
  return path.join(root(), `${safe}.json`);
}

export function loadSession(id: string): PersistedSession | null {
  const fp = sessionFile(id);
  if (!existsSync(fp)) return null;
  try {
    const raw = JSON.parse(readFileSync(fp, 'utf8')) as PersistedSession;
    if (!raw || raw.id !== id) return null;
    return {
      id,
      title: typeof raw.title === 'string' ? raw.title : '对话',
      updatedAt: raw.updatedAt || new Date().toISOString(),
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      memory: raw.memory || emptySessionMemory(),
    };
  } catch {
    return null;
  }
}

export function saveSession(doc: PersistedSession): void {
  mkdirSync(root(), { recursive: true });
  writeFileSync(sessionFile(doc.id), JSON.stringify(doc, null, 2), 'utf8');
}

export function listSessionIds(): string[] {
  const dir = root();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}
