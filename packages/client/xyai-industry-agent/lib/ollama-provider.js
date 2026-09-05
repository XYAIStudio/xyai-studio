/**
 * Migrated Ollama provider registration.
 *
 * It keeps the standard DSH model picker aligned with models already present
 * on this computer.  Only the local loopback Ollama API is queried; no token,
 * model file, or historical checkout path crosses this boundary.
 */
export const name = 'xyai-ollama-provider'
export const inject = ['settings']

const PROVIDER = 'xyai-ollama'
// `SettingsProvider` validates namespace strings at its public boundary.  The
// current DSH runtime exports the branded TypeScript type but no runtime
// `settingsNamespace()` helper, so importing that erased helper prevents the
// whole plugin tree from loading.
const SETTINGS = 'llm-pi-ai'
const ENDPOINT = 'http://127.0.0.1:11434'

function isVisionModel(id) { return /(?:vision|vl|llava|minicpm)/iu.test(id) }

async function installedModels() {
  try {
    const response = await fetch(`${ENDPOINT}/api/tags`, { signal: AbortSignal.timeout(3_000) })
    if (!response.ok) return []
    const payload = await response.json()
    if (!Array.isArray(payload?.models)) return []
    return payload.models.flatMap((entry) => typeof entry?.name === 'string' && entry.name.trim() !== ''
      ? [{ id: entry.name.trim(), name: entry.name.trim() }]
      : [])
  } catch { return [] }
}

export function apply(ctx) {
  let writing = false
  const synchronize = async () => {
    if (writing || ctx.settings.get(SETTINGS) === undefined) return
    writing = true
    try {
      const models = await installedModels()
      await ctx.settings.mutate(SETTINGS, models.length === 0
        ? [{ op: 'unset', path: ['providers', PROVIDER] }]
        : [{
            op: 'set', path: ['providers', PROVIDER], value: {
              displayName: 'Ollama（本机已部署）', api: 'openai-completions', baseURL: `${ENDPOINT}/v1`,
              models: models.map((model) => ({ id: model.id, name: model.name, input: isVisionModel(model.id) ? ['text', 'image'] : ['text'] })),
              defaultContextWindow: 8192, defaultMaxTokens: 1536,
            },
          }])
    } finally { writing = false }
  }
  ctx.effect(() => {
    void synchronize()
    const timer = setInterval(() => { void synchronize() }, 10_000)
    return () => clearInterval(timer)
  }, 'xyai-ollama-provider: synchronize local models')
}
