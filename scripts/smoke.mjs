import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()) })

await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
if (p.url().includes('/login')) {
  await p.fill('input[autocomplete="username"]', 'badyss')
  await p.fill('input[type="password"]', 'motdepassetest')
  await p.click('button[type="submit"]')
  await p.waitForURL('**/', { timeout: 15000 }).catch(() => {})
}

for (const [path, shot] of [
  ['/', '.shots-rack.png'],
  ['/servers/new', '.shots-new.png'],
  ['/settings', '.shots-settings.png'],
]) {
  errs.length = 0
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, t: document.title }))
  await p.screenshot({ path: shot })
  console.log(`${path.padEnd(14)} | ${o.sw > o.cw ? '❌ déborde' : '✅'} | titre: ${o.t}`)
  if (errs.length) console.log('   erreurs:', errs.slice(0, 3))
}
await b.close()
