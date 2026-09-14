/** XYAI shell chrome: space router, product navigation, and theme over DSH slots. */
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { ABOUT_HTML } from './about-html.ts'
import {
  conversationOpenDetail,
  isWorkbenchMisland,
  partitionInteractSessions,
} from './interact.ts'
import {
  canEmbedRemoteFrames,
  isXyaiSurfaceMounted,
  SHELL_CHROME_CSS,
  watchXyaiSurfaces,
  type XyaiSurfaceId,
} from './chrome.ts'
import { en, zh, type XyaiDevShellKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { xyaiDevShell: XyaiDevShellKey }
}
export const inject = ['slots', 'locale', 'layout', 'uiWorkspace', 'theme', 'sessions']

type SpaceId = 'dev' | 'biz' | 'eco' | 'browser' | 'about'
type NavId = 'models' | 'employees' | 'knowledge'
/** In-shell overlays on top of (or instead of) the active space embed. */
type OverlayId = 'none' | 'about'
type ThemePref = 'system' | 'light' | 'dark'

const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark']
const THEME_STORAGE_KEY = 'xyai.shell.theme'

/** Local XYOS (cloud-smoke / desktop helper). Probed before falling back. */
const LOCAL_XYOS_URL = 'http://127.0.0.1:4173'
/** Configurable default when local XYOS is down — override via window.__XYAI_BIZ_URL__ or env bake. */
const DEFAULT_BIZ_URL = 'https://os.cnxy.tech'
const ECO_URL = 'https://cnxy.ai'
const BROWSER_HOME = 'https://cnxy.ai'

const SPACES: { id: SpaceId; key: XyaiDevShellKey; ready: boolean }[] = [
  { id: 'dev', key: 'shell.space.dev', ready: true },
  { id: 'biz', key: 'shell.space.biz', ready: true },
  { id: 'eco', key: 'shell.space.eco', ready: true },
  { id: 'browser', key: 'shell.space.browser', ready: true },
  { id: 'about', key: 'shell.space.about', ready: true },
]

const NAV: { id: NavId; key: XyaiDevShellKey; ready: boolean }[] = [
  { id: 'models', key: 'shell.nav.models', ready: true },
  { id: 'employees', key: 'shell.nav.employees', ready: true },
  { id: 'knowledge', key: 'shell.nav.knowledge', ready: true },
]

const glassBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  background: 'linear-gradient(135deg, rgba(21,101,192,0.88), rgba(2,136,209,0.72))',
  color: '#fff',
  backdropFilter: 'blur(10px)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 4px 18px rgba(21,101,192,0.25)',
  borderBottom: '1px solid rgba(255,255,255,0.22)',
}

const chip = (active: boolean): CSSProperties => ({
  appearance: 'none',
  border: active ? '1px solid rgba(255,255,255,0.95)' : '1px solid rgba(255,255,255,0.35)',
  background: active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
  color: '#fff',
  borderRadius: 999,
  padding: '4px 12px',
  fontSize: 12,
  cursor: 'pointer',
  opacity: 1,
})

const navBtn = (active: boolean, ready: boolean): CSSProperties => ({
  appearance: 'none',
  border: 'none',
  background: active ? 'rgba(21,101,192,0.14)' : 'transparent',
  color: ready ? 'inherit' : 'rgba(0,0,0,0.45)',
  textAlign: 'left',
  padding: '6px 10px',
  borderRadius: 8,
  fontSize: 12,
  cursor: ready ? 'pointer' : 'not-allowed',
  width: '100%',
  opacity: ready ? 1 : 0.55,
})

const fullView: CSSProperties = {
  position: 'fixed',
  top: 48,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  pointerEvents: 'auto',
  background: '#0b3a66',
}

type ThemeFace = {
  getTheme: () => { preference: string }
  setTheme: (id: string) => void
}

/** Prefer DSH theme service on ctx; fall back undefined for interim DOM path. */
function resolveThemeFace(ctx: Context): ThemeFace | undefined {
  try {
    const direct = (ctx as Context & { theme?: ThemeFace }).theme
    if (direct && typeof direct.setTheme === 'function' && typeof direct.getTheme === 'function') return direct
  } catch { /* inject/proxy guard */ }
  try {
    const got = (ctx as Context & { get?: (name: string) => unknown }).get?.('theme') as ThemeFace | undefined
    if (got && typeof got.setTheme === 'function' && typeof got.getTheme === 'function') return got
  } catch { /* optional */ }
  return undefined
}

