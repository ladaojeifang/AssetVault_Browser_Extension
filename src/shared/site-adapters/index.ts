/**
 * Site adapter registry — unified export and dispatch center.
 *
 * Each adapter exports `resolveXxxCandidates(pageUrl, pageTitle): MediaCandidate[]`
 * and is responsible for detecting whether it applies to the current hostname.
 *
 * All adapters are eagerly imported (they are small modules).
 */

import type { MediaCandidate } from '../types'
import { dedupeCandidates } from '../media-candidate-core'

// ── Existing adapters ────────────────────────────────────────────────
export { resolveBilibiliCandidates } from './bilibili'
export { resolveTwitterCandidates } from './twitter'
export { resolveYoutubeCandidates } from './youtube'

// ── New adapters (Eagle parity) ─────────────────────────────────────
export { resolvePinterestCandidates } from './pinterest'
export { resolveInstagramCandidates } from './instagram'
export { resolveDribbbleCandidates } from './dribbble'
export { resolveXiaohongshuCandidates } from './xiaohongshu'
export { resolveWeiboCandidates } from './weibo'
export { resolveHuabanCandidates } from './huaban'
export { resolveMidjourneyCandidates } from './midjourney'
export { resolveVimeoCandidates } from './vimeo'
export { resolveFlickrCandidates } from './flickr'
export { resolveZcoolCandidates } from './zcool'
export { resolveGoogleMapsCandidates } from './google-maps'
export { resolveWechatCandidates } from './wechat'

// ── New adapters (v2) — Behance, Pixiv, ArtStation, Reddit, Tumblr ──────
export { resolveBehanceCandidates } from './behance'
export { resolvePixivCandidates } from './pixiv'
export { resolveArtstationCandidates } from './artstation'
export { resolveRedditCandidates } from './reddit'
export { resolveTumblrCandidates } from './tumblr'

// ── Design/Image adapters — DeviantArt, 500px, Pexels, Imgur, Designspiration, Unsplash, Freepik ──
export { resolveDeviantartCandidates } from './deviantart'
export { resolve500pxCandidates } from './500px'
export { resolvePexelsCandidates } from './pexels'
export { resolveImgurCandidates } from './imgur'
export { resolveDesignspirationCandidates } from './designspiration'
export { resolveUnsplashCandidates } from './unsplash'
export { resolveFreepikCandidates } from './freepik'

// ── Social/CN adapters — Jike, QQ Album, Douban Album, POCO, Tieba, Lofter, Medium, Giphy ──
export { resolveJikeCandidates } from './jike'
export { resolveQqAlbumCandidates } from './qq-album'
export { resolveDoubanAlbumCandidates } from './douban-album'
export { resolvePocoCandidates } from './poco'
export { resolveTiebaCandidates } from './tieba'
export { resolveLofterCandidates } from './lofter'
export { resolveMediumCandidates } from './medium'
export { resolveGiphyCandidates } from './giphy'

// ── E-commerce adapters — JD, Taobao, Tmall, Mogujie, 1688 ──
export { resolveJdCandidates } from './jd'
export { resolveTaobaoCandidates } from './taobao'
export { resolveTmallCandidates } from './tmall'
export { resolveMogujieCandidates } from './mogujie'
export { resolve1688Candidates } from './1688'

// ── Interior Design / Architecture adapters — ArchDigest, ArchiProducts, Houzz, HouseBeautiful,
//   OfficeSnapshots, Archilovers, ArchDaily, Dezeen, InteriorDesign ──
export { resolveArchdigestCandidates } from './archdigest'
export { resolveArchiproductsCandidates } from './archiproducts'
export { resolveHouzzCandidates } from './houzz'
export { resolveHousebeautifulCandidates } from './housebeautiful'
export { resolveOfficesnapshotsCandidates } from './officesnapshots'
export { resolveArchiloversCandidates } from './archilovers'
export { resolveArchdailyCandidates } from './archdaily'
export { resolveDezeenCandidates } from './dezeen'
export { resolveInteriordesignCandidates } from './interiordesign'

// ── Eager imports for synchronous dispatch ───────────────────────────

