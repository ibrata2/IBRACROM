// IBRA CROM — إشارات حسابك في Google Chrome
// برمجة و تطوير ابراهيم الخزرجي
// Chrome يحفظ إشارات حسابك (المتزامنة مع Google) في ملف على جهازك. IBRA CROM يقرأ هذا الملف
// ويعرضها بنفس الترتيب والمجلدات تحت شريط العنوان، ويحدّثها تلقائياً كلما تغيّرت في حسابك.
// ويدعم أيضاً ملف HTML (من Chrome أو Google Takeout) إذا لم يكن Chrome مثبتاً.
const fs = require('fs')
const path = require('path')

const BROWSERS = {
  chrome: { name: 'Google Chrome', dir: ['Google', 'Chrome', 'User Data'], linux: ['google-chrome'] },
  edge: { name: 'Microsoft Edge', dir: ['Microsoft', 'Edge', 'User Data'], linux: ['microsoft-edge'] },
  brave: { name: 'Brave', dir: ['BraveSoftware', 'Brave-Browser', 'User Data'], linux: ['BraveSoftware', 'Brave-Browser'] },
}

function userDataDir(b) {
  if (process.env.IBRA_CHROME_DIR && b === 'chrome') return process.env.IBRA_CHROME_DIR
  const B = BROWSERS[b]; if (!B) return null
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || '', ...B.dir)
  if (process.platform === 'darwin') return path.join(process.env.HOME || '', 'Library', 'Application Support', ...B.dir.slice(0, -1))
  return path.join(process.env.HOME || '', '.config', ...B.linux)
}

// كل الحسابات (profiles) الموجودة في المتصفح مع الإيميل
function listProfiles() {
  const out = []
  for (const b of Object.keys(BROWSERS)) {
    const root = userDataDir(b); if (!root) continue
    let info = {}, last = 'Default'
    try { const ls = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8')); info = ls.profile?.info_cache || {}; last = ls.profile?.last_used || last } catch {}
    const dirs = new Set(Object.keys(info))
    try { for (const d of fs.readdirSync(root)) if (/^(Default|Profile \d+)$/.test(d)) dirs.add(d) } catch {}
    for (const d of dirs) {
      const file = path.join(root, d, 'Bookmarks')
      if (!fs.existsSync(file)) continue
      const i = info[d] || {}
      out.push({ key: b + ':' + d, browser: b, browserName: BROWSERS[b].name, dir: d, file, name: i.gaia_name || i.name || d, email: i.user_name || '', last: d === last })
    }
  }
  return out
}

let seq = 0
function convert(node) {
  if (!node) return null
  if (node.type === 'url') return { t: 'u', n: node.name || '', u: node.url }
  return { t: 'f', n: node.name || '', c: (node.children || []).map(convert).filter(Boolean) }
}

// ملف HTML بصيغة Netscape (تصدير Chrome / Google Takeout)
function parseHtml(html) {
  const root = { t: 'f', n: '', c: [] }
  const stack = [root]
  let pendingFolder = null
  const re = /<(\/?)(DL|DT|H3|A)\b([^>]*)>([^<]*)/gi
  let m
  const dec = (x) => x.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
  while ((m = re.exec(html))) {
    const close = m[1] === '/', tag = m[2].toUpperCase(), attrs = m[3], text = m[4]
    const top = stack[stack.length - 1]
    if (tag === 'H3' && !close) { pendingFolder = { t: 'f', n: dec(text), c: [], bar: /PERSONAL_TOOLBAR_FOLDER/i.test(attrs) }; top.c.push(pendingFolder) }
    else if (tag === 'A' && !close) { const h = /HREF="([^"]*)"/i.exec(attrs); if (h) top.c.push({ t: 'u', n: dec(text) || h[1], u: dec(h[1]) }) }
    else if (tag === 'DL' && !close) { if (pendingFolder) { stack.push(pendingFolder); pendingFolder = null } else if (stack.length > 1 || root.c.length) { /* nested root DL */ } }
    else if (tag === 'DL' && close) { if (stack.length > 1) stack.pop() }
  }
  // أول مجلد «شريط الإشارات» هو الشريط، والباقي «إشارات أخرى»
  let bar = root.c.find(x => x.t === 'f' && x.bar) || root.c.find(x => x.t === 'f' && /bookmarks bar|شريط الإشارات/i.test(x.n))
  const rest = root.c.filter(x => x !== bar)
  return { bar: bar ? bar.c : [], other: rest, synced: [] }
}

