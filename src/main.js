// ═══════════════════════════════════════════════════════════
//  IBRA CROM — متصفح مبني على محرك Chromium
//  برمجة و تطوير ابراهيم الخزرجي
// ═══════════════════════════════════════════════════════════
const {
  app, BrowserWindow, WebContentsView, session, ipcMain, Menu, dialog,
  shell, clipboard, nativeImage, net, screen, Notification,
} = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { pathToFileURL, fileURLToPath } = require('url')
const store = require('./store')
const createAdblock = require('./features/adblock')
const createShield = require('./features/shield')
const createProxy = require('./features/proxy')
const createUpdater = require('./features/updater')
const media = require('./features/media')()
const { resolveIbdm, checkGithub, isIbdmExtension, newer: verNewer } = require('./features/ibdm-ext')

app.setName('IBRA CROM')
if (process.env.IBRA_TEST_RESOLVE) app.commandLine.appendSwitch('host-resolver-rules', process.env.IBRA_TEST_RESOLVE)
if (process.platform === 'win32') app.setAppUserModelId('com.ibrahim.ibracrom')

// ── واجهة كروم حقيقية حتى لا تُحظر المواقع ومتجر الإضافات ──
const chromeUA = app.userAgentFallback
  .replace(/\s?Electron\/\S+/i, '')
  .replace(/\s?ibra[-\s]?crom\/\S+/ig, '')
  .replace(/\s?IBRA CROM\/\S+/ig, '')
app.userAgentFallback = chromeUA

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

const ICON = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'logo.png')
const UI_HTML = path.join(__dirname, 'ui', 'browser.html')
const PAGES_HTML = path.join(__dirname, 'pages', 'internal.html')
const PAGES_URL = pathToFileURL(PAGES_HTML).href
const PRELOAD_UI = path.join(__dirname, 'preload-ui.js')
const PRELOAD_PAGE = path.join(__dirname, 'preload-page.js')
const INTERNAL_PAGES = ['newtab', 'settings', 'history', 'bookmarks', 'downloads', 'extensions', 'about', 'error', 'blocked', 'proxywait']
const VENDOR_DIR = app.isPackaged ? path.join(process.resourcesPath, 'vendor') : path.join(__dirname, '..', 'vendor')

// ── البيانات ──
const DEFAULT_SETTINGS = {
  theme: 'glass', // glass | light | dark
  searchEngine: 'google',
  homepage: 'ibra://newtab',
  startup: 'newtab', // newtab | restore | home
  showBookmarksBar: true,
  showHomeButton: true,
  downloadsDir: '',
  askWhereToSave: false,
  restoreZoom: true,
  ibdmCapture: true, // تسليم التحميلات لبرنامج IBDM Pro عندما يكون مشغّلاً
  // ── الإضافات المدمجة ──
  adblockEnabled: true, adblockAllow: [],
  shieldEnabled: true, shieldScanDownloads: true,
  proxyEnabled: true, proxyMode: 'tor', torTransport: 'auto', torBridges: '',
  proxyCustom: { scheme: 'socks5', host: '', port: '', user: '', pass: '' },
}
let settings = Object.assign({}, DEFAULT_SETTINGS, store.load('settings', {}))
let bookmarks = store.load('bookmarks', [])
let history = store.load('history', [])
let downloadsList = store.load('downloads', [])
let unpackedList = store.load('unpacked', [])
const sitePerms = store.load('permissions', {})

const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  yandex: { name: 'Yandex', url: 'https://yandex.com/search/?text=%s' },
  youtube: { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
}

// الزجاج الحقيقي (Acrylic) متاح في ويندوز 11 فقط، وفي غيره نرسم زجاجاً شبه شفاف
const HAS_BLUR = process.platform === 'win32' && +(os.release().split('.')[2] || 0) >= 22000
const THEME_COLORS = {
  glass: { bar: '#00000000', symbol: '#1b1b1f', bg: HAS_BLUR ? '#00000000' : '#e6e6ec' },
  light: { bar: '#00000000', symbol: '#1b1b1f', bg: '#f3f3f5' },
  dark: { bar: '#00000000', symbol: '#f2f2f4', bg: '#151518' },
}

let ses = null
let extensions = null
let extProxy = null
let adblock = null, shield = null, proxy = null, updater = null
let ibdmExt = { dir: '', version: '0', source: 'builtin' }
const shieldPending = new Map() // webContentsId -> { url, kind }
const extFor = (proxied) => (proxied && extProxy) || extensions
const windows = new Set()
const closedTabs = []
let tabSeq = 1

function downloadsDir() {
  return settings.downloadsDir || app.getPath('downloads')
}

