import { BATCH_DRAFT_KEY } from '../shared/messages'
import type { ImportFromUrlBatchResult, MediaCandidate, PageMediaItem } from '../shared/types'

type SelectableCandidate = PageMediaItem | (MediaCandidate & { id: string; selected: boolean })
type BatchDraft = {
  pageTitle: string
  pageUrl: string
  sourceTabId?: number
  items: PageMediaItem[]
  mediaCandidates?: MediaCandidate[]
}

// ==================== 过滤/排序类型定义 ====================

type FilterFormat = 'all' | 'image' | 'gif' | 'svg' | 'video'
type FilterSize = 'all' | 'small' | 'medium' | 'large' | 'hd'

type FilterState = {
  format: FilterFormat
  minSize: FilterSize
  domainKeyword: string
  searchText: string
  onlySelected: boolean
}

type SortField = 'default' | 'width' | 'height' | 'domain' | 'filename' | 'size'
type SortOrder = 'asc' | 'desc'
type SortConfig = { field: SortField; order: SortOrder }

// ==================== 状态变量 ====================

let draftMeta: Pick<BatchDraft, 'pageTitle' | 'pageUrl' | 'sourceTabId'> = { pageTitle: '', pageUrl: '' }
let items: SelectableCandidate[] = []

const filters: FilterState = {
  format: 'all',
  minSize: 'all',
  domainKeyword: '',
  searchText: '',
  onlySelected: false,
}

const sortConfig: SortConfig = { field: 'default', order: 'desc' }

// DOM 引用缓存（延迟初始化）
let domRefs: Record<string, HTMLElement> = {}

// ==================== 工具函数 ====================

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

function cacheEl<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id) as T
  domRefs[id] = e
  return e
}

