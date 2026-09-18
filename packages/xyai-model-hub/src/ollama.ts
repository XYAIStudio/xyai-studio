import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DependencyStatus, ModelEntry } from '@xyai/contracts';
import {
  listOllamaNamesFromDiskRoot,
  ollamaModelsRoots,
  parseOllamaListOutput,
  pickDiscoverySource,
  toOllamaModelEntry,
  type LocalModelDiscoverySource,
} from './ollama-discover.js';
import { mapOllamaNetworkError } from './ollama-errors.js';
import { startOllamaWithDeps, type StartOllamaResult } from './ollama-start.js';

const execFileAsync = promisify(execFile);

const OLLAMA_API = process.env.XYAI_OLLAMA_HOST ?? 'http://127.0.0.1:11434';

function ollamaBinCandidates(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const out: string[] = [];
  if (process.platform === 'win32') {
    const local =
      process.env.LOCALAPPDATA ||
      (home ? path.join(home, 'AppData', 'Local') : '');
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    if (local) out.push(path.join(local, 'Programs', 'Ollama', 'ollama.exe'));
    out.push(path.join(pf, 'Ollama', 'ollama.exe'));
  } else {
    out.push(
      '/usr/local/bin/ollama',
      '/usr/bin/ollama',
      '/opt/homebrew/bin/ollama',
    );
    if (home) out.push(path.join(home, '.local', 'bin', 'ollama'));
  }
  return out;
}

export function resolveOllamaBin(): string | null {
  for (const c of ollamaBinCandidates()) {
    if (existsSync(c)) return c;
  }
  return 'ollama'; // rely on PATH
}

async function runOllama(
  args: string[],
  timeoutMs = 15000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const bin = resolveOllamaBin();
  if (!bin) return { ok: false, stdout: '', stderr: 'ollama not found' };
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env },
    });
    return { ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? e.message ?? ''),
    };
  }
}

export async function probeOllamaApi(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${OLLAMA_API}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function isOllamaInstalled(): Promise<boolean> {
  const bin = resolveOllamaBin();
  if (bin && bin !== 'ollama' && existsSync(bin)) return true;
  return (await runOllama(['--version'])).ok;
}

export async function getOllamaDependencyStatus(): Promise<DependencyStatus> {
  const bin = resolveOllamaBin();
  const installed = await isOllamaInstalled();
  const running = await probeOllamaApi();
  let version: string | null = null;
  const ver = await runOllama(['--version']);
  if (ver.ok) {
    const m = ver.stdout.match(/[\d.]+/);
    version = m?.[0] ?? (ver.stdout.trim().slice(0, 40) || null);
  }
  return {
    id: 'ollama',
    name: 'Ollama',
    installed,
    running,
    version,
    path: bin && bin !== 'ollama' ? bin : null,
    installCommand:
      process.platform === 'win32'
        ? 'winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements'
        : 'curl -fsSL https://ollama.com/install.sh | sh',
    canStart: installed && !running,
  };
}

interface OllamaTagModel {
  name: string;
  size?: number;
  modified_at?: string;
  details?: { family?: string; parameter_size?: string };
}

export async function listOllamaModelsFromApi(): Promise<ModelEntry[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${OLLAMA_API}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: OllamaTagModel[] };
    return (data.models ?? []).map((m) =>
      toOllamaModelEntry(m.name, {
        version: m.details?.parameter_size ?? 'local',
        sizeBytes: m.size,
      }),
    );
  } catch {
    return [];
  }
}

export async function listOllamaModelsFromCli(): Promise<ModelEntry[]> {
  const listed = await runOllama(['list']);
  if (!listed.ok) return [];
  return parseOllamaListOutput(listed.stdout).map((name) =>
    toOllamaModelEntry(name),
  );
}

export async function listOllamaModelsFromDisk(): Promise<ModelEntry[]> {
  const names: string[] = [];
  for (const root of ollamaModelsRoots()) {
    names.push(...listOllamaNamesFromDiskRoot(root));
  }
  return [...new Set(names)].map((name) => toOllamaModelEntry(name));
}

export async function discoverOllamaModels(): Promise<{
  models: ModelEntry[];
  source: LocalModelDiscoverySource;
}> {
  const api = await listOllamaModelsFromApi();
  if (api.length) return { models: api, source: 'api' };
  const cli = await listOllamaModelsFromCli();
  if (cli.length) return { models: cli, source: 'cli' };
  const disk = await listOllamaModelsFromDisk();
  return pickDiscoverySource(api, cli, disk);
}

/** API first, then `ollama list`, then ~/.ollama/models manifests. */
export async function listOllamaModels(): Promise<ModelEntry[]> {
  const discovered = await discoverOllamaModels();
  return discovered.models;
}

