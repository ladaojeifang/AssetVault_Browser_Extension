/** Panel filter settings persisted in chrome.storage.local. */

export const BOARD_SAVER_SETTINGS_KEY = 'assetvaultBoardSaverSettings'

export type BoardSaverPanelSettings = {
  filterSize: string
  filterFormat: string
  filterDomain: string
  sortBySize: boolean
  hideLowQuality: boolean
}

export async function loadBoardSaverSettings(): Promise<BoardSaverPanelSettings | null> {
  const stored = await chrome.storage.local.get(BOARD_SAVER_SETTINGS_KEY)
  const s = stored[BOARD_SAVER_SETTINGS_KEY] as BoardSaverPanelSettings | undefined
  return s ?? null
}

export async function saveBoardSaverSettings(settings: BoardSaverPanelSettings): Promise<void> {
  await chrome.storage.local.set({ [BOARD_SAVER_SETTINGS_KEY]: settings })
}
