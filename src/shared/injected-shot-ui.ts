/**
 * Standalone page script — must not import other modules (injected via files: ['injected-shot-ui.js']).
 */
export function startShotUIInPage(shotMode: 'region' | 'element'): void {
  const SHOT_OVERLAY_ID = 'assetvault-shot-overlay'
  let onKeyDown: ((e: KeyboardEvent) => void) | null = null

  const cleanup = () => {
    const el = document.getElementById(SHOT_OVERLAY_ID)
    if (el) el.remove()
    document.body.style.userSelect = ''
    if (onKeyDown) {
      document.removeEventListener('keydown', onKeyDown)
      onKeyDown = null
    }
  }
  cleanup()
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

  const overlay = document.createElement('div')
  overlay.id = SHOT_OVERLAY_ID
  overlay.style.position = 'fixed'
  overlay.style.left = '0'
  overlay.style.top = '0'
  overlay.style.right = '0'
  overlay.style.bottom = '0'
  overlay.style.zIndex = '2147483646'
  overlay.style.cursor = 'crosshair'
  overlay.style.background = 'rgba(2,6,23,0.05)'
  overlay.style.pointerEvents = 'auto'

  const box = document.createElement('div')
  box.style.position = 'absolute'
  box.style.border = '2px solid #3b82f6'
  box.style.background = 'rgba(59,130,246,0.12)'
  box.style.display = 'none'
  overlay.appendChild(box)

  document.body.appendChild(overlay)
  document.body.style.userSelect = 'none'

  const dpr = window.devicePixelRatio || 1
  const format = 'jpeg'

  const sendRect = (rect: { x: number; y: number; width: number; height: number }) => {
    cleanup()
    void chrome.runtime.sendMessage({
      type: 'SCREENSHOT_CROP_RECT',
      mode: shotMode,
      rect,
      dpr,
      format
    })
  }

  if (shotMode === 'element') {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      const rect = {
        x: clamp(Math.round(r.left), 0, window.innerWidth),
        y: clamp(Math.round(r.top), 0, window.innerHeight),
        width: clamp(Math.round(r.width), 1, window.innerWidth),
        height: clamp(Math.round(r.height), 1, window.innerHeight)
      }
      box.style.display = 'block'
      box.style.left = `${rect.x}px`
      box.style.top = `${rect.y}px`
      box.style.width = `${rect.width}px`
      box.style.height = `${rect.height}px`
      sendRect(rect)
    }
    overlay.addEventListener('click', onClick, { once: true })
  } else {
    let startX = 0
    let startY = 0
    let dragging = false
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      dragging = true
      startX = e.clientX
      startY = e.clientY
      box.style.display = 'block'
      box.style.left = `${startX}px`
      box.style.top = `${startY}px`
      box.style.width = '1px'
      box.style.height = '1px'
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return
      const curX = e.clientX
      const curY = e.clientY
      const x = Math.min(startX, curX)
      const y = Math.min(startY, curY)
      const width = Math.abs(curX - startX)
      const height = Math.abs(curY - startY)
      if (width < 1 || height < 1) return
      box.style.left = `${clamp(x, 0, window.innerWidth)}px`
      box.style.top = `${clamp(y, 0, window.innerHeight)}px`
      box.style.width = `${clamp(width, 1, window.innerWidth)}px`
      box.style.height = `${clamp(height, 1, window.innerHeight)}px`
    }
    const onMouseUp = (e: MouseEvent) => {
      if (!dragging) return
      dragging = false
      e.preventDefault()
      e.stopPropagation()
      const endX = e.clientX
      const endY = e.clientY
      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)
      if (width < 5 || height < 5) {
        cleanup()
        return
      }
      const rect = {
        x: clamp(Math.round(x), 0, window.innerWidth),
        y: clamp(Math.round(y), 0, window.innerHeight),
        width: clamp(Math.round(width), 1, window.innerWidth),
        height: clamp(Math.round(height), 1, window.innerHeight)
      }
      sendRect(rect)
    }
    overlay.addEventListener('mousedown', onMouseDown)
    overlay.addEventListener('mousemove', onMouseMove)
    overlay.addEventListener('mouseup', onMouseUp)
  }

  onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup()
      void chrome.runtime.sendMessage({ type: 'SCREENSHOT_ABORT' })
    }
  }
  document.addEventListener('keydown', onKeyDown)
}

;(globalThis as typeof globalThis & { __assetvaultStartShot?: typeof startShotUIInPage }).__assetvaultStartShot =
  startShotUIInPage