import { resolvePinterestCandidates as _pinterest } from './pinterest'
import { resolveInstagramCandidates as _instagram } from './instagram'
import { resolveDribbbleCandidates as _dribbble } from './dribbble'
import { resolveXiaohongshuCandidates as _xhs } from './xiaohongshu'
import { resolveWeiboCandidates as _weibo } from './weibo'
import { resolveHuabanCandidates as _huaban } from './huaban'
import { resolveMidjourneyCandidates as _mj } from './midjourney'
import { resolveVimeoCandidates as _vimeo } from './vimeo'
import { resolveFlickrCandidates as _flickr } from './flickr'
import { resolveZcoolCandidates as _zcool } from './zcool'
import { resolveGoogleMapsCandidates as _gmaps } from './google-maps'
import { resolveWechatCandidates as _wechat } from './wechat'
import { resolveTwitterCandidates as _twitter } from './twitter'
import { resolveYoutubeCandidates as _youtube } from './youtube'
import { resolveBilibiliCandidates as _bilibili } from './bilibili'
import { resolveBehanceCandidates as _behance } from './behance'
import { resolvePixivCandidates as _pixiv } from './pixiv'
import { resolveArtstationCandidates as _artstation } from './artstation'
import { resolveRedditCandidates as _reddit } from './reddit'
import { resolveTumblrCandidates as _tumblr } from './tumblr'
import { resolveDeviantartCandidates as _deviantart } from './deviantart'
import { resolve500pxCandidates as _500px } from './500px'
import { resolvePexelsCandidates as _pexels } from './pexels'
import { resolveImgurCandidates as _imgur } from './imgur'
import { resolveDesignspirationCandidates as _designspiration } from './designspiration'
import { resolveUnsplashCandidates as _unsplash } from './unsplash'
import { resolveFreepikCandidates as _freepik } from './freepik'
import { resolveJikeCandidates as _jike } from './jike'
import { resolveQqAlbumCandidates as _qqAlbum } from './qq-album'
import { resolveDoubanAlbumCandidates as _doubanAlbum } from './douban-album'
import { resolvePocoCandidates as _poco } from './poco'
import { resolveTiebaCandidates as _tieba } from './tieba'
import { resolveLofterCandidates as _lofter } from './lofter'
import { resolveMediumCandidates as _medium } from './medium'
import { resolveGiphyCandidates as _giphy } from './giphy'

// ── E-commerce adapters (eager imports) ─────────────────────────────────
import { resolveJdCandidates as _jd } from './jd'
import { resolveTaobaoCandidates as _taobao } from './taobao'
import { resolveTmallCandidates as _tmall } from './tmall'
import { resolveMogujieCandidates as _mogujie } from './mogujie'
import { resolve1688Candidates as _1688 } from './1688'

// ── Interior Design / Architecture adapters (eager imports) ──────────────
import { resolveArchdigestCandidates as _archdigest } from './archdigest'
import { resolveArchiproductsCandidates as _archiproducts } from './archiproducts'
import { resolveHouzzCandidates as _houzz } from './houzz'
import { resolveHousebeautifulCandidates as _housebeautiful } from './housebeautiful'
import { resolveOfficesnapshotsCandidates as _officesnapshots } from './officesnapshots'
import { resolveArchiloversCandidates as _archilovers } from './archilovers'
import { resolveArchdailyCandidates as _archdaily } from './archdaily'
import { resolveDezeenCandidates as _dezeen } from './dezeen'
import { resolveInteriordesignCandidates as _interiordesign } from './interiordesign'

// ── Registry metadata ───────────────────────────────────────────────

export type SiteAdapterEntry = {
  name: string
  hostTest: (hostname: string) => boolean
}

