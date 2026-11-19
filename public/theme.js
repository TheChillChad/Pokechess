// Tema: 'dark' (predefinito), 'light' o 'auto' (segue il dispositivo). Caricato nell'<head> per evitare il lampo.
(function () {
  const KEY = 'sm_theme';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  const get = () => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'auto' ? v : 'dark'; } catch (e) { return 'dark'; } };
  const eff = (t) => (t === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : t);
  function apply() {
    const e = eff(get());
    document.documentElement.setAttribute('data-theme', e);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', e === 'light' ? '#F4F1EA' : '#192833');
  }
  function set(t) {
    try { localStorage.setItem(KEY, t); } catch (e) { /* ignora */ }
    apply();
    if (window.EMAccount) window.EMAccount.touch(KEY);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (get() === 'auto') apply(); });
  apply();
  window.EMTheme = { get, set, apply };
})();
