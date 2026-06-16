import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || './shots11'
mkdirSync(OUT, { recursive: true })
const base = 'http://localhost:8000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.3 })
const shot = async (n, t = 1200) => { await page.waitForTimeout(t); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log(n, 'ok') }

await page.goto(base + '/decks', { waitUntil: 'networkidle' }).catch(() => {})
console.log('title:', await page.title())
await shot('1-list-with-generator')

// fill the generate form
await page.getByPlaceholder('comandante (nome exato)').fill('Vito, Thorn of the Dusk Rose')
await page.getByPlaceholder('teto US$ (opc.)').fill('200')
await page.getByRole('button', { name: /Gerar/ }).click({ timeout: 5000 }).catch((e) => console.log('gerar', e.message))
await shot('2-generated-deck', 5000) // generation + auto-open

await page.getByRole('button', { name: /Grade/ }).click({ timeout: 4000 }).catch((e) => console.log('grade', e.message))
await shot('3-generated-grid', 2800)

// cleanup via the delete control
await page.getByRole('button', { name: /excluir deck/ }).click({ timeout: 4000 }).catch((e) => console.log('del', e.message))
await page.getByRole('button', { name: /Confirmar/ }).click({ timeout: 4000 }).catch((e) => console.log('confirm', e.message))
await shot('4-after-delete', 1800)

await browser.close()
console.log('done')
