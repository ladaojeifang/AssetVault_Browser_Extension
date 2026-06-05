export type VideoPlatform =
  | 'youtube'
  | 'bilibili'
  | 'douyin'
  | 'xiaohongshu'
  | 'tiktok'
  | 'twitter'
  | 'instagram'
  | 'vimeo'
  | 'kuaishou'

export type VideoPageContext = {
  url: string
  platform: VideoPlatform
  isVideoPage: true
}

type Rule = {
  platform: VideoPlatform
  test: (u: URL) => boolean
  canonicalize: (u: URL) => string | null
}

const STRIP_QUERY = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'share_id',
  'share_source',
  'sec_uid',
  'from',
  'spm_id_from'
])

function stripTrackingParams(u: URL): void {
  for (const key of [...u.searchParams.keys()]) {
    if (STRIP_QUERY.has(key) || key.startsWith('utm_')) {
      u.searchParams.delete(key)
    }
  }
}

const RULES: Rule[] = [
  {
    platform: 'youtube',
    test: (u) =>
      /(^|\.)youtube\.com$/i.test(u.hostname) ||
      u.hostname === 'youtu.be' ||
      u.hostname === 'm.youtube.com',
    canonicalize: (u) => {
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.replace(/^\//, '').split('/')[0]
        return id ? `https://www.youtube.com/watch?v=${id}` : null
      }
      if (/\/shorts\/([A-Za-z0-9_-]+)/.test(u.pathname)) {
        const id = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/)?.[1]
        return id ? `https://www.youtube.com/watch?v=${id}` : null
      }
      const v = u.searchParams.get('v')
      if (v && (u.pathname === '/watch' || u.pathname.startsWith('/watch/'))) {
        return `https://www.youtube.com/watch?v=${v}`
      }
      return null
    }
  },
  {
    platform: 'bilibili',
    test: (u) => /(^|\.)bilibili\.com$/i.test(u.hostname),
    canonicalize: (u) => {
      const bv = u.pathname.match(/\/video\/(BV[\w]+)/i)?.[1]
      if (bv) return `https://www.bilibili.com/video/${bv}`
      const av = u.pathname.match(/\/video\/av(\d+)/i)?.[1]
      if (av) return `https://www.bilibili.com/video/av${av}`
      return null
    }
  },
  {
    platform: 'douyin',
    test: (u) => /(^|\.)douyin\.com$/i.test(u.hostname),
    canonicalize: (u) => {
      const fromPath = u.pathname.match(/\/video\/(\d+)/)?.[1]
      if (fromPath) {
        const out = new URL(`https://www.douyin.com/video/${fromPath}`)
        return out.href
      }
      const modal = u.searchParams.get('modal_id')
      if (modal && u.pathname.includes('/jingxuan')) {
        return `https://www.douyin.com/video/${modal}`
      }
      return null
    }
  },
  {
    platform: 'xiaohongshu',
    test: (u) => /(^|\.)xiaohongshu\.com$/i.test(u.hostname),
    canonicalize: (u) => {
      const explore = u.pathname.match(/\/explore\/([0-9a-f]+)/i)?.[1]
      if (explore) return `https://www.xiaohongshu.com/explore/${explore}`
      const item = u.pathname.match(/\/discovery\/item\/([0-9a-f]+)/i)?.[1]
      if (item) return `https://www.xiaohongshu.com/discovery/item/${item}`
      return null
    }
  },
  {
    platform: 'tiktok',
    test: (u) =>
      /(^|\.)tiktok\.com$/i.test(u.hostname) || u.hostname === 'vm.tiktok.com',
    canonicalize: (u) => {
      const m = u.pathname.match(/\/@[^/]+\/video\/(\d+)/)
      if (m) {
        stripTrackingParams(u)
        return u.origin + u.pathname
      }
      return null
    }
  },
  {
    platform: 'twitter',
    test: (u) =>
      /(^|\.)(twitter\.com|x\.com)$/i.test(u.hostname) && !u.hostname.includes('api.'),
    canonicalize: (u) => {
      const status = u.pathname.match(/\/status\/(\d+)/)?.[1]
      if (status) return `https://x.com/i/status/${status}`
      return null
    }
  },
  {
    platform: 'instagram',
    test: (u) => /(^|\.)instagram\.com$/i.test(u.hostname),
    canonicalize: (u) => {
      const reel = u.pathname.match(/\/(reel|p)\/([^/]+)/)
      if (reel) return `https://www.instagram.com/${reel[1]}/${reel[2]}/`
      return null
    }
  },
  {
    platform: 'vimeo',
    test: (u) => /(^|\.)vimeo\.com$/i.test(u.hostname),
    canonicalize: (u) => {
      const id = u.pathname.match(/^\/(\d+)/)?.[1]
      if (id) return `https://vimeo.com/${id}`
      return null
    }
  },
  {
    platform: 'kuaishou',
    test: (u) => /(^|\.)kuaishou\.com$/i.test(u.hostname),
    canonicalize: (u) => {
      const short = u.pathname.match(/\/short-video\/([^/]+)/)?.[1]
      if (short) return `https://www.kuaishou.com/short-video/${short}`
      const photo = u.pathname.match(/\/fw\/photo\/([^/]+)/)?.[1]
      if (photo) return `https://www.kuaishou.com/fw/photo/${photo}`
      return null
    }
  }
]

function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

export function detectVideoPlatform(raw: string): VideoPlatform | null {
  const ctx = resolveVideoPageContext(raw)
  return ctx?.platform ?? null
}

export function isVideoPageUrl(raw: string): boolean {
  return resolveVideoPageContext(raw) !== null
}

/** Returns canonical作品页 URL for Pro yt-dlp, or null if not a supported video page. */
export function resolveVideoPageContext(raw: string): VideoPageContext | null {
  const u = parseHttpUrl(raw.trim())
  if (!u) return null

  for (const rule of RULES) {
    if (!rule.test(u)) continue
    const canonical = rule.canonicalize(u)
    if (!canonical) continue
    const canon = parseHttpUrl(canonical)
    if (!canon) continue
    stripTrackingParams(canon)
    return {
      url: canon.href,
      platform: rule.platform,
      isVideoPage: true
    }
  }
  return null
}
