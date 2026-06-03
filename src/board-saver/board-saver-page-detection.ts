/** Page type classification for Board Saver (pure logic). */

import type { PageType } from './board-saver-scan-state'

export type PageClassificationInput = {
  domChangeCount: number
  scrollHeight: number
  viewportHeight: number
}

/** Classify page after the 2s detection window. */
export function classifyPageType(input: PageClassificationInput): Exclude<PageType, 'unknown'> {
  const ratio = input.scrollHeight / Math.max(input.viewportHeight, 1)
  if (input.domChangeCount < 3 && ratio < 1.3) return 'static'
  if (input.domChangeCount < 3 && ratio >= 1.3) return 'lazy'
  return 'waterfall'
}

/** True when a newly added DOM node looks like media content. */
export function isMediaDomNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false
  if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'PICTURE') return true
  return node.querySelector('img, video, picture') !== null
}
