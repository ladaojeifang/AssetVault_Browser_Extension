/**
 * Per-site thumbnail → HD URL rewrite rules (behavior referenced from common CDN patterns).
 * AssetVault-native implementation — not loaded from any external runtime.
 */
import { headOk, pickFirstReachable, stripAfter, stripQuery } from './url-enlarger-helpers'

export type UrlEnlargeRule = {
  site: string
  test: (url: string) => boolean
  enlarge: (url: string) => string | Promise<string>
}

function enlargeReddit(url: string): string {
  if (!/preview\.redd\.it/i.test(url)) return url
  try {
    const id = new URL(url).pathname.split('/').pop()?.replace(/^.*-v\d+-/, '') ?? ''
    if (id) return `https://i.redd.it/${id}`
  } catch {
    /* fall through */
  }
  return stripQuery(url).replace('preview.redd.it', 'i.redd.it')
}

function enlargeDeviantArt(url: string): string {
  if (!/wixmp\.com\/f\//i.test(url)) return url
  try {
    const token = new URL(url).searchParams.get('token')
    if (!token) return url
    const payload = JSON.parse(
      decodeURIComponent(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join('')
      )
    ) as { obj?: { width?: string; height?: string }[][] }
    const box = payload?.obj?.[0]?.[0]
    const h = box?.height?.replace('<=', '')
    const w = box?.width?.replace('<=', '')
    if (h && w) return url.replace(/\/w_\d+,h_\d+,q_\d+/, `/w_${w},h_${h},q_100`)
  } catch {
    /* ignore */
  }
  return url
}

function enlargeBehance(url: string): string {
  if (!/behance\.net/i.test(url)) return url
  const source = '/source/'
  return url
    .replace('/max_1200/', source)
    .replace(/\/max_\d+(_webp)?\//g, source)
    .replace('/2800_opt_1/', source)
    .replace('/1400_opt_1/', source)
    .replace('/disp/', source)
    .replace(/project_modules\/\d+\//, 'project_modules/source/')
    .replace(/projects\/\d+\//, 'projects/source/')
}

function enlargeImgur(url: string): string {
  if (!/i\.imgur\.com/i.test(url)) return url
  const base = stripQuery(url)
  return base.includes('?') ? base : `${base}?maxwidth=99999`
}

function enlargeBluesky(url: string): string {
  if (!/cdn\.bsky\.app\/img\/feed_thumbnail/i.test(url)) return url
  return url.replace('feed_thumbnail', 'feed_fullsize')
}

function enlargeMidjourney(url: string): string {
  if (!/cdn\.midjourney\.com/i.test(url)) return url
  return url.replace(/_\d+_N/, '').replace(/\.webp/i, '.png')
}

function enlargeHuabanEdge(url: string): string {
  if (!/gd-hbimg-edge\.huaban(img)?\.com/i.test(url)) return url
  return url
    .replace(/_\/fw[^?]*(?=\?|$)/, '')
    .replace(/_sq\d+\/format[^?]*(?=\?|$)/, '')
    .replace(/\/format\/[^?]*(?=\?|$)/, '')
    .replace(/_sq\d+\w*(?=\?|$)/, '')
    .replace(/_fw\d+\w*(?=\?|$)/, '')
    .replace(/small\//, '')
}

function enlargeHuabanGd(url: string): string {
  if (!/gd-hbimg\.huaban(img)?\.com/i.test(url)) return url
  return url
    .replace(/_\/fw.*/, '')
    .replace(/_sq\d+\/format.*/, '')
    .split('/format/')[0]
    .replace(/_sq235$/, '')
    .replace(/_sq75$/, '')
    .replace(/_sq.*$/, '')
    .replace(/_fw[\d]+[w]*$/, '')
    .split('_fw')[0]
    .split('/fw/')[0]
    .replace(/small\//, '')
}

function enlargeHuabanLegacy(url: string): string {
  if (!/hbimg\.huaban\.com/i.test(url)) return url
  return enlargeHuabanGd(url)
}

function enlargeHuabanGeneric(url: string): string {
  if (!/\/\/hbimg/i.test(url) || /huaban(img)?\.com/i.test(url)) return url
  return url
    .split('/format/')[0]
    .replace(/_sq235$/, '')
    .replace(/_sq75$/, '')
    .replace(/_fw[\d]+[w]*$/, '')
    .split('_fw')[0]
    .split('/fw/')[0]
}

function enlargeDazu(url: string): string {
  if (!/bigurl/i.test(url)) return url
  return url.replace('pc_236_webp_2x', 'pc_680_webp').replace('pc_236_webp', 'pc_680_webp')
}

function enlargeLapa(url: string): string {
  if (!/cdn\.lapaninja\.com/i.test(url)) return url
  return url.replace('-thumb.jpg', '.jpg')
}

function enlargeDribbble(url: string): string {
  if (!/cdn\.dribbble\.com/i.test(url)) return url
  if (url.includes('userupload') || (url.includes('screenshots') && url.includes('media'))) {
    return stripQuery(url)
  }
  if (url.includes('screenshots') && url.includes('.gif')) {
    return stripQuery(url).replace('_4x', '')
  }
  if (url.includes('/videos/')) return url.replace('_large_preview', '')
  if (url.includes('/attachments/')) return url
  return url.replace(/_1x/g, '').replace(/_teaser/g, '')
}

function enlargePexels(url: string): string {
  if (!/images\.pexels\.com/i.test(url)) return url
  return `${stripQuery(url)}?auto=compress`
}

function enlargeTenor(url: string): string {
  if (!/media\.tenor\.com/i.test(url)) return url
  return url.replace(/\/(d|M)\//, '/C/')
}

function enlargeWeibo(url: string): string {
  if (!/sinaimg\.cn/i.test(url)) return url
  if (/\.mp4/i.test(url)) return url
  return url.replace(/(cn)\/([a-z]*)(\d+)\//, 'cn/large/')
}

function enlargeTieba(url: string): string {
  if (!/tiebapic\.baidu\.com\/forum/i.test(url)) return url
  if (/\/sys\/portrait/.test(url)) return url.replace(/\/sys\/portrait/, '/sys/portraitl')
  const ab = url.match(/^(https?:\/\/tiebapic\.baidu\.com\/forum\/)ab(pic\/item\/[\w.]+)/i)
  if (ab) return ab[1] + ab[2]
  const sign = url.match(/\/sign=\w+\/([\w.]+)$/)
  if (sign) return `http://tiebapic.baidu.com/forum/pic/item/${sign[1]}`
  return url
}

function enlargeDouban(url: string): string {
  if (!/doubanio\.com/i.test(url)) return url
  return url
    .replace(/\/s\//, '/orginal/')
    .replace(/\/m\//, '/orginal/')
    .replace(/\/l\//, '/orginal/')
    .replace(/\/sqs\//, '/orginal/')
}

function enlargePixai(url: string): string {
  if (!/images-ng\.pixai\.art\/images\/thumb/i.test(url)) return url
  return url.replace('/thumb/', '/orig/')
}

function enlargeFlickr(url: string): string {
  if (!/staticflickr\.com/i.test(url)) return url
  return url.replace(/_[nms]\.jpg$/i, '_b.jpg')
}

function enlargePocoOld(url: string): string {
  if (!/pocoimg/i.test(url) || /pocoimg\.cn/i.test(url)) return url
  return url.replace(/_\d{3}\.jpg$/, '.jpg')
}

function enlargePocoNew(url: string): string {
  if (!/pocoimg\.cn/i.test(url)) return url
  return url.replace(/_H\d+\./, '.')
}

function enlargeMogujie(url: string): string {
  if (!/mogucdn\.com.*\.jpg/i.test(url)) return url
  return url.replace(/_[\d]{3}x[\d]+\.jpg$/, '_468x468.jpg').split('.jpg')[0] + '.jpg'
}

function enlargePinterestSync(url: string): string {
  if (!/pinimg\.com/i.test(url)) return url
  if (url.includes('75x75_RS')) return url
  if (!/\.(jpg|png|webp)(\?|$)/i.test(url)) return url
  return url
    .replace(/\/\d+x\//g, '/originals/')
    .replace(/\/\d+x/g, '/originals')
    .replace('/enabled/', '/')
    .replace('/enabled_lo/', '/')
    .replace('/enabled_hi/', '/')
    .replace('/control/', '/')
}

async function enlargePinterest(url: string): Promise<string> {
  const primary = enlargePinterestSync(url)
  if (primary === url || !/pinimg\.com/i.test(url)) return url
  const ext = url.match(/\.(jpg|png|webp)/i)?.[0] ?? '.jpg'
  const candidates = ['.jpg', '.png', '.webp', '.gif'].map((e) => primary.replace(ext, e))
  return pickFirstReachable(candidates, primary)
}

function enlargePixivSync(url: string): string {
  if (!/i\.pximg\.net/i.test(url)) return url
  return url
    .replace(/c\/\d+x\d+_\d+(_[A-Za-z0-9]{2})?\//, '')
    .replace(/img-master/, 'img-original')
    .replace(/custom-thumb/, 'img-original')
    .replace(/_(master|square|custom)1200/, '')
}

async function enlargePixiv(url: string): Promise<string> {
  const base = enlargePixivSync(url)
  if (!/\.(jpg|png)/i.test(base)) return base
  const asPng = base.replace(/\.jpg/i, '.png')
  const asJpg = base.replace(/\.png/i, '.jpg')
  if ((await headOk(asPng)) && asPng !== url) return asPng
  if ((await headOk(asJpg)) && asJpg !== url) return asJpg
  return base
}

function enlarge1688(url: string): string {
  if (!/cbu01\.alicdn\.com\/img\/ibank/i.test(url)) return url
  return url.replace(/\.\d+x.*\./, '.')
}

function enlargeTaobao(url: string): string {
  if (!/(?:taobao|tb|ali)cdn/i.test(url)) return url
  return url.replace(/_\d+x\d+\.jpg(_\.webp)?/i, '')
}

function enlargeTmall(url: string): string {
  if (!/(?:taobao|tb|ali)cdn/i.test(url)) return url
  return url.replace(/_\d+x\d+\S\d+\.jpg(_\.webp)?/i, '')
}

function enlargeAmazon(url: string): string {
  if (!/(?:ssl-images|media)-amazon\.com\/images\//i.test(url)) return url
  return url.replace(/\._[A-Z0-9_]+\./, '.')
}

function enlargeJd(url: string): string {
  if (!/360buyimg\.com/i.test(url)) return url
  return url
    .replace(/\/n\d+\//, '/n0/')
    .replace(/s\d+x\d+_?/, '')
    .split('!cc')[0]
    .split('!q')[0]
    .replace(/\.jpg\.avif/, '.jpg')
}

function enlargeHouzz(url: string): string {
  if (!/st\.hzcdn\.com\/fimgs/i.test(url)) return url
  return url.replace(/_/, '_14-').replace('fimgs', 'simgs').replace(/-w\d+-h\d+-b0-p0/, '')
}

function enlargeHearst(url: string): string {
  if (!/hips\.hearstapps\.com/i.test(url)) return url
  return url.replace(/\.jpg+/i, '.jpg').split('&resize=')[0]
}

function enlargeOfficeSnapshots(url: string): string {
  if (!/officesnapshots\.com/i.test(url)) return url
  return url.replace(/-\d{3,4}x\d{3,4}/, '')
}

function enlargeArchilovers(url: string): string {
  if (!/cdn\.archilovers\.com/i.test(url)) return url
  return url.replace(/(\S_\d+_|thumb\d_)/, '')
}

function enlargeArchitecturalDigest(url: string): string {
  if (!/media\.architecturaldigest\.com/i.test(url)) return url
  return url.replace(/w_\d+/, 'w_5000').replace(/,h_\d+/, '')
}

function enlargeArchdailyCn(url: string): string {
  if (!/adsttc\.com\.qtlcn\.com/i.test(url)) return url
  return url
    .replace(/thumb_jpg/, 'large_jpg')
    .replace('/medium_jpg/', '/large_jpg/')
    .replace('/newsletter/', '/large_jpg/')
}

function enlargeArchdaily(url: string): string {
  if (!/images\.adsttc\.com/i.test(url) || /\.qtlcn\.com/i.test(url)) return url
  return url
    .replace(/slideshow/, 'large_jpg')
    .replace(/thumb_jpg/, 'large_jpg')
    .replace('/medium_jpg/', '/large_jpg/')
    .replace('/newsletter/', '/large_jpg/')
}

function enlargeDezeen(url: string): string {
  if (!/static\.dezeen\.com/i.test(url)) return url
  return url
    .replace(/slideshow/, 'large_jpg')
    .replace(/thumb_jpg/, 'large_jpg')
    .replace(/-\d+x\d+\.jpg/, '.jpg')
}

function enlargeArchiproducts(url: string): string {
  if (!/img\.edilportale\.com/i.test(url)) return url
  return url.replace(/-thumbs.*\.[a-z]_/, 's/').replace(/news.*\.[a-z]_/, 'news/')
}

function enlargeWordpress(url: string): string {
  if (!/\/wp-content\/uploads\//i.test(url)) return url
  return url.replace(/-\d+x\d+/g, '').split('?w=')[0]
}

async function enlargeWordpressAsync(url: string): Promise<string> {
  const stripped = enlargeWordpress(url)
  const doubleExt = stripped.match(/\.[a-z]{3,4}\.[a-z]{3,4}$/i)
  if (!doubleExt) return stripped
  const parts = stripped.split('.')
  parts.pop()
  const noExt = parts.join('.')
  if (await headOk(noExt)) return noExt
  if (await headOk(stripped)) return stripped
  return stripped
}

function enlargeSquarespace(url: string): string {
  if (!/static\d\.squarespace\.com/i.test(url)) return url
  return url.replace(/format=\d{3,4}w/, 'format=3000w')
}

function enlargeBilibiliColumn(url: string): string {
  if (!/hdslb\.com/i.test(url) || !/@/.test(url)) return url
  return url.split('@')[0]
}

function enlargeAliyunOss(url: string): string {
  if (!/[?&]x-oss-process=/i.test(url)) return url
  try {
    const u = new URL(url)
    u.searchParams.delete('x-oss-process')
    return u.toString()
  } catch {
    return stripAfter(url, '?x-oss-process=')
  }
}

function enlargeXiaohongshu(url: string): string {
  if (!/sns-webpic-qc\.xhscdn\.com/i.test(url)) return url
  const converted = url.replace(
    /:\/\/[^/]+(\.xhscdn\.com\/+)[0-9]+\/+[0-9a-f]{10,}\/+([^/.?#!]+)(?:[?#!].*)?/,
    '://sns-img-al$1$2'
  )
  return converted.split('!')[0]
}

function enlargeMedium(url: string): string {
  if (!/cdn-images-\d\.medium\.com/i.test(url)) return url
  return url.replace(/\/max\/\d{2,4}/, '')
}

function enlargeMediumMiro(url: string): string {
  if (!/miro\.medium\.com\/v2/i.test(url)) return url
  return url.replace(/\/[^/]*:[^/]*\//g, '/')
}

function enlargeArtstationSync(url: string): string {
  if (!/artstation\.com/i.test(url) && !/\.artstation\.com/i.test(url)) return url
  return url
    .replace(/\d{14}\//, '')
    .replace(/micro_square/, 'large')
    .replace(/smaller_square/, 'large')
    .replace(/small_square/, 'large')
}

async function enlargeArtstation(url: string): Promise<string> {
  const large = enlargeArtstationSync(url)
  const fourK = large.replace(/large/, '4k')
  if (fourK !== large && (await headOk(fourK))) return fourK
  if (await headOk(large)) return large
  return large
}

function enlargeGameUi(url: string): string {
  if (!/image\.gameuiux\.cn/i.test(url)) return url
  return url.replace(/_list/, '_detail')
}

function enlargeGameUiNet(url: string): string {
  if (!/img\.gameui\.net/i.test(url)) return url
  if (/-1@\d+x\d+/.test(url)) return url.replace(/(-1@\d+x\d+)\.webp/g, '.webp')
  if (/@\d+x\d+\.webp/.test(url)) return url.replace(/(@\d+x\d+)\.webp/g, '.webp')
  return url
}

function enlargeInteriorDesignCdn(url: string): string {
  if (!/d4qwptktddc5f\.cloudfront\.net/i.test(url)) return url
  return url.replace(/easy_thumbnails\/thumbs_/, '').replace(/\.jpg.*/, '.jpg')
}

function enlargeMeiye(url: string): string {
  if (!/image\.meiye\.art/i.test(url)) return url
  return stripAfter(stripAfter(url, '?imageMogr2'), '?vframe')
}

function enlargeJike(url: string): string {
  if (!/ruguoapp\.com/i.test(url)) return url
  return stripAfter(url, '?imageMogr2')
}

function enlargeTencentMogr(url: string): string {
  if (!/[?&]imageMogr2/i.test(url)) return url
  if (/sign-algorithm=/i.test(url)) return url
  return stripAfter(url, '?imageMogr2')
}

function enlargeTencentView(url: string): string {
  if (!/[?&]imageView2/i.test(url)) return url
  if (/q-sign-algorithm=/i.test(url)) return url
  return stripAfter(url, '?imageView2')
}

function enlargeInstagram(url: string): string {
  if (!/cdninstagram\.com|fbcdn\.net/i.test(url)) return url
  return stripQuery(url)
}

function enlargeWechatMmbiz(url: string): string {
  if (!/mmbiz\.qpic\.cn/i.test(url)) return url
  // WeChat mmbiz CDN: remove size suffix like /640, /750 for original quality
  // Also strip wx_lazy / wx_co params that indicate thumbnail
  let result = url
    .replace(/\/(640|750|320|480|800|1200)(?=\?|$)/, '/')
    .replace(/\/(640|750|320|480|800|1200)(?=\/)/, '/')
  // Remove lazy-loading indicators
  try {
    const u = new URL(result)
    if (u.searchParams.get('wx_lazy')) u.searchParams.delete('wx_lazy')
    if (u.searchParams.get('wx_co')) u.searchParams.delete('wx_co')
    if (u.searchParams.get('tp') === 'webp') u.searchParams.delete('tp')
    result = u.toString()
  } catch {
    /* fallback: return as-is */
  }
  return result
}

function enlargeHuabanAll(url: string): string {
  if (!/huaban|hbimg/i.test(url)) return url
  if (/gd-hbimg-edge/i.test(url)) return enlargeHuabanEdge(url)
  if (/gd-hbimg/i.test(url)) return enlargeHuabanGd(url)
  if (/hbimg\.huaban\.com/i.test(url)) return enlargeHuabanLegacy(url)
  return enlargeHuabanGeneric(url)
}

/** Site rules in priority order (first match wins). */
export const URL_ENLARGE_SITE_RULES: UrlEnlargeRule[] = [
  { site: 'Reddit', test: (u) => /preview\.redd\.it/i.test(u), enlarge: enlargeReddit },
  { site: 'DeviantArt', test: (u) => /wixmp\.com\/f\//i.test(u), enlarge: enlargeDeviantArt },
  { site: 'Behance', test: (u) => /behance\.net/i.test(u), enlarge: enlargeBehance },
  { site: 'Imgur', test: (u) => /i\.imgur\.com/i.test(u), enlarge: enlargeImgur },
  { site: 'Bluesky', test: (u) => /cdn\.bsky\.app\/img\/feed_thumbnail/i.test(u), enlarge: enlargeBluesky },
  { site: 'Midjourney', test: (u) => /cdn\.midjourney\.com/i.test(u), enlarge: enlargeMidjourney },
  { site: 'HuabanEdge', test: (u) => /gd-hbimg-edge\.huaban(img)?\.com/i.test(u), enlarge: enlargeHuabanEdge },
  { site: 'HuabanGd', test: (u) => /gd-hbimg\.huaban(img)?\.com/i.test(u), enlarge: enlargeHuabanGd },
  { site: 'HuabanLegacy', test: (u) => /hbimg\.huaban\.com/i.test(u), enlarge: enlargeHuabanLegacy },
  { site: 'Huaban', test: (u) => /\/\/hbimg/i.test(u) && !/huaban(img)?\.com/i.test(u), enlarge: enlargeHuabanGeneric },
  { site: 'Dazu', test: (u) => /bigurl/i.test(u), enlarge: enlargeDazu },
  { site: 'Lapa', test: (u) => /cdn\.lapaninja\.com/i.test(u), enlarge: enlargeLapa },
  { site: 'Dribbble', test: (u) => /cdn\.dribbble\.com/i.test(u), enlarge: enlargeDribbble },
  { site: 'Pexels', test: (u) => /images\.pexels\.com/i.test(u), enlarge: enlargePexels },
  { site: 'Tenor', test: (u) => /media\.tenor\.com/i.test(u), enlarge: enlargeTenor },
  { site: 'Weibo', test: (u) => /sinaimg\.cn/i.test(u), enlarge: enlargeWeibo },
  { site: 'Tieba', test: (u) => /tiebapic\.baidu\.com/i.test(u), enlarge: enlargeTieba },
  { site: 'Douban', test: (u) => /doubanio\.com/i.test(u), enlarge: enlargeDouban },
  { site: 'PixAI', test: (u) => /pixai\.art\/images\/thumb/i.test(u), enlarge: enlargePixai },
  { site: 'Flickr', test: (u) => /staticflickr\.com/i.test(u), enlarge: enlargeFlickr },
  { site: 'PocoOld', test: (u) => /pocoimg/i.test(u) && !/pocoimg\.cn/i.test(u), enlarge: enlargePocoOld },
  { site: 'PocoNew', test: (u) => /pocoimg\.cn/i.test(u), enlarge: enlargePocoNew },
  { site: 'Mogujie', test: (u) => /mogucdn\.com/i.test(u), enlarge: enlargeMogujie },
  { site: 'Pinterest', test: (u) => /pinimg\.com/i.test(u), enlarge: enlargePinterest },
  { site: 'Pixiv', test: (u) => /i\.pximg\.net/i.test(u), enlarge: enlargePixiv },
  { site: '1688', test: (u) => /cbu01\.alicdn\.com/i.test(u), enlarge: enlarge1688 },
  { site: 'Taobao', test: (u) => /(?:taobao|tb|ali)cdn/i.test(u) && /_\d+x\d+\.jpg/i.test(u), enlarge: enlargeTaobao },
  { site: 'Tmall', test: (u) => /(?:taobao|tb|ali)cdn/i.test(u) && /_\d+x\d+\S\d+\.jpg/i.test(u), enlarge: enlargeTmall },
  { site: 'Amazon', test: (u) => /amazon\.com\/images\//i.test(u), enlarge: enlargeAmazon },
  { site: 'JD', test: (u) => /360buyimg\.com/i.test(u), enlarge: enlargeJd },
  { site: 'Houzz', test: (u) => /st\.hzcdn\.com\/fimgs/i.test(u), enlarge: enlargeHouzz },
  { site: 'Hearst', test: (u) => /hips\.hearstapps\.com/i.test(u), enlarge: enlargeHearst },
  { site: 'OfficeSnapshots', test: (u) => /officesnapshots\.com/i.test(u), enlarge: enlargeOfficeSnapshots },
  { site: 'Archilovers', test: (u) => /cdn\.archilovers\.com/i.test(u), enlarge: enlargeArchilovers },
  { site: 'ArchitecturalDigest', test: (u) => /architecturaldigest\.com/i.test(u), enlarge: enlargeArchitecturalDigest },
  { site: 'ArchdailyCn', test: (u) => /adsttc\.com\.qtlcn\.com/i.test(u), enlarge: enlargeArchdailyCn },
  { site: 'Archdaily', test: (u) => /images\.adsttc\.com/i.test(u), enlarge: enlargeArchdaily },
  { site: 'Dezeen', test: (u) => /static\.dezeen\.com/i.test(u), enlarge: enlargeDezeen },
  { site: 'Archiproducts', test: (u) => /img\.edilportale\.com/i.test(u), enlarge: enlargeArchiproducts },
  { site: 'WordPress', test: (u) => /\/wp-content\/uploads\//i.test(u), enlarge: enlargeWordpressAsync },
  { site: 'Squarespace', test: (u) => /squarespace\.com/i.test(u), enlarge: enlargeSquarespace },
  { site: 'BilibiliColumn', test: (u) => /hdslb\.com/i.test(u) && /@/.test(u), enlarge: enlargeBilibiliColumn },
  { site: 'AliyunOSS', test: (u) => /x-oss-process=/i.test(u), enlarge: enlargeAliyunOss },
  { site: 'Xiaohongshu', test: (u) => /sns-webpic-qc\.xhscdn\.com/i.test(u), enlarge: enlargeXiaohongshu },
  { site: 'Medium', test: (u) => /cdn-images-\d\.medium\.com/i.test(u), enlarge: enlargeMedium },
  { site: 'MediumMiro', test: (u) => /miro\.medium\.com\/v2/i.test(u), enlarge: enlargeMediumMiro },
  { site: 'Artstation', test: (u) => /artstation\.com/i.test(u), enlarge: enlargeArtstation },
  { site: 'GameUI', test: (u) => /image\.gameuiux\.cn/i.test(u), enlarge: enlargeGameUi },
  { site: 'GameUINet', test: (u) => /img\.gameui\.net/i.test(u), enlarge: enlargeGameUiNet },
  { site: 'InteriorDesignCdn', test: (u) => /d4qwptktddc5f\.cloudfront\.net/i.test(u), enlarge: enlargeInteriorDesignCdn },
  { site: 'Meiye', test: (u) => /image\.meiye\.art/i.test(u), enlarge: enlargeMeiye },
  { site: 'Jike', test: (u) => /ruguoapp\.com/i.test(u), enlarge: enlargeJike },
  { site: 'TencentMogr', test: (u) => /imageMogr2/i.test(u), enlarge: enlargeTencentMogr },
  { site: 'TencentView', test: (u) => /imageView2/i.test(u), enlarge: enlargeTencentView },
  { site: 'Instagram', test: (u) => /cdninstagram\.com|fbcdn\.net/i.test(u), enlarge: enlargeInstagram },
  { site: 'HuabanFallback', test: (u) => /huaban|hbimg/i.test(u), enlarge: enlargeHuabanAll },
  { site: 'WeChatMmbiz', test: (u) => /mmbiz\.qpic\.cn/i.test(u), enlarge: enlargeWechatMmbiz }
]
