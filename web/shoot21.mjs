import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots21'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3 })
const shot = async (n, t = 1000) => { await page.waitForTimeout(t); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(n, 'ok') }

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByText('qa-temp-printing').click({ timeout: 6000 }).catch((e) => console.log('open', e.message))
await page.waitForTimeout(1500)
// abre o seletor de versão da carta (botão ⇄)
await page.getByTitle('versão / arte').first().click({ timeout: 5000 }).catch((e) => console.log('versoes', e.message))
await shot('1-printing-picker', 2800) // grid de impressões do Scryfall
// escolhe a primeira versão com arte (pula o "Padrão")
await page.locator('[role=dialog] button:has(img)').first().click({ timeout: 5000 }).catch((e) => console.log('pick', e.message))
await shot('2-after-pick', 2000) // deck atualizado com a arte/preço escolhidos
await browser.close()
console.log('done')