// ═════════════════ عناوين ═════════════════
function internalName(url) {
  if (!url || !url.startsWith(PAGES_URL)) return null
  const h = url.slice(PAGES_URL.length).replace(/^#/, '')
  return (h.split(/[?&|]/)[0] || 'newtab')
}
function displayUrl(tab) {
  const url = tab.wc.getURL()
  const name = internalName(url)
  if (name === 'error' || name === 'blocked') return tab.errorUrl || ''
  if (name === 'proxywait') return tab.pendingUrl || ''
  if (name === 'newtab') return ''
  if (name) return 'ibra://' + name
  return url
}
function toLoadable(input) {
  let s = (input || '').trim()
  if (!s) return PAGES_URL + '#newtab'
  const m = s.match(/^(?:ibra|chrome|edge):\/\/([a-z-]+)/i)
  if (m) {
    const n = m[1].toLowerCase()
    if (n === 'newtab' || n === 'new-tab-page') return PAGES_URL + '#newtab'
    if (INTERNAL_PAGES.includes(n)) return PAGES_URL + '#' + n
    if (n === 'version') return PAGES_URL + '#about'
  }
  if (/^(https?|file|data|view-source|chrome-extension):/i.test(s)) return s
  if (/^about:blank$/i.test(s)) return s
  if (/^[a-zA-Z]:[\\/]/.test(s)) return pathToFileURL(s).href
  if (/^localhost(:\d+)?(\/.*)?$/i.test(s) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(s)) return 'http://' + s
  if (!/\s/.test(s) && /^[^\s/]+\.[a-z؀-ۿ]{2,}(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s
  const eng = ENGINES[settings.searchEngine] || ENGINES.google
  return eng.url.replace('%s', encodeURIComponent(s))
}
function homeUrl() { return toLoadable(settings.homepage || 'ibra://newtab') }

// ═════════════════ نافذة المتصفح ═════════════════
class IbraWindow {
  constructor({ urls, bounds, maximized } = {}) {
    const t = THEME_COLORS[settings.theme] || THEME_COLORS.glass
    const wb = bounds || store.load('window', null)?.bounds
    this.win = new BrowserWindow({
      width: wb?.width || 1280, height: wb?.height || 820,
      x: wb?.x, y: wb?.y,
      minWidth: 520, minHeight: 360,
      title: 'IBRA CROM',
      icon: ICON,
      show: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: t.bar, symbolColor: t.symbol, height: 40 },
      backgroundColor: t.bg,
      backgroundMaterial: settings.theme === 'glass' ? 'acrylic' : 'none',
      webPreferences: { session: ses, sandbox: true },
    })
    this.tabs = []
    this.activeId = null
    this.chromeHeight = 84
    this.overlay = false
    this.htmlFull = false
    this.findOpen = false

    this.ui = new WebContentsView({
      webPreferences: { session: ses, preload: PRELOAD_UI, sandbox: false, contextIsolation: true, spellcheck: false },
    })
    this.ui.setBackgroundColor('#00000000')
    this.win.contentView.addChildView(this.ui)
    this.ui.webContents.loadFile(UI_HTML)
    this.ui.webContents.on('before-input-event', (e, input) => { if (handleShortcut(this, input)) e.preventDefault() })
    this.ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    this.win.on('resize', () => this.layout())
    this.win.on('maximize', () => this.layout())
    this.win.on('unmaximize', () => this.layout())
    this.win.on('enter-full-screen', () => this.layout())
    this.win.on('leave-full-screen', () => { this.htmlFull = false; this.layout() })
    this.win.on('focus', () => { const tab = this.active(); if (tab) extensions.selectTab(tab.wc) })
    this.win.on('close', () => {
      if (!this.win.isFullScreen()) store.save('window', { bounds: this.win.getNormalBounds(), maximized: this.win.isMaximized() })
      if (windows.size === 1) saveSession()
    })
    this.win.on('closed', () => {
      for (const tab of this.tabs) { try { tab.closing = true; extFor(tab.proxied).removeTab(tab.wc) } catch {} try { tab.wc.close() } catch {} }
      windows.delete(this)
    })

    this.ui.webContents.once('did-finish-load', () => {
      this.sendState()
      if (!this.win.isVisible()) {
        if (maximized ?? store.load('window', null)?.maximized) this.win.maximize()
        this.win.show()
      }
    })
    windows.add(this)
    const list = (urls && urls.length) ? urls : [homeUrl()]
    list.forEach((u, i) => this.newTab(u, i === 0))
    this.layout()
    setTimeout(() => { if (!this.win.isDestroyed() && !this.win.isVisible()) this.win.show() }, 2500)
  }

  active() { return this.tabs.find(t => t.id === this.activeId) }
  byWc(wc) { return this.tabs.find(t => t.wc === wc) }

  newTab(url, activate = true, opts = {}) {
    const proxied = !!opts.proxied && settings.proxyEnabled !== false && !!proxy
    const view = new WebContentsView({
      webPreferences: {
        session: proxied ? proxy.session : ses, preload: PRELOAD_PAGE, sandbox: true, contextIsolation: true,
        nodeIntegration: false, plugins: true, spellcheck: true, scrollBounce: true,
      },
    })
    const wc = view.webContents
    const tab = { id: tabSeq++, view, wc, title: 'جديد', favicon: '', loading: false, errorUrl: '', audible: false, muted: false, proxied, pendingUrl: '' }
    const at = opts.index ?? (opts.afterActive ? this.tabs.indexOf(this.active()) + 1 : this.tabs.length)
    this.tabs.splice(Math.max(0, Math.min(at, this.tabs.length)), 0, tab)
    this.wireTab(tab)
    if (!opts.skipExtensions) extFor(proxied).addTab(wc, this.win)
    let target = toLoadable(url)
    if (proxied && !target.startsWith(PAGES_URL)) target = this.proxyGate(tab, target)
    this.applyBg(tab, target)
    wc.loadURL(target).catch(() => {})
    if (activate || !this.activeId) this.activate(tab.id)
    else this.sendState()
    return tab
  }

  // لسان البروكسي ينتظر حتى يجهز الاتصال (Tor) ثم يفتح الموقع
  proxyGate(tab, target) {
    proxy.ensure()
    if (proxy.info().status === 'ready') return target
    tab.pendingUrl = target
    proxy.whenReady(() => {
      if (tab.closing || !tab.pendingUrl || internalName(tab.wc.getURL()) !== 'proxywait') return
      const u = tab.pendingUrl; tab.pendingUrl = ''
      tab.wc.loadURL(u).catch(() => {})
    })
    return PAGES_URL + '#proxywait'
  }

  // تشغيل/إيقاف البروكسي للسان واحد فقط: نعيد فتحه في الجلسة الأخرى بنفس العنوان ونفس المكان
  setTabProxy(id, on) {
    const t = this.tabs.find(x => x.id === id)
    if (!t || !!t.proxied === !!on) return
    if (on && settings.proxyEnabled === false) return
    const n = internalName(t.wc.getURL())
    const url = n === 'proxywait' ? t.pendingUrl : (n === 'error' || n === 'blocked') ? t.errorUrl : t.wc.getURL()
    const wasActive = this.activeId === id
    this.newTab(url || 'ibra://newtab', wasActive, { index: this.tabs.indexOf(t), proxied: on })
    this.closeTab(id, { silent: true })
  }

  applyBg(tab, url) {
    const internal = (url || '').startsWith(PAGES_URL)
    tab.view.setBackgroundColor(internal ? '#00000000' : '#ffffff')
  }

  wireTab(tab) {
    const wc = tab.wc
    const upd = () => this.sendState()
    wc.on('page-title-updated', (e, title) => {
      tab.title = title; upd()
      const h = history.findLast?.(x => x.url === wc.getURL())
      if (h && !internalName(wc.getURL())) { h.title = title; store.save('history', history, 3000) }
    })
    wc.on('page-favicon-updated', (e, favs) => { tab.favicon = favs[0] || ''; upd() })
    wc.on('did-start-loading', () => { tab.loading = true; upd() })
    wc.on('did-stop-loading', () => { tab.loading = false; upd() })
    wc.on('media-started-playing', () => { tab.audible = true; tab.media = true; upd() })
    wc.on('media-paused', () => { tab.audible = false; upd() })
    wc.on('did-start-navigation', (e) => {
      if (e.isMainFrame && !e.isSameDocument) {
        this.applyBg(tab, e.url)
        if (!internalName(e.url)) tab.favicon = ''
        if (internalName(e.url) !== 'proxywait') tab.pendingUrl = ''
        adblock?.resetTab(wc.id)
        if (tab.media) { tab.media = false; media.forget(wc.id) }
        tabMedia.delete(wc.id)
      }
    })
    wc.on('did-navigate', (e, url) => {
      const n = internalName(url)
      if (n !== 'error' && n !== 'blocked') tab.errorUrl = ''
      if (!n) addHistory(url, wc.getTitle())
      else tab.favicon = ''
      if (n && n !== 'error') tab.title = pageTitle(n)
      upd()
    })
    wc.on('did-navigate-in-page', (e, url, isMain) => { if (isMain) upd() })
    wc.on('did-fail-load', (e, code, desc, url, isMain) => {
      if (!isMain || code === -3 || internalName(url)) return
      tab.errorUrl = url
      // فاحص الفيروسات أوقف هذا الموقع
      const sp = shieldPending.get(wc.id)
      if (sp) {
        shieldPending.delete(wc.id)
        tab.errorUrl = sp.url
        wc.loadURL(PAGES_URL + '#blocked|' + sp.kind + '|' + encodeURIComponent(sp.url))
        return
      }
      wc.loadURL(PAGES_URL + '#error|' + code + '|' + encodeURIComponent(desc) + '|' + encodeURIComponent(url))
    })
    wc.on('render-process-gone', (e, d) => {
      if (d.reason === 'clean-exit') return
      tab.errorUrl = wc.getURL()
      wc.loadURL(PAGES_URL + '#error|crash|' + encodeURIComponent(d.reason) + '|' + encodeURIComponent(tab.errorUrl)).catch(() => {})
    })
    wc.on('enter-html-full-screen', () => { this.htmlFull = true; this.layout() })
    wc.on('leave-html-full-screen', () => { this.htmlFull = false; this.layout() })
    wc.on('found-in-page', (e, r) => this.ui.webContents.send('find:result', { active: r.activeMatchOrdinal, total: r.matches }))
    wc.on('zoom-changed', (e, dir) => { const z = wc.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5); wc.setZoomLevel(Math.max(-8, Math.min(9, z))); upd() })
    wc.on('before-input-event', (e, input) => { if (handleShortcut(this, input)) e.preventDefault() })
    if (process.env.IBRA_TEST_SHOT) wc.on('console-message', (e) => console.log('[tab]', e.level, e.message, e.sourceId, e.lineNumber))
    wc.on('context-menu', (e, params) => showContextMenu(this, tab, params))
    wc.setWindowOpenHandler((d) => {
      if (d.disposition === 'new-window' && d.features) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            icon: ICON, autoHideMenuBar: true, backgroundColor: '#ffffff',
            webPreferences: { session: tab.proxied ? proxy.session : ses, sandbox: true, contextIsolation: true },
          },
        }
      }
      const bg = d.disposition === 'background-tab'
      this.newTab(d.url, !bg, { afterActive: true, proxied: tab.proxied })
      return { action: 'deny' }
    })
    wc.on('did-create-window', (w) => {
      w.setMenuBarVisibility(false)
      w.webContents.on('context-menu', (e, p) => showContextMenu(this, { wc: w.webContents }, p))
    })
  }

  activate(id) {
    const tab = this.tabs.find(t => t.id === id)
    if (!tab) return
    const prev = this.active()
    if (prev && prev !== tab) { try { this.win.contentView.removeChildView(prev.view) } catch {} if (this.findOpen) prev.wc.stopFindInPage('clearSelection') }
    this.activeId = id
    this.win.contentView.addChildView(tab.view)
    if (this.overlay) this.win.contentView.addChildView(this.ui)
    this.layout()
    extFor(tab.proxied).selectTab(tab.wc)
    if (this.win.isFocused() && !this.overlay) tab.wc.focus()
    this.sendState()
  }

  closeTab(id, opts = {}) {
    const idx = this.tabs.findIndex(t => t.id === id)
    if (idx < 0) return
    const tab = this.tabs[idx]
    if (tab.closing) return
    tab.closing = true
    const url = tab.wc.getURL()
    const iname = internalName(url)
    if (!opts.silent && url && iname !== 'newtab') closedTabs.push({ proxied: tab.proxied, url: (iname === 'error' || iname === 'blocked') ? tab.errorUrl : iname === 'proxywait' ? tab.pendingUrl : url, title: tab.title || url, favicon: tab.favicon || '', internal: !!internalName(url) && internalName(url) !== 'error', time: Date.now() })
    if (closedTabs.length > 25) closedTabs.shift()
    this.tabs.splice(idx, 1)
    try { extFor(tab.proxied).removeTab(tab.wc) } catch {}
    shieldPending.delete(tab.wc.id)
    tabMedia.delete(tab.wc.id)
    try { this.win.contentView.removeChildView(tab.view) } catch {}
    try { tab.wc.close() } catch {}
    if (!this.tabs.length) { this.win.close(); return }
    if (this.activeId === id) this.activate(this.tabs[Math.min(idx, this.tabs.length - 1)].id)
    else this.sendState()
  }

  moveTab(id, toIndex) {
    const from = this.tabs.findIndex(t => t.id === id)
    if (from < 0) return
    const [t] = this.tabs.splice(from, 1)
    this.tabs.splice(Math.max(0, Math.min(toIndex, this.tabs.length)), 0, t)
    this.sendState()
  }

  layout() {
    if (this.win.isDestroyed()) return
    const [w, h] = this.win.getContentSize()
    this.ui.setBounds({ x: 0, y: 0, width: w, height: h })
    const tab = this.active()
    if (!tab) return
    const top = this.htmlFull ? 0 : this.chromeHeight
    tab.view.setBounds({ x: 0, y: top, width: w, height: Math.max(0, h - top) })
  }

  setOverlay(on) {
    this.overlay = !!on
    if (on) this.win.contentView.addChildView(this.ui)
    else {
      this.win.contentView.addChildView(this.ui, 0)
      const tab = this.active(); if (tab && this.win.isFocused()) tab.wc.focus()
    }
  }

  applyTheme() {
    const t = THEME_COLORS[settings.theme] || THEME_COLORS.glass
    try { this.win.setTitleBarOverlay({ color: t.bar, symbolColor: t.symbol, height: 40 }) } catch {}
    try { this.win.setBackgroundMaterial(settings.theme === 'glass' ? 'acrylic' : 'none') } catch {}
    this.win.setBackgroundColor(t.bg)
  }

  state() {
    const tabs = this.tabs.map(t => {
      const url = t.wc.getURL()
      const d = displayUrl(t)
      return {
        id: t.id, title: t.title || d || 'جديد', favicon: t.favicon, loading: t.loading,
        url: d, internal: !!internalName(url) && !['error', 'blocked', 'proxywait'].includes(internalName(url)), audible: t.audible, muted: t.wc.isAudioMuted(), proxied: !!t.proxied, media: !!t.media,
      }
    })
    const a = this.active()
    let nav = {}
    if (a) {
      const durl = displayUrl(a)
      nav = {
        canBack: a.wc.navigationHistory.canGoBack(), canForward: a.wc.navigationHistory.canGoForward(),
        url: durl, secure: durl.startsWith('https://') && internalName(a.wc.getURL()) !== 'error', error: internalName(a.wc.getURL()) === 'error', internal: !!internalName(a.wc.getURL()) && internalName(a.wc.getURL()) !== 'error',
        bookmarked: !!bookmarks.find(b => b.url === durl), zoom: Math.round(100 * Math.pow(1.2, a.wc.getZoomLevel())),
        tabId: a.wc.id, loading: a.loading, proxied: !!a.proxied, partition: a.proxied ? proxy.partition : '',
        blocked: internalName(a.wc.getURL()) === 'blocked', wait: internalName(a.wc.getURL()) === 'proxywait',
        ads: adblock ? adblock.tabCount(a.wc.id) : 0, host: (() => { try { return /^https?:/.test(durl) ? new URL(durl).hostname : '' } catch { return '' } })(),
      }
      nav.siteAllowed = !!(adblock && nav.host && adblock.siteAllowed(nav.host))
      nav.internal = nav.internal && !nav.blocked && !nav.wait
    }
    const closed = closedTabs.slice(-15).reverse().map(c => ({ title: c.title, url: c.url, favicon: c.favicon, internal: c.internal, time: c.time }))
    const features = {
      proxy: proxy ? (({ enabled, mode, status, progress, message, torAvailable, transport }) => ({ enabled, mode, status, progress, message, torAvailable, transport }))(proxy.info()) : {},
      adblock: adblock ? (({ enabled, ready, total }) => ({ enabled, ready, total }))(adblock.info()) : {},
      shield: shield ? { enabled: shield.info().enabled, blocked: shield.info().stats.blocked } : {},
    }
    return { tabs, activeId: this.activeId, nav, closed, features, update: updater ? updater.info() : {}, ibdm: !!IBDM.cfg, settings, bookmarks: bookmarks.slice(0, 60), platform: process.platform, blur: HAS_BLUR, maximized: this.win.isMaximized() }
  }

  sendState() {
    clearTimeout(this._st)
    this._st = setTimeout(() => {
      if (this.win.isDestroyed()) return
      this.ui.webContents.send('state', this.state())
      const a = this.active()
      this.win.setTitle((a?.title ? a.title + ' - ' : '') + 'IBRA CROM')
    }, 10)
  }
}

