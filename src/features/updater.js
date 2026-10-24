// التحديث التلقائي لـ IBRA CROM من https://github.com/ibrata2/IBRACROM/releases
// برمجة و تطوير ابراهيم الخزرجي
const { app } = require('electron')

module.exports = function createUpdater(ctx) {
  const st = { status: 'idle', version: '', notes: '', progress: 0, speed: 0, error: '', checkedAt: 0, current: app.getVersion() }
  let au = null
  const supported = app.isPackaged && process.platform === 'win32'
  const set = (p) => { Object.assign(st, p); ctx.changed() }
  const strip = (h) => String(Array.isArray(h) ? h.map(x => x.note || '').join('\n') : (h || ''))
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<li>/gi, '• ').replace(/<[^>]+>/g, '').split('\n').filter(l => !/^\s*(co-authored-by|claude-session|signed-off-by):/i.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim()

  function init() {
    if (process.env.IBRA_TEST_UPDATE) { // معاينة الواجهة فقط
      setTimeout(() => { set({ status: 'available', version: '1.3.0', notes: 'ما الجديد:\n• إشعار داخل التطبيق عند توفر إصدار جديد\n• تحسينات في البروكسي وحاجب الإعلانات' }); ctx.notify('1.3.0') }, 3000)
      return
    }
    if (!supported) return
    try { au = require('electron-updater').autoUpdater } catch (e) { console.error('updater', e.message); return }
    au.autoDownload = false
    au.autoInstallOnAppQuit = true
    au.allowPrerelease = false
    au.on('checking-for-update', () => set({ status: 'checking', error: '' }))
    au.on('update-not-available', () => set({ status: 'latest', checkedAt: Date.now() }))
    au.on('update-available', (i) => {
      const fresh = st.version !== i.version
      set({ status: 'available', version: i.version, notes: strip(i.releaseNotes), checkedAt: Date.now() })
      if (fresh) ctx.notify(i.version)
    })
    au.on('download-progress', (p) => set({ status: 'downloading', progress: Math.round(p.percent || 0), speed: p.bytesPerSecond || 0 }))
    au.on('update-downloaded', (i) => { set({ status: 'ready', progress: 100, version: i.version }); ctx.notify(i.version, true) })
    au.on('error', (e) => set({ status: st.status === 'downloading' ? 'available' : 'error', error: String(e?.message || e).split('\n')[0].slice(0, 160) }))
    setTimeout(check, 12000)
    setInterval(check, 6 * 3600e3)
  }
  function check() { if (au && !['downloading', 'ready'].includes(st.status)) au.checkForUpdates().catch(() => {}) }
  function download() { if (au && st.status === 'available') { set({ status: 'downloading', progress: 0 }); au.downloadUpdate().catch(() => {}) } }
  function install() { if (au && st.status === 'ready') { ctx.beforeInstall(); setImmediate(() => au.quitAndInstall(true, true)) } }

  return { init, check, download, install, info: () => ({ ...st, supported: supported || !!process.env.IBRA_TEST_UPDATE }) }
}
