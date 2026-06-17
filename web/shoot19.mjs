import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots19'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1.5 })

for (const [deck, file] of [['Undead Unleashed', 'wilhelt'], ['Vampiros do Vito', 'vito']]) {
  await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
  await page.getByText(deck).click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/${file}.png`, clip: { x: 980, y: 60, width: 520, height: 560 } })
  console.log(file, 'ok')
}
await browser.close()
console.log('done')