/** Interim exceed path when theme service is absent: data-theme + class + localStorage. */
function applyDomTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', pref)
  root.classList.remove('theme-system', 'theme-light', 'theme-dark')
  root.classList.add(`theme-${pref}`)
  const dark = pref === 'dark' || (pref === 'system'
    && typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.body?.setAttribute('data-ds-dark-theme', '')
  else document.body?.removeAttribute('data-ds-dark-theme')
  try { localStorage.setItem(THEME_STORAGE_KEY, pref) } catch { /* ignore */ }
}

function readStoredTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'system' || v === 'light' || v === 'dark') return v
  } catch { /* ignore */ }
  return 'system'
}

function nextTheme(cur: ThemePref): ThemePref {
  const i = THEME_ORDER.indexOf(cur)
  return THEME_ORDER[(i + 1) % THEME_ORDER.length]!
}

const MODEL_PLAZA_VIEW_ID = 'xyai-model-plaza'
const MODEL_PLAZA_LABELS = ['模型广场', 'Model Plaza', 'Model Hub']

/**
 * Best-effort click a conversation view tab by data attrs or label text.
 * Tabs are `role="tab"` under the session header tablist (no stable data-id yet).
 */
function clickConversationViewTab(viewId: string, labelMatchers: string[]): boolean {
  if (typeof document === 'undefined') return false
  const tabs = Array.from(document.querySelectorAll('[role="tablist"] [role="tab"], [role="tab"]')) as HTMLElement[]
  const byData = tabs.find(tab =>
    tab.getAttribute('data-view-id') === viewId
    || tab.getAttribute('data-conversation-view') === viewId
    || tab.getAttribute('data-xyai-view') === viewId
  )
  if (byData) {
    byData.click()
    return true
  }
  const byLabel = tabs.find(tab => labelMatchers.some(m => (tab.textContent || '').includes(m)))
  if (byLabel) {
    byLabel.click()
    return true
  }
  return false
}

/**
 * Prefer opening a registered conversation.view.
 * Dispatches `xyai:open-view` so a header bridge with typed `selectView` can switch;
 * also best-effort clicks the view tab. Invokes `onFail` only if the surface never
 * appears after retries (settings fallback for models).
 */
function openConversationView(
  viewId: string,
  labelMatchers: string[] = [],
  onFail?: () => void,
): void {
  if (typeof window === 'undefined') {
    onFail?.()
    return
  }
  window.dispatchEvent(new CustomEvent('xyai:open-view', {
    detail: { id: viewId },
  }))
  const surfaceSel = viewId === MODEL_PLAZA_VIEW_ID
    ? `[data-xyai-model-plaza], [data-conversation-view="${viewId}"]`
    : `[data-conversation-view="${viewId}"], [data-xyai-view="${viewId}"]`
  const tryOpen = (attempt: number) => {
    if (typeof document !== 'undefined') {
      if (document.querySelector(surfaceSel)) return
      clickConversationViewTab(viewId, labelMatchers)
      if (document.querySelector(surfaceSel)) return
      const selected = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')) as HTMLElement[]
      if (selected.some(tab =>
        tab.getAttribute('data-view-id') === viewId
        || tab.getAttribute('data-conversation-view') === viewId
        || labelMatchers.some(m => (tab.textContent || '').includes(m))
      )) return
    }
    if (attempt < 16) {
      window.setTimeout(() => tryOpen(attempt + 1), 50)
      return
    }
    onFail?.()
  }
  tryOpen(0)
}

/**
 * Product nav「模型广场」: stay on dev space, open Model Plaza overlay (primary),
 * and dispatch conversation.view open as secondary. Never fall back to settings.
 */
function openModelPlaza(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('xyai:shell-space', { detail: { id: 'dev', ready: true } }))
    window.dispatchEvent(new CustomEvent('xyai:open-model-plaza'))
  }
  openConversationView(MODEL_PLAZA_VIEW_ID, MODEL_PLAZA_LABELS)
}

/** Prefer an existing brand <img>, else leave blank (about onerror hides). */
function resolveAboutLogo(): string {
  if (typeof document === 'undefined') return ''
  const img = document.querySelector('[data-xyai-hero-welcome] img, [data-xyai-space-bar] img, img[alt="XYAI"]') as HTMLImageElement | null
  return img?.src || ''
}

