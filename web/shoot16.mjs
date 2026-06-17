import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const OUT = process.argv[2] || './shots16'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3, acceptDownloads: true })

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByText('Vampiros do Vito').click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/deck-with-export.png` })

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }),
  page.getByRole('button', { name: /Exportar/ }).click(),
])
const fp = await download.path()
console.log('suggested filename:', download.suggestedFilename())
const text = readFileSync(fp, 'utf-8')
const lines = text.split('\n').filter((l) => l.trim())
console.log('lines:', lines.length)
const total = lines.reduce((s, l) => s + parseInt(l, 10), 0)
console.log('total cards:', total)
console.log('first line:', lines[0])
console.log('swamp line:', lines.find((l) => /Swamp/.test(l)))

await browser.close()
console.log('done')
