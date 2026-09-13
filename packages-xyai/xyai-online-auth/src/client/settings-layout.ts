/** Shared XYAI settings card/capsule layout (matches brand-pack / DSH tokens). */
export const XYAI_SETTINGS_CSS_ID = 'xyai-settings-layout'

export const XYAI_SETTINGS_CSS = [

        '[data-xyai-settings]{display:flex;flex-direction:column;gap:16px;max-width:720px;color:var(--dsw-alias-label-primary,#0f172a)}',
        '[data-xyai-settings] h3{margin:0;font-size:16px;line-height:24px;font-weight:500}',
        '[data-xyai-settings] .xyai-settings-card{border:0.5px solid var(--dsw-alias-border-l4,rgba(15,23,42,.12));border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:14px;background:var(--dsw-alias-bg-layer-1,transparent)}',
        '[data-xyai-settings] .xyai-settings-card-title{margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary,#64748b);letter-spacing:.02em}',
        '[data-xyai-settings] .xyai-settings-field{display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:22px}',
        '[data-xyai-settings] .xyai-settings-field > span{color:var(--dsw-alias-label-primary,#0f172a)}',
        '[data-xyai-settings] .xyai-settings-field input[type=text],',
        '[data-xyai-settings] .xyai-settings-field input:not([type]),',
        '[data-xyai-settings] .xyai-settings-field input[type=search],',
        '[data-xyai-settings] .xyai-settings-field input[maxLength],',
        '[data-xyai-settings] .xyai-settings-field input[type=password],',
        '[data-xyai-settings] .xyai-settings-field input[type=number],',
        '[data-xyai-settings] .xyai-settings-field input[type=date],',
        '[data-xyai-settings] .xyai-settings-field input[type=url],',
        '[data-xyai-settings] .xyai-settings-field select,',
        '[data-xyai-settings] .xyai-settings-field textarea{box-sizing:border-box;width:100%;min-height:40px;padding:8px 12px;border:0.5px solid var(--dsw-alias-border-l3,rgba(15,23,42,.16));border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit}',
        '[data-xyai-settings] .xyai-settings-field textarea{min-height:72px;resize:vertical}',
        '[data-xyai-settings] .xyai-settings-field input[type=color]{width:40px;height:40px;padding:4px;border:0.5px solid var(--dsw-alias-border-l3,rgba(15,23,42,.16));border-radius:12px;background:transparent;cursor:pointer}',
        '[data-xyai-settings] .xyai-settings-field small{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#94a3b8)}',
        '[data-xyai-settings] .xyai-settings-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}',
        '[data-xyai-settings] .xyai-settings-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}',
        '[data-xyai-settings] .xyai-settings-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border:none;border-radius:18px;font:inherit;font-size:14px;line-height:22px;cursor:pointer}',
        '[data-xyai-settings] .xyai-settings-btn-primary{background:var(--dsw-alias-button-primary-fill,#1565c0);color:var(--dsw-alias-label-primary-foreground,#fff)}',
        '[data-xyai-settings] .xyai-settings-btn-primary:disabled{opacity:.45;cursor:not-allowed}',
        '[data-xyai-settings] .xyai-settings-btn-secondary{border:0.5px solid var(--dsw-alias-border-l3,rgba(15,23,42,.16));background:transparent;color:var(--dsw-alias-label-primary,#0f172a)}',
        '[data-xyai-settings] .xyai-settings-preview{display:flex;flex-direction:column;gap:8px}',
        '[data-xyai-settings] .xyai-settings-preview a{color:var(--dsw-alias-label-primary,#1565c0);font-size:13px}',
        '[data-xyai-settings] [role=alert],[role=status]{margin:0;font-size:12px;line-height:18px}',
        '[data-xyai-settings] fieldset{border:0;margin:0;padding:0;min-width:0}',
].join('')

export function injectXyaiSettingsCss(pluginId: string, tagId = XYAI_SETTINGS_CSS_ID + ':' + pluginId): () => void {
  if (typeof document === 'undefined') return () => {}
    let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') as HTMLStyleElement | null
    if (!tag) {
      tag = document.createElement('style')
      tag.dataset.plugin = pluginId
      tag.dataset.pluginCss = tagId
      tag.textContent = XYAI_SETTINGS_CSS
      document.head.appendChild(tag)
    }
    return () => { tag?.remove() }
}
