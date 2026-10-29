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
api.on('state', (s) => { const changed = S.activeId !== s.activeId; S = s; if (changed && S.activeId) { if ($('closedpanel').hidden && $('proxypanel').hidden) closePanels(); else for (const p of ['suggest', 'menu', 'dlpanel', 'shieldpanel']) $(p).hidden = true; if (document.activeElement === $('address')) $('address').blur() } render() })
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
  if (n.blocked) { si.classList.add('danger'); si.innerHTML = I.bug + '<span>موقع خطير</span>'; si.title = 'IBRA Shield أوقف هذا الموقع' }
  else if (n.proxied && n.url) { si.classList.add('proxy'); si.innerHTML = I.proxy + '<span>بروكسي</span>'; si.title = 'هذا اللسان يعمل عبر البروكسي' }
  else if (n.internal) { si.classList.add('ibra'); si.innerHTML = `<img src="../assets/logo64.png" alt="">IBRA`; si.title = 'صفحة داخلية آمنة' }
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
  // أزرار الإضافات تتبع جلسة اللسان (عادي / بروكسي)
  const part = n.partition || ''
  if ((act.getAttribute('partition') || '') !== part) { if (part) act.setAttribute('partition', part); else act.removeAttribute('partition') }
  if (n.tabId && act.getAttribute('tab') !== String(n.tabId)) act.setAttribute('tab', String(n.tabId))
  renderFeatures()
  renderUpdate()
  renderMediaBtn()
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
    el.classList.toggle('proxied', !!t.proxied)
    const px = el.querySelector('.pxy')
    px.hidden = !t.proxied
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
  el.innerHTML = `<i class="stripe"></i><span class="fav"></span><span class="pxy" hidden title="هذا اللسان يعمل عبر البروكسي">${I.proxy}</span><span class="title"></span><button class="snd" hidden title="كتم/تشغيل الصوت"></button><button class="x" title="إغلاق (Ctrl+W)">${I.close}</button>`
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
$('proxybtn').insertAdjacentHTML('afterbegin', I.proxy)
$('shieldbtn').insertAdjacentHTML('afterbegin', I.shield)
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
const PANELS = ['suggest', 'menu', 'dlpanel', 'closedpanel', 'proxypanel', 'shieldpanel', 'updpanel', 'mediapanel']
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && PANELS.some(id => id !== 'suggest' && !$(id).hidden)) closePanels() })

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
    ...((S.features?.proxy?.enabled !== false) ? [item('proxyTab', I.proxy, 'لسان بروكسي جديد', 'Ctrl+Shift+N')] : []),
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
    item('checkUpdate', I.update, S.update?.status === 'available' || S.update?.status === 'ready' ? `تحديث إلى ${esc(S.update.version)} متوفر` : 'البحث عن تحديثات'),
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

