/** Brand editor and brand slots over one Host settings scope. */
import { useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BRAND_FIELDS, defaultBrand, MAX_ICP_LENGTH, MAX_LOGO_DATAURL, MAX_SITES_LENGTH, type Brand } from '../brand.ts'
import { en, zh, type XyaiBrandKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { xyaiBrand: XyaiBrandKey }
}
export const inject = ['slots', 'locale', 'settingsScope', 'theme']

const setOps = (brand: Brand) => BRAND_FIELDS.map(field => ({ op: 'set' as const, path: [field], value: brand[field] }))
const unsetOps = BRAND_FIELDS.map(field => ({ op: 'unset' as const, path: [field] }))


const MAX_LOGO_SOURCE_BYTES = 5 * 1024 * 1024
const LOGO_MAX_EDGE = 320

/** Encode a user-picked image into a data URL that fits MAX_LOGO_DATAURL (resize/compress as needed). */
async function encodeLogoDataUrl(file: File): Promise<string | null> {
  if (file.type === 'image/svg+xml') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    return dataUrl.length > 0 && dataUrl.length <= MAX_LOGO_DATAURL ? dataUrl : null
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }

  try {
    const tryEncode = (edge: number, mime: string, quality?: number): string => {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height, 1))
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''
      ctx.drawImage(bitmap, 0, 0, w, h)
      return quality === undefined ? canvas.toDataURL(mime) : canvas.toDataURL(mime, quality)
    }

    for (const edge of [LOGO_MAX_EDGE, 256, 192, 128, 96]) {
      const png = tryEncode(edge, 'image/png')
      if (png && png.length <= MAX_LOGO_DATAURL) return png
      for (let q = 0.92; q >= 0.45; q -= 0.08) {
        const jpg = tryEncode(edge, 'image/jpeg', q)
        if (jpg && jpg.length <= MAX_LOGO_DATAURL) return jpg
      }
    }
    return null
  } finally {
    bitmap.close()
  }
}


/** Brand mark: the logo image when configured, otherwise the gradient initials chip. */
function BrandMark({ brand, size }: { brand: Brand; size: number }) {
  if (brand.logo) {
    return <img src={brand.logo} alt={brand.name} style={{ height: size * 0.6, maxWidth: size * 2, objectFit: 'contain' }} />
  }
  return (
    <span aria-label={brand.name} style={{
      background: `linear-gradient(135deg, ${brand.gradientFrom}, ${brand.gradientTo})`,
      color: '#fff', borderRadius: 4, padding: '0 0.35em', fontWeight: 700, fontSize: size * 0.55,
    }}>{brand.initials}</span>
  )
}

/** MIIT filing lookup target for every ICP number rendered as a link. */
const ICP_BEIAN_URL = 'https://beian.miit.gov.cn/'

/** The ICP filing number as a clickable legal line; empty renders nothing. */
function BrandIcpLink({ brand }: { brand: Brand }) {
  if (!brand.icp) return null
  return (
    <a href={ICP_BEIAN_URL} target="_blank" rel="noreferrer" title={brand.icp}
      style={{ fontSize: 11, opacity: 0.72, textDecoration: 'none', color: 'inherit' }}>
      {brand.icp}
    </a>
  )
}

