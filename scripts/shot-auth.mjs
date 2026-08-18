import { chromium } from 'playwright'
const [url, out, w = 1280, h = 900] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 })
await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
if (p.url().includes('/login')) {
  await p.fill('input[autocomplete="username"]', 'badyss')
  await p.fill('input[type="password"]', 'motdepassetest')
  await p.click('button[type="submit"]')
  await p.waitForURL('**/', { timeout: 15000 }).catch(() => {})
}
await p.goto(url, { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
if (o.sw > o.cw) console.log(`⚠️  débordement horizontal: ${o.sw} > ${o.cw}`)
await p.screenshot({ path: out })
await b.close()
console.log('→', out)
