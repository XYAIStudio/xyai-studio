/** Pure composer helpers shared by the additive UI and its tests. */

/** One reusable phrase inserted into the input draft. */
export interface Snippet {
  [key: string]: string
  label: string
  text: string
}

/** Durable composer settings. */
export interface ComposerSettings {
  snippets: Snippet[]
}

/** Value used until Host settings arrive. */
export const defaultComposerSettings: ComposerSettings = { snippets: [] }

/** Host schema ceiling for stored phrases. */
export const SNIPPET_LIMIT = 50
/** Host schema ceiling for a phrase name. */
export const LABEL_MAX = 40
/** Host schema ceiling for phrase content. */
export const TEXT_MAX = 2000

interface SpeechResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: { readonly transcript: string }
}
interface SpeechEvent {
  readonly resultIndex: number
  readonly results: { readonly length: number; readonly [index: number]: SpeechResult }
}

/** Browser speech-recognition constructor used by the review panel. */
export interface SpeechRecognizer {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { readonly error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

/** Constructor installed by Chromium as `SpeechRecognition` or `webkitSpeechRecognition`. */
export type SpeechConstructor = new () => SpeechRecognizer

/** Resolve native browser speech recognition when available.
 * @returns The browser constructor, or undefined when unsupported.
 */
export function speechRecognitionConstructor(): SpeechConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechConstructor
    webkitSpeechRecognition?: SpeechConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

/** Append reviewed content without destroying the current draft.
 * @param draft - Current DSH draft.
 * @param addition - Reviewed content to add.
 * @returns The combined draft.
 */
export function appendToDraft(draft: string, addition: string): string {
  const value = addition.trim()
  if (!value) return draft
  if (!draft) return value
  return draft + (/\s$/u.test(draft) ? '' : '\n') + value
}

/** Case-insensitive substring match used by the capability search field.
 * @param query - User filter text.
 * @param parts - Localized labels and phrase bodies to search.
 * @returns Whether any part contains the trimmed query.
 */
export function matchesQuery(query: string, ...parts: string[]): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return parts.some(part => part.toLowerCase().includes(needle))
}

/** Classify a Web Speech error code into a review-panel outcome.
 * @param code - `SpeechRecognitionErrorEvent.error`.
 * @returns `denied` for microphone permission failures, otherwise `failed`.
 */
export function classifySpeechError(code: string): 'denied' | 'failed' {
  return code === 'not-allowed' || code === 'service-not-allowed' ? 'denied' : 'failed'
}

/** Format a recording clock as `mm:ss`.
 * @param seconds - Elapsed whole seconds.
 * @returns Zero-padded clock text.
 */
export function formatClock(seconds: number): string {
  const bounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(bounded / 60)
  const rest = bounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Validate a phrase before a Host mutation.
 * @param label - Edited name.
 * @param text - Edited body.
 * @param existing - Current durable list.
 * @param editingIndex - Index being replaced, or undefined when adding.
 * @returns A rejection code, or `ok`.
 */
export function validateSnippet(
  label: string,
  text: string,
  existing: readonly Snippet[],
  editingIndex?: number,
): 'ok' | 'empty' | 'duplicate' | 'full' {
  const name = label.trim()
  const body = text.trim()
  if (!name || !body) return 'empty'
  if (existing.some((snippet, index) => index !== editingIndex && snippet.label === name)) return 'duplicate'
  if (editingIndex === undefined && existing.length >= SNIPPET_LIMIT) return 'full'
  return 'ok'
}

/** Collect final and interim transcripts from one recognition event.
 * @param event - Browser speech result event.
 * @returns Confirmed text and the current interim tail.
 */
export function foldSpeechEvent(event: SpeechEvent): { confirmed: string; pending: string } {
  let confirmed = ''
  let pending = ''
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index]
    if (result === undefined || result.length === 0) continue
    const value = result[0]?.transcript ?? ''
    if (result.isFinal) confirmed += value
    else pending += value
  }
  return { confirmed, pending }
}
