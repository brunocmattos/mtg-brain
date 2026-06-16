// Screenshots das telas do mtg-brain pra análise visual.
// Uso: node shoot.mjs <pasta-de-saida>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('PAGEERR:', m.text())
})

async function go(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1800)
}

await go('/commanders')
await page.screenshot({ path: `${OUT}/1-commanders.png` })
console.log('1-commanders ok')

try {
  await page.locator('div.grid button').first().click({ timeout: 8000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/2-commander-detail.png` })
  console.log('2-detail ok')
  await page.keyboard.press('Escape')
} catch (e) {
  console.log('detail ERR', e.message)
}

await go('/cards')
try {
  await page.locator('input').first().fill('dragon')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2800)
} catch (e) {
  console.log('cards ERR', e.message)
}
await page.screenshot({ path: `${OUT}/3-cards-dragon.png` })
console.log('3-cards ok')

await go('/chat')
await page.screenshot({ path: `${OUT}/4-chat.png` })
console.log('4-chat ok')

await browser.close()
console.log('done')
