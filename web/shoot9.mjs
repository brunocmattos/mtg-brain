import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots9'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
// higher DPI so text is legible when I inspect
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 })

async function shot(name, full = false) {
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  console.log(name, 'ok')
}

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.locator('div.space-y-2 > button').first().click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2200)
await shot('deck-top')           // viewport top
await shot('deck-full', true)    // whole page scrolled

// commanders page
await page.goto(base + '/commanders', { waitUntil: 'networkidle' }).catch(() => {})
await shot('commanders')

await browser.close()
console.log('done')
