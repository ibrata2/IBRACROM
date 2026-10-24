// خيط منفصل يبني قاعدة بيانات IBRA Shield
const fs = require('fs')
const zlib = require('zlib')
const { parentPort, workerData } = require('worker_threads')
const { parseList } = require('./shield-parse')
const byKind = {}, meta = {}
for (const s of workerData) {
  let text = null, mtime = 0
  for (const f of s.files) { try { text = zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'); mtime = fs.statSync(f).mtimeMs; break } catch {} }
  if (!text) { meta[s.id] = { count: 0, updatedAt: 0 }; continue }
  const keys = parseList(text)
  meta[s.id] = { count: keys.length, updatedAt: mtime }
  ;(byKind[s.kind] ||= []).push(keys)
}
const sets = {}
for (const [k, parts] of Object.entries(byKind)) {
  const arr = new Float64Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0
  for (const p of parts) for (const v of p) arr[i++] = v
  arr.sort(); sets[k] = arr.buffer
}
parentPort.postMessage({ sets, meta }, Object.values(sets))
