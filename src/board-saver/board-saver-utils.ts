/** Domain helper for Board Saver items. */

export function extractBoardSaverDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function createBoardSaverId(counter: { value: number }): string {
  counter.value += 1
  return `bs-${counter.value}-${Date.now()}`
}
