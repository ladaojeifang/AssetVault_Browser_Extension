/** Throttled window scroll listener for Board Saver rescan while panel is open. */

export function startBoardSaverScrollWatch(onScroll: () => void): () => void {
  let scheduled = false
  const onWindowScroll = (): void => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      onScroll()
    })
  }
  window.addEventListener('scroll', onWindowScroll, { passive: true })
  return () => window.removeEventListener('scroll', onWindowScroll)
}
