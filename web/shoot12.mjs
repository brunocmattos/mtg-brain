import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots12'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3 })
const shot = async (n, t = 1200) => { await page.waitForTimeout(t); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(n, 'ok') }

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await shot('1-new-deck-form')

await page.getByRole('button', { name: /Escolher comandante/ }).click({ timeout: 5000 }).catch((e) => console.log('open', e.message))
await shot('2-picker-open', 2600)

await page.getByRole('button', { name: 'B', exact: true }).click({ timeout: 4000 }).catch((e) => console.log('B', e.message))
await page.getByPlaceholder(/tema ou nome/).fill('vampire')
await page.getByRole('button', { name: 'Buscar' }).click({ timeout: 4000 }).catch((e) => console.log('buscar', e.message))
await shot('3-picker-filtered', 2600)

await page.locator('.grid > div button').first().click({ timeout: 4000 }).catch((e) => console.log('select', e.message))
await shot('4-picker-selected', 900)

await page.getByRole('button', { name: 'Confirmar' }).click({ timeout: 4000 }).catch((e) => console.log('confirm', e.message))
await shot('5-after-confirm', 900)

await browser.close()
console.log('done')
