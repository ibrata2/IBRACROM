// IBRA CROM — الصفحات الداخلية | برمجة و تطوير ابراهيم الخزرجي
const I = window.ICONS
const app = document.getElementById('app')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fav = (url) => { try { return 'https://www.google.com/s2/favicons?sz=64&domain=' + new URL(url).hostname } catch { return '' } }
const fmt = (b) => { if (!b && b !== 0) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++ } return b.toFixed(i ? 1 : 0) + ' ' + u[i] }
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
function toast(msg) { const t = h(`<div class="toast">${esc(msg)}</div>`); document.body.appendChild(t); setTimeout(() => t.remove(), 2600) }

let CFG = { settings: { theme: 'glass' } }
async function loadCfg() {
  CFG = await ibra.getSettings()
  document.documentElement.dataset.theme = CFG.settings.theme
  document.documentElement.classList.toggle('no-blur', !CFG.blur)
}

const NAV = [
  ['settings', 'الإعدادات', 'settings'],
  ['history', 'السجل', 'history'],
  ['downloads', 'التنزيلات', 'download'],
  ['bookmarks', 'الإشارات المرجعية', 'bookmark'],
  ['extensions', 'الإضافات', 'puzzle'],
  ['about', 'حول IBRA CROM', 'info'],
]
function shell(active, inner) {
  return `<div class="layout">
    <aside class="side">
      <div class="logo"><img src="../assets/logo64.png" alt=""><div>IBRA CROM<small>متصفح مبني على Chromium</small></div></div>
      <nav class="nav">${NAV.map(([k, t, ic]) => `<a href="#${k}" class="${k === active ? 'on' : ''}">${I[ic]}<span>${t}</span></a>`).join('')}</nav>
      <div class="sig">برمجة و تطوير <b>ابراهيم الخزرجي</b></div>
    </aside>
    <main>${inner}</main>
  </div>`
}

const route = () => (location.hash.slice(1).split(/[|?]/)[0] || 'newtab')
async function render() {
  await loadCfg()
  const r = route()
  const fn = PAGES[r] || PAGES.newtab
  document.title = TITLES[r] || 'IBRA CROM'
  await fn()
}
const TITLES = { newtab: 'علامة تبويب جديدة', settings: 'الإعدادات', history: 'السجل', downloads: 'التنزيلات', bookmarks: 'الإشارات المرجعية', extensions: 'الإضافات', about: 'حول IBRA CROM', error: 'تعذر الوصول', blocked: 'موقع خطير!', proxywait: 'جاري الاتصال بالبروكسي…' }
window.addEventListener('hashchange', render)
ibra.onChanged(async (what) => {
  if (what === 'settings') { await loadCfg(); if (route() === 'settings' || route() === 'newtab') render() }
  if (what === 'extensions' && route() === 'extensions') render()
  if (what === 'features' && route() === 'extensions') render()
  if ((what === 'features' || what === 'settings') && route() === 'settings') refreshProxyStatus()
  if (what === 'bookmarks' && (route() === 'bookmarks' || route() === 'newtab')) render()
})

const PAGES = {}

// ═════════ علامة تبويب جديدة ═════════
PAGES.newtab = async () => {
  const eng = CFG.engines?.[CFG.settings.searchEngine] || 'Google'
  const { bookmarks, top } = await ibra.topSites()
  const seen = new Set(); const tiles = []
  for (const b of [...top, ...bookmarks]) {
    let host; try { host = new URL(b.url).hostname } catch { continue }
    if (seen.has(host)) continue; seen.add(host)
    tiles.push({ url: b.url, title: (b.title || host).split(/ [-|–] /)[0], host })
    if (tiles.length >= 9) break
  }
  if (!tiles.length) {
    for (const [u, t] of [['https://www.google.com/', 'Google'], ['https://www.youtube.com/', 'YouTube'], ['https://www.facebook.com/', 'Facebook'], ['https://www.instagram.com/', 'Instagram'], ['https://web.whatsapp.com/', 'WhatsApp'], ['https://chromewebstore.google.com/', 'سوق Chrome'], ['https://t.me/ibraprogram', 'IBRAPROGRAM']]) {
      tiles.push({ url: u, title: t, host: new URL(u).hostname })
    }
  }
  app.innerHTML = `<div class="ntp">
    <div class="mark"><img src="../assets/logo.png" alt=""><div class="wm">IBRA <span>CROM</span><small>برمجة و تطوير ابراهيم الخزرجي</small></div></div>
    <form id="sf"><span class="sico">${I.search}</span><input class="sbox" id="q" autocomplete="off" placeholder="ابحث في ${esc(eng)} أو اكتب عنوان URL" autofocus></form>
    <div class="tiles">${tiles.map(t => `<a class="tile" href="${esc(t.url)}" title="${esc(t.title)}"><span class="ti"><img src="${esc(fav(t.url))}" alt="" data-l="${esc((t.title || '?')[0].toUpperCase())}"></span><span class="tt">${esc(t.title)}</span></a>`).join('')}
      <a class="tile add" href="#bookmarks"><span class="ti">${I.plus}</span><span class="tt">إضافة اختصار</span></a></div>
    <div class="quick">
      <button class="btn" data-go="ibra://extensions">${I.puzzle} الإضافات</button>
      <button class="btn" data-go="https://chromewebstore.google.com/">${I.store} سوق Chrome</button>
      <button class="btn" data-go="ibra://history">${I.history} السجل</button>
      <button class="btn" data-go="ibra://settings">${I.settings} الإعدادات</button>
    </div>
    <div class="foot">IBRA CROM — مبني على محرك Chromium · برمجة و تطوير <b>ابراهيم الخزرجي</b></div>
  </div>`
  app.querySelectorAll('.ti img').forEach(img => img.addEventListener('error', () => { img.replaceWith(document.createTextNode(img.dataset.l)) }))
  app.querySelector('#sf').addEventListener('submit', (e) => { e.preventDefault(); const v = app.querySelector('#q').value.trim(); if (v) ibra.navigate(v) })
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => ibra.navigate(b.dataset.go)))
  setTimeout(() => app.querySelector('#q')?.focus(), 50)
}

