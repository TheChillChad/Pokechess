// Musica di sottofondo. Le tracce stanno in public/audio/ (vedi README lì dentro).
// API: Music.setScene('menu'|'battaglia'|'campagna'), Music.setMuted(bool), Music.isMuted(), Music.available()
// Se un file manca o non si carica, quella traccia viene saltata in silenzio: il gioco non si blocca.
window.Music = (function () {
  const BASE = 'audio/';
  const TRACKS = { menu: 'menu.mp3', battaglia: 'battaglia.mp3', campagna: 'campagna.mp3' };
  const VOLUME = 0.35, FADE_MS = 600, KEY = 'sm_music'; // '0' = spenta
  let muted = false, scene = null, cur = null, curName = null, unlocked = false, fadeT = null;
  const missing = {}; // tracce che non si sono caricate
  const cache = {};
  try { muted = localStorage.getItem(KEY) === '0'; } catch (e) { /* ignora */ }

  function audioFor(name) {
    if (missing[name] || !TRACKS[name]) return null;
    if (cache[name]) return cache[name];
    try {
      const a = new Audio(BASE + TRACKS[name]);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      a.addEventListener('error', () => { missing[name] = true; if (curName === name) { cur = null; curName = null; } });
      return (cache[name] = a);
    } catch (e) { missing[name] = true; return null; }
  }
  function fade(a, to, done) {
    clearInterval(a._f);
    const steps = 12, from = a.volume, dt = FADE_MS / steps; let i = 0;
    a._f = setInterval(() => {
      i++; a.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { clearInterval(a._f); if (done) done(); }
    }, dt);
  }
  function stopCur() {
    const a = cur; cur = null; curName = null;
    if (a) fade(a, 0, () => { try { a.pause(); } catch (e) { /* ignora */ } });
  }
  function sync() {
    if (!unlocked || muted || document.hidden || !scene) { return stopCur(); }
    if (curName === scene && cur) return;
    stopCur();
    const a = audioFor(scene); if (!a) return;
    cur = a; curName = scene;
    try {
      a.currentTime = 0; a.volume = 0;
      const p = a.play();
      if (p && p.then) p.then(() => { if (cur === a) fade(a, VOLUME); }).catch(() => { if (cur === a) { cur = null; curName = null; } });
      else fade(a, VOLUME);
    } catch (e) { missing[scene] = true; cur = null; curName = null; }
  }
  // i browser bloccano l'audio finché l'utente non tocca la pagina
  const unlock = () => { if (unlocked) return; unlocked = true; ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, unlock)); sync(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
  document.addEventListener('visibilitychange', sync);

  // Schermata -> traccia. Si guarda quale sezione è visibile, senza toccare il resto del codice.
  function sceneFor() {
    const g = document.getElementById('game');
    if (g && !g.hidden) return 'battaglia';
    // futuro: if (document.getElementById('camp') && !document.getElementById('camp').hidden) return 'campagna';
    return 'menu';
  }
  function watch() {
    const upd = () => { const s = sceneFor(); if (s !== scene) { scene = s; sync(); } };
    new MutationObserver(upd).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    upd();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  return {
    setScene(s) { scene = s; sync(); },
    setMuted(m) { muted = !!m; try { localStorage.setItem(KEY, muted ? '0' : '1'); } catch (e) { /* ignora */ } sync(); },
    isMuted: () => muted,
    available: () => Object.keys(TRACKS).some((n) => !missing[n]),
  };
})();
