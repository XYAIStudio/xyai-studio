/**
 * Knowledge document text extraction (W-102b).
 *
 * Self-contained and dependency-free so the offline desktop build has no
 * extra parse libraries to ship or resolve.  Coverage mirrors the 0.3.1
 * first batch (D5): plain text families, .docx (OOXML zip + XML), and
 * text-based .pdf content streams.  Scanned/image PDFs without an embedded
 * text layer fail honestly with a 'needs OCR later' style error instead of
 * pretending to succeed.
 */
import { inflateRawSync, inflateSync } from 'node:zlib'

export const MAX_EXTRACT_CHARACTERS = 200_000

export interface KnowledgeExtractionResult {
  readonly text: string
  readonly truncated: boolean
}

function cleanText(text: string): string {
  return text
    .replace(/\u0000/gu, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/gu, '')
    .replace(/\r\n/gu, '\n')
    .replace(/\r/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function limitText(text: string): KnowledgeExtractionResult {
  const cleaned = cleanText(text)
  if (cleaned.length <= MAX_EXTRACT_CHARACTERS) return { text: cleaned, truncated: false }
  return { text: cleaned.slice(0, MAX_EXTRACT_CHARACTERS), truncated: true }
}

/**
 * BOM-aware decoding: UTF-8 (default), UTF-16LE/BE.  Plain-text families in
 * the knowledge tree are overwhelmingly UTF-8; exotic legacy encodings are
 * out of the 0.3.1 scope and surface as a lossy fallback, never a crash.
 */
function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.subarray(3).toString('utf8')
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.subarray(2).toString('utf16le')
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const swapped = Buffer.alloc(buffer.length - 2)
    for (let index = 0; index < swapped.length; index += 2) {
      swapped[index] = buffer[index + 3] ?? 0
      swapped[index + 1] = buffer[index + 2] ?? 0
    }
    return swapped.toString('utf16le')
  }
  return buffer.toString('utf8')
}

/** Decode a plain-text family file (md/txt/json/csv and friends). */
export function extractPlainText(buffer: Buffer): KnowledgeExtractionResult {
  return limitText(decodeTextBuffer(buffer))
}

interface ZipEntry {
  readonly name: string
  readonly data: Buffer
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 22 - 65_536)
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054B50) return index
  }
  throw new Error('docx is not a valid ZIP archive')
}

function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  const entries = new Map<string, ZipEntry>()
  let cursor = directoryOffset
  for (let count = 0; count < entryCount; count += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014B50) break
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    if (buffer.readUInt32LE(localOffset) === 0x04034B50) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
      let data: Buffer
      if (method === 0) data = Buffer.from(compressed)
      else if (method === 8) data = inflateRawSync(compressed)
      else throw new Error(`unsupported ZIP method ${String(method)}`)
      entries.set(name, { name, data })
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  if (entries.size === 0) throw new Error('docx contains no readable entries')
  return entries
}

function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return value
    .replace(/&#x([0-9a-fA-F]+);/gu, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/gu, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&([a-zA-Z]+);/gu, (_match, name: string) => named[name] ?? `&${name};`
)
}

/**
 * Extract readable text from a .docx file: read word/document.xml from the
 * ZIP container and strip the OOXML markup while keeping paragraph breaks.
 */
export function extractDocxText(buffer: Buffer): KnowledgeExtractionResult {
  const entries = readZipEntries(buffer)
  let documentXml = entries.get('word/document.xml')?.data
  if (documentXml === undefined) {
    for (const [name, entry] of entries) {
      if (name.toLocaleLowerCase() === 'word/document.xml') {
        documentXml = entry.data
        break
      }
    }
  }
  if (documentXml === undefined) throw new Error('docx 缺少 word/document.xml')
  let xml = documentXml.toString('utf8')
  xml = xml.replace(/<w:tab[^>]*\/>/gu, '\t')
  xml = xml.replace(/<w:br[^>]*\/>/gu, '\n')
  xml = xml.replace(/<\/w:p[^>]*>/gu, '\n')
  xml = xml.replace(/<\/w:tr[^>]*>/gu, '\n')
  xml = xml.replace(/<\/w:tc[^>]*>/gu, '\t')
  const text = decodeXmlEntities(xml.replace(/<[^>]+>/gu, ''))
  return limitText(text)
}

function zlibOrRaw(buffer: Buffer): Buffer {
  if (buffer.length > 2 && buffer[0] === 0x78) {
    try {
      return inflateSync(buffer)
    } catch {
      try {
        return inflateRawSync(buffer)
      } catch {
        return buffer
      }
    }
  }
  try {
    return inflateRawSync(buffer)
  } catch {
    return buffer
  }
}

function collectPdfStreams(buffer: Buffer): Buffer[] {
  const latin = buffer.toString('latin1')
  const streams: Buffer[] = []
  let cursor = 0
  let guard = 0
  while (guard < 500) {
    guard += 1
    const keyword = latin.indexOf('stream', cursor)
    if (keyword === -1) break
    let start = keyword + 6
    if (latin.charCodeAt(start) === 13 && latin.charCodeAt(start + 1) === 10) start += 2
    else if (latin.charCodeAt(start) === 10 || latin.charCodeAt(start) === 13) start += 1
    const end = latin.indexOf('endstream', start)
    if (end === -1) break
    const raw = Buffer.from(latin.slice(start, end), 'latin1')
    streams.push(zlibOrRaw(raw))
    cursor = end + 9
  }
  return streams
}

function isWhitespaceCode(code: number): boolean {
  return code === 0 || code === 9 || code === 10 || code === 12 || code === 13 || code === 32
}

