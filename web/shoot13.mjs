import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots13'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.4 })

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByText('Teste Meren').click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/meren-analysis.png` })
console.log('meren-analysis ok')

await browser.close()
console.log('done')
