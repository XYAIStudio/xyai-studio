import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeChatAnswer,
  chunkAnswerStream,
  tokenizeQuery,
  tokenizeText,
  type KnowledgeChatCorpus,
  type KnowledgeChatSource,
} from '../src/xyai-core/knowledge-chat.ts'

interface FakeDoc {
  mountId: string
  relPath: string
  text: string
}

function fakeCorpus(docs: FakeDoc[]): KnowledgeChatCorpus {
  return {
    listReady: (mountId: string) => docs.filter((d) => d.mountId === mountId).map((d) => ({ relPath: d.relPath })),
    readText: async (mountId: string, relPath: string) => {
      const found = docs.find((d) => d.mountId === mountId && d.relPath === relPath)
      return found?.text
    },
  }
}

const MOUNTS = [
  { id: 'm-product', name: '产品手册' },
  { id: 'm-meeting', name: '会议记录' },
]

const DOCS: FakeDoc[] = [
  {
    mountId: 'm-product',
    relPath: 'privacy/local-first.md',
    text: 'XYAI 坚持本地优先：解析与检索都在用户电脑上完成，文件不会上传到云端。隐私保护是默认能力。',
  },
  {
    mountId: 'm-product',
    relPath: 'usage/knowledge-base.md',
    text: '挂接任意文件夹后，系统会自动解析 txt、md、json、csv 等文档，并在解析中心展示就绪清单。',
  },
  {
    mountId: 'm-meeting',
    relPath: 'meet-20260903.md',
    text: '本周会议讨论了产品发布节奏与用户培训安排，没有涉及技术细节。',
  },
]

describe('W-105 knowledge-chat tokenizer', () => {
  it('切出中文二元组与英文/数字词', () => {
    const terms = tokenizeQuery('本地模型 product key 2026')
    expect(terms).toContain('本地')
    expect(terms).toContain('模型')
    expect(terms).toContain('product')
    expect(terms).toContain('key')
    expect(terms).toContain('2026')
  })

  it('文档与问题使用同一套切词规约', () => {
    const textTerms = new Set(tokenizeText('本地优先 隐私保护 local first'))
    expect(textTerms.has('本地')).toBe(true)
    expect(textTerms.has('优先')).toBe(true)
    expect(textTerms.has('local')).toBe(true)
  })
})

describe('W-105 knowledge-chat local retrieval & citations', () => {
  it('命中正确的本地文档并生成带脚标的回答', async () => {
    const result = await buildKnowledgeChatAnswer(fakeCorpus(DOCS), MOUNTS, { question: '本地隐私保护怎么做的？' })
    expect(result.sources.length).toBeGreaterThan(0)
    const relPaths = result.sources.map((s: KnowledgeChatSource) => s.relPath)
    expect(relPaths).toContain('privacy/local-first.md')
    expect(result.text).toContain('〔1〕')
    expect(result.text).toContain('本机已就绪语料')
    expect(result.scopeLabel).toContain('全部本地知识库')
  })

  it('限定单个知识库后不再命中其他库', async () => {
    const result = await buildKnowledgeChatAnswer(fakeCorpus(DOCS), MOUNTS, {
      question: '隐私',
      scopeMountId: 'm-meeting',
    })
    expect(result.sources).toHaveLength(0)
    expect(result.text).toContain('没有找到')
  })

  it('空问题与无命中都给出诚实提示', async () => {
    const empty = await buildKnowledgeChatAnswer(fakeCorpus(DOCS), MOUNTS, { question: '' })
    expect(empty.sources).toHaveLength(0)
    expect(empty.text).toContain('请先输入')

    const none = await buildKnowledgeChatAnswer(fakeCorpus(DOCS), MOUNTS, { question: '量子计算 xyz' })
    expect(none.sources).toHaveLength(0)
    expect(none.text).toContain('没有找到')
  })

  it('来源脚标与回答文本顺序一致，且 snippet 可读', async () => {
    const result = await buildKnowledgeChatAnswer(fakeCorpus(DOCS), MOUNTS, { question: '解析 txt 文档' })
    expect(result.sources.length).toBeGreaterThan(0)
    const topSource = result.sources[0]
    if (topSource === undefined) throw new Error('sources should not be empty')
    expect(topSource.snippet.length).toBeGreaterThan(20)
    expect(result.text.length).toBeGreaterThan(topSource.snippet.length)
  })
})

describe('W-105 knowledge-chat answer streaming chunks', () => {
  it('分块拼接回原文且每块非空', () => {
    const text = '根据本地语料整理了以下要点。\n\n〔1〕 第一条要点：内容与隐私相关。\n\n以上回答由本机语料整理。'
    const pieces = chunkAnswerStream(text)
    expect(pieces.length).toBeGreaterThan(1)
    for (const piece of pieces) expect(piece.length).toBeGreaterThan(0)
    expect(pieces.join('')).toBe(text)
  })
})

describe('W-201 grounded local model prompt', () => {
  it('carries the question, snippets and citation indexes', async () => {
    const { buildGroundedLocalModelPrompt } = await import('../src/xyai-core/knowledge-chat.ts')
    const prompt = buildGroundedLocalModelPrompt({
      question: '隐私怎么保护',
      scopeLabel: '全部本地知识库',
      text: '',
      scannedDocs: 1,
      matchedDocs: 1,
      sources: [{ index: 1, mountId: 'm1', mountName: '产品手册', relPath: 'privacy.md', snippet: '解析与检索都在本机完成' }],
    })
    expect(prompt).toContain('隐私怎么保护')
    expect(prompt).toContain('〔1〕')
    expect(prompt).toContain('解析与检索都在本机完成')
    expect(prompt).toContain('不要编造')
  })
})
