/**
 * Read-only FS helpers for scanners. Never executes files.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  lstatSync,
} from 'node:fs';
import path from 'node:path';

export function pathExists(p: string): boolean {
  try {
    return Boolean(p) && existsSync(p);
  } catch {
    return false;
  }
}

export function isDirectory(p: string): boolean {
  try {
    return pathExists(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return pathExists(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Safe read text; returns null on missing / error. */
export function readTextFile(p: string, maxBytes = 2_000_000): string | null {
  try {
    if (!isFile(p)) return null;
    const st = statSync(p);
    if (st.size > maxBytes) return null;
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export function readJsonFile(p: string): unknown | null {
  const raw = readTextFile(p);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function listDirNames(dir: string): string[] {
  try {
    if (!isDirectory(dir)) return [];
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Immediate child directories (non-symlink preferred). */
export function listSubdirs(dir: string): string[] {
  const names = listDirNames(dir);
  const out: string[] = [];
  for (const name of names) {
    if (name === '.' || name === '..') continue;
    const full = path.join(dir, name);
    try {
      const st = lstatSync(full);
      if (st.isDirectory() && !st.isSymbolicLink()) out.push(full);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Strip env-like secrets from MCP server entries for stored manifests.
 * Keeps command/args/url shape; redacts env values.
 */
export function sanitizeMcpServerEntry(
  entry: unknown,
): Record<string, unknown> {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return {};
  }
  const o = entry as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'env' && v && typeof v === 'object' && !Array.isArray(v)) {
      const envOut: Record<string, string> = {};
      for (const ek of Object.keys(v as Record<string, unknown>)) {
        envOut[ek] = '[redacted]';
      }
      out.env = envOut;
    } else if (
      typeof v === 'string' &&
      /key|token|secret|password|api[_-]?key/i.test(k)
    ) {
      out[k] = '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Parse mcpServers / mcp map from common JSON shapes. */
export function extractMcpServersMap(
  json: unknown,
): Record<string, unknown> | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const candidates = [o.mcpServers, o.mcp, o.servers];
  for (const c of candidates) {
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      return c as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Best-effort TOML mcp_servers table names (no full TOML parser).
 * Matches [mcp_servers.name] or [mcp.servers.name] headers.
 */
export function extractTomlMcpServerNames(toml: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const re =
    /^\s*\[\s*(?:mcp_servers|mcp\.servers)\.([A-Za-z0-9_-]+)\s*\]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(toml)) !== null) {
    const name = m[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}