// يعيد فتح علامة مغلقة: index = 0 الأحدث، 1 التي قبلها ...
function reopenClosed(w, index = 0) {
  const i = closedTabs.length - 1 - index
  if (i < 0 || i >= closedTabs.length) return
  const [c] = closedTabs.splice(i, 1)
  w.newTab(c.url, true, { proxied: c.proxied })
}

function pageTitle(n) {
  return ({ blocked: 'موقع خطير!', proxywait: 'جاري الاتصال بالبروكسي…', newtab: 'علامة تبويب جديدة', settings: 'الإعدادات', history: 'السجل', bookmarks: 'الإشارات المرجعية', downloads: 'التنزيلات', extensions: 'الإضافات', about: 'حول IBRA CROM', error: 'تعذر الوصول' })[n] || 'IBRA CROM'
}

function winOf(bw) { for (const w of windows) if (w.win === bw) return w }
function winOfUi(wc) { for (const w of windows) if (w.ui.webContents === wc) return w }
function winOfTab(wc) { for (const w of windows) if (w.byWc(wc)) return w }
function focusedWin() {
  const f = BrowserWindow.getFocusedWindow()
  return winOf(f) || [...windows].pop()
}
function broadcastState() { for (const w of windows) w.sendState() }

// ═════════════════ السجل ═════════════════
function addHistory(url, title) {
  if (!/^https?:|^file:/.test(url)) return
  const last = history[history.length - 1]
  if (last && last.url === url && Date.now() - last.time < 3000) return
  history.push({ id: Date.now() + Math.random(), url, title: title || url, time: Date.now() })
  if (history.length > 15000) history = history.slice(-12000)
  store.save('history', history, 2000)
}

function saveSession() {
  if (!windows.size) return
  const s = []
  for (const w of windows) s.push(w.tabs.map(t => internalName(t.wc.getURL()) === 'error' ? t.errorUrl : t.wc.getURL()).filter(Boolean))
  store.save('session', s, 0)
}

// ═════════════════ اختصارات ═════════════════
function handleShortcut(w, i) {
  if (i.type !== 'keyDown') return false
  const ctrl = i.control || i.meta
  const k = (i.key || '').toLowerCase()
  const tab = w.active()
  const code = i.code || ''
  if (ctrl && !i.shift && (k === 't' || code === 'KeyT')) { w.newTab('ibra://newtab'); focusAddress(w); return true }
  if (ctrl && i.shift && (k === 't' || code === 'KeyT')) { reopenClosed(w); return true }
  if (ctrl && (k === 'w' || code === 'KeyW' || k === 'f4')) { if (tab) w.closeTab(tab.id); return true }
  if (ctrl && !i.shift && (k === 'n' || code === 'KeyN')) { new IbraWindow(); return true }
  if (ctrl && i.shift && (k === 'n' || code === 'KeyN')) { menuAction(w, 'proxyTab'); return true }
  if (ctrl && k === 'tab') { cycle(w, i.shift ? -1 : 1); return true }
  if (ctrl && (k === 'pagedown')) { cycle(w, 1); return true }
  if (ctrl && (k === 'pageup')) { cycle(w, -1); return true }
  if (ctrl && /^[1-9]$/.test(k)) { const n = +k; const t = n === 9 ? w.tabs[w.tabs.length - 1] : w.tabs[n - 1]; if (t) w.activate(t.id); return true }
  if ((ctrl && (k === 'l' || code === 'KeyL')) || (i.alt && k === 'd') || k === 'f6') { focusAddress(w); return true }
  if ((ctrl && (k === 'r' || code === 'KeyR')) || k === 'f5') { reload(w, i.shift || ctrl && k === 'f5'); return true }
  if (k === 'escape' && tab?.loading) { tab.wc.stop(); return false }
  if ((i.alt && k === 'arrowleft') || k === 'browserback') { tab?.wc.navigationHistory.goBack(); return true }
  if ((i.alt && k === 'arrowright') || k === 'browserforward') { tab?.wc.navigationHistory.goForward(); return true }
  if (i.alt && k === 'home') { tab?.wc.loadURL(homeUrl()); return true }
  if (k === 'f12' || (ctrl && i.shift && (k === 'i' || code === 'KeyI'))) { tab?.wc.toggleDevTools(); return true }
  if (k === 'f11') { w.win.setFullScreen(!w.win.isFullScreen()); return true }
  if (ctrl && (k === 'f' || code === 'KeyF')) { w.ui.webContents.send('find:open'); return true }
  if (ctrl && (k === 'd' || code === 'KeyD')) { toggleBookmark(w); return true }
  if (ctrl && (k === 'h' || code === 'KeyH')) { w.newTab('ibra://history'); return true }
  if (ctrl && (k === 'j' || code === 'KeyJ')) { w.newTab('ibra://downloads'); return true }
  if (ctrl && i.shift && (k === 'b' || code === 'KeyB')) { setSettings({ showBookmarksBar: !settings.showBookmarksBar }); return true }
  if (ctrl && i.shift && (k === 'o' || code === 'KeyO')) { w.newTab('ibra://bookmarks'); return true }
  if (ctrl && (k === 'p' || code === 'KeyP')) { tab?.wc.print(); return true }
  if (ctrl && (k === 'u' || code === 'KeyU')) { if (tab && /^https?:/.test(tab.wc.getURL())) w.newTab('view-source:' + tab.wc.getURL()); return true }
  if (ctrl && (k === '=' || k === '+' || code === 'NumpadAdd')) { zoom(w, 1); return true }
  if (ctrl && (k === '-' || code === 'NumpadSubtract')) { zoom(w, -1); return true }
  if (ctrl && (k === '0' || code === 'Numpad0')) { zoom(w, 0); return true }
  return false
}
function cycle(w, d) {
  const i = w.tabs.indexOf(w.active())
  const n = w.tabs[(i + d + w.tabs.length) % w.tabs.length]
  if (n) w.activate(n.id)
}
function focusAddress(w) { w.ui.webContents.focus(); w.ui.webContents.send('focus-address') }
function reload(w, hard) {
  const t = w.active(); if (!t) return
  if (internalName(t.wc.getURL()) === 'error' && t.errorUrl) return t.wc.loadURL(t.errorUrl)
  hard ? t.wc.reloadIgnoringCache() : t.wc.reload()
}
function zoom(w, d) {
  const t = w.active(); if (!t) return
  t.wc.setZoomLevel(d === 0 ? 0 : Math.max(-8, Math.min(9, t.wc.getZoomLevel() + d * 0.5)))
  w.sendState()
}

// ═════════════════ الإشارات ═════════════════
function toggleBookmark(w) {
  const t = w.active(); if (!t) return
  const url = displayUrl(t)
  if (!url || url.startsWith('ibra://')) return
  const i = bookmarks.findIndex(b => b.url === url)
  if (i >= 0) bookmarks.splice(i, 1)
  else bookmarks.push({ id: Date.now(), title: t.title || url, url, favicon: t.favicon || '' })
  store.save('bookmarks', bookmarks)
  broadcastState()
  notifyPages('bookmarks')
}

function importChromeBookmarks() {
  const local = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
    path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'),
    path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks'),
    path.join(app.getPath('home'), '.config', 'google-chrome', 'Default', 'Bookmarks'),
  ]
  let added = 0, found = false
  for (const f of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8')); found = true
      const walk = (n) => {
        if (!n) return
        if (n.type === 'url' && n.url && !bookmarks.find(b => b.url === n.url)) { bookmarks.push({ id: Date.now() + added, title: n.name || n.url, url: n.url, favicon: '' }); added++ }
        ;(n.children || []).forEach(walk)
      }
      Object.values(j.roots || {}).forEach(walk)
    } catch {}
  }
  store.save('bookmarks', bookmarks); broadcastState(); notifyPages('bookmarks')
  return { found, added }
}

// ═════════════════ الإعدادات ═════════════════
function setSettings(patch) {
  const themeChanged = patch.theme && patch.theme !== settings.theme
  settings = Object.assign({}, settings, patch)
  store.save('settings', settings)
  if (themeChanged) for (const w of windows) w.applyTheme()
  if ('proxyEnabled' in patch && patch.proxyEnabled === false) {
    for (const w of windows) for (const t of [...w.tabs]) if (t.proxied) w.setTabProxy(t.id, false)
    proxy?.shutdown()
  }
  if (['proxyMode', 'proxyCustom', 'torTransport', 'torBridges'].some(k => k in patch) && proxy && proxyInUse()) proxy.restart()
  broadcastState()
  notifyPages('settings')
}
function proxyInUse() { for (const w of windows) if (w.tabs.some(t => t.proxied)) return true; return false }
let featT = null
function featuresChanged() {
  broadcastState()
  if (!featT) featT = setTimeout(() => { featT = null; notifyPages('features') }, 800)
}

function notifyPages(what) {
  for (const w of windows) for (const t of w.tabs) {
    if (internalName(t.wc.getURL())) t.wc.send('page:changed', what)
  }
}

