// IBRA CROM — منطق شريط المتصفح | برمجة و تطوير ابراهيم الخزرجي
const I = window.ICONS
const api = window.ibraUI
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const hasArabic = (s) => /[؀-ۿ]/.test(s || '')

let S = { tabs: [], nav: {}, settings: {}, bookmarks: [] }
let downloads = []
let editing = false

// ── أيقونات ثابتة ──
$('newtab').innerHTML = I.plus
$('closedbtn').insertAdjacentHTML('afterbegin', I.reopen)
$('back').innerHTML = I.back
$('forward').innerHTML = I.forward
$('home').innerHTML = I.home
$('menubtn').innerHTML = I.dots
$('extbtn').innerHTML = I.puzzle
$('dlbtn').querySelector('.ic').innerHTML = I.download
$('star').innerHTML = I.star
$('findprev').innerHTML = I.up
$('findnext').innerHTML = I.down
$('findclose').innerHTML = I.close
document.querySelector('#findbar .ic').innerHTML = I.search

// ── ارتفاع الشريط ──
const frame = $('frame')
new ResizeObserver(() => api.send('ui:height', frame.offsetHeight)).observe(frame)

// ═════════ الحالة ═════════
api.on('state', (s) => { const changed = S.activeId !== s.activeId; S = s; if (changed && S.activeId) { if ($('closedpanel').hidden) closePanels(); else for (const p of ['suggest', 'menu', 'dlpanel']) $(p).hidden = true; if (document.activeElement === $('address')) $('address').blur() } render() })
api.on('focus-address', () => { closePanels(); const a = $('address'); a.focus(); a.select() })
api.on('downloads', (list) => { downloads = list; renderDl() })
api.on('downloads:started', () => { const b = $('dlbtn'); b.hidden = false; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse') })
api.invoke('dl:list').then(l => { downloads = l; renderDl() })

function render() {
  const st = S.settings || {}
  document.documentElement.dataset.theme = st.theme || 'glass'
  document.documentElement.classList.toggle('no-blur', !S.blur)
  renderTabs()
  const n = S.nav || {}
  $('back').disabled = !n.canBack
  $('forward').disabled = !n.canForward
  $('reload').innerHTML = n.loading ? I.stop : I.reload
  $('reload').title = n.loading ? 'إيقاف (Esc)' : 'إعادة التحميل (F5)'
  $('home').hidden = st.showHomeButton === false
  if (!editing) $('address').value = n.url || ''
  const si = $('siteinfo')
  si.className = 'chip'
  if (n.internal) { si.classList.add('ibra'); si.innerHTML = `<img src="../assets/logo64.png" alt="">IBRA`; si.title = 'صفحة داخلية آمنة' }
  else if (!n.url) { si.innerHTML = I.search; si.title = '' }
  else if (n.error) { si.classList.add('insecure'); si.innerHTML = I.warn; si.title = 'تعذر الوصول' }
  else if (n.secure) { si.classList.add('secure'); si.innerHTML = I.lock; si.title = 'الاتصال آمن' }
  else if (/^http:/.test(n.url)) { si.classList.add('insecure'); si.innerHTML = I.warn + '<span>غير آمن</span>'; si.title = 'الاتصال بهذا الموقع غير آمن' }
  else { si.innerHTML = I.info; si.title = '' }
  const star = $('star')
  star.innerHTML = n.bookmarked ? I.starFill : I.star
  star.classList.toggle('on', !!n.bookmarked)
  star.hidden = !n.url || n.internal
  const z = $('zoomchip')
  z.hidden = !n.zoom || n.zoom === 100
  z.textContent = (n.zoom || 100) + '%'
  const act = $('actions')
  if (n.tabId && act.getAttribute('tab') !== String(n.tabId)) act.setAttribute('tab', String(n.tabId))
  renderBookmarks()
  renderClosed()
}

// ═════════ العلامات ═════════
const tabEls = new Map()
function renderTabs() {
  const box = $('tabs')
  const ids = new Set(S.tabs.map(t => t.id))
  for (const [id, el] of tabEls) if (!ids.has(id)) { el.remove(); tabEls.delete(id) }
  S.tabs.forEach((t, i) => {
    let el = tabEls.get(t.id)
    if (!el) { el = makeTab(t.id); tabEls.set(t.id, el) }
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null)
    el.classList.toggle('active', t.id === S.activeId)
    const fav = el.querySelector('.fav')
    const favKey = t.loading ? 'L' : (t.internal ? 'I' : t.favicon || 'G')
    if (fav.dataset.k !== favKey) {
      fav.dataset.k = favKey
      if (t.loading) fav.innerHTML = '<div class="spin"></div>'
      else if (t.internal) fav.innerHTML = '<img src="../assets/logo64.png" alt="">'
      else if (t.favicon) { fav.innerHTML = `<img alt="">`; const img = fav.firstChild; img.onerror = () => { fav.innerHTML = I.globe }; img.src = t.favicon }
      else fav.innerHTML = I.globe
    }
    const title = el.querySelector('.title')
    title.textContent = t.title
    title.dir = hasArabic(t.title) ? 'rtl' : 'ltr'
    el.title = t.title + (t.url && !t.internal ? '\n' + t.url : '')
    const snd = el.querySelector('.snd')
    snd.hidden = !(t.audible || t.muted)
    snd.innerHTML = t.muted ? I.muted : I.audio
  })
  sizeTabs()
}
function makeTab(id) {
  const el = document.createElement('div')
  el.className = 'tab'
  el.setAttribute('role', 'tab')
  el.draggable = true
  el.innerHTML = `<i class="stripe"></i><span class="fav"></span><span class="title"></span><button class="snd" hidden title="كتم/تشغيل الصوت"></button><button class="x" title="إغلاق (Ctrl+W)">${I.close}</button>`
  el.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.target.closest('.x,.snd')) api.send('tab:activate', id) })
  el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); api.send('tab:close', id) } })
  el.addEventListener('mouseup', (e) => { if (e.button === 1) e.preventDefault() })
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); api.send('tab:menu', id) })
  el.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); api.send('tab:close', id) })
  el.querySelector('.snd').addEventListener('click', (e) => { e.stopPropagation(); api.send('tab:mute', id) })
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('ibra/tab', String(id)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging') })
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); document.querySelectorAll('.drop-before').forEach(x => x.classList.remove('drop-before')) })
  el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('ibra/tab')) { e.preventDefault(); el.classList.add('drop-before') } })
  el.addEventListener('dragleave', () => el.classList.remove('drop-before'))
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('drop-before')
    const from = +e.dataTransfer.getData('ibra/tab')
    const to = S.tabs.findIndex(t => t.id === id)
    if (from && from !== id) api.send('tab:move', from, to)
  })
  return el
}
function sizeTabs() {
  const strip = $('tabstrip')
  const avail = strip.clientWidth - 40 - 40 - 140 - 60
  const per = avail / Math.max(1, S.tabs.length)
  for (const el of tabEls.values()) el.classList.toggle('narrow', per < 92)
}
window.addEventListener('resize', sizeTabs)
$('newtab').onclick = () => api.send('tab:new')
$('tabstrip').addEventListener('dblclick', (e) => { if (e.target.id === 'tabs' || e.target.classList.contains('drag-fill')) api.send('window:menu-system') })

