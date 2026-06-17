import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots20'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.5 })

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByText('Undead Unleashed').click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2500)

const sec = page.getByText('O que falta / pontos fracos').locator('..')
await sec.scrollIntoViewIfNeeded().catch((e) => console.log('scroll', e.message))
await page.waitForTimeout(400)
await sec.screenshot({ path: `${OUT}/gaps-section.png` }).catch((e) => console.log('shot', e.message))
console.log('gaps-section ok')
await browser.close()
console.log('done')
