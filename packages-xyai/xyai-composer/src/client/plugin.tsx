/** XYAI additive controls over the resident DSH composer. */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { en, zh, type XyaiComposerKey } from './locales.ts'
import css from './Composer.module.css'
import { injectXyaiSettingsCss } from './settings-layout.ts'
import {
  LABEL_MAX,
  SNIPPET_LIMIT,
  TEXT_MAX,
  appendToDraft,
  classifySpeechError,
  foldSpeechEvent,
  formatClock,
  matchesQuery,
  speechRecognitionConstructor,
  validateSnippet,
  type ComposerSettings,
  type Snippet,
  type SpeechRecognizer,
} from './logic.ts'

export type { ComposerSettings, Snippet }
export { defaultComposerSettings, speechRecognitionConstructor, appendToDraft } from './logic.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { xyaiComposer: XyaiComposerKey }
}

export const inject = ['slots', 'locale', 'settingsScope']
const snippetOps = (snippets: Snippet[]) => [{ op: 'set' as const, path: ['snippets'], value: snippets }]

type T = Translate<XyaiComposerKey>

/**
 * Open DSH settings targeting a section id.
 * Dispatches `xyai:open-settings` (shell listens) then best-effort selects the nav cell.
 */
function openSettingsSection(sectionId: string, labelMatchers: string[] = []): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('xyai:open-settings', {
      detail: { section: sectionId },
    }))
  }
  if (typeof document === 'undefined') return
  const buttons = Array.from(document.querySelectorAll('button[aria-haspopup="dialog"]')) as HTMLButtonElement[]
  const trigger = buttons.find(btn => btn.getAttribute('aria-expanded') !== null)
  trigger?.click()
  const trySelect = (attempt: number) => {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog) {
      const byData = dialog.querySelector(
        `[data-settings-section="${sectionId}"], [data-section-id="${sectionId}"], [data-xyai-settings-section="${sectionId}"]`,
      ) as HTMLElement | null
      if (byData) {
        (byData.closest('button') ?? byData).click()
        return
      }
    }
    const cells = Array.from(document.querySelectorAll('[role="dialog"] nav button')) as HTMLButtonElement[]
    const hit = cells.find(btn => labelMatchers.some(m => (btn.textContent || '').includes(m)))
    if (hit) {
      hit.click()
      return
    }
    if (attempt < 12) window.setTimeout(() => trySelect(attempt + 1), 50)
  }
  trySelect(0)
}

function useDismissible(open: boolean, onClose: () => void, root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, onClose, root])
}

function ActionRow(props: {
  title: string
  hint: string
  disabled?: boolean
  selected?: boolean
  onClick?: (() => void) | undefined
}): ReactNode {
  return <button type="button" className={`${css.row}${props.selected ? ` ${css.selected}` : ''}`}
    disabled={props.disabled} title={props.hint} aria-label={props.title} onClick={props.onClick}>
    <span className={css.rowTitle}>{props.title}</span>
    <span className={css.rowDesc}>{props.hint}</span>
  </button>
}

