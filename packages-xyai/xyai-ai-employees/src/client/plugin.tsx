import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  AI_TEAM_CHANNEL, type AiTeamAnswer, type EmployeeLibrary, type EmployeeRecord,
  type EmployeeSettings, type TeamOutcome, type TeamStartResult,
} from '../protocol.ts'
import { en, zh, type XyaiAiEmployeesKey } from './locales.ts'
import { injectAiTeamCss } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { xyaiAiEmployees: XyaiAiEmployeesKey }
}

const NS = 'xyaiAiEmployees'
export const inject = ['slots', 'locale', 'connection', 'sessions']

interface TeamMember {
  readonly role?: 'lead' | 'teammate'
  readonly name: string
  readonly description: string
  readonly status: string
}
interface TeamTask {
  readonly id: string
  readonly subject: string
  readonly description: string
  readonly status: string
  readonly revision: number
}
interface TeamView { readonly members: TeamMember[]; readonly tasks: TeamTask[] }

type Call = <T>(endpoint: string, payload?: unknown) => Promise<T>
interface SharedProps {
  readonly call: Call
  readonly sessions: ISessions
  readonly t: (key: XyaiAiEmployeesKey) => string
}

const csv = (value: string): string[] => [...new Set(value.split(/[,，\n]/u).map(item => item.trim()).filter(Boolean))]
const joined = (value: readonly string[]): string => value.join('，')
const draftOf = (employee: EmployeeRecord): EmployeeSettings => employee.draft ?? employee.published
const openCollaboration = (sessions: ISessions, sessionId: string): void => {
  sessions.open(sessionId as never)
  queueMicrotask(() => window.dispatchEvent(new CustomEvent('xyai:open-view', { detail: { id: 'xyai-ai-team' } })))
}

function useLibrary(call: Call) {
  const [library, setLibrary] = useState<EmployeeLibrary | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try { setLibrary(await call<EmployeeLibrary>('employees/list')); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [call])
  useEffect(() => { void refresh() }, [refresh])
  return { library, setLibrary, error, refresh }
}