function decodePdfBytes(bytes: number[]): string {
  const highBytes = bytes.some(byte => byte >= 0x80)
  if (highBytes) {
    try {
      return new TextDecoder('windows-1252').decode(Uint8Array.from(bytes))
    } catch {
      return bytes.map(byte => String.fromCharCode(byte)).join('')
    }
  }
  return bytes.map(byte => String.fromCharCode(byte)).join('')
}

function readPdfLiteral(content: string, start: number): { bytes: number[]; next: number } {
  const bytes: number[] = []
  let index = start + 1
  while (index < content.length) {
    const code = content.charCodeAt(index)
    if (code === 0x5C) {
      const escaped = content.charCodeAt(index + 1)
      if (escaped === 0x6E) { bytes.push(10); index += 2; continue }
      if (escaped === 0x72) { bytes.push(13); index += 2; continue }
      if (escaped === 0x74) { bytes.push(9); index += 2; continue }
      if (escaped === 0x62) { bytes.push(8); index += 2; continue }
      if (escaped === 0x66) { bytes.push(12); index += 2; continue }
      if (escaped === 0x28 || escaped === 0x29 || escaped === 0x5C) { bytes.push(escaped); index += 2; continue }
      if (escaped >= 0x30 && escaped <= 0x37) {
        const octal = content.slice(index + 1, index + 4).replace(/[^0-7]/gu, '')
        bytes.push(Number.parseInt(octal.padEnd(3, '0'), 8))
        index += 1 + octal.length
        continue
      }
      index += 2
      continue
    }
    if (code === 0x29) break
    if (code === 0x28) {
      const nested = readPdfLiteral(content, index)
      bytes.push(...nested.bytes)
      index = nested.next
      continue
    }
    bytes.push(code)
    index += 1
  }
  return { bytes, next: Math.min(index + 1, content.length) }
}

function readPdfHex(content: string, start: number): { text: string; next: number } {
  const end = content.indexOf('>', start)
  let hex = content.slice(start + 1, end === -1 ? undefined : end).replace(/\s/gu, '')
  if (hex.length % 2 === 1) hex = hex + '0'
  const bytes: number[] = []
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16))
  }
  return { text: decodePdfBytes(bytes), next: (end === -1 ? content.length : end) + 1 }
}

function skipPdfToken(content: string, start: number): number {
  let index = start
  while (index < content.length && !isWhitespaceCode(content.charCodeAt(index)) && !'()<>[]{}/%'.includes(content[index] ?? '')) index += 1
  return index
}

function extractTextOperators(content: string): string {
  const out: string[] = []
  let inTextObject = false
  let index = 0
  while (index < content.length) {
    const code = content.charCodeAt(index)
    if (isWhitespaceCode(code)) { index += 1; continue }
    if (content[index] === '%') {
      const newline = content.indexOf('\n', index)
      index = newline === -1 ? content.length : newline + 1
      continue
    }
    if (content.startsWith('BT', index) && !isPdfNameChar(content.charCodeAt(index + 2))) {
      inTextObject = true
      index += 2
      continue
    }
    if (content.startsWith('ET', index) && !isPdfNameChar(content.charCodeAt(index + 2))) {
      inTextObject = false
      out.push('\n')
      index += 2
      continue
    }
    const character = content[index] ?? ''
    if (inTextObject && (content.startsWith('T*', index) || content.startsWith('Td', index) || content.startsWith('TD', index)) && !isPdfNameChar(content.charCodeAt(index + 2))) {
      out.push('\n')
      index += 2
      continue
    }
    if (character === '(' && inTextObject) {
      const literal = readPdfLiteral(content, index)
      const decoded = decodePdfBytes(literal.bytes)
      if (decoded !== '') out.push(decoded, ' ')
      index = literal.next
      continue
    }
    if (character === '<' && inTextObject && content[index + 1] !== '<') {
      const hex = readPdfHex(content, index)
      if (hex.text !== '') out.push(hex.text, ' ')
      index = hex.next
      continue
    }
    if (character === '<' && content[index + 1] === '<') {
      const dictEnd = content.indexOf('>>', index + 2)
      index = (dictEnd === -1 ? content.length : dictEnd) + 2
      continue
    }
    if (character === '[' && inTextObject) {
      const closing = content.indexOf(']', index)
      index = (closing === -1 ? content.length : closing) + 1
      continue
    }
    if (']()}'.includes(character)) { index += 1; continue }
    if (character === '/') {
      index = skipPdfToken(content, index + 1)
      continue
    }
    if (character === '{') {
      const closing = content.indexOf('}', index)
      index = (closing === -1 ? content.length : closing) + 1
      continue
    }
    index = skipPdfToken(content, index)
  }
  return out.join('')
}

function isPdfNameChar(code: number): boolean {
  return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122
}

/**
 * Extract the embedded text layer of a text-based PDF.  Fonts using custom
 * CMap encodings or image-only pages will yield nothing; that is reported
 * to the pipeline as a failed parse instead of a silent empty success.
 */
export function extractPdfText(buffer: Buffer): KnowledgeExtractionResult {
  const streams = collectPdfStreams(buffer)
  const pieces: string[] = []
  for (const stream of streams) {
    const latin = stream.toString('latin1')
    if (!latin.includes('BT') && !latin.includes('Tj') && !latin.includes('TJ')) continue
    const text = extractTextOperators(latin)
    if (text !== '') pieces.push(text)
  }
  const text = pieces.join('\n\n')
  if (text.trim() === '') throw new Error('PDF 无内嵌可抽取文本层（可能是扫描件，OCR 计划在 0.4+ 支持）')
  return limitText(text)
}
