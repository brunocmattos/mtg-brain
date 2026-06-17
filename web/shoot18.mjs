import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots18'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 })

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByText('Vampiros do Vito').click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2500)
// recorta o painel de análise (lado direito)
await page.screenshot({ path: `${OUT}/analysis-prices.png`, clip: { x: 980, y: 60, width: 520, height: 360 } })
console.log('analysis-prices ok')
await browser.close()
console.log('done')