/** Split a comma-separated ecosystem-sites value into http(s) links. */
function siteLinks(site: string): string[] {
  return site.split(/[,，\s]+/).map(part => part.trim()).filter(part => /^https?:\/\//i.test(part))
}

/** Install durable brand editing and reversible theme overrides.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('xyaiBrand', { zh, en }), 'xyai-brand: locale')

  ctx.effect(() => {
    const tagId = 'xyai-brand-settings-layout'
    if (typeof document === 'undefined') return () => {}
    let tag = document.querySelector<HTMLStyleElement>('style[data-plugin-css=' + JSON.stringify(tagId) + ']')
    if (!tag) {
      tag = document.createElement('style')
      tag.dataset.plugin = '@xyai/dsh-brand-pack'
      tag.dataset.pluginCss = tagId
      tag.textContent = [
        '[data-xyai-brand-settings]{display:flex;flex-direction:column;gap:16px;max-width:720px;color:var(--dsw-alias-label-primary,#0f172a)}',
        '[data-xyai-brand-settings] h3{margin:0;font-size:16px;line-height:24px;font-weight:500}',
        '[data-xyai-brand-settings] .xyai-brand-card{border:0.5px solid var(--dsw-alias-border-l4,rgba(15,23,42,.12));border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:14px;background:var(--dsw-alias-bg-layer-1,transparent)}',
        '[data-xyai-brand-settings] .xyai-brand-card-title{margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary,#64748b);letter-spacing:.02em}',
        '[data-xyai-brand-settings] .xyai-brand-field{display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:22px}',
        '[data-xyai-brand-settings] .xyai-brand-field > span{color:var(--dsw-alias-label-primary,#0f172a)}',
        '[data-xyai-brand-settings] .xyai-brand-field input[type=text],',
        '[data-xyai-brand-settings] .xyai-brand-field input:not([type]),',
        '[data-xyai-brand-settings] .xyai-brand-field input[type=search],',
        '[data-xyai-brand-settings] .xyai-brand-field input[maxLength],',
        '[data-xyai-brand-settings] .xyai-brand-field textarea{box-sizing:border-box;width:100%;min-height:40px;padding:8px 12px;border:0.5px solid var(--dsw-alias-border-l3,rgba(15,23,42,.16));border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit}',
        '[data-xyai-brand-settings] .xyai-brand-field textarea{min-height:72px;resize:vertical}',
        '[data-xyai-brand-settings] .xyai-brand-field input[type=color]{width:40px;height:40px;padding:4px;border:0.5px solid var(--dsw-alias-border-l3,rgba(15,23,42,.16));border-radius:12px;background:transparent;cursor:pointer}',
        '[data-xyai-brand-settings] .xyai-brand-field small{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#94a3b8)}',
        '[data-xyai-brand-settings] .xyai-brand-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}',
        '[data-xyai-brand-settings] .xyai-brand-swatches{display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px}',
        '[data-xyai-brand-settings] .xyai-brand-swatch{display:flex;flex-direction:column;gap:6px;align-items:flex-start}',
        '[data-xyai-brand-settings] .xyai-brand-swatch > span{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,#0f172a)}',
        '[data-xyai-brand-settings] .xyai-brand-swatch input[type=color]{width:40px;height:40px;padding:4px;border:0.5px solid var(--dsw-alias-border-l3,rgba(15,23,42,.16));border-radius:12px;background:transparent;cursor:pointer}',
        '[data-xyai-brand-settings] .xyai-brand-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}',
        '[data-xyai-brand-settings] .xyai-brand-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border:none;border-radius:18px;font:inherit;font-size:14px;line-height:22px;cursor:pointer}',
        '[data-xyai-brand-settings] .xyai-brand-btn-primary{background:var(--dsw-alias-button-primary-fill,#1565c0);color:var(--dsw-alias-label-primary-foreground,#fff)}',
        '[data-xyai-brand-settings] .xyai-brand-btn-primary:disabled{opacity:.45;cursor:not-allowed}',
        '[data-xyai-brand-settings] .xyai-brand-btn-secondary{border:0.5px solid var(--dsw-alias-border-l3,rgba(15,23,42,.16));background:transparent;color:var(--dsw-alias-label-primary,#0f172a)}',
        '[data-xyai-brand-settings] .xyai-brand-preview{display:flex;flex-direction:column;gap:8px}',
        '[data-xyai-brand-settings] .xyai-brand-preview a{color:var(--dsw-alias-label-primary,#1565c0);font-size:13px}',
        '[data-xyai-brand-settings] [role=alert],[role=status]{margin:0;font-size:12px;line-height:18px}',
      ].join('')
      document.head.appendChild(tag)
    }
    return () => { tag?.remove() }
  }, 'xyai-brand: settings layout css')

  const scope = ctx.settingsScope.bind<Brand>({ namespace: 'xyai-brand' })
  const face = () => ({ hooks: { brand: scope } })
  ctx.effect(() => {
    let disposeTheme: (() => void) | undefined
    const update = () => {
      const brand = scope.getSnapshot().value ?? defaultBrand
      disposeTheme?.()
      disposeTheme = ctx.theme.overrideTokens('xyai-brand', {
        '--dsw-alias-brand-primary': { light: brand.accent, dark: brand.accent },
        '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: brand.accent, dark: brand.accent },
        ...(brand.text
          ? { '--dsw-alias-label-primary': { light: brand.text, dark: brand.text } }
          : {}),
      })
    }
    const unsubscribe = scope.subscribe(update)
    update()
    return () => { unsubscribe(); disposeTheme?.() }
  }, 'xyai-brand: theme layer')
  // Project brand.name into the browser title. ui-layout DocumentTitle uses
  // DSH_CLIENT_TITLE (often still "DeepSeek Harness"); this overlay keeps the
  // visible product chrome aligned with the brand-pack settings snapshot.
  ctx.effect(() => {
    const previous = typeof document !== 'undefined' ? document.title : ''
    const update = () => {
      const brand = scope.getSnapshot().value ?? defaultBrand
      if (typeof document !== 'undefined' && brand.name) document.title = brand.name
    }
    const unsubscribe = scope.subscribe(update)
    update()
    return () => {
      unsubscribe()
      if (typeof document !== 'undefined') document.title = previous
    }
  }, 'xyai-brand: document title')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    // Deployment-management surface: writability follows the Host settings
    // scope (snapshot.writable), and per-tenant provisioning is the
    // xyai-tenancy seam rather than a local concern.
    name: 'settings.section', id: 'xyai-brand', label: () => ctx.locale.bind('xyaiBrand')('brand.page'),
    order: 100, locale: 'xyaiBrand',
    inject: () => ({ ...face(), save: (brand: Brand) => scope.mutate(setOps({
      ...brand, name: brand.name.trim(), initials: brand.initials.trim(),
    })), reset: () => scope.mutate(unsetOps) }),
  }, function BrandEditor(props) {
    const snapshot = props.useBrand(s => s)
    const saved = snapshot.value ?? defaultBrand
    const [draft, setDraft] = useState<Brand | null>(null)
    const [result, setResult] = useState<'saved' | 'error' | null>(null)
    const [logoError, setLogoError] = useState(false)
    const [pending, setPending] = useState(false)
    const logoInputRef = useRef<HTMLInputElement>(null)
    const value = draft ?? saved
    const edit = (field: keyof Brand, text: string) => { setDraft({ ...value, [field]: text }); setResult(null) }
    const failLogo = () => {
      setLogoError(true)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
    const pickLogo = (file: File | undefined) => {
      setLogoError(false)
      if (!file) return
      if (!file.type.startsWith('image/') || file.size > MAX_LOGO_SOURCE_BYTES) {
        failLogo()
        return
      }
      void (async () => {
        try {
          const dataUrl = await encodeLogoDataUrl(file)
          if (!dataUrl) { failLogo(); return }
          edit('logo', dataUrl)
          setLogoError(false)
        } catch {
          failLogo()
        }
      })()
    }
    const commit = async (reset: boolean) => {
      setPending(true); setResult(null)
      try {
        if (reset) await props.reset()
        else await props.save({ ...value, name: value.name.trim(), initials: value.initials.trim() })
        setDraft(null); setLogoError(false); setResult('saved')
      } catch { setResult('error') }
      finally { setPending(false) }
    }
    const disabled = pending || !snapshot.writable
    return <form data-xyai-brand-settings onSubmit={e => { e.preventDefault(); void commit(false) }}>
      <h3>{props.t('brand.page')}</h3>

      <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="xyai-brand-card">
          <p className="xyai-brand-card-title">{props.t('brand.name')} / {props.t('brand.initials')}</p>
          <label className="xyai-brand-field"><span>{props.t('brand.name')}</span>
            <input required maxLength={80} value={value.name} onChange={e => edit('name', e.target.value)} />
          </label>
          <label className="xyai-brand-field"><span>{props.t('brand.initials')}</span>
            <input required maxLength={4} value={value.initials} onChange={e => edit('initials', e.target.value)} />
          </label>
          <label className="xyai-brand-field"><span>{props.t('brand.logo')}</span>
            <div className="xyai-brand-row">
              <input ref={logoInputRef} type="file" accept="image/*" onChange={e => pickLogo(e.target.files?.[0])} />
              {value.logo && <img src={value.logo} alt={props.t('brand.logo')} style={{ height: 40, borderRadius: 8 }} />}
              {value.logo && <button type="button" className="xyai-brand-btn xyai-brand-btn-secondary" onClick={() => edit('logo', '')}>{props.t('brand.logoClear')}</button>}
            </div>
          </label>
          {logoError && <p role="alert">{props.t('brand.logoError')}</p>}
        </section>

        <section className="xyai-brand-card">
          <p className="xyai-brand-card-title">{props.t('brand.accent')}</p>
          <div className="xyai-brand-swatches">
            <label className="xyai-brand-swatch"><span>{props.t('brand.accent')}</span>
              <input type="color" value={value.accent} onChange={e => edit('accent', e.target.value)} />
            </label>
            <label className="xyai-brand-swatch"><span>{props.t('brand.text')}</span>
              <input type="color" value={value.text || '#000000'} onChange={e => edit('text', e.target.value)} />
            </label>
            <label className="xyai-brand-swatch"><span>{props.t('brand.gradientFrom')}</span>
              <input type="color" value={value.gradientFrom} onChange={e => edit('gradientFrom', e.target.value)} />
            </label>
            <label className="xyai-brand-swatch"><span>{props.t('brand.gradientTo')}</span>
              <input type="color" value={value.gradientTo} onChange={e => edit('gradientTo', e.target.value)} />
            </label>
          </div>
          {value.text !== '' && (
            <div className="xyai-brand-row">
              <button type="button" className="xyai-brand-btn xyai-brand-btn-secondary" onClick={() => edit('text', '')}>{props.t('brand.textClear')}</button>
            </div>
          )}
          <small>{props.t('brand.textHint')}</small>
        </section>

        <section className="xyai-brand-card">
          <p className="xyai-brand-card-title">{props.t('brand.vision')}</p>
          <label className="xyai-brand-field" aria-label={props.t('brand.vision')}>
            <textarea rows={3} maxLength={200} aria-label={props.t('brand.vision')} value={value.vision} onChange={e => edit('vision', e.target.value)} />
          </label>
          <label className="xyai-brand-field"><span>{props.t('brand.site')}</span>
            <input maxLength={MAX_SITES_LENGTH} placeholder={props.t('brand.sitePlaceholder')} value={value.site} onChange={e => edit('site', e.target.value)} />
          </label>
          <label className="xyai-brand-field"><span>{props.t('brand.icp')}</span>
            <input maxLength={MAX_ICP_LENGTH} placeholder={props.t('brand.icpPlaceholder')} value={value.icp} onChange={e => edit('icp', e.target.value)} />
          </label>
        </section>

        <section className="xyai-brand-card" aria-label={props.t('brand.preview')}>
          <p className="xyai-brand-card-title">{props.t('brand.preview')}</p>
          <div className="xyai-brand-preview">
            <span className="xyai-brand-row">
              <BrandMark brand={value} size={36} /> <b style={{ color: value.accent, fontSize: 16 }}>{value.name}</b>
            </span>
            {value.vision && <small>{value.vision}</small>}
            {siteLinks(value.site).map(url => (
              <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>
            ))}
            <BrandIcpLink brand={value} />
          </div>
        </section>

        <div className="xyai-brand-actions">
          <button type="submit" className="xyai-brand-btn xyai-brand-btn-primary" disabled={!value.name.trim() || !value.initials.trim()}>{props.t('brand.save')}</button>
          <button type="button" className="xyai-brand-btn xyai-brand-btn-secondary" onClick={() => { setDraft(null); setResult(null); setLogoError(false) }}>{props.t('brand.cancel')}</button>
          <button type="button" className="xyai-brand-btn xyai-brand-btn-secondary" onClick={() => { void commit(true) }}>{props.t('brand.reset')}</button>
        </div>
      </fieldset>

      {!snapshot.writable && <p role="status">{props.t(snapshot.status === 'loading' ? 'brand.loading' : 'brand.unavailable')}</p>}
      {result && <p role={result === 'error' ? 'alert' : 'status'}>{props.t(result === 'error' ? 'brand.error' : 'brand.saved')}</p>}
    </form>
  }))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name', inject: face,
  }, props => <span>{props.useBrand(s => s.value?.name ?? defaultBrand.name)}</span>))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark', inject: face,
  }, props => {
    const brand = props.useBrand(s => s.value ?? defaultBrand)
    return <BrandMark brand={brand} size={props.size} />
  }))
  ctx.effect(() => {
    const tagId = 'xyai-brand-hero-layout'
    if (typeof document === 'undefined') return () => {}
    let tag = document.querySelector<HTMLStyleElement>('style[data-plugin-css=' + JSON.stringify(tagId) + ']')
    if (!tag) {
      tag = document.createElement('style')
      tag.dataset.plugin = '@xyai/dsh-brand-pack'
      tag.dataset.pluginCss = tagId
      tag.textContent = [
        /* Escape DSH HeroShell 34px mark column so welcome can lay out horizontally. */
        '.pXSMma_headline:has([data-xyai-hero-welcome]){display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-width:0;grid-template-columns:unset;column-gap:0;position:relative}',
        '.pXSMma_headline:has([data-xyai-hero-welcome]) .pXSMma_fishHitbox{display:flex;width:100%;min-width:0;max-width:100%;justify-content:center;align-items:center}',
        '.pXSMma_headline:has([data-xyai-hero-welcome]) .pXSMma_headlineText,',
        '.pXSMma_headline:has([data-xyai-hero-welcome]) .pXSMma_previewBadge{display:none!important}',
        '[data-xyai-hero-welcome]{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;min-width:280px;max-width:640px;margin:0 auto;padding:4px 16px 8px;box-sizing:border-box;text-align:center;writing-mode:horizontal-tb;white-space:normal;word-break:normal;overflow-wrap:break-word}',
        '[data-xyai-hero-welcome] [data-xyai-hero-kicker]{font-size:12px;letter-spacing:0.12em;opacity:0.75;white-space:nowrap}',
        '[data-xyai-hero-welcome] [data-xyai-hero-title]{font-size:22px;line-height:1.3;font-weight:800}',
        '[data-xyai-hero-welcome] [data-xyai-hero-slogan]{display:block;font-size:13.5px;line-height:1.8;opacity:0.85;max-width:560px;white-space:normal;word-break:normal}',
      ].join('')
      document.head.appendChild(tag)
    }
    return () => { tag?.remove() }
  }, 'xyai-brand: hero layout css')
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', inject: face,
  }, props => {
    const brand = props.useBrand(s => s.value ?? defaultBrand)
    return (
      <span data-xyai-hero-welcome title={brand.vision || brand.name}>
        <BrandMark brand={brand} size={120} />
        <span data-xyai-hero-kicker style={{ color: brand.accent }}>桌面开发工作台</span>
        <strong data-xyai-hero-title style={{ color: brand.accent }}>{brand.name}</strong>
        {brand.vision
          ? <small data-xyai-hero-slogan>{brand.vision}</small>
          : null}
        <BrandIcpLink brand={brand} />
      </span>
    )
  }))
}