// ═════════ الإعدادات ═════════
PAGES.settings = async () => {
  const s = CFG.settings
  const sw = (key, label, sub = '') => `<div class="row"><div class="rt"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div><label class="switch"><input type="checkbox" data-k="${key}" ${s[key] ? 'checked' : ''}><i></i></label></div>`
  app.innerHTML = shell('settings', `
    <h1>الإعدادات</h1>
    <h2>المظهر</h2>
    <div class="card">
      <div class="themes">
        ${[['glass', 'زجاجي'], ['light', 'أبيض عادي'], ['dark', 'ليلي']].map(([k, t]) => `<button class="theme-opt ${s.theme === k ? 'on' : ''}" data-theme-opt="${k}"><div class="pv ${k}"><div class="t"></div><div class="b"></div></div>${t}</button>`).join('')}
      </div>
      ${sw('showBookmarksBar', 'إظهار شريط الإشارات المرجعية')}
      ${sw('showHomeButton', 'إظهار زر الصفحة الرئيسية')}
    </div>
    <h2>محرك البحث</h2>
    <div class="card">
      <div class="row"><div class="rt"><b>محرك البحث المستخدم في شريط العنوان</b></div>
        <select id="engine">${Object.entries(CFG.engines).map(([k, n]) => `<option value="${k}" ${s.searchEngine === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <h2>عند بدء التشغيل</h2>
    <div class="card">
      ${[['newtab', 'فتح صفحة علامة التبويب الجديدة'], ['restore', 'المتابعة من حيث توقفت'], ['home', 'فتح الصفحة الرئيسية']].map(([k, t]) => `<label class="check-row"><input type="radio" name="startup" value="${k}" ${s.startup === k ? 'checked' : ''}>${t}</label>`).join('')}
      <div class="row"><div class="rt"><b>الصفحة الرئيسية</b><span>اتركها ibra://newtab أو اكتب عنوان موقع</span></div><input type="text" id="homepage" dir="ltr" value="${esc(s.homepage)}"></div>
    </div>
    <h2>التنزيلات</h2>
    <div class="card">
      <div class="row"><div class="rt"><b>المكان</b><span dir="ltr" style="text-align:right">${esc(CFG.downloadsDir)}</span></div><button class="btn" id="dldir">${I.folder} تغيير</button></div>
      ${sw('askWhereToSave', 'السؤال عن مكان حفظ كل ملف قبل تنزيله')}
    </div>
    <h2>IBDM Pro — مدير التحميل المدمج</h2>
    <div class="card">
      <div class="row"><div class="ric ibdm-ic">${I.download}</div><div class="rt"><b>${CFG.ibdm ? 'متصل ببرنامج IBDM Pro ' + esc(CFG.ibdm.version || '') : 'برنامج IBDM Pro غير مشغّل'}</b><span>${CFG.ibdm ? 'التحميلات تُسلَّم له تلقائياً حسب أنواع الملفات المحددة في البرنامج' : 'شغّل IBDM Pro ليستلم التحميلات، وإلا يحمّل المتصفح بنفسه'}</span></div>
        ${CFG.ibdm ? `<button class="btn" id="ibdmshow">فتح IBDM Pro</button>` : `<button class="btn" id="ibdmcheck">${I.refresh} إعادة الفحص</button><a class="btn" href="https://t.me/ibraprogram">تحميل IBDM Pro</a>`}</div>
      ${sw('ibdmCapture', 'تسليم التحميلات لـ IBDM Pro بدل المتصفح', 'زر IBDM في شريط الأدوات يعرض الفيديوهات الموجودة في الصفحة لتحميلها بالجودة التي تختارها')}
    </div>
    <h2 id="proxy">البروكسي (IBRA Proxy)</h2>
    <div class="card" id="pxcard"></div>
    <h2>المتصفح الافتراضي</h2>
    <div class="card">
      <div class="row"><div class="ric"><img src="../assets/logo64.png" alt=""></div><div class="rt"><b>اجعل IBRA CROM متصفحك الافتراضي</b><span>ستفتح إعدادات ويندوز، اختر IBRA CROM لروابط HTTP و HTTPS</span></div><button class="btn primary" id="defb">تعيين كافتراضي</button></div>
    </div>
    <h2>الخصوصية والأمان</h2>
    <div class="card">
      <div class="check-row"><input type="checkbox" id="c_history" checked>سجل التصفح</div>
      <div class="check-row"><input type="checkbox" id="c_cookies">ملفات تعريف الارتباط وبيانات المواقع (سيتم تسجيل خروجك)</div>
      <div class="check-row"><input type="checkbox" id="c_cache" checked>الصور والملفات المخزنة مؤقتاً</div>
      <div class="check-row"><input type="checkbox" id="c_downloads">قائمة التنزيلات</div>
      <div class="check-row"><input type="checkbox" id="c_permissions">أذونات المواقع (الكاميرا، الموقع، الإشعارات)</div>
      <div class="row"><div class="rt"></div><button class="btn danger" id="clear">${I.trash} محو بيانات التصفح</button></div>
    </div>
    <h2>متقدم</h2>
    <div class="card">
      <div class="row click" id="ud"><div class="rt"><b>فتح مجلد بيانات المتصفح</b><span>الإعدادات والإضافات والسجل</span></div>${I.folder}</div>
      <div class="row"><div class="rt"><b>إعادة الإعدادات إلى الوضع الافتراضي</b></div><button class="btn" id="reset">إعادة تعيين</button></div>
    </div>`)
  app.querySelectorAll('[data-theme-opt]').forEach(b => b.addEventListener('click', () => ibra.setSettings({ theme: b.dataset.themeOpt })))
  app.querySelectorAll('input[data-k]').forEach(c => c.addEventListener('change', () => ibra.setSettings({ [c.dataset.k]: c.checked })))
  app.querySelector('#engine').addEventListener('change', (e) => ibra.setSettings({ searchEngine: e.target.value }))
  app.querySelectorAll('input[name=startup]').forEach(r => r.addEventListener('change', () => ibra.setSettings({ startup: r.value })))
  app.querySelector('#homepage').addEventListener('change', (e) => { ibra.setSettings({ homepage: e.target.value.trim() || 'ibra://newtab' }); toast('تم حفظ الصفحة الرئيسية') })
  app.querySelector('#dldir').addEventListener('click', async () => { await ibra.chooseDownloadsDir(); render() })
  app.querySelector('#defb').addEventListener('click', () => ibra.setDefaultBrowser())
  await drawProxySettings()
  if (location.hash.includes('proxy')) app.querySelector('#proxy')?.scrollIntoView()
  app.querySelector('#ibdmshow')?.addEventListener('click', async () => { if (!(await ibra.ibdmShow())) toast('تعذر الوصول إلى IBDM Pro') })
  app.querySelector('#ibdmcheck')?.addEventListener('click', async () => { const r = await ibra.ibdmCheck(); toast(r ? 'تم الاتصال بـ IBDM Pro' : 'IBDM Pro غير مشغّل'); render() })
  app.querySelector('#ud').addEventListener('click', () => ibra.openPath('userData'))
  app.querySelector('#reset').addEventListener('click', async () => { if (confirm('إعادة كل الإعدادات إلى الوضع الافتراضي؟')) { await ibra.resetSettings(); toast('تمت إعادة التعيين') } })
  app.querySelector('#clear').addEventListener('click', async () => {
    const o = {}; for (const k of ['history', 'cookies', 'cache', 'downloads', 'permissions']) o[k] = app.querySelector('#c_' + k).checked
    await ibra.clearData(o); toast('تم محو البيانات المحددة')
  })
}

// ═════════ السجل ═════════
PAGES.history = async (q = '') => {
  app.innerHTML = shell('history', `<h1>السجل</h1>
    <div class="toolbar"><input type="search" id="hq" placeholder="ابحث في السجل" value="${esc(q)}"><button class="btn" id="hdel" disabled>${I.trash} حذف المحدد</button><button class="btn danger" id="hall">محو كل السجل</button></div>
    <div class="card" id="hl"><div class="empty">...</div></div>`)
  const list = await ibra.history(q)
  const box = app.querySelector('#hl')
  if (!list.length) box.innerHTML = `<div class="empty">${q ? 'لا توجد نتائج' : 'السجل فارغ'}</div>`
  else {
    const groups = new Map()
    const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString()
    for (const it of list) {
      const d = new Date(it.time); const k = d.toDateString()
      const label = k === today ? 'اليوم' : k === yest ? 'أمس' : d.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      if (!groups.has(label)) groups.set(label, []); groups.get(label).push(it)
    }
    box.innerHTML = [...groups].map(([g, items]) => `<div class="group-title">${esc(g)}</div>` + items.map(it => {
      let host = ''; try { host = new URL(it.url).hostname } catch {}
      return `<div class="hrow"><input type="checkbox" data-id="${it.id}"><span class="tm">${new Date(it.time).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span><img src="${esc(fav(it.url))}" alt=""><div class="ht"><a href="${esc(it.url)}" dir="auto">${esc(it.title || it.url)}</a><small>${esc(host)}</small></div><button class="ibtn" data-del="${it.id}" title="إزالة">${I.close}</button></div>`
    }).join('')).join('')
    box.querySelectorAll('img').forEach(i => i.addEventListener('error', () => { i.replaceWith(h(`<span class="gl">${I.globe}</span>`)) }))
  }
  const sel = () => [...app.querySelectorAll('.hrow input:checked')].map(c => +c.dataset.id)
  app.querySelectorAll('.hrow input').forEach(c => c.addEventListener('change', () => { app.querySelector('#hdel').disabled = !sel().length }))
  app.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { await ibra.deleteHistory([+b.dataset.del]); b.closest('.hrow').remove() }))
  app.querySelector('#hdel').addEventListener('click', async () => { await ibra.deleteHistory(sel()); PAGES.history(app.querySelector('#hq').value) })
  app.querySelector('#hall').addEventListener('click', async () => { if (confirm('محو كل سجل التصفح؟')) { await ibra.deleteHistory('all'); PAGES.history() } })
  let t; const hq = app.querySelector('#hq')
  hq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => PAGES.history(hq.value).then(() => { const n = app.querySelector('#hq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length) }), 250) })
}

// ═════════ التنزيلات ═════════
let dlList = []
PAGES.downloads = async () => {
  dlList = await ibra.downloads()
  app.innerHTML = shell('downloads', `<h1>التنزيلات</h1>
    <div class="toolbar"><input type="search" id="dq" placeholder="ابحث في التنزيلات"><button class="btn" id="dfolder">${I.folder} فتح مجلد التنزيلات</button><button class="btn" id="dclear">مسح القائمة</button></div>
    <div class="card" id="dlbox"></div>`)
  drawDownloads()
  app.querySelector('#dq').addEventListener('input', drawDownloads)
  app.querySelector('#dfolder').addEventListener('click', () => ibra.openPath('downloads'))
  app.querySelector('#dclear').addEventListener('click', async () => { await ibra.clearDownloads(); dlList = await ibra.downloads(); drawDownloads() })
}
ibra.onDownloads((list) => { dlList = list; if (route() === 'downloads') drawDownloads() })
function drawDownloads() {
  const box = app.querySelector('#dlbox'); if (!box) return
  const q = (app.querySelector('#dq')?.value || '').toLowerCase()
  const list = dlList.filter(d => !q || (d.filename + d.url).toLowerCase().includes(q))
  if (!list.length) { box.innerHTML = `<div class="empty">${I.download}<br>لا توجد تنزيلات</div>`; return }
  box.innerHTML = list.map(d => {
    const pct = d.total ? Math.round(100 * d.received / d.total) : 0
    let st = ''
    if (d.state === 'progressing') st = (d.paused ? 'متوقف مؤقتاً — ' : `${fmt(d.speed)}/ث — `) + `${fmt(d.received)} من ${d.total ? fmt(d.total) : '؟'}`
    else if (d.state === 'completed') st = fmt(d.total || d.received) + ({ scanning: ' · <span class="scan">جاري الفحص بـ Windows Defender…</span>', clean: ' · <span class="scan ok">✓ نظيف — فحصه Windows Defender</span>', threat: ' · <span class="scan bad">⚠ فيروس! لا تفتح هذا الملف</span>' }[d.scan] || '')
    else if (d.state === 'cancelled') st = 'أُلغي'
    else st = 'فشل'
    const links = d.state === 'progressing'
      ? `<a data-a="${d.paused ? 'resume' : 'pause'}">${d.paused ? 'استئناف' : 'إيقاف مؤقت'}</a><a data-a="cancel">إلغاء</a>`
      : d.state === 'completed' ? (d.scan === 'threat' ? `<a data-a="trash" class="bad">حذف الملف</a><a data-a="folder">إظهار في المجلد</a><a data-a="rescan">إعادة الفحص</a>` : `<a data-a="open">فتح</a><a data-a="folder">إظهار في المجلد</a><a data-a="copy">نسخ الرابط</a>`)
      : `<a data-a="retry">إعادة المحاولة</a>`
    return `<div class="dl" data-id="${esc(d.id)}"><span class="dic">${d.state === 'completed' ? I.file : I.download}</span>
      <div class="dm"><div class="dn ${d.state === 'cancelled' ? 'gone' : ''}" dir="auto">${esc(d.filename)}</div><div class="du">${esc(d.url)}</div>
      ${d.state === 'progressing' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
      <div class="ds">${st} · ${new Date(d.start).toLocaleString('ar-IQ')}</div><div class="links">${links}</div></div>
      <button class="ibtn" data-a="remove" title="إزالة من القائمة">${I.close}</button></div>`
  }).join('')
  box.querySelectorAll('[data-a]').forEach(a => a.addEventListener('click', () => ibra.downloadAction(a.closest('.dl').dataset.id, a.dataset.a)))
}

// ═════════ الإشارات المرجعية ═════════
PAGES.bookmarks = async () => {
  const list = await ibra.bookmarks()
  app.innerHTML = shell('bookmarks', `<h1>الإشارات المرجعية</h1>
    <div class="toolbar"><input type="search" id="bq" placeholder="ابحث في الإشارات"><button class="btn primary" id="badd">${I.plus} إضافة</button><button class="btn" id="bimp">${I.upload} استيراد من جوجل كروم / Edge</button></div>
    <div class="card" id="bl"></div>`)
  const draw = () => {
    const q = app.querySelector('#bq').value.toLowerCase()
    const items = list.filter(b => !q || (b.title + b.url).toLowerCase().includes(q))
    const box = app.querySelector('#bl')
    if (!items.length) { box.innerHTML = `<div class="empty">لا توجد إشارات مرجعية</div>`; return }
    box.innerHTML = items.map(b => `<div class="hrow" data-id="${b.id}"><img src="${esc(b.favicon || fav(b.url))}" alt=""><div class="ht"><a href="${esc(b.url)}" dir="auto">${esc(b.title || b.url)}</a><small>${esc(b.url)}</small></div>
      <button class="ibtn" data-m="-1" title="تحريك للأعلى">${I.up}</button><button class="ibtn" data-m="1" title="تحريك للأسفل">${I.down}</button>
      <button class="ibtn" data-e title="تعديل">${I.edit}</button><button class="ibtn" data-r title="حذف">${I.trash}</button></div>`).join('')
    box.querySelectorAll('img').forEach(i => i.addEventListener('error', () => i.replaceWith(h(`<span class="gl">${I.globe}</span>`))))
    box.querySelectorAll('.hrow').forEach(row => {
      const id = +row.dataset.id; const b = list.find(x => x.id === id)
      row.querySelector('[data-r]').addEventListener('click', async () => { const nl = await ibra.removeBookmark(id); list.splice(0, list.length, ...nl); draw() })
      row.querySelector('[data-e]').addEventListener('click', () => editBookmark(b, async () => { const nl = await ibra.bookmarks(); list.splice(0, list.length, ...nl); draw() }))
      row.querySelectorAll('[data-m]').forEach(m => m.addEventListener('click', async () => { const nl = await ibra.moveBookmark(id, +m.dataset.m); list.splice(0, list.length, ...nl); draw() }))
    })
  }
  draw()
  app.querySelector('#bq').addEventListener('input', draw)
  app.querySelector('#badd').addEventListener('click', () => editBookmark({ title: '', url: 'https://' }, async () => { const nl = await ibra.bookmarks(); list.splice(0, list.length, ...nl); draw() }))
  app.querySelector('#bimp').addEventListener('click', async () => {
    const r = await ibra.importChrome()
    toast(!r.found ? 'لم يتم العثور على متصفح كروم أو Edge على هذا الجهاز' : `تم استيراد ${r.added} إشارة مرجعية`)
    const nl = await ibra.bookmarks(); list.splice(0, list.length, ...nl); draw()
  })
}
function editBookmark(b, done) {
  const m = h(`<div class="modal-bg"><div class="modal"><h3>${b.id ? 'تعديل الإشارة' : 'إضافة إشارة مرجعية'}</h3>
    <label>الاسم</label><input type="text" id="mt" value="${esc(b.title)}"><label>العنوان</label><input type="url" id="mu" dir="ltr" value="${esc(b.url)}">
    <div class="mf"><button class="btn primary" id="ms">حفظ</button><button class="btn" id="mc">إلغاء</button></div></div></div>`)
  document.body.appendChild(m)
  m.querySelector('#mt').focus()
  m.querySelector('#mc').addEventListener('click', () => m.remove())
  m.addEventListener('mousedown', (e) => { if (e.target === m) m.remove() })
  m.querySelector('#ms').addEventListener('click', async () => {
    let url = m.querySelector('#mu').value.trim(); if (!url || url === 'https://') return
    if (!/^[a-z-]+:/i.test(url)) url = 'https://' + url
    await ibra.saveBookmark({ id: b.id, title: m.querySelector('#mt').value.trim() || url, url }); m.remove(); done()
  })
}

// ═════════ الإضافات ═════════
const fmtN = (n) => (n || 0).toLocaleString('en-US')
const when = (t) => t ? new Date(t).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : 'لم تُحمّل بعد'
function builtinCards(F) {
  const P = F.proxy, A = F.adblock, Sh = F.shield
  const swb = (k, on) => `<label class="switch"><input type="checkbox" data-f="${k}" ${on ? 'checked' : ''}><i></i></label>`
  const pst = P.status === 'ready' ? 'متصل — ' + esc(P.message) : P.status === 'starting' ? esc(P.message) : P.status === 'error' ? '⚠ ' + esc(P.message) : 'جاهز — شغّله من زر البروكسي على أي لسان'
  return `<h2>إضافات IBRA المدمجة</h2>
  <div class="bexts">
    <div class="card bext ${P.enabled ? '' : 'dim'}"><div class="bh"><span class="bic">${I.proxy}</span><div class="bt"><b>IBRA Proxy</b><small>بروكسي يعمل على لسان واحد فقط لفتح المواقع المحجوبة</small></div>${swb('proxyEnabled', P.enabled)}</div>
      <div class="bl"><span>الطريقة</span><b>${P.mode === 'custom' ? 'بروكسي خاص ' + esc(P.custom.host ? P.custom.scheme.toUpperCase() + ' ' + P.custom.host + ':' + P.custom.port : '(غير مضبوط)') : 'شبكة Tor المدمجة' + (P.torAvailable ? '' : ' (غير موجودة في هذه النسخة)')}</b></div>
      <div class="bl"><span>الحالة</span><b>${pst}</b></div>
      <div class="bf"><button class="btn" data-go="settings#proxy">إعدادات البروكسي</button></div></div>

    <div class="card bext ${A.enabled ? '' : 'dim'}"><div class="bh"><span class="bic">${I.ad}</span><div class="bt"><b>IBRA AdBlock</b><small>يحجب الإعلانات والمتتبعات والنوافذ المزعجة في كل المواقع</small></div>${swb('adblockEnabled', A.enabled)}</div>
      <div class="bnum"><b>${fmtN(A.total)}</b><span>إعلان ومتتبع محجوب منذ التثبيت</span></div>
      <div class="bl"><span>القوائم</span><b>${A.ready ? fmtN(A.filters) + ' قاعدة · ' + when(A.updatedAt) : (A.refreshing ? 'جاري التحميل…' : 'لم تُحمّل بعد')}</b></div>
      ${A.allow.length ? `<div class="bl col"><span>مواقع أوقفت الحجب عليها</span><div class="chips">${A.allow.map(h => `<span class="chipx" dir="ltr">${esc(h)}<button data-unallow="${esc(h)}" title="إعادة الحجب">×</button></span>`).join('')}</div></div>` : ''}
      <div class="bf"><button class="btn" id="ad-up">${I.refresh} تحديث القوائم</button></div></div>

    <div class="card bext ${Sh.enabled ? '' : 'dim'}"><div class="bh"><span class="bic">${I.bug}</span><div class="bt"><b>IBRA Shield</b><small>فاحص فيروسات المواقع: يحذّرك من مواقع البرمجيات الخبيثة والتصيد والاحتيال</small></div>${swb('shieldEnabled', Sh.enabled)}</div>
      <div class="bnum"><b>${fmtN(Sh.stats.blocked)}</b><span>موقع خطير تم إيقافه</span></div>
      <div class="bl"><span>قاعدة البيانات</span><b>${fmtN(Sh.total)} موقع خطير معروف</b></div>
      <div class="bl"><span>فحص التنزيلات</span><b>${Sh.defender ? 'Windows Defender — فُحص ' + fmtN(Sh.stats.scanned) + ' ملف، وُجد ' + fmtN(Sh.stats.threats) + ' تهديد' : 'Windows Defender غير متوفر على هذا الجهاز'}</b>${swb('shieldScanDownloads', Sh.scanDownloads)}</div>
      <div class="bl col"><span>المصادر</span><div class="srcs">${Sh.lists.map(l => `<div><i class="${l.count ? 'ok' : ''}"></i>${esc(l.name)} <small>${l.count ? fmtN(l.count) + ' · ' + when(l.updatedAt) : 'لم يُحمّل بعد'}</small></div>`).join('')}</div></div>
      <div class="bf"><button class="btn" id="sh-up">${I.refresh} تحديث قاعدة البيانات</button></div></div>

    <div class="card bext"><div class="bh"><span class="bic">${I.download}</span><div class="bt"><b>IBDM Pro</b><small>تسليم التحميلات لبرنامج IBDM Pro + التقاط الفيديوهات. تتحدث تلقائياً، ونسخة واحدة فقط تعمل.</small></div></div>
      <div class="bl"><span>الإضافة</span><b>الإصدار ${esc(F.ibdm.version)} — ${({ installed: 'من برنامج IBDM Pro المثبت على جهازك', github: 'محدّثة تلقائياً من صفحة إصدارات IBDM Pro', builtin: 'النسخة المدمجة' })[F.ibdm.source] || ''}</b></div>
      <div class="bl"><span>البرنامج</span><b>${F.ibdm.app ? 'IBDM Pro ' + esc(F.ibdm.app) + ' متصل' : 'غير مشغّل'}</b></div></div>
  </div>
  <h2>إضافات سوق Chrome</h2>`
}

PAGES.extensions = async () => {
  const [list, F] = await Promise.all([ibra.extensions(), ibra.features()])
  app.innerHTML = shell('extensions', `<h1>الإضافات</h1>${builtinCards(F)}
    <div class="card hero-store"><span class="hs-ic">${I.store}</span><div class="hs-t"><b>سوق Chrome الإلكتروني</b><span>ثبّت إضافات جوجل الأصلية مباشرة بزر «إضافة إلى Chrome» كما في كروم تماماً.</span></div><button class="btn primary" id="store">فتح السوق</button></div>
    <div class="toolbar"><button class="btn" id="unp">${I.folder} تحميل إضافة غير مضغوطة</button><button class="btn" id="upd">${I.refresh} تحديث الإضافات</button></div>
    ${list.length ? `<div class="exts">${list.map(x => `<div class="card ext" data-id="${esc(x.id)}">
      <div class="eh">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : `<span class="ph">${I.puzzle}</span>`}<div><div class="en" dir="auto">${esc(x.name)}</div><div class="ev">الإصدار ${esc(x.version)}${x.builtin ? '<span class="tag red">مدمجة رسمياً</span>' : x.unpacked ? '<span class="tag">غير مضغوطة</span>' : ''}</div></div></div>
      <div class="ed" dir="auto">${esc(x.description)}</div>
      <div class="ef">${x.options ? `<button class="btn" data-o>الخيارات</button>` : ''}${x.builtin ? '' : '<button class="btn danger" data-r>إزالة</button>'}</div>
      <div class="ev" dir="ltr" style="text-align:right">ID: ${esc(x.id)}</div></div>`).join('')}</div>`
    : `<div class="card"><div class="empty">${I.puzzle}<br>لم تثبّت أي إضافة بعد. افتح سوق Chrome واختر ما تريد.</div></div>`}`)
  app.querySelector('#store').addEventListener('click', () => ibra.openStore())
  app.querySelectorAll('input[data-f]').forEach(c => c.addEventListener('change', async () => { await ibra.setFeature(c.dataset.f, c.checked); render() }))
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go }))
  app.querySelectorAll('[data-unallow]').forEach(b => b.addEventListener('click', async () => { await ibra.adblockAllowRemove(b.dataset.unallow); render() }))
  app.querySelector('#ad-up').addEventListener('click', async (e) => { e.target.disabled = true; toast('جاري تحميل أحدث قوائم الإعلانات…'); const ok = await ibra.adblockRefresh(); toast(ok ? 'تم تحديث قوائم حاجب الإعلانات' : 'تعذر التحديث — تحقق من الإنترنت'); render() })
  app.querySelector('#sh-up').addEventListener('click', async (e) => { e.target.disabled = true; toast('جاري تحديث قاعدة بيانات المواقع الخطيرة…'); await ibra.shieldRefresh(); toast('تم التحديث'); render() })
  app.querySelector('#unp').addEventListener('click', async () => { const r = await ibra.loadUnpacked(); if (r.ok) { toast('تم تحميل ' + r.name); render() } else if (r.error) toast('خطأ: ' + r.error) })
  app.querySelector('#upd').addEventListener('click', async () => { toast('جاري البحث عن تحديثات...'); const ok = await ibra.updateExtensions(); toast(ok ? 'الإضافات محدثة' : 'تعذر التحديث الآن'); render() })
  app.querySelectorAll('.ext').forEach(c => {
    const id = c.dataset.id
    c.querySelector('[data-r]')?.addEventListener('click', async () => { if (confirm('إزالة هذه الإضافة؟')) { await ibra.removeExtension(id); render() } })
    c.querySelector('[data-o]')?.addEventListener('click', () => ibra.openExtensionOptions(id))
  })
}

// ═════════ إعدادات البروكسي ═════════
async function drawProxySettings() {
  const box = app.querySelector('#pxcard'); if (!box) return
  const { proxy: P } = await ibra.features()
  const c = P.custom
  box.innerHTML = `
    <label class="check-row"><input type="radio" name="pxmode" value="tor" ${P.mode === 'tor' ? 'checked' : ''}><div><b>شبكة Tor المدمجة</b> <small class="mut">— مجاني، يفتح كل المواقع المحجوبة${P.torAvailable ? '' : ' (غير موجود في هذه النسخة)'}</small></div></label>
    <div class="row sub" data-for="tor"><div class="rt"><b>طريقة الاتصال بـ Tor</b><span>إذا كان Tor محجوباً عندك اختر Snowflake أو obfs4، أو «تلقائي» ليجرّبها بالترتيب</span></div>
      <select id="pxtr">${[['auto', 'تلقائي (مستحسن)'], ['direct', 'مباشر'], ['snowflake', 'Snowflake'], ['obfs4', 'obfs4'], ['meek', 'meek (Azure)'], ['custom', 'جسور مخصصة']].map(([k, t]) => `<option value="${k}" ${P.torTransport === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="row sub" data-for="bridges"><div class="rt"><b>جسور مخصصة</b><span>الصق الجسور من bridges.torproject.org — كل جسر بسطر</span><textarea id="pxbr" dir="ltr" rows="3" placeholder="obfs4 1.2.3.4:443 FINGERPRINT cert=... iat-mode=0">${esc(P.bridges)}</textarea></div></div>
    <label class="check-row"><input type="radio" name="pxmode" value="custom" ${P.mode === 'custom' ? 'checked' : ''}><div><b>بروكسي خاص</b> <small class="mut">— HTTP أو HTTPS أو SOCKS5 أو SOCKS4</small></div></label>
    <div class="row sub" data-for="custom"><div class="pxgrid">
      <select id="pxs">${['socks5', 'http', 'https', 'socks4'].map(k => `<option value="${k}" ${c.scheme === k ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select>
      <input type="text" id="pxh" dir="ltr" placeholder="العنوان مثل 1.2.3.4" value="${esc(c.host)}">
      <input type="text" id="pxp" dir="ltr" placeholder="المنفذ" value="${esc(c.port)}" style="min-width:0">
      <input type="text" id="pxu" dir="ltr" placeholder="اسم المستخدم (اختياري)" value="${esc(c.user)}">
      <input type="password" id="pxw" dir="ltr" placeholder="${c.hasPass ? '•••••••• (محفوظة)' : 'كلمة السر (اختياري)'}" style="height:36px;border-radius:10px;border:1px solid var(--line-strong);background:var(--field-bg-focus);color:var(--text);padding:0 12px;font:inherit">
    </div></div>
    <div class="row"><div class="rt"><b>الحالة</b><span id="pxst">—</span></div><button class="btn" id="pxretry">${I.refresh} إعادة الاتصال</button><button class="btn primary" id="pxsave">حفظ</button></div>`
  const sync = () => {
    const mode = box.querySelector('input[name=pxmode]:checked')?.value
    box.querySelectorAll('[data-for]').forEach(r => { const f = r.dataset.for; r.hidden = !(f === mode || (f === 'tor' && mode === 'tor') || (f === 'bridges' && mode === 'tor' && box.querySelector('#pxtr').value === 'custom')) })
  }
  box.querySelectorAll('input[name=pxmode]').forEach(r => r.addEventListener('change', sync))
  box.querySelector('#pxtr').addEventListener('change', sync)
  sync()
  box.querySelector('#pxsave').addEventListener('click', async () => {
    const mode = box.querySelector('input[name=pxmode]:checked')?.value
    const pass = box.querySelector('#pxw').value
    await ibra.setProxySettings({ mode, transport: box.querySelector('#pxtr').value, bridges: box.querySelector('#pxbr').value,
      custom: { scheme: box.querySelector('#pxs').value, host: box.querySelector('#pxh').value, port: box.querySelector('#pxp').value, user: box.querySelector('#pxu').value, pass } })
    toast('تم حفظ إعدادات البروكسي')
    drawProxySettings()
  })
  box.querySelector('#pxretry').addEventListener('click', async () => { await ibra.proxyRetry(); refreshProxyStatus() })
  refreshProxyStatus()
}
async function refreshProxyStatus() {
  const el = app.querySelector('#pxst'); if (!el) return
  const { proxy: P } = await ibra.features()
  el.textContent = P.status === 'off' ? 'متوقف — يعمل عند تشغيله على لسان' : (P.message || P.status)
}

// ═════════ موقع خطير ═════════
PAGES.blocked = async () => {
  const [, kind, url] = location.hash.slice(1).split('|').map(x => decodeURIComponent(x || ''))
  let host = url; try { host = new URL(url).hostname } catch {}
  const T = {
    malware: ['الموقع التالي يحتوي على برمجيات خبيثة', 'هذا الموقع معروف بنشر الفيروسات وبرامج التجسس. قد يحاول تثبيت برامج تسرق معلوماتك أو تتلف جهازك.'],
    phishing: ['موقع تصيّد احتيالي!', 'هذا الموقع ينتحل صفة موقع موثوق ليسرق كلمات السر أو معلومات البطاقة المصرفية. لا تُدخل أي معلومات فيه.'],
    scam: ['موقع احتيال', 'هذا الموقع مُبلّغ عنه بأنه يمارس الاحتيال (جوائز وهمية، متاجر مزيفة، دعم فني مزيف).'],
  }[kind] || ['موقع خطير', 'هذا الموقع مدرج في قوائم المواقع الضارة.']
  document.body.classList.add('danger-page')
  app.innerHTML = `<div class="err danger"><div class="eic">${I.bug}</div>
    <h1>${T[0]}</h1>
    <p><b dir="ltr">${esc(host)}</b></p>
    <p>${T[1]}</p>
    <p class="sm">أوقفه <b>IBRA Shield</b> — فاحص فيروسات المواقع في IBRA CROM</p>
    <div style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" id="safe">العودة إلى الأمان</button><button class="btn" id="go">المتابعة رغم الخطر</button></div></div>`
  app.querySelector('#safe').addEventListener('click', () => { if (history.length > 2) history.go(-2); else ibra.navigate('ibra://newtab') })
  app.querySelector('#go').addEventListener('click', () => { if (confirm('هل أنت متأكد؟ هذا الموقع قد يضر جهازك أو يسرق معلوماتك.')) ibra.shieldProceed(url) })
}

// ═════════ انتظار البروكسي ═════════
let waitTimer = null
PAGES.proxywait = async () => {
  app.innerHTML = `<div class="err"><div class="eic">${I.proxy}</div><h1>جاري تجهيز البروكسي…</h1><p id="pwm">—</p>
    <div class="pwbar"><i id="pwb"></i></div>
    <p class="sm">يتم الاتصال لأول مرة فقط، بعدها تفتح ألسن البروكسي مباشرة. باقي الألسن تعمل بشكل طبيعي.</p>
    <div style="margin-top:22px;display:flex;gap:10px"><button class="btn" id="retry">${I.refresh} إعادة المحاولة</button><button class="btn" id="cancel">فتح الموقع بدون بروكسي</button><button class="btn" id="set">${I.settings} إعدادات البروكسي</button></div></div>`
  app.querySelector('#retry').addEventListener('click', () => ibra.proxyRetry())
  app.querySelector('#cancel').addEventListener('click', () => ibra.proxyCancelTab())
  app.querySelector('#set').addEventListener('click', () => ibra.openTab('ibra://settings#proxy'))
  const tick = async () => {
    if (route() !== 'proxywait') return
    const { proxy: P } = await ibra.features()
    const m = app.querySelector('#pwm'); if (m) m.textContent = P.message || 'جاري الاتصال…'
    const b = app.querySelector('#pwb'); if (b) { b.style.width = (P.status === 'ready' ? 100 : Math.max(4, P.progress || 0)) + '%'; b.classList.toggle('err', P.status === 'error') }
    clearTimeout(waitTimer); waitTimer = setTimeout(tick, 600)
  }
  tick()
}

// ═════════ حول ═════════
PAGES.about = async () => {
  const a = await ibra.appInfo()
  app.innerHTML = shell('about', `<h1>حول IBRA CROM</h1>
    <div class="card about-hero"><img src="../assets/logo.png" alt=""><div><h3>IBRA CROM</h3><p>الإصدار ${esc(a.version)} — مبني على محرك Chromium ${esc(a.chrome)}</p><p class="by">برمجة و تطوير <b>ابراهيم الخزرجي</b></p><p><a href="https://t.me/ibraprogram">قناة IBRAPROGRAM على تيليجرام</a></p></div></div>
    <h2>تفاصيل تقنية</h2>
    <div class="card kv"><div>Chromium</div><div>${esc(a.chrome)}</div><div>V8</div><div>${esc(a.v8)}</div><div>Electron</div><div>${esc(a.electron)}</div><div>User Agent</div><div>${esc(a.ua)}</div><div>مجلد البيانات</div><div>${esc(a.userData)}</div></div>
    <h2>الترخيص</h2>
    <div class="card"><div class="row"><div class="rt"><span>يعتمد دعم إضافات Chrome على مكتبة electron-chrome-extensions (GPL-3.0) ومحرك Chromium مفتوح المصدر (BSD). الخط: IBM Plex Sans Arabic (OFL).</span></div></div></div>`)
}

// ═════════ خطأ ═════════
PAGES.error = async () => {
  const [, code, desc, url] = location.hash.slice(1).split('|').map(x => decodeURIComponent(x || ''))
  let host = url; try { host = new URL(url).hostname } catch {}
  const crash = code === 'crash'
  const offline = /INTERNET_DISCONNECTED|-106/.test(desc + code)
  const msgs = {
    '-105': 'تعذر العثور على عنوان IP الخاص بالخادم.', '-106': 'أنت غير متصل بالإنترنت.', '-102': 'رفض الخادم الاتصال.',
    '-118': 'استغرق الخادم وقتاً طويلاً للرد.', '-7': 'انتهت مهلة الاتصال.', '-200': 'شهادة الأمان غير صالحة.', '-201': 'شهادة الأمان منتهية الصلاحية.', '-202': 'شهادة الأمان غير موثوقة.',
  }
  app.innerHTML = `<div class="err"><div class="eic">${crash ? I.warn : offline ? I.globe : I.warn}</div>
    <h1>${crash ? 'عذراً! حدث خطأ في هذه الصفحة' : offline ? 'لا يوجد اتصال بالإنترنت' : 'تعذر الوصول إلى هذا الموقع'}</h1>
    <p><b dir="ltr">${esc(host)}</b> — ${esc(msgs[code] || (crash ? 'توقفت عملية عرض الصفحة.' : 'تحقق من العنوان أو من اتصالك بالإنترنت.'))}</p>
    <code>${esc(desc)} (${esc(code)})</code>
    <div style="margin-top:22px;display:flex;gap:10px"><button class="btn primary" id="retry">${I.reload} إعادة التحميل</button>${host ? `<button class="btn" id="srch">${I.search} البحث عن ${esc(host)}</button>` : ''}</div></div>`
  app.querySelector('#retry').addEventListener('click', () => ibra.navigate(url))
  app.querySelector('#srch')?.addEventListener('click', () => ibra.navigate('"' + host + '"'))
}

render()
