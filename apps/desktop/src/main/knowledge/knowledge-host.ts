/**
 * KnowledgeHost — mounts, parse queue, search, cloud list; persists to userData.
 * Source files are never written; index only under user-chosen indexRoot.
 */

import path from 'node:path';
import {
  ParseEngine,
  createCloudMount,
  createLocalMount,
  formatAttachedKbBanner,
  formatContextBlock,
  formatEmptyIndexNote,
  hitsToCitations,
  readChunks,
  distillChunks,
  listCloudFiles,
  listImaKnowledgeBases,
  listParseableFiles,
  loadStores,
  ollamaEmbed,
  pickEmbedModel,
  pickFastChatModel,
  listOllamaModelNames,
  probeOllama,
  NO_LOCAL_MODEL_HINT,
  saveStores,
  searchImaKnowledge,
  searchKb,
  extractTextFromFileAsync,
  isJunkIndexText,
  preferMeaningfulSlice,
  PDF_CHAT_MAX_CHARS,
  IMA_DEFAULT_BASE_URL,
  hasImaCredentials,
  incompleteImaCredentialsMessage,
  INDEX_SOURCE_COLLISION_MSG,
  indexCollidesWithSources,
  resolveSafeIndexRoot,
  type Citation,
  type CloudProviderConfig,
  type CloudProviderId,
  type CloudRemoteFile,
  type ImaCredentials,
  type ImaKnowledgeBaseSummary,
  type KnowledgeStoresState,
  type KbMount,
  type LocalKbMount,
  type ParseJobState,
  type ParseableFile,
  type SearchHit,
  type ChunkRecord,
} from '@xyai/knowledge';
import {
  buildKbPreview,
  type KbPreviewResult,
} from './kb-preview.js';
import { registerKbPreviewSourceRoot } from './kb-preview-protocol.js';

export type KnowledgeHostEvents = {
  onParseProgress?: (job: ParseJobState) => void;
};

function imaCreds(config: CloudProviderConfig): ImaCredentials | null {
  const clientId = (config.clientId || '').trim();
  const apiKey = (config.apiKey || '').trim();
  if (!clientId || !apiKey) return null;
  return {
    clientId,
    apiKey,
    baseUrl: (config.baseUrl || IMA_DEFAULT_BASE_URL).trim() || IMA_DEFAULT_BASE_URL,
  };
}

function imaHitsToSearchHits(
  kbId: string,
  hits: Awaited<ReturnType<typeof searchImaKnowledge>>,
): SearchHit[] {
  return hits.map((h, i) => {
    const text = h.highlightContent || h.title;
    const chunk: ChunkRecord = {
      id: `ima-${kbId}-${h.mediaId}-${i}`,
      kbId,
      sourcePath: h.mediaId,
      relativePath: h.title || h.mediaId,
      sourceKind: 'cloud',
      sourceUrl: h.url,
      title: h.title || h.mediaId,
      text,
      startOffset: 0,
      endOffset: text.length,
    };
    return { chunk, score: 1 - i * 0.01 };
  });
}

export type SetIndexDirResult = {
  ok: boolean;
  state: KnowledgeStoresState;
  message?: string;
};

export class KnowledgeHost {
  private storesPath: string;
  private state: KnowledgeStoresState;
  private engine = new ParseEngine();
  private events: KnowledgeHostEvents;
  private fallbackIndexRoot: string;
  /** Last auto-repair tip for UI status line. */
  private lastIndexTip: string | null = null;

  constructor(userDataDir: string, events: KnowledgeHostEvents = {}) {
    this.fallbackIndexRoot = path.join(userDataDir, 'knowledge-index');
    this.storesPath = path.join(userDataDir, 'knowledge-stores.json');
    this.state = loadStores(this.storesPath);
    this.events = events;
    if (!this.state.defaultIndexRoot) {
      this.state.defaultIndexRoot = this.fallbackIndexRoot;
      this.persist();
    }
    // Repair any persisted colliding default/mount index roots on load.
    this.repairCollidingIndexes();
  }

  private persist(): void {
    saveStores(this.storesPath, this.state);
  }

  getState(): KnowledgeStoresState {
    return {
      version: 1,
      defaultIndexRoot: this.state.defaultIndexRoot,
      mounts: this.state.mounts.map((m) => ({ ...m })),
    };
  }

