// IBRA Media — التحكم بالوسائط من شريط الأدوات (مثل Chrome)
// برمجة و تطوير ابراهيم الخزرجي
// يعرض كل ما يشتغل من فيديو أو صوت في كل الألسن: صورة الغلاف، العنوان، الموقع،
// تشغيل/إيقاف، السابق/التالي، ±10 ثواني، شريط التقدم، صورة داخل صورة، والترجمة.

// يختار عنصر الوسائط الرئيسي في الإطار: الذي يعمل الآن، وإلا الأطول/الأكبر
const PICK = `(() => {
  const all = [...document.querySelectorAll('video, audio')].filter(m => m.currentSrc || m.src || m.srcObject)
  if (!all.length) return null
  const playing = all.filter(m => !m.paused && !m.ended)
  const pool = playing.length ? playing : all
  const score = (m) => (m.tagName === 'VIDEO' ? (m.clientWidth * m.clientHeight) : 1) + (m.currentTime > 0 ? 1e7 : 0) + (isFinite(m.duration) ? m.duration : 0)
  return pool.sort((a, b) => score(b) - score(a))[0]
})()`

const INFO = `(() => {
  const m = ${PICK}
  if (!m) return null
  const ms = navigator.mediaSession, md = ms && ms.metadata
  const art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : ''
  const h = window.__ibraMS || {}
  const yt = document.querySelector('.ytp-subtitles-button')
  const tracks = m.textTracks ? [...m.textTracks].filter(t => t.kind === 'subtitles' || t.kind === 'captions') : []
  const ccOn = yt ? yt.getAttribute('aria-pressed') === 'true' : tracks.some(t => t.mode === 'showing')
  return {
    title: (md && md.title) || document.title || '', artist: (md && (md.artist || md.album)) || '', art,
    paused: m.paused, t: m.currentTime || 0, d: isFinite(m.duration) ? m.duration : 0, video: m.tagName === 'VIDEO',
    pip: !!document.pictureInPictureElement, pipOk: m.tagName === 'VIDEO' && !!document.pictureInPictureEnabled && !m.disablePictureInPicture,
    prev: !!h.previoustrack || !!document.querySelector('.ytp-prev-button:not([aria-disabled=true])'),
    next: !!h.nexttrack || !!document.querySelector('.ytp-next-button:not([aria-disabled=true])'),
    cc: ccOn, ccOk: !!yt || tracks.length > 0, muted: m.muted,
  }
})()`

const ACT = (action, value) => `(async () => {
  const m = ${PICK}
  if (!m) return false
  const h = window.__ibraMS || {}
  const call = (a, extra) => { if (h[a]) { try { h[a](Object.assign({ action: a }, extra || {})); return true } catch (e) {} } return false }
  switch (${JSON.stringify(action)}) {
    case 'toggle': if (m.paused) { if (!call('play')) await m.play().catch(() => {}) } else { if (!call('pause')) m.pause() } break
    case 'seekby': { const t = Math.max(0, Math.min((m.duration || 1e9), m.currentTime + ${Number(value) || 0}))
      if (!call(${Number(value) < 0 ? "'seekbackward'" : "'seekforward'"}, { seekOffset: Math.abs(${Number(value) || 0}) })) m.currentTime = t; break }
    case 'seekto': if (!call('seekto', { seekTime: ${Number(value) || 0} })) m.currentTime = ${Number(value) || 0}; break
    case 'prev': if (!call('previoustrack')) { const b = document.querySelector('.ytp-prev-button'); if (b) b.click(); else m.currentTime = 0 } break
    case 'next': if (!call('nexttrack')) { const b = document.querySelector('.ytp-next-button'); if (b) b.click(); else if (isFinite(m.duration)) m.currentTime = m.duration } break
    case 'pip': if (document.pictureInPictureElement) await document.exitPictureInPicture(); else if (m.tagName === 'VIDEO') { m.disablePictureInPicture = false; await m.requestPictureInPicture() } break
    case 'cc': { const yt = document.querySelector('.ytp-subtitles-button'); if (yt) { yt.click(); break }
      const tr = m.textTracks ? [...m.textTracks].filter(t => t.kind === 'subtitles' || t.kind === 'captions') : []
      if (tr.length) { const on = tr.some(t => t.mode === 'showing'); tr.forEach((t, i) => { t.mode = on ? 'disabled' : (i === 0 ? 'showing' : 'disabled') }) } break }
  }
  return true
})()`

// يُحقن في كل صفحة قبل سكربتاتها: يحفظ أزرار mediaSession (السابق/التالي...) حتى نستطيع ضغطها من خارج الصفحة
const HOOK = `(() => { try {
  const ms = navigator.mediaSession; if (!ms || ms.__ibra) return
  const h = {}, orig = ms.setActionHandler.bind(ms)
  ms.setActionHandler = (a, f) => { h[a] = f; try { return orig(a, f) } catch (e) {} }
  Object.defineProperty(window, '__ibraMS', { value: h }); Object.defineProperty(ms, '__ibra', { value: 1 })
} catch (e) {} })()`

module.exports = function createMedia() {
  const frameOf = new Map() // webContentsId -> آخر إطار وُجد فيه الوسائط

  async function findIn(wc) {
    if (!wc || wc.isDestroyed()) return null
    const frames = []
    const cached = frameOf.get(wc.id)
    if (cached && !cached.isDestroyed?.()) frames.push(cached)
    try { for (const f of wc.mainFrame.framesInSubtree) if (!frames.includes(f)) frames.push(f) } catch {}
    let best = null
    for (const f of frames.slice(0, 12)) {
      try {
        const info = await Promise.race([f.executeJavaScript(INFO), new Promise(r => setTimeout(() => r(null), 700))])
        if (info && (!best || (best.info.paused && !info.paused))) best = { frame: f, info }
        if (best && !best.info.paused) break
      } catch {}
    }
    if (best) frameOf.set(wc.id, best.frame); else frameOf.delete(wc.id)
    return best
  }

  async function info(wc) { const b = await findIn(wc); return b ? b.info : null }

  async function act(wc, action, value) {
    let f = frameOf.get(wc.id)
    if (!f || f.isDestroyed?.()) f = (await findIn(wc))?.frame
    if (!f) return false
    try { return await f.executeJavaScript(ACT(action, value), true) } catch { return false }
  }

  return { info, act, HOOK, forget: (id) => frameOf.delete(id) }
}
module.exports.HOOK = HOOK