function EmployeeEditor(props: SharedProps & { library: EmployeeLibrary; employee: EmployeeRecord; onSaved: (library: EmployeeLibrary) => void; onClose: () => void }) {
  const source = draftOf(props.employee)
  const [value, setValue] = useState(() => ({ ...source, skills: joined(source.skills), routines: joined(source.routines), integrations: joined(source.integrations), knowledge: joined(source.knowledge), tools: joined(source.tools) }))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const settings = (): EmployeeSettings => ({ instructions: value.instructions.trim(), memory: value.memory.trim(), skills: csv(value.skills), routines: csv(value.routines), integrations: csv(value.integrations), knowledge: csv(value.knowledge), tools: csv(value.tools) })
  const run = async (endpoint: string, payload: unknown) => {
    setPending(true); setError('')
    try { props.onSaved(await props.call<EmployeeLibrary>(endpoint, payload)); if (endpoint !== 'employees/save-draft') props.onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false) }
  }
  const publish = async () => {
    setPending(true); setError('')
    try {
      const saved = await props.call<EmployeeLibrary>('employees/save-draft', { employeeId: props.employee.id, expectedRevision: props.library.revision, settings: settings() })
      const published = await props.call<EmployeeLibrary>('employees/publish', { employeeId: props.employee.id, expectedRevision: saved.revision })
      props.onSaved(published); props.onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false) }
  }
  const changed = (Object.keys(settings()) as Array<keyof EmployeeSettings>).filter(key => JSON.stringify(settings()[key]) !== JSON.stringify(props.employee.published[key]))
  const field = (key: keyof typeof value, label: XyaiAiEmployeesKey, wide = false, area = false) => <label className={`xyt-field ${wide ? 'xyt-field-wide' : ''}`}><span>{props.t(label)}</span>{area ? <textarea value={value[key]} onChange={event => setValue(current => ({ ...current, [key]: event.target.value }))} /> : <input value={value[key]} onChange={event => setValue(current => ({ ...current, [key]: event.target.value }))} />}</label>
  return <div className="xyt-modal" role="presentation"><section className="xyt-dialog" role="dialog" aria-modal="true" aria-label={props.t('settings.title')}><header className="xyt-dialog-head"><h3>{props.employee.name} · {props.t('settings.title')}</h3><button className="xyt-btn" type="button" onClick={props.onClose}>{props.t('close')}</button></header>{confirmPublish ? <><h4>{props.t('publish.reviewTitle')}</h4><p>{props.t('publish.reviewHelp')}</p><ul>{changed.map(key => <li key={key}>{props.t(`settings.${key}` as XyaiAiEmployeesKey)}</li>)}</ul>{error && <p className="xyt-status xyt-error" role="alert">{error}</p>}<footer className="xyt-actions"><button className="xyt-btn" type="button" disabled={pending} onClick={() => setConfirmPublish(false)}>{props.t('cancel')}</button><button className="xyt-btn xyt-primary" type="button" disabled={pending || changed.length === 0} onClick={() => { void publish() }}>{pending ? props.t('loading') : props.t('publish.confirm')}</button></footer></> : <><div className="xyt-form">{field('instructions', 'settings.instructions', true, true)}{field('memory', 'settings.memory', true, true)}{field('skills', 'settings.skills')}{field('routines', 'settings.routines')}{field('integrations', 'settings.integrations')}{field('knowledge', 'settings.knowledge')}{field('tools', 'settings.tools', true)}<small className="xyt-field-wide xyt-meta">{props.t('settings.listHelp')}</small></div>{error && <p className="xyt-status xyt-error" role="alert">{error}</p>}<footer className="xyt-actions" style={{ marginTop: 18 }}><button className="xyt-btn" type="button" disabled={pending || value.instructions.trim() === ''} onClick={() => { void run('employees/save-draft', { employeeId: props.employee.id, expectedRevision: props.library.revision, settings: settings() }) }}>{props.t('saveDraft')}</button>{props.employee.draft && <button className="xyt-btn" type="button" disabled={pending} onClick={() => { void run('employees/discard-draft', { employeeId: props.employee.id, expectedRevision: props.library.revision }) }}>{props.t('discard')}</button>}<button className="xyt-btn xyt-primary" type="button" disabled={pending || value.instructions.trim() === '' || changed.length === 0} onClick={() => setConfirmPublish(true)}>{props.t('publish')}</button></footer></>}</section></div>
}

