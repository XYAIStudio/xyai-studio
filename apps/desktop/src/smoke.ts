/**
 * Desktop smoke entry — assembly load, Codex turn (real or mock), xyos healthCheck.
 * Prefer real Codex when binary resolves; use XYAI_CODEX_MOCK=1 for CI.
 * 适合：pnpm --filter desktop smoke
 */

import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAssemblyProfile, SessionRegistry } from '@xyai/core';
import {
  createCodexAdapter,
  MOCK_MARKER,
  resolveCodexBinary,
} from '@xyai/adapter-codex';
import { createXyosBridge } from '@xyai/xyos-bridge';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const profilePath = path.join(repoRoot, 'assembly/profiles/0.5.0-dev.example.json');
  console.log('[smoke] loading assembly profile:', profilePath);

  const validation = await loadAssemblyProfile(profilePath);
  if (!validation.ok) {
    console.error('[smoke] assembly validation FAILED');
    for (const issue of validation.issues) {
      console.error(`  - [${issue.severity}] ${issue.path}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('[smoke] assembly OK', {
    productVersion: validation.profile.productVersion,
    profileId: validation.profile.profileId,
    harnesses: validation.profile.harnesses.map((h) => h.id),
    enabledModules: validation.profile.modules.filter((m) => m.enabled).map((m) => m.id),
  });

  const registry = new SessionRegistry();
  const session = registry.create({
    id: 'smoke-session-1',
    title: 'desktop smoke',
    harnessId: 'codex',
  });

  const resolved = resolveCodexBinary();
  const adapter = createCodexAdapter();
  console.log('[smoke] Codex adapter isMock=', adapter.isMock, {
    binarySource: resolved.source,
    binaryPath: resolved.path,
    ...(adapter.isMock ? { marker: MOCK_MARKER } : {}),
  });
  await adapter.start({ sessionId: session.id, harnessId: 'codex' });

  const events: string[] = [];
  let replySnippet = '';
  for await (const ev of adapter.send({
    sessionId: session.id,
    taskId: 'smoke-task-1',
    content: 'ping from desktop smoke — reply with PONG only',
  })) {
    events.push(ev.type);
    console.log('[smoke] event:', ev.type);
    if (ev.type === 'message.completed') {
      const text = String((ev.payload as { text?: string } | undefined)?.text ?? '');
      replySnippet = text.slice(0, 200);
    }
  }
  await adapter.stop(session.id);

  if (!events.includes('message.completed')) {
    console.error('[smoke] expected message.completed from Codex adapter');
    process.exitCode = 1;
    return;
  }

  if (adapter.isMock) {
    console.log('[smoke] mock reply OK (CI / no binary)');
  } else {
    console.log('[smoke] real Codex reply snippet:', replySnippet);
  }

  const xyosRoot = path.join(repoRoot, 'components/openxyos');
  const bridge = createXyosBridge({ componentRoot: xyosRoot });
  const health = await bridge.healthCheck();
  console.log('[smoke] xyos healthCheck:', health);

  const submodulePresent = await pathExists(path.join(xyosRoot, 'package.json'));
  const allowedReasons = new Set([
    'not-installed',
    'submodule-present',
    'stub-detected-install-markers',
  ]);
  if (!allowedReasons.has(String(health.reason))) {
    console.error('[smoke] unexpected xyos health.reason:', health.reason);
    process.exitCode = 1;
    return;
  }
  if (submodulePresent) {
    if (health.ok !== true) {
      console.error('[smoke] openxyos/package.json exists but health.ok !== true');
      process.exitCode = 1;
      return;
    }
  } else if (health.ok !== false || health.reason !== 'not-installed') {
    console.error('[smoke] expected xyos health { ok:false, reason:not-installed } for placeholder');
    process.exitCode = 1;
    return;
  }

  console.log('[smoke] SUCCESS');
}

main().catch((err: unknown) => {
  console.error('[smoke] fatal', err);
  process.exitCode = 1;
});
