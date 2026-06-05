/** Normalize lazy-loaded images so Turndown + media scan see real https URLs. */



import { resolveBestImageUrlFromImg } from '../../shared/image-url-resolve'



export function normalizeLazyImagesInRoot(root: HTMLElement, pageUrl = location.href): void {

  root.querySelectorAll('img').forEach((img) => {

    const best = resolveBestImageUrlFromImg(img, pageUrl)

    if (!best) return

    const src = img.getAttribute('src') || ''

    if (src !== best) img.setAttribute('src', best)

    const srcset = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset')

    if (srcset && !img.getAttribute('srcset')) {

      img.setAttribute('srcset', srcset)

    }

  })

}


