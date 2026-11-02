// IBRA CROM — جسر الصفحات الداخلية (ibra://...)
// يعمل فقط داخل صفحات البرنامج نفسه، ولا يظهر لأي موقع خارجي
const { contextBridge, ipcRenderer, webFrame } = require('electron')

// IBRA Media: نحفظ أزرار التحكم التي يسجّلها الموقع (السابق/التالي...) لنضغطها من لوحة الوسائط
try { webFrame.executeJavaScript("(() => { try {\n  const ms = navigator.mediaSession; if (!ms || ms.__ibra) return\n  const h = {}, orig = ms.setActionHandler.bind(ms)\n  ms.setActionHandler = (a, f) => { h[a] = f; try { return orig(a, f) } catch (e) {} }\n  Object.defineProperty(window, '__ibraMS', { value: h }); Object.defineProperty(ms, '__ibra', { value: 1 })\n} catch (e) {} })()") } catch {}

// IBRA Passwords: الملء التلقائي وحفظ كلمات السر في المواقع
try { (() => {
  if (!/^https?:$/.test(location.protocol)) return
  let creds = null, lastUser = '', sentKey = '', menuHost = null, menuField = null, autoDone = false

  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const isUserField = (el) => el && el.tagName === 'INPUT' && /^(text|email|tel|)$/i.test(el.type || '') &&
    (/user|login|email|mail|name|account|phone|identifier|id/i.test((el.name || '') + ' ' + (el.id || '') + ' ' + (el.autocomplete || '') + ' ' + (el.getAttribute('aria-label') || '')) || el.type === 'email')
  const pwFields = () => [...document.querySelectorAll('input[type=password]')].filter(visible)
  function userFieldFor(pw) {
    const scope = pw.form || document
    const cands = [...scope.querySelectorAll('input')].filter(i => i !== pw && visible(i) && /^(text|email|tel|)$/i.test(i.type || ''))
    const before = cands.filter(i => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)
    return before.reverse().find(isUserField) || before[0] || null
  }
  function setVal(el, v) {
    if (!el) return
    const proto = Object.getPrototypeOf(el)
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    el.focus(); setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  async function load() { if (creds === null) { try { creds = await ipcRenderer.invoke('pw:get') || [] } catch { creds = [] } } return creds }

  function fill(c, pw) {
    const pws = pw ? [pw] : pwFields()
    const target = pws[0]
    const uf = target ? userFieldFor(target) : [...document.querySelectorAll('input')].find(i => visible(i) && isUserField(i))
    if (uf && c.username) setVal(uf, c.username)
    if (target) setVal(target, c.password)
    ipcRenderer.send('pw:used', c.id)
    closeMenu()
  }

  // ── القائمة المنسدلة تحت الحقل ──
  function closeMenu() { if (menuHost) { menuHost.remove(); menuHost = null; menuField = null } }
  function showMenu(field, list) {
    closeMenu()
    if (!list.length) return
    const r = field.getBoundingClientRect()
    menuField = field
    menuHost = document.createElement('div')
    menuHost.style.cssText = `position:fixed;z-index:2147483647;left:${Math.max(4, r.left)}px;top:${r.bottom + 4}px;width:${Math.max(240, r.width)}px;`
    const root = menuHost.attachShadow({ mode: 'closed' })
    root.innerHTML = `<style>
      .m{font:13px "Segoe UI",Tahoma,sans-serif;background:#fff;color:#18181b;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.08);overflow:hidden;direction:rtl}
      .h{display:flex;align-items:center;gap:6px;padding:8px 12px;font-size:11.5px;color:#6b6b75;border-bottom:1px solid #eee}
      .h b{color:#e5141e} .i{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer}
      .i:hover{background:#fdecec} .a{width:28px;height:28px;border-radius:50%;background:#e5141e;color:#fff;display:grid;place-items:center;font-weight:700;flex:none}
      .t{min-width:0} .u{font-weight:600;direction:ltr;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .p{color:#888;letter-spacing:2px}
      @media (prefers-color-scheme:dark){.m{background:#26262c;color:#f1f1f4;box-shadow:0 10px 30px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)}.h{border-color:#333;color:#a3a3ad}.i:hover{background:#3a2226}}
    </style><div class="m"><div class="h">🔑 <b>IBRA CROM</b> — كلمات السر المحفوظة</div>${list.map((c, i) => `<div class="i" data-i="${i}"><span class="a">${(c.username || '?').slice(0, 1).toUpperCase().replace(/[<&>]/g, '')}</span><div class="t"><div class="u"></div><div class="p">••••••••</div></div></div>`).join('')}</div>`
    root.querySelectorAll('.i').forEach((el, i) => {
      el.querySelector('.u').textContent = list[i].username || '(بدون اسم مستخدم)'
      el.addEventListener('mousedown', (e) => { e.preventDefault(); fill(list[i], field.type === 'password' ? field : null) })
    })
    document.documentElement.appendChild(menuHost)
  }

  document.addEventListener('focusin', async (e) => {
    const el = e.target
    if (!(el instanceof HTMLInputElement)) return
    const isPw = el.type === 'password'
    if (!isPw && !(isUserField(el) && (pwFields().length || /user|login|email|identifier/i.test(el.name + el.id + el.autocomplete)))) return
    const list = await load()
    if (document.activeElement === el && list.length) showMenu(el, list)
  }, true)
  document.addEventListener('focusout', () => setTimeout(() => { if (document.activeElement !== menuField) closeMenu() }, 150), true)
  document.addEventListener('scroll', closeMenu, true)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu() }, true)

  // ملء تلقائي عند فتح الصفحة إذا وُجد حساب واحد فقط
  async function tryAuto() {
    if (autoDone) return
    const pws = pwFields(); if (!pws.length) return
    const list = await load()
    if (list.length === 1 && !pws[0].value) { autoDone = true; fill(list[0], pws[0]) }
  }

  // ── التقاط تسجيل الدخول لعرض «حفظ كلمة السر؟» ──
  document.addEventListener('input', (e) => { const el = e.target; if (el instanceof HTMLInputElement && isUserField(el) && el.value) lastUser = el.value }, true)
  function capture() {
    const pw = pwFields().find(p => p.value) || [...document.querySelectorAll('input[type=password]')].find(p => p.value)
    if (!pw) return
    const uf = userFieldFor(pw)
    const username = (uf && uf.value) || lastUser || ''
    const key = username + '\u0000' + pw.value
    if (key === sentKey) return
    sentKey = key
    ipcRenderer.send('pw:captured', { username, password: pw.value })
  }
  document.addEventListener('submit', capture, true)
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement && (e.target.type === 'password' || e.target.form?.querySelector('input[type=password]'))) capture() }, true)
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, input[type=submit], input[type=button], [role=button], a')
    if (b && document.querySelector('input[type=password]')) setTimeout(capture, 0)
  }, true)
  window.addEventListener('pagehide', capture)

  const mo = new MutationObserver(() => { if (!autoDone) tryAuto() })
  const start = () => { tryAuto(); mo.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => mo.disconnect(), 20000) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start()
})() } catch (e) {}

