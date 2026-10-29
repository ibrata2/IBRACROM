// IBRA CROM — جسر الصفحات الداخلية (ibra://...)
// يعمل فقط داخل صفحات البرنامج نفسه، ولا يظهر لأي موقع خارجي
const { contextBridge, ipcRenderer, webFrame } = require('electron')

// IBRA Media: نحفظ أزرار التحكم التي يسجّلها الموقع (السابق/التالي...) لنضغطها من لوحة الوسائط
try { webFrame.executeJavaScript("(() => { try {\n  const ms = navigator.mediaSession; if (!ms || ms.__ibra) return\n  const h = {}, orig = ms.setActionHandler.bind(ms)\n  ms.setActionHandler = (a, f) => { h[a] = f; try { return orig(a, f) } catch (e) {} }\n  Object.defineProperty(window, '__ibraMS', { value: h }); Object.defineProperty(ms, '__ibra', { value: 1 })\n} catch (e) {} })()") } catch {}

if (location.protocol === 'file:' && /\/pages\/internal\.html$/.test(decodeURIComponent(location.pathname))) {
  const call = (n) => (...a) => ipcRenderer.invoke('page:' + n, ...a)
  const names = ['getSettings', 'setSettings', 'resetSettings', 'history', 'deleteHistory', 'bookmarks', 'saveBookmark', 'removeBookmark',
    'moveBookmark', 'importChrome', 'downloads', 'downloadAction', 'clearDownloads', 'extensions', 'removeExtension', 'loadUnpacked',
    'openExtensionOptions', 'updateExtensions', 'chooseDownloadsDir', 'clearData', 'setDefaultBrowser', 'topSites', 'navigate', 'openTab',
    'openStore', 'appInfo', 'openPath', 'ibdmShow', 'ibdmCheck',
    'features', 'setFeature', 'adblockRefresh', 'adblockAllowRemove', 'shieldRefresh', 'shieldProceed', 'setProxySettings', 'proxyRetry', 'proxyCancelTab', 'updateInfo', 'updateCheck', 'updateDownload', 'updateInstall']
  const api = {}
  for (const n of names) api[n] = call(n)
  api.onChanged = (cb) => ipcRenderer.on('page:changed', (e, what) => cb(what))
  api.onDownloads = (cb) => ipcRenderer.on('page:downloads', (e, list) => cb(list))
  contextBridge.exposeInMainWorld('ibra', api)
}