// ═════════════════ قائمة النقر اليمين ═════════════════
function showContextMenu(w, tab, p) {
  const wc = tab.wc
  const items = []
  const sep = () => { if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' }) }
  if (p.linkURL) {
    items.push({ label: 'فتح الرابط في علامة تبويب جديدة', click: () => w.newTab(p.linkURL, false, { afterActive: true }) })
    items.push({ label: 'فتح الرابط في نافذة جديدة', click: () => new IbraWindow({ urls: [p.linkURL] }) })
    if (settings.proxyEnabled !== false && !tab.proxied) items.push({ label: 'فتح الرابط في لسان بروكسي', click: () => w.newTab(p.linkURL, true, { afterActive: true, proxied: true }) })
    items.push({ label: 'حفظ الرابط باسم...', click: () => wc.downloadURL(p.linkURL) })
    items.push({ label: 'نسخ عنوان الرابط', click: () => clipboard.writeText(p.linkURL) })
    sep()
  }
  if (p.hasImageContents || p.mediaType === 'image') {
    items.push({ label: 'فتح الصورة في علامة تبويب جديدة', click: () => w.newTab(p.srcURL, false, { afterActive: true }) })
    items.push({ label: 'حفظ الصورة باسم...', click: () => wc.downloadURL(p.srcURL) })
    items.push({ label: 'نسخ الصورة', click: () => wc.copyImageAt(p.x, p.y) })
    items.push({ label: 'نسخ عنوان الصورة', click: () => clipboard.writeText(p.srcURL) })
    sep()
  }
  if (p.mediaType === 'video' || p.mediaType === 'audio') {
    items.push({ label: 'حفظ الملف باسم...', click: () => wc.downloadURL(p.srcURL) })
    items.push({ label: 'نسخ عنوان الملف', click: () => clipboard.writeText(p.srcURL) })
    sep()
  }
  if (p.isEditable) {
    if (p.misspelledWord && p.dictionarySuggestions?.length) {
      p.dictionarySuggestions.slice(0, 5).forEach(s => items.push({ label: s, click: () => wc.replaceMisspelling(s) }))
      sep()
    }
    items.push({ label: 'تراجع', role: 'undo' }, { label: 'إعادة', role: 'redo' }, { type: 'separator' },
      { label: 'قص', role: 'cut', enabled: p.editFlags.canCut }, { label: 'نسخ', role: 'copy', enabled: p.editFlags.canCopy },
      { label: 'لصق', role: 'paste', enabled: p.editFlags.canPaste }, { label: 'تحديد الكل', role: 'selectAll' })
    sep()
  } else if (p.selectionText) {
    const s = p.selectionText.trim()
    items.push({ label: 'نسخ', role: 'copy' })
    items.push({ label: `البحث في ${(ENGINES[settings.searchEngine] || ENGINES.google).name} عن "${s.length > 24 ? s.slice(0, 24) + '…' : s}"`, click: () => w.newTab(toLoadable(s), true, { afterActive: true }) })
    sep()
  }
  if (!p.linkURL && !p.selectionText && !p.isEditable && !p.hasImageContents && tab.id) {
    items.push({ label: 'رجوع', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() })
    items.push({ label: 'تقدم', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() })
    items.push({ label: 'إعادة التحميل', click: () => wc.reload() })
    sep()
    items.push({ label: 'حفظ الصفحة باسم...', click: () => savePage(w, wc) })
    items.push({ label: 'طباعة...', click: () => wc.print() })
    if (/^https?:/.test(wc.getURL())) items.push({ label: 'عرض مصدر الصفحة', click: () => w.newTab('view-source:' + wc.getURL(), true, { afterActive: true }) })
    sep()
  }
  // ── IBDM Pro مدمج ──
  if (/^https?:/i.test(wc.getURL() || '') || /^https?:/i.test(p.linkURL || p.srcURL || '')) {
    sep()
    const mark = IBDM.cfg ? '' : ' (غير مشغّل)'
    if (p.linkURL && /^https?:/i.test(p.linkURL)) items.push({ label: 'تحميل الرابط بواسطة IBDM Pro' + mark, click: () => ibdmFromMenu('link', p.linkURL, wc) })
    if ((p.mediaType === 'video' || p.mediaType === 'audio') && /^https?:/i.test(p.srcURL)) items.push({ label: 'تحميل هذا الفيديو بواسطة IBDM Pro' + mark, click: () => ibdmFromMenu('media', p.srcURL, wc) })
    else if (p.mediaType === 'image' && /^https?:/i.test(p.srcURL)) items.push({ label: 'تحميل الصورة بواسطة IBDM Pro' + mark, click: () => ibdmFromMenu('link', p.srcURL, wc) })
    if (!p.linkURL && /^https?:/i.test(wc.getURL())) items.push({ label: 'تحميل فيديو هذه الصفحة بواسطة IBDM Pro' + mark, click: () => ibdmFromMenu('media', wc.getURL(), wc) })
    const found = [...(tabMedia.get(wc.id)?.values() || [])]
    if (found.length) {
      const sz = (b) => b > 0 ? (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB') : ''
      items.push({ label: `الفيديوهات في هذه الصفحة (${found.length}) — IBDM Pro`, submenu: found.slice(-15).reverse().map(m => {
        let name = ''; try { name = decodeURIComponent(new URL(m.url).pathname.split('/').pop()) } catch {}
        return { label: `${m.type === 'stream' ? 'بث' : m.type === 'audio' ? 'صوت' : 'فيديو'} ${sz(m.size)} — ${(name || m.url).slice(0, 50)}`, click: () => ibdmFromMenu(m.type === 'stream' ? 'media' : 'link', m.url, wc) }
      }) })
    }
  }
  try {
    // عناصر IBDM من الإضافة المدمجة مكررة مع العناصر أعلاه فلا نعرضها مرتين
    const ext = extensions.getContextMenuItems(wc, p).filter(m => !/IBDM/i.test(m.label || ''))
    if (ext.length) { sep(); items.push(...ext) }
  } catch {}
  sep()
  items.push({ label: 'فحص العنصر', click: () => { wc.inspectElement(p.x, p.y) } })
  Menu.buildFromTemplate(items).popup({ window: w.win })
}

async function savePage(w, wc) {
  const r = await dialog.showSaveDialog(w.win, {
    defaultPath: path.join(downloadsDir(), (wc.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_') + '.html'),
    filters: [{ name: 'صفحة ويب كاملة', extensions: ['html', 'htm'] }],
  })
  if (!r.canceled && r.filePath) wc.savePage(r.filePath, 'HTMLComplete').catch(() => {})
}

// ═════════════════ التنزيلات ═════════════════
const liveItems = new Map()
let dlTimer = null
function pushDownloads(immediate) {
  clearTimeout(dlTimer)
  dlTimer = setTimeout(() => {
    const list = downloadsList.slice(-200).reverse()
    for (const w of windows) w.ui.webContents.send('downloads', list)
    for (const w of windows) for (const t of w.tabs) if (internalName(t.wc.getURL()) === 'downloads') t.wc.send('page:downloads', list)
  }, immediate ? 0 : 150)
}
function uniquePath(dir, name) {
  name = (name || 'download').replace(/[\\/:*?"<>|]/g, '_')
  let p = path.join(dir, name)
  const ext = path.extname(name), base = path.basename(name, ext)
  let n = 1
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${n++})${ext}`)
  return p
}
// ═════════════════ IBDM Pro (تكامل رسمي) ═════════════════
// IBRA CROM يسلّم التحميلات مباشرة لبرنامج IBDM Pro عبر خادمه المحلي 127.0.0.1:39401
const http = require('http')
const IBDM = { cfg: null, at: 0 }
const IBDM_MIME = {
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'application/x-rar-compressed': 'rar', 'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z', 'application/pdf': 'pdf', 'application/x-msdownload': 'exe', 'application/x-msi': 'msi',
  'application/vnd.android.package-archive': 'apk', 'application/x-iso9660-image': 'iso', 'video/mp4': 'mp4', 'video/x-matroska': 'mkv',
  'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/x-bittorrent': 'torrent',
}
const ibdmLetThrough = new Set()
function ibdmReq(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null
    const headers = { 'X-IBDM-Pro': '1' }
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length }
    const r = http.request({ host: '127.0.0.1', port: 39401, path: p, method, headers, timeout: 1500 }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', d => b += d)
      res.on('end', () => { try { resolve(res.statusCode < 300 ? JSON.parse(b || '{}') : null) } catch { resolve(res.statusCode < 300 ? {} : null) } })
    })
    r.on('error', () => resolve(null)); r.on('timeout', () => { r.destroy(); resolve(null) })
    if (data) r.write(data)
    r.end()
  })
}
async function ibdmPing() {
  const was = !!IBDM.cfg
  IBDM.cfg = await ibdmReq('GET', '/ping'); IBDM.at = Date.now()
  // تم تحديث برنامج IBDM Pro؟ نحمّل إضافته الأحدث تلقائياً
  if (IBDM.cfg?.version && IBDM.cfg.version !== IBDM.checkedFor && verNewer(IBDM.cfg.version, ibdmExt.version)) {
    IBDM.checkedFor = IBDM.cfg.version
    reloadIbdmExtension().then(() => { if (verNewer(IBDM.cfg.version, ibdmExt.version)) ibdmGithubCheck() })
  }
  if (was !== !!IBDM.cfg) { broadcastState(); notifyPages('settings') }
  return IBDM.cfg
}
function extOfName(n) { const b = (n || '').split(/[?#]/)[0].split(/[\\/]/).pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : '' }
function ibdmShouldTake(item) {
  const cfg = IBDM.cfg
  if (settings.ibdmCapture === false || !cfg || !cfg.capture) return false
  const url = item.getURL()
  if (!/^https?:/i.test(url)) return false
  if (ibdmLetThrough.has(url)) { ibdmLetThrough.delete(url); return false }
  let urlName = ''; try { urlName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') } catch {}
  const ext = extOfName(item.getFilename()) || extOfName(urlName) || IBDM_MIME[(item.getMimeType() || '').toLowerCase()] || ''
  if (!ext || !(cfg.extensions || []).includes(ext)) return false
  const size = item.getTotalBytes()
  if (cfg.minSizeKB > 0 && size > 0 && size < cfg.minSizeKB * 1024) return false
  let host = ''; try { host = new URL(url).hostname } catch {}
  if ((cfg.excluded || []).some(x => x && (host === x || host.endsWith('.' + x)))) return false
  return true
}
async function ibdmCookies(url) {
  try { return (await ses.cookies.get({ url })).map(c => `${c.name}=${c.value}`).join('; ') } catch { return '' }
}
async function ibdmSend(payload, wc) {
  payload.cookies = payload.cookies ?? await ibdmCookies(payload.url)
  payload.userAgent = chromeUA
  const r = await ibdmReq('POST', '/add', payload)
  const w = (wc && winOfTab(wc)) || focusedWin()
  if (r) w?.ui.webContents.send('toast', 'أُرسل إلى IBDM Pro: ' + (payload.fileName || payload.title || payload.url))
  else { IBDM.cfg = null; w?.ui.webContents.send('toast', 'IBDM Pro غير مشغّل — شغّله ثم حاول مرة ثانية') }
  return !!r
}
function ibdmFromMenu(kind, url, wc) {
  const page = wc && !wc.isDestroyed() ? wc.getURL() : ''
  let fileName = ''; try { fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') } catch {}
  return ibdmSend({ kind, url, pageUrl: page, referrer: page, title: wc && !wc.isDestroyed() ? wc.getTitle() : '', fileName: kind === 'link' ? fileName : '' }, wc)
}

function setupDownloads() {
  ibdmPing(); setInterval(ibdmPing, 5000)
  for (const s of [ses, proxy.session]) attachDownloads(s)
}
function attachDownloads(s) {
  const isProxy = s === proxy.session
  s.on('will-download', (e, item, srcWc) => {
    // تحميلات ألسن البروكسي تبقى داخل المتصفح حتى تمر عبر البروكسي
    if (!isProxy && ibdmShouldTake(item)) {
      e.preventDefault()
      const url = item.getURL()
      const page = srcWc && !srcWc.isDestroyed() ? srcWc.getURL() : ''
      ibdmSend({ kind: 'file', url, pageUrl: page, referrer: page, fileName: item.getFilename() || '', mime: item.getMimeType() || '', size: item.getTotalBytes() > 0 ? item.getTotalBytes() : -1 }, srcWc)
        .then(ok => { if (!ok) { ibdmLetThrough.add(url); s.downloadURL(url) } })
      return
    }
    const id = Date.now() + '-' + Math.floor(Math.random() * 1e6)
    if (!settings.askWhereToSave) {
      try { fs.mkdirSync(downloadsDir(), { recursive: true }) } catch {}
      item.setSavePath(uniquePath(downloadsDir(), item.getFilename()))
    } else {
      item.setSaveDialogOptions({ defaultPath: path.join(downloadsDir(), item.getFilename()) })
    }
    const rec = { id, filename: item.getFilename(), url: item.getURL(), path: item.getSavePath(), total: item.getTotalBytes(), received: 0, state: 'progressing', paused: false, start: Date.now(), speed: 0 }
    downloadsList.push(rec)
    liveItems.set(id, item)
    let lastB = 0, lastT = Date.now()
    item.on('updated', (ev, state) => {
      rec.path = item.getSavePath() || rec.path
      if (rec.path) rec.filename = path.basename(rec.path)
      rec.received = item.getReceivedBytes(); rec.total = item.getTotalBytes()
      rec.state = state === 'interrupted' ? 'interrupted' : 'progressing'
      rec.paused = item.isPaused()
      const now = Date.now()
      if (now - lastT > 600) { rec.speed = Math.round((rec.received - lastB) * 1000 / (now - lastT)); lastB = rec.received; lastT = now }
      pushDownloads()
    })
    item.once('done', (ev, state) => {
      rec.state = state // completed | cancelled | interrupted
      rec.received = item.getReceivedBytes(); rec.path = item.getSavePath(); rec.filename = path.basename(rec.path || rec.filename)
      rec.speed = 0
      liveItems.delete(id)
      store.save('downloads', downloadsList.slice(-500))
      pushDownloads(true)
      if (state === 'completed' && Notification.isSupported()) {
        const n = new Notification({ title: 'اكتمل التنزيل', body: rec.filename, icon: path.join(__dirname, 'assets', 'logo.png') })
        n.on('click', () => shell.showItemInFolder(rec.path)); n.show()
      }
      if (state === 'completed') scanDownload(rec)
    })
    pushDownloads(true)
    for (const w of windows) w.ui.webContents.send('downloads:started')
  })
}
// فحص الملف المنزّل بـ Windows Defender
async function scanDownload(rec) {
  if (!shield || !rec.path) return
  rec.scan = 'scanning'; pushDownloads(true)
  const r = await shield.scanFile(rec.path)
  rec.scan = r || ''
  store.save('downloads', downloadsList.slice(-500)); pushDownloads(true)
  if (r === 'threat') {
    for (const w of windows) w.ui.webContents.send('toast', '⚠ تحذير: الملف «' + rec.filename + '» يحتوي على فيروس! احذفه من صفحة التنزيلات')
    if (Notification.isSupported()) new Notification({ title: 'IBRA Shield — تم اكتشاف فيروس!', body: rec.filename + '\nلا تفتح هذا الملف واحذفه من صفحة التنزيلات.', icon: path.join(__dirname, 'assets', 'logo.png'), urgency: 'critical' }).show()
  }
}

function downloadAction(id, action) {
  const rec = downloadsList.find(d => d.id === id)
  const item = liveItems.get(id)
  if (!rec) return
  if (action === 'open' && rec.path) shell.openPath(rec.path)
  if (action === 'folder' && rec.path) shell.showItemInFolder(rec.path)
  if (action === 'pause' && item) item.pause()
  if (action === 'resume' && item && item.canResume()) item.resume()
  if (action === 'cancel' && item) item.cancel()
  if (action === 'retry') focusedWin()?.active()?.wc.downloadURL(rec.url)
  if (action === 'remove') { if (item) item.cancel(); downloadsList = downloadsList.filter(d => d.id !== id) }
  if (action === 'copy') clipboard.writeText(rec.url)
  if (action === 'trash' && rec.path) { shell.trashItem(rec.path).catch(() => {}); rec.state = 'cancelled'; rec.scan = 'deleted' }
  if (action === 'rescan') scanDownload(rec)
  store.save('downloads', downloadsList.slice(-500))
  pushDownloads(true)
}

// ═════════════════ الأذونات ═════════════════
function setupPermissions() { for (const s of [ses, proxy.session]) attachPermissions(s) }
function attachPermissions(s) {
  const ASK = { media: 'الكاميرا والميكروفون', geolocation: 'موقعك الجغرافي', notifications: 'إظهار الإشعارات', 'display-capture': 'مشاركة الشاشة', midiSysex: 'أجهزة MIDI' }
  s.setPermissionRequestHandler(async (wc, permission, cb, details) => {
    if (!ASK[permission]) return cb(true)
    let origin = ''
    try { origin = new URL(details.requestingUrl || wc.getURL()).origin } catch {}
    if (origin.startsWith('chrome-extension:') || origin.startsWith('file:')) return cb(true)
    const key = origin + '|' + permission
    if (key in sitePerms) return cb(sitePerms[key])
    const bw = BrowserWindow.fromWebContents(wc) || winOfTab(wc)?.win || focusedWin()?.win
    const r = await dialog.showMessageBox(bw, {
      type: 'question', buttons: ['سماح', 'رفض'], defaultId: 0, cancelId: 1, title: 'IBRA CROM',
      message: `${origin} يطلب: ${ASK[permission]}`, checkboxLabel: 'تذكر قراري لهذا الموقع', checkboxChecked: true,
    })
    const ok = r.response === 0
    if (r.checkboxChecked) { sitePerms[key] = ok; store.save('permissions', sitePerms) }
    cb(ok)
  })
}

// ═════════════════ الإضافات ═════════════════
function makeExtensions(ElectronChromeExtensions, s, proxied) {
  return new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: s,
    async createTab(details) {
      const w = [...windows].find(x => x.win.id === details.windowId) || focusedWin() || new IbraWindow({ urls: ['about:blank'] })
      const tab = w.newTab(details.url || 'ibra://newtab', details.active !== false, { skipExtensions: true, proxied })
      return [tab.wc, w.win]
    },
    selectTab(wc, bw) { const w = winOf(bw) || winOfTab(wc); const t = w?.byWc(wc); if (t) w.activate(t.id) },
    removeTab(wc, bw) { const w = winOf(bw) || winOfTab(wc); const t = w?.byWc(wc); if (t) w.closeTab(t.id) },
    async createWindow(details) {
      const urls = details.url ? [].concat(details.url) : undefined
      const w = new IbraWindow({ urls })
      return w.win
    },
    removeWindow(bw) { bw.close() },
  })
}
function builtinIbdmDir() {
  return path.join(__dirname, 'builtin', 'ibdm').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}
const extIdByPath = (s, dir) => s.extensions.getAllExtensions().find(x => x.path === dir)?.id
async function reloadIbdmExtension() {
  const next = resolveIbdm(builtinIbdmDir(), app.getPath('userData'))
  if (next.dir === ibdmExt.dir) return
  const prev = ibdmExt
  ibdmExt = next
  for (const s of [ses, proxy.session]) {
    const id = extIdByPath(s, prev.dir); if (id) s.extensions.removeExtension(id)
    try { await s.extensions.loadExtension(next.dir) } catch (e) { console.error('IBDM reload failed', e.message) }
  }
  notifyPages('extensions')
}
// تحديث إضافة IBDM من صفحة إصدارات GitHub (عندما لا يكون برنامج IBDM Pro مثبتاً)
let ibdmGhBusy = false
async function ibdmGithubCheck() {
  if (ibdmGhBusy) return; ibdmGhBusy = true
  try { if (await checkGithub(app.getPath('userData'), ibdmExt.version, (u, o) => net.fetch(u, o))) await reloadIbdmExtension() }
  catch (e) { console.error('IBDM GitHub check', e.message) }
  finally { ibdmGhBusy = false }
}
// نسخة واحدة فقط من IBDM — أي نسخة ثانية (مثبتة يدوياً أو من السوق) تُزال حتى لا يتكرر الزر العائم
function dedupeIbdm(s, x) {
  if (!isIbdmExtension(x) || x.path === ibdmExt.dir) return false
  try { s.extensions.removeExtension(x.id) } catch {}
  if (unpackedList.includes(x.path)) { unpackedList = unpackedList.filter(p => p !== x.path); store.save('unpacked', unpackedList) }
  return true
}
async function setupExtensions() {
  const { ElectronChromeExtensions } = require('electron-chrome-extensions')
  const { installChromeWebStore, uninstallExtension, loadAllExtensions } = require('electron-chrome-web-store')
  extensions = makeExtensions(ElectronChromeExtensions, ses, false)
  extProxy = makeExtensions(ElectronChromeExtensions, proxy.session, true)
  ElectronChromeExtensions.handleCRXProtocol(ses)
  module.exports.uninstallExtension = uninstallExtension
  try {
    await installChromeWebStore({ session: ses, allowUnpackedExtensions: true, autoUpdate: true })
  } catch (e) { console.error('webstore init failed', e) }
  if (process.env.IBRA_TEST_SHOT) ses.serviceWorkers.on('console-message', (e, d) => console.log('[sw]', JSON.stringify(d || e)))
  ibdmExt = resolveIbdm(builtinIbdmDir(), app.getPath('userData'))
  try { await ses.extensions.loadExtension(ibdmExt.dir) } catch (e) { console.error('IBDM extension load failed', e.message) }
  for (const p of unpackedList) {
    try { await ses.extensions.loadExtension(p) } catch (e) { console.error('unpacked load failed', p, e.message) }
  }
  // نفس الإضافات تعمل أيضاً داخل ألسن البروكسي
  const ps = proxy.session
  try { await loadAllExtensions(ps, path.join(app.getPath('userData'), 'Extensions'), { allowUnpacked: true }) } catch (e) { console.error('proxy ext load', e.message) }
  for (const x of ses.extensions.getAllExtensions()) if (!ps.extensions.getExtension(x.id)) { try { await ps.extensions.loadExtension(x.path) } catch {} }
  for (const s of [ses, ps]) for (const x of s.extensions.getAllExtensions()) dedupeIbdm(s, x)
  ps.extensions.on('extension-loaded', (e, x) => dedupeIbdm(ps, x))
  ses.extensions.on('extension-loaded', (e, x) => {
    if (dedupeIbdm(ses, x)) { for (const w of windows) w.ui.webContents.send('toast', 'إضافة IBDM Pro مدمجة مسبقاً في IBRA CROM — لا حاجة لتثبيتها مرة ثانية'); return }
    notifyPages('extensions'); broadcastState(); if (!ps.extensions.getExtension(x.id)) ps.extensions.loadExtension(x.path).catch(() => {})
  })
  setTimeout(ibdmGithubCheck, 20000); setInterval(ibdmGithubCheck, 12 * 3600e3)
  ses.extensions.on('extension-unloaded', (e, x) => { notifyPages('extensions'); broadcastState(); if (ps.extensions.getExtension(x.id)) ps.extensions.removeExtension(x.id) })
}

function listExtensions() {
  return ses.extensions.getAllExtensions().map(x => {
    const icons = x.manifest.icons || {}
    const size = Object.keys(icons).map(Number).sort((a, b) => b - a)[0]
    let icon = ''
    if (size) { try { icon = pathToFileURL(path.join(x.path, icons[size])).href } catch {} }
    return {
      id: x.id, name: x.name, version: x.version, description: x.manifest.description || '',
      icon, unpacked: unpackedList.includes(x.path), path: x.path, builtin: x.path === ibdmExt.dir,
      options: x.manifest.options_page || x.manifest.options_ui?.page || '',
    }
  }).filter(x => !/^(Chrome Web Store|chrome-webstore)$/i.test(x.name))
}

async function removeExtension(id) {
  const x = ses.extensions.getExtension(id)
  if (!x || x.path === ibdmExt.dir) return
  if (unpackedList.includes(x.path)) {
    unpackedList = unpackedList.filter(p => p !== x.path); store.save('unpacked', unpackedList)
    ses.extensions.removeExtension(id)
  } else {
    try { await module.exports.uninstallExtension(id, { session: ses }) } catch { ses.extensions.removeExtension(id) }
  }
  notifyPages('extensions')
}

// ═════════════════ IPC: الواجهة ═════════════════
function setupIpc() {
  const W = (e) => winOfUi(e.sender)
  ipcMain.on('ui:height', (e, h) => { const w = W(e); if (w && h > 0) { w.chromeHeight = Math.round(h); w.layout() } })
  ipcMain.on('ui:overlay', (e, on) => W(e)?.setOverlay(on))
  ipcMain.on('ui:ready', (e) => W(e)?.sendState())
  ipcMain.on('tab:new', (e, url) => { const w = W(e); if (w) { w.newTab(url || 'ibra://newtab'); if (!url) focusAddress(w) } })
  ipcMain.on('tab:close', (e, id) => W(e)?.closeTab(id))
  ipcMain.on('tab:activate', (e, id) => W(e)?.activate(id))
  ipcMain.on('tab:move', (e, id, to) => W(e)?.moveTab(id, to))
  ipcMain.on('tab:reopen', (e, index) => { const w = W(e); if (w) reopenClosed(w, index | 0) })
  ipcMain.on('tab:reopen-all', (e) => { const w = W(e); if (!w) return; while (closedTabs.length) reopenClosed(w, 0) })
  ipcMain.on('ibdm:show', () => ibdmReq('POST', '/show', {}))
  // ── IBRA Media ──
  ipcMain.handle('media:list', async () => {
    const out = []
    for (const w of windows) for (const t of w.tabs) {
      if (!t.media || t.closing) continue
      const i = await media.info(t.wc)
      if (!i) { t.media = false; continue }
      let site = ''; try { site = new URL(displayUrl(t)).hostname.replace(/^www\./, '') } catch {}
      out.push({ ...i, id: t.wc.id, site, favicon: t.favicon || '', audible: t.audible, active: w.activeId === t.id && w.win.isFocused() })
    }
    for (const w of windows) w.sendState()
    return out.sort((a, b) => (a.paused - b.paused))
  })
  ipcMain.on('media:act', (e, id, action, value) => {
    for (const w of windows) { const t = w.tabs.find(x => x.wc.id === id); if (t) media.act(t.wc, action, value).then(() => setTimeout(() => w.sendState(), 150)) }
  })
  ipcMain.on('media:focus', (e, id) => {
    for (const w of windows) { const t = w.tabs.find(x => x.wc.id === id); if (t) { w.activate(t.id); if (w.win.isMinimized()) w.win.restore(); w.win.focus() } }
  })
  ipcMain.on('update:check', () => updater.check())
  ipcMain.on('update:download', () => updater.download())
  ipcMain.on('update:install', () => updater.install())
  ipcMain.on('proxy:toggle', (e, id) => { const w = W(e); const t = id ? w?.tabs.find(x => x.id === id) : w?.active(); if (t) w.setTabProxy(t.id, !t.proxied) })
  ipcMain.on('proxy:newtab', (e) => { const w = W(e); if (w) { w.newTab('ibra://newtab', true, { proxied: true }); focusAddress(w) } })
  ipcMain.on('proxy:retry', () => proxy.restart())
  ipcMain.on('adblock:site', (e, allowed) => { const w = W(e); const t = w?.active(); if (!t) return; let h = ''; try { h = new URL(displayUrl(t)).hostname } catch {} if (h) { adblock.setSiteAllowed(h, allowed); t.wc.reload() } })
  ipcMain.on('feature:set', (e, key, val) => { if (['adblockEnabled', 'shieldEnabled', 'proxyEnabled'].includes(key)) { setSettings({ [key]: !!val }); if (key === 'adblockEnabled') W(e)?.active()?.wc.reload() } })
  ipcMain.on('tab:mute', (e, id) => { const w = W(e); const t = w?.tabs.find(x => x.id === id); if (t) { t.wc.setAudioMuted(!t.wc.isAudioMuted()); w.sendState() } })
  ipcMain.on('tab:menu', (e, id) => {
    const w = W(e); const t = w?.tabs.find(x => x.id === id); if (!t) return
    Menu.buildFromTemplate([
      { label: 'علامة تبويب جديدة', click: () => w.newTab('ibra://newtab', true, { index: w.tabs.indexOf(t) + 1 }) },
      { label: 'إعادة التحميل', click: () => t.wc.reload() },
      { label: 'تكرار', click: () => w.newTab(t.wc.getURL(), true, { index: w.tabs.indexOf(t) + 1 }) },
      ...(settings.proxyEnabled !== false ? [{ label: t.proxied ? 'إيقاف البروكسي لهذا اللسان' : 'تشغيل البروكسي لهذا اللسان', click: () => w.setTabProxy(t.id, !t.proxied) }] : []),
      { label: t.wc.isAudioMuted() ? 'إلغاء كتم الموقع' : 'كتم صوت الموقع', click: () => { t.wc.setAudioMuted(!t.wc.isAudioMuted()); w.sendState() } },
      { label: 'نقل إلى نافذة جديدة', click: () => { const u = t.wc.getURL(); w.closeTab(t.id); new IbraWindow({ urls: [u] }) } },
      { type: 'separator' },
      { label: 'إغلاق', click: () => w.closeTab(t.id) },
      { label: 'إغلاق علامات التبويب الأخرى', click: () => w.tabs.filter(x => x !== t).forEach(x => w.closeTab(x.id)) },
      { label: 'إغلاق علامات التبويب على اليسار', click: () => w.tabs.slice(w.tabs.indexOf(t) + 1).forEach(x => w.closeTab(x.id)) },
      { label: 'إعادة فتح علامة مغلقة', enabled: closedTabs.length > 0, click: () => reopenClosed(w) },
    ]).popup({ window: w.win })
  })
  ipcMain.on('nav:go', (e, input) => {
    const w = W(e); const t = w?.active(); if (!t) return
    const target = toLoadable(input)
    t.wc.loadURL(target).catch(() => {}); t.wc.focus()
  })
  ipcMain.on('nav:back', (e) => W(e)?.active()?.wc.navigationHistory.goBack())
  ipcMain.on('nav:forward', (e) => W(e)?.active()?.wc.navigationHistory.goForward())
  ipcMain.on('nav:reload', (e, hard) => { const w = W(e); if (w) reload(w, hard) })
  ipcMain.on('nav:stop', (e) => W(e)?.active()?.wc.stop())
  ipcMain.on('nav:home', (e) => W(e)?.active()?.wc.loadURL(homeUrl()))
  ipcMain.on('nav:zoom', (e, d) => { const w = W(e); if (w) zoom(w, d) })
  ipcMain.on('bookmark:toggle', (e) => { const w = W(e); if (w) toggleBookmark(w) })
  ipcMain.on('bookmark:open', (e, url, newTab) => { const w = W(e); if (!w) return; if (newTab) w.newTab(url, false, { afterActive: true }); else w.active()?.wc.loadURL(toLoadable(url)) })
  ipcMain.on('bookmark:remove', (e, id) => { bookmarks = bookmarks.filter(b => b.id !== id); store.save('bookmarks', bookmarks); broadcastState(); notifyPages('bookmarks') })
  ipcMain.on('find:query', (e, text, opts = {}) => {
    const w = W(e); const t = w?.active(); if (!t) return
    w.findOpen = true
    if (!text) { t.wc.stopFindInPage('clearSelection'); w.ui.webContents.send('find:result', { active: 0, total: 0 }); return }
    // ملاحظة: تمرير findNext:false صراحةً يمنع نتائج العدّ في هذا الإصدار، لذا نمرره فقط عند التالي/السابق
    const fo = { forward: opts.forward !== false }
    if (opts.next) fo.findNext = true
    t.wc.findInPage(text, fo)
  })
  ipcMain.on('find:stop', (e) => { const w = W(e); if (!w) return; w.findOpen = false; w.active()?.wc.stopFindInPage('clearSelection') })
  ipcMain.on('menu:action', (e, a) => menuAction(W(e), a))
  ipcMain.on('dl:action', (e, id, a) => downloadAction(id, a))
  ipcMain.handle('dl:list', () => downloadsList.slice(-200).reverse())
  ipcMain.handle('suggest', async (e, q) => {
    q = (q || '').trim(); if (!q) return { local: [], remote: [] }
    const ql = q.toLowerCase()
    const seen = new Set(); const local = []
    for (const b of bookmarks) if ((b.url + ' ' + b.title).toLowerCase().includes(ql) && !seen.has(b.url)) { seen.add(b.url); local.push({ url: b.url, title: b.title, kind: 'bookmark' }); if (local.length >= 3) break }
    for (let i = history.length - 1; i >= 0 && local.length < 6; i--) {
      const h = history[i]
      if (!seen.has(h.url) && (h.url + ' ' + h.title).toLowerCase().includes(ql)) { seen.add(h.url); local.push({ url: h.url, title: h.title, kind: 'history' }) }
    }
    let remote = []
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 1200)
      const r = await net.fetch('https://suggestqueries.google.com/complete/search?client=chrome&hl=ar&q=' + encodeURIComponent(q), { signal: ctrl.signal, session: ses })
      clearTimeout(to)
      const txt = await r.text()
      remote = (JSON.parse(txt)[1] || []).slice(0, 6)
    } catch {}
    return { local, remote }
  })
  ipcMain.on('window:menu-system', (e) => { const w = W(e); if (w) w.win.isMaximized() ? w.win.unmaximize() : w.win.maximize() })

  // ── صفحات IBRA الداخلية ──
  const P = (e) => { const u = e.senderFrame?.url || e.sender.getURL(); if (!u.startsWith(PAGES_URL)) throw new Error('denied'); return winOfTab(e.sender) }
  const handle = (n, fn) => ipcMain.handle('page:' + n, (e, ...a) => { const w = P(e); return fn(w, e, ...a) })
  handle('getSettings', () => ({ settings, blur: HAS_BLUR, ibdm: IBDM.cfg ? { version: IBDM.cfg.version } : null, engines: Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [k, v.name])), downloadsDir: downloadsDir() }))
  handle('setSettings', (w, e, patch) => { setSettings(patch || {}); return settings })
  handle('resetSettings', () => { setSettings(Object.assign({}, DEFAULT_SETTINGS)); return settings })
  handle('history', (w, e, q) => {
    const ql = (q || '').toLowerCase()
    const out = []
    for (let i = history.length - 1; i >= 0 && out.length < 600; i--) { const h = history[i]; if (!ql || (h.url + ' ' + h.title).toLowerCase().includes(ql)) out.push(h) }
    return out
  })
  handle('deleteHistory', (w, e, ids) => {
    if (ids === 'all') history = []
    else { const s = new Set(ids); history = history.filter(h => !s.has(h.id)) }
    store.save('history', history); return true
  })
  handle('bookmarks', () => bookmarks)
  handle('saveBookmark', (w, e, b) => {
    const i = bookmarks.findIndex(x => x.id === b.id)
    if (i >= 0) bookmarks[i] = Object.assign(bookmarks[i], { title: b.title, url: b.url })
    else bookmarks.push({ id: Date.now(), title: b.title || b.url, url: b.url, favicon: '' })
    store.save('bookmarks', bookmarks); broadcastState(); return bookmarks
  })
  handle('removeBookmark', (w, e, id) => { bookmarks = bookmarks.filter(b => b.id !== id); store.save('bookmarks', bookmarks); broadcastState(); return bookmarks })
  handle('moveBookmark', (w, e, id, dir) => {
    const i = bookmarks.findIndex(b => b.id === id); const j = i + dir
    if (i >= 0 && j >= 0 && j < bookmarks.length) { [bookmarks[i], bookmarks[j]] = [bookmarks[j], bookmarks[i]]; store.save('bookmarks', bookmarks); broadcastState() }
    return bookmarks
  })
  handle('importChrome', () => importChromeBookmarks())
  handle('downloads', () => downloadsList.slice(-200).reverse())
  handle('downloadAction', (w, e, id, a) => downloadAction(id, a))
  handle('clearDownloads', () => { downloadsList = downloadsList.filter(d => liveItems.has(d.id)); store.save('downloads', downloadsList); pushDownloads(true); return true })
  handle('extensions', () => listExtensions())
  handle('removeExtension', async (w, e, id) => { await removeExtension(id); return listExtensions() })
  handle('loadUnpacked', async (w) => {
    const r = await dialog.showOpenDialog(w?.win, { title: 'اختر مجلد الإضافة (يحتوي manifest.json)', properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    try {
      try { const m = JSON.parse(fs.readFileSync(path.join(r.filePaths[0], 'manifest.json'), 'utf8')); if (isIbdmExtension({ name: m.name })) return { ok: false, error: 'إضافة IBDM Pro مدمجة مسبقاً وتتحدث تلقائياً — لا حاجة لتحميلها' } } catch {}
      const x = await ses.extensions.loadExtension(r.filePaths[0])
      if (!unpackedList.includes(x.path)) { unpackedList.push(x.path); store.save('unpacked', unpackedList) }
      return { ok: true, name: x.name }
    } catch (err) { return { ok: false, error: err.message } }
  })
  handle('openExtensionOptions', (w, e, id) => {
    const x = ses.extensions.getExtension(id); if (!x) return
    const opt = x.manifest.options_page || x.manifest.options_ui?.page
    if (opt) w?.newTab(`chrome-extension://${id}/${opt}`)
  })
  handle('updateExtensions', async () => { try { await require('electron-chrome-web-store').updateExtensions(ses); return true } catch { return false } })
  handle('chooseDownloadsDir', async (w) => {
    const r = await dialog.showOpenDialog(w?.win, { properties: ['openDirectory', 'createDirectory'], defaultPath: downloadsDir() })
    if (!r.canceled && r.filePaths[0]) setSettings({ downloadsDir: r.filePaths[0] })
    return downloadsDir()
  })
  handle('clearData', async (w, e, o = {}) => {
    if (o.history) { history = []; store.save('history', history) }
    if (o.downloads) { downloadsList = downloadsList.filter(d => liveItems.has(d.id)); store.save('downloads', downloadsList); pushDownloads(true) }
    if (o.cache) await ses.clearCache()
    if (o.cookies) await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'shadercache', 'filesystem'] })
    if (o.permissions) { for (const k of Object.keys(sitePerms)) delete sitePerms[k]; store.save('permissions', sitePerms) }
    return true
  })
  handle('setDefaultBrowser', () => {
    if (process.platform === 'win32') shell.openExternal('ms-settings:defaultapps?registeredAppUser=IBRA%20CROM')
    else { app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https') }
    return true
  })
  handle('topSites', () => {
    const count = new Map()
    for (let i = history.length - 1; i >= Math.max(0, history.length - 4000); i--) {
      const h = history[i]
      let host; try { host = new URL(h.url).origin } catch { continue }
      if (!/^https?:/.test(host)) continue
      const c = count.get(host) || { url: host + '/', title: h.title, n: 0 }
      c.n++; count.set(host, c)
    }
    const top = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8)
    return { bookmarks: bookmarks.slice(0, 10), top }
  })
  handle('ibdmShow', async () => { const ok = await ibdmReq('POST', '/show', {}); return !!ok })
  handle('ibdmCheck', async () => { const c = await ibdmPing(); return c ? { version: c.version } : null })
  handle('features', () => ({
    proxy: proxy.info(), adblock: adblock.info(), shield: shield.info(),
    ibdm: { version: ibdmExt.version, source: ibdmExt.source, app: IBDM.cfg ? IBDM.cfg.version : null },
  }))
  handle('setFeature', (w, e, key, val) => { if (['adblockEnabled', 'shieldEnabled', 'proxyEnabled', 'shieldScanDownloads'].includes(key)) setSettings({ [key]: !!val }); return true })
  handle('adblockRefresh', () => adblock.refresh())
  handle('adblockAllowRemove', (w, e, host) => { adblock.setSiteAllowed(host, false); return adblock.info() })
  handle('shieldRefresh', () => shield.refresh(true))
  handle('shieldProceed', (w, e, url) => { if (/^https?:/i.test(url)) { shield.allow(url); e.sender.loadURL(url) } })
  handle('setProxySettings', (w, e, p) => {
    const patch = {}
    if (p.mode) patch.proxyMode = p.mode === 'custom' ? 'custom' : 'tor'
    if (p.transport) patch.torTransport = p.transport
    if (typeof p.bridges === 'string') patch.torBridges = p.bridges
    if (p.custom) {
      const old = settings.proxyCustom || {}
      const c = { scheme: ['http', 'https', 'socks5', 'socks4'].includes(p.custom.scheme) ? p.custom.scheme : 'socks5', host: String(p.custom.host || '').trim(), port: String(p.custom.port || '').trim(), user: String(p.custom.user || ''), pass: old.pass || '' }
      if (typeof p.custom.pass === 'string' && p.custom.pass !== '') c.pass = proxy.encPass(p.custom.pass)
      if (p.custom.clearPass) c.pass = ''
      patch.proxyCustom = c
    }
    setSettings(patch)
    return proxy.info()
  })
  handle('proxyRetry', () => proxy.restart())
  handle('proxyCancelTab', (w, e) => { const t = w?.byWc(e.sender); if (t) w.setTabProxy(t.id, false) })
  handle('updateInfo', () => updater.info())
  handle('updateCheck', () => { updater.check(); return true })
  handle('updateDownload', () => { updater.download(); return true })
  handle('updateInstall', () => { updater.install(); return true })
  handle('navigate', (w, e, url) => { e.sender.loadURL(toLoadable(url)).catch(() => {}) })
  handle('openTab', (w, e, url, bg) => w?.newTab(url, !bg, { afterActive: true }))
  handle('openStore', (w) => w?.newTab('https://chromewebstore.google.com/'))
  handle('appInfo', () => ({ version: app.getVersion(), chrome: process.versions.chrome, electron: process.versions.electron, v8: process.versions.v8, ua: chromeUA, userData: app.getPath('userData') }))
  handle('openPath', (w, e, which) => { if (which === 'userData') shell.openPath(app.getPath('userData')); if (which === 'downloads') shell.openPath(downloadsDir()) })
}

