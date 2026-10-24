// يجهّز الملفات المدمجة في ملف التنصيب:
//   vendor/adblock/engine.bin   — محرك حاجب الإعلانات مبني مسبقاً (يعمل من أول تشغيل بدون إنترنت)
//   vendor/shield/*.txt.gz      — قاعدة بيانات المواقع الخطيرة الأولية
//   vendor/tor/                 — Tor Expert Bundle لويندوز (فقط مع --tor)
// كل جزء يفشل لا يوقف البناء؛ البرنامج يحمّل القوائم بنفسه عند أول تشغيل.
// برمجة و تطوير ابراهيم الخزرجي
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const VENDOR = path.join(ROOT, 'vendor')
const args = process.argv.slice(2)

// دعم البروكسي في بيئة البناء إن وُجد
try {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    const { setGlobalDispatcher, EnvHttpProxyAgent } = require('undici')
    setGlobalDispatcher(new EnvHttpProxyAgent())
  }
} catch {}

async function get(url, type = 'text') {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
  return type === 'buf' ? Buffer.from(await r.arrayBuffer()) : r.text()
}

async function adblock() {
  const { FiltersEngine, fullLists, fetchResources } = require('@ghostery/adblocker')
  const { ElectronBlocker } = require('@ghostery/adblocker-electron')
  const lists = [...fullLists, 'https://raw.githubusercontent.com/easylist/listear/master/Liste_AR.txt']
  const texts = []
  for (const u of lists) { try { texts.push(await get(u)); process.stdout.write('.') } catch (e) { console.log('\n  skip', u, e.message) } }
  if (texts.length < 5) throw new Error('too few lists downloaded')
  const engine = ElectronBlocker.parse(texts.join('\n'), { enableCompression: true, loadCosmeticFilters: true, loadNetworkFilters: true })
  try { const res = await fetchResources((u) => fetch(u)); engine.updateResources(res, '' + res.length) } catch (e) { console.log('\n  resources skipped', e.message) }
  fs.mkdirSync(path.join(VENDOR, 'adblock'), { recursive: true })
  fs.writeFileSync(path.join(VENDOR, 'adblock', 'engine.bin'), Buffer.from(engine.serialize()))
  console.log(`\n✓ adblock engine (${texts.length} lists)`)
}

async function shield() {
  const { SOURCES } = require('../src/features/shield-sources')
  fs.mkdirSync(path.join(VENDOR, 'shield'), { recursive: true })
  for (const s of SOURCES) {
    try {
      const t = await get(s.url)
      fs.writeFileSync(path.join(VENDOR, 'shield', s.id + '.txt.gz'), zlib.gzipSync(t, { level: 9 }))
      console.log('✓ shield', s.id, t.split('\n').length, 'lines')
    } catch (e) { console.log('  skip shield', s.id, e.message) }
  }
}

async function tor() {
  const dest = path.join(VENDOR, 'tor')
  let versions = []
  try {
    const html = await get('https://dist.torproject.org/torbrowser/')
    versions = [...html.matchAll(/href="(\d+\.\d+(?:\.\d+)?)\/"/g)].map(m => m[1])
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  } catch (e) { console.log('  tor listing failed', e.message) }
  versions.push('15.0')
  for (const v of [...new Set(versions)].slice(0, 4)) {
    for (const base of [`https://dist.torproject.org/torbrowser/${v}/`, `https://archive.torproject.org/tor-package-archive/torbrowser/${v}/`]) {
      const url = `${base}tor-expert-bundle-windows-x86_64-${v}.tar.gz`
      try {
        const buf = await get(url, 'buf')
        fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true })
        const tgz = path.join(VENDOR, 'tor.tar.gz'); fs.writeFileSync(tgz, buf)
        execFileSync('tar', ['-xzf', tgz, '-C', dest]); fs.rmSync(tgz)
        if (!fs.existsSync(path.join(dest, 'tor', 'tor.exe'))) throw new Error('tor.exe missing in archive')
        fs.writeFileSync(path.join(dest, 'VERSION.txt'), `Tor Expert Bundle ${v}\n${url}\n`)
        console.log('✓ tor', v)
        return
      } catch (e) { console.log('  tor', v, e.message) }
    }
  }
  throw new Error('could not download Tor Expert Bundle')
}

;(async () => {
  const jobs = []
  if (!args.length || args.includes('--adblock')) jobs.push(['adblock', adblock])
  if (!args.length || args.includes('--shield')) jobs.push(['shield', shield])
  if (args.includes('--tor')) jobs.push(['tor', tor])
  let failed = false
  for (const [n, f] of jobs) { try { await f() } catch (e) { console.error(`✗ ${n}: ${e.message}`); if (n === 'tor' && args.includes('--require-tor')) failed = true } }
  process.exit(failed ? 1 : 0)
})()
