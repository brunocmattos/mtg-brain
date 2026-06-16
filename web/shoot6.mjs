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
await page.screenshot({ path: `${OUT}/deck-banner.png` })
console.log('banner ok')

try {
  await page.getByRole('button', { name: /Gray Merchant of Asphodel/ }).first().click({ timeout: 4000 })
  await page.waitForTimeout(2500)
} catch (e) {
  console.log('open card', e.message)
}
await page.screenshot({ path: `${OUT}/card-modal.png` })
console.log('modal ok')

await browser.close()
console.log('done')
