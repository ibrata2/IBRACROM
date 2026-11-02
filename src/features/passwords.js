// IBRA Passwords — مدير كلمات السر المدمج في IBRA CROM
// برمجة و تطوير ابراهيم الخزرجي
// • يحفظ اسم المستخدم وكلمة السر لكل موقع (مشفّرة بتشفير ويندوز الخاص بحسابك)
// • يملأها تلقائياً عند الدخول للموقع مرة ثانية
// • استيراد وتصدير ملف CSV بنفس صيغة Google Chrome
const { safeStorage } = require('electron')

function enc(s) {
  try { if (safeStorage.isEncryptionAvailable()) return 'e:' + safeStorage.encryptString(String(s)).toString('base64') } catch {}
  return 'p:' + Buffer.from(String(s)).toString('base64')
}
function dec(s) {
  if (!s) return ''
  try {
    if (s.startsWith('e:')) return safeStorage.decryptString(Buffer.from(s.slice(2), 'base64'))
    if (s.startsWith('p:')) return Buffer.from(s.slice(2), 'base64').toString()
  } catch {}
  return ''
}
const originOf = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : '' } catch { return '' } }
const siteOf = (o) => { try { return new URL(o).hostname.replace(/^www\./, '') } catch { return o } }

// تحليل CSV (يدعم علامات الاقتباس والأسطر داخل الحقول)
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows.filter(r => r.some(x => x !== ''))
}
const csvCell = (v) => /[",\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)

module.exports = function createPasswords(store) {
  let list = store.load('passwords', []) // { id, origin, username, pass(enc), created, used }
  let never = store.load('passwordsNever', []) // مواقع اختار "عدم الحفظ أبداً"
  const save = () => store.save('passwords', list)

  function forOrigin(origin) {
    const host = siteOf(origin)
    // نفس الموقع أو نطاقه الأساسي (accounts.google.com ↔ google.com)
    return list.filter(x => x.origin === origin || siteOf(x.origin) === host || host.endsWith('.' + siteOf(x.origin)) || siteOf(x.origin).endsWith('.' + host))
      .sort((a, b) => (b.used || 0) - (a.used || 0))
  }

  // ما يرسله الموقع لصفحته: أسماء المستخدمين + كلمات السر لنفس الأصل فقط
  function credentialsFor(origin) {
    return forOrigin(origin).map(x => ({ id: x.id, username: x.username, password: dec(x.pass) }))
  }

  // بعد تسجيل الدخول: هل نسأل المستخدم عن الحفظ؟
  function captured(origin, username, password) {
    if (!origin || !password) return null
    if (never.includes(origin)) return null
    const same = forOrigin(origin).find(x => x.username === username)
    if (same && dec(same.pass) === password) { same.used = Date.now(); save(); return null }
    return { origin, site: siteOf(origin), username, password, update: !!same }
  }

  function upsert({ origin, username, password }) {
    const ex = list.find(x => x.origin === origin && x.username === username)
    if (ex) { ex.pass = enc(password); ex.used = Date.now() }
    else list.push({ id: Date.now() + Math.random(), origin, username: username || '', pass: enc(password), created: Date.now(), used: Date.now() })
    save()
  }

  function markUsed(id) { const x = list.find(y => y.id === id); if (x) { x.used = Date.now(); save() } }
  function neverFor(origin) { if (!never.includes(origin)) { never.push(origin); store.save('passwordsNever', never) } }

  function all() {
    return list.map(x => ({ id: x.id, origin: x.origin, site: siteOf(x.origin), username: x.username, created: x.created, used: x.used }))
      .sort((a, b) => a.site.localeCompare(b.site))
  }
  function reveal(id) { const x = list.find(y => y.id === id); return x ? dec(x.pass) : '' }
  function remove(id) { list = list.filter(x => x.id !== id); save() }
  function edit(id, username, password) {
    const x = list.find(y => y.id === id); if (!x) return
    if (typeof username === 'string') x.username = username
    if (typeof password === 'string' && password) x.pass = enc(password)
    save()
  }
  function removeNever(origin) { never = never.filter(o => o !== origin); store.save('passwordsNever', never) }

  // استيراد ملف CSV من Chrome / Edge / Firefox
  function importCSV(text) {
    const rows = parseCSV(text)
    if (!rows.length) return { added: 0, updated: 0, skipped: 0 }
    const head = rows[0].map(h => h.trim().toLowerCase())
    const col = (...names) => head.findIndex(h => names.includes(h))
    let iu = col('url', 'origin', 'website', 'login_uri'), iun = col('username', 'login', 'user', 'login_username', 'email'), ip = col('password', 'login_password')
    let start = 1
    if (iu < 0 || ip < 0) { iu = 1; iun = 2; ip = 3; start = 0 } // ملف بدون عناوين: name,url,username,password
    let added = 0, updated = 0, skipped = 0
    for (const r of rows.slice(start)) {
      const origin = originOf((r[iu] || '').trim()), password = r[ip] || '', username = (iun >= 0 ? r[iun] : '') || ''
      if (!origin || !password) { skipped++; continue }
      const ex = list.find(x => x.origin === origin && x.username === username)
      if (ex) { if (dec(ex.pass) !== password) { ex.pass = enc(password); updated++ } else skipped++ }
      else { list.push({ id: Date.now() + Math.random(), origin, username, pass: enc(password), created: Date.now(), used: 0 }); added++ }
    }
    save()
    return { added, updated, skipped }
  }
  function exportCSV() {
    const lines = ['name,url,username,password,note']
    for (const x of list) lines.push([siteOf(x.origin), x.origin + '/', x.username, dec(x.pass), ''].map(csvCell).join(','))
    return lines.join('\r\n') + '\r\n'
  }

  return { credentialsFor, captured, upsert, markUsed, neverFor, all, reveal, remove, edit, removeNever, never: () => never.slice(), importCSV, exportCSV, originOf, count: () => list.length }
}
module.exports.parseCSV = parseCSV
