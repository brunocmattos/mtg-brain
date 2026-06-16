import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 } })
await page.goto('http://localhost:8000/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(2000)
await page.locator('div.space-y-2 > button').first().click({ timeout: 6000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/deck.png` })
console.log('deck ok')

try {
  await page.locator('li button').first().click({ timeout: 4000 }) // expande 1 combo
  await page.waitForTimeout(700)
} catch (e) {
  console.log('combo', e.message)
}
try {
  await page.locator('div.group').nth(2).hover({ timeout: 4000 }) // preview de carta
  await page.waitForTimeout(900)
} catch (e) {
  console.log('hover', e.message)
}
await page.screenshot({ path: `${OUT}/deck-hover-combo.png` })
console.log('hover/combo ok')

await browser.close()
console.log('done')
