// Lingue: l'italiano è la lingua di origine; per le altre lingue un traduttore guarda i testi che compaiono
// nella pagina e li sostituisce con la traduzione (elenco esatto + regole per i testi con numeri/nomi).
// Se un testo non è tradotto resta in italiano: non si rompe mai nulla. Le traduzioni stanno in lang-<codice>.js.
(function () {
  const KEY = 'sm_lang';
  const LANGS = { it: 'Italiano', en: 'English' };
  const get = () => { try { const v = localStorage.getItem(KEY); return LANGS[v] ? v : 'it'; } catch (e) { return 'it'; } };
  const lang = get();
  const dict = { exact: Object.create(null), rules: [] };
  const miss = new Set(); // testi non tradotti visti (per controllare cosa manca)
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  // Cerca la traduzione di un testo (ritorna null se non c'è)
  function tr(text) {
    if (lang === 'it' || typeof text !== 'string') return null;
    const n = norm(text);
    if (!n || !/[A-Za-zÀ-ù]/.test(n)) return null;
    let out = dict.exact[n];
    if (out == null) {
      for (const [re, fn] of dict.rules) {
        const m = n.match(re);
        if (m) { out = typeof fn === 'function' ? fn(...m.slice(1)) : n.replace(re, fn); break; }
      }
    }
    if (out == null) {
      // testo con punteggiatura attaccata ai lati (es. ": descrizione.") -> traduce il nucleo
      const m = n.match(/^([^A-Za-zÀ-ù0-9+−×]*)(.*?)([:;,\s—·-]*)$/);
      if (m && m[2] && (m[1] || m[3]) && m[2] !== n) { const core = tr(m[2]); if (core != null) out = m[1] + core.trim() + m[3]; }
    }
    if (out == null || out === n) return null;
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    return lead + out + trail;
  }
  // Traduce un testo, e se non c'è lo lascia com'è
  const t = (text) => { const r = tr(text); return r == null ? text : r; };

  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function node(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode;
      if (!p || SKIP[p.nodeName]) return;
      if (n.__en === n.nodeValue) return; // già tradotto da noi
      const r = tr(n.nodeValue);
      if (r != null && r !== n.nodeValue) { n.nodeValue = r; n.__en = r; } else if (r == null) miss.add(n.nodeValue.replace(/\s+/g, ' ').trim());
    } else if (n.nodeType === 1) {
      if (SKIP[n.nodeName]) return;
      for (const a of ATTRS) if (n.hasAttribute(a)) { const r = tr(n.getAttribute(a)); if (r != null) n.setAttribute(a, r); }
      for (let c = n.firstChild; c; c = c.nextSibling) node(c);
    }
  }
  function start() {
    if (lang === 'it') return;
    document.documentElement.lang = lang;
    document.title = t(document.title);
    node(document.documentElement);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(node);
        else if (m.type === 'characterData') node(m.target);
        else if (m.type === 'attributes') { const r = tr(m.target.getAttribute(m.attributeName)); if (r != null) m.target.setAttribute(m.attributeName, r); }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (lang !== 'it') {
    const oc = window.confirm, oa = window.alert;
    window.confirm = (m) => oc.call(window, t(String(m)));
    window.alert = (m) => oa.call(window, t(String(m)));
  }
  window.EMI18N = {
    lang, LANGS, get, t, tr, miss,
    set(l) { try { localStorage.setItem(KEY, LANGS[l] ? l : 'it'); } catch (e) { /* ignora */ } if (window.EMAccount) window.EMAccount.touch(KEY); },
    // registra traduzioni: exact = {italiano: traduzione}, rules = [[regex, funzione|stringa]]
    add(code, exact, rules) {
      if (code !== lang) return;
      for (const k in exact || {}) dict.exact[norm(k)] = exact[k];
      for (const r of rules || []) dict.rules.push(r);
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
