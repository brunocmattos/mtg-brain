import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots10'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3 })

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.locator('div.space-y-2 > button').first().click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(1500)
await page.getByRole('button', { name: /Grade/ }).click({ timeout: 4000 }).catch((e) => console.log('grade', e.message))
await page.waitForTimeout(2500) // let card images load
await page.screenshot({ path: `${OUT}/deck-grid.png` })
console.log('deck-grid ok')

await browser.close()
console.log('done')