// ═════════ الأزرار ═════════
$('back').onclick = () => api.send('nav:back')
$('forward').onclick = () => api.send('nav:forward')
$('reload').onclick = (e) => S.nav.loading ? api.send('nav:stop') : api.send('nav:reload', e.shiftKey || e.ctrlKey)
$('home').onclick = () => api.send('nav:home')
$('star').onclick = () => api.send('bookmark:toggle')
$('zoomchip').onclick = () => api.send('nav:zoom', 0)
$('extbtn').onclick = () => api.send('menu:action', 'extensions')
for (const id of ['back', 'forward']) $(id).addEventListener('auxclick', (e) => { if (e.button === 1) api.send(id === 'back' ? 'nav:back' : 'nav:forward') })

// ═════════ شريط العنوان والاقتراحات ═════════
const addr = $('address')
let sugItems = [], sugSel = -1, sugTimer = null, typed = ''
addr.addEventListener('focus', () => { editing = true; $('omnibox').classList.add('focus'); setTimeout(() => addr.select(), 0) })
addr.addEventListener('blur', () => {
  editing = false; $('omnibox').classList.remove('focus')
  setTimeout(() => { if (document.activeElement !== addr) { hidePanel('suggest'); addr.value = S.nav.url || '' } }, 120)
})
addr.addEventListener('input', () => {
  typed = addr.value; sugSel = -1
  clearTimeout(sugTimer)
  if (!typed.trim()) { hidePanel('suggest'); return }
  sugTimer = setTimeout(async () => {
    const q = typed
    const r = await api.invoke('suggest', q).catch(() => ({ local: [], remote: [] }))
    if (q !== typed || document.activeElement !== addr) return
    buildSuggest(q, r)
  }, 90)
})
addr.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    let v = addr.value.trim()
    if (sugSel >= 0 && sugItems[sugSel]) v = sugItems[sugSel].go
    if (e.ctrlKey && v && !/[.\s/:]/.test(v)) v = 'www.' + v + '.com'
    if (!v) return
    hidePanel('suggest')
    if (e.altKey) api.send('tab:new', v); else api.send('nav:go', v)
    editing = false; addr.blur()
  } else if (e.key === 'Escape') {
    if (!$('suggest').hidden) hidePanel('suggest')
    else { addr.value = S.nav.url || ''; addr.select() }
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if ($('suggest').hidden || !sugItems.length) return
    e.preventDefault()
    const n = sugItems.length + 1
    sugSel = ((sugSel + 1) + (e.key === 'ArrowDown' ? 1 : -1) + n) % n - 1
    markSel()
  }
})
function buildSuggest(q, r) {
  sugItems = []
  sugItems.push({ icon: I.search, text: q, go: q, sub: '' })
  for (const s of r.remote) if (s.toLowerCase() !== q.toLowerCase()) sugItems.push({ icon: I.search, text: s, go: s })
  for (const l of r.local) sugItems.push({ icon: l.kind === 'bookmark' ? I.starFill : I.history, text: l.title || l.url, go: l.url, url: l.url })
  sugItems = sugItems.slice(0, 10)
  const box = $('suggest')
  box.innerHTML = sugItems.map((s, i) => `<div class="sg" data-i="${i}"><span class="si">${s.icon}</span><span class="st">${esc(s.text)}</span>${s.url ? `<span class="dash">—</span><span class="su">${esc(s.url)}</span>` : ''}</div>`).join('')
  box.querySelectorAll('.sg').forEach(el => el.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const s = sugItems[+el.dataset.i]
    hidePanel('suggest'); editing = false; addr.blur()
    api.send('nav:go', s.go)
  }))
  const r2 = $('omnibox').getBoundingClientRect()
  box.style.top = (r2.bottom - 1) + 'px'
  box.style.left = r2.left + 'px'
  box.style.width = r2.width + 'px'
  showPanel('suggest', true)
}
function markSel() {
  $('suggest').querySelectorAll('.sg').forEach((el, i) => el.classList.toggle('sel', i === sugSel))
  addr.value = sugSel >= 0 ? (sugItems[sugSel].url || sugItems[sugSel].text) : typed
}

