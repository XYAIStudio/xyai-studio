import { describe, expect, it } from 'vitest';
import {
  markdownAsPlainText,
  markdownToSafeHtml,
  sanitizeHtmlFragment,
} from './markdown-safe.js';

const SCREENSHOT_MD = `## 一、制度定位与目的

这是一份集团层面的**授权管理制度**，核心目标是：

- 规范和完善集团公司治理结构；
- 强化集团公司对子公司或关联公司的统一管理；
- 在"集中决策"与"适当分权"之间取得平衡；
- 满足集团和谐、高效管理的需要。

1. **第一章 总则**: 目的、依据、授权定义、基本原则。
2. **第二章 授权的范围、类别和形式**: 基本授权与特别授权。
`;

describe('markdownToSafeHtml', () => {
  it('renders the screenshot case as headings, bold, and lists (no raw ##/**)', () => {
    const html = markdownToSafeHtml(SCREENSHOT_MD);
    expect(html).toContain('<h2>一、制度定位与目的</h2>');
    expect(html).toContain('<strong>授权管理制度</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>规范和完善集团公司治理结构；</li>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<strong>第一章 总则</strong>');
    expect(html).not.toMatch(/##\s/);
    expect(html).not.toContain('**授权管理制度**');
  });

  it('escapes HTML then still renders bold', () => {
    const html = markdownToSafeHtml('# Hello\n<script>x</script>\n**bold**');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders fenced code, links, and blockquotes', () => {
    const html = markdownToSafeHtml(
      'see [docs](https://example.com/a)\n\n> quoted\n\n```\nconst x = 1;\n```\n',
    );
    expect(html).toContain(
      '<a href="https://example.com/a" rel="noopener noreferrer" target="_blank">docs</a>',
    );
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<pre><code>const x = 1;</code></pre>');
    expect(html).not.toMatch(/javascript:/i);
  });

  it('does not turn javascript: URLs into links', () => {
    const html = markdownToSafeHtml('[x](javascript:alert(1))');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('[x](alert(1))');
  });

  it('keeps incomplete fences as a code block (streaming)', () => {
    const html = markdownToSafeHtml('```js\nconst a = 1;');
    expect(html).toContain('<pre><code>const a = 1;</code></pre>');
  });

  it('uses the requested wrapper class', () => {
    const html = markdownToSafeHtml('hi', { wrapperClass: 'kb-md' });
    expect(html).toContain('class="kb-md"');
  });
});

describe('sanitizeHtmlFragment', () => {
  it('strips script, iframe, handlers, and javascript: urls', () => {
    const dirty =
      '<p onclick="x()">ok</p><script>alert(1)</script><iframe src="https://x"></iframe><a href="javascript:alert(1)">a</a>';
    const clean = sanitizeHtmlFragment(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('onclick=');
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('<p>ok</p>');
  });
});

describe('markdownAsPlainText', () => {
  it('normalizes newlines without stripping markdown', () => {
    expect(markdownAsPlainText('a\r\n**b**')).toBe('a\n**b**');
  });
});
