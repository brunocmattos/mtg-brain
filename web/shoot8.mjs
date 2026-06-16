import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots8'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })

async function shot(name) {
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, 'ok')
}

// 1. decks list with commander art thumbnails
await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await shot('1-decks-list')

// 2. open the Vito deck
await page.locator('div.space-y-2 > button').first().click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(2000)
await shot('2-deck-view')

// 3. empty chat with suggestion chips
await page.goto(base + '/chat', { waitUntil: 'networkidle' }).catch(() => {})
await shot('3-chat-empty')

await browser.close()
console.log('done')
