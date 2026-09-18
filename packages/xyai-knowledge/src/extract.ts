/**
 * Read-only text extraction from parseable files.
 * Never writes to source paths — only reads bytes / utf8.
 *
 * PDFs: prefer unpdf/pdf.js page text (Chinese policy docs); fall back to
 * capped rough scrape with XMP/metadata stripped. Chat/KB get meaningful body.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

export type ExtractResult = {
  text: string;
  warn?: string;
};

/** Cap rough PDF latin1 regex work (full 25MB+ buffers freeze Electron). */
export const PDF_ROUGH_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB

/** Chat/KB: enough for summarize, not whole books. */
export const PDF_CHAT_MAX_CHARS = 30_000;
export const PDF_CHAT_MAX_PAGES = 30;

/** Below this after cleanup → treat PDF extract as failed for chat. */
export const PDF_MIN_MEANINGFUL_CHARS = 40;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimal ZIP local-file scan for docx word/document.xml */
function extractDocxText(buf: Buffer): string | null {
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4b) {
      offset += 1;
      continue;
    }
    // local file header
    if (buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) break;
    if (name === 'word/document.xml' || name.endsWith('/word/document.xml')) {
      const raw = buf.subarray(dataStart, dataEnd);
      let xml: Buffer;
      try {
        xml = method === 0 ? Buffer.from(raw) : inflateSync(raw);
      } catch {
        return null;
      }
      const s = xml.toString('utf8');
      return s
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    offset = dataEnd;
  }
  return null;
}

/**
 * Strip Adobe XMP / RDF / PDF info dictionaries that rough scrape often
 * returns instead of page body (Chinese policy PDFs frequently hit this).
 */
