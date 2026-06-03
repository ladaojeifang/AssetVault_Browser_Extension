/** Click-to-save any page image while Board Saver panel is open. */

import { enlargeImageUrl } from '../shared/url-enlarger'

export type QuickSaveOptions = {
  overlayRootId: string
  onToast: (text: string) => void
}

export function extractMediaUrlFromElement(el: HTMLElement): string {
  if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) {
    return el.currentSrc || el.src
  }
  const bg = getComputedStyle(el).backgroundImage
  const m = bg?.match(/url\(["']?([^"')]+)["']?\)/)
  return m?.[1] ?? ''
}

export function resolveQuickSaveTarget(eventTarget: HTMLElement): HTMLElement | null {
  if (eventTarget.tagName === 'IMG' || eventTarget.tagName === 'VIDEO') {
    return eventTarget
  }
  const closest = eventTarget.closest('img, video, [style*="background-image"]')
  return closest instanceof HTMLElement ? closest : null
}

export async function importQuickSaveMedia(
  url: string,
  mediaEl: HTMLElement,
  pageUrl: string,
  pageTitle: string,
): Promise<boolean> {
  let saveUrl = url
  if (mediaEl instanceof HTMLImageElement) {
    try {
      saveUrl = await enlargeImageUrl(url)
    } catch {
      /* keep preview URL */
    }
  }
  const resp = await chrome.runtime.sendMessage({
    type: 'IMPORT_META',
    meta: { url: saveUrl, pageUrl, pageTitle },
  })
  return Boolean((resp as { ok?: boolean })?.ok)
}

export function createQuickSaveClickHandler(options: QuickSaveOptions): (e: MouseEvent) => void {
  return (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest(`#${options.overlayRootId}`)) return

    const mediaEl = resolveQuickSaveTarget(target)
    if (!mediaEl) return

    const url = extractMediaUrlFromElement(mediaEl)
    if (!url || !/^https?:\/\//.test(url)) return

    e.preventDefault()
    e.stopPropagation()
    void (async () => {
      options.onToast('保存中…')
      try {
        const ok = await importQuickSaveMedia(url, mediaEl, location.href, document.title)
        options.onToast(ok ? '已保存' : '保存失败')
      } catch {
        options.onToast('保存失败')
      }
    })()
  }
}

export function updateQuickSaveButton(active: boolean): void {
  const btn = document.getElementById('bs-quick-save')
  if (!btn) return
  btn.textContent = active ? '⚡快采✓' : '⚡快采'
  btn.classList.toggle('active', active)
}
