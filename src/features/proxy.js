// IBRA Proxy — بروكسي لكل لسان على حدة في IBRA CROM
// برمجة و تطوير ابراهيم الخزرجي
// الألسن التي يُفعَّل لها البروكسي تعمل في جلسة مستقلة (persist:ibracrom-proxy) يمر كل اتصالها عبر:
//   • Tor المدمج (يفتح المواقع المحجوبة، مع جسور Snowflake/obfs4 إذا كان Tor نفسه محجوباً)
//   • أو بروكسي خاص بك (HTTP / HTTPS / SOCKS5 / SOCKS4)
// باقي الألسن لا تتأثر إطلاقاً.
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { session, safeStorage } = require('electron')

const PARTITION = 'persist:ibracrom-proxy'
const BASE_PORT = 9157

module.exports = function createProxy(ctx) {
  const ses = session.fromPartition(PARTITION)
  const torRoot = process.env.IBRA_TOR_DIR || path.join(ctx.vendorDir, 'tor')
  const torExe = process.env.IBRA_TOR_BIN || path.join(torRoot, 'tor', process.platform === 'win32' ? 'tor.exe' : 'tor')
  const state = { status: 'off', progress: 0, message: '', transport: '', port: 0 }
  let proc = null
  let applied = ''
  let attempt = 0
  let stallTimer = null
  const waiters = new Set()

  const S = () => ctx.settings()
  const mode = () => (S().proxyMode === 'custom' ? 'custom' : 'tor')
  const torAvailable = () => fs.existsSync(torExe)

  function set(patch) { Object.assign(state, patch); ctx.changed(); if (state.status === 'ready') { for (const f of waiters) f(); waiters.clear() } }

  // ── كلمة سر البروكسي الخاص تُحفظ مشفرة ──
  function encPass(p) {
    if (!p) return ''
    try { if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(p).toString('base64') } catch {}
    return 'b64:' + Buffer.from(p).toString('base64')
  }
  function decPass(p) {
    if (!p) return ''
    try {
      if (p.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(p.slice(4), 'base64'))
      if (p.startsWith('b64:')) return Buffer.from(p.slice(4), 'base64').toString()
    } catch {}
    return p
  }
  function custom() { const c = S().proxyCustom || {}; return { scheme: c.scheme || 'socks5', host: (c.host || '').trim(), port: +c.port || 0, user: c.user || '', pass: decPass(c.pass) } }

  // ── Tor ──
  function readPtConfig() {
    for (const f of [path.join(torRoot, 'tor', 'pluggable_transports', 'pt_config.json'), path.join(torRoot, 'pt_config.json')]) {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch {}
    }
    return null
  }
  // ترتيب طرق الاتصال: مباشر ← Snowflake ← obfs4 ← meek (في الوضع التلقائي)
  function transportsToTry() {
    const t = S().torTransport || 'auto'
    if (t === 'auto') return ['direct', 'snowflake', 'obfs4', 'meek']
    return [t]
  }
  function torArgs(transport, port) {
    const dataDir = path.join(ctx.userData, 'tor-data')
    fs.mkdirSync(dataDir, { recursive: true })
    const args = ['-f', path.join(dataDir, 'torrc-empty'), '--ignore-missing-torrc',
      '--SocksPort', '127.0.0.1:' + port, '--DataDirectory', dataDir, '--ClientOnly', '1', '--Log', 'notice stdout',
      '--AvoidDiskWrites', '1']
    const geo = path.join(torRoot, 'data', 'geoip'), geo6 = path.join(torRoot, 'data', 'geoip6')
    if (fs.existsSync(geo)) args.push('--GeoIPFile', geo)
    if (fs.existsSync(geo6)) args.push('--GeoIPv6File', geo6)
    if (transport === 'direct') return args
    const pt = readPtConfig() || {}
    let bridges = []
    if (transport === 'custom') bridges = (S().torBridges || '').split('\n').map(s => s.trim().replace(/^bridge\s+/i, '')).filter(Boolean)
    else {
      const b = pt.bridges || {}
      bridges = b[transport] || (transport === 'meek' ? (b['meek-azure'] || b.meek_lite || []) : [])
    }
    if (!bridges.length) return null
    args.push('--UseBridges', '1')
    // مسار نسبي (بدون مسافات) لأن Tor لا يقبل مسافات في مسار برنامج الجسور — نشغّل Tor من مجلده
    for (const line of Object.values(pt.pluggableTransports || {})) {
      args.push('+ClientTransportPlugin', String(line).replace(/\$\{pt_path\}/g, 'tor' + path.sep + 'pluggable_transports' + path.sep))
    }
    bridges.forEach(b => args.push('+Bridge', b))
    return args
  }

  function stopTor() {
    clearTimeout(stallTimer)
    if (proc) { try { proc.kill() } catch {} proc = null }
  }

  function startTor(i = 0, portOffset = 0) {
    stopTor()
    const list = transportsToTry()
    if (i >= list.length) { set({ status: 'error', message: 'تعذر الاتصال بشبكة Tor بكل الطرق. جرّب «جسور مخصصة» أو بروكسي خاص من الإعدادات.' }); return }
    const transport = list[i]
    const port = BASE_PORT + portOffset
    const args = torArgs(transport, port)
    if (!args) return startTor(i + 1)
    const myAttempt = ++attempt
    set({ status: 'starting', progress: 0, transport, port, message: transport === 'direct' ? 'جاري الاتصال بشبكة Tor…' : `جاري الاتصال عبر جسور ${transport}…` })
    try { fs.writeFileSync(path.join(ctx.userData, 'tor-data', 'torrc-empty'), '') } catch {}
    try {
      proc = spawn(torExe, args, { cwd: fs.existsSync(torRoot) ? torRoot : undefined, windowsHide: true })
      proc.on('error', (e) => { if (myAttempt === attempt) set({ status: 'error', message: 'تعذر تشغيل Tor: ' + e.message }) })
    } catch (e) { set({ status: 'error', message: 'تعذر تشغيل Tor: ' + e.message }); return }
    let lastProgress = 0
    // إذا توقف التقدم 45 ثانية ننتقل للطريقة التالية
    const arm = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => { if (myAttempt === attempt && state.status !== 'ready') startTor(i + 1) }, transport === 'direct' ? 40000 : 70000) }
    arm()
    const onLine = (line) => {
      if (myAttempt !== attempt) return
      const m = line.match(/Bootstrapped (\d+)%[^:]*(?::\s*(.*))?/)
      if (m) {
        const p = +m[1]
        if (p > lastProgress) { lastProgress = p; arm() }
        if (p >= 100) { clearTimeout(stallTimer); set({ status: 'ready', progress: 100, message: transport === 'direct' ? 'متصل بشبكة Tor' : `متصل بشبكة Tor عبر ${transport}` }); applySession() }
        else set({ progress: p, message: `جاري الاتصال بشبكة Tor… ${p}%` })
      }
      if (/Could not bind|Address already in use/i.test(line) && portOffset < 8) { attempt++; setTimeout(() => startTor(i, portOffset + 1), 300) }
    }
    let buf = ''
    proc.stdout.on('data', (d) => { buf += d.toString(); const lines = buf.split(/\r?\n/); buf = lines.pop(); lines.forEach(onLine) })
    proc.stderr.on('data', (d) => d.toString().split(/\r?\n/).forEach(onLine))
    proc.on('exit', (code) => {
      if (myAttempt !== attempt) return
      proc = null
      if (state.status !== 'off') { set({ status: 'error', message: 'توقف Tor (رمز ' + code + ')' }); setTimeout(() => { if (myAttempt === attempt) startTor(i + 1) }, 1500) }
    })
  }

  async function applySession() {
    let rules = ''
    if (mode() === 'custom') { const c = custom(); if (c.host && c.port) rules = `${c.scheme}://${c.host}:${c.port}` }
    else if (state.status === 'ready') rules = `socks5://127.0.0.1:${state.port}`
    if (rules === applied) return
    applied = rules
    // بدون بروكسي جاهز نوجّه الجلسة لعنوان مغلق حتى لا يتسرب أي طلب مباشرة
    await ses.setProxy(rules ? { proxyRules: rules, proxyBypassRules: '<local>' } : { proxyRules: 'socks5://127.0.0.1:1', proxyBypassRules: '<local>' })
    try { await ses.closeAllConnections() } catch {}
  }

  // يُستدعى عند فتح أول لسان بروكسي، وعند تغيير الإعدادات
  async function ensure() {
    if (S().proxyEnabled === false) return
    if (mode() === 'custom') {
      stopTor(); attempt++
      const c = custom()
      if (!c.host || !c.port) set({ status: 'error', message: 'أدخل عنوان ومنفذ البروكسي الخاص من الإعدادات' })
      else set({ status: 'ready', progress: 100, transport: 'custom', message: `${c.scheme.toUpperCase()} ${c.host}:${c.port}` })
      await applySession()
      return
    }
    if (!torAvailable()) { await applySession(); set({ status: 'error', message: 'Tor غير موجود في هذه النسخة — استخدم بروكسي خاص من الإعدادات' }); return }
    if (state.status === 'ready' && proc) return applySession()
    if (state.status === 'starting' && proc) return
    await applySession()
    startTor(0)
  }

  function restart() { stopTor(); attempt++; set({ status: 'off', progress: 0, message: '' }); applied = '__'; return ensure() }
  function shutdown() { attempt++; stopTor(); set({ status: 'off', progress: 0, message: '' }) }

  // بيانات دخول البروكسي الخاص
  function login(authInfo) {
    if (!authInfo.isProxy || mode() !== 'custom') return null
    const c = custom()
    return c.user ? { user: c.user, pass: c.pass } : null
  }

  function whenReady(fn) { if (state.status === 'ready') fn(); else waiters.add(fn) }

  return {
    session: ses, partition: PARTITION, ensure, restart, shutdown, login, whenReady, encPass,
    info: () => ({
      enabled: S().proxyEnabled !== false, mode: mode(), torAvailable: torAvailable(), torTransport: S().torTransport || 'auto',
      ...state, custom: (() => { const c = custom(); return { scheme: c.scheme, host: c.host, port: c.port || '', user: c.user, hasPass: !!c.pass } })(),
      bridges: S().torBridges || '',
    }),
  }
}
