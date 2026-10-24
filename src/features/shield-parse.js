// تحليل قوائم المواقع الخطيرة (يعمل في خيط منفصل حتى لا يتجمد المتصفح)
// مواقع كبيرة لا تُحجب أبداً حتى لو ظهرت خطأً في قائمة
const SAFE = ['google.com', 'youtube.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com', 'facebook.com', 'fbcdn.net', 'instagram.com',
  'whatsapp.com', 'whatsapp.net', 'microsoft.com', 'live.com', 'office.com', 'microsoftonline.com', 'windows.net', 'apple.com', 'icloud.com',
  'github.com', 'githubusercontent.com', 'cloudflare.com', 'amazon.com', 'amazonaws.com', 'wikipedia.org', 'x.com', 'twitter.com', 'tiktok.com',
  'telegram.org', 't.me', 'yahoo.com', 'bing.com', 'netflix.com', 'linkedin.com', 'reddit.com', 'chatgpt.com', 'openai.com', 'claude.ai',
  'anthropic.com', 'snapchat.com', 'discord.com', 'zoom.us', 'paypal.com', 'mozilla.org', 'torproject.org', 'shahid.mbc.net', 'cinemana.shabakaty.com',
  'bit.ly', 'tinyurl.com', 'dropbox.com', 'mediafire.com', 'mega.nz', '1drv.ms', 'forms.gle', 'wa.me', 'linktr.ee', 'shopify.com', 'zain.com', 'asiacell.com', 'earthlink.iq']

// تخزين مضغوط: كل نطاق يتحول إلى رقم 53 بت (بصمتان) ضمن مصفوفة مرتبة → ذاكرة قليلة وبحث سريع
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) } return h >>> 0 }
function djb(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h >>> 0 }
const key = (host) => fnv(host) * 2097152 + (djb(host) >>> 11)
function bsearch(arr, v) { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] === v) return true; if (arr[m] < v) lo = m + 1; else hi = m - 1 } return false }

const norm = (h) => (h || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
function isSafe(host) { return SAFE.some(d => host === d || host.endsWith('.' + d)) }

function parseList(text) {
  const out = []
  for (let line of text.split('\n')) {
    line = line.trim()
    if (!line || line[0] === '#' || line[0] === '!') continue
    const t = line.split(/\s+/)
    let h = /^(0\.0\.0\.0|127\.0\.0\.1|::1?)$/.test(t[0]) ? t[1] : t[0]
    if (!h) continue
    if (h.includes('://')) { try { h = new URL(h).hostname } catch { continue } }
    h = norm(h.split('/')[0].split(':')[0])
    if (!h || h === 'localhost' || !h.includes('.') || isSafe(h)) continue
    out.push(key(h))
  }
  return out
}

module.exports = { key, bsearch, norm, isSafe, parseList }