// ═════════ اللوحات ═════════
const PANELS = ['suggest', 'menu', 'dlpanel', 'closedpanel']
function anyOpen() { return PANELS.some(id => !$(id).hidden) }
function syncOverlay() {
  const on = anyOpen()
  document.body.classList.toggle('overlay-on', on)
  api.send('ui:overlay', on)
}
function showPanel(id, keepOthers) {
  if (!keepOthers) for (const p of PANELS) if (p !== id) $(p).hidden = true
  $(id).hidden = false
  syncOverlay()
}
function hidePanel(id) { if (!$(id).hidden) { $(id).hidden = true; syncOverlay() } }
function closePanels() { for (const p of PANELS) $(p).hidden = true; syncOverlay() }
$('overlay').addEventListener('mousedown', (e) => { if (e.target.id === 'overlay') { closePanels(); if (document.activeElement === addr) addr.blur() } })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (!$('menu').hidden || !$('dlpanel').hidden || !$('closedpanel').hidden)) closePanels() })

// ═════════ القائمة الرئيسية ═════════
$('menubtn').onclick = () => { if (!$('menu').hidden) return closePanels(); buildMenu(); showPanel('menu') }
function buildMenu() {
  const st = S.settings || {}
  const z = S.nav.zoom || 100
  const item = (a, icon, label, key = '') => `<div class="mi" data-a="${a}"><span class="mic">${icon}</span><span class="ml">${label}</span><span class="mk">${key}</span></div>`
  const sep = '<div class="msep"></div>'
  const m = $('menu')
  m.innerHTML = [
    item('newTab', I.tab, 'علامة تبويب جديدة', 'Ctrl+T'),
    item('newWindow', I.window, 'نافذة جديدة', 'Ctrl+N'),
    sep,
    item('history', I.history, 'السجل', 'Ctrl+H'),
    item('downloads', I.download, 'التنزيلات', 'Ctrl+J'),
    item('bookmarks', I.bookmark, 'الإشارات المرجعية', 'Ctrl+Shift+O'),
    item('reopen', I.reopen, 'إعادة فتح علامة مغلقة', 'Ctrl+Shift+T'),
    sep,
    `<div class="mrow"><span class="ml"><span class="mic">${I.search}</span>التكبير</span><div class="seg"><button data-a="zoomOut">${I.minus}</button><button class="val" data-a="zoomReset">${z}%</button><button data-a="zoomIn">${I.plus}</button></div><button class="ibtn small" data-a="fullscreen" title="ملء الشاشة (F11)">${I.expand}</button></div>`,
    `<div class="mrow"><span class="ml"><span class="mic">${I.glass}</span>المظهر</span><div class="seg">
      <button data-a="theme_glass" class="${st.theme === 'glass' ? 'on' : ''}" title="زجاجي">زجاجي</button>
      <button data-a="theme_light" class="${st.theme === 'light' ? 'on' : ''}" title="أبيض">أبيض</button>
      <button data-a="theme_dark" class="${st.theme === 'dark' ? 'on' : ''}" title="ليلي">ليلي</button></div></div>`,
    sep,
    item('extensions', I.puzzle, 'الإضافات'),
    item('store', I.store, 'سوق Chrome الإلكتروني'),
    sep,
    item('print', I.print, 'طباعة...', 'Ctrl+P'),
    item('find', I.find, 'بحث في الصفحة...', 'Ctrl+F'),
    item('savePage', I.save, 'حفظ الصفحة باسم...'),
    item('bookmarksBar', I.bookmark, (st.showBookmarksBar ? 'إخفاء' : 'إظهار') + ' شريط الإشارات', 'Ctrl+Shift+B'),
    item('devtools', I.code, 'أدوات المطور', 'F12'),
    item('taskManager', I.cpu, 'مدير المهام'),
    sep,
    item('settings', I.settings, 'الإعدادات'),
    item('about', I.info, 'حول IBRA CROM'),
    item('quit', I.exit, 'خروج'),
    `<div class="mfoot">IBRA CROM — برمجة و تطوير <b>ابراهيم الخزرجي</b></div>`,
  ].join('')
  const r = $('menubtn').getBoundingClientRect()
  m.style.top = (r.bottom + 4) + 'px'
  m.style.left = Math.max(8, r.left) + 'px'
  m.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', () => {
    const a = el.dataset.a
    api.send('menu:action', a)
    if (/^zoom|^theme_/.test(a)) { setTimeout(() => { buildMenu() }, 60); return }
    closePanels()
  }))
}

