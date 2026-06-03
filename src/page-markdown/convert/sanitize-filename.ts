export function sanitizeFilename(title: string, maxLength = 120): string {
  // Replace illegal file system characters with a hyphen
  // Illegal characters typically include: < > : " / \ | ? * and control characters
  let safe = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
  
  // Condense multiple whitespace/hyphens
  safe = safe.replace(/[\s-]+/g, ' ').trim()
  
  // Truncate to max length
  if (safe.length > maxLength) {
    safe = safe.substring(0, maxLength).trim()
  }
  
  return safe || 'Untitled'
}
