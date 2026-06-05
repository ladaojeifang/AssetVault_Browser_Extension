/** Reject tracking pixels / HTML error bodies / tainted canvas black JPEGs. */

const MIN_BYTES = 2048
const MIN_PIXELS = 80
const MIN_AREA = 8_000

/** Sample grid size for blank/tainted canvas detection. */
const BLANK_SAMPLE_GRID = 6
/** Fraction of near-black samples above which we reject the image. */
const BLANK_SAMPLE_RATIO = 0.92
const NEAR_BLACK_LUMA = 18

function sampleLuma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

async function isMostlyBlankImageBitmap(bmp: ImageBitmap): Promise<boolean> {
  const w = bmp.width
  const h = bmp.height
  if (w < MIN_PIXELS || h < MIN_PIXELS || w * h < MIN_AREA) return true

  const canvas = new OffscreenCanvas(BLANK_SAMPLE_GRID, BLANK_SAMPLE_GRID)
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  ctx.drawImage(bmp, 0, 0, w, h, 0, 0, BLANK_SAMPLE_GRID, BLANK_SAMPLE_GRID)
  const data = ctx.getImageData(0, 0, BLANK_SAMPLE_GRID, BLANK_SAMPLE_GRID).data
  let dark = 0
  const pixels = BLANK_SAMPLE_GRID * BLANK_SAMPLE_GRID
  for (let i = 0; i < data.length; i += 4) {
    if (sampleLuma(data[i]!, data[i + 1]!, data[i + 2]!) <= NEAR_BLACK_LUMA) dark++
  }
  return dark / pixels >= BLANK_SAMPLE_RATIO
}

/** GIF / tiny wide banner returned when hotlink Referer is missing. */
export async function isHotlinkPlaceholderBlob(blob: Blob, sourceUrl: string): Promise<boolean> {
  const expectRaster = /\.(?:jpe?g|png|webp|avif)$/i.test(sourceUrl)
  if (!expectRaster) return false
  const ct = blob.type.toLowerCase()
  if (ct.includes('gif') && blob.size < 96 * 1024) return true
  if (blob.size < 12_288) return true
  try {
    const bmp = await createImageBitmap(blob)
    const banner =
      bmp.width > 500 && bmp.height < 220 && bmp.width / Math.max(bmp.height, 1) > 4
    bmp.close()
    return banner
  } catch {
    return false
  }
}

export async function isAcceptableArticleImageBlob(blob: Blob): Promise<boolean> {
  if (blob.size < MIN_BYTES) return false
  const ct = blob.type.toLowerCase()
  if (ct.includes('text/html') || ct.includes('text/plain')) return false

  try {
    const bmp = await createImageBitmap(blob)
    const ok =
      bmp.width >= MIN_PIXELS &&
      bmp.height >= MIN_PIXELS &&
      bmp.width * bmp.height >= MIN_AREA &&
      !(bmp.width > 500 && bmp.height < 220 && bmp.width / bmp.height > 4) &&
      !(await isMostlyBlankImageBitmap(bmp))
    bmp.close()
    return ok
  } catch {
    return blob.size >= 12_288
  }
}
