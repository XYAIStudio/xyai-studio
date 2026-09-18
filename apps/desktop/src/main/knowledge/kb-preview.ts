/**
 * Local office-style KB file preview (main process).
 * Read-only: never writes source files. Path must be under mount sourceRoot.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isPathInside, type ChunkRecord } from '@xyai/knowledge';
import {
  buildKbPreviewProtocolUrl,
  registerKbPreviewSourceRoot,
} from './kb-preview-protocol.js';

export type KbPreviewKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'markdown'
  | 'html'
  | 'text'
  | 'unsupported'
  | 'error';

export type KbPreviewResult = {
  ok: boolean;
  kind: KbPreviewKind;
  filename: string;
  relativePath: string;
  ext: string;
  sizeBytes: number;
  /** 简介 — silent-LLM summary chunk or first extract chunk */
  summary?: string;
  /** Rendered HTML for 原文/预览 (sanitized / office-converted) */
  html?: string;
  /** Plain text fallback (monospace) */
  text?: string;
  /** PDF / binary as base64 for blob iframe (small files only) */
  base64?: string;
  /** Streamed protocol URL for large PDFs — prefer over base64 */
  previewUrl?: string;
  /** Absolute path for "open in system viewer" fallback */
  openPath?: string;
  mime?: string;
  parseStatus?: string;
  warn?: string;
  message?: string;
};

const MAX_PREVIEW_BYTES = 40 * 1024 * 1024; // 40 MiB hard cap for in-memory preview
const MAX_TEXT_CHARS = 800_000;
const MAX_XLSX_ROWS = 500;
const MAX_XLSX_COLS = 40;
const MAX_XLSX_SHEETS = 5;

const TEXT_EXTS = new Set([
  '.txt',
  '.log',
  '.csv',
  '.json',
  '.xml',
  '.yml',
  '.yaml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.css',
  '.scss',
]);

export function detectPreviewKind(filePath: string): KbPreviewKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.doc') return 'unsupported';
  if (ext === '.xlsx' || ext === '.xls') return 'xlsx';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (TEXT_EXTS.has(ext)) return 'text';
  return 'text'; // best-effort utf8 for other listed files
}

/**
 * Pick 简介 text from index chunks for this relative path.
 * Prefers silent-LLM summary chunk; else first non-empty extract chunk.
 */
export function pickFileSummary(
  chunks: ChunkRecord[],
  relativePath: string,
): string | undefined {
  const norm = relativePath.replace(/\\/g, '/').toLowerCase();
  const mine = chunks.filter(
    (c) => (c.relativePath || '').replace(/\\/g, '/').toLowerCase() === norm,
  );
  if (!mine.length) return undefined;
  const summaryChunk = mine.find(
    (c) =>
      (c.title && c.title.includes('本地模型摘要')) ||
      (c.text && c.text.startsWith('[本地模型')),
  );
  if (summaryChunk?.text) {
    return summaryChunk.text
      .replace(/^\[本地模型[^\]]*静默解析摘要\]\n?/, '')
      .trim();
  }
  const first = mine.find(
    (c) =>
      c.text &&
      c.text.trim() &&
      !c.text.startsWith('(no extractable text)'),
  );
  if (!first?.text) return undefined;
  const t = first.text.trim();
  return t.length > 1200 ? t.slice(0, 1200) + '…' : t;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimal markdown → HTML (headings, lists, code, links, bold/italic). */
