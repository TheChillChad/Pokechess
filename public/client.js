(() => {
  const Sh = window.Shared;
  const CFG = window.GAME_CONFIG;
  const $ = (s) => document.querySelector(s);
  const socket = io();

  let S = null;            // ultimo stato ricevuto dal server
  let roomCode = null;
  const ui = { sel: null, inspect: null, item: null, draftPiece: null, picks: [], rc: {}, seq: null, endDismissed: false, sb: { mode: 'edit', sq: null, moving: null, add: { color: 'w', role: 'pedone', type: null } } };

  // ---------- identità (per rientrare nella stanza dopo un ricaricamento) ----------
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignora */ } return null; }
  const token = (() => {
    let t = store('sm_token');
    if (!t) { t = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'tk' + Math.random().toString(36).slice(2) + Date.now().toString(36); store('sm_token', t); }
    return t;
  })();

  const myName = () => (store('sm_name') || '').trim().slice(0, 14);
  const nameInput = document.querySelector('#nameInput');
  if (nameInput) { nameInput.value = myName(); nameInput.addEventListener('input', () => store('sm_name', nameInput.value.trim().slice(0, 14) || null)); }

  // modificatori scelti nella home (valgono per la prossima partita creata)
  const optLucky = $('#optLucky'), optVis = $('#optLuckyVis'), optRandom = $('#optRandom');
  const optHc = $('#optHandicap'), optHcWho = $('#optHandicapWho');
  function saveMods() {
    $('#optLuckyRow').hidden = !optLucky.checked;
    $('#optsOn').hidden = !(optLucky.checked || optRandom.checked || (ui.panel === 'bot' && optHc.value));
    store('sm_mods', JSON.stringify({ lucky: optLucky.checked, vis: optVis.value, random: optRandom.checked, hc: optHc.value, hcWho: optHcWho.value }));
  }
  try { const m = JSON.parse(store('sm_mods') || 'null'); if (m) { optLucky.checked = !!m.lucky; optRandom.checked = !!m.random; if (m.vis) optVis.value = m.vis; if (m.hc) optHc.value = m.hc; if (m.hcWho) optHcWho.value = m.hcWho; } } catch (e) { /* ignora */ }
  optLucky.addEventListener('change', saveMods); optVis.addEventListener('change', saveMods); optRandom.addEventListener('change', saveMods); optHc.addEventListener('change', saveMods); optHcWho.addEventListener('change', saveMods); saveMods();
  const getMods = () => ({ lucky: optLucky.checked ? { vis: optVis.value } : null, randomTypes: optRandom.checked });

  // ---------- utilità ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sprite = (name) => `sprites/${CFG.spriteSet}/${name}.svg`;
  const pieceSprite = (p) => sprite(p.role === 're' ? 're' : `${p.role}_${p.type || 'neutro'}`);
  const typeIcon = (t) => sprite('tipo_' + t);
  const teamName = (c) => Sh.TEAM[c];
  const pieceName = (p) => Sh.ROLES[p.role].label + (p.type ? ' ' + Sh.TYPE_LABEL[p.type] : '');
  const byId = (id) => S && S.pieces.find((p) => p.id === id);
  const pieceAt = (r, c) => S.pieces.find((p) => p.alive && p.r === r && p.c === c);
  const flipped = () => S && S.you === 'b' && !S.sandbox; // nel campo di prova la scacchiera non gira mai
  const opp = () => (S.you === 'w' ? 'b' : 'w');
  const myTurn = () => S && S.phase === 'play' && S.turn === S.you && !S.pendingBy;
  const chip = (t) => `<span class="chip"><img src="${typeIcon(t)}" alt="">${Sh.TYPE_LABEL[t]}</span>`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ---------- connessione ----------
  function showHome(err) {
    S = null; roomCode = null;
    $('#home').hidden = false; $('#game').hidden = true; $('#scal').hidden = true;
    showPanel(ui.panel || 'main');
    $('#homeErr').textContent = err || '';
  }
  // menu della home: schermata principale con 4 pulsanti e sotto-schermate
  function showPanel(name) {
    ui.panel = name;
    $('#home').classList.toggle('h-sub', name !== 'main');
    document.querySelectorAll('#home .h-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    const slot = document.querySelector(`#home .h-panel[data-panel="${name}"] [data-opts-slot]`);
    const box = $('#optsBox');
    if (box) { if (slot) slot.appendChild(box); else $('#optsHold').appendChild(box); }
    $('#optHandicapBox').hidden = name !== 'bot';
    saveMods();
    const last = store('sm_lv');
    document.querySelectorAll('#home .h-lv').forEach((b) => b.classList.toggle('last', b.id === 'btnBot' + (last || '').charAt(0).toUpperCase() + (last || '').slice(1)));
    if (name === 'puz') renderPuzList();
    if (name === 'avv') updateDaily();
    if (name === 'tut') renderTutList();
    $('#homeErr').textContent = '';
    const home = $('#home'); if (home) home.scrollTop = 0;
  }
  for (const [id, p] of [['btnGoAmici', 'amici'], ['btnGoBot', 'bot'], ['btnGoAvv', 'avv'], ['btnGoLab', 'lab']]) document.getElementById(id).addEventListener('click', () => showPanel(p));
  document.querySelectorAll('#home [data-back]').forEach((b) => b.addEventListener('click', () => showPanel('main')));
  document.querySelectorAll('#home [data-back-avv]').forEach((b) => b.addEventListener('click', () => showPanel('avv')));
  function enterRoom(code) {
    roomCode = code;
    store('sm_room', code);
    try { history.replaceState(null, '', '?stanza=' + code); } catch (e) { /* ignora */ }
  }
  function joinRoom(code, silent) {
    socket.emit('join', { code, token, name: myName() }, (res) => {
      if (res && res.ok) { enterRoom(res.code); return; }
      store('sm_room', null);
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }
      showHome(silent ? '' : (res && res.error) || 'Impossibile entrare');
    });
  }
  socket.on('connect', () => {
    const fromUrl = (new URLSearchParams(location.search).get('stanza') || '').toUpperCase();
    const code = roomCode || fromUrl || store('sm_room');
    if (code && /^[A-Z0-9]{5}$/.test(code)) joinRoom(code, !roomCode && !fromUrl);
  });
  socket.on('disconnect', () => toast('Connessione persa, riprovo…'));
  socket.on('errore', (m) => toast(m));
  socket.on('state', (st) => {
    const prev = S;
    S = st;
    if (!prev || prev.phase !== st.phase || prev.you !== st.you) { ui.sel = null; ui.item = null; ui.draftPiece = null; ui.picks = []; ui.rc = {}; }
    if (ui.sel && !st.legal[ui.sel]) ui.sel = null;
    if (ui.item && !myTurn()) ui.item = null;
    if (ui.draftPiece) { const p = byId(ui.draftPiece); if (!p || p.type || st.turn !== st.you) ui.draftPiece = null; }
    playSounds(prev, st);
    render();
  });

  // suoni: confronta lo stato nuovo con il precedente (niente suoni al primo caricamento)
  function playSounds(prev, st) {
    if (!prev || !window.Sfx || prev.code !== st.code) return;
    const mine = st.you;
    if (prev.phase !== 'over' && st.phase === 'over') {
      Sfx.play(st.winner === null ? 'draw' : st.spectator || st.winner === mine ? 'win' : 'lose');
      return;
    }
    if (prev.phase === 'items' && st.phase === 'play') { Sfx.play('start'); return; }
    if (st.phase === 'draft' && st.picks > prev.picks) { Sfx.play('pick'); return; }
    const ev = st.event;
    const newEv = ev && (!prev.event || ev.seq !== prev.event.seq);
    const moved = JSON.stringify(st.lastMove) !== JSON.stringify(prev.lastMove);
    let played = false;
    if (newEv) {
      const k = ev.kind;
      if (ev.text === 'Arrocco') Sfx.play('castle');
      else if (k === 'check') { if (moved) Sfx.play('move'); Sfx.play('check', moved ? 0.1 : 0); }
      else if (k === 'kill' && ev.text === 'Matto!') Sfx.play('check');
      else if (k === 'kill' || k === 'super' || k === 'weak' || k === 'hit' || k === 'block') Sfx.play(ev.bomb ? 'bomb' : k);
      else if (k === 'heal' || k === 'buff') Sfx.play(k);
      played = true;
    }
    if (!played && moved) Sfx.play('move');
    if (prev.pending !== st.pending && !st.pending && prev.pendingBy) Sfx.play('promote');
    // tocca a te (solo se l'avversario ha appena giocato)
    if (st.phase === 'play' && st.turn === mine && prev.turn !== mine) Sfx.play('turn', 0.35);
  }

  $('#btnCreate').addEventListener('click', () => {
    socket.emit('create', { token, name: myName(), mods: getMods() }, (res) => {
      if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
    });
  });
  const startBot = (level) => { store('sm_lv', level); socket.emit('createBot', { token, level, name: myName(), mods: { ...getMods(), handicap: optHc.value ? { level: optHc.value, who: optHcWho.value } : null } }, (res) => {
    if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
  }); };
  const startSurv = (random) => { socket.emit('createBot', { token, name: myName(), surv: { random: !!random } }, (res) => {
    if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
  }); };
  // Puzzle: elenco, avvio, progressi nel browser
  const puzDone = () => { try { return JSON.parse(store('sm_puz') || '[]'); } catch (e) { return []; } };
  function renderPuzList() {
    const done = puzDone();
    $('#puzList').innerHTML = Puzzles.LIST.length ? Puzzles.LIST.map((p, i) => `<button type="button" data-puz="${p.id}" class="${done.includes(p.id) ? 'done' : ''}"><span class="n">${done.includes(p.id) ? '✓' : i + 1}</span><b>${esc(p.title)}<small>${esc(Puzzles.goalText(p))}${p.w && p.items && p.items.w.length ? ' · con strumenti' : ''}</small></b></button>`).join('') : '<p class="h-hint">Nessun puzzle ancora.</p>';
  }
  // Puzzle del giorno: sm_daily = {done:{'YYYY-MM-DD':tentativi}, tries:{'YYYY-MM-DD':n}}
  const localDate = (off = 0) => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dailyData = () => { try { const x = JSON.parse(store('sm_daily') || '{}'); return { done: x.done || {}, tries: x.tries || {} }; } catch (e) { return { done: {}, tries: {} }; } };
  const dailySave = (x) => { try { store('sm_daily', JSON.stringify(x)); } catch (e) { /* ignora */ } };
  function dailyStreak() { const d = dailyData().done; let off = d[localDate()] ? 0 : -1, n = 0; while (d[localDate(off)]) { n++; off--; } return n; }
  function updateDaily() {
    const el = $('#dailySub'); if (!el) return;
    const done = dailyData().done[localDate()], st = dailyStreak();
    el.textContent = (done ? 'Oggi: risolto ✓' : 'Oggi: da fare') + (st ? ' · serie ' + st + (st === 1 ? ' giorno' : ' giorni') : '');
  }
  $('#btnDaily').addEventListener('click', () => { const x = Puzzles.dailyOf(localDate()); const dd = dailyData(); if (!dd.tries[localDate()]) { dd.tries[localDate()] = 1; dailySave(dd); } startPuzzle(x.def.id); });
  const tutDone = () => { try { return JSON.parse(store('sm_tut') || '[]'); } catch (e) { return []; } };
  function renderTutList() {
    const done = tutDone(); let n = 0;
    $('#tutList').innerHTML = Puzzles.CHAPTERS.map((c) => `<div class="h-chap">${c.icon} ${c.n}. ${esc(c.title)}</div>` + Puzzles.TUTORIAL.filter((l) => l.ch === c.n).map((l) => { n++; return `<button type="button" data-puz="${l.id}" class="${done.includes(l.id) ? 'done' : ''}"><span class="n">${done.includes(l.id) ? '✓' : n}</span><b>${esc(l.title)}</b></button>`; }).join('')).join('');
  }
  $('#tutList').addEventListener('click', (e) => { const b = e.target.closest('[data-puz]'); if (b) startPuzzle(b.dataset.puz); });
  $('#btnTut').addEventListener('click', () => showPanel('tut'));
  const startPuzzle = (id) => { socket.emit('createBot', { token, name: myName(), puzzle: id }, (res) => {
    if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
  }); };
  $('#puzList').addEventListener('click', (e) => { const b = e.target.closest('[data-puz]'); if (b) startPuzzle(b.dataset.puz); });
  $('#btnPuz').addEventListener('click', () => showPanel('puz'));
  $('#btnSurv').addEventListener('click', () => { const o = $('#survOpts'); o.hidden = !o.hidden; $('#btnSurv').classList.toggle('open', !o.hidden); });
  $('#btnSurvGo').addEventListener('click', () => { store('sm_survrand', $('#survRandom').checked ? '1' : ''); startSurv($('#survRandom').checked); });
  try { $('#survRandom').checked = store('sm_survrand') === '1'; } catch (e) { /* ignora */ }
  $('#btnBotEasy').addEventListener('click', () => startBot('easy'));
  $('#btnBotNormal').addEventListener('click', () => startBot('normal'));
  $('#btnBotHard').addEventListener('click', () => startBot('hard'));
  $('#btnBotMaster').addEventListener('click', () => startBot('master'));
  $('#btnLocal').addEventListener('click', () => socket.emit('createLocal', { token, mods: getMods() }, (res) => {
    if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
  }));
  $('#btnSandbox').addEventListener('click', () => socket.emit('createSandbox', { token, name: myName() }, (res) => {
    if (res && res.ok) { ui.sb.mode = 'edit'; ui.sb.sq = null; ui.sb.moving = null; enterRoom(res.code); } else showHome((res && res.error) || 'Errore');
  }));
  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#codeInput').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { $('#homeErr').textContent = 'Il codice ha 5 caratteri'; return; }
    joinRoom(code, false);
  });

  // ---------- Scalata ----------
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-rc]');
    if (!el || !S) return;
    const k = el.dataset.rc;
    if (k === 'sarto-id' || k === 'sarto-type') { ui.rc.sarto = ui.rc.sarto || {}; ui.rc.sarto[k === 'sarto-id' ? 'id' : 'type'] = el.value; }
    else ui.rc[k] = el.value;
    render();
  });
  const RUN0 = () => ({ stage: 1, bonuses: [], offer: null, playing: null, done: false, msg: '' });
  function runGet() { try { const r = JSON.parse(store('sm_run')); if (r && r.stage) return { ...RUN0(), ...r }; } catch (e) { /* ignora */ } return RUN0(); }
  function runSet(r) { store('sm_run', JSON.stringify(r)); }
  // Esito di uno scontro: vittoria = bonus (o fine), patta = si ripete, sconfitta = Rivincita o si ricomincia
  function scalResult(outcome, prefix) {
    const r = runGet(); r.playing = null;
    if (outcome === 'win') {
      if (r.stage >= Scalata.STAGE_COUNT) { r.done = true; r.msg = ''; } else { r.offer = Scalata.offer(r); r.msg = 'Scontro vinto! Scegli un bonus.'; }
    } else if (outcome === 'draw') r.msg = 'Patta: lo scontro si ripete, non perdi nulla.';
    else {
      const i = r.bonuses.indexOf('rivincita');
      if (i >= 0) { r.bonuses.splice(i, 1); r.msg = 'Sconfitta, ma la Rivincita ti fa ripetere lo scontro.'; }
      else { const lost = r.stage; Object.assign(r, RUN0(), { msg: `Sconfitta allo scontro ${lost}: si ricomincia da capo.` }); }
    }
    if (prefix) r.msg = prefix + ' ' + r.msg;
    runSet(r);
    return r;
  }
  function stageInfo(st) {
    const bits = [];
    if (st.hp) bits.push(Object.entries(st.hp).map(([k, v]) => `${Sh.ROLES[k].label.toLowerCase()} +${v} HP`).join(', '));
    if (st.items) bits.push('strumenti extra: ' + st.items.map((i) => Sh.ITEMS[i].label).join(', '));
    return bits.join(' · ');
  }
  function showScal() {
    let r = runGet();
    if (r.playing) r = scalResult('lose', 'Hai lasciato lo scontro: conta come sconfitta.');
    $('#home').hidden = true; $('#game').hidden = true; $('#scal').hidden = false;
    $('#scal').scrollTop = 0;
    renderScal();
  }
  function goScal() { if (S) leaveRoom(); showScal(); }
  const bonusChip = (id) => { const B = Scalata.BONUSES[id]; return `<span class="sc-chip${B.price ? ' price' : ''}" title="${esc(B.desc)}">${B.icon} ${B.label}</span>`; };
  function renderScal() {
    const r = runGet();
    const st = Scalata.STAGES[r.stage - 1];
    const ladder = Scalata.STAGES.map((s, i) => `<li class="${i + 1 < r.stage || r.done || (r.offer && i + 1 === r.stage) ? 'done' : i + 1 === r.stage ? 'now' : ''}"><i>${i + 1 < r.stage || r.done || (r.offer && i + 1 === r.stage) ? '✓' : i + 1}</i>${s.name}</li>`).join('');
    const owned = r.bonuses.length ? r.bonuses.map(bonusChip).join('') : '<span class="mute">Nessun bonus ancora.</span>';
    let main;
    if (r.done) {
      main = `<div class="sc-card win"><div class="sc-big">👑</div><h2>Scalata completata!</h2><p>Hai battuto tutti e ${Scalata.STAGE_COUNT} gli avversari.</p><button class="btn primary" type="button" data-sc="restart">Nuova scalata</button></div>`;
    } else if (r.offer) {
      main = `<div class="sc-card"><h2>Scegli un bonus</h2><p class="mute">Resta con te fino alla fine della scalata.</p>${r.offer.map((id) => { const B = Scalata.BONUSES[id]; return `<button class="sc-bonus${B.price ? ' price' : ''}" type="button" data-sc="pick" data-id="${id}"><b>${B.icon} ${B.label}</b>${B.price ? '<em>con un prezzo</em>' : ''}<span>${esc(B.desc)}</span></button>`; }).join('')}</div>`;
    } else {
      const info = stageInfo(st);
      main = `<div class="sc-card"><h2>Scontro ${r.stage} di ${Scalata.STAGE_COUNT}: ${st.name}</h2>${info ? `<p class="mute">Vantaggi dell'avversario: ${esc(info)}.</p>` : '<p class="mute">Nessun vantaggio per l\'avversario.</p>'}<button class="btn primary" type="button" data-sc="fight">Combatti</button></div>`;
    }
    $('#scBody').innerHTML = `<button class="link sc-back" type="button" data-sc="home">← Home</button>
      <h1 class="sc-title">🏆 Scalata</h1>
      ${r.msg ? `<p class="sc-msg">${esc(r.msg)}</p>` : ''}
      <ol class="sc-ladder">${ladder}</ol>${main}
      <div class="sc-owned"><h3>I tuoi bonus</h3><div class="sc-chips">${owned}</div></div>
      <button class="link" type="button" data-sc="restart">Ricomincia la scalata</button>`;
  }
  function renderRunEnd(el) {
    const win = S.winner === S.you, draw = S.winner === null;
    const last = S.run.stage >= Scalata.STAGE_COUNT;
    const title = win ? (last ? 'Scalata completata!' : 'Scontro vinto!') : draw ? 'Patta' : 'Sconfitta';
    const cls = win ? 'win' : draw ? 'draw' : 'lose';
    if (ui.endDismissed || !el.hidden) return;
    const r = runGet();
    if (r.playing === S.code) scalResult(win ? 'win' : draw ? 'draw' : 'lose');
    const msg = runGet().msg;
    el.innerHTML = `<div class="endbox ${cls}"><canvas id="confetti"></canvas>
      <div class="end-ico">${win ? '👑' : draw ? '🤝' : '💥'}</div>
      <h2 class="end-title">${title}</h2><p class="end-reason">${esc(S.reason || '')}</p>${msg ? `<p class="end-reason">${esc(msg)}</p>` : ''}
      <div class="end-actions"><button class="btn primary" type="button" data-act="scal">${win && !last ? 'Scegli il bonus' : 'Torna alla Scalata'}</button>
      <button class="link" type="button" data-act="review">Guarda la scacchiera</button></div></div>`;
    el.hidden = false;
    if (win) confetti();
  }
  $('#btnScal').addEventListener('click', () => { ui.panel = 'avv'; showScal(); });
  $('#btnLabRules').addEventListener('click', () => openDialog('#dlgRules', rulesText()));
  $('#btnLabTypes').addEventListener('click', () => openDialog('#dlgTypes', typesTable()));
  $('#scal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sc]');
    if (!b) return;
    const r = runGet();
    switch (b.dataset.sc) {
      case 'home': ui.panel = 'avv'; showHome(''); break;
      case 'pick': {
        if (!r.offer || !r.offer.includes(b.dataset.id)) break;
        r.bonuses.push(b.dataset.id); r.offer = null; r.stage++; r.msg = '';
        runSet(r); renderScal(); break;
      }
      case 'restart': if (r.done || confirm('Ricominciare la scalata da capo? Perdi tutti i bonus.')) { runSet(RUN0()); renderScal(); } break;
      case 'fight':
        socket.emit('createBot', { token, name: myName(), run: { stage: r.stage, bonuses: r.bonuses } }, (res) => {
          if (res && res.ok) { const r2 = runGet(); r2.playing = res.code; r2.msg = ''; runSet(r2); enterRoom(res.code); } else toast((res && res.error) || 'Errore');
        });
        break;
    }
  });

  // ---------- evidenziazioni ----------
  function itemTargets(h) {
    const it = ui.item;
    const mine = S.pieces.filter((p) => p.alive && p.color === S.you);
    const mark = (p) => { h.pick[p.r + ',' + p.c] = 1; };
    if (it.name === 'pozione') mine.filter((p) => p.role !== 're' && p.hp < p.maxHp).forEach(mark);
    else if (it.name === 'scudo') mine.filter((p) => !p.shield).forEach(mark);
    else if (it.name === 'cristallo') mine.filter((p) => !p.boost).forEach(mark);
    else if (it.name === 'metamorfosi') { if (!it.id) mine.filter((p) => p.role !== 're').forEach(mark); else h.sel = it.id; }
    else if (it.name === 'paralisi' || it.name === 'bomba') {
      S.pieces.filter((p) => p.alive && p.color !== S.you && p.role !== 're' && !(it.name === 'paralisi' && p.frozen)).forEach(mark);
    }
    else if (it.name === 'cambio') {
      const f0 = it.first ? byId(it.first) : null;
      // un alfiere non può cambiare colore di casella
      const swapOk = (x, y) => !((x.role === 'alfiere' || y.role === 'alfiere') && (x.r + x.c) % 2 !== (y.r + y.c) % 2);
      mine.filter((p) => p.id !== it.first && (!f0 || swapOk(f0, p))).forEach(mark);
      if (it.first) { const f = byId(it.first); h.sel = f.id; }
    } else if (it.name === 'revitalizzante' && it.id) {
      const p = byId(it.id);
      const rows = p.role === 'pedone' ? [S.you === 'w' ? 6 : 1] : (S.you === 'w' ? [6, 7] : [0, 1]);
      for (const r of rows) for (let c = 0; c < 8; c++) if (!pieceAt(r, c) && (p.role !== 'alfiere' || (r + c) % 2 === (p.r + p.c) % 2)) h.pick[r + ',' + c] = 1;
    }
  }
  function computeHl() {
    const h = { sel: null, move: {}, atk: {}, pick: {}, last: {} };
    if (S.lastMove) { h.last[S.lastMove.from.join(',')] = 1; h.last[S.lastMove.to.join(',')] = 1; }
    if (S.phase === 'draft' && ui.draftPiece) h.sel = ui.draftPiece;
    if (S.phase === 'prep' && ui.prepSel && byId(ui.prepSel)) {
      const sp = byId(ui.prepSel); h.sel = sp.id;
      for (const r of [5, 6, 7]) for (let c = 0; c < 8; c++) if (!(sp.role === 'pedone' && r === 7) && !(pieceAt(r, c) && pieceAt(r, c).id === sp.id)) h.pick[r + ',' + c] = 1;
    }
    if (myTurn()) {
      if (ui.item) itemTargets(h);
      else if (ui.sel) {
        h.sel = ui.sel;
        for (const m of S.legal[ui.sel] || []) (m.kind === 'attack' ? h.atk : h.move)[m.r + ',' + m.c] = m;
      }
    }
    return h;
  }

  // ---------- reazioni rapide ----------
  const REACTS = ['👍', '😮', '😂', '🔥', '😅', 'GG'];
  function renderReactBar() {
    const el = $('#reactbar');
    const on = S && !S.bot && !S.local && S.phase !== 'lobby';
    el.hidden = !on;
    if (on && !el.dataset.ready) { el.dataset.ready = '1'; el.innerHTML = REACTS.map((e) => `<button type="button" data-react="${e}" aria-label="Reazione ${e}">${e}</button>`).join(''); }
  }
  $('#reactbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-react]');
    if (b) socket.emit('react', { e: b.dataset.react });
  });
  socket.on('reaction', (r) => {
    const who = r.name || (r.from === 's' ? 'Spettatore' : teamName(r.from));
    const el = document.createElement('div');
    el.className = 'floater' + (r.e === 'GG' ? ' gg' : '');
    el.style.left = (15 + Math.random() * 60) + '%';
    el.innerHTML = `<span class="fe">${esc(r.e)}</span><span class="fn team-${r.from === 's' ? 'x' : r.from}">${esc(who)}</span>`;
    $('#floaters').appendChild(el);
    setTimeout(() => el.remove(), 2600);
    if (window.Sfx) Sfx.play('pick', 0.3);
  });

  // ---------- rendering ----------
  function render() {
    if (!S) return;
    $('#home').hidden = true; $('#scal').hidden = true; $('#game').hidden = false;
    renderReactBar(); renderTop(); renderStatus(); renderBoard(); renderPanel(); popEvent(); renderEnd();
  }

  function renderTop() {
    const o = opp();
    const lv = S.puzzle ? (isDaily() ? '📅 Puzzle del giorno' : isLesson() ? `📘 Lezione ${puzPool().findIndex((p) => p.id === S.puzzle.id) + 1}/${puzPool().length}` : `🧩 Puzzle ${puzPool().findIndex((p) => p.id === S.puzzle.id) + 1}/${puzPool().length}`) : S.surv ? `🌊 Ondata ${S.phase === 'prep' ? S.surv.wave + 1 : S.surv.wave}` : S.run && S.bot ? Scalata.STAGES[S.run.stage - 1].name : S.bot ? 'Bot ' + ({ easy: 'facile', normal: 'normale', hard: 'difficile', master: 'maestro' }[S.bot.level] || S.bot.level) : '';
    const oppPill = S.local ? '<span class="pill">Locale · stesso dispositivo</span>'
      : `<span class="pill" title="Avversario"><span class="dot ${S.bot || S.connected[o] ? 'on' : ''}"></span>${S.bot ? lv : S.phase === 'lobby' ? 'In attesa…' : `${S.names && S.names[o] ? esc(S.names[o]) : 'Avversario'} ${S.connected[o] ? 'online' : 'offline'}`}</span>`;
    const nm = (col) => (S.names && S.names[col]) ? ' · ' + esc(S.names[col]) : '';
    const modPill = S.lucky && !S.surv ? `<span class="pill" title="Modificatore attivo: caselle fortunate (${Sh.LUCKY_VIS[S.lucky.vis].toLowerCase()})">✨ ${S.lucky.vis === 'hidden' ? 'Nascosta' : 'Fortunate'}</span>` : '';
    const survPill = S.surv ? `<span class="pill" title="Nemici rimasti">⚔️ ${S.phase === 'prep' ? '' : S.surv.enemies + ' nemici · '}superate ${S.surv.cleared}</span>` : '';
    const runPill = S.run ? `<span class="pill" title="Scalata">🏆 Scontro ${S.run.stage}/${Scalata.STAGE_COUNT}</span>` : '';
    const modPill2 = S.mods && S.mods.randomTypes ? '<span class="pill" title="Modificatore attivo: tipi a caso, senza draft">🎲 Tipi a caso</span>' : '';
    const hc = S.mods && S.mods.handicap;
    const hcPill = hc ? `<span class="pill" title="Handicap ${Sh.HANDICAP_LABEL[hc.level].toLowerCase()} per ${hc.color === S.you ? 'te' : 'il computer'}">⚖️ ${hc.color === S.you ? 'Tu' : 'PC'}: ${Sh.HANDICAP_LABEL[hc.level]}</span>` : '';
    const eyes = S.spectators ? `<span class="pill" title="Spettatori">👁 ${S.spectators}</span>` : '';
    if (S.spectator) {
      $('#topbar').innerHTML = `
      <button class="pill" id="btnHome" type="button" title="Torna alla home" aria-label="Torna alla home">← Home</button>
      <h1><span class="tb-ele">Ele</span><span class="tb-mate">Mate</span></h1>
      <span class="pill">👁 Spettatore</span>
      <span class="pill"><span class="dot ${S.connected.w ? 'on' : ''}"></span>Blu${nm('w')}</span><span class="pill"><span class="dot ${S.connected.b ? 'on' : ''}"></span>Rosso${nm('b')}</span>
      ${survPill}${modPill}${modPill2}${hcPill}${eyes}
      <span class="spacer"></span>
      <button class="pill" id="btnSound" type="button" title="Suoni" aria-label="Suoni">${window.Sfx && Sfx.isMuted() ? '🔇' : '🔊'}</button>
      <button class="pill" id="btnTypes" type="button">Tipi</button>
      <button class="pill" id="btnRules2" type="button">Regole</button>`;
      return;
    }
    $('#topbar').innerHTML = `
      <button class="pill" id="btnHome" type="button" title="Torna alla home" aria-label="Torna alla home">← Home</button>
      <h1><span class="tb-ele">Ele</span><span class="tb-mate">Mate</span></h1>
      ${S.sandbox && ui.sb.mode === 'edit' ? '' : `<span class="pill team-${S.you}"><span class="tdot"></span>${S.local ? 'Gioca il ' : 'Sei '}${teamName(S.you)}${S.local ? '' : nm(S.you)}</span>`}
      ${S.sandbox ? '<span class="pill">🧪 Campo di prova</span>' : oppPill}${runPill}${survPill}${modPill}${modPill2}${hcPill}${eyes}
      ${S.bot || S.local ? '' : `<button class="pill" id="btnCopy" type="button" title="Copia il link da mandare all'amico">Stanza ${S.code} · copia link</button>`}
      <span class="spacer"></span>
      <button class="pill" id="btnSound" type="button" title="Suoni" aria-label="Suoni">${window.Sfx && Sfx.isMuted() ? '🔇' : '🔊'}</button>
      <button class="pill" id="btnTypes" type="button">Tipi</button>
      <button class="pill" id="btnRules2" type="button">Regole</button>`;
  }

  function renderStatus() {
    let main = '', sub = '', dot = S.turn, alertBadge = false;
    if (S.phase === 'lobby') { main = 'In attesa dell\'avversario'; sub = 'Manda il link o il codice ' + S.code; dot = null; }
    else if (S.phase === 'draft') {
      const again = S.picks + 1 < Sh.DRAFT_PICKS && Sh.draftTurn(S.picks + 1) === S.turn;
      main = S.local ? `Tocca al ${teamName(S.you)}: assegna un tipo` : S.turn === S.you ? 'Tocca a te: assegna un tipo' : S.bot ? 'Il bot sta scegliendo…' : `Sta scegliendo il ${teamName(S.turn)}`;
      sub = `Draft dei tipi ${S.picks}/${Sh.DRAFT_PICKS}` + (again ? ' · sceglie due volte di fila' : '');
    } else if (S.phase === 'items') {
      main = S.local ? `Tocca al ${teamName(S.you)}: scegli 3 strumenti` : `Scegli i tuoi ${S.kit.picks} strumenti`; sub = S.local ? 'Passate il dispositivo: l\'altro non deve guardare' : 'Poi si parte'; dot = null;
    } else if (S.phase === 'prep') {
      main = `Ondata ${S.surv.wave + 1}: sistema la squadra`; sub = 'Prime 3 file, poi premi Via'; dot = 'w';
    } else if (S.phase === 'play') {
      const chk = !!(S.check && S.check[S.turn]);
      if (S.pendingBy) main = S.pendingBy === S.you ? 'Scegli la promozione del pedone' : `Il ${teamName(S.pendingBy)} sta promuovendo`;
      else if (chk && S.turn === S.you) { main = 'Sei sotto scacco!'; sub = 'Proteggi il Re: spostalo, para o elimina chi lo minaccia'; }
      else if (chk) { main = `Scacco al Re ${teamName(S.turn)}`; sub = `Turno del ${teamName(S.turn)}`; }
      else main = S.local ? `Tocca al ${teamName(S.you)}` : S.turn === S.you ? 'Tocca a te' : S.bot ? 'Il bot sta pensando…' : `Turno del ${teamName(S.turn)}`;
      if (S.puzzle && !sub && isLesson()) sub = puzDef().text;
      else if (S.puzzle && !sub) sub = `${Puzzles.goalText(puzDef())} · mosse rimaste: ${S.puzzle.moves - S.puzzle.used}`;
      if (S.turn === S.you && S.shieldLock) sub = 'Scudo messo: ora muovi un altro pezzo (quello con lo Scudo no)';
      else if (S.turn === S.you && S.freeUsed) sub = 'Azione gratuita usata: ora muovi un pezzo';
      if (chk) alertBadge = true;
    } else if (S.phase === 'over') {
      if (S.puzzle) main = S.puzzle.state === 'solved' ? (isLesson() ? 'Lezione superata!' : 'Puzzle risolto!') : (isLesson() ? 'Non è questa: riprova' : 'Puzzle non risolto');
      else if (S.winner === null) { main = 'Patta'; dot = null; }
      else main = S.winner === S.you ? 'Hai vinto!' : 'Hai perso';
      sub = S.reason || ''; if (S.winner) dot = S.winner;
    }
    if (S.sandbox && ui.sb.mode === 'edit') { main = '🧪 Modifica la posizione'; sub = ui.sb.moving ? 'Tocca la casella di destinazione' : 'Tocca una casella: aggiungi o cambia un pezzo'; dot = null; }
    else if (S.sandbox && S.phase === 'over') { main = S.winner ? 'Vince il ' + teamName(S.winner) : 'Patta'; sub = S.reason || ''; dot = S.winner || null; }
    if (S.spectator) {
      sub = '';
      if (S.phase === 'lobby') { main = 'In attesa dei giocatori'; dot = null; }
      else if (S.phase === 'draft') { main = `Draft: sceglie il ${teamName(S.turn)}`; sub = `${S.picks}/${Sh.DRAFT_PICKS}`; }
      else if (S.phase === 'items') { main = 'I giocatori scelgono gli strumenti'; dot = null; }
      else if (S.phase === 'play') {
        const chk = !!(S.check && S.check[S.turn]);
        main = S.pendingBy ? `Il ${teamName(S.pendingBy)} sta promuovendo` : chk ? `Scacco al Re ${teamName(S.turn)}` : `Turno del ${teamName(S.turn)}`;
        alertBadge = chk;
      } else { main = S.winner === null ? 'Patta' : 'Vince il ' + teamName(S.winner); sub = S.reason || ''; if (!S.winner) dot = null; }
    }
    const st = $('#status');
    st.className = dot ? 'team-' + dot : '';
    const endBtns = S.sandbox ? (S.phase === 'over' && ui.sb.mode !== 'edit' ? '<span class="endbtns"><button class="btn sm primary" type="button" data-act="undo">↶ Annulla</button><button class="btn sm" type="button" data-act="sbEdit">Modifica</button></span>' : '') : S.spectator || S.surv || S.puzzle ? '' : S.phase === 'over' ? '<span class="endbtns"><button class="btn sm primary" type="button" data-act="rematch">Rivincita</button><button class="btn sm" type="button" data-act="home">Home</button></span>' : '';
    st.innerHTML = `${dot ? `<span class="tdot team-${dot}"></span>` : ''}${alertBadge ? '<span class="badge-check">SCACCO</span>' : ''}<span class="main">${main}</span><span class="sub">${esc(sub)}</span>${endBtns}`;
  }

  function renderBoard() {
    const h = computeHl();
    const fl = flipped();
    let html = '';
    for (let dr = 0; dr < 8; dr++) {
      for (let dc = 0; dc < 8; dc++) {
        const r = fl ? 7 - dr : dr, c = fl ? 7 - dc : dc;
        const key = r + ',' + c;
        const p = pieceAt(r, c);
        const cls = ['sq', (r + c) % 2 ? 'dk' : ''];
        if (h.last[key]) cls.push('last');
        if (p && p.role === 're' && S.check && S.check[p.color]) cls.push('chk');
        if (h.sel && p && p.id === h.sel) cls.push('sel');
        if (h.move[key]) cls.push('mv', 'clickable');
        if (h.atk[key]) cls.push('at', 'clickable');
        if (h.pick[key]) cls.push('pick', 'clickable');
        if (S.sandbox && ui.sb.mode === 'edit') cls.push('clickable');
        if (S.sandbox && ui.sb.mode === 'edit' && ui.sb.sq && ui.sb.sq[0] === r && ui.sb.sq[1] === c) cls.push('pick');
        const lk = S.lucky && S.lucky.sq && S.lucky.sq.r === r && S.lucky.sq.c === c ? S.lucky.sq : null;
        if (lk) cls.push('lucky');
        if (S.puzzle && S.puzzle.goal.target && p && p.id === S.puzzle.goal.target) cls.push('target');
        if (p && p.color === S.you && (S.phase === 'draft' || S.phase === 'prep' || S.legal[p.id])) cls.push('clickable');
        let inner = '';
        if (dc === 0) inner += `<span class="coord rk">${8 - r}</span>`;
        if (dr === 7) inner += `<span class="coord f">${'abcdefgh'[c]}</span>`;
        if (lk) inner += `<span class="lk" title="Casella fortunata">${lk.bonus ? Sh.luckyInfo(lk.bonus).icon : '✨'}</span>`;
        if (p) {
          const pc = ['pc', 'team-' + p.color];
          if (p.shield) pc.push('shield');
          if (p.boost) pc.push('boost');
          if (p.frozen) pc.push('frozen');
          if (S.shieldLock === p.id) pc.push('lock');
          if (p.rage) pc.push('rage');
          if (p.guard) pc.push('guard');
          let hp = '';
          if (p.maxHp) {
            const pct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
            hp = `<div class="hp"><i class="${pct <= 30 ? 'low' : pct <= 60 ? 'mid' : ''}" style="width:${pct}%"></i></div><span class="hpn">${p.hp}</span>`;
          }
          inner += `<div class="${pc.join(' ')}"><img src="${pieceSprite(p)}" alt="${esc(pieceName(p))} ${teamName(p.color)}" draggable="false">${hp}${p.rage ? '<i class="bf">🔥</i>' : p.guard ? '<i class="bf">🧱</i>' : ''}</div>`;
        }
        const a = h.atk[key];
        if (a) {
          let label, k = '';
          if (a.king) label = a.shield ? 'Scudo' : 'RE!';
          else if (a.shield) { label = 'Scudo'; k = 'sh'; }
          else if (a.ko) { label = 'KO'; k = 'kill'; }
          else { label = '−' + a.dmg; if (a.kill) k = 'kill'; else if (a.eff > 1) k = 'super'; else if (a.eff < 1) k = 'weak'; }
          inner += `<span class="dmg ${k}">${label}</span>`;
        }
        html += `<div class="${cls.join(' ')}" data-r="${r}" data-c="${c}">${inner}</div>`;
      }
    }
    $('#board').innerHTML = html;
  }

  function popEvent() {
    const ev = S.event;
    if (!ev) return;
    if (ui.seq === null) { ui.seq = ev.seq; return; }
    if (ev.seq === ui.seq) return;
    ui.seq = ev.seq;
    const cell = $(`#board .sq[data-r="${ev.r}"][data-c="${ev.c}"]`);
    if (!cell) return;
    const el = document.createElement('div');
    el.className = 'pop ' + ev.kind;
    el.textContent = ev.text;
    cell.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ---------- campo di prova ----------
  const sbData = (o) => `data-act="sb" data-sb="${esc(JSON.stringify(o))}"`;
  const sqLabel = (r, c) => 'abcdefgh'[c] + (8 - r);
  const ROLE_ORDER = ['pedone', 'cavallo', 'alfiere', 'torre', 'regina', 're'];
  function sbTabs() {
    const m = ui.sb.mode;
    return `<div class="row sbtabs"><button class="btn ${m === 'edit' ? 'primary' : ''}" type="button" data-act="sbTab" data-mode="edit">✏️ Modifica</button><button class="btn ${m === 'play' ? 'primary' : ''}" type="button" data-act="sbTab" data-mode="play">▶ Prova</button><button class="btn" type="button" data-act="undo" ${S.canUndo ? '' : 'disabled'}>↶ Annulla</button></div>`;
  }
  const typeChips = (cur, mk) => '<div class="sbrow">' + [null].concat(Sh.TYPES).map((t) => `<button class="sbc ${cur === t ? 'on' : ''}" type="button" ${mk(t)} title="${t ? Sh.TYPE_LABEL[t] : 'Nessun tipo'}">${t ? `<img src="${typeIcon(t)}" alt="">${Sh.TYPE_LABEL[t]}` : 'Nessuno'}</button>`).join('') + '</div>';
  const colorBtns = (cur, mk) => '<div class="sbrow">' + ['w', 'b'].map((col) => `<button class="sbc ${cur === col ? 'on' : ''}" type="button" ${mk(col)}><span class="tdot team-${col}"></span>${teamName(col)}</button>`).join('') + '</div>';
  function sbEditor() {
    const A = ui.sb.add, sq = ui.sb.sq;
    const p = sq ? pieceAt(sq[0], sq[1]) : null;
    let html = '';
    if (ui.sb.moving) {
      html += '<div class="box"><h3>Sposta il pezzo</h3><p>Tocca la casella di destinazione.</p><div class="row"><button class="btn sm" type="button" data-act="sbCancelMove">Annulla</button></div></div>';
    } else if (!sq) {
      html += '<div class="box"><h3>Campo di prova</h3><p class="mute">Tocca una casella della scacchiera per aggiungere o modificare un pezzo. Poi premi “▶ Prova” per giocare la posizione, per entrambi i lati, da questo dispositivo.</p></div>';
    } else if (!p) {
      const roles = ROLE_ORDER.map((role) => `<button class="sbc ${A.role === role ? 'on' : ''}" type="button" data-act="sbAdd" data-k="role" data-v="${role}" title="${Sh.ROLES[role].label}"><img src="${pieceSprite({ role, type: role === 're' ? null : A.type })}" alt="${Sh.ROLES[role].label}"></button>`).join('');
      html += `<div class="box"><h3>Aggiungi in ${sqLabel(sq[0], sq[1])}</h3>
        ${colorBtns(A.color, (col) => `data-act="sbAdd" data-k="color" data-v="${col}"`)}
        <div class="sbrow sbroles">${roles}</div>
        ${A.role === 're' ? '<p class="mute">Il Re è uno solo per squadra: si sposta qui.</p>' : typeChips(A.type, (t) => `data-act="sbAdd" data-k="type" data-v="${t || ''}"`)}
        <div class="row" style="margin-top:10px"><button class="btn primary" type="button" data-act="sbPut">Aggiungi ${Sh.ROLES[A.role].label} ${teamName(A.color)}</button></div></div>`;
    } else {
      const set = (field, value) => sbData({ op: 'set', id: p.id, field, value });
      const king = p.role === 're';
      let body = '';
      if (!king) {
        body += `<div class="sbstat"><span>HP</span><button class="sbc" type="button" ${set('hp', Math.max(1, p.hp - 1))}>−</button><b>${p.hp} / ${p.maxHp}</b><button class="sbc" type="button" ${set('hp', Math.min(p.maxHp, p.hp + 1))}>+</button></div>
          <div class="sbstat"><span>HP max</span><button class="sbc" type="button" ${set('maxHp', Math.max(1, p.maxHp - 1))}>−</button><b>${p.maxHp}</b><button class="sbc" type="button" ${set('maxHp', Math.min(40, p.maxHp + 1))}>+</button></div>
          <p class="mute" style="margin:8px 0 4px">Tipo</p>${typeChips(p.type, (t) => set('type', t))}
          <p class="mute" style="margin:8px 0 4px">Pezzo</p><div class="sbrow sbroles">${ROLE_ORDER.filter((r) => r !== 're').map((role) => `<button class="sbc ${p.role === role ? 'on' : ''}" type="button" ${set('role', role)} title="${Sh.ROLES[role].label}"><img src="${pieceSprite({ role, type: p.type })}" alt="${Sh.ROLES[role].label}"></button>`).join('')}</div>
          <p class="mute" style="margin:8px 0 4px">Squadra</p>${colorBtns(p.color, (col) => set('color', col))}
          <p class="mute" style="margin:8px 0 4px">Effetti</p><div class="sbrow">
            <button class="sbc ${p.shield ? 'on' : ''}" type="button" ${set('shield', !p.shield)}>🛡️ Scudo</button>
            <button class="sbc ${p.boost ? 'on' : ''}" type="button" ${set('boost', !p.boost)}>🔮 Cristallo</button>
            <button class="sbc ${p.frozen ? 'on' : ''}" type="button" ${set('frozen', !p.frozen)}>⚡ Paralisi</button>
            <button class="sbc ${p.rage ? 'on' : ''}" type="button" ${set('rage', p.rage ? 0 : 3)}>🔥 Rabbia</button>
            <button class="sbc ${p.guard ? 'on' : ''}" type="button" ${set('guard', p.guard ? 0 : 3)}>🧱 Corazza</button></div>`;
      } else body += '<p class="mute">Il Re non ha tipo né HP: elimina in un colpo qualsiasi pezzo.</p>';
      html += `<div class="box info"><div class="big team-${p.color}"><img src="${pieceSprite(p)}" alt=""></div><div style="flex:1;min-width:0"><h3>${esc(pieceName(p))} in ${sqLabel(p.r, p.c)}</h3>${body}
        <div class="row" style="margin-top:10px"><button class="btn sm" type="button" data-act="sbMove" data-id="${p.id}">Sposta</button>
        ${king ? '' : `<button class="btn sm" type="button" ${sbData({ op: 'kill', r: p.r, c: p.c })}>Sconfiggi</button>`}
        ${king ? '' : `<button class="btn sm" type="button" ${sbData({ op: 'remove', r: p.r, c: p.c })}>Togli</button>`}</div></div></div>`;
    }
    // strumenti, turno, posizioni
    const kit = (col) => `<div style="margin-bottom:6px"><b>${teamName(col)}</b><div class="sbrow">${Sh.ITEM_IDS.map((i) => {
      const has = (S.items[col] || []).includes(i);
      const list = has ? S.items[col].filter((x) => x !== i) : (S.items[col] || []).concat(i);
      return `<button class="sbc ${has ? 'on' : ''}" type="button" ${sbData({ op: 'items', color: col, list })} title="${Sh.ITEMS[i].label}">${Sh.ITEMS[i].icon} ${Sh.ITEMS[i].label}</button>`;
    }).join('')}</div></div>`;
    html += `<div class="box"><h3>Strumenti</h3>${kit('w')}${kit('b')}</div>
      <div class="box"><h3>Tocca a</h3>${colorBtns(S.turn, (col) => sbData({ op: 'turn', color: col }))}
        <h3 style="margin-top:12px">Posizione</h3><div class="row">
        <button class="btn sm" type="button" ${sbData({ op: 'reset', preset: 'start' })}>Posizione iniziale</button>
        <button class="btn sm" type="button" ${sbData({ op: 'reset', preset: 'empty' })}>Scacchiera vuota</button></div></div>`;
    return html;
  }

  // ---------- pannello laterale ----------
  function renderPanel() {
    let html = '';
    if (S.sandbox) {
      html += sbTabs();
      if (ui.sb.mode === 'edit') html += sbEditor();
      else html += playPanel() + infoPanel();
      html += logPanel();
      $('#panel').innerHTML = html;
      return;
    }
    if (S.spectator) {
      html += `<div class="box"><h3>Stai guardando</h3><p class="mute">Segui la partita in diretta: non puoi muovere. Clicca un pezzo per vederne le statistiche.</p>${spectatorItems()}</div>`;
      if (S.phase !== 'lobby') html += infoPanel();
      html += logPanel();
      $('#panel').innerHTML = html;
      return;
    }
    if (S.phase === 'lobby') html += lobbyPanel();
    else if (S.phase === 'draft') html += draftPanel();
    else if (S.phase === 'items') html += itemsPanel();
    else if (S.phase === 'prep') html += prepPanel() + playPanel();
    else html += (S.puzzle ? puzzleBox() : '') + playPanel();
    if (S.phase !== 'lobby' && S.phase !== 'items') html += infoPanel();
    html += logPanel();
    $('#panel').innerHTML = html;
  }

  function spectatorItems() {
    if (S.phase !== 'play' && S.phase !== 'over' && S.phase !== 'prep') return '';
    const row = (c) => {
      const list = S.items[c] || [];
      const n = Sh.ITEM_IDS.map((i) => ({ i, n: list.filter((x) => x === i).length })).filter((x) => x.n);
      return `<p style="margin-top:6px"><b>${teamName(c)}:</b> ${n.length ? n.map((x) => `${Sh.ITEMS[x.i].icon} ${Sh.ITEMS[x.i].label}${x.n > 1 ? ' ×' + x.n : ''}`).join(', ') : 'nessuno strumento'}</p>`;
    };
    return row('w') + row('b');
  }

  function lobbyPanel() {
    const link = location.origin + location.pathname + '?stanza=' + S.code;
    return `<div class="box"><h3>Invita un amico</h3>
      <p>Codice stanza: <b style="font-size:24px;letter-spacing:.2em">${S.code}</b></p>
      <p class="mute" style="word-break:break-all">${esc(link)}</p>
      <div class="row"><button class="btn primary" data-act="copy" type="button">Copia link</button></div>
      <p class="mute">${S.mods && S.mods.randomTypes ? 'Appena entra, i tipi vengono assegnati a caso.' : 'Appena entra, comincia il draft dei tipi.'}</p></div>`;
  }

  function draftPanel() {
    const mine = S.pieces.filter((p) => p.color === S.you && p.role !== 're');
    const left = mine.filter((p) => !p.type).length;
    const used = S.counts[S.you];
    const turn = S.turn === S.you;
    const sel = ui.draftPiece ? byId(ui.draftPiece) : null;
    let intro;
    if (!turn) intro = `<p>Aspetta: sta scegliendo il ${teamName(S.turn)}.</p>`;
    else if (!sel) intro = '<p><b>Tocca a te.</b> Clicca uno dei tuoi pezzi grigi sulla scacchiera, poi scegli il suo tipo.</p>';
    else intro = `<p><b>${Sh.ROLES[sel.role].label}</b> selezionato: scegli il tipo.</p>`;
    const buttons = Sh.TYPES.map((t) => {
      const n = used[t];
      const dis = !turn || !sel || n >= Sh.MAX_PER_TYPE;
      return `<button class="tbtn" style="--c:var(--c-${t})" type="button" data-act="type" data-type="${t}" ${dis ? 'disabled' : ''}><img src="${typeIcon(t)}" alt="">${Sh.TYPE_LABEL[t]}<small>${Sh.MAX_PER_TYPE - n} rimasti</small></button>`;
    }).join('');
    return `<div class="box"><h3>Draft dei tipi</h3>
      <div class="progress"><i style="width:${(S.picks / (S.surv ? 15 : 30)) * 100}%"></i></div>
      ${intro}
      <div class="typegrid">${buttons}</div>
      <p class="mute">Pezzi senza tipo: ${left}. Ogni tipo si può usare al massimo ${Sh.MAX_PER_TYPE} volte. Il Re resta incolore.</p></div>`;
  }

  // scelte dei bonus della Scalata (Veterano, Sarto, Vivaio) fatte insieme al kit
  const sqName = (p) => 'abcdefgh'[p.c] + (8 - p.r);
  const pieceLabel = (p) => `${Sh.ROLES[p.role].label}${p.type ? ' ' + Sh.TYPE_LABEL[p.type] : ''} (${sqName(p)})`;
  function choiceDone() {
    if (!S.run) return true;
    return S.run.choices.every(({ id }) => id === 'sarto' ? ui.rc.sarto && ui.rc.sarto.id && ui.rc.sarto.type : !!ui.rc[id]);
  }
  function choiceBox() {
    if (!S.run || !S.run.choices.length) return '';
    const mine = S.pieces.filter((p) => p.alive && p.color === S.you && p.role !== 're');
    const pieceSel = (key, list, val) => `<select data-rc="${key}"><option value="">— scegli un pezzo —</option>${list.map((p) => `<option value="${p.id}" ${val === p.id ? 'selected' : ''}>${esc(pieceLabel(p))}</option>`).join('')}</select>`;
    const rows = S.run.choices.map(({ id, kind }) => {
      const B = Scalata.BONUSES[id];
      let ctl;
      if (kind === 'type') {
        const cur = ui.rc.sarto || {};
        ctl = pieceSel('sarto-id', mine, cur.id) + `<select data-rc="sarto-type"><option value="">— nuovo tipo —</option>${Sh.TYPES.map((t) => `<option value="${t}" ${cur.type === t ? 'selected' : ''}>${Sh.TYPE_LABEL[t]}</option>`).join('')}</select>`;
      } else ctl = pieceSel(id, kind === 'pawn' ? mine.filter((p) => p.role === 'pedone') : mine, ui.rc[id]);
      return `<div class="sc-choice"><b>${B.icon} ${B.label}</b><span>${B.desc}</span>${ctl}</div>`;
    }).join('');
    return `<div class="box"><h3>Scelte dei bonus</h3>${rows}</div>`;
  }
  const capOf = (i) => Sh.itemMax(i) + (S.kit ? S.kit.extraCap : 0);
  function itemsPanel() {
    if (S.itemsReady[S.you]) {
      return `<div class="box"><h3>Strumenti scelti</h3><p>Attendo che ${teamName(opp())} finisca di scegliere…</p>
        <div class="chips">${S.items[S.you].map((i) => `<span class="chip" style="padding-left:8px">${Sh.ITEMS[i].label}</span>`).join('')}</div></div>`;
    }
    const N = S.kit.picks;
    if (N === 0) return `<div class="box"><h3>Nessuno strumento</h3><p>Per l'handicap parti senza strumenti.</p><div class="row"><button class="btn primary" type="button" data-act="confirmItems">Conferma</button></div></div>`;
    const slots = Array.from({ length: N }, (_, i) => {
      const it = ui.picks[i];
      return `<button class="slot ${it ? 'full' : ''}" type="button" data-act="unpick" data-i="${i}">${it ? Sh.ITEMS[it].icon + ' ' + Sh.ITEMS[it].label : 'Vuoto'}</button>`;
    }).join('');
    const cards = Sh.ITEM_IDS.map((i) => {
      const n = ui.picks.filter((x) => x === i).length;
      return `<button class="icard ${n ? 'on' : ''}" type="button" data-act="pick" data-item="${i}" ${ui.picks.length >= N || n >= capOf(i) ? 'disabled' : ''}>
        <div><b>${Sh.ITEMS[i].icon} ${Sh.ITEMS[i].label}</b>${capOf(i) < N ? ` <small class="mute">(max ${capOf(i)})</small>` : ''}<span>${Sh.ITEMS[i].desc}</span></div>${n ? `<span class="n">×${n}</span>` : ''}</button>`;
    }).join('');
    const forced = S.kit.forced.length ? `<p class="mute">In più ricevi: ${S.kit.forced.map((i) => Sh.ITEMS[i].icon + ' ' + Sh.ITEMS[i].label).join(', ')}.</p>` : '';
    return `${choiceBox()}<div class="box"><h3>Scegli ${N} strument${N === 1 ? 'o' : 'i'}</h3>
      <p class="mute">Puoi prendere lo stesso strumento più volte, salvo i limiti indicati. Usarne uno costa il turno. Clicca uno slot per toglierlo.</p>${forced}
      <div class="slots">${slots}</div>
      <div class="itemgrid">${cards}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" data-act="confirmItems" ${ui.picks.length === N && choiceDone() ? '' : 'disabled'}>Conferma</button></div></div>`;
  }

  // Sopravvivenza: record personale (nel browser), fine ondata e fine corsa
  const survBest = () => { try { return +store('sm_survbest') || 0; } catch (e) { return 0; } };
  // Puzzle: pannello, fine e azioni
  const PUZ_ACTS = ['puzRetry', 'puzNext', 'puzList', 'puzHint', 'puzShare'];
  const puzDef = () => S && S.puzzle ? Puzzles.byId(S.puzzle.id) : null;
  const isDaily = () => !!(S && S.puzzle && /^d\d+$/.test(S.puzzle.id));
  const isLesson = () => { const d = puzDef(); return !!(d && d.ch); };
  const puzPool = () => (isLesson() ? Puzzles.TUTORIAL : isDaily() ? Puzzles.DAILY : Puzzles.LIST);
  function puzzleBox() {
    const d = puzDef(), pz = S.puzzle; if (!d) return '';
    const left = pz.moves - pz.used;
    if (d.ch) return `<div class="box"><h3>📘 ${esc(d.title)}</h3><p>${esc(d.text)}</p><p class="mute"><b>${esc(Puzzles.goalText(d))}</b></p>${pz.state === 'play' ? '<div class="row"><button class="btn sm" type="button" data-act="puzRetry">↻ Ricomincia</button></div>' : ''}</div>`;
    return `<div class="box"><h3>${isDaily() ? '📅' : '🧩'} ${esc(d.title)}</h3><p><b>${esc(Puzzles.goalText(d))}</b>${pz.state === 'play' ? ` · mosse rimaste: <b>${left}</b>` : ''}</p>
      ${d.text ? `<p class="mute">${esc(d.text)}</p>` : ''}
      ${ui.showHint && d.hint ? `<p>💡 ${esc(d.hint)}</p>` : ''}
      ${pz.state === 'play' ? `<div class="row"><button class="btn sm" type="button" data-act="puzHint">${ui.showHint ? 'Nascondi' : '💡 Suggerimento'}</button><button class="btn sm" type="button" data-act="puzRetry">↻ Riprova</button></div>` : ''}</div>`;
  }
  function puzActions() {
    const pz = S.puzzle, idx = puzPool().findIndex((p) => p.id === pz.id), next = puzPool()[idx + 1];
    if (isDaily()) return pz.state === 'solved' ? '<div class="row"><button class="btn primary" type="button" data-act="puzShare">📋 Copia risultato</button><button class="btn" type="button" data-act="puzList">Avventure</button></div>' : '<div class="row"><button class="btn primary" type="button" data-act="puzRetry">Riprova</button><button class="btn" type="button" data-act="puzList">Avventure</button></div>';
    if (pz.state === 'solved') return `<div class="row">${next ? `<button class="btn primary" type="button" data-act="puzNext">${isLesson() ? 'Prossima lezione' : 'Prossimo puzzle'}</button>` : ''}<button class="btn" type="button" data-act="puzRetry">Rifallo</button><button class="btn" type="button" data-act="puzList">Elenco</button></div>`;
    return '<div class="row"><button class="btn primary" type="button" data-act="puzRetry">Riprova</button><button class="btn" type="button" data-act="puzList">Elenco</button></div>';
  }
  function puzMarkDone() {
    if (S.puzzle.state !== 'solved') return;
    if (isDaily()) { const dd = dailyData(), k = localDate(); if (!dd.done[k]) { dd.done[k] = dd.tries[k] || 1; dailySave(dd); } return; }
    const d = isLesson() ? tutDone() : puzDone(); if (!d.includes(S.puzzle.id)) { d.push(S.puzzle.id); try { store(isLesson() ? 'sm_tut' : 'sm_puz', JSON.stringify(d)); } catch (e) { /* ignora */ } }
  }
  function puzMsg() { if (isDaily() && S.puzzle.state === 'solved') { const n = dailyData().done[localDate()] || 1, st = dailyStreak(); return `Risolto in ${n} ${n === 1 ? 'tentativo' : 'tentativi'} · serie ${st} ${st === 1 ? 'giorno' : 'giorni'}`; } const d = puzDef(); if (d && d.ch) return (S.puzzle.state === 'solved' ? d.ok : d.ko) || ''; return S.reason || ''; }
  function puzBanner() {
    puzMarkDone();
    const ok = S.puzzle.state === 'solved';
    return `<div class="banner ${ok ? 'win' : 'lose'}">${ok ? (isLesson() ? 'Bravo!' : 'Risolto!') : (isLesson() ? 'Riprova' : 'Non risolto')}<br><span style="font-weight:600">${esc(puzMsg())}</span></div>${puzActions()}`;
  }
  function renderPuzEnd(el) {
    puzMarkDone();
    const ok = S.puzzle.state === 'solved';
    el.innerHTML = `<div class="endbox ${ok ? 'win' : 'lose'}"><canvas id="confetti"></canvas>
      <div class="end-ico">${ok ? '🧩' : '💭'}</div>
      <h2 class="end-title">${ok ? (isLesson() ? 'Bravo!' : 'Risolto!') : (isLesson() ? 'Non è questa' : 'Non risolto')}</h2>
      <p class="end-reason">${esc(puzMsg())}</p>
      <div class="end-actions">${puzActions()}<button class="link" type="button" data-act="review">Guarda la scacchiera</button></div></div>`;
    el.hidden = false;
    if (ok) confetti();
  }
  function puzAct(a) {
    if (a === 'puzHint') { ui.showHint = !ui.showHint; return render(); }
    if (a === 'puzShare') { const k = localDate(), n = dailyData().done[k] || 1, st = dailyStreak(), dm = k.slice(8) + '/' + k.slice(5, 7); const txt = `EleMate 📅 Puzzle del giorno ${dm}: risolto in ${n} ${n === 1 ? 'tentativo' : 'tentativi'}${st > 1 ? ' · serie ' + st + ' 🔥' : ''}`; (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Risultato copiato!'), () => toast(txt)); return; }
    if (a === 'puzRetry' && isDaily()) { const dd = dailyData(), k = localDate(); if (!dd.done[k]) { dd.tries[k] = (dd.tries[k] || 1) + 1; dailySave(dd); } }
    const id = S.puzzle.id, lesson = isLesson(), daily = isDaily(), pool = puzPool(), idx = pool.findIndex((p) => p.id === id);
    ui.endDismissed = false; ui.showHint = false; $('#endcard').hidden = true;
    socket.emit('leave'); store('sm_room', null);
    if (a === 'puzList') { try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ } if (lesson) ui.panel = 'tut'; else if (daily) ui.panel = 'avv'; return showHome(''); }
    startPuzzle(a === 'puzNext' ? pool[idx + 1].id : id);
  }
  function survAct(a) {
    ui.endDismissed = false; ui.prepSel = null;
    if (a === 'waveNext') socket.emit('wave', {});
    else if (a === 'waveNow') socket.emit('wave', { choice: 'now' });
    else if (a === 'waveKeep') socket.emit('wave', { choice: 'keep' });
    else if (a === 'ready') socket.emit('ready');
    else if (a === 'placeReset') socket.emit('placeReset');
    else if (a === 'survNew') { const r = S.surv.random; $('#endcard').hidden = true; socket.emit('leave'); store('sm_room', null); startSurv($('#survRandom') ? $('#survRandom').checked : r); }
  }
  const SURV_ACTS = ['waveNext', 'waveNow', 'waveKeep', 'ready', 'placeReset', 'survNew'];
  function prepPanel() {
    const sv = S.surv;
    return `<div class="box"><h3>🌊 Ondata ${sv.wave + 1}: sistema la squadra</h3>
      <p>Tocca un tuo pezzo e poi una casella delle <b>prime 3 file</b> (se è occupata dai tuoi pezzi, li scambi). I pedoni non possono stare nella prima fila. I nemici compariranno solo dopo il Via e <b>muovono per primi</b>.</p>
      <div class="row"><button class="btn primary" type="button" data-act="ready">Via!</button><button class="btn" type="button" data-act="placeReset">Posizione iniziale</button></div></div>`;
  }
  function survActions() {
    const sv = S.surv;
    if (sv.state === 'cleared') {
      if (sv.bonusDue) return `<p class="mute">Bonus! Scegli come usarlo:</p><div class="row"><button class="btn primary" type="button" data-act="waveNow">Usalo subito: +${sv.bonusNow} HP ai pezzi feriti</button><button class="btn" type="button" data-act="waveKeep">Tienilo: Cura di squadra (+${sv.bonusKeep} HP a tutti, quando vuoi)</button></div>`;
      return '<div class="row"><button class="btn primary" type="button" data-act="waveNext">Prossima ondata</button></div>';
    }
    return '<div class="row"><button class="btn primary" type="button" data-act="survNew">Nuova corsa</button><button class="btn" type="button" data-act="home">Torna alla home</button></div>';
  }
  function survBanner() {
    const sv = S.surv;
    if (sv.state === 'cleared') return `<div class="banner win">Ondata ${sv.wave} superata!<br><span style="font-weight:600">Ne hai superate ${sv.cleared}. Pezzi persi e HP persi restano così.</span></div>${survActions()}`;
    if (sv.cleared > survBest()) { try { store('sm_survbest', String(sv.cleared)); } catch (e) { /* ignora */ } }
    return `<div class="banner lose">Corsa finita<br><span style="font-weight:600">Ondate superate: ${sv.cleared} · record ${Math.max(sv.cleared, survBest())}</span></div>${survActions()}`;
  }
  function renderSurvEnd(el) {
    const sv = S.surv, cleared = sv.state === 'cleared';
    if (!cleared && sv.cleared > survBest()) { try { store('sm_survbest', String(sv.cleared)); } catch (e) { /* ignora */ } }
    el.innerHTML = `<div class="endbox ${cleared ? 'win' : 'lose'}"><canvas id="confetti"></canvas>
      <div class="end-ico">${cleared ? '🌊' : '💥'}</div>
      <h2 class="end-title">${cleared ? `Ondata ${sv.wave} superata!` : 'Corsa finita'}</h2>
      <p class="end-reason">${cleared ? `Ne hai superate ${sv.cleared}.` : `Ondate superate: ${sv.cleared} · record ${Math.max(sv.cleared, survBest())}`}</p>
      <div class="end-actions">${survActions()}<button class="link" type="button" data-act="review">Guarda la scacchiera</button></div></div>`;
    el.hidden = false;
    if (cleared) confetti();
  }

  function playPanel() {
    let html = '';
    if (S.phase === 'over') {
      const res = S.winner === null ? ['draw', 'Patta'] : S.winner === S.you ? ['win', 'Hai vinto!'] : ['lose', 'Hai perso'];
      if (S.puzzle) html += puzBanner();
      else if (S.surv) html += survBanner();
      else if (S.sandbox) html += `<div class="banner ${res[0]}">${S.winner ? 'Vince il ' + teamName(S.winner) : 'Patta'}<br><span style="font-weight:600">${esc(S.reason || '')}</span></div>`;
      else html += `<div class="banner ${res[0]}">${res[1]}<br><span style="font-weight:600">${esc(S.reason || '')}</span></div>
        <div class="row">${S.run ? '<button class="btn primary" type="button" data-act="scal">Torna alla Scalata</button>' : `<button class="btn primary" type="button" data-act="rematch">Rivincita${S.local ? '' : ' (colori scambiati)'}</button><button class="btn" type="button" data-act="home">Torna alla home</button>`}${(S.bot || S.local) && S.canUndo ? '<button class="btn" type="button" data-act="undo">↶ Annulla mossa</button>' : ''}</div>`;
    }
    if (S.pending) {
      const p = byId(S.pending.id);
      const opts = ['regina', 'torre', 'alfiere', 'cavallo'].map((role) => {
        const fake = { role, type: p.type };
        return `<button type="button" data-act="promote" data-role="${role}"><img src="${pieceSprite(fake)}" alt="">${Sh.ROLES[role].label}${role === 'cavallo' ? '<small class="mute">senza Pietra</small>' : '<small class="mute">usa la Pietra</small>'}</button>`;
      }).join('');
      html += `<div class="box"><h3>Promozione!</h3><p>Il tuo pedone è arrivato in fondo. Scegli in cosa trasformarlo.</p><div class="promo">${opts}</div></div>`;
    }
    // strumenti
    const mine = S.items[S.you] || [];
    const theirs = S.items[opp()] || [];
    const group = (list) => Sh.PLAY_ITEMS.map((i) => ({ i, n: list.filter((x) => x === i).length })).filter((x) => x.n);
    let ibox = `<div class="box"><h3>I tuoi strumenti</h3>`;
    if (!mine.length) ibox += '<p class="mute">Li hai finiti tutti.</p>';
    ibox += '<div class="itemgrid">';
    for (const { i, n } of group(mine)) {
      const def = Sh.ITEMS[i];
      const on = ui.item && ui.item.name === i;
      const dis = !def.active || !myTurn() || S.phase !== 'play' || (i === 'revitalizzante' && !S.graveyard[S.you].length) || (def.free && S.freeUsed);
      ibox += `<button class="icard ${on ? 'on' : ''}" type="button" data-act="useItem" data-item="${i}" ${dis ? 'disabled' : ''}>
        <div><b>${def.icon} ${def.label}</b><span>${def.desc}</span></div><span class="n">×${n}</span></button>`;
    }
    ibox += '</div>';
    if (ui.item) ibox += itemPrompt();
    if (!S.surv) ibox += `<p class="mute" style="margin-top:8px">Avversario: ${theirs.length ? group(theirs).map((x) => `${Sh.ITEMS[x.i].label}${x.n > 1 ? ' ×' + x.n : ''}`).join(', ') : 'nessuno strumento'}</p>`;
    ibox += '</div>';
    html += ibox;
    if (S.phase === 'play') {
      if (S.drawOffer && S.drawOffer !== S.you) html += `<div class="box"><h3>Patta?</h3><p>Il ${teamName(S.drawOffer)} propone la patta.</p><div class="row"><button class="btn primary" type="button" data-act="drawYes">Accetta</button><button class="btn" type="button" data-act="drawNo">Rifiuta</button></div></div>`;
      let b = S.sandbox ? '' : '<button class="btn sm" type="button" data-act="resign">Arrenditi</button>';
      if (!S.bot && !S.local) b += S.drawOffer === S.you ? '<button class="btn sm" type="button" disabled>Patta proposta…</button>' : '<button class="btn sm" type="button" data-act="draw">Proponi patta</button>';
      if ((S.bot || S.local) && !S.surv && !S.puzzle) b += `<button class="btn sm" type="button" data-act="undo" ${S.canUndo ? '' : 'disabled'}>↶ Annulla mossa</button>`;
      html += `<div class="row">${b}</div>`;
    }
    return html;
  }

  function itemPrompt() {
    const it = ui.item;
    let msg = '';
    if (it.name === 'pozione') msg = 'Clicca un tuo pezzo ferito.';
    else if (it.name === 'scudo' || it.name === 'cristallo') msg = 'Clicca il tuo pezzo.';
    else if (it.name === 'cambio') msg = it.first ? 'Ora clicca il secondo pezzo.' : 'Clicca il primo pezzo da scambiare.';
    else if (it.name === 'revitalizzante') msg = it.id ? (byId(it.id).role === 'alfiere' ? 'Clicca una casella libera evidenziata (l\'alfiere torna sul suo colore).' : 'Clicca una casella libera evidenziata.') : 'Scegli quale pezzo riportare in campo:';
    else if (it.name === 'paralisi') msg = 'Clicca il pezzo avversario da paralizzare.';
    else if (it.name === 'bomba') msg = 'Clicca il pezzo avversario da bombardare (3 danni).';
    else if (it.name === 'metamorfosi') msg = it.id ? 'Scegli il nuovo tipo:' : 'Clicca il tuo pezzo da trasformare.';
    let html = `<p style="margin-top:8px"><b>${msg}</b></p>`;
    if (it.name === 'metamorfosi' && it.id) {
      const cur = byId(it.id);
      html += '<div class="typegrid">' + Sh.TYPES.filter((t) => t !== cur.type).map((t) => `<button class="tbtn" style="--c:var(--c-${t})" type="button" data-act="metaType" data-type="${t}"><img src="${typeIcon(t)}" alt="">${Sh.TYPE_LABEL[t]}</button>`).join('') + '</div>';
    }
    if (it.name === 'revitalizzante' && !it.id) {
      html += '<div class="grave">' + S.graveyard[S.you].map((id) => {
        const p = byId(id);
        return `<button class="gbtn" type="button" data-act="grave" data-id="${id}" title="${esc(pieceName(p))}"><img src="${pieceSprite(p)}" alt="${esc(pieceName(p))}"></button>`;
      }).join('') + '</div>';
    }
    html += '<button class="btn sm" type="button" data-act="cancelItem">Annulla</button>';
    return html;
  }

  function infoPanel() {
    const p = byId(ui.inspect) || byId(ui.sel);
    if (!p || !p.alive) return `<div class="box"><h3>Pezzo</h3><p class="mute">Clicca un pezzo per vederne le statistiche.</p></div>`;
    let body;
    if (p.role === 're') {
      body = `<dl><dt>Squadra</dt><dd>${teamName(p.color)}</dd><dt>Tipo</dt><dd>Incolore</dd><dt>Attacco</dt><dd>elimina in un colpo</dd><dt>HP</dt><dd>nessuno</dd></dl>
        <p class="mute">Non si può colpire: si perde per scacco matto. Non puoi lasciarlo sotto scacco.</p>`;
    } else {
      const strong = p.type ? Sh.STRONG[p.type] : [];
      const weak = p.type ? Sh.TYPES.filter((t) => Sh.STRONG[t].includes(p.type)) : [];
      const res = p.type ? Sh.RESIST[p.type] : [];
      body = `<dl><dt>Squadra</dt><dd>${teamName(p.color)}</dd><dt>HP</dt><dd>${p.hp} / ${p.maxHp}</dd><dt>Attacco</dt><dd>${p.atk}</dd></dl>
        ${p.type ? `<div><small class="mute">Forte contro (×2)</small><div class="chips">${strong.map(chip).join('')}</div>
        <small class="mute">Debole a (subisce ×2)</small><div class="chips">${weak.map(chip).join('')}</div>
        <small class="mute">Resiste a (×0,5)</small><div class="chips">${res.map(chip).join('')}</div></div>` : '<p class="mute">Tipo non ancora assegnato.</p>'}
        ${p.shield ? '<p><b>Scudo attivo</b>: ignora il prossimo attacco.</p>' : ''}${p.boost ? '<p><b>Cristallo attivo</b>: il prossimo attacco fa ×1,5.</p>' : ''}${p.frozen ? '<p><b>Paralizzato</b>: non può muoversi né attaccare al suo prossimo turno.</p>' : ''}${p.rage ? `<p><b>🔥 Rabbia</b>: +1 danno ancora per ${p.rage} turni.</p>` : ''}${p.guard ? `<p><b>🧱 Corazza</b>: −1 danno subito ancora per ${p.guard} turni.</p>` : ''}`;
    }
    return `<div class="box info"><div class="big team-${p.color}"><img src="${pieceSprite(p)}" alt=""></div><div style="flex:1;min-width:0"><h3>${esc(pieceName(p))}</h3>${body}</div></div>`;
  }

  function logPanel() {
    const lines = S.log.slice(-14).reverse().map((l) => `<div>${esc(l)}</div>`).join('');
    return `<div class="box"><h3>Cronaca</h3><div class="log">${lines || '<div>Nessuna mossa ancora.</div>'}</div></div>`;
  }

  // ---------- interazione ----------
  $('#board').addEventListener('click', (e) => {
    const sq = e.target.closest('.sq');
    if (!sq || !S) return;
    onSquare(+sq.dataset.r, +sq.dataset.c);
  });

  function onSquare(r, c) {
    const p = pieceAt(r, c);
    if (S.sandbox && ui.sb.mode === 'edit') {
      if (ui.sb.moving) { socket.emit('sb', { op: 'move', id: ui.sb.moving, r, c }); ui.sb.moving = null; ui.sb.sq = [r, c]; return render(); }
      ui.sb.sq = [r, c]; ui.inspect = p ? p.id : null;
      return render();
    }
    if (S.phase === 'draft') {
      if (S.turn === S.you && p && p.color === S.you && p.role !== 're' && !p.type) ui.draftPiece = ui.draftPiece === p.id ? null : p.id;
      else ui.inspect = p ? p.id : null;
      return render();
    }
    if (S.phase === 'prep' && S.surv) {
      const sel = ui.prepSel && byId(ui.prepSel);
      if (sel && p && p.id === sel.id) ui.prepSel = null;
      else if (sel && [5, 6, 7].includes(r) && !(sel.role === 'pedone' && r === 7)) { socket.emit('place', { id: sel.id, r, c }); ui.prepSel = null; }
      else if (p && p.color === S.you) ui.prepSel = p.id;
      else ui.prepSel = null;
      ui.inspect = p ? p.id : null;
      return render();
    }
    if (S.phase !== 'play') { ui.inspect = p ? p.id : null; return render(); }
    if (myTurn() && ui.item) return itemClick(p, r, c);
    if (myTurn() && ui.sel) {
      const m = (S.legal[ui.sel] || []).find((x) => x.r === r && x.c === c);
      if (m) { socket.emit('move', { id: ui.sel, r, c }); ui.sel = null; return; }
    }
    if (myTurn() && p && p.color === S.you && S.legal[p.id]) { ui.sel = ui.sel === p.id ? null : p.id; ui.inspect = p.id; }
    else { ui.sel = null; ui.inspect = p ? p.id : null; }
    render();
  }

  function itemClick(p, r, c) {
    const it = ui.item;
    const h = computeHl();
    if (!h.pick[r + ',' + c]) { ui.inspect = p ? p.id : null; return render(); }
    if (it.name === 'revitalizzante') {
      socket.emit('item', { item: 'revitalizzante', id: it.id, r, c }); ui.item = null; return;
    }
    if (it.name === 'cambio') {
      if (!it.first) { it.first = p.id; return render(); }
      socket.emit('item', { item: 'cambio', a: it.first, b: p.id }); ui.item = null; return;
    }
    if (it.name === 'metamorfosi') { it.id = p.id; return render(); } // poi si sceglie il tipo nel pannello
    socket.emit('item', { item: it.name, id: p.id }); ui.item = null;
  }

  $('#panel').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled || !S) return;
    const d = btn.dataset;
    switch (d.act) {
      case 'copy': copyLink(); break;
      case 'type':
        if (ui.draftPiece) { socket.emit('draft', { id: ui.draftPiece, type: d.type }); ui.draftPiece = null; }
        break;
      case 'pick': if (ui.picks.length < S.kit.picks && ui.picks.filter((x) => x === d.item).length < capOf(d.item)) { ui.picks.push(d.item); render(); } break;
      case 'unpick': ui.picks.splice(+d.i, 1); render(); break;
      case 'confirmItems': {
        const choices = {};
        if (S.run) for (const { id } of S.run.choices) choices[id] = id === 'sarto' ? { id: ui.rc.sarto.id, type: ui.rc.sarto.type } : ui.rc[id];
        socket.emit('items', { list: ui.picks, choices });
        break;
      }
      case 'scal': goScal(); break;
      case 'useItem': if (d.item === 'curasq') { socket.emit('item', { item: 'curasq' }); ui.item = null; break; } ui.item = ui.item && ui.item.name === d.item ? null : { name: d.item }; ui.sel = null; render(); break;
      case 'cancelItem': ui.item = null; render(); break;
      case 'grave': ui.item.id = d.id; render(); break;
      case 'metaType': socket.emit('item', { item: 'metamorfosi', id: ui.item.id, type: d.type }); ui.item = null; break;
      case 'promote': socket.emit('promote', { role: d.role }); break;
      case 'resign': if (confirm('Vuoi davvero arrenderti?')) socket.emit('resign'); break;
      case 'rematch': socket.emit('rematch'); break;
      case 'sb': socket.emit('sb', JSON.parse(d.sb)); break;
      case 'sbTab': ui.sb.mode = d.mode; ui.sb.moving = null; render(); break;
      case 'sbAdd': ui.sb.add[d.k] = d.v === '' ? null : d.v; render(); break;
      case 'sbPut': if (ui.sb.sq) socket.emit('sb', { op: 'put', r: ui.sb.sq[0], c: ui.sb.sq[1], color: ui.sb.add.color, role: ui.sb.add.role, type: ui.sb.add.role === 're' ? null : ui.sb.add.type }); break;
      case 'sbMove': ui.sb.moving = d.id; render(); break;
      case 'sbCancelMove': ui.sb.moving = null; render(); break;
      case 'draw': socket.emit('draw'); break;
      case 'drawYes': socket.emit('drawReply', { accept: true }); break;
      case 'drawNo': socket.emit('drawReply', { accept: false }); break;
      case 'undo': socket.emit('undo'); break;
      case 'home': leaveRoom(); break;
      default: if (SURV_ACTS.includes(d.act)) survAct(d.act); else if (PUZ_ACTS.includes(d.act)) puzAct(d.act);
    }
  });

  // ---------- uscita, rivincita e schermata di fine partita ----------
  function leaveRoom() {
    if (S && !S.spectator && S.phase !== 'over' && S.phase !== 'lobby' && !S.bot && !S.local && !confirm('Uscire dalla partita? Conterà come una resa.')) return;
    if (S && !S.spectator && !S.sandbox && (S.bot || S.local) && !S.puzzle && S.phase === 'play' && !confirm('Uscire dalla partita? Verrà persa.')) return;
    socket.emit('leave');
    store('sm_room', null);
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }
    ui.endDismissed = false; $('#endcard').hidden = true;
    showHome('');
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#status [data-act], #endcard [data-act]');
    if (!btn || !S) return;
    const a = btn.dataset.act;
    if (a === 'rematch') { ui.endDismissed = false; socket.emit('rematch'); }
    else if (a === 'home') leaveRoom();
    else if (a === 'scal') goScal();
    else if (SURV_ACTS.includes(a)) survAct(a);
    else if (PUZ_ACTS.includes(a)) puzAct(a);
    else if (a === 'undo') socket.emit('undo');
    else if (a === 'sbEdit') { ui.sb.mode = 'edit'; render(); }
    else if (a === 'review') { ui.endDismissed = true; $('#endcard').hidden = true; }
  });
  let confettiRaf = 0;
  function confetti() {
    const cv = $('#confetti'); if (!cv || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const box = cv.parentElement.getBoundingClientRect(); cv.width = box.width; cv.height = box.height;
    const g = cv.getContext('2d'); const cols = ['#F08A4B', '#4FA3E8', '#6DBF5B', '#F3D03E', '#9ADCF2', '#C97FE3', '#F5A9CB', '#F2B632'];
    const ps = Array.from({ length: 90 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .6, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, vy: 1.6 + Math.random() * 2.4, vx: -1 + Math.random() * 2, r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now(); cancelAnimationFrame(confettiRaf);
    (function frame(t) {
      g.clearRect(0, 0, cv.width, cv.height);
      for (const p of ps) { p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
      if (t - t0 < 4500) confettiRaf = requestAnimationFrame(frame); else g.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  }
  function renderEnd() {
    const el = $('#endcard');
    if (!S || S.phase !== 'over' || S.sandbox) { el.hidden = true; ui.endDismissed = false; return; }
    if (ui.endDismissed || !el.hidden) return;
    if (S.puzzle && !S.spectator) return renderPuzEnd(el);
    if (S.surv && !S.spectator) return renderSurvEnd(el);
    if (S.run && !S.spectator) return renderRunEnd(el);
    const res = S.winner === null ? ['draw', 'Patta'] : S.local || S.spectator ? ['win', 'Vince il ' + teamName(S.winner)] : S.winner === S.you ? ['win', 'Vittoria!'] : ['lose', 'Sconfitta'];
    el.innerHTML = `<div class="endbox ${res[0]}"><canvas id="confetti"></canvas>
      <div class="end-ico">${res[0] === 'win' ? '👑' : res[0] === 'lose' ? '💥' : '🤝'}</div>
      <h2 class="end-title">${res[1]}</h2><p class="end-reason">${esc(S.reason || '')}</p>
      <div class="end-actions">${S.spectator ? '' : `<button class="btn primary" type="button" data-act="rematch">Rivincita${S.local ? '' : ' (colori scambiati)'}</button>`}
      <button class="btn${S.spectator ? ' primary' : ''}" type="button" data-act="home">Torna alla home</button>
      <button class="link" type="button" data-act="review">Guarda la scacchiera</button></div></div>`;
    el.hidden = false;
    if (res[0] === 'win') confetti();
  }

  function copyLink() {
    const link = location.origin + location.pathname + '?stanza=' + roomCode;
    const done = () => toast('Link copiato: mandalo al tuo amico');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => toast(link));
    else toast(link);
  }

  // ---------- finestre ----------
  function typesTable() {
    const rows = Sh.TYPES.map((t) => {
      const weak = Sh.TYPES.filter((x) => Sh.STRONG[x].includes(t));
      return `<tr><th>${chip(t)}</th><td><div class="chips">${Sh.STRONG[t].map(chip).join('')}</div></td><td><div class="chips">${weak.map(chip).join('')}</div></td><td><div class="chips">${Sh.RESIST[t].map(chip).join('')}</div></td></tr>`;
    }).join('');
    return `<h2>Tabella dei tipi</h2>
      <table class="ttable"><thead><tr><th>Tipo</th><th>Forte contro (×2)</th><th>Debole a (×2)</th><th>Resiste a (×0,5)</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="mute">Tutto il resto fa danno normale (×1). Il Re è incolore.</p>
      <form method="dialog"><button class="btn">Chiudi</button></form>`;
  }
  function rulesText() {
    const st = Object.entries(Sh.ROLES).filter(([k]) => k !== 're').map(([k, v]) => `${v.label} ${v.hp} HP / ${v.atk} att.`).join(' · ');
    return `<h2>Come si gioca</h2>
      <ul>
        <li><b>Muovi come negli scacchi.</b> Arrocco ammesso (Re e Torre mai mossi, casella libera e non minacciata); niente presa al varco.</li>
        <li><b>Catturare = attaccare.</b> Il bersaglio perde HP pari all'attacco, modificato dal tipo (×2, ×0,5). Se sopravvive, il tuo pezzo resta dov'è. Se muore, occupi la casella.</li>
        <li><b>Statistiche:</b> ${st}.</li>
        <li><b>Re:</b> incolore, senza HP, <b>elimina in un colpo qualsiasi pezzo</b> (lo Scudo lo ferma). <b>Il Re non si colpisce:</b> funziona lo scacco come negli scacchi. Se è minacciato devi spostarlo, pararti o eliminare chi lo minaccia (un attacco che non uccide non basta). Non puoi lasciarlo sotto scacco. <b>Scacco matto = partita persa</b>; senza mosse e senza scacco è patta.</li>
        <li><b>Prima di giocare:</b> draft dei tipi a serpentina (Blu, Rosso, Rosso, Blu, Blu, Rosso… l'ultima scelta è del Rosso), ognuno al massimo 2 volte a testa, poi scegli 3 strumenti. (Con l'opzione «Tipi a caso» i tipi vengono assegnati subito e si salta il draft.)</li>
        <li><b>Strumenti</b> (costano il turno, tranne Scudo e Paralisi: azioni gratuite, una sola per turno, dopo le quali muovi un pezzo):${Sh.ITEM_IDS.filter((i) => Sh.ITEMS[i].active).map((i) => `<b>${Sh.ITEMS[i].label}</b>: ${Sh.ITEMS[i].desc}`).join(' ')}</li>
        <li><b>Promozione:</b> un pedone che arriva in fondo diventa Cavallo; con una ${Sh.ITEMS.pietra.label} scegli il pezzo.</li>
        ${S && S.lucky ? `<li><b>Caselle fortunate</b> (modificatore attivo): una casella libera delle righe centrali dà un bonus a chi ci arriva con un pezzo (anche catturando; il bersaglio deve morire). Bonus: +3 HP, Rabbia (+1 danno per 3 turni), Corazza (−1 danno subito per 3 turni) oppure uno strumento extra (Cristallo, Pozione, Cambio, Bomba). Il Re può prenderla, ma HP e potenziamenti si sprecano. Ne compare una nuova ${3} turni dopo.</li>` : ''}
        <li>Sotto scacco puoi usare uno strumento che costa il turno solo se toglie il Re dallo scacco (Cambio, Revitalizzante o Bomba su chi lo minaccia). Scudo e Paralisi sono gratuiti: li puoi usare (la Paralisi su chi dà scacco lo toglie), ma poi devi comunque muovere e il Re non può restare sotto scacco.</li>
      </ul>
      <form method="dialog"><button class="btn">Ho capito</button></form>`;
  }
  function openDialog(id, html) { const d = $(id); d.innerHTML = html; if (!d.open) d.showModal(); }
  $('#btnRules').addEventListener('click', () => openDialog('#dlgRules', rulesText()));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#btnCopy, #btnTypes, #btnRules2, #btnSound, #btnHome');
    if (!b) return;
    if (b.id === 'btnHome') leaveRoom();
    else if (b.id === 'btnSound') { Sfx.setMuted(!Sfx.isMuted()); b.textContent = Sfx.isMuted() ? '🔇' : '🔊'; }
    else if (b.id === 'btnCopy') copyLink();
    else if (b.id === 'btnTypes') openDialog('#dlgTypes', typesTable());
    else openDialog('#dlgRules', rulesText());
  });
})();
