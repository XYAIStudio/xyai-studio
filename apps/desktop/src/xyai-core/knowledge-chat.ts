/**
 * W-105 本地知识问答：只在本机已就绪语料上做关键词检索并生成带溯源脚标〔n〕的回答。
 * 本模块不持有任何外网客户端；本地 LLM 直答编排由后续 W-201 模型档位负责，
 * 此处先落地“引用注入 + 溯源脚标”的最小闭环（0.3.1 范围）。
 */

export interface KnowledgeChatCorpusDoc {
  readonly relPath: string
}

/** 主进程侧语料访问抽象：测试可用内存假数据，线上接 knowledge-parse-service。 */
export interface KnowledgeChatCorpus {
  listReady(mountId: string): readonly KnowledgeChatCorpusDoc[] | Promise<readonly KnowledgeChatCorpusDoc[]>
  readText(mountId: string, relPath: string): Promise<string | undefined>
}

export interface KnowledgeChatMountMeta {
  readonly id: string
  readonly name: string
}

export interface KnowledgeChatSource {
  readonly index: number
  readonly mountId: string
  readonly mountName: string
  readonly relPath: string
  readonly snippet: string
}

export interface KnowledgeChatInput {
  readonly question: string
  readonly scopeMountId?: string | null
}

export interface KnowledgeChatLimits {
  readonly maxMounts?: number
  readonly maxDocsPerMount?: number
  readonly maxTotalChars?: number
  readonly maxSources?: number
}