function truncateUrl(url: string, max = 72): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 1)}…`
}

function getUrlExt(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const lastDot = pathname.lastIndexOf('.')
    if (lastDot === -1) return ''
    return pathname.slice(lastDot + 1).toLowerCase().split(/[?#]/)[0]
  } catch {
    return ''
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function getFilename(item: SelectableCandidate): string {
  if ('sourceType' in item) return item.filename ?? ''
  return item.filename ?? ''
}

function getItemKind(item: SelectableCandidate): string {
  if ('sourceType' in item) return item.kind
  return item.kind
}

function isGif(item: SelectableCandidate): boolean {
  if ('sourceType' in item) return item.kind === 'gif'
  return getUrlExt(item.url) === 'gif'
}

function isSvg(item: SelectableCandidate): boolean {
  if ('sourceType' in item) return false
  return getUrlExt(item.url) === 'svg'
}

function isVideo(item: SelectableCandidate): boolean {
  if ('sourceType' in item) return item.kind === 'video'
  return item.kind === 'video'
}

// 尺寸阈值定义：small<500px, medium<1000, large<2000, hd>=2000
function getSizeCategory(item: SelectableCandidate): FilterSize {
  const w = ('width' in item && typeof item.width === 'number') ? item.width : 0
  const h = ('height' in item && typeof item.height === 'number') ? item.height : 0
  const dim = Math.max(w, h)
  if (dim === 0) return 'all' // 未知尺寸，归入 all 类别以包含
  if (dim < 500) return 'small'
  if (dim < 1000) return 'medium'
  if (dim < 2000) return 'large'
  return 'hd'
}

function matchesFilter(item: SelectableCandidate): boolean {
  // 格式过滤
  switch (filters.format) {
    case 'image':
      if (isGif(item) || isSvg(item) || isVideo(item)) return false
      break
    case 'gif':
      if (!isGif(item)) return false
      break
    case 'svg':
      if (!isSvg(item)) return false
      break
    case 'video':
      if (!isVideo(item)) return false
      break
    case 'all':
    default:
      break
  }

  // 尺寸过滤
  if (filters.minSize !== 'all') {
    const cat = getSizeCategory(item)
    const sizeOrder: FilterSize[] = ['small', 'medium', 'large', 'hd']
    const itemIdx = sizeOrder.indexOf(cat)
    const filterIdx = sizeOrder.indexOf(filters.minSize)
    // 如果是未知尺寸（cat==='all'），默认包含；否则要求 >= filterIdx
    if (cat !== 'all' && itemIdx < filterIdx) return false
  }

  // 域名关键词过滤
  if (filters.domainKeyword) {
    const hostname = getHostname(item.url)
    if (!hostname.toLowerCase().includes(filters.domainKeyword.toLowerCase())) return false
  }

  // 搜索文本过滤（文件名或 URL）
  if (filters.searchText) {
    const q = filters.searchText.toLowerCase()
    const fn = getFilename(item).toLowerCase()
    const urlPart = item.url.toLowerCase()
    if (!fn.includes(q) && !urlPart.includes(q)) return false
  }

  // 只看已选
  if (filters.onlySelected && !item.selected) return false

  return true
}

function sortItems(list: SelectableCandidate[]): SelectableCandidate[] {
  if (sortConfig.field === 'default') return list

  const { field, order } = sortConfig
  const dir = order === 'asc' ? 1 : -1

  return [...list].sort((a, b) => {
    let va: number | string = 0
    let vb: number | string = 0

    switch (field) {
      case 'width': {
        va = ('width' in a && typeof a.width === 'number') ? a.width : 0
        vb = ('width' in b && typeof b.width === 'number') ? b.width : 0
        return (va - vb) * dir
      }
      case 'height': {
        va = ('height' in a && typeof a.height === 'number') ? a.height : 0
        vb = ('height' in b && typeof b.height === 'number') ? b.height : 0
        return (va - vb) * dir
      }
      case 'size': {
        const wa = ('width' in a && typeof a.width === 'number') ? a.width : 0
        const ha = ('height' in a && typeof a.height === 'number') ? a.height : 0
        const wb = ('width' in b && typeof b.width === 'number') ? b.width : 0
        const hb = ('height' in b && typeof b.height === 'number') ? b.height : 0
        return (wa * ha - wb * hb) * dir
      }
      case 'domain':
        va = getHostname(a.url)
        vb = getHostname(b.url)
        break
      case 'filename':
        va = getFilename(a)
        vb = getFilename(b)
        break
      default:
        return 0
    }

    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb, 'zh-CN', { sensitivity: 'base' }) * dir
    }
    return 0
  })
}

function applyFiltersAndSort(): { filtered: SelectableCandidate[]; visibleCount: number; totalCount: number } {
  const filtered = items.filter(matchesFilter)
  const sorted = sortItems(filtered)
  return {
    filtered: sorted,
    visibleCount: sorted.length,
    totalCount: items.length,
  }
}

// ==================== 渲染函数 ====================

function render(): void {
  const grid = el<HTMLElement>('grid')
  grid.innerHTML = ''

  const { filtered, visibleCount, totalCount } = applyFiltersAndSort()

  // 更新统计信息
  updateFilterStats(visibleCount, totalCount)

  if (!items.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-hint'
    empty.textContent = '暂无候选项。可点击「重新扫描」刷新图片，或从弹窗触发"视频/GIF 深度采集"。'
    grid.appendChild(empty)
    return
  }

  if (!filtered.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-hint'
    empty.textContent = '没有匹配当前过滤条件的项。请尝试调整筛选条件。'
    grid.appendChild(empty)
    return
  }

  for (const item of filtered) {
    const card = document.createElement('article')
    card.className = `card${item.selected ? ' selected' : ''}`
    card.dataset.id = item.id
    card.style.animation = 'bf-fadeIn 0.2s ease-out'

    let preview: HTMLElement
    if ('sourceType' in item) {
      const video = document.createElement('video')
      video.className = 'media-preview'
      video.src = item.url
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'metadata'
      video.controls = false
      video.addEventListener('canplay', () => {
        void video.play().catch(() => null)
      })
      video.onerror = () => {
        const ph = document.createElement('div')
        ph.className = 'media-placeholder'
        ph.textContent = item.sourceType === 'hls_manifest' ? 'HLS' : 'VIDEO'
        video.replaceWith(ph)
      }
      preview = video
    } else {
      const img = document.createElement('img')
      img.src = item.url
      img.alt = item.filename ?? ''
      img.loading = 'lazy'
      img.referrerPolicy = 'no-referrer'
      img.onerror = () => {
        if (img.dataset.fallback === '1') return
        img.dataset.fallback = '1'
        img.src =
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NDBhMWUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ij48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPSIyMSAxNSAxNiAxMCA1IDIxIj48L3BvbHlsaW5lPjwvc3ZnPg=='
        img.style.objectFit = 'none'
        img.style.padding = '24px'
        img.style.background = '#1e293b'
      }
      preview = img
    }

    const meta = document.createElement('div')
    meta.className = 'meta'
    const resolution = document.createElement('div')
    resolution.className = 'resolution'

    if ('sourceType' in item) {
      meta.textContent = `${item.site}/${item.sourceType} · ${item.filename ?? ''}`
      resolution.textContent = item.duration ? `时长 ${Math.round(item.duration)}s` : ''
    } else {
      const variantText = item.variantLabel ?? (item.variant === 'hd' ? '高清原图' : '预览图')
      meta.textContent = [variantText, item.filename ?? ''].filter(Boolean).join(' · ')
      const known =
        item.width && item.height ? `${item.width}×${item.height}` : ''
      resolution.textContent = known

      if (preview instanceof HTMLImageElement) {
        const updateRes = () => {
          if (!preview.naturalWidth) return
          const live = `${preview.naturalWidth}×${preview.naturalHeight}`
          resolution.textContent = known ? `${known}（实测 ${live}）` : live
        }
        if (preview.complete) updateRes()
        else preview.addEventListener('load', updateRes)
      }
    }

    card.append(preview, meta, resolution)
    card.addEventListener('click', () => {
      item.selected = !item.selected
      card.classList.toggle('selected', item.selected)
      updateFilterStats(applyFiltersAndSort().visibleCount, items.length)
    })
    grid.appendChild(card)
  }
}

function updatePageInfo(): void {
  el<HTMLParagraphElement>('pageInfo').textContent = `${draftMeta.pageTitle} — ${draftMeta.pageUrl} · ${items.length} 项`
}

function updateFilterStats(visibleCount: number, totalCount: number): void {
  const statsEl = document.getElementById('filterStats')
  if (statsEl) {
    if (visibleCount === totalCount) {
      statsEl.textContent = `${totalCount} 项`
    } else {
      statsEl.textContent = `显示 ${visibleCount}/${totalCount} 项`
    }
  }
}

// ==================== Filter Bar 构建与事件绑定 ====================

function createFilterBar(): HTMLDivElement {
  const bar = document.createElement('div')
  bar.className = 'bs-filter-bar'
  bar.id = 'filterBar'

  // 格式筛选按钮组
  const formatGroup = document.createElement('div')
  formatGroup.className = 'bs-filter-group bs-filter-format'
  const formats: Array<{ value: FilterFormat; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'image', label: '图片' },
    { value: 'gif', label: 'GIF' },
    { value: 'svg', label: 'SVG' },
    { value: 'video', label: '视频' },
  ]
  for (const fmt of formats) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `bs-filter-btn${filters.format === fmt.value ? ' active' : ''}`
    btn.dataset.filterFmt = fmt.value
    btn.textContent = fmt.label
    btn.addEventListener('click', () => setFormat(fmt.value))
    formatGroup.appendChild(btn)
  }
  bar.appendChild(formatGroup)

  // 尺寸下拉选择器
  const sizeWrap = document.createElement('div')
  sizeWrap.className = 'bs-filter-size-wrap'
  const sizeLabel = document.createElement('label')
  sizeLabel.className = 'bs-filter-label'
  sizeLabel.htmlFor = 'filterSize'
  sizeLabel.textContent = '尺寸'
  const sizeSel = document.createElement('select')
  sizeSel.id = 'filterSize'
  sizeSel.className = 'bs-filter-select'
  const sizes: Array<{ value: FilterSize; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'small', label: '小(<500)' },
    { value: 'medium', label: '中(500-999)' },
    { value: 'large', label: '大(1000-1999)' },
    { value: 'hd', label: 'HD(≥2000)' },
  ]
  for (const sz of sizes) {
    const opt = document.createElement('option')
    opt.value = sz.value
    opt.label = sz.label
    opt.textContent = sz.label
    if (sz.value === filters.minSize) opt.selected = true
    sizeSel.appendChild(opt)
  }
  sizeSel.addEventListener('change', () => {
    filters.minSize = sizeSel.value as FilterSize
    reRender()
  })
  sizeWrap.append(sizeLabel, sizeSel)
  bar.appendChild(sizeWrap)

  // 域名输入框
  const domainWrap = document.createElement('div')
  domainWrap.className = 'bs-filter-input-wrap'
  const domainInput = document.createElement('input')
  domainInput.type = 'text'
  domainInput.id = 'filterDomain'
  domainInput.className = 'bs-filter-input'
  domainInput.placeholder = '域名过滤...'
  domainInput.value = filters.domainKeyword
  domainInput.addEventListener('input', debounce(() => {
    filters.domainKeyword = domainInput.value.trim()
    reRender()
  }, 200))
  domainWrap.appendChild(domainInput)
  bar.appendChild(domainWrap)

  // 搜索框
  const searchWrap = document.createElement('div')
  searchWrap.className = 'bs-filter-input-wrap bs-filter-search'
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.id = 'filterSearch'
  searchInput.className = 'bs-filter-input'
  searchInput.placeholder = '搜索文件名...'
  searchInput.value = filters.searchText
  searchInput.addEventListener('input', debounce(() => {
    filters.searchText = searchInput.value.trim()
    reRender()
  }, 200))
  searchWrap.appendChild(searchInput)
  bar.appendChild(searchWrap)

  // 排序按钮组
  const sortGroup = document.createElement('div')
  sortGroup.className = 'bs-filter-group bs-filter-sort'
  const sorts: Array<{ value: SortField; label: string }> = [
    { value: 'default', label: '默认' },
    { value: 'size', label: '尺寸↓' },
    { value: 'width', label: '宽↓' },
    { value: 'domain', label: '域名' },
    { value: 'filename', label: '文件名' },
  ]
  for (const s of sorts) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `bs-sort-btn${sortConfig.field === s.value ? ' active' : ''}`
    btn.dataset.sortField = s.value
    btn.textContent = s.label
    btn.addEventListener('click', () => setSort(s.value as SortField))
    sortGroup.appendChild(btn)
  }
  bar.appendChild(sortGroup)

  // 只看已选开关
  const onlySelWrap = document.createElement('div')
  onlySelWrap.className = 'bs-filter-toggle-wrap'
  const onlySelToggle = document.createElement('button')
  onlySelToggle.type = 'button'
  onlySelToggle.id = 'filterOnlySelected'
  onlySelToggle.className = `bs-toggle-btn${filters.onlySelected ? ' active' : ''}`
  onlySelToggle.textContent = '只看已选'
  onlySelToggle.addEventListener('click', () => {
    filters.onlySelected = !filters.onlySelected
    onlySelToggle.classList.toggle('active', filters.onlySelected)
    reRender()
  })
  onlySelWrap.appendChild(onlySelToggle)
  bar.appendChild(onlySelWrap)

  // 统计信息
  const stats = document.createElement('span')
  stats.id = 'filterStats'
  stats.className = 'bs-filter-stats'
  bar.appendChild(stats)

  // 清除所有过滤器按钮
  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'bs-clear-btn'
  clearBtn.textContent = '重置'
  clearBtn.title = '清除所有过滤和排序条件'
  clearBtn.addEventListener('click', resetAllFilters)
  bar.appendChild(clearBtn)

  return bar
}

function setFormat(fmt: FilterFormat): void {
  filters.format = fmt
  // 更新按钮激活状态
  const group = document.querySelector('.bs-filter-format')
  if (group) {
    group.querySelectorAll<HTMLElement>('.bs-filter-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filterFmt === fmt)
    })
  }
  reRender()
}

function setSort(field: SortField): void {
  if (sortConfig.field === field) {
    // 同字段切换排序方向（仅对非 default 字段有效）
    if (field !== 'default') {
      sortConfig.order = sortConfig.order === 'asc' ? 'desc' : 'asc'
      // 更新按钮文字显示箭头方向
      updateSortButtonLabel(field)
    }
  } else {
    sortConfig.field = field
    sortConfig.order = field === 'default' ? 'desc' : 'desc' // 默认降序
  }
  // 更新按钮激活状态
  const group = document.querySelector('.bs-filter-sort')
  if (group) {
    group.querySelectorAll<HTMLElement>('.bs-sort-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sortField === field)
    })
  }
  reRender()
}

function updateSortButtonLabel(field: SortField): void {
  const group = document.querySelector('.bs-filter-sort')
  if (!group) return
  const btn = group.querySelector(`[data-sort-field="${field}"]`) as HTMLButtonElement | null
  if (!btn) return
  const baseLabels: Record<string, string> = {
    size: '尺寸',
    width: '宽',
    height: '高',
    domain: '域名',
    filename: '文件名',
  }
  const arrow = sortConfig.order === 'asc' ? '↑' : '↓'
  if (baseLabels[field]) {
    btn.textContent = `${baseLabels[field]}${arrow}`
  }
}

function resetAllFilters(): void {
  filters.format = 'all'
  filters.minSize = 'all'
  filters.domainKeyword = ''
  filters.searchText = ''
  filters.onlySelected = false
  sortConfig.field = 'default'
  sortConfig.order = 'desc'

  // 重置 UI 控件
  const formatGroup = document.querySelector('.bs-filter-format')
  if (formatGroup) {
    formatGroup.querySelectorAll<HTMLElement>('.bs-filter-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filterFmt === 'all')
    })
  }

  const sizeSelect = document.getElementById('filterSize') as HTMLSelectElement | null
  if (sizeSelect) sizeSelect.value = 'all'

  const domainInput = document.getElementById('filterDomain') as HTMLInputElement | null
  if (domainInput) domainInput.value = ''

  const searchInput = document.getElementById('filterSearch') as HTMLInputElement | null
  if (searchInput) searchInput.value = ''

  const onlySelBtn = document.getElementById('filterOnlySelected') as HTMLButtonElement | null
  if (onlySelBtn) onlySelBtn.classList.remove('active')

  const sortGroup = document.querySelector('.bs-filter-sort')
  if (sortGroup) {
    sortGroup.querySelectorAll<HTMLElement>('.bs-sort-btn').forEach((btn) => {
      const isActive = btn.dataset.sortField === 'default'
      btn.classList.toggle('active', isActive)
      // 恢复原始文字
      const origLabels: Record<string, string> = {
        default: '默认',
        size: '尺寸↓',
        width: '宽↓',
        domain: '域名',
        filename: '文件名',
      }
      const field = btn.dataset.sortField as SortField
      if (origLabels[field]) btn.textContent = origLabels[field]
    })
  }

  reRender()
}

function reRender(): void {
  render()
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

// ==================== 数据持久化 ====================

async function persistDraft(): Promise<void> {
  const imageItems = items.filter((x): x is PageMediaItem => !('sourceType' in x))
  const mediaItems = items
    .filter((x): x is MediaCandidate & { id: string; selected: boolean } => 'sourceType' in x)
    .map(({ id, selected, ...rest }) => rest)
  await chrome.storage.local.set({
    [BATCH_DRAFT_KEY]: {
      ...draftMeta,
      items: imageItems,
      mediaCandidates: mediaItems
    } satisfies BatchDraft
  })
}

async function loadDraft(): Promise<void> {
  const stored = await chrome.storage.local.get(BATCH_DRAFT_KEY)
  const draft = stored[BATCH_DRAFT_KEY] as BatchDraft | undefined
  if (!draft?.pageUrl) {
    el<HTMLParagraphElement>('pageInfo').textContent = '无采集数据，请从扩展弹窗打开批量采集。'
    el<HTMLButtonElement>('rescan').disabled = true
    return
  }
  draftMeta = { pageTitle: draft.pageTitle, pageUrl: draft.pageUrl, sourceTabId: draft.sourceTabId }
  const imageItems = (draft.items ?? []).map((x) => ({ ...x, selected: x.selected ?? true }))
  const mediaItems = (draft.mediaCandidates ?? []).map((x, i) => ({ ...x, id: `m-${i}`, selected: true }))
  items = [...imageItems, ...mediaItems]
  updatePageInfo()

  // 构建 filter bar 并插入到 toolbar 之后、importStatus 之前
  insertFilterBar()
  render()
}

function insertFilterBar(): void {
  const header = document.querySelector('header')
  const importStatus = document.getElementById('importStatus')
  if (!header || !importStatus) return

  // 避免重复插入
  if (document.getElementById('filterBar')) return

  const filterBar = createFilterBar()
  header.insertBefore(filterBar, importStatus)
}

async function rescanFromSourceTab(): Promise<void> {
  if (!draftMeta.pageUrl) return
  const btn = el<HTMLButtonElement>('rescan')
  btn.disabled = true
  el<HTMLParagraphElement>('importStatus').textContent = '正在重新扫描来源页…'
  const resp = await chrome.runtime.sendMessage({
    type: 'RESCAN_PAGE_MEDIA',
    tabId: draftMeta.sourceTabId,
    pageUrl: draftMeta.pageUrl
  })
  btn.disabled = false
  if (!resp?.ok) {
    el<HTMLParagraphElement>('importStatus').textContent =
      (resp as { error?: string })?.error ?? '重新扫描失败'
    return
  }
  if (resp.pageTitle) draftMeta.pageTitle = resp.pageTitle
  if (resp.pageUrl) draftMeta.pageUrl = resp.pageUrl
  if (typeof resp.sourceTabId === 'number') draftMeta.sourceTabId = resp.sourceTabId

  const mediaItems = items.filter(
    (x): x is MediaCandidate & { id: string; selected: boolean } => 'sourceType' in x
  )
  const imageItems = ((resp.items ?? []) as PageMediaItem[]).map((x) => ({ ...x, selected: x.selected ?? true }))
  items = [...imageItems, ...mediaItems]
  await persistDraft()
  updatePageInfo()
  render()
  el<HTMLParagraphElement>('importStatus').textContent = `已扫描到 ${(resp.items ?? []).length} 张图片`
}

function renderImportDetails(batches: ImportFromUrlBatchResult[]): void {
  const list = el<HTMLUListElement>('importDetails')
  list.innerHTML = ''
  const lines: Array<{ text: string; err?: boolean }> = []

  for (const batch of batches) {
    for (const s of batch.skipped) {
      lines.push({ text: `跳过 · ${truncateUrl(s.url)} — ${s.reason}` })
    }
    for (const e of batch.errors) {
      lines.push({ text: `失败 · ${truncateUrl(e.url)} — ${e.message}`, err: true })
    }
  }

  if (!lines.length) {
    list.hidden = true
    return
  }

  const maxShow = 12
  for (const line of lines.slice(0, maxShow)) {
    const li = document.createElement('li')
    if (line.err) li.className = 'err'
    li.textContent = line.text
    list.appendChild(li)
  }
  if (lines.length > maxShow) {
    const li = document.createElement('li')
    li.textContent = `…另有 ${lines.length - maxShow} 条记录未显示`
    list.appendChild(li)
  }
  list.hidden = false
}

async function importSelected(): Promise<void> {
  // 导入时使用完整的 items 列表（不受过滤影响），只取选中状态为 true 的项
  const selected = items.filter((i) => i.selected)
  if (!selected.length) {
    el<HTMLParagraphElement>('importStatus').textContent = '请至少选择一项'
    el<HTMLUListElement>('importDetails').hidden = true
    return
  }
  el<HTMLButtonElement>('importSelected').disabled = true
  el<HTMLParagraphElement>('importStatus').textContent = `正在导入 ${selected.length} 项…`
  el<HTMLUListElement>('importDetails').hidden = true

  const imageItems = selected.filter((x): x is PageMediaItem => !('sourceType' in x))
  const mediaItems = selected.filter(
    (x): x is MediaCandidate & { id: string; selected: boolean } => 'sourceType' in x
  )

  const batchResults: ImportFromUrlBatchResult[] = []
  const parts: Array<{ imported: number; skipped: number; errors: number }> = []
  if (imageItems.length) {
    const resp = await chrome.runtime.sendMessage({
      type: 'IMPORT_BATCH',
      items: imageItems.map((i) => ({
        url: i.url,
        filename: i.filename,
        headers: i.pageUrl ? { Referer: i.pageUrl } : undefined
      }))
    })
    if (!resp?.ok) {
      el<HTMLParagraphElement>('importStatus').textContent = resp?.error ?? '导入失败'
      el<HTMLButtonElement>('importSelected').disabled = false
      return
    }
    const batch = resp.batch as ImportFromUrlBatchResult
    batchResults.push(batch)
    parts.push({ imported: batch.imported.length, skipped: batch.skipped.length, errors: batch.errors.length })
  }

  if (mediaItems.length) {
    const resp = await chrome.runtime.sendMessage({
      type: 'IMPORT_MEDIA_CANDIDATE_BATCH',
      items: mediaItems.map((i) => ({
        url: i.url,
        filename: i.filename,
        headers: i.referer ? { Referer: i.referer } : undefined
      }))
    })
    if (!resp?.ok) {
      el<HTMLParagraphElement>('importStatus').textContent = resp?.error ?? '视频导入失败'
      el<HTMLButtonElement>('importSelected').disabled = false
      return
    }
    const batch = resp.batch as ImportFromUrlBatchResult
    batchResults.push(batch)
    parts.push({ imported: batch.imported.length, skipped: batch.skipped.length, errors: batch.errors.length })
  }

  el<HTMLButtonElement>('importSelected').disabled = false
  const summary = parts.reduce(
    (acc, x) => ({
      imported: acc.imported + x.imported,
      skipped: acc.skipped + x.skipped,
      errors: acc.errors + x.errors
    }),
    { imported: 0, skipped: 0, errors: 0 }
  )
  el<HTMLParagraphElement>('importStatus').textContent =
    `完成：成功 ${summary.imported}，跳过 ${summary.skipped}，失败 ${summary.errors}`
  renderImportDetails(batchResults)
}

async function importPageVideoFromTextarea(): Promise<void> {
  const textarea = el<HTMLTextAreaElement>('pageVideoUrls')
  const status = el<HTMLParagraphElement>('pageVideoStatus')
  const btn = el<HTMLButtonElement>('importPageVideoUrls')
  const lines = textarea.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) {
    status.textContent = '请粘贴至少一行 URL'
    return
  }

  btn.disabled = true
  status.textContent = '正在解析并提交…'

  try {
    const caps = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_VIDEO_CAPABILITIES',
      tabId: draftMeta.sourceTabId
    })
    if (!caps?.ok) {
      status.textContent = '无法连接 AssetVault Pro，请确认已启动并启用 Web API'
      return
    }
    if (!caps.pageVideo?.apiSupported) {
      status.textContent =
        caps.pageVideo?.blockReason ?? '本机 Pro 未启用作品页视频导入（pageVideoImport）'
      return
    }
    if (caps.pageVideo.ytdlpReady === false) {
      status.textContent =
        caps.pageVideo.blockReason ??
        'Pro 未检测到 yt-dlp，请执行 pnpm run fetch:ytdlp 后重启 Pro'
      return
    }

    const resp = await chrome.runtime.sendMessage({
      type: 'IMPORT_PAGE_VIDEO_FROM_TEXT',
      lines: textarea.value.split(/\r?\n/),
      tabId: draftMeta.sourceTabId
    })
    if (!resp?.ok) {
      status.textContent = resp?.error ?? '提交失败'
      return
    }
    const invalid = typeof resp.invalidLineCount === 'number' ? resp.invalidLineCount : 0
    const skipNote = invalid > 0 ? `，跳过无效行 ${invalid}` : ''
    status.textContent = `完成：成功 ${resp.succeeded}，失败 ${resp.failed}${skipNote}`
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : String(e)
  } finally {
    btn.disabled = false
  }
}

function bind(): void {
  el<HTMLButtonElement>('importPageVideoUrls').addEventListener('click', () =>
    void importPageVideoFromTextarea(),
  )

  if (location.hash === '#page-video') {
    el<HTMLDetailsElement>('pageVideoPaste').open = true
  }

  el<HTMLButtonElement>('rescan').addEventListener('click', () => void rescanFromSourceTab())

  // 全选：只影响当前过滤后可见的项
  el<HTMLButtonElement>('selectAll').addEventListener('click', () => {
    const { filtered } = applyFiltersAndSort()
    // 全选可见项
    for (const item of filtered) {
      item.selected = true
    }
    render()
  })

  // 全不选：只影响当前过滤后可见的项
  el<HTMLButtonElement>('selectNone').addEventListener('click', () => {
    const { filtered } = applyFiltersAndSort()
    for (const item of filtered) {
      item.selected = false
    }
    render()
  })

  el<HTMLButtonElement>('importSelected').addEventListener('click', () => void importSelected())
}

void loadDraft().then(bind)
