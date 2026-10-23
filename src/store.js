// IBRA CROM — simple JSON persistence
// برمجة و تطوير ابراهيم الخزرجي
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const dir = () => path.join(app.getPath('userData'), 'ibra-data')
const timers = {}
const cache = {}

function file(name) { return path.join(dir(), name + '.json') }

function load(name, fallback) {
  if (cache[name] !== undefined) return cache[name]
  try {
    cache[name] = JSON.parse(fs.readFileSync(file(name), 'utf8'))
  } catch {
    cache[name] = fallback
  }
  return cache[name]
}

function writeNow(name) {
  try {
    fs.mkdirSync(dir(), { recursive: true })
    const tmp = file(name) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(cache[name]))
    fs.renameSync(tmp, file(name))
  } catch (e) { console.error('store write failed', name, e) }
}

function save(name, value, delay = 400) {
  if (value !== undefined) cache[name] = value
  clearTimeout(timers[name])
  timers[name] = setTimeout(() => writeNow(name), delay)
}

function flush() {
  for (const name of Object.keys(timers)) { clearTimeout(timers[name]); writeNow(name) }
}

module.exports = { load, save, flush }
