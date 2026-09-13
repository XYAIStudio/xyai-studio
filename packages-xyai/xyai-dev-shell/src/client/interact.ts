/** Pure helpers for the 与AI互动 sidebar. */

export type InteractKind = 'dm' | 'group' | 'other'

/** One chat row shown under 与AI互动. */
export interface InteractRow {
  id: string
  title: string
  kind: Exclude<InteractKind, 'other'>
  updatedAt: number
}

const DM_MARKERS = [' · 单聊', ' · single chat']
const GROUP_MARKERS = [' · 协作', ' · collaboration']

/** Classify a session title using the AI-employee naming suffixes. */
export function classifyInteractTitle(title: string | undefined): InteractKind {
  const value = title ?? ''
  if (GROUP_MARKERS.some(marker => value.endsWith(marker))) return 'group'
  if (DM_MARKERS.some(marker => value.endsWith(marker))) return 'dm'
  return 'other'
}

/** Split listed sessions into DM and group chats, newest first. */
export function partitionInteractSessions(
  rows: ReadonlyArray<{ id: string; title?: string; displayTitle?: string; updatedAt?: number; blank?: boolean }>,
): { dm: InteractRow[]; group: InteractRow[] } {
  const dm: InteractRow[] = []
  const group: InteractRow[] = []
  for (const row of rows) {
    if (row.blank) continue
    const title = row.displayTitle || row.title || row.id
    const kind = classifyInteractTitle(title)
    if (kind === 'other') continue
    const item: InteractRow = { id: row.id, title, kind, updatedAt: row.updatedAt ?? 0 }
    if (kind === 'dm') dm.push(item)
    else group.push(item)
  }
  dm.sort((left, right) => right.updatedAt - left.updatedAt)
  group.sort((left, right) => right.updatedAt - left.updatedAt)
  return { dm, group }
}

/** Views that must not replace conversation when opening a chat. */
export function isWorkbenchMisland(viewId: string | undefined): boolean {
  return viewId === 'workbench' || viewId === 'xyai-workbench' || viewId === 'xyai-ai-team'
}

/** Detail for opening a chat onto the conversation surface. */
export function conversationOpenDetail(sessionId: string): { sessionId: string; view: 'conversation' } {
  return { sessionId, view: 'conversation' }
}
