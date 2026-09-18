/**
 * FreeOS-parity disk weight scan — GGUF/GGML + some HF safetensors causal-LM dirs.
 * Extends the ollama-discover walker; does not call LM Studio HTTP.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ModelEntry } from '@xyai/contracts';
import {
  inferOllamaRole,
  toOllamaModelEntry,
  walkFiles,
} from './ollama-discover.js';

/** FreeOS probe cap for disk weight hits. */
export const DISK_WEIGHT_CAP = 40;

export const WEIGHT_FILE_RE = /\.(gguf|ggml)$/i;
export const SKIP_DIR_NAMES = new Set([
  '$recycle.bin',
  'system volume information',
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  'temp',
  'tmp',
  'blobs',
  'xet',
  'datasets',
  '.npm',
  '.pnpm-store',
  'i386',
  'winsxs',
]);

export type DiskScanMode = 'common' | 'manual' | 'full';

export type DiskWeightHit = {
  filePath: string;
  displayName: string;
  sizeBytes: number;
  kind: 'gguf' | 'ggml' | 'huggingface';
  projector: boolean;
};

function homeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.USERPROFILE || env.HOME || '';
}

function pushUnique(out: string[], value: string | undefined): void {
  if (!value) return;
  const resolved = path.resolve(value);
  if (!out.includes(resolved)) out.push(resolved);
}

function winLocalAppData(env: NodeJS.ProcessEnv): string {
  return (
    env.LOCALAPPDATA ||
    (homeDir(env) ? path.join(homeDir(env), 'AppData', 'Local') : '')
  );
}

function winRoamingAppData(env: NodeJS.ProcessEnv): string {
  return (
    env.APPDATA ||
    (homeDir(env) ? path.join(homeDir(env), 'AppData', 'Roaming') : '')
  );
}

