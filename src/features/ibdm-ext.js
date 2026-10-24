// إضافة IBDM Pro المدمجة — اختيار النسخة وتحديثها تلقائياً
// برمجة و تطوير ابراهيم الخزرجي
//   1) إذا كان برنامج IBDM Pro مثبتاً: نأخذ الإضافة من مجلده (نفس نسخة البرنامج بالضبط)
//   2) وإلا: أحدث نسخة من https://github.com/ibrata2/ibdm-pro/releases (أو النسخة المدمجة إن كانت أحدث)
// ونسخة واحدة فقط تعمل في أي وقت — لا يتكرر الزر العائم في الصفحات.
const fs = require('fs')
const path = require('path')

const RELEASES_API = 'https://api.github.com/repos/ibrata2/ibdm-pro/releases/latest'
const ASSET_NAME = 'IBDM-Pro-Extension.zip'

function versionOf(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version || '0' } catch { return null }
}
function newer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}
const isPatched = (dir) => { try { return fs.readFileSync(path.join(dir, 'background.js'), 'utf8').includes('IBRA CROM') } catch { return false } }

// التعديلات اللازمة لتعمل الإضافة داخل IBRA CROM (المتصفح يسلّم التحميلات لـ IBDM بنفسه)
function patchIbdm(dir) {
  const bgF = path.join(dir, 'background.js')
  let bg = fs.readFileSync(bgF, 'utf8')
  if (!bg.includes('IBRA CROM')) {
    const a = 'if (api.downloads.onDeterminingFilename) {'
    if (!bg.includes(a)) return false
    bg = bg.replace(a, 'if (!api.downloads) {\n  // IBRA CROM: the browser hands downloads to IBDM Pro by itself (built-in integration), nothing to do here.\n} else ' + a)
    bg = bg.replace(/async function selfUpdate\(appVersion\) \{\n/, '$&  if (!api.downloads) return; // IBRA CROM keeps this extension up to date by itself\n')
    fs.writeFileSync(bgF, bg)
  }
  const popF = path.join(dir, 'popup.js')
  try {
    let pop = fs.readFileSync(popF, 'utf8')
    if (!pop.includes('&& chrome.downloads')) {
      pop = pop.replace('(st.app.version !== st.version ? ', '(st.app.version !== st.version && chrome.downloads ? ')
      fs.writeFileSync(popF, pop)
    }
  } catch {}
  return true
}

function installedDirs() {
  if (process.env.IBRA_IBDM_DIR) return [process.env.IBRA_IBDM_DIR]
  if (process.platform !== 'win32') return []
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean)
  return [...new Set(bases)].map(b => path.join(b, 'IBDM Pro', 'extension'))
}
function installedApp() {
  for (const d of installedDirs()) { const v = versionOf(d); if (v) return { dir: d, version: v } }
  return null
}

function copyPatched(src, dest) {
  if (versionOf(dest) === versionOf(src) && isPatched(dest)) return true
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
  if (!patchIbdm(dest)) { fs.rmSync(dest, { recursive: true, force: true }); return false }
  return true
}

// يرجع { dir, version, source: 'installed' | 'github' | 'builtin' }
function resolveIbdm(builtinDir, userData) {
  const root = path.join(userData, 'ibdm-extension')
  let best = null
  const app = installedApp()
  if (app) {
    const dest = path.join(root, 'app-' + app.version)
    try { if (copyPatched(app.dir, dest)) best = { dir: dest, version: app.version, source: 'installed' } } catch (e) { console.error('IBDM copy failed', e.message) }
  }
  if (!best) {
    best = { dir: builtinDir, version: versionOf(builtinDir) || '0', source: 'builtin' }
    try {
      for (const d of fs.readdirSync(root)) {
        if (!d.startsWith('gh-')) continue
        const full = path.join(root, d), v = versionOf(full)
        if (v && isPatched(full) && newer(v, best.version)) best = { dir: full, version: v, source: 'github' }
      }
    } catch {}
  }
  // تنظيف النسخ القديمة
  try { for (const d of fs.readdirSync(root)) if (path.join(root, d) !== best.dir) fs.rmSync(path.join(root, d), { recursive: true, force: true }) } catch {}
  return best
}

// يفحص صفحة الإصدارات ويحمّل الإضافة إن كانت أحدث. يرجع true إذا تم تحميل نسخة جديدة.
async function checkGithub(userData, currentVersion, fetchImpl) {
  if (installedApp()) return false // البرنامج المثبت هو المرجع، وهو يحدّث نفسه
  const r = await fetchImpl(process.env.IBRA_IBDM_RELEASES || RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
  if (!r.ok) throw new Error('GitHub HTTP ' + r.status)
  const rel = await r.json()
  const v = String(rel.tag_name || '').replace(/^v/i, '')
  const asset = (rel.assets || []).find(a => a.name === ASSET_NAME)
  if (!v || !asset || !newer(v, currentVersion)) return false
  const zr = await fetchImpl(asset.browser_download_url, { cache: 'no-store' })
  if (!zr.ok) throw new Error('download HTTP ' + zr.status)
  const buf = Buffer.from(await zr.arrayBuffer())
  const AdmZip = require('adm-zip')
  const root = path.join(userData, 'ibdm-extension')
  const tmp = path.join(root, 'tmp-' + v)
  fs.rmSync(tmp, { recursive: true, force: true })
  new AdmZip(buf).extractAllTo(tmp, true)
  // قد يكون المحتوى داخل مجلد فرعي
  let src = tmp
  if (!fs.existsSync(path.join(src, 'manifest.json'))) {
    const sub = fs.readdirSync(tmp).map(d => path.join(tmp, d)).find(d => fs.existsSync(path.join(d, 'manifest.json')))
    if (!sub) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error('manifest.json not found in zip') }
    src = sub
  }
  const ok = copyPatched(src, path.join(root, 'gh-' + (versionOf(src) || v)))
  fs.rmSync(tmp, { recursive: true, force: true })
  return ok
}

const isIbdmExtension = (x) => /^IBDM\b/i.test(x?.name || x?.manifest?.name || '')

module.exports = { resolveIbdm, checkGithub, patchIbdm, versionOf, newer, isIbdmExtension, installedApp }
