export interface PageMdRule {
  id: string
  match: (url: string) => boolean
  mainColumnSelector?: string
  titleSelector?: string
  postProcessDom?: (root: HTMLElement) => void
  turndownRules?: Array<{ name: string; rule: any }>
}

export const BUILTIN_RULES: PageMdRule[] = [
  {
    id: 'mp.weixin.qq.com',
    match: (url) => url.includes('mp.weixin.qq.com'),
    mainColumnSelector: '#js_content',
    titleSelector: '#activity-name',
    postProcessDom: (root) => {
      // WeChat images often use data-src
      const imgs = root.querySelectorAll('img')
      imgs.forEach(img => {
        const dataSrc = img.getAttribute('data-src')
        if (dataSrc) img.setAttribute('src', dataSrc)
      })
    }
  },
  {
    id: 'zhihu.com/question',
    match: (url) => url.includes('zhihu.com/question') || url.includes('zhuanlan.zhihu.com'),
    mainColumnSelector: '.Post-RichText, .RichText',
    postProcessDom: (root) => {
      // Zhihu lazy loaded images
      const imgs = root.querySelectorAll('img')
      imgs.forEach(img => {
        const actual = img.getAttribute('data-actualsrc') || img.getAttribute('data-original')
        if (actual) img.setAttribute('src', actual)
      })
    }
  },
  {
    id: 'csdn.net',
    match: (url) => url.includes('blog.csdn.net'),
    mainColumnSelector: '#content_views',
    postProcessDom: (root) => {
      // Remove copy buttons and extra crap inside pre
      root.querySelectorAll('.hljs-button').forEach(btn => btn.remove())
    }
  }
]

export function findMatchingRule(url: string): PageMdRule | undefined {
  return BUILTIN_RULES.find(r => r.match(url))
}
