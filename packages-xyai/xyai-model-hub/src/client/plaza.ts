/**
 * Model Plaza conversation.view — Wave-1 UI over Host RPC.
 * Tabs: prepare, discover, local, cloud, downloads.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { catalogEntries, type ModelHub } from '../models.ts'
import type {
  BenchmarkResult,
  CloudProvider,
  EnvironmentInspect,
  ModelHubEnvelope,
  RecommendModel,
  RegistryEntry,
  TaskSnapshot,
} from '../protocol.ts'
import type { XyaiModelHubKey } from './locales.ts'

export type PlazaCall = <T extends ModelHubEnvelope>(endpoint: string, payload?: unknown) => Promise<T>
export type PlazaT = (key: XyaiModelHubKey) => string

type Tab = 'discover' | 'local' | 'cloud' | 'tasks' | 'prep'

const btn = (label: string, onClick: () => void, primary = false, disabled = false): React.ReactElement =>
  React.createElement('button', {
    type: 'button',
    disabled,
    onClick,
    style: {
      font: 'inherit', borderRadius: 8, padding: '7px 12px', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      border: primary ? '1px solid #275dd4' : '1px solid rgba(15,23,42,.16)',
      background: primary ? '#275dd4' : 'transparent',
      color: primary ? '#fff' : 'inherit',
    },
  }, label)

const panel = (children: React.ReactNode, key?: string): React.ReactElement =>
  React.createElement('div', {
    key,
    style: {
      background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,.6))',
      border: '1px solid var(--dsw-alias-border-l4, rgba(15,23,42,.12))',
      borderRadius: 12, padding: 16, marginBottom: 12,
    },
  }, children)

const muted = (text: string): React.ReactElement =>
  React.createElement('div', { style: { fontSize: 12, opacity: 0.72 } }, text)

const badge = (text: string, accent = true): React.ReactElement =>
  React.createElement('span', {
    style: {
      fontSize: 11, padding: '3px 8px', borderRadius: 6,
      background: accent ? 'rgba(39,93,212,.12)' : 'rgba(15,23,42,.08)',
      color: accent ? '#275dd4' : 'inherit',
    },
  }, text)

/** Full plaza surface injected into conversation.view / shell.overlay. */
export function ModelPlaza(props: {
  call: PlazaCall
  t: PlazaT
  hub: ModelHub
}): React.ReactElement {
  const { call, t, hub } = props
  const [tab, setTab] = useState<Tab>('discover')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hw, setHw] = useState<EnvironmentInspect | null>(null)
  const [recommend, setRecommend] = useState<RecommendModel[]>([])
  const [local, setLocal] = useState<RegistryEntry[]>([])
  const [providers, setProviders] = useState<CloudProvider[]>([])
  const [tasks, setTasks] = useState<TaskSnapshot[]>([])
  const [scanFound, setScanFound] = useState<RegistryEntry[]>([])
  const [selectedScan, setSelectedScan] = useState<Record<string, boolean>>({})
  const [diskC, setDiskC] = useState(false)
  const [diskD, setDiskD] = useState(true)
  const [diskE, setDiskE] = useState(true)
  const [extraRoot, setExtraRoot] = useState('')
  const [autoRegister, setAutoRegister] = useState(true)
  const [q, setQ] = useState('')
  const [useFilter, setUseFilter] = useState('')
  const [originFilter, setOriginFilter] = useState('')
  const [confirmUnmount, setConfirmUnmount] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({})
  const [planText, setPlanText] = useState('')
  const [prepTask, setPrepTask] = useState<TaskSnapshot | null>(null)
  const [scanTask, setScanTask] = useState<TaskSnapshot | null>(null)
  const [benchTask, setBenchTask] = useState<TaskSnapshot | null>(null)
  const [benchNote, setBenchNote] = useState('')
  const [pullTag, setPullTag] = useState('')

  const say = useCallback((text: string, isError = false) => {
    setMsg(text); setErr(isError)
  }, [])

  const run = useCallback(async <T extends ModelHubEnvelope>(endpoint: string, payload?: unknown): Promise<T | null> => {
    setLoading(true)
    try {
      const res = await call<T>(endpoint, payload)
      if (res.errcode && res.errcode !== '0') {
        say(res.errmsg || t('plaza.error'), true)
        return res
      }
      return res
    } catch (e) {
      say(String(e), true)
      return null
    } finally {
      setLoading(false)
    }
  }, [call, say, t])

  const refreshAll = useCallback(async () => {
    const [env, rec, reg, cloud, dl] = await Promise.all([
      run<EnvironmentInspect>('environment/inspect'),
      run<ModelHubEnvelope & { models?: RecommendModel[] }>('recommend/list'),
      run<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/list'),
      run<ModelHubEnvelope & { providers?: CloudProvider[] }>('cloud/providers'),
      run<ModelHubEnvelope & { tasks?: TaskSnapshot[] }>('downloads/list'),
    ])
    if (env && (!env.errcode || env.errcode === '0')) setHw(env)
    if (rec?.models) setRecommend(rec.models)
    if (reg?.entries) setLocal(reg.entries)
    if (cloud?.providers) setProviders(cloud.providers)
    if (dl?.tasks) setTasks(dl.tasks)
  }, [run])

  useEffect(() => { void refreshAll() }, [refreshAll])

  useEffect(() => {
    const needDl = tasks.some(x => x.kind === 'download' && !['done', 'cancelled', 'failed', 'paused'].includes(x.phase))
    const needPrep = !!(prepTask && !['done', 'cancelled', 'failed', 'unavailable'].includes(prepTask.phase))
    const needScan = !!(scanTask && scanTask.phase === 'scanning')
    const needBench = !!(benchTask && benchTask.phase === 'running')
    if (!needDl && !needPrep && !needScan && !needBench) return
    const id = setInterval(() => {
      void (async () => {
        if (needDl) {
          const dl = await call<ModelHubEnvelope & { tasks?: TaskSnapshot[] }>('downloads/list')
          if (dl?.tasks) {
            setTasks(dl.tasks)
            if (dl.tasks.some(x => x.phase === 'done')) {
              const reg = await call<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/list')
              if (reg?.entries) setLocal(reg.entries)
            }
          }
        }
        if (needPrep && prepTask?.taskId) {
          const snap = await call<ModelHubEnvelope & { task?: TaskSnapshot }>('environment/snapshot', { taskId: prepTask.taskId })
          if (snap?.task) setPrepTask(snap.task)
        }
        if (needScan && scanTask?.taskId) {
          const snap = await call<ModelHubEnvelope & { task?: TaskSnapshot; found?: RegistryEntry[] }>('scan/snapshot', { taskId: scanTask.taskId })
          if (snap?.task) setScanTask(snap.task)
          if (snap?.found) {
            setScanFound(snap.found)
            setSelectedScan(prev => {
              const next = { ...prev }
              for (const f of snap.found!) if (next[f.id] === undefined) next[f.id] = !f.mounted
              return next
            })
          }
          if (snap?.task?.phase === 'done') {
            const reg = await call<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/list')
            if (reg?.entries) setLocal(reg.entries)
          }
        }
        if (needBench && benchTask?.taskId) {
          const snap = await call<ModelHubEnvelope & { task?: TaskSnapshot; result?: BenchmarkResult }>('benchmark/snapshot', { taskId: benchTask.taskId })
          if (snap?.task) setBenchTask(snap.task)
          if (snap?.result) {
            const d = snap.result.display
            const note = [
              d?.firstToken || `TTFT ${snap.result.firstTokenMs ?? '—'}ms`,
              d?.tokensPerSec || `${snap.result.tokensPerSec ?? '—'} tok/s`,
              snap.result.unavailable ? t('plaza.unavailable') : t('plaza.realLabel'),
            ].join(' · ')
            setBenchNote(note)
            const reg = await call<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/list')
            if (reg?.entries) setLocal(reg.entries)
          }
        }
      })()
    }, 900)
    return () => clearInterval(id)
  }, [tasks, prepTask, scanTask, benchTask, call, t])

  const catalogCards = useMemo(() => catalogEntries(hub.catalog), [hub.catalog])

  const filtered = useMemo(() => recommend.filter(m => {
    const hay = `${m.name} ${m.reason} ${m.use}`.toLowerCase()
    if (q && !hay.includes(q.toLowerCase())) return false
    if (useFilter && m.use !== useFilter) return false
    if (originFilter && m.origin !== originFilter) return false
    return true
  }), [recommend, q, useFilter, originFilter])

  const uses = useMemo(() => [...new Set(recommend.map(m => m.use))], [recommend])
  const origins = useMemo(() => [...new Set(recommend.map(m => m.origin))], [recommend])

  const hwLine = hw
    ? [
        hw.realGpu && hw.gpu ? `${hw.vramGb ?? '?'} GB VRAM · ${hw.gpu}` : (hw.gpu ? hw.gpu : 'CPU'),
        hw.memoryGb != null ? `${hw.memoryGb} GB RAM` : null,
        hw.cpuCores != null ? `${hw.cpuCores} cores` : null,
        hw.platform || null,
      ].filter(Boolean).join(' · ')
    : t('plaza.loading')

  const tabs: { id: Tab; key: XyaiModelHubKey }[] = [
    { id: 'prep', key: 'plaza.tab.prep' },
    { id: 'discover', key: 'plaza.tab.discover' },
    { id: 'local', key: 'plaza.tab.local' },
    { id: 'cloud', key: 'plaza.tab.cloud' },
    { id: 'tasks', key: 'plaza.tab.tasks' },
  ]

  const startDownload = async (m: RecommendModel) => {
    const res = await run<ModelHubEnvelope & { task?: TaskSnapshot }>('downloads/start', {
      modelId: m.id, name: m.name, node: '国内镜像优先',
    })
    if (res?.task) {
      setTasks(prev => {
        const rest = prev.filter(x => x.taskId !== res.task!.taskId)
        return [...rest, res.task!]
      })
      setTab('tasks')
      say(`${m.name} · ${res.task.phase}${res.task.stub ? ` · ${t('plaza.simLabel')}` : ''}`)
    }
  }

  const mutateDownload = async (taskId: string, endpoint: string, extra: Record<string, unknown> = {}) => {
    const res = await run<ModelHubEnvelope & { task?: TaskSnapshot }>(endpoint, { taskId, ...extra })
    if (res?.task) {
      setTasks(prev => prev.map(x => x.taskId === res.task!.taskId ? res.task! : x))
      if (res.task.phase === 'done') {
        const reg = await run<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/list')
        if (reg?.entries) setLocal(reg.entries)
      }
      say(`${res.task.label}: ${res.task.phase}`)
    }
  }

  const doScan = async () => {
    const disks: string[] = []
    if (diskC) disks.push('C')
    if (diskD) disks.push('D')
    if (diskE) disks.push('E')
    const roots = extraRoot.trim() ? [extraRoot.trim()] : []
    const res = await run<ModelHubEnvelope & { found?: RegistryEntry[]; skipped?: number; task?: TaskSnapshot }>(
      'scan/start',
      { disks, roots, autoRegister: autoRegister ? 'yes' : 'no', maxDepth: 5 },
    )
    if (res?.task) setScanTask(res.task)
    if (res?.found) {
      setScanFound(res.found)
      const sel: Record<string, boolean> = {}
      for (const f of res.found) sel[f.id] = !f.mounted
      setSelectedScan(sel)
    }
    say(t('plaza.scanStarted'))
  }

  const applyBench = (res: ModelHubEnvelope & { result?: BenchmarkResult; task?: TaskSnapshot }) => {
    if (res.task) setBenchTask(res.task)
    if (res.result) {
      const d = res.result.display
      const note = [
        d?.firstToken || `TTFT ${res.result.firstTokenMs ?? '—'}ms`,
        d?.tokensPerSec || `${res.result.tokensPerSec ?? '—'} tok/s`,
        res.result.unavailable ? t('plaza.unavailable') : t('plaza.realLabel'),
      ].join(' · ')
      setBenchNote(note)
      say(`${t('plaza.benchPrefix')} ${note}`)
    }
  }

  const header = React.createElement('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 } },
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { style: { fontSize: 11, letterSpacing: '.04em', opacity: 0.65 } }, t('plaza.kicker')),
      React.createElement('h2', { style: { margin: '2px 0 4px', fontSize: 22, fontWeight: 600 } }, t('plaza.title')),
      muted(t('plaza.subtitle')),
    ),
    badge(t('plaza.stubBadge')),
  )

  const hwBar = panel(React.createElement('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('strong', null, hwLine),
      muted(hw?.notes?.[0] || t('plaza.hwUnknown')),
      hw ? muted([
        hw.realOs ? t('plaza.realLabel') : t('plaza.simLabel'),
        hw.realGpu ? `GPU ${t('plaza.realLabel')}` : `GPU ${t('plaza.hwUnknown')}`,
        `Ollama: ${hw.runtime.ollama}`,
      ].join(' · ')) : null,
    ),
    btn(t('plaza.refreshHw'), () => { void (async () => {
      const env = await run<EnvironmentInspect>('environment/inspect')
      if (env && (!env.errcode || env.errcode === '0')) { setHw(env); say(t('plaza.hwTitle')) }
    })() }),
  ))

  const tabNav = React.createElement('nav', {
    'aria-label': t('plaza.title'),
    style: { display: 'flex', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(15,23,42,.12)', marginBottom: 16 },
  }, tabs.map(item => React.createElement('button', {
    key: item.id,
    type: 'button',
    'aria-current': tab === item.id ? 'page' : undefined,
    onClick: () => { setTab(item.id); setMsg('') },
    style: {
      border: 0, background: 'none', padding: '10px 0', cursor: 'pointer', font: 'inherit',
      borderBottom: tab === item.id ? '2px solid #275dd4' : '2px solid transparent',
      color: tab === item.id ? '#275dd4' : 'inherit', opacity: tab === item.id ? 1 : 0.7,
    },
  }, item.id === 'tasks' ? `${t(item.key)} (${tasks.filter(x => !['done', 'cancelled'].includes(x.phase)).length})` : t(item.key))))

  const status = msg
    ? React.createElement('p', { role: err ? 'alert' : 'status', style: { margin: '0 0 12px', fontSize: 13, color: err ? '#b91c1c' : '#275dd4' } }, msg)
    : null

  let body: React.ReactNode = null

  if (tab === 'discover') {
    body = React.createElement(React.Fragment, null,
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) 120px 120px', gap: 8, marginBottom: 14 } },
        React.createElement('input', {
          'aria-label': t('plaza.search'), placeholder: t('plaza.search'), value: q,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value),
          style: { padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(15,23,42,.16)', font: 'inherit' },
        }),
        React.createElement('select', {
          'aria-label': t('plaza.useAll'), value: useFilter,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setUseFilter(e.target.value),
          style: { padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(15,23,42,.16)', font: 'inherit' },
        }, React.createElement('option', { value: '' }, t('plaza.useAll')),
          uses.map(u => React.createElement('option', { key: u, value: u }, u))),
        React.createElement('select', {
          'aria-label': t('plaza.originAll'), value: originFilter,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setOriginFilter(e.target.value),
          style: { padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(15,23,42,.16)', font: 'inherit' },
        }, React.createElement('option', { value: '' }, t('plaza.originAll')),
          origins.map(o => React.createElement('option', { key: o, value: o }, o))),
      ),
      React.createElement('h3', { style: { margin: '0 0 10px', fontSize: 16 } }, t('plaza.recommend')),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 } },
        filtered.map(m => {
          const owned = local.some(e => e.id === m.id && e.mounted && !e.missing)
          return panel(React.createElement(React.Fragment, null,
            React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              React.createElement('div', {
                style: {
                  width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
                  background: 'rgba(39,93,212,.12)', color: '#275dd4', fontWeight: 700,
                },
              }, m.name[0]),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('strong', null, m.name),
                muted(`${m.vendor} · ${m.use} · ${m.origin}`),
              ),
              badge(owned ? t('plaza.mounted') : (m.quant || 'GGUF')),
            ),
            muted(m.reason),
            React.createElement('div', {
              style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '10px 0', fontSize: 12 },
            },
              React.createElement('div', null, muted(t('plaza.size')), m.size),
              React.createElement('div', null, muted(t('plaza.vram')), hw?.realGpu ? m.vram : 'CPU'),
              React.createElement('div', null, muted(t('plaza.license')), m.license),
            ),
            React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              btn(t('plaza.detail'), () => say(`${m.name}: ${m.reason} · ${m.license} · ${m.file || m.tag}`)),
              owned
                ? btn(t('plaza.manage'), () => setTab('local'), true)
                : btn(t('plaza.download'), () => { void startDownload(m) }, true, loading),
            ),
          ), m.id)
        }),
      ),
      React.createElement('h3', { style: { margin: '18px 0 10px', fontSize: 16 } }, t('plaza.catalogCards')),
      React.createElement('div', { style: { display: 'grid', gap: 8 } },
        catalogCards.length
          ? catalogCards.map(c => panel(
            React.createElement('div', null,
              React.createElement('strong', null, c.name),
              muted(`${c.provider}${c.endpoint ? ` · ${c.endpoint}` : ''}`),
              muted(t('plaza.notConnected')),
            ),
            `${c.name}|${c.provider}|${c.endpoint}`,
          ))
          : muted('—'),
      ),
    )
  }

  if (tab === 'local') {
    body = React.createElement(React.Fragment, null,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
        React.createElement('h3', { style: { margin: 0, fontSize: 16 } }, `${t('plaza.tab.local')} · ${local.length}`),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          btn(t('plaza.scan'), () => { void doScan() }, false, loading || scanTask?.phase === 'scanning'),
          scanTask?.phase === 'scanning'
            ? btn(t('plaza.scanCancel'), () => { void (async () => {
              await run('scan/cancel', { taskId: scanTask.taskId })
              setScanTask(prev => prev ? { ...prev, phase: 'cancelled' } : prev)
            })() })
            : null,
        ),
      ),
      panel(React.createElement(React.Fragment, null,
        React.createElement('strong', null, t('plaza.ollamaPull')),
        muted(t('plaza.ollamaTagHint')),
        React.createElement('input', {
          'aria-label': t('plaza.ollamaTag'),
          placeholder: 'qwen2.5:7b',
          value: pullTag,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPullTag(e.target.value),
          style: { display: 'block', width: '100%', marginTop: 8, padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(15,23,42,.16)', font: 'inherit', boxSizing: 'border-box' },
        }),
        React.createElement('div', { style: { marginTop: 10 } },
          btn(t('plaza.ollamaPull'), () => { void (async () => {
            const tag = pullTag.trim()
            if (!tag) return
            const res = await run<ModelHubEnvelope & { task?: TaskSnapshot; errmsg?: string }>(
              'ollama/pull',
              { tag },
            )
            if (res?.errcode === '409') {
              say(t('plaza.noRedownload'), true)
              return
            }
            if (res?.task) {
              setTasks(prev => {
                const rest = prev.filter(x => x.taskId !== res.task!.taskId)
                return [...rest, res.task!]
              })
              setTab('tasks')
              say(`${tag} · ${res.task.phase}`)
            }
          })() }, true, loading || !pullTag.trim()),
        ),
      )),
      scanFound.length > 0 || scanTask
        ? panel(React.createElement(React.Fragment, null,
          scanTask ? muted(`${scanTask.phase} · ${scanTask.percent}% · ${scanTask.detail || ''}`) : null,
          React.createElement('strong', null, `${t('plaza.scanFound')} · ${scanFound.length}`),
          muted(t('plaza.scanPick')),
          ...scanFound.map(f => React.createElement('label', {
            key: f.id,
            style: { display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, fontSize: 13 },
          },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!selectedScan[f.id],
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSelectedScan({ ...selectedScan, [f.id]: e.target.checked }),
            }),
            React.createElement('span', null,
              React.createElement('strong', null, f.name),
              muted(`${f.kind} · ${f.size} · ${f.mounted ? t('plaza.mounted') : t('plaza.unmounted')}`),
              React.createElement('div', { style: { fontFamily: 'Consolas,monospace', fontSize: 11, opacity: 0.7, overflowWrap: 'anywhere' } }, f.path),
            ),
          )),
          React.createElement('div', { style: { marginTop: 10 } },
            btn(t('plaza.batchRegister'), () => { void (async () => {
              const ids = Object.entries(selectedScan).filter(([, v]) => v).map(([id]) => id)
              const res = await run<ModelHubEnvelope & { count?: number; failed?: { id: string; error: string }[] }>(
                'registry/register-batch',
                { ids, entries: scanFound },
              )
              const reg = await run<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/list')
              if (reg?.entries) setLocal(reg.entries)
              say(`${t('plaza.registeredPrefix')} ${res?.count ?? 0} ${t('plaza.items')}${res?.failed?.length ? ` · ${t('plaza.failedSuffix')} ${res.failed.length}` : ''}`)
            })() }, true, loading),
          ),
        ))
        : null,
      local.length === 0
        ? panel(muted(t('plaza.emptyLocal')))
        : local.map(entry => panel(React.createElement(React.Fragment, null,
          React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('strong', null, entry.name, entry.isDefault ? ` · ${t('plaza.default')}` : ''),
              muted(`${entry.kind} · ${entry.size} · ${entry.missing ? t('plaza.missing') : entry.mounted ? t('plaza.mounted') : t('plaza.unmounted')}${entry.source ? ` · ${entry.source}` : ''}`),
              entry.lastBenchmark
                ? muted(entry.lastBenchmark.unavailable
                  ? `${t('plaza.unavailable')} · ${entry.lastBenchmark.note || ''}`
                  : `TTFT ${entry.lastBenchmark.firstTokenMs ?? '—'}ms · ${entry.lastBenchmark.tokensPerSec ?? '—'} tok/s · ${entry.lastBenchmark.backend}`)
                : null,
            ),
          ),
          React.createElement('div', { style: { fontFamily: 'Consolas,monospace', fontSize: 12, opacity: 0.7, margin: '8px 0', overflowWrap: 'anywhere' } }, entry.path),
          confirmUnmount === entry.id
            ? React.createElement('div', null,
              muted(t('plaza.unmountConfirm')),
              React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
                btn(t('plaza.cancel'), () => setConfirmUnmount(null)),
                btn(t('plaza.confirm'), () => { void (async () => {
                  const res = await run<ModelHubEnvelope & { entry?: RegistryEntry }>('registry/unmount', { id: entry.id, confirm: 'yes' })
                  if (res?.entry) {
                    setLocal(prev => prev.map(e => e.id === res.entry!.id ? res.entry! : e))
                    say(t('plaza.unmountedKept'))
                  }
                  setConfirmUnmount(null)
                })() }, true),
              ),
            )
            : React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              !entry.mounted
                ? btn(t('plaza.mount'), () => { void (async () => {
                  const res = await run<ModelHubEnvelope & { entry?: RegistryEntry }>('registry/register', {
                    id: entry.id, name: entry.name, path: entry.path, size: entry.size, kind: entry.kind, source: entry.source,
                  })
                  if (res?.entry) {
                    setLocal(prev => {
                      const others = prev.filter(e => e.id !== res.entry!.id)
                      return [...others, res.entry!]
                    })
                    say(t('plaza.mountDone'))
                    const bench = await run<ModelHubEnvelope & { result?: BenchmarkResult; task?: TaskSnapshot }>('benchmark/start', { id: res.entry.id })
                    if (bench) applyBench(bench)
                  }
                })() }, true, loading)
                : React.createElement(React.Fragment, null,
                  btn(t('plaza.setDefault'), () => { void (async () => {
                    const res = await run<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/set-default', { id: entry.id })
                    if (res?.entries) setLocal(res.entries)
                    else {
                      const reg = await run<ModelHubEnvelope & { entries?: RegistryEntry[] }>('registry/list')
                      if (reg?.entries) setLocal(reg.entries)
                    }
                    say(t('plaza.defaultUpdated'))
                  })() }, false, loading || !!entry.isDefault || !!entry.missing),
                  btn(entry.lastBenchmark ? t('plaza.retest') : t('plaza.benchmark'), () => { void (async () => {
                    const res = await run<ModelHubEnvelope & { result?: BenchmarkResult; task?: TaskSnapshot }>('benchmark/start', { id: entry.id })
                    if (res) applyBench(res)
                  })() }, false, loading || !!entry.missing),
                ),
              entry.mounted ? btn(t('plaza.unmount'), () => setConfirmUnmount(entry.id)) : null,
            ),
        ), entry.id)),
      benchNote ? panel(muted(benchNote)) : null,
    )
  }

  if (tab === 'cloud') {
    body = React.createElement(React.Fragment, null,
      React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16 } }, t('plaza.tab.cloud')),
      muted(t('plaza.cloudKeyHint')),
      providers.map(p => panel(React.createElement(React.Fragment, null,
        React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
          React.createElement('div', {
            style: {
              width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
              background: 'rgba(39,93,212,.12)', color: '#275dd4', fontWeight: 700,
            },
          }, p.name[0]),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('strong', null, p.name),
            muted(p.keyConfigured ? t('plaza.keyOk') : t('plaza.keyPending')),
          ),
        ),
        React.createElement('div', { style: { fontFamily: 'Consolas,monospace', fontSize: 12, opacity: 0.7, margin: '8px 0' } }, p.base),
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 8 } }, t('plaza.cloudKey'),
          React.createElement('input', {
            type: 'password',
            autoComplete: 'off',
            placeholder: p.keyConfigured ? '••••••••' : '',
            value: keyDraft[p.id] || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setKeyDraft({ ...keyDraft, [p.id]: e.target.value }),
            style: { display: 'block', width: '100%', marginTop: 4, padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(15,23,42,.16)', font: 'inherit', boxSizing: 'border-box' },
          }),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 } },
          btn(t('plaza.cloudSaveKey'), () => { void (async () => {
            const key = keyDraft[p.id] || ''
            const res = await run<ModelHubEnvelope & { provider?: CloudProvider }>('cloud/set-key', { providerId: p.id, key })
            setKeyDraft(prev => ({ ...prev, [p.id]: '' }))
            if (res?.provider) {
              setProviders(prev => prev.map(x => x.id === res.provider!.id ? res.provider! : x))
              say(t('plaza.cloudSaved'))
            }
          })() }, true, loading),
          btn(t('plaza.cloudTest'), () => { void (async () => {
            if (!p.keyConfigured) { say(t('plaza.cloudNeedKey'), true); return }
            const res = await run<ModelHubEnvelope & { result?: string; provider?: CloudProvider }>('cloud/test', {
              providerId: p.id, modelId: p.models[0]?.id,
            })
            if (res?.provider) setProviders(prev => prev.map(x => x.id === res.provider!.id ? res.provider! : x))
            if (res?.result) say(res.result, !!(res.errcode && res.errcode !== '0'))
            else if (res?.errmsg) say(res.errmsg, true)
          })() }, false, loading || !p.keyConfigured),
        ),
        p.models.map(m => React.createElement('div', { key: m.id, style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(15,23,42,.08)' } },
          React.createElement('strong', null, m.name),
          muted(m.call),
          m.lastTest ? muted(m.lastTest) : null,
        )),
      ), p.id)),
    )
  }

  if (tab === 'tasks') {
    body = React.createElement(React.Fragment, null,
      React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16 } }, t('plaza.tab.tasks')),
      tasks.length === 0
        ? panel(React.createElement(React.Fragment, null, muted(t('plaza.emptyTasks')), btn(t('plaza.tab.discover'), () => setTab('discover'), true)))
        : tasks.map(task => panel(React.createElement(React.Fragment, null,
          React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('strong', null, task.label),
              muted(`${task.kind} · ${task.detail || ''} · ${task.stub ? t('plaza.simLabel') : t('plaza.realLabel')}`),
            ),
            badge(task.phase),
          ),
          React.createElement('progress', { value: task.percent, max: 100, style: { width: '100%', margin: '10px 0' }, 'aria-label': task.label }),
          muted(`${task.percent}%${task.error ? ` · ${task.error}` : ''}`),
          confirmCancel === task.taskId
            ? React.createElement('div', { style: { marginTop: 8 } },
              muted(t('plaza.taskCancelConfirm')),
              React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
                btn(t('plaza.cancel'), () => setConfirmCancel(null)),
                btn(t('plaza.confirm'), () => { void mutateDownload(task.taskId, 'downloads/cancel', { confirm: 'yes' }); setConfirmCancel(null) }, true),
              ),
            )
            : React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 } },
              ['connecting', 'downloading'].includes(task.phase)
                ? btn(t('plaza.taskPause'), () => { void mutateDownload(task.taskId, 'downloads/pause') })
                : null,
              task.phase === 'paused' || task.phase === 'failed'
                ? btn(t('plaza.taskResume'), () => { void mutateDownload(task.taskId, 'downloads/resume') }, true)
                : null,
              !['done', 'cancelled', 'registering'].includes(task.phase)
                ? btn(t('plaza.taskCancel'), () => setConfirmCancel(task.taskId))
                : null,
            ),
        ), task.taskId)),
    )
  }

  if (tab === 'prep') {
    body = React.createElement(React.Fragment, null,
      React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16 } }, t('plaza.hwTitle')),
      panel(React.createElement(React.Fragment, null,
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, fontSize: 13 } },
          React.createElement('div', null, muted('CPU'), hw?.cpu || '—'),
          React.createElement('div', null, muted('Cores'), hw?.cpuCores ?? '—'),
          React.createElement('div', null, muted('Platform'), hw?.platform || '—'),
          React.createElement('div', null, muted('GPU'), hw?.gpu ?? `null · ${t('plaza.hwUnknown')}`),
          React.createElement('div', null, muted('RAM'), hw?.memoryGb != null ? `${hw.memoryGb} GB (free ${hw.memoryFreeGb ?? '?'} GB)` : '—'),
          React.createElement('div', null, muted('VRAM'), hw?.vramGb != null ? `${hw.vramGb} GB` : '—'),
          React.createElement('div', null, muted('GGUF'), hw?.runtime.gguf || '?'),
          React.createElement('div', null, muted('Ollama'), `${hw?.runtime.ollama || '?'}${hw?.runtime.ollamaVersion ? ` · ${hw.runtime.ollamaVersion}` : ''}`),
          React.createElement('div', null, muted('Inspected'), hw?.inspectedAt || '—'),
        ),
        muted((hw?.notes || []).join(' · ') || t('plaza.hwUnknown')),
        muted(`${hw?.realOs ? t('plaza.realLabel') : t('plaza.simLabel')} OS · ${hw?.realGpu ? t('plaza.realLabel') : 'unknown'} GPU`),
      )),
      panel(React.createElement(React.Fragment, null,
        React.createElement('strong', null, t('plaza.ggufPrepTitle')),
        muted(t('plaza.prepareHint')),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 } },
          btn(t('plaza.plan'), () => { void (async () => {
            const res = await run<ModelHubEnvelope & { steps?: { title: string; size: string; location: string }[]; note?: string }>('environment/plan')
            if (res?.steps) {
              setPlanText(res.steps.map(s => `${s.title} · ${s.size} · ${s.location}`).join('\n') + (res.note ? `\n${res.note}` : ''))
              say(t('plaza.plan'))
            }
          })() }),
          btn(t('plaza.prepare'), () => { void (async () => {
            const res = await run<ModelHubEnvelope & { task?: TaskSnapshot }>('environment/prepare', { confirm: 'yes' })
            if (res?.task) {
              setPrepTask(res.task)
              say(res.task.detail || res.task.phase)
            }
          })() }, true, loading),
          btn(t('plaza.ollamaStart'), () => { void (async () => {
            const res = await run<ModelHubEnvelope & { runtime?: EnvironmentInspect['runtime']; task?: TaskSnapshot }>('environment/start', { runtime: 'ollama' })
            if (res?.runtime) {
              setHw(prev => prev ? { ...prev, runtime: res.runtime! } : prev)
              say(res.task?.detail || `Ollama: ${res.runtime.ollama}`)
            }
          })() }, false, loading),
        ),
        planText ? React.createElement('pre', {
          style: { whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(39,93,212,.08)' },
        }, planText) : null,
        prepTask ? React.createElement('div', { style: { marginTop: 12 } },
          badge(prepTask.phase),
          React.createElement('progress', { value: prepTask.percent, max: 100, style: { width: '100%', margin: '8px 0' } }),
          muted(`${prepTask.percent}% · ${prepTask.detail || ''} · ${prepTask.phase === 'unavailable' ? t('plaza.unavailable') : t('plaza.realLabel')}`),
          prepTask.stages ? React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 12 } },
            prepTask.stages.map(s => badge(`${s.done ? '✓ ' : ''}${s.title}`, s.done)),
          ) : null,
        ) : null,
      )),
      panel(React.createElement(React.Fragment, null,
        React.createElement('strong', null, t('plaza.scanRoots')),
        muted(t('plaza.scanHint')),
        React.createElement('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 13 } },
          React.createElement('label', null,
            React.createElement('input', { type: 'checkbox', checked: diskC, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDiskC(e.target.checked) }),
            ' C:',
          ),
          React.createElement('label', null,
            React.createElement('input', { type: 'checkbox', checked: diskD, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDiskD(e.target.checked) }),
            ' D:',
          ),
          React.createElement('label', null,
            React.createElement('input', { type: 'checkbox', checked: diskE, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDiskE(e.target.checked) }),
            ' E:',
          ),
        ),
        React.createElement('input', {
          placeholder: t('plaza.extraRootPlaceholder'),
          value: extraRoot,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setExtraRoot(e.target.value),
          style: { display: 'block', width: '100%', marginTop: 8, padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(15,23,42,.16)', font: 'inherit', boxSizing: 'border-box' },
        }),
        React.createElement('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 } },
          React.createElement('input', {
            type: 'checkbox', checked: autoRegister,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setAutoRegister(e.target.checked),
          }),
          t('plaza.autoRegister'),
        ),
        React.createElement('div', { style: { marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' } },
          btn(t('plaza.scan'), () => { void doScan() }, true, loading || scanTask?.phase === 'scanning'),
          scanTask?.phase === 'scanning'
            ? btn(t('plaza.scanCancel'), () => { void run('scan/cancel', { taskId: scanTask.taskId }) })
            : null,
        ),
        scanTask ? React.createElement('div', { style: { marginTop: 12 } },
          badge(scanTask.phase),
          React.createElement('progress', { value: scanTask.percent, max: 100, style: { width: '100%', margin: '8px 0' } }),
          muted(`${scanTask.percent}% · ${scanTask.detail || ''}`),
        ) : null,
      )),
    )
  }

  return React.createElement('div', {
    'data-xyai-model-plaza': '',
    style: {
      padding: '8px 24px 32px',
      width: '100%',
      maxWidth: 960,
      margin: '0 auto',
      boxSizing: 'border-box',
      color: 'var(--dsw-alias-label-primary, #0f172a)',
    },
  },
    header,
    hwBar,
    tabNav,
    status,
    loading ? muted(t('plaza.loading')) : null,
    body,
    React.createElement('footer', { style: { marginTop: 20, paddingTop: 12, borderTop: '1px solid rgba(15,23,42,.12)', fontSize: 12, opacity: 0.7 } },
      t('plaza.notConnected'),
    ),
  )
}
