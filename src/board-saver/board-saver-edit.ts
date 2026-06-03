/** Filename batch rename helpers for Board Saver edit mode. */

export function applyFilenameAffixes(filename: string, prefix: string, suffix: string): string {
  const extIdx = filename.lastIndexOf('.')
  const base = extIdx > 0 ? filename.slice(0, extIdx) : filename
  const ext = extIdx > 0 ? filename.slice(extIdx) : ''
  return `${prefix}${base}${suffix}${ext}`
}

export type BoardSaverEditContext = {
  items: Array<{ id: string; filename?: string; url: string; selected: boolean }>
  editedFilenames: Map<string, string>
  onStatus: (text: string) => void
  onToast: (text: string) => void
}

function cardFilenameEl(itemId: string): HTMLElement | null {
  const card = document.querySelector(`[data-id="${CSS.escape(itemId)}"]`)
  return card?.querySelector('.bs-filename') as HTMLElement | null
}

export function enterBoardSaverEditMode(ctx: BoardSaverEditContext, onApplyRename: () => void): void {
  const btn = document.getElementById('bs-edit-preview') as HTMLButtonElement | null
  if (btn) {
    btn.textContent = '确认编辑'
    btn.style.background = '#10b981'
  }
  const importBtn = document.getElementById('bs-import-selected') as HTMLButtonElement | null
  if (importBtn) importBtn.textContent = '直接保存'
  ctx.onStatus('编辑模式：改标题或批量加前缀/后缀')

  const header = document.querySelector('.bs-header') as HTMLElement | null
  if (header && !header.querySelector('.bs-rename-inputs')) {
    const div = document.createElement('div')
    div.className = 'bs-rename-inputs'
    div.innerHTML = `
      <input class="bs-rename-prefix" id="bs-rename-prefix" type="text" placeholder="前缀…" style="width:70px;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:11px" />
      <span style="color:#9ca3af;font-size:11px">/</span>
      <input class="bs-rename-suffix" id="bs-rename-suffix" type="text" placeholder="后缀…" style="width:70px;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:11px" />
      <button class="bs-tool-btn" id="bs-rename-apply" type="button" style="font-size:11px;padding:3px 8px">应用</button>
    `
    header.insertBefore(div, header.querySelector('.bs-search'))
    document.getElementById('bs-rename-apply')?.addEventListener('click', onApplyRename)
  }

  for (const it of ctx.items) {
    const fnEl = cardFilenameEl(it.id)
    if (!fnEl) continue
    fnEl.contentEditable = 'true'
    fnEl.style.outline = '1px dashed #3b82f6'
    fnEl.style.padding = '0 2px'
    fnEl.style.borderRadius = '2px'
    fnEl.title = '点击编辑文件名'
  }
}

export function applyBoardSaverBatchRename(ctx: BoardSaverEditContext): number {
  const prefix = (document.getElementById('bs-rename-prefix') as HTMLInputElement)?.value ?? ''
  const suffix = (document.getElementById('bs-rename-suffix') as HTMLInputElement)?.value ?? ''
  const selected = ctx.items.filter((i) => i.selected)
  const target = selected.length > 0 ? selected : ctx.items

  for (const it of target) {
    const oldName = it.filename || it.url.split('/').pop() || ''
    it.filename = applyFilenameAffixes(oldName, prefix, suffix)
    ctx.editedFilenames.set(it.id, it.filename)
    const fnEl = cardFilenameEl(it.id)
    if (fnEl) fnEl.textContent = it.filename
  }

  const prefixEl = document.getElementById('bs-rename-prefix') as HTMLInputElement | null
  const suffixEl = document.getElementById('bs-rename-suffix') as HTMLInputElement | null
  if (prefixEl) prefixEl.value = ''
  if (suffixEl) suffixEl.value = ''

  ctx.onToast(`已重命名 ${target.length} 项`)
  return target.length
}

function clearFilenameEditStyle(fnEl: HTMLElement): void {
  fnEl.contentEditable = 'false'
  fnEl.style.outline = ''
  fnEl.style.padding = ''
  fnEl.style.borderRadius = ''
  fnEl.title = ''
}

export function exitBoardSaverEditMode(ctx: BoardSaverEditContext, save: boolean): void {
  const btn = document.getElementById('bs-edit-preview') as HTMLButtonElement | null
  if (btn) {
    btn.textContent = '预览编辑'
    btn.style.background = '#6b7280'
  }
  const importBtn = document.getElementById('bs-import-selected') as HTMLButtonElement | null
  if (importBtn) importBtn.textContent = '保存选中'

  document.querySelector('.bs-rename-inputs')?.remove()

  for (const it of ctx.items) {
    const fnEl = cardFilenameEl(it.id)
    if (!fnEl) continue
    if (save) {
      const edited = fnEl.textContent?.trim()
      if (edited && edited !== it.filename) {
        ctx.editedFilenames.set(it.id, edited)
        it.filename = edited
      }
    }
    clearFilenameEditStyle(fnEl)
  }
  ctx.onStatus('就绪')
}