  getFallbackIndexRoot(): string {
    return this.fallbackIndexRoot;
  }

  consumeIndexTip(): string | null {
    const tip = this.lastIndexTip;
    this.lastIndexTip = null;
    return tip;
  }

  private localSourceRoots(excludeKbId?: string): string[] {
    return this.state.mounts
      .filter(
        (m): m is LocalKbMount =>
          m.kind === 'local' && m.id !== excludeKbId,
      )
      .map((m) => m.sourceRoot);
  }

  /**
   * If defaultIndexRoot or any mount indexRoot collides with a source tree,
   * rewrite to userData/knowledge-index and surface a Chinese tip.
   */
  repairCollidingIndexes(): boolean {
    let changed = false;
    const sources = this.localSourceRoots();
    if (
      this.state.defaultIndexRoot &&
      indexCollidesWithSources(this.state.defaultIndexRoot, sources)
    ) {
      this.state.defaultIndexRoot = this.fallbackIndexRoot;
      changed = true;
    }
    for (const m of this.state.mounts) {
      if (m.kind !== 'local') continue;
      const idx = m.indexRoot || this.state.defaultIndexRoot;
      if (idx && indexCollidesWithSources(idx, [m.sourceRoot, ...sources])) {
        m.indexRoot = this.fallbackIndexRoot;
        m.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) {
      this.lastIndexTip =
        INDEX_SOURCE_COLLISION_MSG + '，已自动改用默认索引目录';
      this.persist();
    }
    return changed;
  }

  setIndexDir(indexRoot: string): SetIndexDirResult {
    const sources = this.localSourceRoots();
    const resolved = path.resolve(indexRoot);
    if (indexCollidesWithSources(resolved, sources)) {
      return {
        ok: false,
        message: INDEX_SOURCE_COLLISION_MSG,
        state: this.getState(),
      };
    }
    this.state.defaultIndexRoot = resolved;
    this.persist();
    return { ok: true, state: this.getState() };
  }

  setMountIndexDir(kbId: string, indexRoot: string): SetIndexDirResult {
    const m = this.state.mounts.find((x) => x.id === kbId);
    if (!m) return { ok: false, message: '知识库不存在', state: this.getState() };
    const resolved = path.resolve(indexRoot);
    const sourceRoots =
      m.kind === 'local' ? [m.sourceRoot, ...this.localSourceRoots(kbId)] : this.localSourceRoots(kbId);
    if (indexCollidesWithSources(resolved, sourceRoots)) {
      return {
        ok: false,
        message: INDEX_SOURCE_COLLISION_MSG,
        state: this.getState(),
      };
    }
    m.indexRoot = resolved;
    m.updatedAt = new Date().toISOString();
    this.persist();
    return { ok: true, state: this.getState() };
  }

  mountLocal(input: {
    sourceRoot: string;
    name?: string;
    indexRoot?: string;
  }): KnowledgeStoresState {
    const sourceRoot = path.resolve(input.sourceRoot);
    const picked = resolveSafeIndexRoot({
      requested: input.indexRoot || this.state.defaultIndexRoot,
      sourceRoot,
      sourceRoots: this.localSourceRoots(),
      fallback: this.fallbackIndexRoot,
    });
    if (picked.repaired) {
      this.lastIndexTip =
        (picked.reason || INDEX_SOURCE_COLLISION_MSG) +
        '，已使用默认索引目录';
      // Never persist a colliding default — keep default at fallback if it was source
      if (
        this.state.defaultIndexRoot &&
        indexCollidesWithSources(this.state.defaultIndexRoot, [sourceRoot])
      ) {
        this.state.defaultIndexRoot = this.fallbackIndexRoot;
      }
    }
    const name =
      input.name ||
      path.basename(sourceRoot) ||
      '本地知识库';
    const mount = createLocalMount({
      name,
      sourceRoot,
      indexRoot: picked.indexRoot,
    });
    this.state.mounts.push(mount);
    this.persist();
    return this.getState();
  }

  mountCloud(input: {
    name: string;
    provider: CloudProviderId;
    config: CloudProviderConfig;
    indexRoot?: string;
  }): KnowledgeStoresState {
    const indexRoot = path.resolve(
      input.indexRoot || this.state.defaultIndexRoot,
    );
    const mount = createCloudMount({
      name: input.name,
      provider: input.provider,
      config: input.config,
      indexRoot,
    });
    this.state.mounts.push(mount);
    this.persist();
    return this.getState();
  }

  /** Mount ima with Client ID + API Key + selected knowledgeBaseId (userData only). */
  mountIma(input: {
    name?: string;
    clientId: string;
    apiKey: string;
    knowledgeBaseId: string;
    baseUrl?: string;
    indexRoot?: string;
    useMock?: boolean;
  }): KnowledgeStoresState {
    const clientId = input.clientId.trim();
    const apiKey = input.apiKey.trim();
    const knowledgeBaseId = input.knowledgeBaseId.trim();
    const config: CloudProviderConfig = {
      clientId,
      apiKey,
      knowledgeBaseId,
      baseUrl:
        (input.baseUrl || IMA_DEFAULT_BASE_URL).trim() || IMA_DEFAULT_BASE_URL,
      useMock: input.useMock === true,
    };
    return this.mountCloud({
      name: input.name?.trim() || `ima · ${knowledgeBaseId}`,
      provider: 'ima',
      config,
      indexRoot: input.indexRoot,
    });
  }

  async listImaBases(input: {
    clientId: string;
    apiKey: string;
    baseUrl?: string;
    query?: string;
  }): Promise<{
    ok: boolean;
    bases: ImaKnowledgeBaseSummary[];
    message?: string;
  }> {
    const creds: ImaCredentials = {
      clientId: input.clientId.trim(),
      apiKey: input.apiKey.trim(),
      baseUrl:
        (input.baseUrl || IMA_DEFAULT_BASE_URL).trim() || IMA_DEFAULT_BASE_URL,
    };
    if (!hasImaCredentials(creds)) {
      return {
        ok: false,
        bases: [],
        message: incompleteImaCredentialsMessage(),
      };
    }
    try {
      const bases = await listImaKnowledgeBases(creds, {
        query: input.query ?? '',
      });
      return { ok: true, bases };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, bases: [], message };
    }
  }

