import { expect, it } from 'vitest'
import {
  appendToDraft,
  classifySpeechError,
  foldSpeechEvent,
  formatClock,
  matchesQuery,
  validateSnippet,
} from '../src/client/logic.ts'

it('appends reviewed text without clobbering the current draft', () => {
  expect(appendToDraft('', '  任务  ')).toBe('任务')
  expect(appendToDraft('已有', '补充')).toBe('已有\n补充')
  expect(appendToDraft('已有 ', '补充')).toBe('已有 补充')
})

it('filters capability rows by a case-insensitive query', () => {
  expect(matchesQuery('', '知识库')).toBe(true)
  expect(matchesQuery('plan', 'Plan mode', 'Insert /plan')).toBe(true)
  expect(matchesQuery('知识', '知识库', '缺少插件')).toBe(true)
  expect(matchesQuery('codex', 'DSH')).toBe(false)
})

it('classifies microphone permission failures separately from other speech errors', () => {
  expect(classifySpeechError('not-allowed')).toBe('denied')
  expect(classifySpeechError('service-not-allowed')).toBe('denied')
  expect(classifySpeechError('network')).toBe('failed')
})

it('formats the recording clock as mm:ss', () => {
  expect(formatClock(0)).toBe('00:00')
  expect(formatClock(75)).toBe('01:15')
})

it('rejects empty, duplicate, and over-limit phrases before a Host write', () => {
  const existing = [{ label: '周报', text: '请整理本周进展' }]
  expect(validateSnippet('  ', 'x', existing)).toBe('empty')
  expect(validateSnippet('周报', '另一份', existing)).toBe('duplicate')
  expect(validateSnippet('周报', '改写', existing, 0)).toBe('ok')
  expect(validateSnippet('发布', '检查构建', Array.from({ length: 50 }, (_, index) => ({
    label: `p${index}`,
    text: 'x',
  })))).toBe('full')
})

it('folds final and interim speech results from one event', () => {
  expect(foldSpeechEvent({
    resultIndex: 0,
    results: {
      length: 2,
      0: { isFinal: true, length: 1, 0: { transcript: '确认' } },
      1: { isFinal: false, length: 1, 0: { transcript: '临时' } },
    },
  })).toEqual({ confirmed: '确认', pending: '临时' })
})