// ═════════ الإشارات المرجعية ═════════
function renderBookmarks() {
  const bar = $('bookmarksbar')
  const show = S.settings.showBookmarksBar !== false
  bar.hidden = !show
  if (!show) return
  const key = JSON.stringify(S.bookmarks.map(b => [b.id, b.title, b.favicon]))
  if (bar.dataset.k === key) return
  bar.dataset.k = key
  if (!S.bookmarks.length) { bar.innerHTML = `<span class="bm-empty">لإضافة إشارة مرجعية اضغط النجمة ★ في شريط العنوان، أو استوردها من كروم في صفحة الإشارات.</span>`; return }
  bar.innerHTML = ''
  for (const b of S.bookmarks) {
    const el = document.createElement('button')
    el.className = 'bm'; el.title = b.title + '\n' + b.url
    let host = ''; try { host = new URL(b.url).hostname } catch {}
    el.innerHTML = `${I.globe}<span></span>`
    el.querySelector('span').textContent = b.title || host
    if (b.favicon) { const img = new Image(); img.onload = () => el.firstElementChild.replaceWith(img); img.src = b.favicon }
    el.onclick = (e) => api.send('bookmark:open', b.url, e.ctrlKey)
    el.addEventListener('auxclick', (e) => { if (e.button === 1) api.send('bookmark:open', b.url, true) })
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm('حذف الإشارة "' + (b.title || b.url) + '"؟')) api.send('bookmark:remove', b.id) })
    bar.appendChild(el)
  }
}

