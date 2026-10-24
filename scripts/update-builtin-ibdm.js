// يحدّث نسخة IBDM المدمجة من أحدث إصدار على https://github.com/ibrata2/ibdm-pro/releases
// برمجة و تطوير ابراهيم الخزرجي
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const { patchIbdm, versionOf } = require('../src/features/ibdm-ext')
try { if (process.env.HTTPS_PROXY || process.env.https_proxy) { const { setGlobalDispatcher, EnvHttpProxyAgent } = require('undici'); setGlobalDispatcher(new EnvHttpProxyAgent()) } } catch {}

;(async () => {
  const dest = path.join(__dirname, '..', 'src', 'builtin', 'ibdm')
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ibra-crom-build' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN
  const rel = await (await fetch('https://api.github.com/repos/ibrata2/ibdm-pro/releases/latest', { headers })).json()
  const asset = (rel.assets || []).find(a => a.name === 'IBDM-Pro-Extension.zip')
  if (!asset) throw new Error('no extension asset in ' + rel.tag_name)
  const buf = Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer())
  const tmp = dest + '.new'
  fs.rmSync(tmp, { recursive: true, force: true })
  new AdmZip(buf).extractAllTo(tmp, true)
  if (!patchIbdm(tmp)) throw new Error('patch failed — IBDM extension changed its structure')
  fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(tmp, dest)
  console.log('✓ built-in IBDM extension', versionOf(dest), 'from', rel.tag_name)
})().catch(e => { console.error('✗ IBDM update skipped:', e.message); process.exit(0) })