function CapabilityMenu(props: {
  t: T
  useInput: (select: (state: { draft: string; phase: string }) => unknown) => unknown
  inputActions: { setDraft: (draft: string) => void }
  useSnippets: (select: (state: { value: ComposerSettings | undefined; writable: boolean; status: string }) => unknown) => unknown
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const draft = props.useInput(state => state.draft) as string
  const busy = props.useInput(state => state.phase !== 'plain') as boolean
  const snippets = props.useSnippets(state => state.value?.snippets ?? []) as Snippet[]
  const close = () => { setOpen(false); setQuery('') }
  useDismissible(open, close, root)
  useEffect(() => { if (open) search.current?.focus() }, [open])
  const insert = (value: string) => { props.inputActions.setDraft(appendToDraft(draft, value)); close() }
  const t = props.t
  const rows = [
    { id: 'skills', title: t('capability.skills'), hint: t('capability.skillsHint'), disabled: busy, run: () => insert('/') },
    { id: 'plan', title: t('capability.plan'), hint: t('capability.planHint'), disabled: busy, run: () => insert('/plan') },
    { id: 'files', title: t('add.attachments'), hint: t('add.attachmentsHint'), disabled: true },
    {
      id: 'knowledge', title: t('capability.knowledge'), hint: t('capability.knowledgeHint'), disabled: false,
      run: () => {
        close()
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('xyai:open-knowledge'))
      },
    },
    { id: 'plugins', title: t('capability.plugins'), hint: t('capability.pluginsUnavailable'), disabled: true },
  ].filter(row => matchesQuery(query, row.title, row.hint))
  const moreRows = [
    {
      id: 'settings',
      title: t('capability.settings'),
      hint: t('capability.settingsHint'),
      disabled: false,
      run: () => { close(); openSettingsSection('xyai-composer', [t('snippet.page'), 'Quick phrases', '快捷短语']) },
    },
    {
      id: 'model',
      title: t('capability.model'),
      hint: t('capability.modelHint'),
      disabled: false,
      run: () => { close(); openSettingsSection('xyai-model-hub', ['模型广场', 'Model Hub', t('capability.model')]) },
    },
  ].filter(row => matchesQuery(query, row.title, row.hint))
  const visibleSnippets = snippets.filter(snippet => matchesQuery(query, snippet.label, snippet.text))
  const empty = rows.length === 0 && visibleSnippets.length === 0 && moreRows.length === 0
  return <div ref={root} className={css.wrap}>
    <button type="button" className={css.trigger} aria-haspopup="dialog" aria-expanded={open}
      aria-label={t('capability.title')}
      onClick={() => setOpen(value => !value)}>{t('capability.title')}</button>
    {open && <div className={css.panel} role="dialog" aria-label={t('capability.title')}
      onPointerDown={event => event.stopPropagation()}>
      <strong className={css.heading}>{t('add.title')}</strong>
      <input ref={search} className={css.search} value={query} placeholder={t('search')}
        aria-label={t('search')} onChange={event => setQuery(event.target.value)} />
      {empty && <p className={css.hint}>{t('search.empty')}</p>}
      {rows.map(row => <ActionRow key={row.id} title={row.title} hint={row.hint}
        disabled={row.disabled} onClick={row.run} />)}
      <strong className={css.heading}>{t('snippet.title')}</strong>
      {snippets.length === 0 && <p className={css.hint}>{t('snippet.empty')}</p>}
      {visibleSnippets.map((snippet, index) => <ActionRow key={`${index}:${snippet.label}`}
        title={snippet.label} hint={snippet.text} disabled={busy}
        onClick={() => insert(snippet.text)} />)}
      {(moreRows.length > 0) && <>
        <strong className={css.heading}>{t('capability.more')}</strong>
        {moreRows.map(row => <ActionRow key={row.id} title={row.title} hint={row.hint}
          disabled={row.disabled} onClick={row.run} />)}
      </>}
      <p className={css.hint}>{t('capability.unavailableHint')}</p>
    </div>}
  </div>
}