// ═════════ البحث في الصفحة ═════════
const fi = $('findinput')
api.on('find:open', () => { $('findbar').hidden = false; fi.focus(); fi.select(); if (fi.value) api.send('find:query', fi.value) })
api.on('find:result', (r) => { $('findcount').textContent = `${r.active || 0}/${r.total || 0}`; fi.classList.toggle('nomatch', !!fi.value && !r.total) })
fi.addEventListener('input', () => api.send('find:query', fi.value))
fi.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') api.send('find:query', fi.value, { next: true, forward: !e.shiftKey })
  if (e.key === 'Escape') closeFind()
})
$('findnext').onclick = () => api.send('find:query', fi.value, { next: true, forward: true })
$('findprev').onclick = () => api.send('find:query', fi.value, { next: true, forward: false })
$('findclose').onclick = closeFind
function closeFind() { $('findbar').hidden = true; api.send('find:stop') }

// ═════════ التنزيلات ═════════
const fmt = (b) => { if (!b && b !== 0) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++ } return b.toFixed(i ? 1 : 0) + ' ' + u[i] }
function renderDl() {
  const btn = $('dlbtn')
  const active = downloads.filter(d => d.state === 'progressing')
  if (downloads.length) btn.hidden = false
  btn.classList.toggle('active', active.length > 0)
  let rec = 0, tot = 0
  active.forEach(d => { rec += d.received; tot += d.total })
  const p = tot ? rec / tot : (active.length ? .15 : 0)
  btn.querySelector('circle').style.strokeDashoffset = String(94.25 * (1 - p))
  btn.title = active.length ? `جاري تنزيل ${active.length} — ${Math.round(p * 100)}%` : 'التنزيلات'
  if (!$('dlpanel').hidden) buildDlPanel()
}
$('dlbtn').onclick = () => { if (!$('dlpanel').hidden) return closePanels(); buildDlPanel(); showPanel('dlpanel') }
function buildDlPanel() {
  const p = $('dlpanel')
  const list = downloads.slice(0, 6)
  const stateText = (d) => {
    if (d.state === 'progressing') return d.paused ? `متوقف مؤقتاً — ${fmt(d.received)} من ${fmt(d.total)}` : `${fmt(d.received)} من ${d.total ? fmt(d.total) : '؟'} — ${fmt(d.speed)}/ث`
    if (d.state === 'completed') return `${fmt(d.total || d.received)} — اكتمل`
    if (d.state === 'cancelled') return 'أُلغي'
    return 'فشل التنزيل'
  }
  p.innerHTML = `<div class="dlh"><span>التنزيلات الأخيرة</span></div>` + (list.length ? list.map(d => `
    <div class="dli" data-id="${esc(d.id)}">
      <span class="dic">${d.state === 'completed' ? I.file : I.download}</span>
      <div class="dmain"><div class="dn" dir="auto">${esc(d.filename)}</div><div class="ds">${stateText(d)}</div>
      ${d.state === 'progressing' ? `<div class="bar"><i style="width:${d.total ? Math.round(100 * d.received / d.total) : 15}%"></i></div>` : ''}</div>
      <div class="acts">
        ${d.state === 'progressing' ? `<button class="ibtn small" data-a="${d.paused ? 'resume' : 'pause'}" title="${d.paused ? 'استئناف' : 'إيقاف مؤقت'}">${d.paused ? I.play : I.pause}</button><button class="ibtn small" data-a="cancel" title="إلغاء">${I.close}</button>` : ''}
        ${d.state === 'completed' ? `<button class="ibtn small" data-a="folder" title="إظهار في المجلد">${I.folder}</button>` : ''}
        ${d.state === 'interrupted' || d.state === 'cancelled' ? `<button class="ibtn small" data-a="retry" title="إعادة المحاولة">${I.reload}</button>` : ''}
      </div>
    </div>`).join('') : '<div class="empty">لا توجد تنزيلات بعد</div>') + `<button class="dlall">عرض كل التنزيلات</button>`
  const r = $('dlbtn').getBoundingClientRect()
  p.style.top = (r.bottom + 4) + 'px'
  p.style.left = Math.max(8, r.left - 20) + 'px'
  p.querySelectorAll('.dli').forEach(el => {
    const id = el.dataset.id
    el.addEventListener('dblclick', () => api.send('dl:action', id, 'open'))
    el.querySelector('.dmain').addEventListener('click', () => { const d = downloads.find(x => x.id === id); if (d?.state === 'completed') { api.send('dl:action', id, 'open'); closePanels() } })
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); api.send('dl:action', id, b.dataset.a) }))
  })
  p.querySelector('.dlall').onclick = () => { api.send('menu:action', 'downloads'); closePanels() }
}

