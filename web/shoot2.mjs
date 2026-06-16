// Abre o modal de um comandante e expande um combo, pra conferir imagem + combos clicáveis.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
await page.goto('http://localhost:8000/commanders', { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(2000)

await page.locator('div.grid button').first().click({ timeout: 8000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/modal.png` })
console.log('modal ok')

try {
  await page.locator('ul li button').first().click({ timeout: 5000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/modal-combo-open.png` })
  console.log('combo expandido ok')
} catch (e) {
  console.log('combo click ERR', e.message)
}

await browser.close()
console.log('done')