function EmployeeCards(props: SharedProps & { library: EmployeeLibrary; selected: readonly string[]; pending: boolean; onToggle: (id: string) => void; onSingle: (id: string) => void; onSaved: (library: EmployeeLibrary) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<EmployeeRecord | null>(null)
  const categories = useMemo(() => [...new Set(props.library.employees.map(employee => employee.category))], [props.library.employees])
  const rows = useMemo(() => props.library.employees.filter(employee => (category === '' || employee.category === category) && `${employee.name} ${employee.description} ${employee.category} ${employee.published.knowledge.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [category, props.library.employees, query])
  return <><div className="xyt-toolbar"><input className="xyt-search" aria-label={props.t('search')} value={query} onChange={event => setQuery(event.target.value)} placeholder={props.t('search')} /><select className="xyt-btn" aria-label={props.t('category.all')} value={category} onChange={event => setCategory(event.target.value)}><option value="">{props.t('category.all')}</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="xyt-grid">{rows.map(employee => { const checked = props.selected.includes(employee.id); const chatLabel = `${props.t('collaboration.oneToOne')} ${employee.name}`; return <article className="xyt-card" key={employee.id}><label className="xyt-group-check"><input type="checkbox" disabled={props.pending} checked={checked} aria-label={`${props.t('collaboration.groupSelect')} ${employee.name}`} onChange={() => props.onToggle(employee.id)}/><span>{checked ? props.t('selected') : props.t('collaboration.groupSelect')}</span></label><h3>{employee.name}</h3><div className="xyt-meta">{employee.category} · v{employee.revision} · {props.t(employee.draft ? 'draft' : 'published')}</div><p>{employee.description}</p><div className="xyt-actions"><button className="xyt-btn" type="button" disabled={props.pending} onClick={() => setEditing(employee)}>{props.t('edit')}</button><button className="xyt-btn xyt-primary xyt-icon-btn" type="button" disabled={props.pending} aria-label={chatLabel} title={chatLabel} onClick={() => props.onSingle(employee.id)}>💬</button></div></article> })}</div>{editing && <EmployeeEditor {...props} employee={editing} onClose={() => setEditing(null)} />}</>
}

function TeamPanel(props: SharedProps & { sessionId: string; employees: readonly EmployeeRecord[]; onInvite: (employeeIds: readonly string[]) => void }) {
  const [view, setView] = useState<TeamView | null>(null)
  const [message, setMessage] = useState<Record<string, string>>({})
  const [task, setTask] = useState({ subject: '', description: '' })
  const [editingTask, setEditingTask] = useState<TeamTask | null>(null)
  const [invited, setInvited] = useState<string[]>([])
  const [error, setError] = useState('')
  const refresh = useCallback(async () => { try { setView(await props.call<TeamView>('team/view', { sessionId: props.sessionId })); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }, [props.call, props.sessionId])
  useEffect(() => { void refresh() }, [refresh])
  if (!view) return <p>{error || props.t('loading')}</p>
  const mutateTask = async (item: TeamTask, action: string, fields: Record<string, string> = {}) => { try { await props.call('tasks/update', { sessionId: props.sessionId, taskId: item.id, expectedRevision: item.revision, action, ...fields }); setEditingTask(null); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  const teammates = view.members.filter(member => member.role !== 'lead')
  const existing = new Set(teammates.map(member => member.name))
  const candidates = props.employees.filter(employee => !existing.has(employee.id))
  const groupIds = [...teammates.map(member => member.name), ...invited]
  return <div><button className="xyt-btn" type="button" onClick={() => { void refresh() }}>{props.t('team.refresh')}</button>{error && <p className="xyt-status xyt-error" role="alert">{error}</p>}<h3>{props.t('tab.team')}</h3>{teammates.length === 0 ? <p className="xyt-empty">{props.t('team.empty')}</p> : teammates.map(member => { const displayName = props.employees.find(employee => employee.id === member.name)?.name ?? member.name; return <div className="xyt-member" key={member.name}><span><b>{displayName}</b><br/><small>{member.description}</small></span><span>{props.t(member.status === 'running' ? 'status.running' : 'status.idle')}</span><form className="xyt-compose" onSubmit={event => { event.preventDefault(); const text = message[member.name]?.trim(); if (text) void props.call('team/send', { sessionId: props.sessionId, target: member.name, message: text }).then(() => setMessage(current => ({ ...current, [member.name]: '' }))).catch(cause => setError(String(cause))) }}><input aria-label={`${props.t('team.message')} ${displayName}`} value={message[member.name] ?? ''} onChange={event => setMessage(current => ({ ...current, [member.name]: event.target.value }))}/><button className="xyt-btn" type="submit">{props.t('team.send')}</button></form></div> })}{teammates.length > 0 && candidates.length > 0 && <section className="xyt-invite"><h3>{props.t('collaboration.invite')}</h3>{candidates.map(employee => <label key={employee.id}><input type="checkbox" checked={invited.includes(employee.id)} aria-label={`${props.t('collaboration.invite')} ${employee.name}`} onChange={() => setInvited(current => current.includes(employee.id) ? current.filter(id => id !== employee.id) : [...current, employee.id].slice(0, Math.max(0, 6 - teammates.length)))} /> {employee.name}</label>)}<button className="xyt-btn xyt-primary" type="button" disabled={invited.length === 0 || groupIds.length < 2 || groupIds.length > 6} onClick={() => props.onInvite(groupIds)}>{props.t('collaboration.startInvitedGroup')}</button></section>}<h3>{props.t('tab.tasks')}</h3><form className="xyt-task-form" onSubmit={event => { event.preventDefault(); if (!task.subject.trim() || !task.description.trim()) return; void props.call('tasks/create', { sessionId: props.sessionId, subject: task.subject, description: task.description, writeScopes: [] }).then(async () => { setTask({ subject: '', description: '' }); await refresh() }).catch(cause => setError(String(cause))) }}><input aria-label={props.t('task.subject')} value={task.subject} onChange={event => setTask(current => ({ ...current, subject: event.target.value }))}/><input aria-label={props.t('task.description')} value={task.description} onChange={event => setTask(current => ({ ...current, description: event.target.value }))}/><button className="xyt-btn xyt-primary" type="submit">{props.t('task.create')}</button></form>{view.tasks.length === 0 ? <p className="xyt-empty">{props.t('task.empty')}</p> : view.tasks.map(item => editingTask?.id === item.id ? <form className="xyt-task-form" key={item.id} onSubmit={event => { event.preventDefault(); if (editingTask.subject.trim() && editingTask.description.trim()) void mutateTask(item, 'edit', { subject: editingTask.subject, description: editingTask.description }) }}><input aria-label={props.t('task.subject')} value={editingTask.subject} onChange={event => setEditingTask(current => current === null ? null : { ...current, subject: event.target.value })}/><input aria-label={props.t('task.description')} value={editingTask.description} onChange={event => setEditingTask(current => current === null ? null : { ...current, description: event.target.value })}/><button className="xyt-btn xyt-primary" type="submit">{props.t('task.edit')}</button><button className="xyt-btn" type="button" onClick={() => setEditingTask(null)}>{props.t('cancel')}</button></form> : <div className="xyt-member" key={item.id}><span><b>{item.subject}</b><br/><small>{item.description}</small></span><span>{item.status}</span><div className="xyt-actions"><button className="xyt-btn" type="button" onClick={() => setEditingTask(item)}>{props.t('task.edit')}</button>{item.status === 'pending' && <button className="xyt-btn" type="button" onClick={() => { void mutateTask(item, 'claim') }}>{props.t('task.claim')}</button>}{item.status === 'in_progress' && <><button className="xyt-btn" type="button" onClick={() => { void mutateTask(item, 'complete') }}>{props.t('task.complete')}</button><button className="xyt-btn" type="button" onClick={() => { void mutateTask(item, 'release') }}>{props.t('task.release')}</button></>}{item.status === 'completed' && <button className="xyt-btn" type="button" onClick={() => { void mutateTask(item, 'reopen') }}>{props.t('task.reopen')}</button>}<button className="xyt-btn" type="button" onClick={() => { void mutateTask(item, 'delete') }}>{props.t('task.delete')}</button></div></div>)}</div>
}

function OutcomePanel(props: SharedProps & { sessionId: string }) {
  const [outcomes, setOutcomes] = useState<TeamOutcome[] | null>(null)
  const [draft, setDraft] = useState({ title: '', content: '' })
  const [editing, setEditing] = useState<TeamOutcome | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => { try { setOutcomes(await props.call<TeamOutcome[]>('outcomes/list', { sessionId: props.sessionId })); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }, [props.call, props.sessionId])
  useEffect(() => { void refresh() }, [refresh])
  const create = async () => { try { await props.call('outcomes/create', { sessionId: props.sessionId, title: draft.title, content: draft.content }); setDraft({ title: '', content: '' }); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  const update = async (outcome: TeamOutcome, action: 'edit' | 'return' | 'accept', values: Record<string, string> = {}) => { try { await props.call('outcomes/update', { sessionId: props.sessionId, outcomeId: outcome.id, expectedRevision: outcome.revision, action, ...values }); setEditing(null); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  if (outcomes === null) return <p>{error || props.t('loading')}</p>
  return <div>{error && <p className="xyt-status xyt-error" role="alert">{error}</p>}<form className="xyt-task-form" onSubmit={event => { event.preventDefault(); if (draft.title.trim() && draft.content.trim()) void create() }}><input aria-label={props.t('outcome.title')} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}/><input aria-label={props.t('outcome.content')} value={draft.content} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))}/><button className="xyt-btn xyt-primary" type="submit">{props.t('outcome.create')}</button></form><p className="xyt-meta">{props.t('outcome.syncUnavailable')}</p>{outcomes.length === 0 ? <p className="xyt-empty">{props.t('outcome.empty')}</p> : outcomes.map(outcome => editing?.id === outcome.id ? <form className="xyt-task-form" key={outcome.id} onSubmit={event => { event.preventDefault(); if (editing.title.trim() && editing.content.trim()) void update(outcome, 'edit', { title: editing.title, content: editing.content }) }}><input aria-label={props.t('outcome.title')} value={editing.title} onChange={event => setEditing(current => current === null ? null : { ...current, title: event.target.value })}/><input aria-label={props.t('outcome.content')} value={editing.content} onChange={event => setEditing(current => current === null ? null : { ...current, content: event.target.value })}/><button className="xyt-btn xyt-primary" type="submit">{props.t('outcome.edit')}</button><button className="xyt-btn" type="button" onClick={() => setEditing(null)}>{props.t('cancel')}</button></form> : <article className="xyt-member" key={outcome.id}><span><b>{outcome.title}</b><br/><small>{outcome.content}</small></span><span>{outcome.status} · v{outcome.revision}</span><div className="xyt-actions"><button className="xyt-btn" type="button" onClick={() => setEditing(outcome)}>{props.t('outcome.edit')}</button>{outcome.status !== 'accepted' && <button className="xyt-btn" type="button" onClick={() => { void update(outcome, 'return') }}>{props.t('outcome.return')}</button>}{outcome.status !== 'accepted' && <button className="xyt-btn xyt-primary" type="button" onClick={() => { void update(outcome, 'accept') }}>{props.t('outcome.accept')}</button>}</div></article>)}</div>
}

function CollaborationSurface(props: SharedProps & { embedded?: boolean; sessionId?: string; onClose?: () => void }) {
  const { library, setLibrary, error, refresh } = useLibrary(props.call)
  const [selected, setSelected] = useState<string[]>([])
  const [context, setContext] = useState<'fresh' | 'fork'>('fresh')
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'employees' | 'team' | 'outcomes'>('employees')
  const currentId = props.sessionId ?? (props.sessions.list.getSnapshot().current as string | undefined)
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id].slice(0, 6))
  const groupValid = selected.length >= 2 && selected.length <= 6
  const start = async (mode: 'single' | 'group', employeeIds: readonly string[]) => {
    if (!library || (mode === 'single' ? employeeIds.length !== 1 : employeeIds.length < 2 || employeeIds.length > 6)) return
    setPending(true); setNotice('')
    try {
      if (mode === 'single') {
        const prior = await props.call<{ sessionId: string | null }>('chats/single-get', { employeeId: employeeIds[0] })
        if (prior.sessionId !== null && props.sessions.list.getSnapshot().byId[prior.sessionId as SessionId] !== undefined) {
          openCollaboration(props.sessions, prior.sessionId)
          setSelected([]); setNotice(props.t('done')); props.onClose?.()
          return
        }
      }
      const current = props.sessions.list.getSnapshot().current
      const cwd = current === undefined ? undefined : props.sessions.list.getSnapshot().byId[current]?.cwd
      const id = await props.sessions.create(cwd === undefined ? {} : { cwd })
      const chosen = library.employees.filter(employee => employeeIds.includes(employee.id))
      const name = title.trim() || (mode === 'single'
        ? `${chosen[0]?.name ?? ''} · ${props.t('collaboration.singleSuffix')}`
        : `${chosen.map(employee => employee.name).join('、')} · ${props.t('collaboration.groupSuffix')}`)
      const binding = props.sessions.binding(id)
      if (!binding) throw new Error(`${props.t('error.sessionUnavailable')}: ${id as string}`)
      const renamed = await binding.session.rename(name)
      if (!renamed.ok) throw new Error(renamed.error.message)
      const started = await props.call<TeamStartResult>('team/start', { sessionId: id as string, employeeIds: employeeIds, context })
      if (started.failed.length > 0) throw new Error(started.failed.map(item => item.message).join('\n'))
      const target = mode === 'single'
        ? (await props.call<{ sessionId: string }>('chats/single-bind', { employeeId: employeeIds[0], sessionId: id as string })).sessionId
        : id as string
      openCollaboration(props.sessions, target); setSelected([]); setTitle(''); setNotice(props.t('done')); props.onClose?.()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false) }
  }
  if (!library) return <div data-xyai-team><div className="xyt-body"><p className={error ? 'xyt-status xyt-error' : ''}>{error || props.t('loading')}</p>{error && <button className="xyt-btn" type="button" onClick={() => { void refresh() }}>{props.t('retry')}</button>}</div></div>
  return <div data-xyai-team><header className="xyt-head"><div><h2>{props.t('view.title')}</h2><span className="xyt-meta">{props.t('picker.help')}</span></div><div className="xyt-tabs"><button className="xyt-tab" aria-selected={tab === 'employees'} type="button" onClick={() => setTab('employees')}>{props.t('tab.employees')}</button>{currentId && <button className="xyt-tab" aria-selected={tab === 'team'} type="button" onClick={() => setTab('team')}>{props.t('tab.team')}</button>}{currentId && <button className="xyt-tab" aria-selected={tab === 'outcomes'} type="button" onClick={() => setTab('outcomes')}>{props.t('tab.outcomes')}</button>}{props.onClose && <button className="xyt-btn" type="button" onClick={props.onClose}>{props.t('close')}</button>}</div></header><main className="xyt-body">{notice && <p className={`xyt-status ${notice === props.t('done') ? '' : 'xyt-error'}`} role="status">{notice}</p>}{tab === 'employees' ? <><div className="xyt-toolbar"><input className="xyt-search" aria-label={props.t('collaboration.groupName')} placeholder={props.t('collaboration.groupName')} value={title} maxLength={120} onChange={event => setTitle(event.target.value)}/><select className="xyt-btn" value={context} onChange={event => setContext(event.target.value as 'fresh' | 'fork')}><option value="fresh">{props.t('fresh')}</option><option value="fork">{props.t('fork')}</option></select><button className="xyt-btn xyt-primary" type="button" disabled={!groupValid || pending} onClick={() => { void start('group', selected) }}>{pending ? props.t('loading') : props.t('collaboration.startGroup')}</button></div><EmployeeCards {...props} library={library} selected={selected} pending={pending} onToggle={toggle} onSingle={id => { void start('single', [id]) }} onSaved={setLibrary}/></> : currentId ? tab === 'team' ? <TeamPanel {...props} employees={library.employees} sessionId={currentId} onInvite={employeeIds => { void start('group', employeeIds) }}/> : <OutcomePanel {...props} sessionId={currentId}/> : <p className="xyt-empty">{props.t('team.empty')}</p>}</main></div>
}

type OverlayProps = PropsRuntime<'shell.overlay'> & SharedProps
function Overlay(props: OverlayProps) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const direct = () => setOpen(true)
    const nav = (event: Event) => { if ((event as CustomEvent<{ id?: string }>).detail?.id === 'employees') setOpen(true) }
    window.addEventListener('xyai:open-ai-collaboration', direct); window.addEventListener('xyai:shell-nav', nav as EventListener)
    return () => { window.removeEventListener('xyai:open-ai-collaboration', direct); window.removeEventListener('xyai:shell-nav', nav as EventListener) }
  }, [])
  if (!open) return null
  return <section className="xyt-modal" role="dialog" aria-modal="true" aria-label={props.t('view.title')}><div className="xyt-dialog" style={{ width: 'min(1180px,100%)', height: 'min(820px,92vh)', padding: 0 }}><CollaborationSurface {...props} onClose={() => setOpen(false)}/></div></section>
}

type RenameProps = PropsRuntime<'conversation.session.header.utilities'> & SharedProps
function RenameGroup(props: RenameProps) {
  const [members, setMembers] = useState(0)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void props.call<TeamView>('team/view', { sessionId: props.sessionId as string }).then(view => setMembers(view.members.length)).catch(() => setMembers(0)) }, [props.call, props.sessionId])
  if (members < 2) return null
  const save = async () => {
    const binding = props.sessions.binding(props.sessionId)
    if (!binding || title.trim() === '') return
    setPending(true); setError('')
    try {
      const result = await binding.session.rename(title.trim())
      if (!result.ok) throw new Error(result.error.message)
      setEditing(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false) }
  }
  if (!editing) return <button type="button" onClick={() => { const row = props.sessions.list.getSnapshot().byId[props.sessionId]; setTitle(row?.displayTitle ?? ''); setError(''); setEditing(true) }}>{props.t('collaboration.rename')}</button>
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input aria-label={props.t('collaboration.name')} value={title} onChange={event => setTitle(event.target.value)} maxLength={120}/><button type="button" disabled={pending || title.trim() === ''} onClick={() => { void save() }}>{pending ? props.t('loading') : props.t('collaboration.saveName')}</button><button type="button" disabled={pending} onClick={() => setEditing(false)}>{props.t('cancel')}</button>{error && <small role="alert" className="xyt-error">{error}</small>}</span>
}

/** Mount working employee configuration and DSH Agent Teams operations. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'xyai-ai-employees: dictionary')
  ctx.effect(injectAiTeamCss, 'xyai-ai-employees: css')
  const connection = ctx.get('connection') as ConnectionHandle
  const sessions = ctx.sessions as ISessions
  const call: Call = async <T,>(endpoint: string, payload?: unknown): Promise<T> => {
    const result = await connection.rpc.call(AI_TEAM_CHANNEL, endpoint, payload ?? null)
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    const answer = result.value as AiTeamAnswer<T>
    if (!answer.ok) throw new Error(`${answer.error.code}: ${answer.error.message}`)
    return answer.value
  }
  const shared = () => ({ call, sessions })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'xyai-ai-team-overlay', order: 35, locale: NS, inject: shared }, Overlay))
  ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'xyai-ai-team', order: 35, locale: NS, label: () => ctx.locale.bind(NS)('view.title'), inject: shared }, function AiTeamView(props) { return <CollaborationSurface {...props} embedded sessionId={props.sessionId as string}/> }))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'xyai-ai-employee-picker', order: 10, locale: NS }, function PickerChip(props) { return <button type="button" className="xyt-chip" onClick={() => window.dispatchEvent(new CustomEvent('xyai:open-ai-collaboration'))}>{props.t('employee.pick')}</button> }))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'xyai-ai-team-rename', order: 15, locale: NS, inject: shared }, RenameGroup))
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    document.documentElement.setAttribute('data-xyai-surface-employees', '')
    return () => document.documentElement.removeAttribute('data-xyai-surface-employees')
  }, 'xyai-ai-employees: surface flag')
}
