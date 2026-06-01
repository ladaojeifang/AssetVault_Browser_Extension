import type { ExtensionPreferences } from './types'

export const DEFAULT_PREFS: ExtensionPreferences = {
  apiBaseUrl: 'http://127.0.0.1:41596/api/v1',
  token: '',
  defaultFolderId: '',
  duplicatePolicy: 'use_existing',
  enableDragSaver: true
}

const STORAGE_KEY = 'assetvaultExtensionPrefs'

export async function getPreferences(): Promise<ExtensionPreferences> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY)
  const raw = stored[STORAGE_KEY] as Partial<ExtensionPreferences> | undefined
  return { ...DEFAULT_PREFS, ...raw }
}

export async function setPreferences(patch: Partial<ExtensionPreferences>): Promise<ExtensionPreferences> {
  const next = { ...(await getPreferences()), ...patch }
  await chrome.storage.sync.set({ [STORAGE_KEY]: next })
  return next
}

export function apiUrl(prefs: ExtensionPreferences, path: string): string {
  const base = prefs.apiBaseUrl.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
