// IBRA CROM — الترجمة (عربي / English)
// برمجة و تطوير ابراهيم الخزرجي
// النصوص تُكتب بالعربية في الكود، وفي الوضع الإنجليزي تُترجم تلقائياً من القاموس i18n-en.js
;(function (root) {
  const EN = typeof module !== 'undefined' ? require('./i18n-en.js') : root.IBRA_EN
  const AR = /[\u0600-\u06FF]/
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  const exact = new Map(), patterns = []
  const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  for (const [k, v] of Object.entries(EN)) {
    const nk = norm(k)
    if (!nk.includes('{}')) { exact.set(nk, v); continue }
    const stripped = norm(nk.replace(/^(\{\}\s*)+|(\s*\{\})+$/g, ''))
    const sv = v.replace(/^(\{\}\s*)+|(\s*\{\})+$/g, '').trim()
    if (stripped && !stripped.includes('{}') && !exact.has(stripped)) exact.set(stripped, sv)
    const lit = nk.replace(/\{\}/g, '').length
    patterns.push({ re: new RegExp('^' + nk.split('{}').map(esc).join('([\\s\\S]*?)') + '$'), v, lit })
  }
  patterns.sort((a, b) => b.lit - a.lit)

  function tr(s, lang) {
    if (lang !== 'en' || !s || !AR.test(s)) return s
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0]
    const key = norm(s)
    if (exact.has(key)) return lead + exact.get(key) + trail
    for (const p of patterns) {
      const m = key.match(p.re)
      if (!m) continue
      let i = 1
      return lead + p.v.replace(/\{\}/g, () => { const c = m[i++] || ''; return AR.test(c) ? tr(c, lang) : c }) + trail
    }
    return s
  }

  // ترجمة صفحة كاملة وكل ما يُضاف إليها لاحقاً
  const ATTRS = ['title', 'placeholder', 'aria-label']
  function translateNode(node, lang) {
    if (node.nodeType === 3) {
      const p = node.parentNode
      if (p && /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName)) return
      if (AR.test(node.nodeValue)) { const t = tr(node.nodeValue, lang); if (t !== node.nodeValue) node.nodeValue = t }
      return
    }
    if (node.nodeType !== 1) return
    for (const a of ATTRS) { const v = node.getAttribute(a); if (v && AR.test(v)) { const t = tr(v, lang); if (t !== v) node.setAttribute(a, t) } }
    if (node.nodeName === 'INPUT' && /^(button|submit)$/i.test(node.type) && AR.test(node.value)) node.value = tr(node.value, lang)
    const w = document.createTreeWalker(node, 5) // elements + text
    let n
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) translateNode(n, lang)
      else for (const a of ATTRS) { const v = n.getAttribute(a); if (v && AR.test(v)) { const t = tr(v, lang); if (t !== v) n.setAttribute(a, t) } }
    }
  }
  function attach(lang) {
    if (typeof document === 'undefined') return
    const de = document.documentElement
    de.lang = lang === 'en' ? 'en' : 'ar'
    de.dir = lang === 'en' ? 'ltr' : 'rtl'
    if (lang !== 'en') return
    translateNode(de, lang)
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') translateNode(m.target, lang)
        else if (m.type === 'attributes') translateNode(m.target, lang)
        else m.addedNodes.forEach(n => translateNode(n, lang))
      }
    }).observe(de, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
    const oc = window.confirm.bind(window), oa = window.alert.bind(window)
    window.confirm = (m) => oc(tr(String(m), lang))
    window.alert = (m) => oa(tr(String(m), lang))
  }
  const api = { tr, attach, AR }
  if (typeof module !== 'undefined') module.exports = api; else root.IBRA_I18N = api
})(typeof window !== 'undefined' ? window : globalThis)