/** Biz URL: window override → local XYOS probe → DEFAULT_BIZ_URL. */
async function resolveBizUrl(): Promise<{ url: string; source: 'override' | 'local' | 'remote' }> {
  const w = typeof window !== 'undefined'
    ? (window as Window & { __XYAI_BIZ_URL__?: string }).__XYAI_BIZ_URL__
    : undefined
  if (w && /^https?:\/\//i.test(w)) return { url: w.replace(/\/$/, ''), source: 'override' }
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 900)
    await fetch(`${LOCAL_XYOS_URL}/`, { method: 'GET', mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' })
    window.clearTimeout(timer)
    return { url: LOCAL_XYOS_URL, source: 'local' }
  } catch {
    return { url: DEFAULT_BIZ_URL, source: 'remote' }
  }
}

function normalizeBrowserUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return BROWSER_HOME
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(trimmed)) return `https://${trimmed}`
  return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
}

type TProps = { t: (key: XyaiDevShellKey) => string }

/** In-shell panel when Electron `dsh-app:` cannot host a remote https iframe. */
function DesktopBlockedSurface(props: TProps & {
  url: string
  title: string
  onClose?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.url)
      setCopied(true)
    } catch {
      // Clipboard may be denied; the address field stays selectable.
    }
  }
  return (
    <div data-xyai-shell-view="desktop-blocked" style={{ ...fullView, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(15,23,42,0.92)', color: '#e2e8f0', borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
        <strong style={{ fontSize: 12 }}>{props.title}</strong>
        <span style={{ flex: 1 }} />
        {props.onClose && (
          <button type="button" onClick={props.onClose} style={{ appearance: 'none', border: '1px solid rgba(148,163,184,0.45)', background: 'transparent', color: '#e2e8f0', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
            {props.t('shell.about.close')}
          </button>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#e2e8f0' }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <p style={{ margin: '0 0 14px', lineHeight: 1.6 }}>{props.t('shell.embed.desktopBlocked')}</p>
          <input
            readOnly
            aria-label={props.t('shell.embed.copyUrl')}
            value={props.url}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(30,41,59,0.9)', color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}
          />
          <button type="button" onClick={() => { void copy() }} style={{ appearance: 'none', border: 'none', borderRadius: 8, padding: '8px 14px', background: '#1565c0', color: '#fff', cursor: 'pointer' }}>
            {copied ? props.t('shell.embed.copied') : props.t('shell.embed.copyUrl')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Iframe embed with loading + offline fallback (never empty ready:false). */
function EmbedSurface(props: TProps & {
  url: string
  title: string
  badge?: string
  onClose?: () => void
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [nonce, setNonce] = useState(0)
  const loaded = useRef(false)

  useEffect(() => {
    loaded.current = false
    setStatus('loading')
    const timer = window.setTimeout(() => {
      if (!loaded.current) setStatus(s => (s === 'loading' ? 'offline' : s))
    }, 10_000)
    return () => window.clearTimeout(timer)
  }, [props.url, nonce])

  if (!canEmbedRemoteFrames()) {
    return <DesktopBlockedSurface t={props.t} url={props.url} title={props.title} onClose={props.onClose} />
  }

  return (
    <div data-xyai-shell-view="embed" style={{ ...fullView, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(15,23,42,0.92)', color: '#e2e8f0', borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
        <strong style={{ fontSize: 12 }}>{props.title}</strong>
        {props.badge && <span style={{ fontSize: 11, opacity: 0.75, border: '1px solid rgba(148,163,184,0.35)', borderRadius: 999, padding: '2px 8px' }}>{props.badge}</span>}
        <span style={{ flex: 1 }} />
        <a href={props.url} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', fontSize: 12 }}>{props.t('shell.embed.openExternal')}</a>
        {props.onClose && (
          <button type="button" onClick={props.onClose} style={{ appearance: 'none', border: '1px solid rgba(148,163,184,0.45)', background: 'transparent', color: '#e2e8f0', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
            {props.t('shell.about.close')}
          </button>
        )}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {(status === 'loading' || status === 'offline') && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: status === 'offline' ? 'rgba(15,23,42,0.92)' : 'rgba(15,23,42,0.55)', color: '#e2e8f0', pointerEvents: status === 'offline' ? 'auto' : 'none' }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
              <p style={{ margin: '0 0 14px', lineHeight: 1.6 }}>{status === 'loading' ? props.t('shell.embed.loading') : props.t('shell.embed.offline')}</p>
              {status === 'offline' && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setNonce(n => n + 1)} style={{ appearance: 'none', border: 'none', borderRadius: 8, padding: '8px 14px', background: '#1565c0', color: '#fff', cursor: 'pointer' }}>
                    {props.t('shell.embed.retry')}
                  </button>
                  <a href={props.url} target="_blank" rel="noreferrer" style={{ appearance: 'none', borderRadius: 8, padding: '8px 14px', background: 'rgba(255,255,255,0.12)', color: '#fff', textDecoration: 'none' }}>
                    {props.t('shell.embed.openExternal')}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
        <iframe
          key={`${props.url}:${nonce}`}
          title={props.title}
          src={props.url}
          style={{ border: 0, width: '100%', height: '100%', background: '#fff' }}
          onLoad={() => { loaded.current = true; setStatus('ready') }}
          onError={() => setStatus('offline')}
        />
      </div>
    </div>
  )
}

/** Minimal in-shell browser chrome: URL bar + back/forward/reload/home + iframe. */
function BrowserChrome(props: TProps & { onClose: () => void }) {
  const [url, setUrl] = useState(BROWSER_HOME)
  const [draft, setDraft] = useState(BROWSER_HOME)
  const [history, setHistory] = useState<string[]>([BROWSER_HOME])
  const [index, setIndex] = useState(0)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  const navigate = useCallback((next: string, push: boolean) => {
    const normalized = normalizeBrowserUrl(next)
    setUrl(normalized)
    setDraft(normalized)
    if (push) {
      setHistory(h => {
        const clipped = h.slice(0, index + 1)
        clipped.push(normalized)
        return clipped
      })
      setIndex(i => i + 1)
    }
  }, [index])

  const back = () => {
    if (index <= 0) return
    const next = index - 1
    setIndex(next)
    const target = history[next]!
    setUrl(target)
    setDraft(target)
  }
  const forward = () => {
    if (index >= history.length - 1) return
    const next = index + 1
    setIndex(next)
    const target = history[next]!
    setUrl(target)
    setDraft(target)
  }
  const reload = () => {
    const frame = frameRef.current
    if (frame) frame.src = url
  }
  const home = () => navigate(BROWSER_HOME, true)

  if (!canEmbedRemoteFrames()) {
    return <DesktopBlockedSurface t={props.t} url={url} title={props.t('shell.space.browser')} onClose={props.onClose} />
  }

  return (
    <div data-xyai-shell-view="browser" style={{ ...fullView, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'rgba(15,23,42,0.96)', borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
        <button type="button" title={props.t('shell.browser.back')} disabled={index <= 0} onClick={back} style={browserToolBtn(index <= 0)}>←</button>
        <button type="button" title={props.t('shell.browser.forward')} disabled={index >= history.length - 1} onClick={forward} style={browserToolBtn(index >= history.length - 1)}>→</button>
        <button type="button" title={props.t('shell.browser.reload')} onClick={reload} style={browserToolBtn(false)}>↻</button>
        <button type="button" title={props.t('shell.browser.home')} onClick={home} style={browserToolBtn(false)}>⌂</button>
        <form
          style={{ display: 'flex', flex: 1, gap: 6, minWidth: 0 }}
          onSubmit={e => { e.preventDefault(); navigate(draft, true) }}
        >
          <input
            aria-label={props.t('shell.browser.url')}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            style={{ flex: 1, minWidth: 0, borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(30,41,59,0.9)', color: '#e2e8f0', padding: '6px 10px', fontSize: 12 }}
          />
          <button type="submit" style={{ ...browserToolBtn(false), padding: '4px 12px' }}>{props.t('shell.browser.go')}</button>
        </form>
        <button type="button" onClick={props.onClose} style={{ ...browserToolBtn(false), padding: '4px 12px' }}>{props.t('shell.about.close')}</button>
      </div>
      <iframe ref={frameRef} title={props.t('shell.space.browser')} src={url} style={{ border: 0, width: '100%', flex: 1, background: '#fff' }} />
    </div>
  )
}

function browserToolBtn(disabled: boolean): CSSProperties {
  return {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.35)',
    background: disabled ? 'rgba(30,41,59,0.4)' : 'rgba(30,41,59,0.9)',
    color: '#e2e8f0',
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: 13,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  }
}

/** Register XYAI shell chrome without replacing DSH session ownership.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('xyaiDevShell', { zh, en }), 'xyai-shell: locale')
  ctx.effect(() => {
    const tagId = 'xyai-shell-chrome-layout'
    if (typeof document === 'undefined') return () => {}
    let tag = document.querySelector<HTMLStyleElement>('style[data-plugin-css=' + JSON.stringify(tagId) + ']')
    if (!tag) {
      tag = document.createElement('style')
      tag.dataset.plugin = '@xyai/dsh-dev-shell'
      tag.dataset.pluginCss = tagId
      tag.textContent = [
        SHELL_CHROME_CSS,
        '[data-xyai-product-nav]{width:100%;min-width:0;flex:0 0 auto;box-sizing:border-box;pointer-events:auto;overflow:hidden;border-top:1px solid rgba(80,95,120,.12);padding-top:8px!important}',
        'div:has(>[data-slot="sidebar.footer.action"]>[data-xyai-product-nav="collapsed"]){gap:4px!important}',
        '[data-xyai-space-bar],[data-xyai-shell-view]{pointer-events:auto}',
        '[data-xyai-shell-view] iframe{border:0;width:100%;height:100%;background:transparent}',
        '[data-xyai-collapsed-nav]{display:grid;gap:4px;width:100%}',
      ].join('')
      document.head.appendChild(tag)
    }
    return () => { tag?.remove() }
  }, 'xyai-shell: chrome layout css')

  // Restore interim DOM theme if DSH theme face is not yet available.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    if (!resolveThemeFace(ctx)) applyDomTheme(readStoredTheme())
    return () => {}
  }, 'xyai-shell: theme restore')

  const navigation = () => ({
    startSession: () => ctx.uiWorkspace.startSession(),
    toggleSidebar: () => ctx.layout.toggleSidebar(),
    // 0.1.5 layout: the details column became the right panel; reserve its
    // grid track without covering the frame.
    openDetails: () => ctx.layout.openRightbar(true, false),
    closeDetails: () => ctx.layout.closeRightbar(),
  })

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'xyai-space-bar', order: 10, locale: 'xyaiDevShell',
  }, function SpaceBar(props) {
    const [space, setSpace] = useState<SpaceId>('dev')
    const [overlay, setOverlay] = useState<OverlayId>('none')
    const [aboutHtml, setAboutHtml] = useState('')
    const [biz, setBiz] = useState<{ url: string; source: 'override' | 'local' | 'remote' } | null>(null)
    const [themePref, setThemePref] = useState<ThemePref>(() => {
      const face = resolveThemeFace(ctx)
      if (face) {
        const p = face.getTheme().preference
        return (p === 'light' || p === 'dark' || p === 'system') ? p : 'system'
      }
      return readStoredTheme()
    })

    useEffect(() => {
      const onNav = (event: Event) => {
        const detail = (event as CustomEvent<{ id?: NavId }>).detail
        if (!detail?.id) return
        if (detail.id === 'knowledge') { setOverlay('none'); window.dispatchEvent(new CustomEvent('xyai:open-knowledge')) }
        else if (detail.id === 'employees') setOverlay('none')
        else setOverlay('none')
      }
      const onSpace = (event: Event) => {
        const detail = (event as CustomEvent<{ id?: SpaceId }>).detail
        if (!detail?.id) return
        if (detail.id === 'dev') { setSpace('dev'); setOverlay('none') }
        else if (detail.id === 'about') openAbout()
        else if (detail.id === 'biz') openBiz()
        else if (detail.id === 'eco') { setSpace('eco'); setOverlay('none') }
        else if (detail.id === 'browser') { setSpace('browser'); setOverlay('none') }
      }
      window.addEventListener('xyai:shell-nav', onNav as EventListener)
      window.addEventListener('xyai:shell-space', onSpace as EventListener)
      return () => {
        window.removeEventListener('xyai:shell-nav', onNav as EventListener)
        window.removeEventListener('xyai:shell-space', onSpace as EventListener)
      }
    }, [])

    const openAbout = () => {
      setSpace('about')
      setAboutHtml(ABOUT_HTML.replaceAll('__LOGO__', resolveAboutLogo()))
      setOverlay('about')
    }

    const openBiz = () => {
      setSpace('biz')
      setOverlay('none')
      setBiz(null)
      void resolveBizUrl().then(setBiz)
    }

    const returnDev = () => { setOverlay('none'); setSpace('dev') }

    const cycleThemePref = () => {
      const face = resolveThemeFace(ctx)
      const current = face
        ? ((['system', 'light', 'dark'].includes(face.getTheme().preference)
          ? face.getTheme().preference
          : themePref) as ThemePref)
        : themePref
      const upcoming = nextTheme(current)
      if (face) {
        try { face.setTheme(upcoming) } catch { applyDomTheme(upcoming) }
      } else {
        // Interim exceed path: documentElement data-theme / class + localStorage
        // when DSH theme face is unavailable on this ctx.
        applyDomTheme(upcoming)
      }
      setThemePref(upcoming)
    }

    const themeLabel = themePref === 'light'
      ? props.t('shell.theme.light')
      : themePref === 'dark'
        ? props.t('shell.theme.dark')
        : props.t('shell.theme.system')

    return (
      <Fragment>
        <nav data-xyai-space-bar aria-label={props.t('shell.topbar')} style={{ ...glassBar, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: 'auto' }}>
          <strong style={{ fontSize: 13, marginRight: 8 }}>XYAI Studio</strong>
          {SPACES.map(item => (
            <button
              key={item.id}
              type="button"
              data-xyai-space={item.id}
              style={chip(space === item.id || (item.id === 'about' && overlay === 'about'))}
              title={props.t(item.key)}
              onClick={() => {
                if (item.id === 'about') { openAbout(); return }
                if (item.id === 'biz') { openBiz(); window.dispatchEvent(new CustomEvent('xyai:shell-space', { detail: { id: 'biz', ready: true } })); return }
                if (item.id === 'eco') {
                  setSpace('eco'); setOverlay('none')
                  window.dispatchEvent(new CustomEvent('xyai:shell-space', { detail: { id: 'eco', ready: true } }))
                  return
                }
                if (item.id === 'browser') {
                  setSpace('browser'); setOverlay('none')
                  window.dispatchEvent(new CustomEvent('xyai:shell-space', { detail: { id: 'browser', ready: true } }))
                  return
                }
                setSpace('dev'); setOverlay('none')
                window.dispatchEvent(new CustomEvent('xyai:shell-space', { detail: { id: 'dev', ready: true } }))
              }}
            >
              {props.t(item.key)}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            data-xyai-theme-cycle
            style={chip(false)}
            title={`${props.t('shell.theme')}: ${themeLabel}`}
            aria-label={`${props.t('shell.theme')}: ${themeLabel}`}
            onClick={cycleThemePref}
          >
            {themeLabel}
          </button>
        </nav>

        {space === 'biz' && overlay === 'none' && (
          biz
            ? <EmbedSurface
                t={props.t}
                url={biz.url}
                title={props.t('shell.space.biz')}
                badge={biz.source === 'local' ? props.t('shell.biz.local') : props.t('shell.biz.remote')}
                onClose={returnDev}
              />
            : (
              <div data-xyai-shell-view="biz-loading" style={{ ...fullView, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                {props.t('shell.embed.loading')}
              </div>
            )
        )}

        {space === 'eco' && overlay === 'none' && (
          <EmbedSurface t={props.t} url={ECO_URL} title={props.t('shell.space.eco')} onClose={returnDev} />
        )}

        {space === 'browser' && overlay === 'none' && (
          <BrowserChrome t={props.t} onClose={returnDev} />
        )}

        {overlay === 'about' && (
          <div data-xyai-shell-view="about" style={fullView}>
            <button
              type="button"
              onClick={returnDev}
              style={{ position: 'absolute', top: 12, right: 16, zIndex: 2, appearance: 'none', border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}
            >
              {props.t('shell.about.close')}
            </button>
            <iframe title={props.t('shell.space.about')} srcDoc={aboutHtml} />
          </div>
        )}
      </Fragment>
    )
  }))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'xyai-product-nav', order: 5, locale: 'xyaiDevShell', inject: navigation,
  }, function ProductNav(props) {
    const [nav, setNav] = useState<NavId | null>(null)
    const [mounted, setMounted] = useState<Record<XyaiSurfaceId, boolean>>(() => ({
      models: isXyaiSurfaceMounted('models'),
      employees: isXyaiSurfaceMounted('employees'),
      knowledge: isXyaiSurfaceMounted('knowledge'),
    }))

    useEffect(() => watchXyaiSurfaces(() => {
      setMounted({
        models: isXyaiSurfaceMounted('models'),
        employees: isXyaiSurfaceMounted('employees'),
        knowledge: isXyaiSurfaceMounted('knowledge'),
      })
    }), [])

    const runNav = (id: NavId, ready: boolean) => {
      if (!ready) return
      setNav(id)
      window.dispatchEvent(new CustomEvent('xyai:shell-nav', { detail: { id, ready: true } }))
      if (id === 'models') {
        openModelPlaza()
        return
      }
      if (id === 'employees') {
        window.dispatchEvent(new CustomEvent('xyai:open-ai-collaboration'))
        return
      }
      // Knowledge opens its owning overlay through xyai:shell-nav.
    }

    const items = NAV.map(item => ({ ...item, ready: mounted[item.id] }))

    if (!props.wide) {
      return (
        <div data-xyai-product-nav="collapsed" data-xyai-collapsed-nav>
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              data-xyai-nav={item.id}
              disabled={!item.ready}
              title={item.ready ? props.t(item.key) : props.t('shell.nav.unavailable')}
              aria-label={item.ready ? props.t(item.key) : props.t('shell.nav.unavailable')}
              style={{
                appearance: 'none',
                border: nav === item.id ? '1px solid rgba(21,101,192,0.55)' : '1px solid rgba(21,101,192,0.2)',
                background: nav === item.id ? 'rgba(21,101,192,0.14)' : 'transparent',
                borderRadius: 8,
                padding: '6px 0',
                fontSize: 11,
                cursor: item.ready ? 'pointer' : 'not-allowed',
                width: '100%',
                opacity: item.ready ? 1 : 0.45,
              }}
              onClick={() => runNav(item.id, item.ready)}
            >
              {props.t(item.key).slice(0, 1)}
            </button>
          ))}
        </div>
      )
    }
    return (
      <nav data-xyai-product-nav aria-label={props.t('shell.productNav')} style={{ display: 'grid', gap: 2, width: '100%', padding: '4px 0', pointerEvents: 'auto' }}>
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            data-xyai-nav={item.id}
            disabled={!item.ready}
            style={navBtn(nav === item.id, item.ready)}
            title={item.ready ? props.t(item.key) : props.t('shell.nav.unavailable')}
            onClick={() => runNav(item.id, item.ready)}
          >
            {props.t(item.key)}
          </button>
        ))}
      </nav>
    )
  }))


  // Bridge: typed selectView from conversation.session.header → xyai:open-view.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities', id: 'xyai-open-view-bridge', order: 0, locale: 'xyaiDevShell',
  }, function OpenViewBridge(props: {
    selectView?: (view: string) => void
    openView?: (view: string, focus: string) => void
  }) {
    useEffect(() => {
      const onOpen = (event: Event) => {
        const id = (event as CustomEvent<{ id?: string }>).detail?.id
        if (!id) return
        if (typeof props.selectView === 'function') props.selectView(id)
        else if (typeof props.openView === 'function') props.openView(id, '')
      }
      window.addEventListener('xyai:open-view', onOpen as EventListener)
      return () => window.removeEventListener('xyai:open-view', onOpen as EventListener)
    }, [props.selectView, props.openView])
    return null
  }))

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities', id: 'xyai-workbench', order: 20,
    locale: 'xyaiDevShell', inject: navigation,
  }, function Workbench(props) {
    const [open, setOpen] = useState(false)
    useEffect(() => {
      const close = () => setOpen(false)
      window.addEventListener('xyai:open-conversation', close)
      return () => window.removeEventListener('xyai:open-conversation', close)
    }, [])
    return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} data-xyai-workbench>
      <summary>{props.t('shell.workbench')}</summary>
      <nav aria-label={props.t('shell.workbench')} style={{ display: 'grid', gap: 8, padding: 12 }}>
        <button type="button" onClick={() => { setOpen(false); props.startSession() }}>{props.t('shell.new')}</button>
        <button type="button" onClick={props.toggleSidebar}>{props.t('shell.sidebar')}</button>
        <button type="button" onClick={props.openDetails}>{props.t('shell.details')}</button>
        <button type="button" onClick={props.closeDetails}>{props.t('shell.closeDetails')}</button>
      </nav>
    </details>
  }))

  const sessions = (ctx as Context & { sessions?: ISessions }).sessions
  const workspaceFace = () => {
    try {
      return (ctx as Context & { uiWorkspace?: { openSession?: (id: string) => void; archiveSession?: (id: string) => Promise<void> } }).uiWorkspace
    } catch { return undefined }
  }
  const interactFace = () => ({
    hooks: sessions ? { sessionList: sessions.list } : {},
    sessions,
    uiWorkspace: workspaceFace(),
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'xyai-ai-interact', order: 3, locale: 'xyaiDevShell', inject: interactFace,
  }, function AiInteract(props: {
    wide?: boolean
    t: (key: XyaiDevShellKey) => string
    useSessionList?: (select: (state: SessionListState) => unknown) => unknown
    sessions?: ISessions
    uiWorkspace?: { openSession?: (id: string) => void; archiveSession?: (id: string) => Promise<void> }
  }) {
    const list = (props.useSessionList?.(state => state) ?? { ids: [], byId: {}, current: undefined }) as SessionListState
    const rows = list.ids.map(id => {
      const row = list.byId[id]
      return { id: id as string, title: row?.title, displayTitle: row?.displayTitle, updatedAt: row?.updatedAt, blank: row?.blank }
    })
    const { dm, group } = partitionInteractSessions(rows)
    const [renaming, setRenaming] = useState<string | null>(null)
    const [draft, setDraft] = useState('')
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [error, setError] = useState('')

    const openChat = (sessionId: string) => {
      const detail = conversationOpenDetail(sessionId)
      if (isWorkbenchMisland(detail.view)) return
      props.uiWorkspace?.openSession?.(sessionId as never)
      props.sessions?.open(sessionId as never)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('xyai:open-conversation', { detail }))
        window.dispatchEvent(new CustomEvent('xyai:shell-space', { detail: { id: 'dev', ready: true } }))
      }
    }

    const rename = async (sessionId: string) => {
      const name = draft.trim()
      if (!name || !props.sessions) return
      setError('')
      try {
        const binding = props.sessions.binding(sessionId as never)
        if (!binding) throw new Error('session unavailable')
        const result = await binding.session.rename(name)
        if (!result.ok) throw new Error(result.error.message)
        setRenaming(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }

    const archive = async (sessionId: string) => {
      setError('')
      try { await props.uiWorkspace?.archiveSession?.(sessionId as never) }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    }

    const renderList = (title: string, items: typeof dm) => (
      <div style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 11, opacity: 0.7 }}>{title}</strong>
        {items.length === 0 && <small data-xyai-interact-empty style={{ opacity: 0.65 }}>{props.t('shell.interact.empty')}</small>}
        {items.map(item => (
          <div key={item.id} data-xyai-interact-row={item.kind} style={{ display: 'grid', gap: 4 }}>
            {renaming === item.id ? (
              <span style={{ display: 'flex', gap: 4 }}>
                <input aria-label={props.t('shell.interact.rename')} value={draft} onChange={event => setDraft(event.target.value)} />
                <button type="button" onClick={() => { void rename(item.id) }}>{props.t('shell.interact.save')}</button>
                <button type="button" onClick={() => setRenaming(null)}>{props.t('shell.interact.cancel')}</button>
              </span>
            ) : (
              <button type="button" data-xyai-interact-open={item.id}
                style={{ ...navBtn(list.current === item.id, true), textAlign: 'left' }}
                title={props.t('shell.interact.open')}
                onClick={() => openChat(item.id)}>
                {item.title}
              </button>
            )}
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setRenaming(item.id); setDraft(item.title); setError('') }}>{props.t('shell.interact.rename')}</button>
              <button type="button" onClick={() => { void archive(item.id) }}>{props.t('shell.interact.archive')}</button>
              {confirmDelete === item.id ? (
                <button type="button" onClick={() => { void archive(item.id); setConfirmDelete(null) }}>{props.t('shell.interact.deleteConfirm')}</button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(item.id)}>{props.t('shell.interact.delete')}</button>
              )}
            </span>
          </div>
        ))}
      </div>
    )

    if (!props.wide) {
      return (
        <button type="button" data-xyai-interact="collapsed" title={props.t('shell.interact')}
          aria-label={props.t('shell.interact')}
          style={{ appearance: 'none', border: '1px solid rgba(21,101,192,0.2)', background: 'transparent', borderRadius: 8, padding: '6px 0', fontSize: 11, cursor: 'pointer', width: '100%' }}
          onClick={() => {
            const first = dm[0] ?? group[0]
            if (first) openChat(first.id)
          }}>
          {props.t('shell.interact').slice(0, 1)}
        </button>
      )
    }

    const empty = dm.length === 0 && group.length === 0

    return (
      <nav data-xyai-interact data-xyai-empty={empty || undefined} aria-label={props.t('shell.interact')} style={{ display: 'grid', gap: 10, width: '100%', padding: '6px 0', pointerEvents: 'auto' }}>
        <strong style={{ fontSize: 12 }}>{props.t('shell.interact')}</strong>
        {renderList(props.t('shell.interact.dm'), dm)}
        {renderList(props.t('shell.interact.group'), group)}
        {error && <small role="alert">{error}</small>}
      </nav>
    )
  }))

}
