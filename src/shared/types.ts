export type JSendSuccess<T> = { status: 'success'; data: T }
export type JSendError = { status: 'error'; code: string; message: string }

export type ExtensionPreferences = {
  apiBaseUrl: string
  token: string
  defaultFolderId: string
  duplicatePolicy: 'use_existing' | 'import_copy'
  enableDragSaver: boolean
}

export type CollectMeta = {
  url: string
  filename?: string
  pageUrl: string
  pageTitle: string
  width?: number
  height?: number
  /** preview = page/thumbnail; hd = enlarged / orig */
  variant?: 'preview' | 'hd'
  variantLabel?: string
  mediaKey?: string
}

export type MediaSourceType = 'direct_file' | 'hls_manifest'
export type MediaSite = 'generic' | 'youtube' | 'twitter' | 'bilibili' | 'pinterest' | 'instagram' | 'dribbble' | 'vimeo' | 'flickr' | 'zcool' | 'googlemaps' | 'xiaohongshu' | 'weibo' | 'huaban' | 'midjourney' | 'wechat' | 'behance' | 'pixiv' | 'artstation' | 'reddit' | 'tumblr' | 'deviantart' | '500px' | 'pexels' | 'imgur' | 'designspiration' | 'unsplash' | 'freepik' | 'jike' | 'qq-album' | 'douban-album' | 'poco' | 'tieba' | 'lofter' | 'medium' | 'giphy'
  // E-commerce sites
  | 'jd' | 'taobao' | 'tmall' | 'mogujie' | '1688'
  // Interior design / architecture sites
  | 'archdigest' | 'archiproducts' | 'houzz' | 'housebeautiful' | 'officesnapshots' | 'archilovers' | 'archdaily' | 'dezeen' | 'interiordesign'

export type MediaCandidate = {
  kind: 'video' | 'gif'
  sourceType: MediaSourceType
  url: string
  filename?: string
  mime?: string
  duration?: number
  referer?: string
  pageUrl: string
  pageTitle: string
  site: MediaSite
  confidence: number
}

export type FolderNode = {
  id: string
  name: string
  parentId: string | null
  children?: FolderNode[]
}

export type ImportFromUrlResult = {
  skipped: boolean
  assetId?: string
  reason?: string
  existingAssetId?: string
}

export type ImportFromUrlBatchResult = {
  imported: string[]
  skipped: Array<{ url: string; reason: string; existingAssetId?: string }>
  errors: Array<{ url: string; message: string }>
}

export type PageMediaItem = CollectMeta & {
  id: string
  kind: 'image' | 'video' | 'bg'
  selected: boolean
}
