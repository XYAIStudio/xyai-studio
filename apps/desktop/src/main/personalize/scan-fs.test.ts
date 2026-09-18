import { describe, expect, it } from 'vitest';
import {
  extractMcpServersMap,
  extractTomlMcpServerNames,
  sanitizeMcpServerEntry,
} from './scan-fs.js';

describe('sanitizeMcpServerEntry', () => {
  it('redacts env values and api key fields', () => {
    const out = sanitizeMcpServerEntry({
      command: 'npx',
      args: ['-y', 'foo'],
      env: { API_KEY: 'secret', FOO: 'bar' },
      apiKey: 'abc',
    });
    expect(out.command).toBe('npx');
    expect(out.env).toEqual({ API_KEY: '[redacted]', FOO: '[redacted]' });
    expect(out.apiKey).toBe('[redacted]');
  });
});

describe('extractMcpServersMap', () => {
  it('reads mcpServers', () => {
    const map = extractMcpServersMap({
      mcpServers: { a: { command: 'x' } },
    });
    expect(map).toEqual({ a: { command: 'x' } });
  });

  it('returns null for non-objects', () => {
    expect(extractMcpServersMap(null)).toBeNull();
    expect(extractMcpServersMap([])).toBeNull();
  });
});

describe('extractTomlMcpServerNames', () => {
  it('parses [mcp_servers.name] headers', () => {
    const toml = `
[mcp_servers.filesystem]
command = "npx"

[mcp_servers.github]
command = "uvx"
`;
    expect(extractTomlMcpServerNames(toml)).toEqual([
      'filesystem',
      'github',
    ]);
  });
});
