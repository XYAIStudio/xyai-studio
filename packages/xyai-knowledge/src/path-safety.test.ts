import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertIndexWriteAllowed,
  assertNotSourceWrite,
  indexCollidesWithSources,
  isParseableExt,
  isPathInside,
  pathsCollide,
  resolveSafeIndexRoot,
  shouldSkipDirName,
  INDEX_SOURCE_COLLISION_MSG,
} from './path-safety.js';

describe('path-safety', () => {
  const source = path.resolve('/tmp/kb-source');
  const index = path.resolve('/tmp/kb-index');

  it('isPathInside respects boundaries', () => {
    expect(isPathInside(source, path.join(source, 'a.txt'))).toBe(true);
    expect(isPathInside(source, source)).toBe(true);
    expect(isPathInside(source, path.resolve('/tmp/kb-source-other'))).toBe(
      false,
    );
    expect(isPathInside(source, index)).toBe(false);
  });

  it('refuses writeFile inside source root', () => {
    expect(() =>
      assertNotSourceWrite(path.join(source, 'x.txt'), [source], 'writeFile'),
    ).toThrow(/refused writeFile inside source root/);
  });

  it('allows write under index root', () => {
    expect(() =>
      assertIndexWriteAllowed(
        path.join(index, 'kb1', 'chunks.jsonl'),
        index,
        [source],
        'writeFile',
      ),
    ).not.toThrow();
  });

  it('refuses index write that lands in source', () => {
    expect(() =>
      assertIndexWriteAllowed(
        path.join(source, 'leak.txt'),
        index,
        [source],
        'writeFile',
      ),
    ).toThrow();
  });

  it('parseable extensions', () => {
    expect(isParseableExt('a.md')).toBe(true);
    expect(isParseableExt('a.PDF')).toBe(true);
    expect(isParseableExt('a.exe')).toBe(false);
  });

  it('skips junk dirs', () => {
    expect(shouldSkipDirName('node_modules')).toBe(true);
    expect(shouldSkipDirName('docs')).toBe(false);
  });

  it('detects index/source path collision both ways', () => {
    expect(pathsCollide(source, source)).toBe(true);
    expect(pathsCollide(source, path.join(source, 'sub'))).toBe(true);
    expect(pathsCollide(path.join(source, 'sub'), source)).toBe(true);
    expect(pathsCollide(source, index)).toBe(false);
    expect(indexCollidesWithSources(source, [source])).toBe(true);
    expect(indexCollidesWithSources(index, [source])).toBe(false);
  });

  it('resolveSafeIndexRoot falls back instead of copying source', () => {
    const fallback = path.resolve('/tmp/userData/knowledge-index');
    const r = resolveSafeIndexRoot({
      requested: source,
      sourceRoot: source,
      fallback,
    });
    expect(r.repaired).toBe(true);
    expect(r.indexRoot).toBe(fallback);
    expect(r.reason).toBe(INDEX_SOURCE_COLLISION_MSG);
    const ok = resolveSafeIndexRoot({
      requested: index,
      sourceRoot: source,
      fallback,
    });
    expect(ok.repaired).toBe(false);
    expect(ok.indexRoot).toBe(index);
  });

});