function VoiceInput(props: {
  t: T
  useInput: (select: (state: { draft: string; phase: string }) => unknown) => unknown
  inputActions: { setDraft: (draft: string) => void }
}): ReactNode {
  const active = useRef<SpeechRecognizer | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const [silent, setSilent] = useState(false)
  const transcriptRef = useRef('')
  const blockedRef = useRef(false)
  const draft = props.useInput(state => state.draft) as string
  const busy = props.useInput(state => state.phase !== 'plain') as boolean
  const supported = speechRecognitionConstructor() !== undefined
  const close = () => {
    active.current?.abort()
    setRecording(false)
    setOpen(false)
  }
  useDismissible(open, close, root)
  useEffect(() => () => { active.current?.abort() }, [])
  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recording])
  const reset = () => {
    transcriptRef.current = ''
    blockedRef.current = false
    setTranscript(''); setInterim(''); setError(null); setDenied(false); setSilent(false); setSeconds(0)
  }
  const start = () => {
    const Constructor = speechRecognitionConstructor()
    if (Constructor === undefined) return
    reset()
    const recognition = new Constructor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'zh-CN'
    recognition.onresult = (event) => {
      const folded = foldSpeechEvent(event)
      if (folded.confirmed) {
        transcriptRef.current += folded.confirmed
        setTranscript(transcriptRef.current)
      }
      setInterim(folded.pending)
      setSilent(false)
    }
    recognition.onerror = event => {
      const kind = classifySpeechError(event.error)
      blockedRef.current = true
      setRecording(false)
      if (kind === 'denied') { setDenied(true); setError(null) }
      else setError(props.t('voice.error', { reason: event.error }))
      setSilent(false)
    }
    recognition.onend = () => {
      setRecording(false)
      setInterim('')
      if (!transcriptRef.current.trim() && !blockedRef.current) setSilent(true)
    }
    active.current = recognition
    setRecording(true)
    try { recognition.start() } catch (cause) {
      setRecording(false)
      setError(props.t('voice.error', { reason: cause instanceof Error ? cause.message : String(cause) }))
    }
  }
  const insert = () => {
    if (busy || recording || !transcript.trim()) return
    props.inputActions.setDraft(appendToDraft(draft, transcript))
    reset()
    setOpen(false)
  }
  const triggerTitle = !supported
    ? props.t('voice.unsupported')
    : busy
      ? props.t('voice.busy')
      : props.t('voice.title')
  return <div ref={root} className={css.wrap}>
    <button type="button" className={css.trigger} aria-haspopup="dialog" aria-expanded={open}
      aria-label={props.t('voice.title')} title={triggerTitle}
      onClick={() => setOpen(value => !value)}>◉</button>
    {open && <div className={`${css.panel} ${css.panelEnd}`} role="dialog" aria-label={props.t('voice.title')}
      onPointerDown={event => event.stopPropagation()}>
      <strong className={css.heading}>{props.t('voice.title')}</strong>
      {!supported ? <>
        <p className={css.status} role="status">{props.t('voice.unsupported')}</p>
        <p className={css.hint}>{props.t('voice.unsupportedHint')}</p>
        <div className={css.actions}>
          <button type="button" onClick={() => { close(); reset() }}>{props.t('cancel')}</button>
        </div>
      </> : <>
        <p className={css.meta}>{props.t('voice.device')}: {props.t('voice.deviceDefault')}</p>
        {busy && <p className={css.status} role="status">{props.t('voice.busy')}</p>}
        {recording && <div className={css.wave} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>}
        {recording && <p className={css.status} role="status">
          {props.t('voice.elapsed', { time: formatClock(seconds) })}
        </p>}
        <textarea className={css.review} aria-label={props.t('voice.review')} rows={5} value={transcript}
          placeholder={props.t(recording ? 'voice.listening' : 'voice.review')}
          disabled={recording}
          onChange={event => { setTranscript(event.target.value); setSilent(false) }} />
        {interim && <small className={css.meta}>{props.t('voice.interim')}: {interim}</small>}
        {error && <p className={css.alert} role="alert">{error}</p>}
        {denied && <p className={css.alert} role="alert">{props.t('voice.denied')}</p>}
        {silent && !transcript.trim() && <p className={css.status} role="status">{props.t('voice.silent')}</p>}
        <div className={css.actions}>
          <button type="button" disabled={busy} onClick={recording ? () => active.current?.stop() : start}>
            {props.t(recording ? 'voice.stop' : denied || silent || transcript ? 'voice.rerecord' : 'voice.start')}
          </button>
          <button type="button" disabled={busy || recording || !transcript.trim()} onClick={insert}>
            {props.t('voice.insert')}
          </button>
          <button type="button" onClick={() => { close(); reset() }}>{props.t('cancel')}</button>
        </div>
      </>}
    </div>}
  </div>
}

