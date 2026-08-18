import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 })
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type()==='error' && !/favicon/.test(m.text())) errs.push(m.text()) })

await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
if (p.url().includes('/login')) {
  await p.fill('input[autocomplete="username"]','badyss')
  await p.fill('input[type="password"]','motdepassetest')
  await p.click('button[type="submit"]'); await p.waitForURL('**/').catch(()=>{})
}

for (const [path, shot] of [
  ['/', '.shots-panel-rack.png'],
  ['/servers/cobble-plus', '.shots-panel-dash.png'],
  ['/servers/cobble-plus/files', '.shots-panel-files.png'],
  ['/servers/cobble-plus/players', '.shots-panel-players.png'],
]) {
  await p.goto('http://localhost:3000'+path, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1800)
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, t: document.title }))
  console.log(`  ${path.padEnd(32)} ${o.sw>o.cw?'❌ déborde':'✅'}  ${o.t}`)
  await p.screenshot({ path: shot })
}
if (errs.length) console.log('  erreurs:', [...new Set(errs)].slice(0,4))
await b.close()
