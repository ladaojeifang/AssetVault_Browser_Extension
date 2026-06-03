/** High-quality strip files for Pro stitch (not the ~380KB importFromDataUrl budget). */

export const FULLPAGE_STRIP_JPEG_QUALITY = 95



/**

 * After finish: false = Pro deletes remote-imports/inspect-* (strips + merged temp).

 * true = keep strip files under library for inspection.

 */

/** true = keep `remote-imports/inspect-*` strip files after successful finish (debug). */
export const FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH = false



/** Session folder under library `remote-imports/`. */

export function fullPageInspectSessionId(timestampMs: number = Date.now()): string {

  return `inspect-${timestampMs}`

}



/** Strip file name inside session dir (Pro writes under library remote-imports). */

export function fullPageStripFileName(

  stripIndex: number,

  format: 'jpeg' | 'png'

): string {

  const ext = format === 'png' ? 'png' : 'jpg'

  return `strip-${String(stripIndex).padStart(4, '0')}.${ext}`

}



/** Classify probe errors: `true` = route exists, `false` = missing, `null` = inconclusive (do not cache). */

export function classifyFullPageSessionProbeError(message: string): boolean | null {

  if (/INVALID_REQUEST|FULLPAGE_|LIBRARY_NOT_OPEN|LIBRARY_NOT_READY|缺少|layout/i.test(message)) {

    return true

  }

  if (/HTTP 404|Not Found/i.test(message)) {

    return false

  }

  return null

}



export function mapFullPageFinishWarnings(warnings: string[]): string[] {

  const out: string[] = []

  for (const w of warnings) {

    if (w === 'capture_incomplete') out.push('采集未完成')

    else if (w === 'output_scaled_down') out.push('超长页面已由桌面端略微缩小')

  }

  return out

}


