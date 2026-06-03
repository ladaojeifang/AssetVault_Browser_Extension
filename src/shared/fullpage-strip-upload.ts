import { FULLPAGE_STRIP_JPEG_QUALITY } from './fullpage-session-paths'

export { FULLPAGE_STRIP_JPEG_QUALITY }

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取条带数据失败'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export async function canvasToStripBlob(
  canvas: OffscreenCanvas,
  format: 'jpeg' | 'png',
  quality = FULLPAGE_STRIP_JPEG_QUALITY
): Promise<Blob> {
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
  }
  if (format === 'png') {
    return canvas.convertToBlob({ type: 'image/png' })
  }
  return canvas.convertToBlob({
    type: 'image/jpeg',
    quality: Math.min(1, Math.max(0.01, quality / 100))
  })
}
