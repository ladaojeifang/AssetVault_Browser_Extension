/**
 * Anti-hotlinking fetch module — bypass referrer checks and download resources
 * that would normally be blocked by CORS / hotlink protection.
 */

export type BypassFetchOptions = {
  referer?: string
  timeout?: number
  signal?: AbortSignal
  headers?: Record<string, string>
  maxRetries?: number
}

const DEFAULT_TIMEOUT = 15_000
const DEFAULT_MAX_RETRIES = 2

/** Spoofed headers that mimic a normal browser request. */
function buildBypassHeaders(
  customHeaders: Record<string, string> | undefined,
  referer: string | undefined
): Record<string, string> {
  const base: Record<string, string> = {
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  }
  if (referer) {
    base.Referer = referer
  }
  return { ...base, ...customHeaders }
}

/**
 * Fetch with anti-hotlink measures:
 * - no-referrer policy
 * - browser-like accept headers
 * - optional referer spoofing
 * - abort + timeout control
 * - auto-retry on network errors and 403
 */
export async function bypassFetch(
  url: string,
  options?: BypassFetchOptions
): Promise<Response> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    let timerId: ReturnType<typeof setTimeout>

    // Merge signals: respect external abort + internal timeout
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    timerId = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        referrerPolicy: 'no-referrer',
        headers: buildBypassHeaders(options?.headers, options?.referer),
        signal: controller.signal
      })
      clearTimeout(timerId)

      // Only retry on network errors or explicit 403
      if (!res.ok && res.status !== 403) return res
      if (res.ok) return res

      // 403 → retry
      lastError = new Error(`HTTP ${res.status} Forbidden`)
    } catch (e) {
      clearTimeout(timerId)
      if (e instanceof Error && e.name === 'AbortError') throw e
      lastError = e instanceof Error ? e : new Error(String(e))
    }

    // Exponential backoff before retry
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, Math.min(300 * 2 ** attempt, 2000)))
    }
  }

  throw lastError ?? new Error('bypassFetch failed after retries')
}

/**
 * Fetch a resource and convert it to a data URL.
 * First tries normal fetch, falls back to bypassFetch on 403 / failure.
 */
export async function fetchAsDataUrl(
  url: string,
  options?: BypassFetchOptions
): Promise<string> {
  let res: Response

  try {
    res = await fetch(url, { signal: options?.signal })
    if (!res.ok || res.status === 403) {
      res = await bypassFetch(url, options)
    }
  } catch {
    res = await bypassFetch(url, options)
  }

  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Fetch with an explicit referer header for sites that require a specific origin.
 */
export async function fetchWithReferer(
  url: string,
  refererUrl: string,
  options?: Omit<BypassFetchOptions, 'referer'>
): Promise<Response> {
  return bypassFetch(url, { ...options, referer: refererUrl })
}
