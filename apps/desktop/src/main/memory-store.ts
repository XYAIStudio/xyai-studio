/**
 * Cross-session durable memory facts under userData/memory/facts.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface DurableMemoryFile {
  version: 1;
  updatedAt: string;
  facts: string[];
}

let overrideUserData: string | null = null;

export function setMemoryUserDataDir(dir: string): void {
  overrideUserData = dir;
}

function root(): string {
  const base = overrideUserData || process.cwd();
  return path.join(base, 'memory');
}

function filePath(): string {
  return path.join(root(), 'facts.json');
}

export function loadDurableFacts(): string[] {
  const fp = filePath();
  if (!existsSync(fp)) return [];
  try {
    const raw = JSON.parse(readFileSync(fp, 'utf8')) as DurableMemoryFile;
    return Array.isArray(raw.facts)
      ? raw.facts.map((f) => String(f).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function saveDurableFacts(facts: string[]): string[] {
  mkdirSync(root(), { recursive: true });
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const f of facts) {
    const t = f.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(t);
  }
  // hard cap facts list
  const capped = uniq.slice(-200);
  const doc: DurableMemoryFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    facts: capped,
  };
  writeFileSync(filePath(), JSON.stringify(doc, null, 2), 'utf8');
  return capped;
}

export function mergeDurableFacts(additions: string[]): string[] {
  return saveDurableFacts([...loadDurableFacts(), ...additions]);
}
