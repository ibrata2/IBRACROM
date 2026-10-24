// IBRA AdBlock — حاجب الإعلانات المدمج في IBRA CROM
// برمجة و تطوير ابراهيم الخزرجي
// يعتمد على محرك Ghostery (نفس قوائم uBlock Origin و EasyList + القائمة العربية)
const fs = require('fs')
const path = require('path')
const { ipcMain, webContents, net } = require('electron')
const { ElectronBlocker, fromElectronDetails, fullLists } = require('@ghostery/adblocker-electron')

const PRELOAD_PATH = require.resolve('@ghostery/adblocker-electron-preload')
const LISTS = [...fullLists, 'https://raw.githubusercontent.com/easylist/listear/master/Liste_AR.txt']
const REFRESH_MS = 24 * 3600e3

function hostOf(u) { try { return new URL(u).hostname.toLowerCase() } catch { return '' } }

module.exports = function createAdblock(ctx) {
  let engine = null
  let updatedAt = 0
  let refreshing = null
  let filtersCount = 0
  function countFilters() { try { const f = engine.getFilters(); filtersCount = f.networkFilters.length + f.cosmeticFilters.length } catch { filtersCount = 0 } }
  const tabCounts = new Map() // webContentsId -> عدد الإعلانات المحجوبة في الصفحة الحالية
  const stats = ctx.store.load('adblockStats', { total: 0 })
  const cacheFile = path.join(ctx.userData, 'adblock', 'engine.bin')
  const seedFile = path.join(ctx.vendorDir, 'adblock', 'engine.bin')

  const enabled = () => ctx.settings().adblockEnabled !== false
  const allowList = () => ctx.settings().adblockAllow || []
  function siteAllowed(host) {
    host = (host || '').replace(/^www\./, '')
    return !!host && allowList().some(d => host === d || host.endsWith('.' + d))
  }

  function loadFrom(file) {
    try {
      const buf = fs.readFileSync(file)
      engine = ElectronBlocker.deserialize(new Uint8Array(buf))
      updatedAt = fs.statSync(file).mtimeMs
      countFilters()
      return true
    } catch { return false }
  }

  async function refresh() {
    if (refreshing) return refreshing
    refreshing = (async () => {
      try {
        const fresh = await ElectronBlocker.fromLists((u) => net.fetch(u, { cache: 'no-store' }), LISTS, {
          enableCompression: true, loadCosmeticFilters: true, loadNetworkFilters: true,
        })
        engine = fresh
        updatedAt = Date.now()
        countFilters()
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
        fs.writeFileSync(cacheFile + '.tmp', Buffer.from(fresh.serialize()))
        fs.renameSync(cacheFile + '.tmp', cacheFile)
        ctx.changed()
        return true
      } catch (e) {
        console.error('adblock refresh failed', e.message)
        return false
      } finally { refreshing = null }
    })()
    return refreshing
  }

  function init() {
    if (!loadFrom(cacheFile)) loadFrom(seedFile)
    if (!engine || Date.now() - updatedAt > REFRESH_MS) setTimeout(refresh, engine ? 20000 : 1500)
    setInterval(() => { if (Date.now() - updatedAt > REFRESH_MS) refresh() }, 3600e3)

    // الإخفاء التجميلي (عناصر الإعلانات داخل الصفحة)
    ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => {
      if (!engine || !enabled() || siteAllowed(hostOf(url)) || !/^https?:/i.test(url || '')) return
      return engine.onInjectCosmeticFilters(event, url, msg)
    })
    ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', () => !!engine && enabled() && engine.config.enableMutationObserver)
  }

  function attach(ses) {
    try { ses.registerPreloadScript({ type: 'frame', filePath: PRELOAD_PATH }) } catch (e) { console.error('adblock preload', e.message) }
  }

  let notifyT = null
  function count(wcId) {
    tabCounts.set(wcId, (tabCounts.get(wcId) || 0) + 1)
    stats.total++
    ctx.store.save('adblockStats', stats, 4000)
    if (!notifyT) notifyT = setTimeout(() => { notifyT = null; ctx.changed() }, 400)
  }

  // يُستدعى من خط معالجة الطلبات المشترك
  function onBeforeRequest(details) {
    if (!engine || !enabled() || details.resourceType === 'mainFrame') return null
    if (!/^(https?|wss?):/i.test(details.url)) return null
    const wc = details.webContentsId ? webContents.fromId(details.webContentsId) : null
    const pageUrl = wc && !wc.isDestroyed() ? wc.getURL() : (details.referrer || '')
    if (!/^https?:/i.test(pageUrl)) return null // صفحات IBRA والإضافات لا تُحجب
    if (siteAllowed(hostOf(pageUrl))) return null
    const req = fromElectronDetails(details)
    if (engine.config.guessRequestTypeFromUrl === true && req.type === 'other') req.guessTypeOfRequest()
    const { redirect, match } = engine.match(req)
    if (redirect) { count(details.webContentsId); return { redirectURL: redirect.dataUrl } }
    if (match) { count(details.webContentsId); return { cancel: true } }
    return null
  }

  function onHeadersReceived(details) {
    if (!engine || !enabled()) return null
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') return null
    if (siteAllowed(hostOf(details.url))) return null
    const raw = engine.getCSPDirectives(fromElectronDetails(details))
    if (raw === undefined) return null
    const headers = details.responseHeaders || {}
    const policies = raw.split(';').map(s => s.trim())
    for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === 'content-security-policy') { policies.push(...v); delete headers[k] }
    headers['content-security-policy'] = [policies.join(';')]
    return { responseHeaders: headers }
  }

  function setSiteAllowed(host, allowed) {
    host = (host || '').replace(/^www\./, '')
    if (!host) return
    const list = allowList().filter(d => d !== host)
    if (allowed) list.push(host)
    ctx.setSettings({ adblockAllow: list })
  }

  return {
    init, attach, refresh, onBeforeRequest, onHeadersReceived, siteAllowed, setSiteAllowed,
    resetTab: (id) => { if (tabCounts.delete(id)) ctx.changed() },
    tabCount: (id) => tabCounts.get(id) || 0,
    info: () => ({
      enabled: enabled(), ready: !!engine, updatedAt, refreshing: !!refreshing, total: stats.total,
      filters: filtersCount, allow: allowList(),
    }),
  }
}
