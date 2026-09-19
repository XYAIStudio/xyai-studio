/**
 * Chat markdown → sanitized HTML. Escape first, then add tags.
 * No markdown-it in desktop; this matches knowledge-preview coverage
 * (headings, lists, code, links, bold/italic) plus blockquote/hr.
 */

export type MarkdownRenderOpts = {
  /** Wrapper class. Default `chat-md`. */
  wrapperClass?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s: string): string {
  const codes: string[] = [];
  let t = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000C${codes.length - 1}\u0000`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>',
  );
  t = t.replace(/\u0000C(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? '');
  return t;
}

/**
 * Strip leftover script/iframe/handlers. The generator already escapes
 * user text; this is defense in depth if a caller concatenates HTML.
 */
export function sanitizeHtmlFragment(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Convert markdown to a wrapped HTML fragment safe for `innerHTML`.
 *
 * @param md - Raw markdown (assistant or user bubble text)
 * @param opts - Optional wrapper class
 * @returns Sanitized HTML string
 */
export function markdownToSafeHtml(
  md: string,
  opts: MarkdownRenderOpts = {},
): string {
  const wrapperClass = opts.wrapperClass ?? 'chat-md';
  const escaped = escapeHtml(md);
  const lines = escaped.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];
  let inBq = false;

  const closeLists = (): void => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  const closeBq = (): void => {
    if (inBq) {
      out.push('</blockquote>');
      inBq = false;
    }
  };

  const closeBlocks = (): void => {
    closeLists();
    closeBq();
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeBlocks();
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
      closeBlocks();
      const n = h[1]!.length;
      out.push(`<h${n}>${inline(h[2]!)}</h${n}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeBlocks();
      out.push('<hr/>');
      continue;
    }

    const bq = /^&gt;\s?(.*)$/.exec(line);
    if (bq) {
      closeLists();
      if (!inBq) {
        out.push('<blockquote>');
        inBq = true;
      }
      const inner = bq[1] || '';
      out.push(inner.trim() ? `<p>${inline(inner)}</p>` : '<br/>');
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      closeBq();
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
      closeBq();
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
      closeBlocks();
      out.push('<br/>');
      continue;
    }

    closeBlocks();
    out.push(`<p>${inline(line)}</p>`);
  }

  if (inCode) {
    out.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`);
  }
  closeBlocks();
  return sanitizeHtmlFragment(
    `<div class="${wrapperClass}">${out.join('\n')}</div>`,
  );
}

/**
 * Plain-text clipboard payload. Markdown symbols stay as authored.
 *
 * @param md - Bubble text
 * @returns Trimmed markdown
 */
export function markdownAsPlainText(md: string): string {
  return md.replace(/\r\n/g, '\n');
}