/** Drive letters that exist (Windows). Used for E:\models without hardcoding one letter. */
export function existingWindowsDriveLetters(
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = existsSync,
): string[] {
  const letters: string[] = [];
  for (const code of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${code}:\\`;
    if (exists(root)) letters.push(code);
  }
  if (!letters.length && env.SystemDrive) {
    const d = env.SystemDrive.replace(':', '').toUpperCase();
    if (d) letters.push(d);
  }
  return letters;
}

/**
 * FreeOS common_model_roots + well-known XYAI/DSH + Windows models/Freework folders.
 */
export function commonModelRoots(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const home = homeDir(env);
  const out: string[] = [];
  if (env.OLLAMA_MODELS) pushUnique(out, env.OLLAMA_MODELS);
  if (env.XYAI_LOCAL_MODEL_DIRS) {
    for (const part of env.XYAI_LOCAL_MODEL_DIRS.split(path.delimiter)) {
      pushUnique(out, part.trim());
    }
  }
  if (home) {
    pushUnique(out, path.join(home, '.cache', 'huggingface'));
    pushUnique(out, path.join(home, '.cache', 'lm-studio'));
    pushUnique(out, path.join(home, '.lmstudio', 'models'));
    pushUnique(out, path.join(home, 'Documents', 'LM Studio', 'models'));
    pushUnique(out, path.join(home, 'models'));
    pushUnique(out, path.join(home, '.models'));
    pushUnique(out, path.join(home, 'jan', 'models'));
    pushUnique(out, path.join(home, '.ollama', 'models'));
    pushUnique(out, path.join(home, '.dsh', 'xyai', 'models'));
    pushUnique(out, path.join(home, '.xyai', 'models'));
    pushUnique(out, path.join(home, 'dsh', 'xyai', 'models'));
  }
  if (platform === 'win32') {
    const local = winLocalAppData(env);
    const roaming = winRoamingAppData(env);
    if (local) {
      pushUnique(out, path.join(local, 'nomic.ai', 'GPT4All'));
      pushUnique(out, path.join(local, 'Programs', 'Ollama'));
      pushUnique(out, path.join(local, 'Ollama', 'models'));
    }
    if (roaming) {
      pushUnique(out, path.join(roaming, 'nomic.ai', 'GPT4All'));
    }
    for (const letter of existingWindowsDriveLetters(env)) {
      pushUnique(out, `${letter}:\\models`);
      pushUnique(out, `${letter}:\\Models`);
      pushUnique(out, `${letter}:\\360Downloads\\Freework Models`);
      pushUnique(out, `${letter}:\\360Downloads\\FreeworkModels`);
    }
  }
  return out;
}

/** Home / Downloads / Documents — FreeOS default user-dir layer. */
export function extraManualScanRoots(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const home = homeDir(env);
  const out: string[] = [];
  if (!home) return out;
  pushUnique(out, home);
  pushUnique(out, path.join(home, 'Downloads'));
  pushUnique(out, path.join(home, 'Documents'));
  pushUnique(out, path.join(home, 'Desktop'));
  return out;
}

/** Full-disk roots (Windows letters / Unix /). */
export function fullDiskScanRoots(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    return existingWindowsDriveLetters(env).map((letter) => `${letter}:\\`);
  }
  return ['/'];
}

export function shouldSkipDirName(name: string): boolean {
  return SKIP_DIR_NAMES.has(name.toLowerCase());
}

export function isProjectorWeightName(name: string): boolean {
  return /mmproj|mm-proj|projector|vision-proj/i.test(name);
}

export function sanitizeOllamaCreateName(raw: string): string {
  const base = raw
    .replace(/\.(gguf|ggml)$/i, '')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base.slice(0, 80) || 'local-gguf';
}

export function weightFileToEntry(hit: DiskWeightHit): ModelEntry {
  const role = hit.projector ? 'vision' : inferOllamaRole(hit.displayName);
  const id = `${hit.kind}:${sanitizeOllamaCreateName(hit.displayName)}`;
  return {
    ...toOllamaModelEntry(hit.displayName, {
      role,
      sizeBytes: hit.sizeBytes,
      source: hit.kind === 'huggingface' ? 'huggingface' : 'gguf',
      harnessIds: ['ollama'],
    }),
    id,
    path: hit.filePath,
    version: hit.projector ? 'projector' : 'local',
  };
}

function isHfCausalLmDir(dir: string): boolean {
  const cfgPath = path.join(dir, 'config.json');
  if (!existsSync(cfgPath)) return false;
  let cfg: {
    architectures?: unknown;
    model_type?: unknown;
  };
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as typeof cfg;
  } catch {
    return false;
  }
  const arch = JSON.stringify(cfg.architectures ?? '');
  const mt = String(cfg.model_type ?? '');
  if (/embed|bert\b|clip|whisper|t5\b/i.test(mt) && !/causal/i.test(arch)) {
    return false;
  }
  if (/CausalLM|LlamaForCausalLM|Qwen|GPT|Mistral|Phi|Gemma|MiniCPM/i.test(arch)) {
    return true;
  }
  if (/llama|qwen|gpt|mistral|phi|gemma|yi|deepseek|chatglm|internlm|minicpm/i.test(mt)) {
    return true;
  }
  try {
    return readdirSync(dir).some((n) => /\.safetensors$/i.test(n));
  } catch {
    return false;
  }
}

function dirHasSafetensors(dir: string): boolean {
  try {
    return readdirSync(dir).some(
      (n) => /\.safetensors$/i.test(n) || n === 'model.safetensors.index.json',
    );
  } catch {
    return false;
  }
}

export type WalkWeightOptions = {
  maxDepth?: number;
  cap?: number;
  exists?: (p: string) => boolean;
};

/**
 * Bounded walk for weight files. Reuses walkFiles only for Ollama manifests;
 * this walker skips system dirs and stops at {@link DISK_WEIGHT_CAP}.
 */
export function walkWeightHits(
  root: string,
  acc: DiskWeightHit[],
  opts: WalkWeightOptions = {},
): DiskWeightHit[] {
  const cap = opts.cap ?? DISK_WEIGHT_CAP;
  const maxDepth = opts.maxDepth ?? 6;
  const exists = opts.exists ?? existsSync;
  if (acc.length >= cap) return acc;
  if (!root || !exists(root)) return acc;

  const visit = (dir: string, depth: number): void => {
    if (acc.length >= cap || depth > maxDepth) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    if (isHfCausalLmDir(dir) && dirHasSafetensors(dir)) {
      let size = 0;
      for (const n of names) {
        if (!/\.safetensors$/i.test(n)) continue;
        try {
          size += statSync(path.join(dir, n)).size;
        } catch {
          /* skip one file */
        }
      }
      acc.push({
        filePath: dir,
        displayName: path.basename(dir),
        sizeBytes: size,
        kind: 'huggingface',
        projector: false,
      });
      if (acc.length >= cap) return;
    }
    for (const name of names) {
      if (acc.length >= cap) return;
      if (name.startsWith('.') && depth > 0 && name !== '.dsh' && name !== '.xyai' && name !== '.ollama' && name !== '.cache' && name !== '.lmstudio' && name !== '.models') {
        if (shouldSkipDirName(name)) continue;
      }
      if (shouldSkipDirName(name)) continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        visit(full, depth + 1);
        continue;
      }
      if (!WEIGHT_FILE_RE.test(name)) continue;
      acc.push({
        filePath: full,
        displayName: name,
        sizeBytes: st.size,
        kind: /\.ggml$/i.test(name) ? 'ggml' : 'gguf',
        projector: isProjectorWeightName(name),
      });
    }
  };

  try {
    const st = statSync(root);
    if (st.isFile() && WEIGHT_FILE_RE.test(root)) {
      acc.push({
        filePath: root,
        displayName: path.basename(root),
        sizeBytes: st.size,
        kind: /\.ggml$/i.test(root) ? 'ggml' : 'gguf',
        projector: isProjectorWeightName(path.basename(root)),
      });
      return acc;
    }
  } catch {
    return acc;
  }
  visit(root, 0);
  return acc;
}

export function scanDiskWeightModels(options: {
  extraRoots?: string[];
  mode?: DiskScanMode;
  cap?: number;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): ModelEntry[] {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const cap = options.cap ?? DISK_WEIGHT_CAP;
  const roots = [...commonModelRoots(env, platform)];
  if (options.mode === 'manual' || options.mode === 'full') {
    for (const r of extraManualScanRoots(env)) pushUnique(roots, r);
  }
  if (options.mode === 'full') {
    for (const r of fullDiskScanRoots(env, platform)) pushUnique(roots, r);
  }
  for (const extra of options.extraRoots || []) pushUnique(roots, extra);

  const hits: DiskWeightHit[] = [];
  for (const root of roots) {
    walkWeightHits(root, hits, {
      cap,
      maxDepth: options.mode === 'full' ? 8 : 6,
    });
    if (hits.length >= cap) break;
  }
  const seen = new Set<string>();
  const entries: ModelEntry[] = [];
  for (const hit of hits) {
    const key = path.resolve(hit.filePath).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(weightFileToEntry(hit));
  }
  return entries;
}

/** Keep walkFiles imported so Ollama manifest fallback stays the same walker family. */
export function listManifestFilesUnder(modelsRoot: string): string[] {
  return walkFiles(path.join(modelsRoot, 'manifests'));
}
