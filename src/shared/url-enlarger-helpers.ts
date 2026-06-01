/** Shared helpers for CDN URL enlargement (no third-party rule engines). */

export function stripQuery(url: string): string {
  const i = url.indexOf('?')
  return i >= 0 ? url.slice(0, i) : url
}

export function stripAfter(url: string, token: string): string {
  const i = url.indexOf(token)
  return i >= 0 ? url.slice(0, i) : url
}

/** Best-effort HEAD check (extension pages / SW with host permission). */
export async function headOk(url: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal })
    clearTimeout(t)
    return res.ok || res.status === 304 || res.status === 405
  } catch {
    return false
  }
}

/** Return first URL that responds to HEAD, else fallback. */
export async function pickFirstReachable(
  candidates: string[],
  fallback: string
): Promise<string> {
  for (const u of candidates) {
    if (u && u !== fallback && (await headOk(u))) return u
  }
  return fallback
}