/** One-click install via winget (Windows) or install script hint. Non-interactive. */
export async function installOllama(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      message: '请在终端执行: curl -fsSL https://ollama.com/install.sh | sh',
    };
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      'winget',
      [
        'install',
        '-e',
        '--id',
        'Ollama.Ollama',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ],
      { timeout: 600_000, windowsHide: true, encoding: 'utf8' },
    );
    return {
      ok: true,
      message: String(stdout || stderr || 'winget install finished'),
    };
  } catch (err) {
    const e = err as { message?: string; stderr?: string };
    return {
      ok: false,
      message: e.stderr || e.message || 'winget install failed',
    };
  }
}

export function pullOllamaModel(
  modelName: string,
  onLine?: (line: string) => void,
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const bin = resolveOllamaBin();
    if (!bin) {
      resolve({ ok: false, message: 'Ollama 未安装' });
      return;
    }
    const child = spawn(bin, ['pull', modelName], {
      windowsHide: true,
      env: { ...process.env },
    });
    let tail = '';
    const handle = (buf: Buffer) => {
      const text = buf.toString('utf8');
      tail = (tail + text).slice(-2000);
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        onLine?.(line);
      }
    };
    child.stdout?.on('data', handle);
    child.stderr?.on('data', handle);
    child.on('error', (err) => {
      resolve({ ok: false, message: err.message });
    });
    child.on('exit', (code) => {
      resolve({
        ok: code === 0,
        message: code === 0 ? `已拉取 ${modelName}` : `pull 退出码 ${code}: ${tail}`,
      });
    });
  });
}

export interface OllamaChatDelta {
  text: string;
  done: boolean;
}

export type OllamaChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

/**
 * Stream chat from local Ollama (/api/chat).
 * Pass `messages` for multi-turn; or `content` alone (wraps as one user msg).
 * Yields text deltas; respects AbortSignal.
 */
export async function* streamOllamaChat(options: {
  model: string;
  /** Single-turn shortcut — wrapped as [{role:user, content}] when messages omitted. */
  content?: string;
  /** Full conversation history for multi-turn. */
  messages?: OllamaChatMessage[];
  signal?: AbortSignal;
}): AsyncGenerator<OllamaChatDelta> {
  const model = options.model.trim();
  let messages: OllamaChatMessage[] =
    options.messages && options.messages.length > 0
      ? options.messages
          .filter((m) => m && typeof m.content === 'string' && m.content.trim())
          .map((m) => ({
            role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
            content: m.content.trim(),
          }))
      : [];
  if (messages.length === 0) {
    const content = (options.content ?? '').trim();
    if (!model || !content) {
      yield { text: '', done: true };
      return;
    }
    messages = [{ role: 'user', content }];
  } else if (!model) {
    yield { text: '', done: true };
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages,
      }),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    if (options.signal?.aborted) {
      throw err;
    }
    throw mapOllamaNetworkError(err);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.body) {
    throw new Error('Ollama response missing body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  while (true) {
    if (options.signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: {
        message?: { content?: string };
        response?: string;
        done?: boolean;
      };
      try {
        parsed = JSON.parse(trimmed) as typeof parsed;
      } catch {
        continue;
      }
      const piece =
        (typeof parsed.message?.content === 'string'
          ? parsed.message.content
          : '') ||
        (typeof parsed.response === 'string' ? parsed.response : '');
      if (piece) {
        yield { text: piece, done: false };
      }
      if (parsed.done) {
        yield { text: '', done: true };
        return;
      }
    }
  }
  yield { text: '', done: true };
}

export function spawnOllamaServe(bin = resolveOllamaBin()): void {
  const resolved = bin && bin.length > 0 ? bin : 'ollama';
  const env = { ...process.env };
  if (process.platform === 'win32') {
    const dir = path.dirname(resolved);
    const gui = path.join(dir, 'Ollama.exe');
    if (dir && dir !== '.' && existsSync(gui)) {
      const child = spawn(gui, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env,
      });
      child.unref();
      return;
    }
  }
  const child = spawn(resolved, ['serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
  child.unref();
}

let startInflight: Promise<StartOllamaResult> | null = null;

/** Best-effort start (Windows GUI or `ollama serve`) then wait for /api/tags. */
export function startOllama(opts?: {
  timeoutMs?: number;
}): Promise<StartOllamaResult> {
  if (startInflight) return startInflight;
  startInflight = startOllamaWithDeps(
    {
      probe: probeOllamaApi,
      isInstalled: isOllamaInstalled,
      spawnServe: () => spawnOllamaServe(),
    },
    opts,
  ).finally(() => {
    startInflight = null;
  });
  return startInflight;
}

export function ensureOllamaRunning(opts?: {
  timeoutMs?: number;
}): Promise<StartOllamaResult> {
  return startOllama(opts);
}

export type { StartOllamaResult, LocalModelDiscoverySource };
