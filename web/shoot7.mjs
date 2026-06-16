import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })

async function shot(name) {
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, 'ok')
}

await page.goto(base + '/commanders', { waitUntil: 'networkidle' }).catch(() => {})
await shot('1-commanders')

await page.goto(base + '/cards', { waitUntil: 'networkidle' }).catch(() => {})
await page.locator('input').first().fill('dragon')
await page.keyboard.press('Enter')
await page.waitForTimeout(2500)
await shot('2-cards')

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await shot('3-decks-list')
await page.locator('div.space-y-2 > button').first().click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /Gray Merchant/ }).first().click({ timeout: 4000 }).catch((e) => console.log('pin', e.message))
await shot('4-deck-pinned')

await page.goto(base + '/chat', { waitUntil: 'networkidle' }).catch(() => {})
await shot('5-chat')

await browser.close()
console.log('done')