  unmount(kbId: string): KnowledgeStoresState {
    this.state.mounts = this.state.mounts.filter((m) => m.id !== kbId);
    this.persist();
    return this.getState();
  }

  getMount(kbId: string): KbMount | undefined {
    return this.state.mounts.find((m) => m.id === kbId);
  }

  listFiles(kbId: string): {
    ok: boolean;
    files: ParseableFile[];
    skipped: { path: string; reason: string }[];
    indexedRelativePaths: string[];
    message?: string;
    statusTip?: string;
  } {
    this.repairCollidingIndexes();
    const m = this.getMount(kbId);
    if (!m || m.kind !== 'local') {
      return {
        ok: false,
        files: [],
        skipped: [],
        indexedRelativePaths: [],
        message: 'not a local mount',
      };
    }
    const { files, skipped } = listParseableFiles(m.sourceRoot);
    const indexRoot = m.indexRoot || this.state.defaultIndexRoot;
    const chunks = indexRoot ? readChunks(indexRoot, kbId) : [];
    const indexedRelativePaths = [
      ...new Set(chunks.map((c) => c.relativePath).filter(Boolean)),
    ];
    const tip = this.consumeIndexTip();
    return {
      ok: true,
      files,
      skipped,
      indexedRelativePaths,
      statusTip: tip || undefined,
    };
  }

  async listCloud(kbId: string): Promise<{
    ok: boolean;
    files: CloudRemoteFile[];
    stub: boolean;
    message?: string;
  }> {
    const m = this.getMount(kbId);
    if (!m || m.kind !== 'cloud') {
      return {
        ok: false,
        files: [],
        stub: false,
        message: 'not a cloud mount',
      };
    }
    const res = await listCloudFiles(m.provider, m.config);
    return { ok: true, ...res };
  }