function InputStatus(props: {
  t: T
  useInput: (select: (state: { draft: string; attachmentIds: readonly string[]; queue: readonly unknown[]; phase: string }) => unknown) => unknown
}): ReactNode {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const count = props.useInput(state => Array.from(state.draft).length) as number
  const attachments = props.useInput(state => state.attachmentIds.length) as number
  const queued = props.useInput(state => state.queue.length) as number
  const busy = props.useInput(state => state.phase !== 'plain') as boolean
  useDismissible(open, () => setOpen(false), root)
  const adapters = [
    { id: 'dsh', title: props.t('harness.dsh'), connected: true, hint: props.t('harness.connected') },
    { id: 'codex', title: props.t('harness.codex'), connected: false, hint: props.t('harness.unavailable') },
    { id: 'claude', title: props.t('harness.claude'), connected: false, hint: props.t('harness.unavailable') },
  ]
  return <div className={css.dock}>
    <div ref={root} className={css.wrap}>
      <button type="button" className={css.trigger} aria-haspopup="dialog" aria-expanded={open}
        aria-label={props.t('harness.current')}
        onClick={() => setOpen(value => !value)}>
        {props.t('harness.current')}: DSH
      </button>
      {open && <div className={css.panel} role="dialog" aria-label={props.t('harness.current')}
        onPointerDown={event => event.stopPropagation()}>
        {adapters.map(adapter => <ActionRow key={adapter.id} title={adapter.title} hint={adapter.hint}
          selected={adapter.connected} disabled={!adapter.connected} />)}
        <p className={css.hint}>{props.t('harness.adaptersUnavailable')}</p>
      </div>}
    </div>
    <small>
      {props.t('characters')}: {count} · {props.t('attachments')}: {attachments} · {props.t('queued')}: {queued}
      {' · '}{props.t(busy ? 'phase.busy' : 'phase.idle')}
    </small>
  </div>
}

function InputNotice(props: {
  t: T
  useInput: (select: (state: { phase: string; queue: readonly unknown[] }) => unknown) => unknown
}): ReactNode {
  const busy = props.useInput(state => state.phase !== 'plain') as boolean
  const queued = props.useInput(state => state.queue.length) as number
  if (!busy && queued === 0) return null
  return <div className={css.notice} role="status">
    {busy ? props.t('notice.busy') : props.t('notice.queued', { count: String(queued) })}
  </div>
}

