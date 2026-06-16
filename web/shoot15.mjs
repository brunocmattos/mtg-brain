import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots15'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3 })
const shot = async (n, t = 1200) => { await page.waitForTimeout(t); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(n, 'ok') }

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await shot('1-decklist-counts', 1500) // Vito should now read "100 cartas"

await page.getByRole('button', { name: /Escolher comandante/ }).click({ timeout: 5000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2000)
await page.locator('select:has(option[value="5+"])').selectOption('5+')
await shot('2-picker-cmc5plus', 1800) // should be a full grid, not ~a handful

await browser.close()
console.log('done')
