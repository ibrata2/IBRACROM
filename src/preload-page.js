// IBRA CROM — جسر الصفحات الداخلية (ibra://...)
// يعمل فقط داخل صفحات البرنامج نفسه، ولا يظهر لأي موقع خارجي
const { contextBridge, ipcRenderer } = require('electron')

if (location.protocol === 'file:' && /\/pages\/internal\.html$/.test(decodeURIComponent(location.pathname))) {
  const call = (n) => (...a) => ipcRenderer.invoke('page:' + n, ...a)
  const names = ['getSettings', 'setSettings', 'resetSettings', 'history', 'deleteHistory', 'bookmarks', 'saveBookmark', 'removeBookmark',
    'moveBookmark', 'importChrome', 'downloads', 'downloadAction', 'clearDownloads', 'extensions', 'removeExtension', 'loadUnpacked',
    'openExtensionOptions', 'updateExtensions', 'chooseDownloadsDir', 'clearData', 'setDefaultBrowser', 'topSites', 'navigate', 'openTab',
    'openStore', 'appInfo', 'openPath', 'ibdmShow', 'ibdmCheck']
  const api = {}
  for (const n of names) api[n] = call(n)
  api.onChanged = (cb) => ipcRenderer.on('page:changed', (e, what) => cb(what))
  api.onDownloads = (cb) => ipcRenderer.on('page:downloads', (e, list) => cb(list))
  contextBridge.exposeInMainWorld('ibra', api)
}