function menuAction(w, a) {
  if (!w) return
  const t = w.active()
  const map = {
    newTab: () => { w.newTab('ibra://newtab'); focusAddress(w) },
    newWindow: () => new IbraWindow(),
    proxyTab: () => { if (settings.proxyEnabled !== false) { w.newTab('ibra://newtab', true, { proxied: true }); focusAddress(w) } },
    history: () => w.newTab('ibra://history'),
    downloads: () => w.newTab('ibra://downloads'),
    bookmarks: () => w.newTab('ibra://bookmarks'),
    extensions: () => w.newTab('ibra://extensions'),
    store: () => w.newTab('https://chromewebstore.google.com/'),
    settings: () => w.newTab('ibra://settings'),
    about: () => w.newTab('ibra://about'),
    checkUpdate: () => { updater.check(); w.ui.webContents.send('update:open') },
    print: () => t?.wc.print(),
    find: () => w.ui.webContents.send('find:open'),
    savePage: () => t && savePage(w, t.wc),
    devtools: () => t?.wc.toggleDevTools(),
    fullscreen: () => w.win.setFullScreen(!w.win.isFullScreen()),
    zoomIn: () => zoom(w, 1), zoomOut: () => zoom(w, -1), zoomReset: () => zoom(w, 0),
    bookmarksBar: () => setSettings({ showBookmarksBar: !settings.showBookmarksBar }),
    theme_glass: () => setSettings({ theme: 'glass' }),
    theme_light: () => setSettings({ theme: 'light' }),
    theme_dark: () => setSettings({ theme: 'dark' }),
    reopen: () => reopenClosed(w),
    taskManager: () => showTaskManager(w),
    quit: () => { saveSession(); app.quit() },
  }
  map[a]?.()
}

