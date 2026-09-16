/**
 * Desktop smoke entry — 加载装配图、校验、mock Codex 一轮、xyos healthCheck。
 * 适合：pnpm --filter desktop smoke
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAssemblyProfile, SessionRegistry } from '@xyai/core';
import { createCodexAdapter, MOCK_MARKER } from '@xyai/adapter-codex';
import { createXyosBridge } from '@xyai/xyos-bridge';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

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

  const adapter = createCodexAdapter();
  console.log('[smoke] Codex adapter isMock=', adapter.isMock, 'marker=', MOCK_MARKER);
  await adapter.start({ sessionId: session.id, harnessId: 'codex' });

  const events: string[] = [];
  for await (const ev of adapter.send({
    sessionId: session.id,
    taskId: 'smoke-task-1',
    content: 'ping from desktop smoke',
  })) {
    events.push(ev.type);
    console.log('[smoke] event:', ev.type);
  }
  await adapter.stop(session.id);

  if (!events.includes('message.completed')) {
    console.error('[smoke] expected message.completed from mock Codex');
    process.exitCode = 1;
    return;
  }

  const bridge = createXyosBridge({
    componentRoot: path.join(repoRoot, 'components/openxyos'),
  });
  const health = await bridge.healthCheck();
  console.log('[smoke] xyos healthCheck:', health);

  if (health.ok !== false || health.reason !== 'not-installed') {
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
