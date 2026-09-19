/**
 * Background parse queue — status queued/progress/done/failed/warn;
 * stop finishes current file safely (no half-written committed index).
 *
 * startLocalParse returns immediately with a running job snapshot so IPC
 * is not blocked while large PDFs / Ollama embeds/summaries run.
 *
 * Requires a usable local Ollama chat or embed model (prefer chat via
 * pickFastChatModel). When only chat models exist (common), each file is
 * summarized with ollamaSummarize into a summary chunk — silent LLM parse.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  ChunkRecord,
  IndexMeta,
  ParseJobState,
  ParseableFile,
} from './types.js';
import {
  extractTextFromFileAsync,
  chunkText,
  isJunkIndexText,
} from './extract.js';
import {
  appendAudit,
  appendChunksStaging,
  clearStaging,
  commitStaging,
  ensureKbIndexDir,
  readMeta,
  writeMeta,
} from './index-io.js';
import {
  listOllamaModelNames,
  NO_LOCAL_MODEL_HINT,
  ollamaEmbed,
  ollamaSummarize,
  pickEmbedModel,
  pickBestChatModelForSummary,
  isAcceptableSummary,
  probeOllama,
} from './ollama-kb.js';

export type ParseProgressListener = (job: ParseJobState) => void;

export type StartLocalParseInput = {
  kbId: string;
  sourceRoot: string;
  indexRoot: string;
  files: ParseableFile[];
  onProgress?: ParseProgressListener;
  /**
   * When true (default), refuse to run without a usable local chat/embed model.
   * Unit tests may set false to exercise extract-only background return.
   */
  requireLocalModel?: boolean;
  /** Test override — skip live Ollama probe. */
  modelOverride?: {
    ollamaAvailable: boolean;
    chatModel: string | null;
    embedModel: string | null;
  };
};