function showTaskManager(w) {
  const m = app.getAppMetrics()
  const lines = m.map(p => `${p.type.padEnd(10)}  PID ${p.pid}  CPU ${p.cpu.percentCPUUsage.toFixed(1)}%  RAM ${(p.memory.workingSetSize / 1024).toFixed(0)} MB`)
  const total = m.reduce((s, p) => s + p.memory.workingSetSize, 0) / 1024
  dialog.showMessageBox(w.win, { title: 'مدير المهام', message: `إجمالي الذاكرة: ${total.toFixed(0)} MB — العمليات: ${m.length}`, detail: lines.join('\n') })
}

// ═════════════════ فتح روابط من سطر الأوامر ═════════════════
function urlsFromArgv(argv) {
  const out = []
  for (const a of argv.slice(app.isPackaged ? 1 : 2)) {
    if (!a || a.startsWith('-')) continue
    if (/^(https?|file|ibra):/i.test(a)) out.push(a)
    else if (/\.(html?|pdf|svg|xhtml|mht|png|jpe?g|gif|webp|txt)$/i.test(a) && fs.existsSync(a)) out.push(pathToFileURL(path.resolve(a)).href)
  }
  return out
}

app.on('second-instance', (e, argv) => {
  const urls = urlsFromArgv(argv)
  const w = focusedWin()
  if (!w) return new IbraWindow({ urls })
  if (urls.length) urls.forEach(u => w.newTab(u))
  if (w.win.isMinimized()) w.win.restore()
  w.win.focus()
})

