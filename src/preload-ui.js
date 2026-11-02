// IBRA CROM — واجهة شريط المتصفح
const { contextBridge, ipcRenderer } = require('electron')
const { injectBrowserAction } = require('electron-chrome-extensions/browser-action')

// أزرار الإضافات <browser-action-list>
injectBrowserAction()

const SEND = new Set(['ui:height', 'ui:overlay', 'ui:ready', 'tab:new', 'tab:close', 'tab:activate', 'tab:move', 'tab:mute', 'tab:menu',
  'nav:go', 'nav:back', 'nav:forward', 'nav:reload', 'nav:stop', 'nav:home', 'nav:zoom', 'bookmark:toggle', 'bookmark:open', 'bookmark:remove',
  'find:query', 'find:stop', 'menu:action', 'dl:action', 'window:menu-system', 'tab:reopen', 'tab:reopen-all', 'ibdm:show',
  'proxy:toggle', 'proxy:newtab', 'proxy:retry', 'adblock:site', 'feature:set', 'update:check', 'update:download', 'update:install', 'media:act', 'media:focus', 'pw:save', 'pw:never', 'pw:dismiss', 'pw:shown',
  'feature:lang', 'group:toggle', 'group:set', 'group:ungroup', 'group:close', 'group:newtab', 'ai:toggle', 'ai:provider', 'ai:reload', 'ai:tab', 'ai:width', 'ai:share',
  'bm:open', 'bm:openAll', 'qr:save', 'qr:copy'])
const INVOKE = new Set(['suggest', 'dl:list', 'media:list', 'bm:children', 'qr:make'])
const ON = new Set(['state', 'focus-address', 'find:open', 'find:result', 'downloads', 'downloads:started', 'toast', 'update:open', 'menu:open', 'group:edit', 'qr:open'])

contextBridge.exposeInMainWorld('ibraUI', {
  lang: ipcRenderer.sendSync('ui:lang'),
  send: (ch, ...a) => { if (SEND.has(ch)) ipcRenderer.send(ch, ...a) },
  invoke: (ch, ...a) => INVOKE.has(ch) ? ipcRenderer.invoke(ch, ...a) : Promise.reject(new Error('blocked')),
  on: (ch, cb) => { if (ON.has(ch)) ipcRenderer.on(ch, (e, ...a) => cb(...a)) },
})