export function markdownToSafeHtml(md: string): string {
  const escaped = escapeHtml(md);
  const lines = escaped.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  const inline = (s: string): string =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>',
      );

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push(
          `<pre class="kb-preview-pre"><code>${codeBuf.join('\n')}</code></pre>`,
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      closeLists();
      const n = h[1]!.length;
      out.push(`<h${n}>${inline(h[2]!)}</h${n}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeLists();
      out.push('<br/>');
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) {
    out.push(
      `<pre class="kb-preview-pre"><code>${codeBuf.join('\n')}</code></pre>`,
    );
  }
  closeLists();
  return `<div class="kb-md">${out.join('\n')}</div>`;
}

function sanitizeHtmlFragment(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

function sheetToHtmlTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheet: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  XLSX: any,
  sheetName: string,
): string {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];
  const capped = rows.slice(0, MAX_XLSX_ROWS);
  const truncated = rows.length > MAX_XLSX_ROWS;
  const thead =
    capped.length > 0
      ? `<tr>${(capped[0] as unknown[])
          .slice(0, MAX_XLSX_COLS)
          .map((c) => `<th>${escapeHtml(String(c ?? ''))}</th>`)
          .join('')}</tr>`
      : '';
  const bodyRows = capped.slice(1).map((row) => {
    const cells = (row as unknown[]).slice(0, MAX_XLSX_COLS);
    return `<tr>${cells
      .map((c) => `<td>${escapeHtml(String(c ?? ''))}</td>`)
      .join('')}</tr>`;
  });
  const note = truncated
    ? `<p class="kb-preview-warn">仅预览前 ${MAX_XLSX_ROWS} 行（共 ${rows.length} 行）</p>`
    : '';
  return `<section class="kb-sheet"><h3>${escapeHtml(sheetName)}</h3>${note}<div class="kb-sheet-scroll"><table class="kb-sheet-table"><thead>${thead}</thead><tbody>${bodyRows.join('')}</tbody></table></div></section>`;
}

export async function buildKbPreview(input: {
  absolutePath: string;
  sourceRoot: string;
  relativePath?: string;
  chunks?: ChunkRecord[];
  parseStatus?: string;
}): Promise<KbPreviewResult> {
  const abs = path.resolve(input.absolutePath);
  const root = path.resolve(input.sourceRoot);
  const filename = path.basename(abs);
  const ext = path.extname(abs).toLowerCase();
  const relativePath =
    input.relativePath ||
    (abs.startsWith(root)
      ? abs.slice(root.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
      : filename);

  const base: Omit<KbPreviewResult, 'ok' | 'kind'> = {
    filename,
    relativePath,
    ext,
    sizeBytes: 0,
    parseStatus: input.parseStatus,
  };

  if (!isPathInside(root, abs)) {
    return {
      ...base,
      ok: false,
      kind: 'error',
      message: '路径不在知识库源目录内（已拒绝）',
    };
  }

  let st;
  try {
    st = await stat(abs);
  } catch (err) {
    return {
      ...base,
      ok: false,
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (!st.isFile()) {
    return {
      ...base,
      ok: false,
      kind: 'error',
      message: '不是普通文件',
    };
  }
  base.sizeBytes = st.size;

  const summary = pickFileSummary(input.chunks || [], relativePath);
  if (summary) base.summary = summary;

  const kind = detectPreviewKind(abs);

  if (kind === 'unsupported' && ext === '.doc') {
    return {
      ...base,
      ok: true,
      kind: 'unsupported',
      warn: '暂不支持旧版 .doc，请另存为 .docx',
      html: `<div class="kb-preview-unsupported"><p>暂不支持旧版 <code>.doc</code>，请另存为 <code>.docx</code> 后再预览。</p></div>`,
    };
  }

  if (st.size > MAX_PREVIEW_BYTES) {
    return {
      ...base,
      ok: true,
      kind,
      warn: `文件过大（${st.size} bytes），无法整文件预览`,
      html: `<div class="kb-preview-unsupported"><p>文件过大，无法在应用内预览。请用系统应用打开。</p></div>`,
    };
  }

  try {
    if (kind === 'pdf') {
      registerKbPreviewSourceRoot(root);
      const PROTO_THRESHOLD = 2 * 1024 * 1024; // 2 MiB — avoid giant base64 IPC
      const previewUrl = buildKbPreviewProtocolUrl(abs);
      if (st.size > PROTO_THRESHOLD) {
        return {
          ...base,
          ok: true,
          kind: 'pdf',
          previewUrl,
          openPath: abs,
          mime: 'application/pdf',
          warn:
            st.size > 15 * 1024 * 1024
              ? 'PDF 较大，已改为流式预览'
              : undefined,
        };
      }
      // Small PDFs: still prefer protocol (no 30MB string), keep tiny base64 optional
      return {
        ...base,
        ok: true,
        kind: 'pdf',
        previewUrl,
        openPath: abs,
        mime: 'application/pdf',
      };
    }

    if (kind === 'docx') {
      const mammoth = await import('mammoth');
      const buf = await readFile(abs);
      const result = await mammoth.convertToHtml({ buffer: buf });
      const html = sanitizeHtmlFragment(result.value || '');
      const warnParts = (result.messages || [])
        .map((m: { message?: string }) => m.message || '')
        .filter(Boolean)
        .slice(0, 3);
      return {
        ...base,
        ok: true,
        kind: 'docx',
        html: `<div class="kb-office-docx">${html || '<p>（空文档）</p>'}</div>`,
        warn: warnParts.length ? warnParts.join('；') : undefined,
      };
    }

    if (kind === 'xlsx') {
      const XLSX = await import('xlsx');
      const buf = await readFile(abs);
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const names = (wb.SheetNames || []).slice(0, MAX_XLSX_SHEETS);
      if (!names.length) {
        return {
          ...base,
          ok: true,
          kind: 'xlsx',
          html: '<p>（空工作簿）</p>',
        };
      }
      const parts = names.map((name) =>
        sheetToHtmlTable(wb.Sheets[name], XLSX, name),
      );
      const more =
        (wb.SheetNames?.length || 0) > MAX_XLSX_SHEETS
          ? `<p class="kb-preview-warn">仅预览前 ${MAX_XLSX_SHEETS} 个工作表</p>`
          : '';
      return {
        ...base,
        ok: true,
        kind: 'xlsx',
        html: more + parts.join('\n'),
      };
    }

    const buf = await readFile(abs);
    let text = buf.toString('utf8');
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS) + '\n\n…（已截断）';
      base.warn = `文本过长，已截断至 ${MAX_TEXT_CHARS} 字符`;
    }

    if (kind === 'markdown') {
      return {
        ...base,
        ok: true,
        kind: 'markdown',
        html: markdownToSafeHtml(text),
        text,
      };
    }

    if (kind === 'html') {
      return {
        ...base,
        ok: true,
        kind: 'html',
        html: `<div class="kb-office-html">${sanitizeHtmlFragment(text)}</div>`,
        text,
      };
    }

    return {
      ...base,
      ok: true,
      kind: 'text',
      text,
      html: `<pre class="kb-preview-pre">${escapeHtml(text)}</pre>`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      ok: false,
      kind: 'error',
      message,
    };
  }
}