  async startParse(kbId: string): Promise<ParseJobState | { error: string; statusTip?: string }> {
    this.repairCollidingIndexes();
    const tip = this.consumeIndexTip();
    const m = this.getMount(kbId);
    if (!m || m.kind !== 'local') {
      return { error: 'only local mounts can be parsed' };
    }
    // Preflight: require a usable local chat or embed model (chat preferred).
    // User machines often have chat-only tags (no embed) — pickFastChatModel covers that.
    let ollamaOk = false;
    let chatModel: string | null = null;
    let embedModel: string | null = null;
    try {
      ollamaOk = await probeOllama();
      if (ollamaOk) {
        const names = await listOllamaModelNames();
        chatModel = pickFastChatModel(names);
        embedModel = pickEmbedModel(names);
      }
    } catch {
      ollamaOk = false;
    }
    if (!chatModel && !embedModel) {
      return { error: NO_LOCAL_MODEL_HINT };
    }
    const { files } = listParseableFiles(m.sourceRoot);
    if (!files.length) {
      return { error: '目录中没有可解析文件' };
    }
    const job = await this.engine.startLocalParse({
      kbId: m.id,
      sourceRoot: m.sourceRoot,
      indexRoot: m.indexRoot || this.state.defaultIndexRoot || this.fallbackIndexRoot,
      files,
      onProgress: (j) => this.events.onParseProgress?.(j),
      requireLocalModel: true,
      modelOverride: {
        ollamaAvailable: ollamaOk,
        chatModel,
        embedModel,
      },
    });
    if (tip && job && typeof job === 'object' && 'statusMessage' in job) {
      const existing = (job as ParseJobState).statusMessage || '';
      (job as ParseJobState).statusMessage = existing
        ? `${tip}；${existing}`
        : tip;
    }
    return job;
  }

  stopParse(kbId: string): ParseJobState | null {
    return this.engine.requestStop(kbId);
  }

  getParseJob(kbId: string): ParseJobState | null {
    return this.engine.getJob(kbId);
  }

  async search(input: {
    kbIds: string[];
    query: string;
    limit?: number;
  }): Promise<{
    hits: SearchHit[];
    citations: Citation[];
    context: string;
    emptyIndexNames: string[];
  }> {
    const allHits: SearchHit[] = [];
    let queryEmbedding: number[] | null = null;
    if (await probeOllama()) {
      const names = await listOllamaModelNames();
      const model = pickEmbedModel(names);
      if (model) {
        queryEmbedding = await ollamaEmbed(model, input.query);
      }
    }
    const labels: string[] = [];
    const emptyIndexNames: string[] = [];
    for (const id of input.kbIds) {
      const m = this.getMount(id);
      if (!m) continue;
      labels.push(m.name);

      if (m.kind === 'cloud' && m.provider === 'ima') {
        const creds = imaCreds(m.config);
        const knowledgeBaseId = (m.config.knowledgeBaseId || '').trim();
        if (
          !m.config.useMock &&
          hasImaCredentials(creds) &&
          knowledgeBaseId &&
          input.query.trim()
        ) {
          try {
            const imaHits = await searchImaKnowledge(
              creds,
              knowledgeBaseId,
              input.query,
            );
            allHits.push(...imaHitsToSearchHits(m.id, imaHits));
          } catch {
            // Fall through — no local index for ima
          }
        }
        // Cloud ima without hits still counts as "no usable index" for UX
        // (handled after loop if this mount contributed nothing)
        continue;
      }

      const indexRoot = m.indexRoot || this.state.defaultIndexRoot;
      const existing = readChunks(indexRoot, id);
      if (!existing.length) {
        emptyIndexNames.push(m.name);
        continue;
      }
      const hits = searchKb(indexRoot, id, input.query, {
        limit: input.limit ?? 6,
        queryEmbedding,
        overviewFallback: true,
      });
      allHits.push(...hits);
    }
    
    allHits.sort((a, b) => b.score - a.score);
    let top = allHits.slice(0, input.limit ?? 8);

    // If hits are XMP/binary junk (legacy bad index), live-extract source files.
    const junkish =
      top.length > 0 &&
      (top.every((h) => isJunkIndexText(h.chunk.text)) ||
        top.filter((h) => isJunkIndexText(h.chunk.text)).length >=
          Math.ceil(top.length * 0.7));
    let liveNote = '';
    if (junkish || top.length === 0) {
      const tried = new Set<string>();
      const liveHits: SearchHit[] = [];
      for (const id of input.kbIds) {
        const m = this.getMount(id);
        if (!m || m.kind !== 'local' || !m.sourceRoot) continue;
        // Prefer paths from junk hits; else skip (no file list here)
        const paths: { sourcePath: string; relativePath: string }[] = [];
        for (const h of top) {
          if (h.chunk.kbId !== id) continue;
          if (!h.chunk.sourcePath || tried.has(h.chunk.sourcePath)) continue;
          tried.add(h.chunk.sourcePath);
          paths.push({
            sourcePath: h.chunk.sourcePath,
            relativePath: h.chunk.relativePath,
          });
        }
        for (const p of paths.slice(0, 3)) {
          try {
            const extracted = await extractTextFromFileAsync(p.sourcePath);
            const text = preferMeaningfulSlice(
              extracted.text || '',
              PDF_CHAT_MAX_CHARS,
            );
            if (!text || isJunkIndexText(text)) continue;
            liveHits.push({
              chunk: {
                id: `live-${id}-${liveHits.length}`,
                kbId: id,
                sourcePath: p.sourcePath,
                relativePath: p.relativePath,
                sourceKind: 'local',
                title: p.relativePath,
                text,
                startOffset: 0,
                endOffset: text.length,
              },
              score: 0.85,
            });
          } catch {
            /* ignore live extract errors */
          }
        }
      }
      if (liveHits.length) {
        top = liveHits.slice(0, input.limit ?? 8);
        liveNote =
          '【提示：索引含元数据噪声，已改为即时提取正文供回答】\n';

      }
    }

    // Keep citations whenever we have hits (including overview fallback)
    const citations = hitsToCitations(top);

    const parts: string[] = [];
    if (labels.length) {
      parts.push(formatAttachedKbBanner(labels));
    }
    if (liveNote) parts.push(liveNote);
    if (top.length) {
      parts.push(formatContextBlock(top, labels.join('、') || '知识库'));
    }
    for (const name of emptyIndexNames) {
      parts.push(formatEmptyIndexNote(name));
    }
    // If kbIds were selected but every mount missing / empty, still never silent
    if (input.kbIds.length && !parts.length) {
      parts.push(
        formatAttachedKbBanner(labels.length ? labels : input.kbIds) +
          '【所选知识库暂无可用检索结果】\n',
      );
    }
    return {
      hits: top,
      citations,
      context: parts.join('\n'),
      emptyIndexNames,
    };
  }


