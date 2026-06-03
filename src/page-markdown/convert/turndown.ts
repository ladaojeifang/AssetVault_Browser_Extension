// @ts-ignore
import TurndownService from '@joplin/turndown'
// @ts-ignore
import { gfm } from '@joplin/turndown-plugin-gfm'

export interface FrontMatterData {
  title: string
  sourceUrl: string
  exportedAt: string // ISO date
}

export function convertHtmlToMarkdown(
  html: string,
  frontMatter: FrontMatterData,
  customRules?: Array<{
    name: string
    rule: TurndownService.Rule
  }>
): string {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
  })

  // Use GFM (strikethrough, tables, taskListItems)
  turndownService.use(gfm)

  // Avoid creating empty links or images
  turndownService.addRule('emptyLink', {
    filter: (node: HTMLElement, options: any) => {
      return (
        node.nodeName === 'A' &&
        !node.getAttribute('href') &&
        !node.textContent
      )
    },
    replacement: () => ''
  })

  // Apply custom site-specific rules if provided
  if (customRules) {
    for (const { name, rule } of customRules) {
      turndownService.addRule(name, rule)
    }
  }

  const bodyMd = turndownService.turndown(html)

  const fm = [
    '---',
    `title: "${frontMatter.title.replace(/"/g, '\\"')}"`,
    `source: "${frontMatter.sourceUrl}"`,
    `exported_at: "${frontMatter.exportedAt}"`,
    '---',
    '',
    `# ${frontMatter.title}`, // Add main title as H1 automatically
    '',
    bodyMd
  ].join('\n')

  return fm
}
