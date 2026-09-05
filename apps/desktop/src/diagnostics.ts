/** Bounded diagnostics must not retain local session tokens or data-URL bodies. */
export function sanitizeDiagnosticUrl(raw: string): string {
  if (raw.startsWith('data:')) return '<data-url>'
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname}`
  } catch { return raw.slice(0, 240) }
}

export function redactDiagnosticText(raw: string, maximumLength = 240): string {
  return raw
    .replace(/([?&](?:token|api[_-]?key|authorization|secret)=)[^&\s]+/giu, '$1[redacted]')
    .replace(/(bearer\s+)[^\s]+/giu, '$1[redacted]')
    .slice(0, maximumLength)
}