app.on('web-contents-created', (e, wc) => {
  // نوافذ منبثقة للإضافات/تسجيل الدخول
  wc.on('will-attach-webview', (ev) => ev.preventDefault())
})

// ═════════════════ الإضافات المدمجة: البروكسي + حاجب الإعلانات + فاحص الفيروسات ═════════════════
function setupFeatures() {
  const ctx = {
    store, userData: app.getPath('userData'), vendorDir: VENDOR_DIR,
    settings: () => settings, setSettings, changed: featuresChanged,
  }
  updater = createUpdater({
    changed: featuresChanged,
    beforeInstall: () => { saveSession(); proxy?.shutdown(); store.flush() },
    notify: (version, ready) => {
      const msg = ready ? `التحديث ${version} جاهز — أعد تشغيل IBRA CROM لتثبيته` : `يتوفر إصدار جديد من IBRA CROM: ${version}`
      for (const w of windows) w.ui.webContents.send('toast', msg)
      if (Notification.isSupported()) {
        const n = new Notification({ title: 'IBRA CROM', body: msg + (ready ? '' : '\nاضغط زر «تحديث» في شريط الأدوات'), icon: path.join(__dirname, 'assets', 'logo.png') })
        n.on('click', () => { const w = focusedWin(); if (w) { if (w.win.isMinimized()) w.win.restore(); w.win.focus(); w.ui.webContents.send('update:open') } })
        n.show()
      }
    },
  })
  updater.init()
  proxy = createProxy(ctx)
  adblock = createAdblock(ctx)
  shield = createShield(ctx)
  proxy.session.setUserAgent(chromeUA)
  adblock.init()
  shield.init()
  for (const s of [ses, proxy.session]) { if (!process.env.IBRA_NO_NETPIPE) attachNetPipeline(s); adblock.attach(s) }
  // أول تشغيل للسان بروكسي: الجلسة مغلقة حتى يجهز البروكسي (لا تسريب)
  proxy.session.setProxy({ proxyRules: 'socks5://127.0.0.1:1', proxyBypassRules: '<local>' })
}