export interface KnowledgeChatResult {
  readonly question: string
  readonly scopeLabel: string
  readonly text: string
  readonly sources: readonly KnowledgeChatSource[]
  readonly scannedDocs: number
  readonly matchedDocs: number
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/u
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]+/gu
const LATIN_RE = /[a-z0-9][a-z0-9._-]*/g
const DEFAULT_LIMITS: Required<KnowledgeChatLimits> = {
  maxMounts: 24,
  maxDocsPerMount: 240,
  maxTotalChars: 8_000_000,
  maxSources: 6,
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (v !== '' && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** 把问题切成检索词：英文/数字词 + 中文二元组，中文短串额外整体加入。 */
export function tokenizeQuery(question: string): string[] {
  const lower = String(question ?? '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
  if (lower === '') return []
  const terms: string[] = []
  const latin = lower.match(LATIN_RE) ?? []
  for (const t of latin) {
    if (t.length >= 2 || /^\d+$/.test(t)) terms.push(t)
  }
  const hanRuns = lower.match(HAN_RE) ?? []
  for (const run of hanRuns) {
    if (run.length === 1) {
      terms.push(run)
      continue
    }
    for (let i = 0; i + 1 < run.length; i += 1) terms.push(run.slice(i, i + 2))
    if (run.length <= 10) terms.push(run)
  }
  return dedupe(terms)
}

/** 文档文本同样切词（与 query 同规约）。 */
export function tokenizeText(text: string): string[] {
  const lower = String(text ?? '').toLocaleLowerCase()
  const terms: string[] = []
  const latin = lower.match(LATIN_RE) ?? []
  for (const t of latin) {
    if (t.length >= 2 || /^\d+$/.test(t)) terms.push(t)
  }
  const hanRuns = lower.match(HAN_RE) ?? []
  for (const run of hanRuns) {
    if (run.length === 1) {
      terms.push(run)
      continue
    }
    for (let i = 0; i + 1 < run.length; i += 1) terms.push(run.slice(i, i + 2))
    if (run.length <= 10) terms.push(run)
  }
  return terms
}

function countTermInText(text: string, term: string): number {
  let count = 0
  if (CJK_RE.test(term)) {
    let at = 0
    while ((at = text.indexOf(term, at)) !== -1) {
      count += 1
      at += term.length
    }
    return count
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\$&')
  const re = new RegExp('(?<![a-z0-9])' + escaped + '(?![a-z0-9])', 'g')
  let m: RegExpExecArray | null = null
  while ((m = re.exec(text)) !== null) {
    count += 1
    if (m.index === re.lastIndex) re.lastIndex += 1
  }
  return count
}

interface ScoredDoc {
  mountId: string
  mountName: string
  relPath: string
  score: number
  totalChars: number
}

/**
 * 第一遍：给每个待扫文档统计词频，计算长度归一后的词频分。
 * 读取全程经由 corpus.readText（线上即本地语料文件），不产生任何外网请求。
 */
async function scanAndScore(
  corpus: KnowledgeChatCorpus,
  mounts: readonly KnowledgeChatMountMeta[],
  scopeMountId: string | null,
  terms: string[],
  limits: Required<KnowledgeChatLimits>,
): Promise<{ docs: ScoredDoc[]; scannedDocs: number; totalChars: number }> {
  const targets = scopeMountId === null ? mounts : mounts.filter((m) => m.id === scopeMountId)
  const scored: ScoredDoc[] = []
  let scannedDocs = 0
  let totalChars = 0
  let mountBudget = limits.maxMounts
  for (const mount of targets) {
    if (mountBudget <= 0 || totalChars >= limits.maxTotalChars) break
    mountBudget -= 1
    let docs: readonly KnowledgeChatCorpusDoc[] = []
    try {
      docs = await corpus.listReady(mount.id)
    } catch {
      continue
    }
    let docBudget = limits.maxDocsPerMount
    for (const doc of docs) {
      if (docBudget <= 0 || totalChars >= limits.maxTotalChars) break
      docBudget -= 1
      let text: string | undefined
      try {
        text = await corpus.readText(mount.id, doc.relPath)
      } catch {
        continue
      }
      if (typeof text !== 'string' || text.trim() === '') continue
      scannedDocs += 1
      totalChars += text.length
      let score = 0
      const lower = text.toLocaleLowerCase()
      const length = Math.max(1, lower.length)
      for (const term of terms) {
        const tf = countTermInText(lower, term)
        if (tf <= 0) continue
        score += Math.log(1 + tf) / Math.sqrt(length)
      }
      if (score > 0) {
        scored.push({ mountId: mount.id, mountName: mount.name, relPath: doc.relPath, score, totalChars: text.length })
      }
    }
  }
  return { docs: scored, scannedDocs, totalChars }
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 以 600 字窗口滑过正文，返回每个窗口的词频命中分（供选摘录片段）。 */
function windowScore(text: string, terms: string[], size = 600, overlap = 140): { start: number; score: number }[] {
  const lower = text.toLocaleLowerCase()
  const step = Math.max(40, size - overlap)
  const windows: { start: number; score: number }[] = []
  for (let start = 0; start < lower.length; start += step) {
    const end = Math.min(lower.length, start + size)
    const slice = lower.slice(start, end)
    let score = 0
    for (const term of terms) score += countTermInText(slice, term)
    if (score > 0) windows.push({ start, score })
    if (end >= lower.length) break
  }
  return windows.sort((a, b) => b.score - a.score)
}

function trimSnippet(text: string, start: number, width = 340): string {
  const begin = Math.max(0, start)
  const raw = text.slice(begin, begin + width)
  const clean = normalizeSpace(raw)
  return (begin > 0 ? '…' : '') + clean + (begin + width < text.length ? '…' : '')
}

function basenameOf(relPath: string): string {
  const parts = relPath.split(/[/\\]+/u)
  return parts[parts.length - 1] || relPath
}

function firstClause(text: string, width = 80): string {
  const flat = normalizeSpace(text)
  const m = flat.match(new RegExp('^[^。！？；\n]{1,' + width + '}(?=[。！？；\n])'))
  if (m) return m[0] + (flat[m[0].length] ?? '')
  return flat.slice(0, width) + (flat.length > width ? '…' : '')
}

/**
 * 组装回答：找不到时给出诚实提示；找到时按命中文档逐条给出“定位句 + 摘录 + 〔n〕”。
 * 不假装是模型推理结论——文案明确写着“本机语料整理”。
 */
export async function buildKnowledgeChatAnswer(
  corpus: KnowledgeChatCorpus,
  mounts: readonly KnowledgeChatMountMeta[],
  input: KnowledgeChatInput,
  limits: Partial<KnowledgeChatLimits> = {},
): Promise<KnowledgeChatResult> {
  const question = String(input.question ?? '').trim()
  const scopeMountId = typeof input.scopeMountId === 'string' && input.scopeMountId !== '' ? input.scopeMountId : null
  const all = Object.assign({}, DEFAULT_LIMITS, limits)
  const scopeMount = mounts.find((m) => m.id === scopeMountId) ?? null
  const scopeLabel = scopeMount === null ? '全部本地知识库' : '知识库「' + scopeMount.name + '」'
  const empty: KnowledgeChatResult = {
    question,
    scopeLabel,
    text: '请先输入要问的问题，例如：这份语料里提到了哪些产品能力？',
    sources: [],
    scannedDocs: 0,
    matchedDocs: 0,
  }
  if (question === '') return empty
  const terms = tokenizeQuery(question)
  if (terms.length === 0) return empty
  const pass1 = await scanAndScore(corpus, mounts, scopeMountId, terms, all)
  const candidates = pass1.docs.sort((a, b) => b.score - a.score).slice(0, all.maxSources)
  if (candidates.length === 0) {
    return {
      question,
      scopeLabel,
      text: '本机已就绪的' + scopeLabel + '里暂时没有找到与「' + question + '」直接相关的内容。你可以换个问法，或先把更多文档解析就绪再问。回答只在本机检索语料，不会上传任何数据。',
      sources: [],
      scannedDocs: pass1.scannedDocs,
      matchedDocs: 0,
    }
  }
  const sources: KnowledgeChatSource[] = []
  const bullets: string[] = []
  const heading = '根据' + scopeLabel + '中匹配到的 ' + candidates.length + ' 份相关文档，我整理了以下要点（〔编号〕可点开查看来源片段）：'
  let index = 0
  for (const doc of candidates) {
    let text: string | undefined
    try {
      text = await corpus.readText(doc.mountId, doc.relPath)
    } catch {
      continue
    }
    if (typeof text !== 'string' || text.trim() === '') continue
    const windows = windowScore(text, terms)
    const firstTerm = terms[0] === undefined ? '' : terms[0]
    const topWindow = windows[0]
    const best = topWindow !== undefined ? topWindow.start : Math.max(0, text.toLocaleLowerCase().indexOf(firstTerm))
    const snippet = text.trim().length > 0 ? trimSnippet(text, best, 340) : ''
    if (snippet === '') continue
    index += 1
    sources.push({ index, mountId: doc.mountId, mountName: doc.mountName, relPath: doc.relPath, snippet })
    const lead = firstClause(snippet, 80)
    bullets.push('〔' + index + '〕 ' + basenameOf(doc.relPath) + ' —— ' + lead)
  }
  if (sources.length === 0) {
    return {
      question,
      scopeLabel,
      text: '本机已就绪的' + scopeLabel + '里没有能引用到的就绪语料片段，请先在解析中心确认有文档显示为「已就绪」再提问。',
      sources: [],
      scannedDocs: pass1.scannedDocs,
      matchedDocs: pass1.docs.length,
    }
  }
  const text = heading + '\n\n' + bullets.join('\n') + '\n\n以上内容由本机已就绪语料直接整理：文件没有上传，回答也未调用云端。'
  return {
    question,
    scopeLabel,
    text,
    sources,
    scannedDocs: pass1.scannedDocs,
    matchedDocs: pass1.docs.length,
  }
}

/** 为本地小模型组装“只基于语料片段回答并保留溯源脚标”的提示词（W-201）。 */
export function buildGroundedLocalModelPrompt(result: KnowledgeChatResult): string {
  const context = result.sources
    .map((source) => '〔' + source.index + '〕 ' + source.mountName + ' / ' + source.relPath + '：\n' + source.snippet)
    .join('\n\n')
  const contextBlock = context === '' ? '（本机语料中没有检索到可引用片段）' : context
  return [
    '你是一个运行在用户电脑上的本机知识库助手。',
    '请只用下面提供的本地语料片段回答用户问题；不要编造，也不要调用网络。',
    '回答中请使用〔编号〕标注引用的片段，并在结尾列出用到的来源编号。',
    '如果片段不足以回答，请直接说明“本机语料中没有找到相关内容”。',
    '',
    '用户问题：' + result.question,
    '',
    '本地语料片段：',
    contextBlock,
  ].join('\n')
}

/** 把回答切成适合逐段推送的小块（尽量按句子断，便于“流式”观感）。 */
export function chunkAnswerStream(text: string, width = 48): string[] {
  const parts: string[] = []
  let rest = String(text ?? '')
  while (rest.length > 0) {
    const head = rest.slice(0, width)
    let cut = head.length
    const b = head.search(/[。！？；\n]/)
    if (b !== -1) cut = b + 1
    else if (head.length >= width) {
      const sp = head.lastIndexOf(' ')
      if (sp > width * 0.5) cut = sp + 1
    }
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  return parts.length > 0 ? parts : ['']
}