// تسجيل الدخول لحساب Google: نخفي بصمة Chromium المعدّل حتى لا يرفض Google المتصفح
if (location.hostname === 'accounts.google.com') {
  try { webFrame.executeJavaScript("try { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true }) } catch (e) {}") } catch {}
}

if (location.protocol === 'file:' && /\/pages\/internal\.html$/.test(decodeURIComponent(location.pathname))) {
  const call = (n) => (...a) => ipcRenderer.invoke('page:' + n, ...a)
  const names = ['getSettings', 'setSettings', 'resetSettings', 'history', 'deleteHistory', 'bookmarks', 'saveBookmark', 'removeBookmark',
    'moveBookmark', 'importChrome', 'downloads', 'downloadAction', 'clearDownloads', 'extensions', 'removeExtension', 'loadUnpacked',
    'openExtensionOptions', 'updateExtensions', 'chooseDownloadsDir', 'clearData', 'setDefaultBrowser', 'topSites', 'navigate', 'openTab',
    'openStore', 'appInfo', 'openPath', 'ibdmShow', 'ibdmCheck',
    'features', 'setFeature', 'adblockRefresh', 'adblockAllowRemove', 'shieldRefresh', 'shieldProceed', 'setProxySettings', 'proxyRetry', 'proxyCancelTab', 'updateInfo', 'updateCheck', 'updateDownload', 'updateInstall',
    'pwList', 'pwReveal', 'pwRemove', 'pwEdit', 'pwAdd', 'pwRemoveNever', 'pwImport', 'pwImportFile', 'pwExport', 'openChromePasswords',
    'tasks', 'taskKill', 'lensImage', 'bmMirror', 'bmMirrorSet', 'bmMirrorTree', 'bmImportHtml']
  const api = {}
  for (const n of names) api[n] = call(n)
  api.lang = ipcRenderer.sendSync('page:lang')
  api.onChanged = (cb) => ipcRenderer.on('page:changed', (e, what) => cb(what))
  api.onDownloads = (cb) => ipcRenderer.on('page:downloads', (e, list) => cb(list))
  contextBridge.exposeInMainWorld('ibra', api)
}
