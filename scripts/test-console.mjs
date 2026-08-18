import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const errs = []
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
p.on('pageerror', e => errs.push('pageerror: ' + e.message))

await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
if (p.url().includes('/login')) {
  await p.fill('input[autocomplete="username"]', 'badyss')
  await p.fill('input[type="password"]', 'motdepassetest')
  await p.click('button[type="submit"]')
  await p.waitForURL('**/', { timeout: 15000 }).catch(() => {})
}
await p.goto('http://localhost:3000/servers/survie-test', { waitUntil: 'networkidle' })
await p.waitForTimeout(3000)

const status = await p.locator('text=/connectée|déconnectée/').first().textContent().catch(() => '?')
console.log('état WebSocket :', status?.trim())
console.log('lignes de journal reçues :', await p.locator('.overflow-y-auto p').count())

await p.fill('input[aria-label="Commande à envoyer au serveur"]', 'say test console')
await p.click('button[type="submit"]')
await p.waitForTimeout(2500)
console.log('lignes après commande :', await p.locator('.overflow-y-auto p').count())
const texts = await p.locator('.overflow-y-auto p').allTextContents()
console.log('3 dernières :', texts.slice(-3).map(t => t.slice(0, 90)))

await p.screenshot({ path: '/home/badyss/minemanager/.shots-console.png' })
if (errs.length) console.log('ERREURS CONSOLE :', errs.slice(0, 5))
await b.close()
