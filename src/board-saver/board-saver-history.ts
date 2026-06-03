/** Import history persisted in chrome.storage.local. */

export const BOARD_SAVER_HISTORY_KEY = 'assetvaultBoardSaverHistory'
export const BOARD_SAVER_HISTORY_MAX = 10

export type BoardSaverHistoryEntry = {
  pageUrl: string
  pageTitle: string
  count: number
  time: number
}

export async function readBoardSaverHistory(): Promise<BoardSaverHistoryEntry[]> {
  const stored = await chrome.storage.local.get(BOARD_SAVER_HISTORY_KEY)
  return (stored[BOARD_SAVER_HISTORY_KEY] as BoardSaverHistoryEntry[] | undefined) ?? []
}

export async function appendBoardSaverHistory(entry: BoardSaverHistoryEntry): Promise<void> {
  const entries = await readBoardSaverHistory()
  entries.unshift(entry)
  if (entries.length > BOARD_SAVER_HISTORY_MAX) entries.length = BOARD_SAVER_HISTORY_MAX
  await chrome.storage.local.set({ [BOARD_SAVER_HISTORY_KEY]: entries })
}

export async function clearBoardSaverHistory(): Promise<void> {
  await chrome.storage.local.remove(BOARD_SAVER_HISTORY_KEY)
}

export function renderBoardSaverHistoryPanel(entries: BoardSaverHistoryEntry[]): void {
  const section = document.getElementById('bs-history-section')
  const list = document.getElementById('bs-history-list')
  if (!list) return

  if (!entries.length) {
    if (section) section.style.display = 'none'
    list.innerHTML = ''
    return
  }

  if (section) section.style.display = ''
  list.innerHTML = ''
  for (const e of entries.slice(0, BOARD_SAVER_HISTORY_MAX)) {
    const row = document.createElement('div')
    row.className = 'bs-history-item'
    row.title = e.pageUrl
    const timeStr = new Date(e.time).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    row.innerHTML = `<span class="bs-history-title">${e.pageTitle.slice(0, 20)}</span><span class="bs-history-meta">${e.count}张 ${timeStr}</span>`
    row.addEventListener('click', () => {
      window.open(e.pageUrl, '_blank')
    })
    list.appendChild(row)
  }
}

export function hideBoardSaverHistoryPanel(): void {
  renderBoardSaverHistoryPanel([])
}