function yieldEventLoop(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

function snapshotJob(job: ParseJobState): ParseJobState {
  return {
    ...job,
    files: job.files.map((f) => ({ ...f })),
  };
}

function buildStatusMessage(job: ParseJobState): string {
  if (job.statusMessage && !job.running) return job.statusMessage;
  const chat = job.chatModel;
  const emb = job.embedModel;
  if (job.running && chat) {
    return emb
      ? `正在用本地模型 ${chat} 静默解析（嵌入：${emb}）`
      : `正在用本地模型 ${chat} 静默解析`;
  }
  if (job.running && emb) {
    return `正在用本地嵌入模型 ${emb} 解析`;
  }
  if (job.running) {
    return '解析中…';
  }
  return job.statusMessage || '';
}

export class ParseEngine {
  private jobs = new Map<string, ParseJobState>();
  private running = new Map<string, Promise<void>>();

  getJob(kbId: string): ParseJobState | null {
    const job = this.jobs.get(kbId);
    return job ? snapshotJob(job) : null;
  }

  requestStop(kbId: string): ParseJobState | null {
    const job = this.jobs.get(kbId);
    if (!job) return null;
    job.stopRequested = true;
    return snapshotJob(job);
  }

  /**
   * Enqueue a local parse and return immediately while job.running === true.
   * Progress is delivered via onProgress (and getJob / requestStop).
   */
  async startLocalParse(input: StartLocalParseInput): Promise<ParseJobState> {
    const existing = this.running.get(input.kbId);
    if (existing) {
      const cur = this.jobs.get(input.kbId)!;
      return snapshotJob(cur);
    }

    const now = new Date().toISOString();
    const job: ParseJobState = {
      kbId: input.kbId,
      running: true,
      stopRequested: false,
      total: input.files.length,
      completed: 0,
      failed: 0,
      warned: 0,
      currentFile: null,
      files: input.files.map((f) => ({
        path: f.path,
        relativePath: f.relativePath,
        status: 'queued',
        updatedAt: now,
      })),
      startedAt: now,
      finishedAt: null,
      ollamaAvailable: false,
      embedModel: null,
      chatModel: null,
      statusMessage: '开始解析…',
    };
    // Apply known model override up-front so the immediate snapshot shows chatModel.
    if (input.modelOverride) {
      job.ollamaAvailable = input.modelOverride.ollamaAvailable;
      job.chatModel = input.modelOverride.chatModel;
      job.embedModel = input.modelOverride.embedModel;
      job.statusMessage = buildStatusMessage(job) || '开始解析…';
    }

    this.jobs.set(input.kbId, job);

    // Notify queued snapshot before returning so UI leaves「开始解析…」
    this.notify(job, input.onProgress);

    // Defer run to next macrotask so this function always returns with running=true
    // even when the first steps fail synchronously (path safety, no-model, etc.).
    const run = new Promise<void>((resolve) => {
      setImmediate(() => {
        void this.runLocal(input, job).then(resolve, resolve);
      });
    });
    this.running.set(input.kbId, run);
    void run.finally(() => {
      this.running.delete(input.kbId);
    });

    // Do NOT await run — return while still running so IPC unblocks.
    return snapshotJob(job);
  }

  /** Test / callers that need to wait for completion. */
  waitForJob(kbId: string): Promise<void> {
    return this.running.get(kbId) ?? Promise.resolve();
  }

  private notify(
    job: ParseJobState,
    onProgress?: ParseProgressListener,
  ): void {
    job.statusMessage = buildStatusMessage(job) || job.statusMessage;
    onProgress?.(snapshotJob(job));
  }

  private async resolveModels(input: StartLocalParseInput): Promise<{
    ollamaAvailable: boolean;
    chatModel: string | null;
    embedModel: string | null;
  }> {
    if (input.modelOverride) {
      return { ...input.modelOverride };
    }
    let ollamaAvailable = false;
    let chatModel: string | null = null;
    let embedModel: string | null = null;
    try {
      ollamaAvailable = await probeOllama();
      if (ollamaAvailable) {
        const names = await listOllamaModelNames();
        embedModel = pickEmbedModel(names);
        chatModel = pickBestChatModelForSummary(names);
      }
    } catch {
      ollamaAvailable = false;
    }
    return { ollamaAvailable, chatModel, embedModel };
  }

  private failAllFiles(job: ParseJobState, message: string): void {
    const now = new Date().toISOString();
    for (const f of job.files) {
      f.status = 'failed';
      f.message = message;
      f.updatedAt = now;
    }
    job.failed = job.files.length;
    job.completed = job.files.length;
    job.running = false;
    job.currentFile = null;
    job.finishedAt = now;
    job.statusMessage = message;
  }

  private async runLocal(
    input: StartLocalParseInput,
    job: ParseJobState,
  ): Promise<void> {
    const sourceRoots = [input.sourceRoot];
    const requireLocal = input.requireLocalModel !== false;

    try {
      ensureKbIndexDir(input.indexRoot, input.kbId, sourceRoots);
      clearStaging(input.indexRoot, input.kbId, sourceRoots);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.failAllFiles(job, message);
      this.notify(job, input.onProgress);
      return;
    }

    const models = await this.resolveModels(input);
    job.ollamaAvailable = models.ollamaAvailable;
    job.embedModel = models.embedModel;
    job.chatModel = models.chatModel;

    if (requireLocal && !models.chatModel && !models.embedModel) {
      this.failAllFiles(job, NO_LOCAL_MODEL_HINT);
      this.notify(job, input.onProgress);
      return;
    }

    job.statusMessage = buildStatusMessage(job);
    this.notify(job, input.onProgress);
    await yieldEventLoop();

    let ollamaUsed = false;
    let chunkCount = 0;
    let cancelled = false;
    const embedModel = models.embedModel;
    const chatModel = models.chatModel;

    for (let i = 0; i < input.files.length; i++) {
      if (job.stopRequested) {
        cancelled = true;
        break;
      }
      const file = input.files[i]!;
      const rec = job.files[i]!;
      job.currentFile = file.relativePath;
      rec.status = 'progress';
      rec.updatedAt = new Date().toISOString();
      job.statusMessage = buildStatusMessage(job);
      this.notify(job, input.onProgress);
      await yieldEventLoop();

      try {
        const extracted = await extractTextFromFileAsync(file.path);
        const rawText = extracted.text || '';
        const extractIsJunk = isJunkIndexText(rawText);
        const usableText = extractIsJunk ? '' : rawText;
        const pieces = usableText
          ? chunkText(usableText).filter((piece) => !isJunkIndexText(piece.text))
          : [];
        const chunks: ChunkRecord[] = [];

        // Silent LLM parse: summarize with best useful local chat model
        if (chatModel && usableText.trim()) {
          const summary = await ollamaSummarize(chatModel, usableText);
          await yieldEventLoop();
          if (
            summary &&
            summary.trim() &&
            isAcceptableSummary(summary, usableText)
          ) {
            ollamaUsed = true;
            chunks.push({
              id: `chk-${randomUUID()}`,
              kbId: input.kbId,
              sourcePath: file.path,
              relativePath: file.relativePath,
              sourceKind: 'local',
              title: `${path.basename(file.name)} · 本地模型摘要`,
              text: `[本地模型 ${chatModel} 静默解析摘要]
${summary.trim()}`,
              startOffset: 0,
              endOffset: 0,
            });
          } else if (summary && summary.trim()) {
            rec.message = `本地模型 ${chatModel} 摘要质量不佳（已跳过）；已索引原文提取`;
          } else if (requireLocal && !embedModel) {
            // Chat model present but summarize failed — still index extract,
            // mark warn so UI is not fake-success silent.
            rec.message = `本地模型 ${chatModel} 摘要未返回；已索引原文提取`;
          }
        }

        for (const piece of pieces) {
          let embedding: number[] | undefined;
          if (embedModel && piece.text.trim()) {
            const emb = await ollamaEmbed(embedModel, piece.text);
            if (emb) {
              embedding = emb;
              ollamaUsed = true;
            }
            await yieldEventLoop();
          }
          chunks.push({
            id: `chk-${randomUUID()}`,
            kbId: input.kbId,
            sourcePath: file.path,
            relativePath: file.relativePath,
            sourceKind: 'local',
            title: path.basename(file.name),
            text: piece.text,
            startOffset: piece.start,
            endOffset: piece.end,
            embedding,
          });
        }

        if (!chunks.length) {
          rec.status = 'failed';
          rec.message = [
            rec.message,
            extracted.warn,
            '解析未产生可检索正文（可能是扫描件、空文档或仅含元数据），未写入索引',
          ]
            .filter(Boolean)
            .join(' · ');
          job.failed += 1;
          job.completed += 1;
          rec.updatedAt = new Date().toISOString();
          this.notify(job, input.onProgress);
          await yieldEventLoop();
          continue;
        }

        appendChunksStaging(
          input.indexRoot,
          input.kbId,
          chunks,
          sourceRoots,
        );
        commitStaging(input.indexRoot, input.kbId, sourceRoots);

        chunkCount += chunks.length;
        rec.chunkCount = chunks.length;
        if (extracted.warn) {
          rec.status = 'warn';
          rec.message = [rec.message, extracted.warn].filter(Boolean).join(' · ');
          job.warned += 1;
        } else if (rec.message) {
          rec.status = 'warn';
          job.warned += 1;
        } else {
          rec.status = 'done';
        }
        job.completed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        rec.status = 'failed';
        rec.message = message;
        job.failed += 1;
        job.completed += 1;
      }
      rec.updatedAt = new Date().toISOString();
      this.notify(job, input.onProgress);
      await yieldEventLoop();
    }

    if (cancelled) {
      for (const f of job.files) {
        if (f.status === 'queued') {
          f.status = 'skipped';
          f.message = 'stopped';
          f.updatedAt = new Date().toISOString();
        }
      }
      appendAudit(
        input.indexRoot,
        input.kbId,
        {
          event: 'parse_cancelled',
          completed: job.completed,
          total: job.total,
        },
        sourceRoots,
      );
    }

    clearStaging(input.indexRoot, input.kbId, sourceRoots);

    const prev = readMeta(input.indexRoot, input.kbId);
    const indexedFiles = job.files.filter(
      (f) =>
        (f.status === 'done' || f.status === 'warn') &&
        (f.chunkCount ?? 0) > 0,
    ).length;
    const meta: IndexMeta = {
      version: 1,
      kbId: input.kbId,
      sourceRoot: input.sourceRoot,
      kind: 'local',
      createdAt: prev?.createdAt || job.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileCount: indexedFiles,
      chunkCount,
      cancelled,
      ollamaUsed,
      embedModel,
      chatModel,
    };
    writeMeta(input.indexRoot, input.kbId, meta, sourceRoots);

    job.running = false;
    job.currentFile = null;
    job.finishedAt = new Date().toISOString();
    const noIndexNote =
      !cancelled && chunkCount === 0 ? ' · 未产生可检索正文' : '';
    job.statusMessage =
      `解析结束 · 完成 ${indexedFiles} · 失败 ${job.failed} · 警告 ${job.warned}` +
      (chatModel ? ` · 模型 ${chatModel}` : '') +
      (embedModel ? ` · 嵌入 ${embedModel}` : '') +
      noIndexNote;
    this.notify(job, input.onProgress);
  }
}
