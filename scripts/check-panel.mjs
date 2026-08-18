import { chromium } from 'playwright'
const b = await chromium.launch()
const errs = []
const PATHS = ['/', '/servers/new', '/servers/import', '/settings',
  '/servers/cobble-plus', '/servers/cobble-plus/console',
  '/servers/cobble-plus/files', '/servers/cobble-plus/players',
  '/servers/cobble-plus/config', '/servers/cobble-plus/version',
  '/servers/cobble-plus/backups', '/servers/cobble-plus/schedules',
  '/servers/cobble-plus/maintenance',
  '/servers/cobble-plus/danger']

for (const [w, label] of [[390,'mobile'],[900,'tablette'],[1440,'bureau']]) {
  const p = await b.newPage({ viewport: { width: w, height: 950 }, deviceScaleFactor: w===1440?2:1 })
  p.on('pageerror', e => errs.push(`${label}: ${e.message}`))
  p.on('console', m => { if (m.type()==='error' && !/favicon/.test(m.text())) errs.push(`${label}: ${m.text()}`) })
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  if (p.url().includes('/login')) {
    await p.fill('input[autocomplete="username"]','badyss')
    await p.fill('input[type="password"]','motdepassetest')
    await p.click('button[type="submit"]'); await p.waitForURL('**/').catch(()=>{})
  }
  let bad = 0
  for (const path of PATHS) {
    await p.goto('http://localhost:3000'+path, { waitUntil: 'networkidle' })
    await p.waitForTimeout(700)
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    if (o.sw > o.cw) { console.log(`  ❌ ${label} ${path} déborde ${o.sw}>${o.cw}`); bad++ }
  }
  if (w===1440) {
    await p.goto('http://localhost:3000/servers/import'); await p.waitForTimeout(1200); await p.screenshot({path:'.shots-import.png'})
    await p.goto('http://localhost:3000/servers/cobble-plus/version'); await p.waitForTimeout(2500); await p.screenshot({path:'.shots-version.png'})
    await p.goto('http://localhost:3000/servers/cobble-plus/files'); await p.waitForTimeout(2000); await p.screenshot({path:'.shots-files.png'})
  }
  if (w===390) { await p.goto('http://localhost:3000/servers/cobble-plus'); await p.waitForTimeout(1500); await p.screenshot({path:'.shots-panel-mobile.png'}) }
  console.log(`  ${bad ? '⚠️' : '✅'} ${label} — ${PATHS.length} pages`)
  await p.close()
}
console.log(errs.length ? '  erreurs: ' + [...new Set(errs)].slice(0,4).join(' | ') : '  aucune erreur console')
await b.close()
