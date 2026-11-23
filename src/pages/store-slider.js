// IBRA STORE — سلايد شو آخر البرامج والألعاب من موقع IBRA STORE
// برمجة و تطوير ابراهيم الخزرجي
// كود مستقل بدون مكتبات: IbraStoreSlider.mount(element)
// الخط واللون والخلفية يورثها من التطبيق، واللون الأساسي من --ibra-accent (أو من ACCENT تحت)
;(function () {
  const ACCENT = ''                // غيّره للون ثابت مثل '#e5141e'، أو خليه فارغ حتى ياخذ --ibra-accent
  const SITE = 'https://ibraprogram.netlify.app'
  const API = SITE + '/api/apps'
  const LIMIT = 10
  const INTERVAL = 4000

  const CSS = `
.iss{position:relative;width:100%;font:inherit;color:inherit;border-radius:18px;overflow:hidden;isolation:isolate;
  --iss-accent:var(--ibra-accent,#e5141e);box-shadow:0 10px 30px rgba(0,0,0,.12),0 0 0 1px color-mix(in srgb,currentColor 10%,transparent)}
.iss-track{position:relative;height:250px}
.iss-slide{position:absolute;inset:0;display:flex;align-items:flex-end;opacity:0;visibility:hidden;transition:opacity .6s ease,visibility .6s;text-decoration:none;color:inherit}
.iss-slide.on{opacity:1;visibility:visible}
.iss-bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.04);transition:transform 4.5s ease}
.iss-slide.on .iss-bg{transform:scale(1)}
.iss-shade{position:absolute;inset:0;background:linear-gradient(to top,var(--iss-base) 18%,color-mix(in srgb,var(--iss-base) 70%,transparent) 50%,color-mix(in srgb,var(--iss-base) 10%,transparent))}
.iss-body{position:relative;display:flex;align-items:center;gap:16px;padding:20px 22px 34px;width:100%;box-sizing:border-box}
.iss-ic{width:64px;height:64px;border-radius:16px;flex:none;object-fit:cover;background:color-mix(in srgb,currentColor 8%,transparent);box-shadow:0 6px 18px rgba(0,0,0,.25)}
.iss-tx{flex:1;min-width:0}
.iss-cat{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 10px;border-radius:20px;background:var(--iss-accent);color:#fff;margin-bottom:6px}
.iss-name,.iss-tag{unicode-bidi:plaintext}
.iss[dir=rtl] .iss-name,.iss[dir=rtl] .iss-tag{text-align:right}.iss[dir=ltr] .iss-name,.iss[dir=ltr] .iss-tag{text-align:left}
.iss-name{font-size:20px;font-weight:700;margin:0 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iss-tag{font-size:13px;opacity:.8;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.iss-btn{flex:none;font:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:22px;background:var(--iss-accent);color:#fff;white-space:nowrap;box-shadow:0 6px 16px color-mix(in srgb,var(--iss-accent) 40%,transparent)}
.iss-slide:hover .iss-btn{filter:brightness(1.08)}
.iss-head{position:absolute;top:12px;inset-inline-start:14px;z-index:2;font-size:11.5px;font-weight:700;letter-spacing:.5px;padding:4px 10px;border-radius:20px;background:color-mix(in srgb,var(--iss-base) 75%,transparent);backdrop-filter:blur(8px)}
.iss-head b{color:var(--iss-accent)}
.iss-arr{position:absolute;top:50%;transform:translateY(-70%);z-index:2;width:34px;height:34px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;font:inherit;font-size:18px;line-height:1;
  color:inherit;background:color-mix(in srgb,var(--iss-base) 78%,transparent);backdrop-filter:blur(8px);opacity:0;transition:opacity .2s}
.iss:hover .iss-arr,.iss-arr:focus-visible{opacity:1}
.iss-arr:hover{background:var(--iss-accent);color:#fff}
.iss-prev{inset-inline-start:10px}.iss-next{inset-inline-end:10px}
.iss-dots{position:absolute;bottom:10px;inset-inline:0;display:flex;justify-content:center;gap:6px;z-index:2}
.iss-dot{width:7px;height:7px;border-radius:4px;border:0;padding:0;cursor:pointer;background:color-mix(in srgb,currentColor 35%,transparent);transition:width .25s,background .25s}
.iss-dot.on{width:20px;background:var(--iss-accent)}
.iss :focus-visible{outline:2px solid var(--iss-accent);outline-offset:2px}
@media (max-width:560px){.iss-btn{display:none}.iss-track{height:220px}}
@media (prefers-reduced-motion:reduce){.iss-slide,.iss-bg{transition:none}}`

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const abs = (u) => { if (!u) return ''; try { return new URL(u, SITE + '/').href } catch (e) { return '' } }
  const rtlOf = (el) => getComputedStyle(el).direction === 'rtl'
  const time = (a) => Date.parse(a?.createdAt || '') || 0

  // لون خلفية التطبيق الفعلي (أول أب خلفيته مو شفافة) حتى يندمج السلايد معه
  function baseColor(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/)
      if (!m) continue
      const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x))
      if (a > 0.05) return `rgb(${r}, ${g}, ${b})` // نشيل الشفافية حتى يكون التدرّج مقروء
    }
    // ما لكينا خلفية: نختار حسب لون النص (فاتح = خلفية غامقة)
    const m = getComputedStyle(el).color.match(/\d+/g) || [0, 0, 0]
    return (m[0] * 0.299 + m[1] * 0.587 + m[2] * 0.114) > 140 ? 'rgb(21, 21, 24)' : 'rgb(255, 255, 255)'
  }

  function injectCss() {
    if (document.getElementById('iss-css')) return
    const st = document.createElement('style'); st.id = 'iss-css'; st.textContent = CSS
    document.head.appendChild(st)
  }

  async function load() {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000)
    try {
      const r = await fetch(API, { signal: ctl.signal, cache: 'no-store' })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const data = await r.json()
      const list = Array.isArray(data) ? data : (data.apps || data.items || [])
      const apps = list.filter((a) => a && a.slug && a.name).sort((a, b) => time(b) - time(a)).slice(0, LIMIT)
      return apps
    } finally { clearTimeout(t) }
  }

  function render(host, apps) {
    const root = document.createElement('div')
    root.className = 'iss'
    root.dir = rtlOf(host) ? 'rtl' : 'ltr'
    root.setAttribute('role', 'region')
    root.setAttribute('aria-label', 'آخر البرامج والألعاب من IBRA STORE')
    if (ACCENT) root.style.setProperty('--iss-accent', ACCENT)
    root.style.setProperty('--iss-base', baseColor(host))
    root.innerHTML = `<div class="iss-track">${apps.map((a, i) => {
      const bg = abs((a.screenshots || [])[0]) || abs(a.icon)
      const cat = (a.categories || [])[0] || a.category || ''
      return `<a class="iss-slide${i ? '' : ' on'}" href="${SITE}/app/${encodeURIComponent(a.slug)}" aria-hidden="${i ? 'true' : 'false'}" tabindex="${i ? -1 : 0}">
        <div class="iss-bg" style="background-image:url('${esc(bg)}')"></div><div class="iss-shade"></div>
        <div class="iss-body">${a.icon ? `<img class="iss-ic" src="${esc(abs(a.icon))}" alt="" loading="lazy">` : ''}
          <div class="iss-tx">${cat ? `<span class="iss-cat">${esc(cat)}</span>` : ''}<p class="iss-name">${esc(a.name)}</p><p class="iss-tag">${esc(a.tagline || '')}</p></div>
          <span class="iss-btn">عرض البرنامج ←</span></div></a>`
    }).join('')}</div>
    <div class="iss-head"><b>IBRA</b> STORE · الجديد</div>
    ${apps.length > 1 ? `<button class="iss-arr iss-prev" aria-label="السابق">${rtlOf(host) ? '›' : '‹'}</button><button class="iss-arr iss-next" aria-label="التالي">${rtlOf(host) ? '‹' : '›'}</button>
    <div class="iss-dots">${apps.map((a, i) => `<button class="iss-dot${i ? '' : ' on'}" aria-label="${esc(a.name)}"></button>`).join('')}</div>` : ''}`
    root.querySelectorAll('.iss-ic').forEach((img) => img.addEventListener('error', () => img.remove()))

    const slides = [...root.querySelectorAll('.iss-slide')], dots = [...root.querySelectorAll('.iss-dot')]
    let cur = 0, timer = null, paused = false
    const go = (n) => {
      cur = (n + slides.length) % slides.length
      slides.forEach((s, i) => { s.classList.toggle('on', i === cur); s.setAttribute('aria-hidden', i === cur ? 'false' : 'true'); s.tabIndex = i === cur ? 0 : -1 })
      dots.forEach((d, i) => d.classList.toggle('on', i === cur))
    }
    const start = () => { clearInterval(timer); if (!paused && slides.length > 1) timer = setInterval(() => go(cur + 1), INTERVAL) }
    // الأسهم تتبع اتجاه التطبيق (بالعربي «السابق» يمين و«التالي» يسار)
    root.querySelector('.iss-prev')?.addEventListener('click', (e) => { e.preventDefault(); go(cur - 1); start() })
    root.querySelector('.iss-next')?.addEventListener('click', (e) => { e.preventDefault(); go(cur + 1); start() })
    dots.forEach((d, i) => d.addEventListener('click', (e) => { e.preventDefault(); go(i); start() }))
    root.addEventListener('mouseenter', () => { paused = true; clearInterval(timer) })
    root.addEventListener('mouseleave', () => { paused = false; start() })
    root.addEventListener('focusin', () => { paused = true; clearInterval(timer) })
    root.addEventListener('focusout', () => { paused = false; start() })
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else start() })
    host.replaceChildren(root)
    host.hidden = false
    start()
  }

  async function mount(host) {
    if (!host) return
    host.hidden = true
    injectCss()
    try {
      const apps = await load()
      if (!host.isConnected) return
      if (apps.length) render(host, apps); else host.hidden = true
    } catch (e) {
      host.hidden = true // فشل الجلب: يبقى مخفي بهدوء
    }
  }

  window.IbraStoreSlider = { mount }
})()