export function stripPdfMetadataJunk(text: string): string {
  if (!text) return '';
  let s = text;
  // XMP packets
  s = s.replace(/<\?xpacket[\s\S]*?\?>/gi, ' ');
  s = s.replace(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/gi, ' ');
  s = s.replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/gi, ' ');
  s = s.replace(/xmlns(?::\w+)?="[^"]*"/gi, ' ');
  // Common metadata key noise from Info / XMP
  s = s.replace(
    /\b(?:xmp|pdf|dc|xmpMM|photoshop|tiff|exif|aux|crs|stRef|rdf|xml)(?::\w+)+\b/gi,
    ' ',
  );
  s = s.replace(
    /\b(?:Creator|Producer|Author|Title|Subject|Keywords|ModDate|CreationDate|MetadataDate|DocumentID|InstanceID|OriginalDocumentID)\b\s*[:=]?\s*/gi,
    ' ',
  );
  s = s.replace(/https?:\/\/[^\s]+/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Count CJK + Latin letters (meaningful body vs binary/XMP soup). */
export function countMeaningfulChars(text: string): number {
  if (!text) return 0;
  const m = text.match(/[\u4e00-\u9fffA-Za-z]/g);
  return m ? m.length : 0;
}

/** True when text looks like XMP / binary soup — must not be indexed or cited. */
export function isJunkIndexText(text: string): boolean {
  const s = (text || '').trim();
  if (!s) return true;
  // Explicit PDF/XMP/RDF metadata markers
  if (/<\?xpacket\b|<x:xmpmeta\b|<rdf:RDF\b|xmlns:xmp\b|\/xmpmeta/i.test(s)) {
    return true;
  }
  const meaningful = countMeaningfulChars(s);
  // Long binary/latin1 soup with almost no letters
  if (s.length > 80 && meaningful / s.length < 0.08) return true;
  // Short clean text (e.g. search stubs) is NOT junk — only fail when
  // low meaningful density accompanies metadata-ish tokens.
  if (
    meaningful < PDF_MIN_MEANINGFUL_CHARS &&
    s.length > 40 &&
    /xpacket|xmpmeta|xmlns:|rdf:|CreatorTool|ModDate|\/Type\s*\/Metadata/i.test(s)
  ) {
    return true;
  }
  return false;
}


/**
 * Prefer a window with high CJK/letter density for chat context.
 * Avoids feeding the model the XMP head of a long junk extract.
 */
export function preferMeaningfulSlice(
  text: string,
  maxChars = PDF_CHAT_MAX_CHARS,
): string {
  const cleaned = stripPdfMetadataJunk(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;

  const window = Math.min(maxChars, cleaned.length);
  const step = Math.max(500, Math.floor(window / 4));
  let bestStart = 0;
  let bestScore = -1;
  for (let i = 0; i + window <= cleaned.length; i += step) {
    const slice = cleaned.slice(i, i + window);
    const score = countMeaningfulChars(slice);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }
  // Also compare head (often metadata) vs best window
  const headScore = countMeaningfulChars(cleaned.slice(0, window));
  if (bestScore < headScore * 1.1) bestStart = 0;
  const out = cleaned.slice(bestStart, bestStart + window);
  return bestStart + window < cleaned.length ? `${out}\n…(截断)` : out;
}

/**
 * Very rough PDF text stream scrape (no full PDF parser).
 * Operates on a capped slice so large Chinese policy PDFs do not freeze.
 * Callers must strip metadata and score meaningfulness.
 */
export function extractPdfRough(
  buf: Buffer,
  maxBytes = PDF_ROUGH_MAX_BYTES,
): string {
  const slice = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
  const s = slice.toString('latin1');
  const parts: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  let streamCount = 0;
  const maxStreams = 400;
  while ((m = re.exec(s)) && streamCount < maxStreams) {
    streamCount += 1;
    const body = m[1] || '';
    // Skip obvious compressed/binary or XMP streams early
    if (
      /<\?xpacket|<x:xmpmeta|xmlns:xmp|rdf:RDF/i.test(body.slice(0, 200))
    ) {
      continue;
    }
    // Keep printable-ish runs (ASCII + CJK)
    const cleaned = body.replace(
      /[^\x09\x0a\x0d\x20-\x7e\u4e00-\u9fff]/g,
      ' ',
    );
    if (cleaned.trim().length > 20) parts.push(cleaned);
  }
  // Also pull literal strings ( ... )
  const lit = s.match(/\((?:\\.|[^\\)]){4,}\)/g) || [];
  for (const l of lit.slice(0, 400)) {
    const inner = l.slice(1, -1).replace(/\\n/g, '\n').replace(/\\(.)/g, '$1');
    if (/[\u4e00-\u9fffA-Za-z]{3,}/.test(inner)) parts.push(inner);
  }
  return stripPdfMetadataJunk(parts.join('\n').replace(/\s+/g, ' ').trim());
}

/**
 * Real page-text extract via unpdf (pdf.js). Caps pages/chars for chat.
 */
export async function extractPdfWithUnpdf(
  buf: Buffer,
  opts: { maxPages?: number; maxChars?: number } = {},
): Promise<ExtractResult> {
  const maxPages = opts.maxPages ?? PDF_CHAT_MAX_PAGES;
  const maxChars = opts.maxChars ?? PDF_CHAT_MAX_CHARS;
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const totalPages =
      typeof (pdf as { numPages?: number }).numPages === 'number'
        ? (pdf as { numPages: number }).numPages
        : undefined;

    // extractText with mergePages returns full doc; if huge, re-extract page-wise
    const result = await extractText(pdf, { mergePages: false });
    const pages: string[] = Array.isArray(result.text)
      ? (result.text as string[])
      : typeof result.text === 'string'
        ? [result.text]
        : [];

    const usedPages = pages.slice(0, maxPages);
    let text = usedPages
      .map((p) => (typeof p === 'string' ? p : String(p || '')))
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim();
    text = stripPdfMetadataJunk(text);

    let warn: string | undefined;
    const reported =
      typeof result.totalPages === 'number'
        ? result.totalPages
        : totalPages ?? pages.length;
    if (reported > maxPages) {
      warn = `pdf.js extract (first ${maxPages}/${reported} pages)`;
    } else {
      warn = 'pdf.js extract';
    }
    if (text.length > maxChars) {
      text = preferMeaningfulSlice(text, maxChars);
      warn = `${warn}; capped to ~${maxChars} chars`;
    }

    if (countMeaningfulChars(text) < PDF_MIN_MEANINGFUL_CHARS) {
      return {
        text: text || '',
        warn: `${warn}; little meaningful text (may be scanned/image PDF)`,
      };
    }
    return { text, warn };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: '', warn: `pdf.js extract failed: ${message}` };
  }
}