// ═════════ العلامات المغلقة مؤخراً ═════════
// زر بجانب العلامات: يفتح قائمة بما أغلقته؛ كل نقرة على عنصر تعيد فتحه وتبقى القائمة مفتوحة لإعادة فتح ما قبله
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'الآن' : m < 60 ? `قبل ${m} د` : `قبل ${Math.round(m / 60)} س` }
function renderClosed() {
  const list = S.closed || []
  const b = $('closedbtn'), c = b.querySelector('.cnt')
  b.disabled = !list.length
  c.hidden = !list.length
  c.textContent = list.length > 9 ? '9+' : String(list.length)
  if (!$('closedpanel').hidden) { if (list.length) buildClosed(); else closePanels() }
}
function buildClosed() {
  const p = $('closedpanel')
  const list = S.closed || []
  p.innerHTML = `<div class="cph"><span>أُغلقت مؤخراً</span><button id="reopenall">فتح الكل</button></div>` +
    list.map((t, i) => `<div class="cpi" data-i="${i}" title="${esc(t.url)}"><span class="cf">${t.internal ? '<img src="../assets/logo64.png" alt="">' : t.favicon ? `<img src="${esc(t.favicon)}" alt="">` : I.globe}</span><span class="ct" dir="auto">${esc(t.title)}</span><span class="cm">${ago(t.time)}</span></div>`).join('') +
    `<div class="cphint">اضغط عنصراً لإعادة فتحه، واستمر بالضغط لإعادة فتح ما أُغلق قبله.</div>`
  p.querySelectorAll('.cf img').forEach(img => img.addEventListener('error', () => { img.parentElement.innerHTML = I.globe }))
  p.querySelectorAll('.cpi').forEach(el => el.addEventListener('click', () => api.send('tab:reopen', +el.dataset.i)))
  p.querySelector('#reopenall').onclick = () => { api.send('tab:reopen-all'); closePanels() }
  const r = $('closedbtn').getBoundingClientRect()
  p.style.top = (r.bottom + 6) + 'px'
  p.style.left = Math.max(8, Math.min(r.left, innerWidth - 350)) + 'px'
}
$('closedbtn').onclick = () => { if (!$('closedpanel').hidden) return closePanels(); if (!(S.closed || []).length) return; buildClosed(); showPanel('closedpanel') }
// النقر بالزر الأيمن على المساحة الفارغة بجانب العلامات يفتح نفس القائمة
$('tabstrip').addEventListener('contextmenu', (e) => { if (e.target.closest('.tab')) return; e.preventDefault(); $('closedbtn').click() })

// ═════════ تنبيه سريع ═════════
let toastT
api.on('toast', (msg) => { const t = $('toast'); t.textContent = msg; t.style.top = Math.max(4, frame.offsetHeight - 36) + 'px'; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true }, 3200) })

api.send('ui:ready')
api.send('ui:height', frame.offsetHeight)