function SnippetManager(props: {
  t: T
  useSnippets: (select: (state: { value: ComposerSettings | undefined; writable: boolean; status: string }) => unknown) => unknown
  setSnippets: (snippets: Snippet[]) => Promise<unknown>
}): ReactNode {
  const snapshot = props.useSnippets(state => state) as { value?: ComposerSettings; writable: boolean; status: string }
  const snippets = snapshot.value?.snippets ?? []
  const [label, setLabel] = useState('')
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<number | undefined>(undefined)
  const [result, setResult] = useState<'saved' | 'error' | 'duplicate' | 'full' | null>(null)
  const write = async (next: Snippet[]): Promise<boolean> => {
    setResult(null)
    try { await props.setSnippets(next); setResult('saved'); return true }
    catch { setResult('error'); return false }
  }
  const persist = () => {
    const code = validateSnippet(label, text, snippets, editing)
    if (code !== 'ok') { setResult(code === 'empty' ? null : code); return }
    const next = { label: label.trim(), text: text.trim() }
    void write(editing === undefined
      ? [...snippets, next]
      : snippets.map((snippet, index) => index === editing ? next : snippet),
    ).then(ok => { if (ok) { setLabel(''); setText(''); setEditing(undefined) } })
  }
  return <form data-xyai-settings="" className={css.settings}
    onSubmit={event => { event.preventDefault(); persist() }}>
    <h3>{props.t('snippet.page')}</h3>
    <p className={css.meta}>{props.t('snippet.remaining', { used: String(snippets.length), max: String(SNIPPET_LIMIT) })}</p>
    <div className="xyai-settings-card">
      <p className="xyai-settings-card-title">{props.t('snippet.listTitle')}</p>
      <fieldset disabled={!snapshot.writable} className={css.settings}>
        {snippets.length === 0 && <small className={css.hint}>{props.t('snippet.empty')}</small>}
        {snippets.map((snippet, index) => <span key={`${index}:${snippet.label}`} className={css.phrase}>
          <b>{snippet.label}</b>
          <small>{snippet.text}</small>
          <button type="button" aria-label={`${props.t('snippet.edit')}: ${snippet.label}`}
            onClick={() => { setEditing(index); setLabel(snippet.label); setText(snippet.text); setResult(null) }}>
            {props.t('snippet.edit')}
          </button>
          <button type="button" aria-label={`${props.t('snippet.delete')}: ${snippet.label}`}
            onClick={() => { void write(snippets.filter((_, current) => current !== index)) }}>
            {props.t('snippet.delete')}
          </button>
        </span>)}
      </fieldset>
    </div>
    <div className="xyai-settings-card">
      <p className="xyai-settings-card-title">{props.t('snippet.editorTitle')}</p>
      <fieldset disabled={!snapshot.writable} className={css.settings}>
        <label className={`xyai-settings-field ${css.field}`}>
          <span>{props.t('snippet.label')}</span>
          <input required maxLength={LABEL_MAX} aria-label={props.t('snippet.label')} value={label}
            onChange={event => setLabel(event.target.value)} />
          <small>{props.t('snippet.counter', { used: String(label.length), max: String(LABEL_MAX) })}</small>
        </label>
        <label className={`xyai-settings-field ${css.field}`}>
          <span>{props.t('snippet.text')}</span>
          <textarea required maxLength={TEXT_MAX} rows={3} aria-label={props.t('snippet.text')} value={text}
            onChange={event => setText(event.target.value)} />
          <small>{props.t('snippet.counter', { used: String(text.length), max: String(TEXT_MAX) })}</small>
        </label>
        <div className="xyai-settings-actions">
          <button type="submit" className="xyai-settings-btn xyai-settings-btn-primary"
            disabled={!label.trim() || !text.trim() || !snapshot.writable}>
            {props.t(editing === undefined ? 'snippet.add' : 'snippet.save')}
          </button>
          {editing !== undefined && <button type="button" className="xyai-settings-btn xyai-settings-btn-secondary"
            onClick={() => { setEditing(undefined); setLabel(''); setText(''); setResult(null) }}>
            {props.t('cancel')}
          </button>}
        </div>
      </fieldset>
    </div>
    {!snapshot.writable && <p className={css.status} role="status">
      {props.t(snapshot.status === 'loading' ? 'snippet.loading' : 'snippet.unavailable')}
    </p>}
    {result && <p className={result === 'saved' ? css.status : css.alert}
      role={result === 'saved' ? 'status' : 'alert'}>
      {props.t(result === 'error' ? 'snippet.error' : result === 'duplicate' ? 'snippet.duplicate'
        : result === 'full' ? 'snippet.full' : 'snippet.saved')}
    </p>}
  </form>
}

/** Register XYAI controls without replacing the DSH composer.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('xyaiComposer', { zh, en }), 'xyai-composer: locale')
  ctx.effect(() => injectXyaiSettingsCss('@xyai/dsh-composer'), 'xyai-composer: settings layout css')
  const settings = ctx.settingsScope.bind<ComposerSettings>({ namespace: 'xyai-composer' })
  const face = () => ({ hooks: { snippets: settings } })
  const settingsFace = () => ({
    hooks: { snippets: settings },
    setSnippets: (snippets: Snippet[]) => settings.mutate(snippetOps(snippets)),
  })

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'xyai-composer-capabilities', order: 20, locale: 'xyaiComposer', inject: face,
  }, CapabilityMenu))

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'xyai-composer-voice', order: 20, locale: 'xyaiComposer',
  }, VoiceInput))

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'xyai-composer-status', order: 10, locale: 'xyaiComposer',
  }, InputStatus))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay', id: 'xyai-composer-notice', order: 10, locale: 'xyaiComposer',
  }, InputNotice))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'xyai-composer', label: () => ctx.locale.bind('xyaiComposer')('snippet.page'),
    order: 120, locale: 'xyaiComposer', inject: settingsFace,
  }, SnippetManager))
}
