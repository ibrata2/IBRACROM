// IBRA Shield — فاحص فيروسات المواقع المدمج في IBRA CROM
// برمجة و تطوير ابراهيم الخزرجي
// 1) يحجب المواقع المعروفة بنشر البرمجيات الخبيثة والتصيد والاحتيال (قوائم تتحدث تلقائياً)
// 2) يفحص الملفات المنزّلة ببرنامج Windows Defender الموجود في ويندوز
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { execFile } = require('child_process')
const { Worker } = require('worker_threads')
const { net } = require('electron')

const { SOURCES } = require('./shield-sources')
const REFRESH_MS = 12 * 3600e3

const { key, bsearch, norm, isSafe } = require('./shield-parse')

module.exports = function createShield(ctx) {
  const dir = path.join(ctx.userData, 'shield')
  const seedDir = path.join(ctx.vendorDir, 'shield')
  const sets = {} // kind -> Float64Array مرتبة
  const meta = {} // id -> { count, updatedAt, ok }
  const stats = ctx.store.load('shieldStats', { blocked: 0, scanned: 0, threats: 0 })
  const allowOnce = new Set()
  let refreshing = null

  const enabled = () => ctx.settings().shieldEnabled !== false


  // البناء يتم في خيط منفصل (worker) حتى لا يتجمد المتصفح أثناء تحليل مئات آلاف المواقع
  let building = null
  function rebuild() {
    if (building) return building
    building = new Promise((resolve) => {
      const files = SOURCES.map(s => ({ id: s.id, kind: s.kind, files: [path.join(dir, s.id + '.txt.gz'), path.join(seedDir, s.id + '.txt.gz')] }))
      const wpath = path.join(__dirname, 'shield-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
      let w
      try { w = new Worker(wpath, { workerData: files }) } catch (e) { console.error('shield worker', e.message); building = null; return resolve(false) }
      w.once('message', (r) => {
        for (const [k, buf] of Object.entries(r.sets)) sets[k] = new Float64Array(buf)
        Object.assign(meta, r.meta)
        building = null; ctx.changed(); resolve(true)
      })
      w.once('error', (e) => { console.error('shield worker', e.message); building = null; resolve(false) })
    })
    return building
  }

  async function refresh(force) {
    if (refreshing) return refreshing
    refreshing = (async () => {
      let any = false
      fs.mkdirSync(dir, { recursive: true })
      for (const s of SOURCES) {
        const f = path.join(dir, s.id + '.txt.gz')
        let age = Infinity; try { age = Date.now() - fs.statSync(f).mtimeMs } catch {}
        if (!force && age < REFRESH_MS) continue
        try {
          const r = await net.fetch(s.url, { cache: 'no-store' })
          if (!r.ok) throw new Error('HTTP ' + r.status)
          const text = await r.text()
          if (text.length < 50) throw new Error('empty')
          fs.writeFileSync(f + '.tmp', zlib.gzipSync(text)); fs.renameSync(f + '.tmp', f)
          any = true
        } catch (e) { console.error('shield list', s.id, e.message); if (meta[s.id]) meta[s.id].error = e.message }
      }
      if (any) await rebuild()
      refreshing = null
      return any
    })()
    return refreshing
  }

  function init() {
    rebuild()
    setTimeout(() => refresh(false), 15000)
    setInterval(() => refresh(false), 3600e3)
  }

  // هل هذا العنوان خطير؟ يرجع نوع الخطر أو null
  function check(url) {
    if (!enabled()) return null
    let host; try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return null; host = norm(u.hostname) } catch { return null }
    if (!host || allowOnce.has(host) || isSafe(host)) return null
    const k = key(host)
    for (const kind of ['malware', 'phishing', 'scam']) if (sets[kind] && bsearch(sets[kind], k)) return kind
    return null
  }

  function blocked() { stats.blocked++; ctx.store.save('shieldStats', stats, 3000); ctx.changed() }
  function allow(url) { try { allowOnce.add(norm(new URL(url).hostname)) } catch {} }

  // ── فحص التنزيلات بـ Windows Defender ──
  function defenderPath() {
    if (process.platform !== 'win32') return null
    const plat = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows Defender', 'Platform')
    try {
      const vers = fs.readdirSync(plat).filter(d => fs.existsSync(path.join(plat, d, 'MpCmdRun.exe'))).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      if (vers.length) return path.join(plat, vers[vers.length - 1], 'MpCmdRun.exe')
    } catch {}
    const p = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe')
    return fs.existsSync(p) ? p : null
  }
  function scanFile(file) {
    return new Promise((resolve) => {
      if (!enabled() || ctx.settings().shieldScanDownloads === false) return resolve(null)
      const exe = process.env.IBRA_TEST_SCANNER || defenderPath()
      if (!exe) return resolve('unavailable')
      execFile(exe, ['-Scan', '-ScanType', '3', '-File', file, '-DisableRemediation'], { windowsHide: true, timeout: 180000 }, (err) => {
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
        stats.scanned++
        let r = code === 0 ? 'clean' : code === 2 ? 'threat' : 'error'
        if (r === 'threat') stats.threats++
        ctx.store.save('shieldStats', stats, 1000)
        ctx.changed()
        resolve(r)
      })
    })
  }

  return {
    init, refresh, check, blocked, allow, scanFile,
    info: () => ({
      enabled: enabled(), scanDownloads: ctx.settings().shieldScanDownloads !== false, defender: !!(process.env.IBRA_TEST_SCANNER || defenderPath()),
      refreshing: !!refreshing, stats: { ...stats },
      lists: SOURCES.map(s => ({ id: s.id, name: s.name, kind: s.kind, ...(meta[s.id] || {}) })),
      total: Object.values(sets).reduce((n, a) => n + a.length, 0),
    }),
  }
}
module.exports.SOURCES = SOURCES