/** Ordered list of all site adapter entries. */
export const SITE_ADAPTERS: SiteAdapterEntry[] = [
  { name: 'twitter', hostTest: (h) => /x\.com|twitter\.com/i.test(h) },
  { name: 'youtube', hostTest: (h) => /youtube\.com|youtu\.be/i.test(h) },
  { name: 'bilibili', hostTest: (h) => /bilibili\.com/i.test(h) },
  { name: 'pinterest', hostTest: (h) => /pinterest\.com|pin\.it/i.test(h) },
  { name: 'instagram', hostTest: (h) => /instagram\.com/i.test(h) },
  { name: 'dribbble', hostTest: (h) => /dribbble\.com/i.test(h) },
  { name: 'xiaohongshu', hostTest: (h) => /xiaohongshu\.com|xhslink\.com/i.test(h) },
  { name: 'weibo', hostTest: (h) => /weibo\.com|weibo\.cn|m\.weibo\.cn/i.test(h) },
  { name: 'huaban', hostTest: (h) => /huaban\.com/i.test(h) },
  { name: 'midjourney', hostTest: (h) => /midjourney\.com/i.test(h) },
  { name: 'vimeo', hostTest: (h) => /vimeo\.com/i.test(h) },
  { name: 'flickr', hostTest: (h) => /flickr\.com/i.test(h) },
  { name: 'zcool', hostTest: (h) => /zcool\.com(\.cn)?/i.test(h) },
  { name: 'googlemaps', hostTest: (h) => /google\.[a-z]+\/maps|maps\.google\.com/i.test(h) },
  { name: 'wechat', hostTest: (h) => /mp\.weixin|weixin\.qq\.com/i.test(h) },
  { name: 'behance', hostTest: (h) => /behance\.net/i.test(h) },
  { name: 'pixiv', hostTest: (h) => /pixiv\.net/i.test(h) },
  { name: 'artstation', hostTest: (h) => /artstation\.com/i.test(h) },
  { name: 'reddit', hostTest: (h) => /reddit\.com/i.test(h) },
  { name: 'tumblr', hostTest: (h) => /tumblr\.com/i.test(h) },
  { name: 'deviantart', hostTest: (h) => /deviantart\.com/i.test(h) },
  { name: '500px', hostTest: (h) => /500px\.com/i.test(h) },
  { name: 'pexels', hostTest: (h) => /pexels\.com/i.test(h) },
  { name: 'imgur', hostTest: (h) => /imgur\.com|i\.rr|imgur\.io/i.test(h) },
  { name: 'designspiration', hostTest: (h) => /designspiration\.com/i.test(h) },
  { name: 'unsplash', hostTest: (h) => /unsplash\.com/i.test(h) },
  { name: 'freepik', hostTest: (h) => /freepik\.com/i.test(h) },
  { name: 'jike', hostTest: (h) => /ok\.(jike|ruguoapp)\.com|web\.okjike\.com/i.test(h) },
  { name: 'qq-album', hostTest: (h) => /photo\.qq\.com/i.test(h) || (/\i\.qq\.com/i.test(h) && /photo/.test(h)) },
  { name: 'douban-album', hostTest: (h) => /douban\.com.*photo|photo\.douban\.com/i.test(h) },
  { name: 'poco', hostTest: (h) => /poco\.cn|pocophoto\.cn/i.test(h) },
  { name: 'tieba', hostTest: (h) => /tieba\.baidu\.com/i.test(h) },
  { name: 'lofter', hostTest: (h) => /\.lofter\.com/i.test(h) },
  { name: 'medium', hostTest: (h) => /medium\.com/i.test(h) },
  { name: 'giphy', hostTest: (h) => /giphy\.com/i.test(h) },
  // E-commerce sites
  { name: 'jd', hostTest: (h) => /jd\.com|360buy\.com/i.test(h) },
  { name: 'taobao', hostTest: (h) => /taobao\.com|tmall\.com|taobaocdn\.com/i.test(h) },
  { name: 'tmall', hostTest: (h) => /tmall\.com/i.test(h) },
  { name: 'mogujie', hostTest: (h) => /mogujie\.com|mogu\.com/i.test(h) },
  { name: '1688', hostTest: (h) => /1688\.com/i.test(h) },
  // Interior design / architecture sites
  { name: 'archdigest', hostTest: (h) => /architecturaldigest\.com|ad\.com/i.test(h) },
  { name: 'archiproducts', hostTest: (h) => /archiproducts\.com/i.test(h) },
  { name: 'houzz', hostTest: (h) => /houzz\.(com|co\.\w{2})/i.test(h) },
  { name: 'housebeautiful', hostTest: (h) => /housebeautiful\.com/i.test(h) },
  { name: 'officesnapshots', hostTest: (h) => /officesnapshots\.com/i.test(h) },
  { name: 'archilovers', hostTest: (h) => /archilovers\.com/i.test(h) },
  { name: 'archdaily', hostTest: (h) => /archdaily\.(com|cn)/i.test(h) },
  { name: 'dezeen', hostTest: (h) => /dezeen\.com/i.test(h) },
  { name: 'interiordesign', hostTest: (h) => /interiordesign\.net/i.test(h) }
]

/**
 * Run all site adapters that match the current page's hostname.
 * Returns deduplicated candidates from every matching adapter.
 */
