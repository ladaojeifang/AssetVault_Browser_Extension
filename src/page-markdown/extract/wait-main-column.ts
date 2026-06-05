import { wechatArticlePhotos } from './wechat-page-data'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Wait until main column has text + images (lazy themes / SPA). */
export async function waitForMainColumnReady(
  selectors: string[],
  options?: { minImages?: number; maxWaitMs?: number },
): Promise<void> {
  const minImages = options?.minImages ?? 2
  const maxWaitMs = options?.maxWaitMs ?? 10_000
  const stepMs = 280
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    if (location.href.includes('mp.weixin.qq.com') && wechatArticlePhotos().length >= minImages) {
      return
    }

    for (const sel of selectors) {
      const root = document.querySelector(sel)
      if (!(root instanceof HTMLElement)) continue
      const textLen = (root.textContent || '').trim().length
      const imgs = root.querySelectorAll(
        'img[src*="http"], img[data-src*="http"], a[href*="/wp-content/uploads/"] img',
      )
      if (textLen >= 200 && imgs.length >= minImages) return
    }

    await sleep(stepMs)
  }
}
