import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  countMeaningfulChars,
  isJunkIndexText,
  extractPdfAsync,
  extractPdfRough,
  extractTextFromFile,
  preferMeaningfulSlice,
  stripPdfMetadataJunk,
  PDF_MIN_MEANINGFUL_CHARS,
} from './extract.js';

const temps: string[] = [];

afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore leftover tmp */
    }
  }
});

/** Minimal OOXML zip (method 8 = raw DEFLATE) — same path as Office .docx. */
function zipEntries(
  entries: { name: string; data: Buffer; method?: 0 | 8 }[],
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const comp = method === 8 ? deflateRawSync(e.data) : e.data;
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localFull = Buffer.concat([local, nameBuf, comp]);
    locals.push(localFull);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localFull.length;
  }
  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

function minimalDocx(paragraph: string): Buffer {
  const xml = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body><w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p></w:body></w:document>`,
    'utf8',
  );
  return zipEntries([{ name: 'word/document.xml', data: xml, method: 8 }]);
}

/** Tiny synthetic PDF with a visible text operator. */
function makeHelloPdf(text = 'HelloPDF'): Buffer {
  const stream = `BT /F1 24 Tf 100 100 Td (${text}) Tj ET`;
  const streamLen = Buffer.byteLength(stream, 'utf8');
  const body = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${streamLen} >>stream
${stream}
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000341 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
410
%%EOF`;
  return Buffer.from(body);
}

describe('stripPdfMetadataJunk', () => {
  it('removes XMP / rdf packets so chat does not feed Adobe metadata', () => {
    const junk =
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="Adobe"/></rdf:RDF></x:xmpmeta>' +
      '<?xpacket end="w"?>' +
      ' 国务院办公厅关于某某政策的通知 第一条 本规定自印发之日起施行 第二条 各地应当认真贯彻落实相关要求并做好配套工作';
    const cleaned = stripPdfMetadataJunk(junk);
    expect(cleaned).not.toMatch(/xpacket|xmpmeta|rdf:RDF/i);
    expect(cleaned).toContain('国务院');
    expect(countMeaningfulChars(cleaned)).toBeGreaterThan(PDF_MIN_MEANINGFUL_CHARS);
  });
});

describe('preferMeaningfulSlice', () => {
  it('skips XMP-heavy head when choosing chat window', () => {
    const xmp = ('<?xpacket begin?> adobe xmp meta rdf ' + 'pad '.repeat(2000)).repeat(3);
    const body = '政策文件正文内容关于深化改革促进发展的若干意见'.repeat(80);
    const sliced = preferMeaningfulSlice(xmp + body, 400);
    expect(sliced).toMatch(/政策|改革|发展/);
    expect(sliced).not.toMatch(/xpacket/i);
  });
});

describe('extractPdfRough', () => {
  it('skips xpacket streams', () => {
    const buf = Buffer.from(
      '%PDF-1.4\nstream\n<?xpacket begin=""><x:xmpmeta>meta</x:xmpmeta><?xpacket end="w"?>\nendstream\n' +
        'stream\n(国务院政策通知内容全文条款)\nendstream\n',
      'latin1',
    );
    const text = extractPdfRough(buf);
    expect(text).not.toMatch(/xpacket/i);
  });
});

describe('extractPdfAsync (unpdf)', () => {
  it('extracts page text from a tiny synthetic PDF buffer', async () => {
    const buf = makeHelloPdf('HelloPDF');
    const res = await extractPdfAsync(buf);
    expect(res.text).toContain('HelloPDF');
    expect(countMeaningfulChars(res.text)).toBeGreaterThanOrEqual(8);
    expect(res.warn || '').toMatch(/pdf\.js|rough|unpdf|pdf/i);
  }, 15_000);
});

describe('docx extract (ZIP method 8 / Office OOXML)', () => {
  it('inflates raw DEFLATE document.xml (zlib inflate() cannot)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xyai-docx-'));
    temps.push(dir);
    const file = path.join(dir, 'sample.docx');
    writeFileSync(
      file,
      minimalDocx('授权管理制度第一条 为规范集团公司治理结构'),
    );
    const res = extractTextFromFile(file);
    expect(res.text).toContain('授权管理制度');
    expect(res.text).toContain('集团公司');
    expect(res.warn).toBeUndefined();
  });

  it('extracts indexable body from the real 授权管理制度 Office fixture', () => {
    const fixture = fileURLToPath(
      new URL('../fixtures/shouquan-authorization.docx', import.meta.url),
    );
    const res = extractTextFromFile(fixture);
    expect(res.warn).toBeUndefined();
    expect(res.text).toContain('授权管理制度');
    expect(res.text).toMatch(/基本授权|特别授权/);
    expect(countMeaningfulChars(res.text)).toBeGreaterThan(200);
    expect(isJunkIndexText(res.text)).toBe(false);
  });
});

describe('isJunkIndexText', () => {
  it('flags XMP / xpacket metadata as junk', () => {
    const junk =
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="Adobe"/></rdf:RDF></x:xmpmeta>' +
      '<?xpacket end="w"?>';
    expect(isJunkIndexText(junk)).toBe(true);
  });

  it('accepts Chinese policy body', () => {
    const body =
      '国务院办公厅关于完整准确全面贯彻新发展理念做好碳达峰碳中和工作的意见。各地要认真组织实施，落实绿色低碳转型要求。';
    expect(isJunkIndexText(body)).toBe(false);
  });
});
