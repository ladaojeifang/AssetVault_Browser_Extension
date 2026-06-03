import { getFolderTree } from '../shared/api'
import { getPreferences, setPreferences } from '../shared/config'
import { ensureHostPermissionForTab, HOST_PERMISSION_DENIED_MSG } from '../shared/host-permissions'
import { BATCH_DRAFT_KEY } from '../shared/messages'
import { injectableTabMessage, injectShotUI, resolveVideoCandidatesInTab } from '../shared/tab-messaging'
import type { FolderNode, MediaCandidate } from '../shared/types'

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

function flattenFolders(nodes: FolderNode[], depth = 0): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = []
  for (const n of nodes) {
    out.push({ id: n.id, label: `${'—'.repeat(depth)} ${n.name}`.trim() })
    if (n.children?.length) out.push(...flattenFolders(n.children, depth + 1))
  }
  return out
}

async function refreshStatus(): Promise<void> {
  const statusEl = el<HTMLParagraphElement>('status')
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'PING_API' })
    if (resp?.ok && resp.app) {
      statusEl.textContent = `已连接 · ${resp.app.name} ${resp.app.version}`
      statusEl.className = 'status ok'
    } else {
      throw new Error(resp?.error ?? '无法连接')
    }
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : String(e)
    statusEl.className = 'status err'
  }
}

async function loadFolders(selectedId: string): Promise<void> {
  const select = el<HTMLSelectElement>('defaultFolderId')
  select.innerHTML = '<option value="">（不指定）</option>'
  try {
    const tree = await getFolderTree()
    for (const f of flattenFolders(tree)) {
      const opt = document.createElement('option')
      opt.value = f.id
      opt.textContent = f.label
      if (f.id === selectedId) opt.selected = true
      select.appendChild(opt)
    }
  } catch {
    /* library not ready */
  }
}

async function withActiveTabPermission(
  run: (tab: chrome.tabs.Tab) => Promise<void>
): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  const blocked = injectableTabMessage(tab.url)
  if (blocked) {
    alert(blocked)
    return
  }

  const granted = await ensureHostPermissionForTab(tab.id)
  if (!granted) {
    alert(HOST_PERMISSION_DENIED_MSG)
    return
  }

  await run(tab)
}

async function init(): Promise<void> {
  const prefs = await getPreferences()
  el<HTMLInputElement>('apiBaseUrl').value = prefs.apiBaseUrl
  el<HTMLInputElement>('token').value = prefs.token
  el<HTMLSelectElement>('duplicatePolicy').value = prefs.duplicatePolicy
  el<HTMLInputElement>('enableDragSaver').checked = prefs.enableDragSaver

  await loadFolders(prefs.defaultFolderId)
  await refreshStatus()

  el<HTMLButtonElement>('savePrefs').addEventListener('click', async () => {
    await setPreferences({
      apiBaseUrl: el<HTMLInputElement>('apiBaseUrl').value.trim(),
      token: el<HTMLInputElement>('token').value,
      defaultFolderId: el<HTMLSelectElement>('defaultFolderId').value,
      duplicatePolicy: el<HTMLSelectElement>('duplicatePolicy').value as 'use_existing' | 'import_copy',
      enableDragSaver: el<HTMLInputElement>('enableDragSaver').checked
    })
    await refreshStatus()
    await loadFolders(el<HTMLSelectElement>('defaultFolderId').value)
  })

  // ── Batch Collect: Eagle-style floating overlay on current page ──
  el<HTMLButtonElement>('batchCollect').addEventListener('click', () => {
    void withActiveTabPermission(async (tab) => {
      if (!tab.id) return
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_BOARD_SAVER' })
        window.close()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('Receiving end does not exist')) {
          alert('无法连接页面脚本。请刷新目标网页后重试。')
        } else {
          alert(msg || '批量收藏失败')
        }
      }
    })
  })

  // ── Page Markdown Export ───────────────────────────────────────────
  el<HTMLButtonElement>('exportPageMd').addEventListener('click', () => {
    void withActiveTabPermission(async (tab) => {
      if (!tab.id) return
      try {
        await chrome.runtime.sendMessage({ type: 'EXPORT_PAGE_MARKDOWN' })
        window.close()
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
      }
    })
  })

  // ── Video/GIF deep scan ────────────────────────────────────────────
  el<HTMLButtonElement>('batchVideoSave').addEventListener('click', () => {
    void withActiveTabPermission(async (tab) => {
      if (!tab.id) return
      try {
        const candidates = (await resolveVideoCandidatesInTab(tab.id)) as MediaCandidate[]
        if (!candidates.length) {
          alert('当前页未发现可导入的视频/GIF资源')
        }
        const draft = {
          pageTitle: tab.title ?? '',
          pageUrl: tab.url ?? '',
          sourceTabId: tab.id,
          items: [],
          mediaCandidates: candidates
        }
        await chrome.storage.local.set({ [BATCH_DRAFT_KEY]: draft })
        await chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('Receiving end does not exist')) {
          alert('页面脚本通信失败。请刷新当前 YouTube 页面后重试；若仍失败再重新加载扩展。')
          return
        }
        alert(msg || '视频/GIF 扫描失败')
      }
    })
  })

  el<HTMLButtonElement>('startShot').addEventListener('click', () => {
    void withActiveTabPermission(async (tab) => {
      if (!tab.id) return
      const mode = el<HTMLSelectElement>('shotMode').value as 'region' | 'element' | 'fullpage'

      try {
        if (mode === 'fullpage') {
          const captureTabId = tab.id
          const done = await new Promise<boolean>((resolve) => {
            const timeout = window.setTimeout(() => {
              chrome.runtime.onMessage.removeListener(onDone)
              resolve(false)
            }, 30 * 60 * 1000)
            const onDone = (msg: unknown) => {
              const m = msg as { type?: string; tabId?: number; ok?: boolean; error?: string }
              if (m?.type !== 'FULLPAGE_CAPTURE_DONE' || m.tabId !== captureTabId) return
              chrome.runtime.onMessage.removeListener(onDone)
              window.clearTimeout(timeout)
              if (!m.ok) alert(m.error ?? '整页截图失败')
              resolve(m.ok === true)
            }
            chrome.runtime.onMessage.addListener(onDone)
            void chrome.runtime
              .sendMessage({ type: 'SCREENSHOT_FULLPAGE', format: 'jpeg' })
              .then((resp) => {
                if (!resp?.ok) {
                  chrome.runtime.onMessage.removeListener(onDone)
                  window.clearTimeout(timeout)
                  alert((resp as { error?: string })?.error ?? '整页截图失败')
                  resolve(false)
                }
              })
              .catch((e) => {
                chrome.runtime.onMessage.removeListener(onDone)
                window.clearTimeout(timeout)
                alert(e instanceof Error ? e.message : String(e))
                resolve(false)
              })
          })
          if (done) window.close()
          return
        }
        // Always inject standalone shot UI to avoid depending on page content listener lifecycle.
        await injectShotUI(tab.id, mode)
        window.close()
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
      }
    })
  })

}

void init()
