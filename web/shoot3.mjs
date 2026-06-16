// Screenshot da tela de Decks (lista + visão do deck com análise).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
await page.goto('http://localhost:8000/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/decks-list.png` })
console.log('decks-list ok')

try {
  await page.locator('div.space-y-2 > button').first().click({ timeout: 6000 })
  await page.waitForTimeout(2800)
  await page.screenshot({ path: `${OUT}/deck-view.png` })
  console.log('deck-view ok')
} catch (e) {
  console.log('open deck ERR', e.message)
}

await browser.close()
console.log('done')