// Electron يسمح بمستمع واحد لكل حدث، لذلك نمرر كل طلب على الفاحص ثم حاجب الإعلانات
function attachNetPipeline(s) {
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    try {
      if (d.resourceType === 'mainFrame' || d.resourceType === 'subFrame') {
        const kind = shield.check(d.url)
        if (kind) {
          shield.blocked()
          if (d.resourceType === 'mainFrame' && d.webContentsId) shieldPending.set(d.webContentsId, { url: d.url, kind })
          return cb({ cancel: true })
        }
      }
      cb(adblock.onBeforeRequest(d) || {})
    } catch (e) { cb({}) }
  })
  s.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (d, cb) => {
    try { sniffMedia(d) } catch {}
    try { cb(adblock.onHeadersReceived(d) || {}) } catch { cb({}) }
  })
}

// ── التقاط الفيديوهات في الصفحة لـ IBDM Pro (نفس قواعد إضافة IBDM) ──
const tabMedia = new Map() // webContentsId -> Map(url -> { url, size, type })
const MEDIA_EXT = /\.(mp4|webm|mkv|mov|m4v|flv|3gp|mp3|m4a|aac|ogg|opus|wav|flac|m3u8|mpd)(\?|$)/i
const MEDIA_SEGMENT = /\.(ts|m4s|aac\.part)(\?|$)|[?&](range|bytestart)=|\/seg-?\d+|segment\d|frag\d|chunk-?\d/i
function sniffMedia(d) {
  if (!d.webContentsId || d.statusCode >= 400 || !/^https?:/i.test(d.url) || MEDIA_SEGMENT.test(d.url)) return
  const h = {}
  for (const [k, v] of Object.entries(d.responseHeaders || {})) h[k.toLowerCase()] = [].concat(v)[0]
  const type = (h['content-type'] || '').toLowerCase()
  const playlist = /mpegurl|dash\+xml/.test(type) || /\.(m3u8|mpd)(\?|$)/i.test(d.url)
  if (!(type.startsWith('video/') || type.startsWith('audio/') || playlist || (d.resourceType === 'media' && MEDIA_EXT.test(d.url)))) return
  let size = parseInt(h['content-length'] || '-1', 10)
  const range = /\/(\d+)$/.exec(h['content-range'] || ''); if (range) size = parseInt(range[1], 10)
  if (!playlist && size > 0 && size < 300 * 1024) return
  if (!tabMedia.has(d.webContentsId)) tabMedia.set(d.webContentsId, new Map())
  const m = tabMedia.get(d.webContentsId)
  if (!m.has(d.url) && m.size < 50) m.set(d.url, { url: d.url, size, type: playlist ? 'stream' : type.startsWith('audio/') ? 'audio' : 'video' })
}

app.on('login', (e, wc, details, authInfo, cb) => {
  const c = proxy?.login(authInfo)
  if (c) { e.preventDefault(); cb(c.user, c.pass) }
})

app.whenReady().then(async () => {
  ses = session.fromPartition('persist:ibracrom')
  ses.setUserAgent(chromeUA)
  setupFeatures()
  setupPermissions()
  setupDownloads()
  setupIpc()
  await setupExtensions()
  Menu.setApplicationMenu(null)

  const argvUrls = urlsFromArgv(process.argv)
  const sessionData = store.load('session', [])
  if (settings.startup === 'restore' && sessionData.length && sessionData.some(s => s.length)) {
    sessionData.forEach((urls, i) => { if (urls.length) new IbraWindow({ urls: i === 0 ? urls.concat(argvUrls) : urls }) })
  } else if (settings.startup === 'home') new IbraWindow({ urls: argvUrls.length ? argvUrls : [homeUrl()] })
  else new IbraWindow({ urls: argvUrls.length ? argvUrls : ['ibra://newtab'] })

  if (process.env.IBRA_TEST_SHOT) module.exports.tabMedia = tabMedia
  if (process.env.IBRA_TEST_SHOT) require(process.env.IBRA_TEST_FILE || './test-shot')(windows, { setSettings, menuAction })
})

app.on('before-quit', () => { saveSession(); proxy?.shutdown(); store.flush() })
app.on('window-all-closed', () => { store.flush(); if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (!windows.size) new IbraWindow() })