  async saveDistill(kbId: string, outDir: string): Promise<{
    ok: boolean;
    message?: string;
    outDir?: string;
    digestPath?: string;
    mode?: string;
    model?: string | null;
  }> {
    const m = this.getMount(kbId);
    if (!m || m.kind !== 'local') {
      return { ok: false, message: '请选择本机知识库后再保存蒸馏成果' };
    }
    const indexRoot = m.indexRoot || this.state.defaultIndexRoot;
    if (!indexRoot) {
      return { ok: false, message: '尚未设置索引目录' };
    }
    const chunks = readChunks(indexRoot, kbId);
    if (!chunks.length) {
      return { ok: false, message: '索引中尚无分块，请先「开始解析」' };
    }
    try {
      const res = await distillChunks({
        chunks,
        outDir,
        kbName: m.name,
      });
      return {
        ok: true,
        message: res.message,
        outDir: res.outDir,
        digestPath: res.digestPath,
        mode: res.mode,
        model: res.model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }
  }

  async previewFile(input: {
    kbId: string;
    path: string;
    relativePath?: string;
    parseStatus?: string;
  }): Promise<KbPreviewResult> {
    const m = this.getMount(input.kbId);
    if (!m || m.kind !== 'local') {
      return {
        ok: false,
        kind: 'error',
        filename: '',
        relativePath: '',
        ext: '',
        sizeBytes: 0,
        message: '仅本机知识库支持文件预览',
      };
    }
    if (!m.sourceRoot) {
      return {
        ok: false,
        kind: 'error',
        filename: '',
        relativePath: '',
        ext: '',
        sizeBytes: 0,
        message: '缺少 sourceRoot',
      };
    }
    const indexRoot = m.indexRoot || this.state.defaultIndexRoot;
    const chunks = indexRoot ? readChunks(indexRoot, input.kbId) : [];
    registerKbPreviewSourceRoot(m.sourceRoot);
    return buildKbPreview({
      absolutePath: input.path,
      sourceRoot: m.sourceRoot,
      relativePath: input.relativePath,
      chunks,
      parseStatus: input.parseStatus,
    });
  }

  getCitations(input: {
    kbIds: string[];
    query: string;
    limit?: number;
  }): Promise<{ citations: Citation[] }> {
    return this.search(input).then((r) => ({ citations: r.citations }));
  }
}