export function runMatchingAdapters(
  pageUrl: string,
  pageTitle: string
): MediaCandidate[] {
  const h = location.hostname.toLowerCase()

  return dedupeCandidates([
    (/x\.com|twitter\.com/i.test(h) ? _twitter(pageUrl, pageTitle) : []),
    (/youtube\.com|youtu\.be/i.test(h) ? _youtube(pageUrl, pageTitle) : []),
    (/bilibili\.com/i.test(h) ? _bilibili(pageUrl, pageTitle) : []),
    (/pinterest\.com|pin\.it/i.test(h) ? _pinterest(pageUrl, pageTitle) : []),
    (h.includes('instagram.com') ? _instagram(pageUrl, pageTitle) : []),
    (h.includes('dribbble.com') ? _dribbble(pageUrl, pageTitle) : []),
    ((/xiaohongshu\.com|xhslink\.com/i.test(h)) ? _xhs(pageUrl, pageTitle) : []),
    ((/weibo\.com|weibo\.cn/i.test(h)) ? _weibo(pageUrl, pageTitle) : []),
    (h.includes('huaban.com') ? _huaban(pageUrl, pageTitle) : []),
    (h.includes('midjourney.com') ? _mj(pageUrl, pageTitle) : []),
    (h.includes('vimeo.com') ? _vimeo(pageUrl, pageTitle) : []),
    (h.includes('flickr.com') ? _flickr(pageUrl, pageTitle) : []),
    ((/zcool\.com/i.test(h)) ? _zcool(pageUrl, pageTitle) : []),
    ((/google\.[a-z]+\/maps|maps\.google\.com/i.test(h)) ? _gmaps(pageUrl, pageTitle) : []),
    ((/mp\.weixin|weixin\.qq\.com/i.test(h)) ? _wechat(pageUrl, pageTitle) : []),
    ((/behance\.net/i.test(h)) ? _behance(pageUrl, pageTitle) : []),
    ((/pixiv\.net/i.test(h)) ? _pixiv(pageUrl, pageTitle) : []),
    ((/artstation\.com/i.test(h)) ? _artstation(pageUrl, pageTitle) : []),
    ((/reddit\.com/i.test(h)) ? _reddit(pageUrl, pageTitle) : []),
    ((/tumblr\.com/i.test(h)) ? _tumblr(pageUrl, pageTitle) : []),
    ((/deviantart\.com/i.test(h)) ? _deviantart(pageUrl, pageTitle) : []),
    ((/500px\.com/i.test(h)) ? _500px(pageUrl, pageTitle) : []),
    ((/pexels\.com/i.test(h)) ? _pexels(pageUrl, pageTitle) : []),
    ((/imgur\.com|i\.rr|imgur\.io/i.test(h)) ? _imgur(pageUrl, pageTitle) : []),
    ((/designspiration\.com/i.test(h)) ? _designspiration(pageUrl, pageTitle) : []),
    ((/unsplash\.com/i.test(h)) ? _unsplash(pageUrl, pageTitle) : []),
    ((/freepik\.com/i.test(h)) ? _freepik(pageUrl, pageTitle) : []),
    (/ok\.(jike|ruguoapp)\.com|web\.okjike\.com/i.test(h) ? _jike(pageUrl, pageTitle) : []),
    ((/photo\.qq\.com/i.test(h) || (/\i\.qq\.com/i.test(h) && /photo/.test(location.hostname))) ? _qqAlbum(pageUrl, pageTitle) : []),
    ((/douban\.com.*photo|photo\.douban\.com/i.test(h)) ? _doubanAlbum(pageUrl, pageTitle) : []),
    ((/poco\.cn|pocophoto\.cn/i.test(h)) ? _poco(pageUrl, pageTitle) : []),
    ((/tieba\.baidu\.com/i.test(h)) ? _tieba(pageUrl, pageTitle) : []),
    ((/\.lofter\.com/i.test(h)) ? _lofter(pageUrl, pageTitle) : []),
    ((/medium\.com/i.test(h)) ? _medium(pageUrl, pageTitle) : []),
    ((/giphy\.com/i.test(h)) ? _giphy(pageUrl,pageTitle) : []),
    // E-commerce adapters
    ((/jd\.com|360buy\.com/i.test(h)) ? _jd(pageUrl, pageTitle) : []),
    ((/taobao\.com|tmall\.com|taobaocdn\.com/i.test(h)) ? _taobao(pageUrl, pageTitle) : []),
    ((/tmall\.com/i.test(h)) ? _tmall(pageUrl, pageTitle) : []),
    ((/mogujie\.com|mogu\.com/i.test(h)) ? _mogujie(pageUrl, pageTitle) : []),
    ((/1688\.com/i.test(h)) ? _1688(pageUrl, pageTitle) : []),
    // Interior design / architecture adapters
    ((/architecturaldigest\.com|ad\.com/i.test(h)) ? _archdigest(pageUrl, pageTitle) : []),
    ((/archiproducts\.com/i.test(h)) ? _archiproducts(pageUrl, pageTitle) : []),
    ((/houzz\.(com|co\.\w{2})/i.test(h)) ? _houzz(pageUrl, pageTitle) : []),
    ((/housebeautiful\.com/i.test(h)) ? _housebeautiful(pageUrl, pageTitle) : []),
    ((/officesnapshots\.com/i.test(h)) ? _officesnapshots(pageUrl, pageTitle) : []),
    ((/archilovers\.com/i.test(h)) ? _archilovers(pageUrl, pageTitle) : []),
    ((/archdaily\.(com|cn)/i.test(h)) ? _archdaily(pageUrl, pageTitle) : []),
    ((/dezeen\.com/i.test(h)) ? _dezeen(pageUrl, pageTitle) : []),
    ((/interiordesign\.net/i.test(h)) ? _interiordesign(pageUrl, pageTitle) : [])
  ].flat())
}
