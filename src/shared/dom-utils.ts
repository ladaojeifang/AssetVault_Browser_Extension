/** DOM helpers for site adapters and content scripts. */

export function asHtmlElement(el: Element): HTMLElement | null {
  return el instanceof HTMLElement ? el : null
}

export function asHtmlImage(el: Element): HTMLImageElement | null {
  return el instanceof HTMLImageElement ? el : null
}

export function asHtmlVideo(el: Element): HTMLVideoElement | null {
  return el instanceof HTMLVideoElement ? el : null
}

/** Iterate img nodes from a selector (typed for strict TS). */
export function* queryImages(
  selector: string,
  root: ParentNode = document,
): Generator<HTMLImageElement> {
  for (const el of root.querySelectorAll<HTMLImageElement>(selector)) {
    yield el
  }
}

/** Lazy-load / srcset friendly image URL from an img element. */
export function imageUrlFromImg(img: HTMLImageElement): string {
  return (
    img.currentSrc ||
    img.src ||
    img.getAttribute('src') ||
    img.dataset.src ||
    img.dataset.original ||
    img.dataset.lazySrc ||
    img.dataset.originalSrc ||
    ''
  )
}

export function imageDimensions(img: HTMLImageElement): { width?: number; height?: number } {
  const width = img.naturalWidth || img.width || undefined
  const height = img.naturalHeight || img.height || undefined
  return { width: width || undefined, height: height || undefined }
}

/** Button-like element with data-* attributes in batch/board UI. */
export function datasetEl<T extends string>(btn: Element, key: string): T | undefined {
  const el = asHtmlElement(btn)
  if (!el) return undefined
  return (el.dataset as DOMStringMap)[key] as T | undefined
}
