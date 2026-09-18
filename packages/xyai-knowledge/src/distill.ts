/**
 * Distill parsed chunks into markdown summaries / digest under a user-chosen folder.
 * Never writes into source trees — caller must pass an output directory outside sources.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChunkRecord } from './types.js';
import {
  listOllamaModelNames,
  ollamaSummarize,
  pickFastChatModel,
  probeOllama,
} from './ollama-kb.js';

export type DistillFileResult = {
  relativePath: string;
  title: string;
  summary: string;
  mode: 'ollama' | 'extract';
};

export type DistillResult = {
  ok: boolean;
  mode: 'ollama' | 'extract';
  model: string | null;
  outDir: string;
  files: DistillFileResult[];
  digestPath: string;
  message?: string;
};

function groupByFile(chunks: ChunkRecord[]): Map<string, ChunkRecord[]> {
  const map = new Map<string, ChunkRecord[]>();
  for (const c of chunks) {
    const key = c.relativePath || c.sourcePath;
    const list = map.get(key) || [];
    list.push(c);
    map.set(key, list);
  }
  return map;
}

function extractDigest(text: string, max = 800): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + '…';
}

export async function distillChunks(input: {
  chunks: ChunkRecord[];
  outDir: string;
  kbName?: string;
  /** Skip Ollama entirely (tests / offline). */
  forceExtract?: boolean;
}): Promise<DistillResult> {
  const outDir = path.resolve(input.outDir);
  mkdirSync(outDir, { recursive: true });

  let mode: 'ollama' | 'extract' = 'extract';
  let model: string | null = null;
  if (!input.forceExtract && (await probeOllama())) {
    const names = await listOllamaModelNames();
    model = pickFastChatModel(names);
    if (!model) {
      const nonEmbed = names.find((n) => !/embed|bge|minilm/i.test(n));
      model = nonEmbed || null;
    }
    if (model) mode = 'ollama';
  }

  const grouped = groupByFile(input.chunks);
  const files: DistillFileResult[] = [];
  const perFileDir = path.join(outDir, 'files');
  mkdirSync(perFileDir, { recursive: true });

  for (const [rel, chunks] of grouped) {
    const title = chunks[0]?.title || path.basename(rel);
    const joined = chunks.map((c) => c.text).join('\n\n');
    let summary: string;
    let fileMode: 'ollama' | 'extract' = 'extract';
    if (mode === 'ollama' && model) {
      const s = await ollamaSummarize(model, joined);
      if (s) {
        summary = s;
        fileMode = 'ollama';
      } else {
        summary = extractDigest(joined);
      }
    } else {
      summary = extractDigest(joined);
    }
    files.push({ relativePath: rel, title, summary, mode: fileMode });
    const safe = rel
      .replace(/[\\/]/g, '__')
      .replace(/[^\w.\u4e00-\u9fff-]+/g, '_');
    const md = `# ${title}\n\n源路径：\`${rel}\`\n\n模式：${
      fileMode === 'ollama' ? `Ollama（${model}）` : '纯文本摘录（无 Ollama）'
    }\n\n## 摘要\n\n${summary}\n`;
    writeFileSync(path.join(perFileDir, `${safe || 'file'}.md`), md, 'utf8');
  }

  const digestLines = [
    `# 知识库蒸馏成果${input.kbName ? ` — ${input.kbName}` : ''}`,
    '',
    `生成时间：${new Date().toISOString()}`,
    `模式：${
      mode === 'ollama'
        ? `Ollama 摘要（${model}）`
        : '纯文本摘录（无可用本地对话模型）'
    }`,
    `文件数：${files.length}`,
    '',
    '## 总览',
    '',
  ];
  for (const f of files) {
    digestLines.push(
      `### ${f.title}`,
      '',
      f.summary,
      '',
      `（${f.relativePath}）`,
      '',
    );
  }
  const digestPath = path.join(outDir, 'DIGEST.md');
  writeFileSync(digestPath, digestLines.join('\n'), 'utf8');

  return {
    ok: true,
    mode,
    model,
    outDir,
    files,
    digestPath,
    message:
      mode === 'ollama'
        ? `已用本地模型 ${model} 生成蒸馏摘要`
        : '无 Ollama 对话模型，已写入纯文本摘录并标注',
  };
}
