import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots14'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3 })
const shot = async (n, t = 900) => { await page.waitForTimeout(t); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(n, 'ok') }

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByRole('button', { name: /Escolher comandante/ }).click({ timeout: 5000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2200)

// LIVE SEARCH: type without pressing Enter
await page.getByPlaceholder(/tema ou nome/).fill('dragon')
await shot('1-live-typed-dragon', 1200) // should already show dragons (debounced, no Enter)

// SORT by price desc
await page.locator('select:has(option[value="price_desc"])').selectOption('price_desc')
await shot('2-sorted-price-desc', 1600) // most expensive dragons first

await browser.close()
console.log('done')
