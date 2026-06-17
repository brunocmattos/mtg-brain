import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots17'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3 })
const shot = async (n, t = 900) => { await page.waitForTimeout(t); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(n, 'ok') }

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
await page.getByRole('button', { name: /Importar decklist/ }).click({ timeout: 5000 }).catch((e) => console.log('open', e.message))
await shot('1-importer-open', 900)

await page.getByPlaceholder('nome do deck (opcional)').fill('Teste Import')
await page.locator('textarea').fill('1 Sol Ring\n1 Gravecrawler\n1 Counterspell\n2 Island\n1 Notacardname Fake\n')
await page.getByRole('button', { name: 'Importar', exact: true }).click({ timeout: 4000 }).catch((e) => console.log('imp', e.message))
await shot('2-import-result', 2500)

await browser.close()
console.log('done')
