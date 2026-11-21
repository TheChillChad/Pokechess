// Account facoltativo (Supabase): email + password, progressi sincronizzati tra dispositivi.
// Senza accesso il gioco funziona come prima (progressi solo nel browser).
(function () {
  const URL = 'https://oqkpnkhhyhbxbxgcjzgv.supabase.co';
  const KEY = 'sb_publishable_RA7r2pQIOIfiZHXtXJdpZA_t28izJeE'; // chiave pubblica: è fatta per stare nel sito
  const SYNC = ['sm_name', 'sm_lv', 'sm_mods', 'sm_puz', 'sm_tut', 'sm_daily', 'sm_survbest', 'sm_survrand', 'sm_run', 'sm_theme', 'sm_lang', 'sm_musvol', 'sm_sfxvol'];
  let sb = null, user = null, timer = null, running = false, again = false;
  const $ = (s) => document.querySelector(s);
  const rd = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const wr = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
  const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

  // ---------- unione dei progressi (non si perde mai nulla) ----------
  function mergeKey(k, a, b, preferLocal) { // a = locale, b = remoto (stringhe o null)
    if (a == null) return b;
    if (b == null) return a;
    if (a === b) return a;
    if (k === 'sm_puz' || k === 'sm_tut') {
      const x = J(a), y = J(b);
      if (Array.isArray(x) && Array.isArray(y)) return JSON.stringify([...new Set([...x, ...y])]);
    }
    if (k === 'sm_daily') {
      const x = J(a) || {}, y = J(b) || {};
      const out = { done: { ...(y.done || {}) }, tries: { ...(y.tries || {}) } };
      for (const d in (x.done || {})) out.done[d] = d in out.done ? Math.min(out.done[d], x.done[d]) : x.done[d];
      for (const d in (x.tries || {})) out.tries[d] = Math.max(out.tries[d] || 0, x.tries[d]);
      return JSON.stringify(out);
    }
    if (k === 'sm_survbest') return String(Math.max(+a || 0, +b || 0));
    if (k === 'sm_run') { // vince la Scalata più avanti
      const x = J(a), y = J(b);
      if (x && y && x.stage !== y.stage) return x.stage > y.stage ? a : b;
    }
    return preferLocal ? a : b;
  }

  async function sync(preferLocal, allowReload) {
    if (!sb || !user) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const { data: row, error } = await sb.from('progress').select('data').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      const remote = (row && row.data) || {};
      const merged = {};
      let changed = false;
      for (const k of SYNC) {
        const m = mergeKey(k, rd(k), remote[k] == null ? null : String(remote[k]), preferLocal);
        if (m != null) merged[k] = m;
        if (m !== rd(k) && m != null) { wr(k, m); changed = true; }
      }
      if (JSON.stringify(merged) !== JSON.stringify(remote)) {
        const { error: e2 } = await sb.from('progress').upsert({ user_id: user.id, data: merged, updated_at: new Date().toISOString() });
        if (e2) throw e2;
      }
      status('✔ Progressi sincronizzati');
      if (changed && allowReload && !$('#home').hidden && !document.body.classList.contains('in-game')) location.reload();
    } catch (e) { status('⚠ Sincronizzazione non riuscita, riprovo più tardi'); }
    running = false;
    if (again) { again = false; sync(true, false); }
  }
  function touch(k) {
    if (!user || !SYNC.includes(k)) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync(true, false), 2000);
  }

  // ---------- interfaccia ----------
  function status(t) { const s = $('#accStatus'); if (s) s.textContent = t; }
  function err(e) {
    const m = String((e && e.message) || e || '');
    if (/failed to fetch|network|load failed/i.test(m)) return 'Nessuna connessione: riprova tra poco.';
    if (/invalid login/i.test(m)) return 'Email o password errati.';
    if (/already registered|already been registered/i.test(m)) return 'Esiste già un account con questa email: usa «Accedi».';
    if (/at least 6/i.test(m)) return 'La password deve avere almeno 6 caratteri.';
    if (/not confirmed/i.test(m)) return 'Conferma prima l’email (controlla anche lo spam).';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Troppi tentativi: riprova tra qualche minuto.';
    if (/invalid.*email|valid email/i.test(m)) return 'Controlla l’indirizzo email.';
    return 'Qualcosa non ha funzionato (' + m + ').';
  }
  function render() {
    const b = $('#accBtn'); if (!b) return;
    b.innerHTML = '👤' + (user ? '<i class="h-dot"></i>' : '');
    b.title = user ? 'Account: ' + (user.email || '') : 'Accedi o registrati';
    b.setAttribute('aria-label', b.title);
  }
  const TH = { dark: 'Scuro 🌙', light: 'Chiaro ☀️', auto: 'Automatico 📱' };
  const themeLabel = () => TH[window.EMTheme ? EMTheme.get() : 'dark'];
  const musLabel = () => (window.Music && Music.isMuted() ? 'Spenta 🔇' : 'Accesa 🎵');
  function settings() {
    let m = $('#accModal'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'accModal'; m.className = 'acc-back';
    const muted = window.Sfx && Sfx.isMuted();
    m.innerHTML = '<div class="acc-box"><button type="button" class="btn acc-x" data-a="close" aria-label="Chiudi">✕</button><h3>⚙️ Impostazioni</h3>' +
      '<button type="button" class="btn acc-row" data-a="snd"><span>Effetti sonori</span><b id="accSnd">' + (muted ? 'Spenti 🔇' : 'Accesi 🔊') + '</b></button>' +
      '<div class="acc-row acc-sl"><span>Volume effetti</span><input type="range" min="0" max="100" step="1" id="sliSfx" value="'+(window.Sfx?Sfx.getVolume():100)+'" aria-label="Volume effetti"><b id="sliSfxV">'+(window.Sfx?Sfx.getVolume():100)+'</b></div>' +
      '<button type="button" class="btn acc-row" data-a="acc"><span>👤 Account</span><b>' + (user ? 'Collegato' : 'Accedi') + '</b></button>' +
      '<button type="button" class="btn acc-row" data-a="mus"><span>Musica</span><b id="accMus">'+musLabel()+'</b></button>'+'<div class="acc-row acc-sl"><span>Volume musica</span><input type="range" min="0" max="100" step="1" id="sliMus" value="'+(window.Music?Music.getVolume():35)+'" aria-label="Volume musica"><b id="sliMusV">'+(window.Music?Music.getVolume():35)+'</b></div>'+'<button type="button" class="btn acc-row" data-a="theme"><span>Tema</span><b id="accTh">'+themeLabel()+'</b></button>'+'<button type="button" class="btn acc-row" data-a="lang"><span>Lingua / Language</span><b>'+(window.EMI18N?EMI18N.LANGS[EMI18N.lang]:'Italiano')+'</b></button></div>';
    m.addEventListener('input', (ev) => {
      const t = ev.target; if (t.type !== 'range') return;
      $('#' + t.id + 'V').textContent = t.value;
      if (t.id === 'sliSfx' && window.Sfx) Sfx.setVolume(t.value); else if (t.id === 'sliMus' && window.Music) Music.setVolume(t.value);
    });
    m.addEventListener('change', (ev) => { if (ev.target.id === 'sliSfx' && window.Sfx && !Sfx.isMuted()) Sfx.play('pick'); });
    m.addEventListener('click', (ev) => {
      if (ev.target === m) return m.remove();
      const a = ev.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'close') m.remove();
      else if (a.dataset.a === 'acc') modal();
      else if (a.dataset.a === 'theme' && window.EMTheme) { const o = ['dark', 'light', 'auto']; EMTheme.set(o[(o.indexOf(EMTheme.get()) + 1) % 3]); $('#accTh').textContent = themeLabel(); }
      else if (a.dataset.a === 'lang' && window.EMI18N) { const o = Object.keys(EMI18N.LANGS); EMI18N.set(o[(o.indexOf(EMI18N.lang) + 1) % o.length]); clearTimeout(timer); Promise.race([window.EMAccount.flush(), new Promise((r) => setTimeout(r, 2500))]).then(() => location.reload()); }
      else if (a.dataset.a === 'mus' && window.Music) { Music.setMuted(!Music.isMuted()); $('#accMus').textContent = musLabel(); }
      else if (a.dataset.a === 'snd' && window.Sfx) { Sfx.setMuted(!Sfx.isMuted()); $('#accSnd').textContent = Sfx.isMuted() ? 'Spenti 🔇' : 'Accesi 🔊'; }
    });
    document.body.appendChild(m);
  }
  function modal(mode) {
    let m = $('#accModal'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'accModal'; m.className = 'acc-back';
    const close = '<button type="button" class="btn acc-x" data-a="close" aria-label="Chiudi">✕</button>';
    if (!sb) {
      m.innerHTML = '<div class="acc-box">' + close + '<h3>Account non disponibile</h3><p>Non riesco a collegarmi al servizio degli account. Riprova tra poco.</p></div>';
    } else if (user && mode !== 'newpass') {
      m.innerHTML = '<div class="acc-box">' + close + '<h3>👤 Il tuo account</h3><p>' + (user.email || '').replace(/</g, '') + '</p><p id="accStatus" class="acc-msg"></p>' +
        '<button type="button" class="btn" data-a="syncnow">🔄 Sincronizza ora</button><button type="button" class="btn" data-a="out">Esci dall’account</button>' +
        '<p class="acc-note">Uscendo, i progressi restano su questo dispositivo ma non si sincronizzano più.</p></div>';
    } else if (mode === 'newpass') {
      m.innerHTML = '<div class="acc-box"><h3>Nuova password</h3><input id="accP1" type="password" autocomplete="new-password" placeholder="Nuova password (min. 6 caratteri)"><p id="accMsg" class="acc-msg"></p><button type="button" class="btn h-go" data-a="setpass">Salva password</button></div>';
    } else {
      m.innerHTML = '<div class="acc-box">' + close + '<h3>👤 Accedi o registrati</h3><p class="acc-note">Facoltativo. Serve per ritrovare puzzle, tutorial e record su ogni dispositivo.</p>' +
        '<input id="accE" type="email" autocomplete="email" placeholder="Email"><input id="accP" type="password" autocomplete="current-password" placeholder="Password (min. 6 caratteri)">' +
        '<p id="accMsg" class="acc-msg"></p><button type="button" class="btn h-go" data-a="in">Accedi</button><button type="button" class="btn" data-a="up">Registrati</button>' +
        '<button type="button" class="acc-link" data-a="forgot">Password dimenticata?</button></div>';
    }
    m.addEventListener('click', async (ev) => {
      if (ev.target === m) return m.remove();
      const a = ev.target.closest('[data-a]'); if (!a) return;
      const act = a.dataset.a, msg = (t, ok) => { const x = $('#accMsg') || $('#accStatus'); if (x) { x.textContent = t; x.className = 'acc-msg' + (ok ? ' ok' : ''); } };
      const email = ($('#accE') || {}).value ? $('#accE').value.trim() : '', pass = ($('#accP') || {}).value || '';
      try {
        if (act === 'close') m.remove();
        else if (act === 'syncnow') { status('Sincronizzo…'); await sync(false, true); }
        else if (act === 'out') { await sb.auth.signOut(); user = null; render(); m.remove(); }
        else if (act === 'in') {
          if (!email || !pass) return msg('Scrivi email e password.');
          msg('Accesso…', true);
          const { error } = await sb.auth.signInWithPassword({ email, password: pass });
          if (error) return msg(err(error));
        } else if (act === 'up') {
          if (!email || !pass) return msg('Scrivi email e password.');
          if (pass.length < 6) return msg('La password deve avere almeno 6 caratteri.');
          msg('Registrazione…', true);
          const { data, error } = await sb.auth.signUp({ email, password: pass });
          if (error) return msg(err(error));
          if (!data.session) msg('Ti abbiamo mandato un’email: tocca il link di conferma (controlla anche lo spam), poi torna qui e premi «Accedi».', true);
        } else if (act === 'forgot') {
          if (!email) return msg('Scrivi la tua email qui sopra, poi premi di nuovo.');
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
          if (error) return msg(err(error));
          msg('Email inviata: segui il link per scegliere una nuova password (controlla anche lo spam).', true);
        } else if (act === 'setpass') {
          const p1 = $('#accP1').value;
          if (p1.length < 6) return msg('La password deve avere almeno 6 caratteri.');
          const { error } = await sb.auth.updateUser({ password: p1 });
          if (error) return msg(err(error));
          m.remove();
        }
      } catch (e) { msg(err(e)); }
    });
    document.body.appendChild(m);
  }

  function init() {
    const home = $('#home');
    if (home && !$('#accBtn')) {
      const t = document.createElement('div'); t.className = 'h-top';
      t.innerHTML = '<button id="setBtn" type="button" class="h-round" title="Impostazioni" aria-label="Impostazioni">⚙️</button><button id="accBtn" type="button" class="h-round"></button>';
      home.appendChild(t);
      $('#setBtn').addEventListener('click', () => settings());
      $('#accBtn').addEventListener('click', () => modal());
    }
    try { sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); } catch (e) { sb = null; }
    render();
    if (!sb) return;
    sb.auth.onAuthStateChange((ev, session) => {
      const was = user;
      user = session ? session.user : null;
      render();
      if (ev === 'PASSWORD_RECOVERY') return modal('newpass');
      if (user && (!was || was.id !== user.id)) { const m = $('#accModal'); if (m) m.remove(); setTimeout(() => sync(false, true), 0); }
    });
  }
  window.EMAccount = { touch, flush: () => (user && sb ? sync(true, false) : Promise.resolve()) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