function extractPdfRoughResult(buf: Buffer): ExtractResult {
  const capped = buf.length > PDF_ROUGH_MAX_BYTES;
  const raw = extractPdfRough(buf);
  const text = preferMeaningfulSlice(raw, PDF_CHAT_MAX_CHARS);
  const meaningful = countMeaningfulChars(text);
  if (meaningful < PDF_MIN_MEANINGFUL_CHARS) {
    return {
      text: text || '',
      warn: capped
        ? `pdf rough extract weak (first ${PDF_ROUGH_MAX_BYTES} of ${buf.length} bytes; mostly metadata or empty)`
        : 'pdf rough extract weak (mostly metadata or empty)',
    };
  }
  return {
    text,
    warn: capped
      ? `pdf rough extract (first ${PDF_ROUGH_MAX_BYTES} of ${buf.length} bytes)`
      : 'pdf rough extract',
  };
}

/**
 * Prefer unpdf page text; fall back to cleaned rough scrape.
 */
export async function extractPdfAsync(buf: Buffer): Promise<ExtractResult> {
  const primary = await extractPdfWithUnpdf(buf);
  if (countMeaningfulChars(primary.text) >= PDF_MIN_MEANINGFUL_CHARS) {
    return primary;
  }
  const rough = extractPdfRoughResult(buf);
  if (countMeaningfulChars(rough.text) > countMeaningfulChars(primary.text)) {
    return {
      text: rough.text,
      warn: [primary.warn, rough.warn].filter(Boolean).join(' · '),
    };
  }
  return primary.text
    ? primary
    : rough.text
      ? rough
      : {
          text: '',
          warn:
            primary.warn ||
            rough.warn ||
            'pdf extract produced no meaningful text',
        };
}

function extractFromBufferSync(filePath: string, buf: Buffer): ExtractResult {
  const ext = path.extname(filePath).toLowerCase();

  if (
    [
      '.txt',
      '.md',
      '.markdown',
      '.csv',
      '.json',
      '.xml',
      '.yml',
      '.yaml',
      '.log',
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
    ].includes(ext)
  ) {
    return { text: buf.toString('utf8') };
  }

  if (ext === '.html' || ext === '.htm') {
    return { text: stripHtml(buf.toString('utf8')) };
  }

  if (ext === '.docx') {
    const text = extractDocxText(buf);
    if (!text) {
      return {
        text: '',
        warn: 'docx extract failed (unsupported compression or structure)',
      };
    }
    return { text };
  }

  if (ext === '.pdf') {
    // Sync path: rough only (unpdf is async). Prefer extractTextFromFileAsync.
    return extractPdfRoughResult(buf);
  }

  return { text: buf.toString('utf8'), warn: `unknown ext ${ext}` };
}

async function extractFromBufferAsync(
  filePath: string,
  buf: Buffer,
): Promise<ExtractResult> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    return extractPdfAsync(buf);
  }
  return extractFromBufferSync(filePath, buf);
}

/**
 * Open source file read-only and extract text. Never mutates the file.
 * Sync — PDF uses rough+cleanup only; prefer extractTextFromFileAsync.
 */
export function extractTextFromFile(filePath: string): ExtractResult {
  const buf = readFileSync(filePath);
  return extractFromBufferSync(filePath, buf);
}

/**
 * Async read + extract. PDFs use unpdf (pdf.js) then rough fallback.
 * Used by ParseEngine and chat attachment IPC.
 */
export async function extractTextFromFileAsync(
  filePath: string,
): Promise<ExtractResult> {
  const buf = await readFile(filePath);
  // Yield once after read so IPC can flush before CPU-heavy PDF work
  await new Promise<void>((r) => setImmediate(r));
  return extractFromBufferAsync(filePath, buf);
}

export function chunkText(
  text: string,
  opts: { chunkSize?: number; overlap?: number } = {},
): { text: string; start: number; end: number }[] {
  const chunkSize = opts.chunkSize ?? 1200;
  const overlap = opts.overlap ?? 150;
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  const out: { text: string; start: number; end: number }[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(cleaned.length, i + chunkSize);
    out.push({ text: cleaned.slice(i, end), start: i, end });
    if (end >= cleaned.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}
