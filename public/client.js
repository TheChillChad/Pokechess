(() => {
  const Sh = window.Shared;
  const CFG = window.GAME_CONFIG;
  const $ = (s) => document.querySelector(s);
  const socket = io();

  let S = null;            // ultimo stato ricevuto dal server
  let roomCode = null;
  const ui = { sel: null, inspect: null, item: null, draftPiece: null, picks: [], seq: null };

  // ---------- identità (per rientrare nella stanza dopo un ricaricamento) ----------
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignora */ } return null; }
  const token = (() => {
    let t = store('sm_token');
    if (!t) { t = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'tk' + Math.random().toString(36).slice(2) + Date.now().toString(36); store('sm_token', t); }
    return t;
  })();

  // ---------- utilità ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sprite = (name) => `sprites/${CFG.spriteSet}/${name}.svg`;
  const pieceSprite = (p) => sprite(p.role === 're' ? 're' : `${p.role}_${p.type || 'neutro'}`);
  const typeIcon = (t) => sprite('tipo_' + t);
  const teamName = (c) => Sh.TEAM[c];
  const pieceName = (p) => Sh.ROLES[p.role].label + (p.type ? ' ' + Sh.TYPE_LABEL[p.type] : '');
  const byId = (id) => S && S.pieces.find((p) => p.id === id);
  const pieceAt = (r, c) => S.pieces.find((p) => p.alive && p.r === r && p.c === c);
  const flipped = () => S && S.you === 'b';
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
    $('#home').hidden = false; $('#game').hidden = true;
    $('#homeErr').textContent = err || '';
  }
  function enterRoom(code) {
    roomCode = code;
    store('sm_room', code);
    try { history.replaceState(null, '', '?stanza=' + code); } catch (e) { /* ignora */ }
  }
  function joinRoom(code, silent) {
    socket.emit('join', { code, token }, (res) => {
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
    if (!prev || prev.phase !== st.phase || prev.you !== st.you) { ui.sel = null; ui.item = null; ui.draftPiece = null; ui.picks = []; }
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
      Sfx.play(st.winner === null ? 'draw' : st.winner === mine ? 'win' : 'lose');
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
    socket.emit('create', { token }, (res) => {
      if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
    });
  });
  const startBot = (level) => socket.emit('createBot', { token, level }, (res) => {
    if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
  });
  $('#btnBotEasy').addEventListener('click', () => startBot('easy'));
  $('#btnBotNormal').addEventListener('click', () => startBot('normal'));
  $('#btnBotHard').addEventListener('click', () => startBot('hard'));
  $('#btnBotMaster').addEventListener('click', () => startBot('master'));
  $('#btnLocal').addEventListener('click', () => socket.emit('createLocal', { token }, (res) => {
    if (res && res.ok) enterRoom(res.code); else showHome((res && res.error) || 'Errore');
  }));
  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#codeInput').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { $('#homeErr').textContent = 'Il codice ha 5 caratteri'; return; }
    joinRoom(code, false);
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
      mine.filter((p) => p.id !== it.first).forEach(mark);
      if (it.first) { const f = byId(it.first); h.sel = f.id; }
    } else if (it.name === 'revitalizzante' && it.id) {
      const p = byId(it.id);
      const rows = p.role === 'pedone' ? [S.you === 'w' ? 6 : 1] : (S.you === 'w' ? [6, 7] : [0, 1]);
      for (const r of rows) for (let c = 0; c < 8; c++) if (!pieceAt(r, c)) h.pick[r + ',' + c] = 1;
    }
  }
  function computeHl() {
    const h = { sel: null, move: {}, atk: {}, pick: {}, last: {} };
    if (S.lastMove) { h.last[S.lastMove.from.join(',')] = 1; h.last[S.lastMove.to.join(',')] = 1; }
    if (S.phase === 'draft' && ui.draftPiece) h.sel = ui.draftPiece;
    if (myTurn()) {
      if (ui.item) itemTargets(h);
      else if (ui.sel) {
        h.sel = ui.sel;
        for (const m of S.legal[ui.sel] || []) (m.kind === 'attack' ? h.atk : h.move)[m.r + ',' + m.c] = m;
      }
    }
    return h;
  }

  // ---------- rendering ----------
  function render() {
    if (!S) return;
    $('#home').hidden = true; $('#game').hidden = false;
    renderTop(); renderStatus(); renderBoard(); renderPanel(); popEvent();
  }

  function renderTop() {
    const o = opp();
    $('#topbar').innerHTML = `
      <h1>EleMate</h1>
      <span class="pill team-${S.you}"><span class="tdot"></span>${S.local ? 'Gioca il ' : 'Sei '}${teamName(S.you)}</span>
      ${S.local ? '<span class="pill">Locale · stesso dispositivo</span>' : ''}<span class="pill" title="Avversario" ${S.local ? 'hidden' : ''}><span class="dot ${S.connected[o] ? 'on' : ''}"></span>${S.bot ? 'Bot ' + ({ easy: 'facile', normal: 'normale', hard: 'difficile', master: 'maestro' }[S.bot.level] || S.bot.level) : S.phase === 'lobby' ? 'In attesa…' : S.connected[o] ? 'Avversario online' : 'Avversario offline'}</span>
      ${S.bot || S.local ? '' : `<button class="pill" id="btnCopy" type="button" title="Copia il link da mandare all'amico">Stanza ${S.code} · copia link</button>`}
      <button class="pill" id="btnSound" type="button" title="Suoni" aria-label="Suoni">${window.Sfx && Sfx.isMuted() ? '🔇' : '🔊'}</button>
      <button class="pill" id="btnTypes" type="button">Tabella tipi</button>
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
      main = S.local ? `Tocca al ${teamName(S.you)}: scegli 3 strumenti` : 'Scegli i tuoi 3 strumenti'; sub = S.local ? 'Passate il dispositivo: l\'altro non deve guardare' : 'Poi si parte'; dot = null;
    } else if (S.phase === 'play') {
      const chk = !!(S.check && S.check[S.turn]);
      if (S.pendingBy) main = S.pendingBy === S.you ? 'Scegli la promozione del pedone' : `Il ${teamName(S.pendingBy)} sta promuovendo`;
      else if (chk && S.turn === S.you) { main = 'Sei sotto scacco!'; sub = 'Proteggi il Re: spostalo, para o elimina chi lo minaccia'; }
      else if (chk) { main = `Scacco al Re ${teamName(S.turn)}`; sub = `Turno del ${teamName(S.turn)}`; }
      else main = S.local ? `Tocca al ${teamName(S.you)}` : S.turn === S.you ? 'Tocca a te' : S.bot ? 'Il bot sta pensando…' : `Turno del ${teamName(S.turn)}`;
      if (S.turn === S.you && S.shieldLock) sub = 'Scudo messo: ora muovi un altro pezzo (quello con lo Scudo no)';
      else if (S.turn === S.you && S.freeUsed) sub = 'Azione gratuita usata: ora muovi un pezzo';
      if (chk) alertBadge = true;
    } else if (S.phase === 'over') {
      if (S.winner === null) { main = 'Patta'; dot = null; }
      else main = S.winner === S.you ? 'Hai vinto!' : 'Hai perso';
      sub = S.reason || ''; if (S.winner) dot = S.winner;
    }
    $('#status').innerHTML = `${dot ? `<span class="tdot team-${dot}"></span>` : ''}${alertBadge ? '<span class="badge-check">SCACCO</span>' : ''}<span>${main}</span><span class="sub">${esc(sub)}</span>`;
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
        if (p && p.color === S.you && (S.phase === 'draft' || S.legal[p.id])) cls.push('clickable');
        let inner = '';
        if (dc === 0) inner += `<span class="coord rk">${8 - r}</span>`;
        if (dr === 7) inner += `<span class="coord f">${'abcdefgh'[c]}</span>`;
        if (p) {
          const pc = ['pc', 'team-' + p.color];
          if (p.shield) pc.push('shield');
          if (p.boost) pc.push('boost');
          if (p.frozen) pc.push('frozen');
          if (S.shieldLock === p.id) pc.push('lock');
          let hp = '';
          if (p.maxHp) {
            const pct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
            hp = `<div class="hp"><i class="${pct <= 30 ? 'low' : pct <= 60 ? 'mid' : ''}" style="width:${pct}%"></i></div><span class="hpn">${p.hp}</span>`;
          }
          inner += `<div class="${pc.join(' ')}"><img src="${pieceSprite(p)}" alt="${esc(pieceName(p))} ${teamName(p.color)}" draggable="false">${hp}</div>`;
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

  // ---------- pannello laterale ----------
  function renderPanel() {
    let html = '';
    if (S.phase === 'lobby') html += lobbyPanel();
    else if (S.phase === 'draft') html += draftPanel();
    else if (S.phase === 'items') html += itemsPanel();
    else html += playPanel();
    if (S.phase !== 'lobby' && S.phase !== 'items') html += infoPanel();
    html += logPanel();
    $('#panel').innerHTML = html;
  }

  function lobbyPanel() {
    const link = location.origin + location.pathname + '?stanza=' + S.code;
    return `<div class="box"><h3>Invita un amico</h3>
      <p>Codice stanza: <b style="font-size:24px;letter-spacing:.2em">${S.code}</b></p>
      <p class="mute" style="word-break:break-all">${esc(link)}</p>
      <div class="row"><button class="btn primary" data-act="copy" type="button">Copia link</button></div>
      <p class="mute">Appena entra, comincia il draft dei tipi.</p></div>`;
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
      return `<button class="tbtn" type="button" data-act="type" data-type="${t}" ${dis ? 'disabled' : ''}><img src="${typeIcon(t)}" alt="">${Sh.TYPE_LABEL[t]}<small>${Sh.MAX_PER_TYPE - n} rimasti</small></button>`;
    }).join('');
    return `<div class="box"><h3>Draft dei tipi</h3>
      <div class="progress"><i style="width:${(S.picks / 30) * 100}%"></i></div>
      ${intro}
      <div class="typegrid">${buttons}</div>
      <p class="mute">Pezzi senza tipo: ${left}. Ogni tipo si può usare al massimo ${Sh.MAX_PER_TYPE} volte. Il Re resta incolore.</p></div>`;
  }

  function itemsPanel() {
    if (S.itemsReady[S.you]) {
      return `<div class="box"><h3>Strumenti scelti</h3><p>Attendo che ${teamName(opp())} finisca di scegliere…</p>
        <div class="chips">${S.items[S.you].map((i) => `<span class="chip" style="padding-left:8px">${Sh.ITEMS[i].label}</span>`).join('')}</div></div>`;
    }
    const slots = [0, 1, 2].map((i) => {
      const it = ui.picks[i];
      return `<button class="slot ${it ? 'full' : ''}" type="button" data-act="unpick" data-i="${i}">${it ? Sh.ITEMS[it].label : 'Vuoto'}</button>`;
    }).join('');
    const cards = Sh.ITEM_IDS.map((i) => {
      const n = ui.picks.filter((x) => x === i).length;
      return `<button class="icard ${n ? 'on' : ''}" type="button" data-act="pick" data-item="${i}" ${ui.picks.length >= Sh.KIT_SIZE ? 'disabled' : ''}>
        <div><b>${Sh.ITEMS[i].label}</b><span>${Sh.ITEMS[i].desc}</span></div>${n ? `<span class="n">×${n}</span>` : ''}</button>`;
    }).join('');
    return `<div class="box"><h3>Scegli 3 strumenti</h3>
      <p class="mute">Puoi prendere anche lo stesso più volte. Usarne uno costa il turno. Clicca uno slot per toglierlo.</p>
      <div class="slots">${slots}</div>
      <div class="itemgrid">${cards}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" data-act="confirmItems" ${ui.picks.length === Sh.KIT_SIZE ? '' : 'disabled'}>Conferma</button></div></div>`;
  }

  function playPanel() {
    let html = '';
    if (S.phase === 'over') {
      const res = S.winner === null ? ['draw', 'Patta'] : S.winner === S.you ? ['win', 'Hai vinto!'] : ['lose', 'Hai perso'];
      html += `<div class="banner ${res[0]}">${res[1]}<br><span style="font-weight:600">${esc(S.reason || '')}</span></div>
        <button class="btn primary" type="button" data-act="rematch">Rivincita (colori scambiati)</button>`;
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
    const group = (list) => Sh.ITEM_IDS.map((i) => ({ i, n: list.filter((x) => x === i).length })).filter((x) => x.n);
    let ibox = `<div class="box"><h3>I tuoi strumenti</h3>`;
    if (!mine.length) ibox += '<p class="mute">Li hai finiti tutti.</p>';
    ibox += '<div class="itemgrid">';
    for (const { i, n } of group(mine)) {
      const def = Sh.ITEMS[i];
      const on = ui.item && ui.item.name === i;
      const dis = !def.active || !myTurn() || S.phase !== 'play' || (i === 'revitalizzante' && !S.graveyard[S.you].length) || (def.free && S.freeUsed);
      ibox += `<button class="icard ${on ? 'on' : ''}" type="button" data-act="useItem" data-item="${i}" ${dis ? 'disabled' : ''}>
        <div><b>${def.label}</b><span>${def.desc}</span></div><span class="n">×${n}</span></button>`;
    }
    ibox += '</div>';
    if (ui.item) ibox += itemPrompt();
    ibox += `<p class="mute" style="margin-top:8px">Avversario: ${theirs.length ? group(theirs).map((x) => `${Sh.ITEMS[x.i].label}${x.n > 1 ? ' ×' + x.n : ''}`).join(', ') : 'nessuno strumento'}</p></div>`;
    html += ibox;
    if (S.phase === 'play') html += `<div class="row"><button class="btn sm" type="button" data-act="resign">Arrenditi</button></div>`;
    return html;
  }

  function itemPrompt() {
    const it = ui.item;
    let msg = '';
    if (it.name === 'pozione') msg = 'Clicca un tuo pezzo ferito.';
    else if (it.name === 'scudo' || it.name === 'cristallo') msg = 'Clicca il tuo pezzo.';
    else if (it.name === 'cambio') msg = it.first ? 'Ora clicca il secondo pezzo.' : 'Clicca il primo pezzo da scambiare.';
    else if (it.name === 'revitalizzante') msg = it.id ? 'Clicca una casella libera evidenziata.' : 'Scegli quale pezzo riportare in campo:';
    else if (it.name === 'paralisi') msg = 'Clicca il pezzo avversario da paralizzare.';
    else if (it.name === 'bomba') msg = 'Clicca il pezzo avversario da bombardare (3 danni).';
    else if (it.name === 'metamorfosi') msg = it.id ? 'Scegli il nuovo tipo:' : 'Clicca il tuo pezzo da trasformare.';
    let html = `<p style="margin-top:8px"><b>${msg}</b></p>`;
    if (it.name === 'metamorfosi' && it.id) {
      const cur = byId(it.id);
      html += '<div class="typegrid">' + Sh.TYPES.filter((t) => t !== cur.type).map((t) => `<button class="tbtn" type="button" data-act="metaType" data-type="${t}"><img src="${typeIcon(t)}" alt="">${Sh.TYPE_LABEL[t]}</button>`).join('') + '</div>';
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
        ${p.shield ? '<p><b>Scudo attivo</b>: ignora il prossimo attacco.</p>' : ''}${p.boost ? '<p><b>Cristallo attivo</b>: il prossimo attacco fa ×1,5.</p>' : ''}${p.frozen ? '<p><b>Paralizzato</b>: non può muoversi né attaccare al suo prossimo turno.</p>' : ''}`;
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
    if (S.phase === 'draft') {
      if (S.turn === S.you && p && p.color === S.you && p.role !== 're' && !p.type) ui.draftPiece = ui.draftPiece === p.id ? null : p.id;
      else ui.inspect = p ? p.id : null;
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
      case 'pick': if (ui.picks.length < Sh.KIT_SIZE) { ui.picks.push(d.item); render(); } break;
      case 'unpick': ui.picks.splice(+d.i, 1); render(); break;
      case 'confirmItems': socket.emit('items', { list: ui.picks }); break;
      case 'useItem': ui.item = ui.item && ui.item.name === d.item ? null : { name: d.item }; ui.sel = null; render(); break;
      case 'cancelItem': ui.item = null; render(); break;
      case 'grave': ui.item.id = d.id; render(); break;
      case 'metaType': socket.emit('item', { item: 'metamorfosi', id: ui.item.id, type: d.type }); ui.item = null; break;
      case 'promote': socket.emit('promote', { role: d.role }); break;
      case 'resign': if (confirm('Vuoi davvero arrenderti?')) socket.emit('resign'); break;
      case 'rematch': socket.emit('rematch'); break;
    }
  });

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
        <li><b>Prima di giocare:</b> draft dei tipi a serpentina (Blu, Rosso, Rosso, Blu, Blu, Rosso… l'ultima scelta è del Rosso), ognuno al massimo 2 volte a testa, poi scegli 3 strumenti.</li>
        <li><b>Strumenti</b> (costano il turno, tranne Scudo e Paralisi: azioni gratuite, una sola per turno, dopo le quali muovi un pezzo):${Sh.ITEM_IDS.filter((i) => Sh.ITEMS[i].active).map((i) => `<b>${Sh.ITEMS[i].label}</b>: ${Sh.ITEMS[i].desc}`).join(' ')}</li>
        <li><b>Promozione:</b> un pedone che arriva in fondo diventa Cavallo; con una ${Sh.ITEMS.pietra.label} scegli il pezzo.</li>
        <li>Sotto scacco puoi usare uno strumento che costa il turno solo se toglie il Re dallo scacco (Cambio, Revitalizzante o Bomba su chi lo minaccia). Scudo e Paralisi sono gratuiti: li puoi usare (la Paralisi su chi dà scacco lo toglie), ma poi devi comunque muovere e il Re non può restare sotto scacco.</li>
      </ul>
      <form method="dialog"><button class="btn">Ho capito</button></form>`;
  }
  function openDialog(id, html) { const d = $(id); d.innerHTML = html; if (!d.open) d.showModal(); }
  $('#btnRules').addEventListener('click', () => openDialog('#dlgRules', rulesText()));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#btnCopy, #btnTypes, #btnRules2, #btnSound');
    if (!b) return;
    if (b.id === 'btnSound') { Sfx.setMuted(!Sfx.isMuted()); b.textContent = Sfx.isMuted() ? '🔇' : '🔊'; }
    else if (b.id === 'btnCopy') copyLink();
    else if (b.id === 'btnTypes') openDialog('#dlgTypes', typesTable());
    else openDialog('#dlgRules', rulesText());
  });
})();
