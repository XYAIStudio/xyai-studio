import { expect, it } from 'vitest'
import {
  classifyInteractTitle,
  conversationOpenDetail,
  isWorkbenchMisland,
  partitionInteractSessions,
} from '../src/client/interact.ts'

it('classifies DM and group titles in both locales', () => {
  expect(classifyInteractTitle('Office Ops Desk · 单聊')).toBe('dm')
  expect(classifyInteractTitle('A、B · 协作')).toBe('group')
  expect(classifyInteractTitle('Office Ops Desk · single chat')).toBe('dm')
  expect(classifyInteractTitle('A, B · collaboration')).toBe('group')
  expect(classifyInteractTitle('Untitled session')).toBe('other')
})

it('partitions listed sessions and skips blank / other rows', () => {
  const { dm, group } = partitionInteractSessions([
    { id: 'blank', displayTitle: 'New', blank: true, updatedAt: 9 },
    { id: 'plain', displayTitle: 'notes', updatedAt: 8 },
    { id: 'old-dm', displayTitle: 'Cindy · 单聊', updatedAt: 1 },
    { id: 'new-dm', displayTitle: 'Ops · single chat', updatedAt: 5 },
    { id: 'g1', displayTitle: 'A、B · 协作', updatedAt: 3 },
  ])
  expect(dm.map(row => row.id)).toEqual(['new-dm', 'old-dm'])
  expect(group.map(row => row.id)).toEqual(['g1'])
})

it('opens chats onto conversation and never onto workbench', () => {
  expect(conversationOpenDetail('s1')).toEqual({ sessionId: 's1', view: 'conversation' })
  expect(isWorkbenchMisland('conversation')).toBe(false)
  expect(isWorkbenchMisland('workbench')).toBe(true)
  expect(isWorkbenchMisland('xyai-ai-team')).toBe(true)
  expect(isWorkbenchMisland('xyai-workbench')).toBe(true)
})