module.exports = function createMirror(ctx) {
  let tree = null // { bar, other, synced, source, label, updatedAt }
  let watched = null

  const cfg = () => ctx.settings().bmMirror || { enabled: true, profile: '' }

  function pickProfile() {
    const c = cfg(); const all = listProfiles()
    if (c.profile && c.profile !== 'html') return all.find(p => p.key === c.profile) || null
    return all.find(p => p.browser === 'chrome' && p.last) || all.find(p => p.browser === 'chrome') || all.find(p => p.last) || all[0] || null
  }

  function load() {
    const c = cfg()
    if (c.enabled === false) { tree = null; unwatch(); ctx.changed(); return }
    if (c.profile === 'html') {
      try { tree = { ...JSON.parse(fs.readFileSync(path.join(ctx.userData, 'ibra-data', 'bookmarks-import.json'), 'utf8')), source: 'html' } } catch { tree = null }
      unwatch(); ctx.changed(); return
    }
    const p = pickProfile()
    if (!p) { tree = null; unwatch(); ctx.changed(); return }
    try {
      const j = JSON.parse(fs.readFileSync(p.file, 'utf8'))
      tree = {
        bar: (j.roots?.bookmark_bar?.children || []).map(convert).filter(Boolean),
        other: (j.roots?.other?.children || []).map(convert).filter(Boolean),
        synced: (j.roots?.synced?.children || []).map(convert).filter(Boolean),
        source: p.browser, label: p.browserName + (p.email ? ' — ' + p.email : p.name ? ' — ' + p.name : ''), key: p.key, updatedAt: Date.now(),
      }
    } catch { /* الملف قيد الكتابة من Chrome — نعيد المحاولة في المرة القادمة */ }
    watch(p.file)
    ctx.changed()
  }
  function unwatch() { if (watched) { fs.unwatchFile(watched); watched = null } }
  function watch(file) {
    if (watched === file) return
    unwatch(); watched = file
    fs.watchFile(file, { interval: 4000 }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) setTimeout(load, 600) })
  }

  function rootNodes() {
    if (!tree) return []
    const extra = []
    if (tree.other.length) extra.push({ t: 'f', n: 'إشارات أخرى', c: tree.other, special: 'other' })
    if (tree.synced.length) extra.push({ t: 'f', n: 'إشارات الجوال', c: tree.synced, special: 'synced' })
    return [...tree.bar, ...extra]
  }
  // للشريط: المستوى الأول فقط، والمجلدات تُفتح عند الطلب
  function bar() {
    if (!tree) return null
    return { label: tree.label || '', items: rootNodes().map((x, i) => x.t === 'u' ? { t: 'u', n: x.n, u: x.u, p: [i] } : { t: 'f', n: x.n, p: [i], count: x.c.length, special: x.special || '' }) }
  }
  function children(p) {
    let node = { c: rootNodes() }
    for (const i of p || []) { node = node.c?.[i]; if (!node) return [] }
    return (node.c || []).map((x, i) => x.t === 'u' ? { t: 'u', n: x.n, u: x.u, p: [...p, i] } : { t: 'f', n: x.n, p: [...p, i], count: x.c.length })
  }
  function flatUrls(limit = 6000) {
    const out = []
    const walk = (l) => { for (const x of l) { if (out.length >= limit) return; if (x.t === 'u') out.push({ url: x.u, title: x.n }); else walk(x.c) } }
    walk(rootNodes()); return out.map(x => ({ url: x.url, title: x.title || x.url }))
  }
  function importHtml(html) {
    const t = parseHtml(html)
    const count = (l) => l.reduce((n, x) => n + (x.t === 'u' ? 1 : count(x.c)), 0)
    const total = count(t.bar) + count(t.other)
    if (!total) return { ok: false }
    fs.mkdirSync(path.join(ctx.userData, 'ibra-data'), { recursive: true })
    fs.writeFileSync(path.join(ctx.userData, 'ibra-data', 'bookmarks-import.json'), JSON.stringify({ ...t, label: 'ملف إشارات مستورد', updatedAt: Date.now() }))
    ctx.setSettings({ bmMirror: { enabled: true, profile: 'html' } })
    load()
    return { ok: true, total }
  }

  return { load, bar, children, flatUrls, importHtml, profiles: listProfiles, info: () => ({ ...cfg(), active: tree ? { label: tree.label, source: tree.source, key: tree.key, updatedAt: tree.updatedAt, count: flatUrls(1e6).length } : null }) }
}
module.exports.parseHtml = parseHtml
