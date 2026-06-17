import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = process.argv[2] || './shots23'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.3 })
await page.goto('http://localhost:8000/commanders', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByPlaceholder(/tema/).fill('Teysa, Orzhov Scion')
await page.waitForTimeout(1800)
await page.locator('.grid button').first().click({ timeout: 6000 }).catch((e) => console.log('click card', e.message))
await page.waitForTimeout(2500) // deixa os combos carregarem
await page.screenshot({ path: `${OUT}/commander-modal.png` })
console.log('ok')
await browser.close()
