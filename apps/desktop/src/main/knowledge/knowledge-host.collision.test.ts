import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KnowledgeHost } from './knowledge-host.js';
import { INDEX_SOURCE_COLLISION_MSG } from '@xyai/knowledge';

describe('KnowledgeHost index/source collision', () => {
  it('mountLocal never copies source into indexRoot', () => {
    const ud = mkdtempSync(path.join(tmpdir(), 'kb-host-'));
    try {
      const host = new KnowledgeHost(ud);
      const source = path.join(ud, '政策');
      host.mountLocal({ sourceRoot: source, indexRoot: source });
      const m = host.getState().mounts[0]!;
      expect(m.kind).toBe('local');
      if (m.kind === 'local') {
        expect(m.indexRoot).toBe(path.join(ud, 'knowledge-index'));
        expect(m.indexRoot).not.toBe(m.sourceRoot);
      }
    } finally {
      rmSync(ud, { recursive: true, force: true });
    }
  });

  it('setIndexDir rejects colliding default index', () => {
    const ud = mkdtempSync(path.join(tmpdir(), 'kb-host2-'));
    try {
      const host = new KnowledgeHost(ud);
      const source = path.join(ud, '政策');
      host.mountLocal({ sourceRoot: source });
      const res = host.setIndexDir(source);
      expect(res.ok).toBe(false);
      expect(res.message).toBe(INDEX_SOURCE_COLLISION_MSG);
    } finally {
      rmSync(ud, { recursive: true, force: true });
    }
  });

  it('repairCollidingIndexes auto-fixes persisted collision', () => {
    const ud = mkdtempSync(path.join(tmpdir(), 'kb-host3-'));
    try {
      const host = new KnowledgeHost(ud);
      const source = path.join(ud, 'docs');
      host.mountLocal({ sourceRoot: source });
      const m = host.getMount(host.getState().mounts[0]!.id)!;
      // Force bad persisted state (simulates user saved index=source)
      (m as { indexRoot: string }).indexRoot = source;
      const repaired = host.repairCollidingIndexes();
      expect(repaired).toBe(true);
      const tip = host.consumeIndexTip();
      expect(tip).toContain('索引目录不能设在知识库源文件夹内');
      const fixed = host.getMount(m.id)!;
      expect(fixed.indexRoot).toBe(path.join(ud, 'knowledge-index'));
    } finally {
      rmSync(ud, { recursive: true, force: true });
    }
  });
});
