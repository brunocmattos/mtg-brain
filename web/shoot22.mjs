import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = process.argv[2] || './shots22'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 })
await page.goto('http://localhost:8000/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByText('Vampiros do Vito').click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/price-source.png`, clip: { x: 980, y: 60, width: 520, height: 240 } })
console.log('ok')
await browser.close()