// ═════════ IBRA Proxy / AdBlock / Shield ═════════
const fmtN = (n) => (n || 0).toLocaleString('en-US')
function renderFeatures() {
  const F = S.features || {}, n = S.nav || {}
  const P = F.proxy || {}, A = F.adblock || {}
  const pb = $('proxybtn')
  pb.hidden = P.enabled === false
  pb.classList.toggle('on', !!n.proxied)
  const dot = pb.querySelector('.pdot')
  dot.hidden = !n.proxied
  dot.className = 'pdot ' + (P.status === 'ready' ? 'ready' : P.status === 'error' ? 'error' : '')
  pb.title = n.proxied ? 'البروكسي يعمل لهذا اللسان — ' + (P.message || '') : 'تشغيل البروكسي لهذا اللسان فقط'
  const sb = $('shieldbtn')
  const adOn = A.enabled !== false && !n.siteAllowed
  sb.classList.toggle('on', adOn && !!n.host)
  sb.classList.toggle('off', !adOn)
  sb.firstElementChild.outerHTML = adOn ? I.shield : I.shieldOff
  const badge = sb.querySelector('.badge')
  badge.hidden = !adOn || !n.ads
  badge.textContent = n.ads > 99 ? '99+' : String(n.ads || 0)
  sb.title = adOn ? `حاجب الإعلانات — تم حجب ${n.ads || 0} في هذه الصفحة` : 'حاجب الإعلانات متوقف هنا'
  if (!$('proxypanel').hidden) buildProxyPanel()
  if (!$('shieldpanel').hidden) buildShieldPanel()
}
const sw = (id, on, dis) => `<button class="sw ${on ? 'on' : ''}" id="${id}" ${dis ? 'disabled' : ''}></button>`
function placePanel(p, btn) {
  const r = $(btn).getBoundingClientRect()
  p.style.top = (r.bottom + 6) + 'px'
  p.style.left = Math.max(8, Math.min(r.left - 10, innerWidth - 345)) + 'px'
}
function buildProxyPanel() {
  const P = (S.features || {}).proxy || {}, n = S.nav || {}
  const p = $('proxypanel')
  const st = !n.proxied ? 'off' : P.status === 'ready' ? 'ready' : P.status === 'error' ? 'error' : 'busy'
  const method = P.mode === 'custom' ? 'بروكسي خاص' : 'شبكة Tor المدمجة'
  p.innerHTML = `<div class="fp-h"><span class="fic">${I.proxy}</span><div><b>IBRA Proxy</b><small>يعمل على هذا اللسان فقط — باقي الألسن لا تتأثر</small></div></div>
    <div class="fp-row"><div class="fl"><b>البروكسي لهذا اللسان</b><small>${method}</small></div>${sw('px-tab', n.proxied)}</div>
    <div class="fp-status ${st}"><i></i><span>${n.proxied ? esc(P.message || 'جاري التحضير…') : 'متوقف — الاتصال مباشر'}</span></div>
    ${n.proxied && P.status === 'starting' ? `<div class="fp-prog"><i style="width:${P.progress || 3}%"></i></div>` : ''}
    <div class="fp-links"><button id="px-new" class="primary">لسان بروكسي جديد</button>${n.proxied && P.status === 'error' ? '<button id="px-retry">إعادة المحاولة</button>' : ''}<button id="px-set">الإعدادات</button></div>
    <div class="fp-note">يفتح المواقع المحجوبة. ملفات الكوكيز وتسجيل الدخول في ألسن البروكسي منفصلة عن الألسن العادية.</div>`
  p.querySelector('#px-tab').onclick = () => api.send('proxy:toggle')
  p.querySelector('#px-new').onclick = () => { api.send('proxy:newtab'); closePanels() }
  p.querySelector('#px-set').onclick = () => { api.send('menu:action', 'settings'); closePanels() }
  const rt = p.querySelector('#px-retry'); if (rt) rt.onclick = () => api.send('proxy:retry')
}
function buildShieldPanel() {
  const F = S.features || {}, n = S.nav || {}
  const A = F.adblock || {}, Sh = F.shield || {}
  const p = $('shieldpanel')
  p.innerHTML = `<div class="fp-h"><span class="fic">${I.shield}</span><div><b>IBRA AdBlock</b><small>${n.host ? esc(n.host) : 'حاجب الإعلانات والمتتبعات'}</small></div></div>
    <div class="fp-big"><div><b>${fmtN(n.ads)}</b><span>محجوبة في هذه الصفحة</span></div><div><b>${fmtN(A.total)}</b><span>المجموع منذ التثبيت</span></div></div>
    <div class="fp-row"><div class="fl"><b>الحجب على هذا الموقع</b><small>${n.host ? esc(n.host) : '—'}</small></div>${sw('ad-site', !n.siteAllowed, !n.host || A.enabled === false)}</div>
    <div class="fp-row"><div class="fl"><b>حاجب الإعلانات</b><small>لكل المواقع${A.ready === false ? ' — جاري تحميل القوائم…' : ''}</small></div>${sw('ad-all', A.enabled !== false)}</div>
    <div class="fp-row"><div class="fl"><b>فاحص فيروسات المواقع</b><small>IBRA Shield — أوقف ${fmtN(Sh.blocked)} موقعاً خطيراً</small></div>${sw('sh-all', Sh.enabled !== false)}</div>
    <div class="fp-links"><button id="ad-ext">إدارة الإضافات</button></div>`
  p.querySelector('#ad-site').onclick = () => api.send('adblock:site', !n.siteAllowed)
  p.querySelector('#ad-all').onclick = () => api.send('feature:set', 'adblockEnabled', A.enabled === false)
  p.querySelector('#sh-all').onclick = () => api.send('feature:set', 'shieldEnabled', Sh.enabled === false)
  p.querySelector('#ad-ext').onclick = () => { api.send('menu:action', 'extensions'); closePanels() }
}
$('proxybtn').onclick = () => { if (!$('proxypanel').hidden) return closePanels(); buildProxyPanel(); placePanel($('proxypanel'), 'proxybtn'); showPanel('proxypanel') }
$('shieldbtn').onclick = () => { if (!$('shieldpanel').hidden) return closePanels(); buildShieldPanel(); placePanel($('shieldpanel'), 'shieldbtn'); showPanel('shieldpanel') }

