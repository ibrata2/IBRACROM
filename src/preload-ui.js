// IBRA CROM — واجهة شريط المتصفح
const { contextBridge, ipcRenderer } = require('electron')
const { injectBrowserAction } = require('electron-chrome-extensions/browser-action')

// أزرار الإضافات <browser-action-list>
injectBrowserAction()

const SEND = new Set(['ui:height', 'ui:overlay', 'ui:ready', 'tab:new', 'tab:close', 'tab:activate', 'tab:move', 'tab:mute', 'tab:menu',
  'nav:go', 'nav:back', 'nav:forward', 'nav:reload', 'nav:stop', 'nav:home', 'nav:zoom', 'bookmark:toggle', 'bookmark:open', 'bookmark:remove',
  'find:query', 'find:stop', 'menu:action', 'dl:action', 'window:menu-system', 'tab:reopen', 'tab:reopen-all', 'ibdm:show'])
const INVOKE = new Set(['suggest', 'dl:list'])
const ON = new Set(['state', 'focus-address', 'find:open', 'find:result', 'downloads', 'downloads:started', 'toast'])

contextBridge.exposeInMainWorld('ibraUI', {
  send: (ch, ...a) => { if (SEND.has(ch)) ipcRenderer.send(ch, ...a) },
  invoke: (ch, ...a) => INVOKE.has(ch) ? ipcRenderer.invoke(ch, ...a) : Promise.reject(new Error('blocked')),
  on: (ch, cb) => { if (ON.has(ch)) ipcRenderer.on(ch, (e, ...a) => cb(...a)) },
})
