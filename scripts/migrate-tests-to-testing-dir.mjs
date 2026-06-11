import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const srcDir = join(root, 'tests')
const destDir = join(root, 'testing/unit')

mkdirSync(destDir, { recursive: true })

for (const name of readdirSync(srcDir).filter((f) => f.endsWith('.test.ts'))) {
  let text = readFileSync(join(srcDir, name), 'utf8')
  text = text
    .replaceAll("from '../src/", "from '../../src/")
    .replaceAll('from "../src/', 'from "../../src/')
    .replaceAll("from '../scripts/", "from '../../scripts/")
    .replaceAll('from "../scripts/', 'from "../../scripts/')
  writeFileSync(join(destDir, name), text, 'utf8')
}

rmSync(srcDir, { recursive: true, force: true })
console.log('Migrated tests/ -> testing/unit/')
