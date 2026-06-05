export type PageVideoFormatPreset = 'best' | '1080p_mp4' | '2160p_mp4' | 'audio_only'

export const PAGE_VIDEO_FORMAT_PRESET_OPTIONS: Array<{
  value: PageVideoFormatPreset
  label: string
}> = [
  { value: 'best', label: '最佳（平台默认）' },
  { value: '1080p_mp4', label: '1080p MP4' },
  { value: '2160p_mp4', label: '4K MP4' },
  { value: 'audio_only', label: '仅音频' }
]

export const DEFAULT_PAGE_VIDEO_FORMAT_PRESET: PageVideoFormatPreset = '1080p_mp4'

export function normalizePageVideoFormatPreset(value: unknown): PageVideoFormatPreset {
  const found = PAGE_VIDEO_FORMAT_PRESET_OPTIONS.find((o) => o.value === value)
  return found?.value ?? DEFAULT_PAGE_VIDEO_FORMAT_PRESET
}

export function pageVideoFormatPresetLabel(preset: PageVideoFormatPreset): string {
  return PAGE_VIDEO_FORMAT_PRESET_OPTIONS.find((o) => o.value === preset)?.label ?? preset
}