// ═════════ التحديث ═════════
let lastUpdVer = ''
function renderUpdate() {
  const U = S.update || {}
  const b = $('updbtn')
  const show = ['available', 'downloading', 'ready'].includes(U.status)
  b.hidden = !show
  if (show) {
    b.classList.toggle('ready', U.status === 'ready')
    b.innerHTML = I.update + (U.status === 'ready' ? '<span>أعد التشغيل للتحديث</span>' : U.status === 'downloading' ? `<span>جاري التحديث ${U.progress || 0}%</span>` : '<span>تحديث</span>')
    b.title = `IBRA CROM ${U.version} متوفر`
    if (U.version && U.version !== lastUpdVer) { lastUpdVer = U.version; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse') }
  }
  if (!$('updpanel').hidden) buildUpdPanel()
}
function buildUpdPanel() {
  const U = S.update || {}
  const p = $('updpanel')
  const fmtS = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB/ث' : Math.round((b || 0) / 1024) + ' KB/ث'
  let body = ''
  if (U.status === 'available') body = `<div class="fp-links"><button id="up-go" class="primary">تحميل وتثبيت التحديث</button><button id="up-later">لاحقاً</button></div>`
  else if (U.status === 'downloading') body = `<div class="fp-status"><i></i><span>جاري تحميل التحديث… ${U.progress || 0}% — ${fmtS(U.speed)}</span></div><div class="fp-prog"><i style="width:${U.progress || 2}%"></i></div>`
  else if (U.status === 'ready') body = `<div class="fp-status ready"><i></i><span>التحديث جاهز. ستُحفظ ألسنتك ويعاد فتحها بعد التحديث.</span></div><div class="fp-links"><button id="up-inst" class="primary">إعادة التشغيل والتحديث الآن</button><button id="up-later">عند الإغلاق</button></div>`
  else if (U.status === 'checking') body = `<div class="fp-status"><i></i><span>جاري البحث عن تحديثات…</span></div>`
  else if (U.status === 'latest') body = `<div class="fp-status ready"><i></i><span>أنت تستخدم أحدث إصدار.</span></div>`
  else if (U.status === 'error') body = `<div class="fp-status error"><i></i><span>تعذر التحقق: ${esc(U.error || '')}</span></div><div class="fp-links"><button id="up-chk">إعادة المحاولة</button></div>`
  else if (!U.supported) body = `<div class="fp-status off"><i></i><span>التحديث التلقائي يعمل في النسخة المثبتة على ويندوز.</span></div>`
  else body = `<div class="fp-links"><button id="up-chk" class="primary">البحث عن تحديثات</button></div>`
  const hasNew = ['available', 'downloading', 'ready'].includes(U.status)
  p.innerHTML = `<div class="fp-h"><span class="fic">${I.update}</span><div><b>${hasNew ? 'يتوفر إصدار جديد' : 'تحديثات IBRA CROM'}</b><small>من صفحة إصدارات IBRA CROM على GitHub</small></div></div>
    <div class="upd-ver"><div><b>${esc(U.current || '')}</b><span>الإصدار الحالي</span></div>${hasNew ? `<div class="new"><b>${esc(U.version)}</b><span>الإصدار الجديد</span></div>` : ''}</div>
    ${hasNew && U.notes ? `<div class="upd-notes" dir="auto">${esc(U.notes)}</div>` : ''}${body}`
  const on = (id, fn) => { const el = p.querySelector('#' + id); if (el) el.onclick = fn }
  on('up-go', () => api.send('update:download'))
  on('up-inst', () => api.send('update:install'))
  on('up-chk', () => api.send('update:check'))
  on('up-later', () => closePanels())
}
function openUpd() { buildUpdPanel(); const r = $('updbtn').hidden ? $('menubtn').getBoundingClientRect() : $('updbtn').getBoundingClientRect(); const p = $('updpanel'); p.style.top = (r.bottom + 6) + 'px'; p.style.left = Math.max(8, Math.min(r.left - 10, innerWidth - 345)) + 'px'; showPanel('updpanel') }
$('updbtn').onclick = () => { if (!$('updpanel').hidden) return closePanels(); openUpd() }
api.on('update:open', () => setTimeout(openUpd, 50))

// ═════════ IBRA Media — التحكم في الوسائط ═════════
$('mediabtn').insertAdjacentHTML('afterbegin', I.media)
function renderMediaBtn() {
  const tabs = S.tabs || []
  const any = tabs.some(t => t.media)
  const b = $('mediabtn')
  b.hidden = !any && $('mediapanel').hidden
  b.classList.toggle('playing', tabs.some(t => t.media && t.audible))
}
const tfmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') }
let mediaTimer = null, mediaDrag = false, mediaList = []
async function refreshMedia() {
  if ($('mediapanel').hidden) { clearInterval(mediaTimer); mediaTimer = null; return }
  if (mediaDrag) return
  try { mediaList = await api.invoke('media:list') } catch { mediaList = [] }
  drawMedia()
}
function drawMedia() {
  const p = $('mediapanel')
  if (!mediaList.length) { p.innerHTML = `<div class="mempty">${I.media}<br>لا يوجد فيديو أو صوت يعمل الآن</div>`; return }
  const keep = new Set()
  for (const m of mediaList) {
    keep.add(String(m.id))
    let c = p.querySelector(`.mcard[data-id="${m.id}"]`)
    if (!c) {
      p.querySelector('.mempty')?.remove()
      c = document.createElement('div'); c.className = 'mcard'; c.dataset.id = m.id
      c.innerHTML = `<div class="mtop">
          <div class="mart"></div>
          <div class="mmeta" title="الانتقال إلى اللسان"><div class="msite"><img alt=""><span></span></div><div class="mtitle" dir="auto"></div><div class="martist" dir="auto"></div></div>
          <div class="mside"><div class="tools"><button class="mbtn" data-a="cc" title="الترجمة (CC)">${I.cc}</button><button class="mbtn" data-a="pip" title="صورة داخل صورة">${I.pip}</button></div><button class="mplay" data-a="toggle"></button></div>
        </div>
        <div class="mbar">
          <button class="mbtn" data-a="prev" title="السابق">${I.prevTrack}</button>
          <button class="mbtn" data-a="back" title="رجوع 10 ثواني">${I.back10}</button>
          <span class="mtime cur">0:00</span><input type="range" min="0" max="1000" value="0"><span class="mtime dur">0:00</span>
          <button class="mbtn" data-a="fwd" title="تقدم 10 ثواني">${I.fwd10}</button>
          <button class="mbtn" data-a="next" title="التالي">${I.nextTrack}</button>
        </div>`
      const id = m.id
      c.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', () => {
        const a = btn.dataset.a
        api.send('media:act', id, a === 'back' ? 'seekby' : a === 'fwd' ? 'seekby' : a, a === 'back' ? -10 : a === 'fwd' ? 10 : undefined)
        setTimeout(refreshMedia, 250)
      }))
      c.querySelector('.mmeta').addEventListener('click', () => { api.send('media:focus', id); closePanels() })
      const r = c.querySelector('input[type=range]')
      r.addEventListener('input', () => { mediaDrag = true; const cur = mediaList.find(x => x.id === id); if (cur) c.querySelector('.cur').textContent = tfmt(cur.d * r.value / 1000); r.style.setProperty('--p', (r.value / 10) + '%') })
      r.addEventListener('change', () => { const cur = mediaList.find(x => x.id === id); if (cur && cur.d) api.send('media:act', id, 'seekto', cur.d * r.value / 1000); mediaDrag = false; setTimeout(refreshMedia, 250) })
      p.appendChild(c)
    }
    const art = c.querySelector('.mart')
    if (art.dataset.src !== (m.art || '')) { art.dataset.src = m.art || ''; art.style.backgroundImage = m.art ? `url("${m.art.replace(/"/g, '%22')}")` : ''; art.innerHTML = m.art ? '' : (m.video ? I.pip : I.media) }
    const fav = c.querySelector('.msite img'); if (fav.getAttribute('src') !== (m.favicon || '')) { if (m.favicon) fav.src = m.favicon; else fav.removeAttribute('src') } fav.hidden = !m.favicon
    c.querySelector('.msite span').textContent = m.site
    c.querySelector('.mtitle').textContent = m.title
    c.querySelector('.martist').textContent = m.artist
    c.querySelector('.mplay').innerHTML = m.paused ? I.playFill : I.pauseFill
    c.querySelector('.mplay').title = m.paused ? 'تشغيل' : 'إيقاف مؤقت'
    const q = (a) => c.querySelector(`[data-a="${a}"]`)
    q('prev').disabled = !m.prev && !m.d; q('next').disabled = !m.next
    q('back').disabled = q('fwd').disabled = !m.d
    q('pip').hidden = !m.pipOk; q('pip').classList.toggle('on', m.pip); q('pip').title = m.pip ? 'الخروج من صورة داخل صورة' : 'صورة داخل صورة'
    q('cc').hidden = !m.ccOk; q('cc').classList.toggle('on', m.cc)
    const r = c.querySelector('input[type=range]')
    r.disabled = !m.d
    if (!mediaDrag) { const v = m.d ? Math.round(1000 * m.t / m.d) : 0; r.value = v; r.style.setProperty('--p', (v / 10) + '%'); c.querySelector('.cur').textContent = tfmt(m.t) }
    c.querySelector('.dur').textContent = m.d ? tfmt(m.d) : 'مباشر'
  }
  p.querySelectorAll('.mcard').forEach(c => { if (!keep.has(c.dataset.id)) c.remove() })
}
$('mediabtn').onclick = async () => {
  if (!$('mediapanel').hidden) return closePanels()
  const p = $('mediapanel'); p.innerHTML = '<div class="mempty">…</div>'
  const r = $('mediabtn').getBoundingClientRect()
  p.style.top = (r.bottom + 6) + 'px'; p.style.left = Math.max(8, Math.min(r.left - 20, innerWidth - 436)) + 'px'
  showPanel('mediapanel')
  await refreshMedia()
  clearInterval(mediaTimer); mediaTimer = setInterval(refreshMedia, 1000)
}

api.send('ui:ready')
api.send('ui:height', frame.offsetHeight)
