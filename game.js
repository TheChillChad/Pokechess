// Logica di gioco (nessuna dipendenza da rete o grafica).
// Coordinate: r = riga 0..7 (0 = fondo del Rosso, 7 = fondo del Blu), c = colonna 0..7.
// Colori interni: 'w' = Blu (muove per primo), 'b' = Rosso.
const S = require('./public/shared.js');
const SC = require('./public/scalata.js');
const SV = require('./public/survival.js');

const BACK_RANK = ['torre', 'cavallo', 'alfiere', 'regina', 're', 'alfiere', 'cavallo', 'torre'];
const other = (c) => (c === 'w' ? 'b' : 'w');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const inb = (r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < 8 && c >= 0 && c < 8;

function mkPiece(id, color, role, r, c) {
  const st = S.ROLES[role];
  return { id, color, role, type: null, hp: st.hp, maxHp: st.hp, atk: st.atk, r, c, alive: true, shield: false, boost: false, frozen: false, hasMoved: false };
}

const LUCKY_FIRST = 4; // la prima casella fortunata compare dopo 4 mezze mosse (2 a testa)
const LUCKY_GAP = 6;   // e ricompare 6 mezze mosse (3 turni a testa) dopo essere stata presa

// modificatori: { lucky: null | { vis: 'hidden' | 'pos' | 'full' } }
function normMods(m) {
  const l = m && m.lucky;
  const h = m && m.handicap;
  const handicap = h && HANDICAP_LEVELS.includes(h.level) && (h.color === 'w' || h.color === 'b') ? { level: h.level, color: h.color } : null;
  return { lucky: l ? { vis: ['hidden', 'pos', 'full'].includes(l.vis) ? l.vis : 'pos' } : null, randomTypes: !!(m && m.randomTypes), handicap };
}

// Handicap (solo contro il bot): il lato svantaggiato ha meno strumenti e/o pezzi in meno
const HANDICAP_LEVELS = ['light', 'medium', 'heavy', 'extreme'];
const HANDICAP_LABEL = { light: 'Leggero', medium: 'Medio', heavy: 'Pesante', extreme: 'Estremo' };
function handicapPicks(h) { return h.level === 'extreme' ? 0 : Math.max(0, S.KIT_SIZE - 1); }
// pezzi tolti all'inizio della partita (non vanno nel cimitero)
function applyHandicap(g) {
  const h = g.mods.handicap;
  if (!h) return;
  const mine = Object.values(g.pieces).filter((p) => p.color === h.color && p.alive);
  const cut = (role, c) => { const p = mine.find((x) => x.role === role && x.c === c); if (p) p.alive = false; };
  if (h.level === 'medium') { cut('pedone', 5); cut('pedone', 2); }
  if (h.level === 'heavy') { cut('cavallo', 1); cut('torre', 0); }
  if (h.level === 'extreme') cut('regina', 3);
}

function newGame(mods, run, surv) {
  mods = normMods(mods);
  const pieces = {};
  for (const color of surv ? ['w'] : ['w', 'b']) { // Sopravvivenza: all'inizio c'è solo la tua squadra, i nemici arrivano a ondate
    const backR = color === 'w' ? 7 : 0;
    const pawnR = color === 'w' ? 6 : 1;
    let k = 0;
    BACK_RANK.forEach((role, c) => { const id = color + k++; pieces[id] = mkPiece(id, color, role, backR, c); });
    for (let c = 0; c < 8; c++) { const id = color + k++; pieces[id] = mkPiece(id, color, 'pedone', pawnR, c); }
  }
  return {
    phase: 'lobby', // lobby -> draft -> items -> play -> over
    turn: 'w',
    pieces,
    picks: 0, // scelte di tipo fatte (30 in tutto)
    items: { w: [], b: [] },
    itemsReady: { w: false, b: !!surv },
    graveyard: { w: [], b: [] },
    pending: null, // { id } promozione in attesa di scelta
    shieldLock: null, // id del pezzo che ha appena ricevuto lo Scudo: in questo turno non può muovere
    freeUsed: false, // lo Scudo (azione gratuita) è già stato usato in questo turno
    winner: null, // null con phase 'over' = patta
    reason: null,
    log: [],
    lastMove: null,
    event: null,
    seq: 0,
    mods,
    lucky: mods.lucky ? { sq: null, nextAt: LUCKY_FIRST } : null, // sq: { r, c, bonus }
    ply: 0, // mezze mosse giocate (serve alle caselle fortunate)
    surv: surv ? { wave: 0, cleared: 0, state: 'draft', random: !!(surv && surv.random), n: 0, bonusDue: false } : null, // Sopravvivenza
    run: run && (run.color === 'w' || run.color === 'b') ? { ...SC.normRun(run), color: run.color, choices: {} } : null, // Scalata
  };
}

// ---------- utilità ----------
// un alfiere resta sempre sullo stesso colore di caselle: (r+c)%2 della casella in cui si trova (o in cui è caduto) non cambia mai
const sameShade = (r1, c1, r2, c2) => (r1 + c1) % 2 === (r2 + c2) % 2;
const shadeName = (r, c) => ((r + c) % 2 ? 'scure' : 'chiare');
function name(p) {
  return cap(p.role) + (p.type ? ' ' + cap(p.type) : '') + ' (' + S.TEAM[p.color] + ')';
}
function log(g, msg) { g.log.push(msg); if (g.log.length > 80) g.log.shift(); }
function event(g, r, c, text, kind) { g.event = { seq: ++g.seq, r, c, text, kind }; }
function grid(g) {
  const gr = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const p of Object.values(g.pieces)) if (p.alive) gr[p.r][p.c] = p;
  return gr;
}
function own(g, color, id) {
  const p = g.pieces[id];
  return p && p.alive && p.color === color ? p : null;
}
// copia leggera per simulare una mossa senza toccare la partita vera
function simClone(g) {
  const pieces = {};
  for (const [k, p] of Object.entries(g.pieces)) pieces[k] = { ...p };
  return { ...g, pieces, graveyard: { w: g.graveyard.w.slice(), b: g.graveyard.b.slice() }, log: [], lastMove: null, event: null };
}

// ---------- movimento ----------
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function movesFor(p, gr) {
  const out = [];
  const tryPush = (r, c) => {
    if (!inb(r, c)) return false;
    const t = gr[r][c];
    if (!t) { out.push({ r, c, kind: 'move' }); return true; }
    if (t.color !== p.color) out.push({ r, c, kind: 'attack' });
    return false;
  };
  const slide = (dirs) => {
    for (const [dr, dc] of dirs) {
      let r = p.r + dr, c = p.c + dc;
      while (tryPush(r, c)) { r += dr; c += dc; }
    }
  };
  switch (p.role) {
    case 'pedone': {
      const dir = p.color === 'w' ? -1 : 1;
      const startR = p.color === 'w' ? 6 : 1;
      if (inb(p.r + dir, p.c) && !gr[p.r + dir][p.c]) {
        out.push({ r: p.r + dir, c: p.c, kind: 'move' });
        if (p.r === startR && !gr[p.r + 2 * dir][p.c]) out.push({ r: p.r + 2 * dir, c: p.c, kind: 'move' });
      }
      for (const dc of [-1, 1]) {
        const r = p.r + dir, c = p.c + dc;
        if (inb(r, c) && gr[r][c] && gr[r][c].color !== p.color) out.push({ r, c, kind: 'attack' });
      }
      break;
    }
    case 'cavallo': for (const [dr, dc] of KNIGHT) tryPush(p.r + dr, p.c + dc); break;
    case 're': for (const [dr, dc] of KING) tryPush(p.r + dr, p.c + dc); break;
    case 'alfiere': slide(DIAG); break;
    case 'torre': slide(ORTH); break;
    case 'regina': slide(DIAG.concat(ORTH)); break;
  }
  return out;
}

// ---------- scacco ----------
// Una casella (r,c) è minacciata da `color` se un suo pezzo (non paralizzato) potrebbe attaccarla.
// Lavora direttamente sulla griglia, senza costruire liste di mosse: è il cuore della velocità del bot.
function threatened(gr, r, c, color) {
  const enemy = (t, role) => t && t.color === color && !t.frozen && t.role === role;
  for (const [dr, dc] of KNIGHT) { const rr = r + dr, cc = c + dc; if (inb(rr, cc) && enemy(gr[rr][cc], 'cavallo')) return true; }
  for (const [dr, dc] of KING) { const rr = r + dr, cc = c + dc; if (inb(rr, cc) && enemy(gr[rr][cc], 're')) return true; }
  const pr = r + (color === 'w' ? 1 : -1); // un pedone di `color` attacca in avanti, quindi sta "dietro" la casella
  for (const dc of [-1, 1]) if (inb(pr, c + dc) && enemy(gr[pr][c + dc], 'pedone')) return true;
  for (const [dr, dc] of DIAG) {
    let rr = r + dr, cc = c + dc;
    while (inb(rr, cc)) {
      const t = gr[rr][cc];
      if (t) { if (t.color === color && !t.frozen && (t.role === 'alfiere' || t.role === 'regina')) return true; break; }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of ORTH) {
    let rr = r + dr, cc = c + dc;
    while (inb(rr, cc)) {
      const t = gr[rr][cc];
      if (t) { if (t.color === color && !t.frozen && (t.role === 'torre' || t.role === 'regina')) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}
// Il Re è sotto scacco se un pezzo avversario potrebbe attaccare la sua casella.
function inCheck(g, color) {
  const king = Object.values(g.pieces).find((p) => p.alive && p.color === color && p.role === 're');
  if (!king) return false;
  return threatened(grid(g), king.r, king.c, color === 'w' ? 'b' : 'w');
}

// ---------- danno ----------
function calcDamage(att, def) {
  // il Re elimina in un colpo qualsiasi pezzo, ignorando i tipi (lo Scudo lo ferma comunque)
  if (att.role === 're') return { dmg: def.hp, eff: 1, ko: true };
  const eff = S.mult(att.type, def.type);
  let base = att.atk * eff;
  if (att.boost) base *= 1.5;
  let dmg = Math.max(1, Math.round(base));
  if (att.rage) dmg += 1;                         // Rabbia: +1 danno
  if (def.guard) dmg = Math.max(1, dmg - 1);      // Corazza: −1 danno subito
  return { dmg, eff, ko: false };
}

function preview(att, def) {
  if (def.shield) return { shield: true, dmg: 0 };
  const { dmg, eff, ko } = calcDamage(att, def);
  return { dmg, eff, kill: dmg >= def.hp, ko };
}

// Applica una mossa o un attacco (senza cambiare turno). Usata anche per le simulazioni.
function applyMoveCore(g, color, p, r, c) {
  const t = grid(g)[r][c];
  const from = [p.r, p.c];
  let moved = false;
  if (!t && p.role === 're' && r === p.r && Math.abs(c - p.c) === 2) {
    // arrocco: la Torre salta dall'altra parte del Re
    const rook = grid(g)[r][c > p.c ? 7 : 0];
    rook.c = c > p.c ? c - 1 : c + 1;
    rook.hasMoved = true;
    p.r = r; p.c = c; moved = true;
    log(g, `${S.TEAM[color]} fa l'arrocco.`);
    event(g, r, c, 'Arrocco', 'buff');
  } else if (!t) {
    p.r = r; p.c = c; moved = true;
    log(g, `${name(p)} si sposta.`);
  } else {
    const head = `${name(p)} attacca ${name(t)}`;
    if (t.shield) {
      t.shield = false; p.boost = false;
      log(g, `${head}: lo Scudo blocca il colpo!`);
      event(g, r, c, 'Bloccato', 'block');
    } else if (t.role === 're') {
      // Non dovrebbe mai succedere: il Re non si colpisce, si dà scacco matto. Sicurezza.
      p.boost = false; t.alive = false; p.r = r; p.c = c; moved = true;
      g.phase = 'over'; g.winner = color; g.reason = `${S.TEAM[color]} ha colpito il Re avversario`;
    } else {
      const { dmg, eff, ko } = calcDamage(p, t);
      p.boost = false;
      t.hp = Math.max(0, t.hp - dmg);
      const txt = ko ? ' il Re non perdona!' : eff > 1 ? ' super efficace!' : eff < 1 ? ' poco efficace…' : '';
      if (t.hp === 0) {
        t.alive = false;
        g.graveyard[t.color].push(t.id);
        p.r = r; p.c = c; moved = true;
        log(g, `${head}:${txt} −${dmg} HP, sconfitto!`);
        event(g, r, c, `−${dmg}`, 'kill');
      } else {
        log(g, `${head}:${txt} −${dmg} HP (restano ${t.hp}).`);
        event(g, r, c, `−${dmg}`, eff > 1 ? 'super' : eff < 1 ? 'weak' : 'hit');
      }
    }
  }
  if (moved) p.hasMoved = true;
  g.lastMove = { from, to: [r, c] };
  return moved;
}

// Mosse legali: quelle che non lasciano il proprio Re sotto scacco (simulando anche i danni).
// Il Re avversario non si può mai colpire: si dà scacco e si cerca il matto.
// Per non copiare la partita a ogni mossa, la posizione si prova sulla griglia e poi si rimette a posto.
function legalMoves(g, color) {
  const gr = grid(g);
  const res = {};
  const foe = color === 'w' ? 'b' : 'w';
  let king = null;
  for (const p of Object.values(g.pieces)) if (p.alive && p.color === color && p.role === 're') king = p;
  for (const p of Object.values(g.pieces)) {
    if (!p.alive || p.color !== color) continue;
    if (p.frozen || g.shieldLock === p.id) continue; // paralizzato, o appena protetto dallo Scudo
    const mv = [];
    for (const m of movesFor(p, gr)) {
      const target = m.kind === 'attack' ? gr[m.r][m.c] : null;
      if (target && target.role === 're') continue;
      // la mossa cambia le posizioni solo se è uno spostamento o un attacco che sconfigge il bersaglio
      // (con lo Scudo, o se il bersaglio sopravvive, nulla si muove)
      const lands = !target || (!target.shield && calcDamage(p, target).dmg >= target.hp);
      let bad;
      if (!lands) bad = king ? threatened(gr, king.r, king.c, foe) : false;
      else {
        const fr = p.r, fc = p.c;
        gr[fr][fc] = null; gr[m.r][m.c] = p; p.r = m.r; p.c = m.c;
        if (target) target.alive = false;
        const kr = king ? (king === p ? m.r : king.r) : 0, kc = king ? (king === p ? m.c : king.c) : 0;
        bad = king ? threatened(gr, kr, kc, foe) : false;
        p.r = fr; p.c = fc; gr[fr][fc] = p; gr[m.r][m.c] = target;
        if (target) target.alive = true;
      }
      if (bad) continue;
      if (target) Object.assign(m, preview(p, target));
      mv.push(m);
    }
    if (p.role === 're' && !p.hasMoved && !inCheck(g, color)) {
      for (const side of [-1, 1]) {
        const rook = gr[p.r][side < 0 ? 0 : 7];
        if (!rook || rook.color !== color || rook.role !== 'torre' || rook.hasMoved || rook.frozen) continue;
        let free = true;
        for (let c = Math.min(p.c, rook.c) + 1; c < Math.max(p.c, rook.c); c++) if (gr[p.r][c]) free = false;
        if (!free) continue;
        // il Re non attraversa né finisce su una casella minacciata
        const s1 = simClone(g);
        applyMoveCore(s1, color, s1.pieces[p.id], p.r, p.c + side);
        if (inCheck(s1, color)) continue;
        const s2 = simClone(g);
        applyMoveCore(s2, color, s2.pieces[p.id], p.r, p.c + 2 * side);
        if (inCheck(s2, color)) continue;
        mv.push({ r: p.r, c: p.c + 2 * side, kind: 'castle' });
      }
    }
    if (mv.length) res[p.id] = mv;
  }
  return res;
}

// ---------- fasi iniziali ----------
function typeCounts(g) {
  const counts = { w: {}, b: {} };
  for (const t of S.TYPES) { counts.w[t] = 0; counts.b[t] = 0; }
  for (const p of Object.values(g.pieces)) if (p.type) counts[p.color][p.type]++;
  return counts;
}

// Inizio della partita vera: draft dei tipi, oppure (modificatore «tipi a caso») tipi assegnati subito e si passa agli strumenti
function startDraft(g) {
  if (g.surv) {
    if (!g.surv.random) { g.phase = 'draft'; g.turn = 'w'; return; }
    const hand = S.TYPES.flatMap((t) => [t, t]);
    hand.splice(Math.floor(Math.random() * hand.length), 1);
    for (let i = hand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [hand[i], hand[j]] = [hand[j], hand[i]]; }
    Object.values(g.pieces).filter((p) => p.color === 'w' && p.role !== 're').forEach((p, i) => { p.type = hand[i]; });
    g.picks = S.DRAFT_PICKS / 2; g.phase = 'items'; g.turn = 'w';
    log(g, 'Tipi assegnati a caso. Scegli gli strumenti.');
    return;
  }
  if (!g.mods.randomTypes) { g.phase = 'draft'; return; }
  // Stessa «mano» di tipi per i due lati (15 su 16 posti: 2 per tipo, uno escluso a caso), assegnata a caso ai pezzi di ognuno
  const hand = S.TYPES.flatMap((t) => [t, t]);
  hand.splice(Math.floor(Math.random() * hand.length), 1);
  for (const color of ['w', 'b']) {
    const mine = Object.values(g.pieces).filter((p) => p.color === color && p.role !== 're');
    const types = hand.slice();
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    mine.forEach((p, i) => { p.type = types[i]; });
  }
  g.picks = S.DRAFT_PICKS;
  g.phase = 'items';
  g.turn = 'w';
  log(g, 'Tipi assegnati a caso (stesso mazzo per tutti e due). Ora scegliete 3 strumenti a testa.');
}

function draftPick(g, color, pieceId, type) {
  if (g.phase !== 'draft') return 'Non è il momento di scegliere i tipi';
  if (g.turn !== color) return 'Non è il tuo turno di scelta';
  const p = own(g, color, pieceId);
  if (!p || p.role === 're') return 'Scegli uno dei tuoi pezzi (il Re non ha tipo)';
  if (p.type) return 'Questo pezzo ha già un tipo';
  if (!S.TYPES.includes(type)) return 'Tipo non valido';
  if (typeCounts(g)[color][type] >= S.MAX_PER_TYPE) return `Puoi usare ogni tipo al massimo ${S.MAX_PER_TYPE} volte`;
  p.type = type;
  g.picks++;
  log(g, `${S.TEAM[color]} assegna ${cap(type)} a ${cap(p.role)}.`);
  if (g.picks >= (g.surv ? S.DRAFT_PICKS / 2 : S.DRAFT_PICKS)) {
    g.phase = 'items';
    g.turn = 'w';
    log(g, g.surv ? 'Draft finito. Scegli i tuoi strumenti.' : 'Draft finito. Ora scegliete 3 strumenti a testa.');
  } else {
    g.turn = g.surv ? 'w' : S.draftTurn(g.picks); // serpentina: A B B A A B B A …
  }
  return null;
}

// Kit di un lato: quanti strumenti si scelgono, quali si ricevono in più (Scalata) e di quanto si superano i limiti
function kitInfo(g, color) {
  if (g.surv) return { picks: color === 'w' ? SV.KIT : 0, forced: [], extraCap: 0 };
  const k = SC.kitFor(g.run, !!g.run && g.run.color === color, S.KIT_SIZE);
  const h = g.mods && g.mods.handicap;
  return h && h.color === color ? { ...k, picks: handicapPicks(h) } : k;
}

function setItems(g, color, list, choices) {
  if (g.phase !== 'items') return 'Non è il momento di scegliere gli strumenti';
  if (g.itemsReady[color]) return 'Hai già scelto';
  const kit = kitInfo(g, color);
  if (!Array.isArray(list) || list.length !== kit.picks || !list.every((i) => S.ITEM_IDS.includes(i))) {
    return `Scegli esattamente ${kit.picks} strumenti`;
  }
  for (const id of S.ITEM_IDS) {
    if (list.filter((i) => i === id).length > S.itemMax(id) + kit.extraCap) return `${S.ITEMS[id].label}: al massimo ${S.itemMax(id) + kit.extraCap} nel kit`;
  }
  if (g.run && g.run.color === color) {
    const err = checkChoices(g, color, choices);
    if (err) return err;
  }
  g.items[color] = list.concat(kit.forced);
  g.itemsReady[color] = true;
  if (g.itemsReady.w && g.itemsReady.b) {
    if (g.surv) { startPrep(g); return null; }
    g.phase = 'play';
    g.turn = 'w';
    if (g.run) applyRun(g);
    applyHandicap(g);
    log(g, 'Si parte! Muove il Blu.');
  }
  return null;
}

// ---------- Sopravvivenza ----------
// Casa di un pezzo del giocatore (dall'id: w0..w7 fondo, w8..w15 pedoni), anche se nel frattempo si è promosso
function survHome(id) { const k = +id.slice(1); return k < 8 ? [7, k] : [6, k - 8]; }
const rndPick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffled = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Compone l'ondata `w` con un budget di punti: ruoli a caso (con limiti), tipi a caso, posizioni a caso nelle prime file nemiche
function waveRoles(w) {
  let pts = SV.budget(w);
  const used = {}, out = [];
  while (out.length < 24) {
    const bigN = out.filter((r) => r !== 'pedone').length;
    const pawnN = out.length - bigN;
    const opts = Object.keys(SV.COST).filter((r) => SV.COST[r] <= pts && (used[r] || 0) < SV.CAP[r](w) && (r === 'pedone' ? pawnN < 16 : bigN < 16)); // 16 caselle nelle prime due file, 16 per i pedoni nelle file 1-2
    if (!opts.length) break;
    let x = Math.random() * opts.reduce((a, r) => a + SV.WEIGHT[r], 0), role = opts[0];
    for (const r of opts) { x -= SV.WEIGHT[r]; if (x < 0) { role = r; break; } }
    used[role] = (used[role] || 0) + 1; pts -= SV.COST[role]; out.push(role);
  }
  return out;
}
// Prima di ogni ondata (anche la prima): fase «prep», sistemi i tuoi pezzi nelle prime 3 file
function startPrep(g) {
  const sv = g.surv;
  sv.state = 'prep';
  sv.bonusDue = false;
  for (const id of Object.keys(g.pieces)) if (g.pieces[id].color === 'b') delete g.pieces[id];
  g.graveyard.b = [];
  for (const p of Object.values(g.pieces)) { // posizione iniziale di partenza: puoi cambiarla
    if (p.color !== 'w' || !p.alive) continue;
    [p.r, p.c] = survHome(p.id);
    p.hasMoved = false; p.frozen = false; p.rage = 0; p.guard = 0;
  }
  if (g.lucky) { g.lucky.sq = null; g.lucky.used = false; }
  g.phase = 'prep';
  g.turn = 'w';
  g.winner = null; g.reason = null; g.pending = null; g.shieldLock = null; g.freeUsed = false; g.lastMove = null;
  log(g, `Ondata ${sv.wave + 1}: sistema i tuoi pezzi nelle prime 3 file, poi premi Via.`);
}
const PREP_ROWS = [5, 6, 7];
// sposta (o scambia) un tuo pezzo; pedoni mai nella prima fila (la riga 7)
function placePiece(g, color, id, r, c) {
  if (!g.surv || g.phase !== 'prep' || color !== 'w') return 'Non è il momento di sistemare i pezzi';
  const p = g.pieces[id];
  if (!p || p.color !== 'w' || !p.alive) return 'Pezzo non valido';
  if (!PREP_ROWS.includes(r) || !(c >= 0 && c < 8)) return 'Solo nelle prime 3 file';
  const other = Object.values(g.pieces).find((q) => q.alive && q.id !== id && q.r === r && q.c === c);
  if (other && other.color !== 'w') return 'Casella occupata';
  const okSq = (q, rr) => !(q.role === 'pedone' && rr === 7);
  if (!okSq(p, r)) return 'I pedoni non possono stare nella prima fila';
  if (other && !okSq(other, p.r)) return 'I pedoni non possono stare nella prima fila';
  if (other) { other.r = p.r; other.c = p.c; }
  p.r = r; p.c = c;
  return null;
}
function resetPlacement(g, color) {
  if (!g.surv || g.phase !== 'prep' || color !== 'w') return 'Non disponibile';
  for (const p of Object.values(g.pieces)) if (p.color === 'w' && p.alive) [p.r, p.c] = survHome(p.id);
  return null;
}
// «Via»: compaiono i nemici (a caso, dove non li vedi prima) e il nemico muove per primo
function startWave(g, color) {
  if (!g.surv || g.phase !== 'prep' || color !== 'w') return 'Non disponibile';
  spawnWave(g);
  return null;
}
function spawnWave(g) {
  const sv = g.surv;
  sv.wave++;
  sv.state = 'play';
  const roles = waveRoles(sv.wave);
  const big = roles.filter((r) => r !== 'pedone'), pawns = roles.filter((r) => r === 'pedone');
  const sqBig = shuffled([0, 1].flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [r, c])));
  const place = (role, r, c) => {
    const id = 'b' + sv.n++;
    const p = mkPiece(id, 'b', role, r, c);
    p.type = rndPick(S.TYPES);
    const hb = SV.hpBonus(sv.wave);
    p.maxHp += hb; p.hp += hb;
    g.pieces[id] = p;
  };
  const taken = new Set();
  for (const role of big) { const sq = sqBig.shift(); if (!sq) break; taken.add(sq[0] * 8 + sq[1]); place(role, sq[0], sq[1]); }
  const sqPawn = shuffled([1, 2].flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [r, c]))).filter(([r, c]) => !taken.has(r * 8 + c));
  for (const role of pawns) { const sq = sqPawn.shift(); if (sq) place(role, sq[0], sq[1]); }
  // Re e Torri fuori casa non possono arroccare; i pedoni non in seconda fila non fanno il doppio passo
  for (const p of Object.values(g.pieces)) {
    if (p.color !== 'w' || !p.alive) continue;
    p.hasMoved = p.role === 'pedone' ? p.r !== 6 : !isHome(p.role, 'w', p.r, p.c);
  }
  if (g.lucky) { g.lucky.sq = null; g.lucky.used = false; g.lucky.nextAt = (g.ply || 0) + 4; }
  g.phase = 'play';
  g.turn = 'b'; // il nemico muove per primo
  log(g, `Ondata ${sv.wave}: ${roles.length} nemici (${roles.length ? [...new Set(roles)].map((r) => roles.filter((x) => x === r).length + ' ' + S.ROLES[r].label.toLowerCase()).join(', ') : ''}). Muove il Rosso.`);
}
// il giocatore sceglie il bonus (se dovuto) e passa all'ondata successiva
function nextWave(g, color, choice) {
  const sv = g.surv;
  if (!sv || color !== 'w') return 'Non disponibile';
  if (g.phase !== 'over' || sv.state !== 'cleared') return 'L\'ondata non è finita';
  if (sv.bonusDue) {
    if (choice === 'now') {
      let n = 0;
      for (const p of Object.values(g.pieces)) if (p.color === 'w' && p.alive && p.role !== 're' && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + SV.BONUS_NOW); n++; }
      log(g, `Bonus: +${SV.BONUS_NOW} HP ai pezzi feriti (${n}).`);
    } else if (choice === 'keep') {
      g.items.w.push('curasq');
      log(g, 'Bonus: ricevi una Cura di squadra da usare quando vuoi.');
    } else return 'Scegli il bonus: usalo subito o tienilo';
  }
  startPrep(g);
  return null;
}
// Fine ondata (tutti i nemici sconfitti)
function checkWaveCleared(g) {
  const sv = g.surv;
  if (!sv || g.phase !== 'play') return false;
  if (Object.values(g.pieces).some((p) => p.color === 'b' && p.alive)) return false;
  sv.cleared++;
  sv.state = 'cleared';
  sv.bonusDue = sv.cleared % SV.EVERY === 0;
  g.phase = 'over';
  g.winner = 'w';
  g.reason = `Ondata ${sv.wave} superata`;
  log(g, `Ondata ${sv.wave} superata!`);
  return true;
}

// ---------- Scalata ----------
// Scelte dei bonus (Veterano, Sarto, Vivaio): vanno fatte insieme al kit
function checkChoices(g, color, choices) {
  choices = choices || {};
  const out = {};
  for (const { id, kind } of SC.choicesNeeded(g.run)) {
    const c = choices[id];
    const pid = kind === 'type' ? c && c.id : c;
    const p = own(g, color, pid);
    if (!p || p.role === 're') return `${SC.BONUSES[id].label}: scegli uno dei tuoi pezzi`;
    if (kind === 'pawn' && p.role !== 'pedone') return `${SC.BONUSES[id].label}: scegli un pedone`;
    if (kind === 'type') {
      if (!S.TYPES.includes(c.type)) return `${SC.BONUSES[id].label}: scegli un tipo`;
      out[id] = { id: pid, type: c.type };
    } else out[id] = pid;
  }
  g.run.choices = out;
  return null;
}

// All'inizio della partita: bonus del giocatore e vantaggi del bot
function applyRun(g) {
  const run = g.run, me = run.color, bot = other(me);
  const mine = Object.values(g.pieces).filter((p) => p.color === me && p.alive && p.role !== 're');
  const hp = (p, d) => { p.maxHp = Math.max(1, p.maxHp + d); p.hp = Math.max(1, p.hp + d); };
  const n = (id) => SC.count(run, id);
  for (const p of mine) {
    if (p.role === 'pedone') hp(p, n('armatura') + 3 * n('pedine'));
    if (p.role === 'regina' || p.role === 'torre') hp(p, 2 * n('cuore'));
    if (p.role === 'regina') hp(p, 4 * n('acciaio') - 3 * n('patto'));
    if (p.role === 'cavallo' || p.role === 'alfiere') p.atk += n('affilati');
    p.atk += n('assalto');
    hp(p, -n('assalto'));
  }
  if (n('pedine')) {
    const b = mine.filter((p) => p.role === 'alfiere').sort((x, y) => y.c - x.c)[0];
    if (b) b.alive = false; // perso per sempre: non va nel cimitero, il Revitalizzante non lo riporta
  }
  const ch = run.choices || {};
  if (ch.veterano && g.pieces[ch.veterano]) g.pieces[ch.veterano].shield = true;
  if (ch.sarto && g.pieces[ch.sarto.id]) g.pieces[ch.sarto.id].type = ch.sarto.type;
  if (ch.vivaio && g.pieces[ch.vivaio]) { const p = g.pieces[ch.vivaio]; p.r = me === 'w' ? 5 : 2; p.hasMoved = true; }
  const st = SC.STAGES[run.stage - 1];
  for (const p of Object.values(g.pieces)) if (p.color === bot && p.alive && st.hp && st.hp[p.role]) hp(p, st.hp[p.role]);
}

// ---------- strumenti ----------
// Applica l'effetto dello strumento (senza consumarlo e senza cambiare turno). Restituisce un errore o null.
function applyItem(g, color, a) {
  const team = S.TEAM[color];
  switch (a.item) {
    case 'pozione': {
      const p = own(g, color, a.id);
      if (!p || p.role === 're') return 'Scegli un tuo pezzo (il Re non ha HP)';
      if (p.hp >= p.maxHp) return 'Questo pezzo ha già tutti gli HP';
      const gain = Math.min(5, p.maxHp - p.hp);
      p.hp += gain;
      log(g, `${team} usa Pozione su ${name(p)}: +${gain} HP.`);
      event(g, p.r, p.c, `+${gain}`, 'heal');
      return null;
    }
    case 'curasq': {
      const hurt = Object.values(g.pieces).filter((p) => p.color === color && p.alive && p.role !== 're' && p.hp < p.maxHp);
      if (!hurt.length) return 'Nessun pezzo è ferito';
      for (const p of hurt) { p.hp = Math.min(p.maxHp, p.hp + SV.BONUS_KEEP); event(g, p.r, p.c, '+' + SV.BONUS_KEEP, 'heal'); }
      log(g, `${team} usa Cura di squadra: +${SV.BONUS_KEEP} HP a ${hurt.length} pezzi.`);
      return null;
    }
    case 'scudo': {
      const p = own(g, color, a.id);
      if (!p) return 'Scegli un tuo pezzo';
      if (p.shield) return 'Ha già uno Scudo';
      p.shield = true;
      g.shieldLock = p.id; // azione gratuita: poi si muove un altro pezzo
      g.freeUsed = true;
      log(g, `${team} usa Scudo su ${name(p)} (azione gratuita).`);
      event(g, p.r, p.c, 'Scudo', 'buff');
      return null;
    }
    case 'paralisi': {
      const t = g.pieces[a.id];
      if (!t || !t.alive || t.color === color || t.role === 're') return 'Scegli un pezzo avversario (il Re non si può paralizzare)';
      if (t.frozen) return 'È già paralizzato';
      t.frozen = true;
      g.freeUsed = true; // azione gratuita: poi si muove un pezzo
      log(g, `${team} usa Paralisi su ${name(t)} (azione gratuita): salta il prossimo turno.`);
      event(g, t.r, t.c, 'Paralisi', 'buff');
      return null;
    }
    case 'metamorfosi': {
      const p = own(g, color, a.id);
      if (!p || p.role === 're') return 'Scegli un tuo pezzo (il Re è incolore)';
      if (!S.TYPES.includes(a.type)) return 'Scegli un tipo';
      if (p.type === a.type) return 'Ha già questo tipo';
      const old = p.type;
      p.type = a.type;
      log(g, `${team} usa Metamorfosi: ${cap(p.role)} passa da ${old ? cap(old) : 'nessun tipo'} a ${cap(a.type)}.`);
      event(g, p.r, p.c, cap(a.type), 'buff');
      return null;
    }
    case 'bomba': {
      const t = g.pieces[a.id];
      if (!t || !t.alive || t.color === color || t.role === 're') return 'Scegli un pezzo avversario (il Re non si può colpire)';
      if (t.shield) {
        t.shield = false;
        log(g, `${team} lancia una Bomba su ${name(t)}: lo Scudo la blocca!`);
        event(g, t.r, t.c, 'Bloccato', 'block');
      } else {
        const bd = g.run && g.run.color === color && SC.has(g.run, 'pugno') ? 5 : 3;
        t.hp = Math.max(0, t.hp - bd);
        if (t.hp === 0) {
          t.alive = false;
          g.graveyard[t.color].push(t.id);
          log(g, `${team} lancia una Bomba su ${name(t)}: −${bd} HP, sconfitto!`);
          event(g, t.r, t.c, `−${bd}`, 'kill'); g.event.bomb = true;
        } else {
          log(g, `${team} lancia una Bomba su ${name(t)}: −${bd} HP (restano ${t.hp}).`);
          event(g, t.r, t.c, `−${bd}`, 'hit'); g.event.bomb = true;
        }
      }
      return null;
    }
    case 'cristallo': {
      const p = own(g, color, a.id);
      if (!p) return 'Scegli un tuo pezzo';
      if (p.boost) return 'Ha già un Cristallo';
      p.boost = true;
      log(g, `${team} usa Cristallo su ${name(p)}: il prossimo attacco farà ×1,5.`);
      event(g, p.r, p.c, '×1,5', 'buff');
      return null;
    }
    case 'cambio': {
      const p1 = own(g, color, a.a), p2 = own(g, color, a.b);
      if (!p1 || !p2 || p1 === p2) return 'Scegli due tuoi pezzi diversi';
      const bad = (p, r) => p.role === 'pedone' && (r === 0 || r === 7);
      if (bad(p1, p2.r) || bad(p2, p1.r)) return 'Un pedone non può finire su una riga di fondo';
      if ((p1.role === 'alfiere' && !sameShade(p1.r, p1.c, p2.r, p2.c)) || (p2.role === 'alfiere' && !sameShade(p2.r, p2.c, p1.r, p1.c))) return 'Un alfiere non può cambiare colore di casella';
      p1.hasMoved = p2.hasMoved = true;
      [p1.r, p2.r] = [p2.r, p1.r];
      [p1.c, p2.c] = [p2.c, p1.c];
      log(g, `${team} usa Cambio: ${name(p1)} e ${name(p2)} si scambiano.`);
      event(g, p1.r, p1.c, 'Cambio', 'buff');
      return null;
    }
    case 'revitalizzante': {
      if (!g.graveyard[color].includes(a.id)) return 'Scegli un tuo pezzo sconfitto';
      if (!inb(a.r, a.c)) return 'Casella non valida';
      const p = g.pieces[a.id];
      const rows = color === 'w' ? [6, 7] : [0, 1];
      const allowed = p.role === 'pedone' ? [color === 'w' ? 6 : 1] : rows;
      if (!allowed.includes(a.r)) return p.role === 'pedone' ? 'Un pedone torna sulla tua seconda fila' : 'Scegli una casella nelle tue prime due file';
      if (grid(g)[a.r][a.c]) return 'La casella è occupata';
      if (p.role === 'alfiere' && !sameShade(a.r, a.c, p.r, p.c)) return `Un alfiere può tornare solo sulle caselle ${shadeName(p.r, p.c)}`;
      p.alive = true; p.r = a.r; p.c = a.c; p.hasMoved = true;
      p.hp = Math.ceil(p.maxHp / 2);
      p.shield = false; p.boost = false; p.frozen = false; p.rage = 0; p.guard = 0;
      g.graveyard[color] = g.graveyard[color].filter((x) => x !== a.id);
      log(g, `${team} usa Revitalizzante: torna ${name(p)} con ${p.hp} HP.`);
      event(g, p.r, p.c, 'Torna!', 'heal');
      return null;
    }
    default:
      return 'Questo strumento si usa da solo';
  }
}

// Esiste uno strumento che toglie il Re dallo scacco? (Cambio: sposta il Re o un pezzo; Revitalizzante: blocca la linea)
function itemCanResolve(g, color) {
  const kit = g.items[color];
  const works = (a) => {
    const sim = simClone(g);
    if (applyItem(sim, color, a)) return false;
    if (inCheck(sim, color)) return false;
    // le azioni gratuite non passano il turno: dopo deve restare una mossa da fare
    if (S.ITEMS[a.item] && S.ITEMS[a.item].free && Object.keys(legalMoves(sim, color)).length === 0) return false;
    return true;
  };
  if (kit.includes('cambio')) {
    const mine = Object.values(g.pieces).filter((p) => p.alive && p.color === color);
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      if (works({ item: 'cambio', a: mine[i].id, b: mine[j].id })) return true;
    }
  }
  if (kit.includes('revitalizzante')) {
    for (const id of g.graveyard[color]) for (const r of color === 'w' ? [6, 7] : [0, 1]) for (let c = 0; c < 8; c++) {
      if (works({ item: 'revitalizzante', id, r, c })) return true;
    }
  }
  // Paralisi e Bomba tolgono di mezzo chi dà scacco
  for (const item of ['paralisi', 'bomba']) {
    if (!kit.includes(item)) continue;
    for (const t of Object.values(g.pieces)) {
      if (t.alive && t.color !== color && t.role !== 're' && works({ item, id: t.id })) return true;
    }
  }
  return false;
}

// ---------- caselle fortunate ----------
function pickBonus() {
  const ids = Object.keys(S.LUCKY_BONUS);
  let x = Math.random() * ids.reduce((a, i) => a + S.LUCKY_BONUS[i].w, 0);
  for (const i of ids) { x -= S.LUCKY_BONUS[i].w; if (x < 0) return i; }
  return ids[0];
}
function survBonus() {
  const ids = Object.keys(SV.SQUARE);
  let x = Math.random() * ids.reduce((a, i) => a + SV.SQUARE[i], 0);
  for (const i of ids) { x -= SV.SQUARE[i]; if (x < 0) return i; }
  return ids[0];
}
function luckyTick(g) {
  const L = g.lucky;
  if (!L || L.sq || g.ply < L.nextAt || g.phase !== 'play') return;
  const gr = grid(g);
  const free = [];
  if (g.surv) { // Sopravvivenza: una sola casella per ondata, vicino al tuo Re (2-3 mosse), la prende solo il Re
    if (L.used) return;
    const k = Object.values(g.pieces).find((p) => p.alive && p.color === 'w' && p.role === 're');
    if (!k) return;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const d = Math.max(Math.abs(r - k.r), Math.abs(c - k.c));
      if (!gr[r][c] && d >= SV.SQUARE_DIST[0] && d <= SV.SQUARE_DIST[1]) free.push([r, c]);
    }
  } else for (let r = 2; r <= 5; r++) for (let c = 0; c < 8; c++) if (!gr[r][c]) free.push([r, c]);
  if (!free.length) return;
  const [r, c] = free[Math.floor(Math.random() * free.length)];
  if (g.surv) L.used = true;
  L.sq = { r, c, bonus: g.surv ? survBonus() : pickBonus() };
  if (g.mods.lucky.vis !== 'hidden') log(g, 'Appare una casella fortunata!'); // nascosta: niente indizi nella cronaca
}
// il pezzo p si è appena fermato sulla sua casella: se è quella fortunata, prende il bonus
function luckyPickup(g, color, p) {
  const L = g.lucky;
  if (!L || !L.sq || p.r !== L.sq.r || p.c !== L.sq.c) return;
  if (g.surv && p.role !== 're') return; // la casella è solo del Re
  const id = L.sq.bonus;
  L.sq = null; L.nextAt = (g.ply || 0) + LUCKY_GAP;
  const info = S.luckyInfo(id);
  const team = S.TEAM[color];
  if (info.held) {
    g.items[color].push(S.LUCKY_BONUS[id].item);
    log(g, `${team} trova ${info.label} sulla casella fortunata: aggiunto ai suoi strumenti.`);
    event(g, p.r, p.c, info.label, 'buff');
    return;
  }
  if (p.role === 're') {
    log(g, `${team} trova ${info.label} con il Re: il bonus va sprecato.`);
    event(g, p.r, p.c, 'Sprecato', 'weak');
    return;
  }
  if (id === 'cura') { p.hp = Math.min(p.maxHp, p.hp + 3); event(g, p.r, p.c, '+3 HP', 'heal'); }
  else if (id === 'rabbia') { p.rage = 4; event(g, p.r, p.c, 'Rabbia', 'buff'); }
  else if (id === 'corazza') { p.guard = 4; event(g, p.r, p.c, 'Corazza', 'buff'); }
  log(g, `${name(p)} trova ${info.label} sulla casella fortunata.`);
}

// ---------- turni ----------
function endTurn(g) {
  if (g.phase === 'over') return;
  if (checkWaveCleared(g)) return;
  if (g.puzzle && g.turn === 'w') { // Puzzle: finisce una tua mossa
    g.puzzle.used++;
    if (puzzleGoalMet(g)) { g.phase = 'over'; g.winner = 'w'; g.reason = 'Puzzle risolto!'; log(g, 'Puzzle risolto!'); return; }
  }
  const prev = g.turn;
  const next = other(prev);
  // la Paralisi dura un solo turno: finisce quando chi la subiva ha "saltato" il suo
  for (const p of Object.values(g.pieces)) if (p.color === prev) { p.frozen = false; if (p.rage) p.rage--; if (p.guard) p.guard--; }
  g.turn = next;
  g.ply = (g.ply || 0) + 1;
  luckyTick(g);
  g.shieldLock = null;
  g.freeUsed = false;
  const chk = inCheck(g, next);
  const noMoves = Object.keys(legalMoves(g, next)).length === 0;
  const king = Object.values(g.pieces).find((p) => p.alive && p.color === next && p.role === 're');
  if (g.surv && next === 'b' && noMoves) { // nemici bloccati o paralizzati: saltano il turno
    log(g, 'Il Rosso non ha mosse: salta il turno.');
    for (const p of Object.values(g.pieces)) if (p.color === 'b') p.frozen = false;
    g.turn = 'w';
    if (!Object.keys(legalMoves(g, 'w')).length && !inCheck(g, 'w')) { g.phase = 'over'; g.winner = null; g.reason = 'Stallo: non hai mosse'; g.surv.state = 'lost'; log(g, 'Stallo: la corsa finisce.'); }
    return;
  }
  if (noMoves && chk && !itemCanResolve(g, next)) {
    g.phase = 'over';
    g.winner = prev;
    g.reason = `Scacco matto: vince il ${S.TEAM[prev]}`;
    log(g, `Scacco matto al Re ${S.TEAM[next]}! Vince il ${S.TEAM[prev]}.`);
    if (king) event(g, king.r, king.c, 'Matto!', 'kill');
  } else if (noMoves && !chk) {
    g.phase = 'over';
    g.winner = null;
    g.reason = `Stallo: il ${S.TEAM[next]} non ha mosse`;
    log(g, `Stallo! Il ${S.TEAM[next]} non ha mosse: patta.`);
  } else if (chk) {
    log(g, `Scacco al Re ${S.TEAM[next]}!`);
    if (king) event(g, king.r, king.c, 'Scacco!', 'check');
  }
  if (g.puzzle && g.phase === 'play' && prev === 'w' && g.puzzle.used >= g.puzzle.moves) { // mosse finite senza aver risolto
    g.phase = 'over'; g.winner = null; g.reason = 'Mosse finite: puzzle non risolto'; log(g, 'Mosse finite: puzzle non risolto.');
  }
}

// ---------- Puzzle ----------
// Pezzo: [ruolo, tipo, HP, riga, colonna, extra?] con extra 'dead' (nel cimitero), 'shield', 'boost'. Il Re: ['re', null, 0, r, c].
function puzzleGame(def) {
  const g = newGame();
  g.pieces = {}; g.graveyard = { w: [], b: [] };
  for (const color of ['w', 'b']) (def[color] || []).forEach((e, i) => {
    const id = color + i;
    const p = mkPiece(id, color, e[0], e[3], e[4]);
    p.type = e[1] || null;
    if (e[0] !== 're') p.hp = Math.max(1, Math.min(e[2] || p.maxHp, p.maxHp));
    p.hasMoved = true; // niente arrocco nei puzzle
    if (e[5] === 'dead') { p.alive = false; g.graveyard[color].push(id); }
    if (e[5] === 'shield') p.shield = true;
    if (e[5] === 'boost') p.boost = true;
    g.pieces[id] = p;
  });
  const it = def.items || {};
  g.items = { w: (it.w || []).slice(), b: (it.b || []).slice() };
  g.itemsReady = { w: true, b: true };
  g.picks = S.DRAFT_PICKS;
  g.phase = 'play'; g.turn = 'w'; g.winner = null; g.reason = null;
  const goal = def.goal || { type: 'mate' };
  g.puzzle = { id: def.id, goal: { type: goal.type, target: goal.target != null ? 'b' + goal.target : null }, moves: def.moves, used: 0 };
  log(g, `Puzzle: ${def.title}.`);
  return g;
}
function puzzleGoalMet(g) {
  const goal = g.puzzle.goal;
  if (goal.type === 'kill') return !!g.pieces[goal.target] && !g.pieces[goal.target].alive;
  if (goal.type === 'clear') return !Object.values(g.pieces).some((p) => p.color === 'b' && p.alive && p.role !== 're');
  return false;
}

function promote(g, p, role) {
  const st = S.ROLES[role];
  p.role = role;
  p.maxHp = st.hp;
  p.hp = st.hp;
  p.atk = st.atk;
  log(g, `${cap(p.type || 'pedone')} promosso a ${cap(role)} (${S.TEAM[p.color]}).`);
}

function move(g, color, id, r, c) {
  if (g.phase !== 'play') return 'La partita non è in corso';
  if (g.turn !== color) return 'Non è il tuo turno';
  if (g.pending) return 'Scegli prima la promozione';
  const p = own(g, color, id);
  if (!p) return 'Pezzo non valido';
  if (p.frozen) return 'Questo pezzo è paralizzato';
  if (g.shieldLock === p.id) return 'Ha appena ricevuto lo Scudo: muovi un altro pezzo';
  if (!(legalMoves(g, color)[id] || []).find((m) => m.r === r && m.c === c)) {
    const basic = movesFor(p, grid(g)).find((m) => m.r === r && m.c === c);
    if (!basic) return 'Mossa non valida';
    return inCheck(g, color) ? 'Sei sotto scacco: quella mossa non lo risolve' : 'Il tuo Re finirebbe sotto scacco';
  }
  const moved = applyMoveCore(g, color, p, r, c);
  if (g.phase === 'over') return null;
  if (moved) luckyPickup(g, color, p);

  const lastRow = color === 'w' ? 0 : 7;
  if (moved && p.role === 'pedone' && p.r === lastRow) {
    if (g.items[color].includes('pietra')) { g.pending = { id: p.id }; return null; }
    promote(g, p, 'cavallo');
  }
  endTurn(g);
  return null;
}

function choosePromotion(g, color, role) {
  if (g.phase !== 'play' || g.turn !== color || !g.pending) return 'Nessuna promozione in attesa';
  if (!['regina', 'torre', 'alfiere', 'cavallo'].includes(role)) return 'Ruolo non valido';
  const p = g.pieces[g.pending.id];
  if (role !== 'cavallo') {
    const i = g.items[color].indexOf('pietra');
    if (i < 0) return 'Ti serve una Pietra Evolutiva';
    if (!g.sandbox) g.items[color].splice(i, 1);
  }
  promote(g, p, role);
  g.pending = null;
  endTurn(g);
  return null;
}

function useItem(g, color, a) {
  if (g.phase !== 'play') return 'La partita non è in corso';
  if (g.turn !== color) return 'Non è il tuo turno';
  if (g.pending) return 'Scegli prima la promozione';
  if (!a || typeof a.item !== 'string') return 'Strumento non valido';
  const idx = g.items[color].indexOf(a.item);
  if (idx < 0) return 'Non hai questo strumento';
  const free = !!(S.ITEMS[a.item] && S.ITEMS[a.item].free);
  if (free && g.freeUsed) return 'Hai già usato un\'azione gratuita in questo turno';
  // prova su una copia
  const sim = simClone(g);
  const err = applyItem(sim, color, a);
  if (err) return err;
  if (free) {
    // azione gratuita: dopo deve restare almeno una mossa possibile con un altro pezzo
    if (Object.keys(legalMoves(sim, color)).length === 0) return 'Dopo non ti resterebbe nessuna mossa: scegli un altro strumento';
  } else if (inCheck(sim, color)) {
    // gli strumenti che costano il turno non devono lasciare il Re sotto scacco
    return inCheck(g, color) ? 'Sei sotto scacco: questo strumento non lo risolve' : 'Il tuo Re finirebbe sotto scacco';
  }
  applyItem(g, color, a);
  if (!g.sandbox) g.items[color].splice(idx, 1); // nel campo di prova gli strumenti sono illimitati
  if (!free) endTurn(g);
  return null;
}

function resign(g, color) {
  if (g.phase !== 'play') return 'La partita non è in corso';
  g.phase = 'over';
  g.winner = other(color);
  g.reason = `${S.TEAM[color]} si è arreso`;
  log(g, g.reason + '.');
  return null;
}

// ---------- stato inviato ai giocatori ----------
// chi deve agire adesso (per la partita in locale, dove i due giocatori usano lo stesso dispositivo)
function actingColor(g) {
  if (g.phase === 'items') return g.itemsReady.w ? 'b' : 'w';
  if (g.phase === 'over') return g.winner || 'w';
  return g.turn;
}

// ---------- campo di prova ----------
// Posizione libera da modificare a piacere; si può giocare (un solo dispositivo) e tornare a modificare.
function sandboxGame(preset) {
  const g = newGame();
  g.sandbox = true; g.phase = 'play'; g.picks = 30; g.turn = 'w';
  g.itemsReady = { w: true, b: true };
  g.items = { w: S.ITEM_IDS.slice(), b: S.ITEM_IDS.slice() };
  let i = 0;
  for (const color of ['w', 'b']) {
    i = 0;
    for (const p of Object.values(g.pieces)) {
      if (p.color !== color || p.role === 're') continue;
      if (preset === 'empty') delete g.pieces[p.id];
      else p.type = S.TYPES[Math.floor(i++ / 2) % 8];
    }
  }
  log(g, preset === 'empty' ? 'Campo di prova: scacchiera vuota (solo i Re).' : 'Campo di prova: posizione iniziale.');
  return g;
}
const isHome = (role, color, r, c) => r === (color === 'w' ? 7 : 0) && BACK_RANK[c] === role;
function sandboxEdit(g, a) {
  if (!g.sandbox || !a) return 'Non sei nel campo di prova';
  const sq = () => inb(a.r, a.c);
  const pieceAtSq = () => grid(g)[a.r][a.c];
  const piece = () => { const p = g.pieces[a.id]; return p && p.alive ? p : null; };
  switch (a.op) {
    case 'reset': {
      const fresh = sandboxGame(a.preset === 'empty' ? 'empty' : 'start');
      for (const k of Object.keys(g)) delete g[k];
      Object.assign(g, fresh);
      return null;
    }
    case 'put': {
      if (!sq()) return 'Casella non valida';
      if (!['w', 'b'].includes(a.color)) return 'Colore non valido';
      if (!S.ROLES[a.role]) return 'Pezzo non valido';
      const type = a.type || null;
      if (type && !S.TYPES.includes(type)) return 'Tipo non valido';
      const cur = pieceAtSq();
      if (a.role === 're') { // c'è un solo Re per colore: si sposta
        const k = Object.values(g.pieces).find((p) => p.role === 're' && p.color === a.color);
        if (cur && cur !== k) return 'La casella è occupata';
        k.r = a.r; k.c = a.c; k.hasMoved = !isHome('re', a.color, a.r, a.c);
        break;
      }
      if (cur && cur.role === 're') return 'Su quella casella c\'è un Re: spostalo prima';
      if (cur) delete g.pieces[cur.id];
      let n = 100; while (g.pieces['x' + n]) n++;
      const p = mkPiece('x' + n, a.color, a.role, a.r, a.c);
      p.type = type; p.hasMoved = !isHome(a.role, a.color, a.r, a.c);
      g.pieces[p.id] = p;
      break;
    }
    case 'remove': case 'kill': {
      if (!sq()) return 'Casella non valida';
      const p = pieceAtSq();
      if (!p) return 'Nessun pezzo qui';
      if (p.role === 're') return 'I Re non si tolgono (spostali)';
      if (a.op === 'kill') { p.alive = false; g.graveyard[p.color].push(p.id); }
      else { delete g.pieces[p.id]; for (const c of ['w', 'b']) g.graveyard[c] = g.graveyard[c].filter((x) => x !== p.id); }
      break;
    }
    case 'move': {
      const p = piece();
      if (!p || !sq()) return 'Mossa non valida';
      const cur = pieceAtSq();
      if (cur && cur !== p) return 'La casella è occupata';
      p.r = a.r; p.c = a.c; p.hasMoved = !(isHome(p.role, p.color, p.r, p.c));
      break;
    }
    case 'set': {
      const p = piece();
      if (!p) return 'Pezzo non valido';
      const v = a.value;
      switch (a.field) {
        case 'type': if (p.role === 're') return 'Il Re non ha tipo'; if (v !== null && !S.TYPES.includes(v)) return 'Tipo non valido'; p.type = v; break;
        case 'hp': if (p.role === 're') return 'Il Re non ha HP'; if (!Number.isInteger(v) || v < 1) return 'HP non validi'; p.hp = Math.min(v, p.maxHp); break;
        case 'maxHp': if (p.role === 're') return 'Il Re non ha HP'; if (!Number.isInteger(v) || v < 1 || v > 40) return 'HP massimi non validi'; p.maxHp = v; p.hp = Math.min(p.hp, v); break;
        case 'role': {
          if (p.role === 're' || !S.ROLES[v] || v === 're') return 'Pezzo non valido';
          const st = S.ROLES[v]; p.role = v; p.maxHp = p.hp = st.hp; p.atk = st.atk; break;
        }
        case 'color': if (p.role === 're') return 'Il Re non cambia squadra'; if (!['w', 'b'].includes(v)) return 'Colore non valido'; p.color = v; break;
        case 'shield': case 'boost': case 'frozen': if (typeof v !== 'boolean') return 'Valore non valido'; p[a.field] = v; break;
        case 'rage': case 'guard': if (!Number.isInteger(v) || v < 0 || v > 9) return 'Valore non valido'; p[a.field] = v; break;
        default: return 'Campo sconosciuto';
      }
      break;
    }
    case 'items': {
      if (!['w', 'b'].includes(a.color) || !Array.isArray(a.list) || !a.list.every((i) => S.ITEM_IDS.includes(i))) return 'Strumenti non validi';
      g.items[a.color] = S.ITEM_IDS.filter((i) => a.list.includes(i));
      break;
    }
    case 'turn': if (!['w', 'b'].includes(a.color)) return 'Colore non valido'; g.turn = a.color; break;
    default: return 'Operazione sconosciuta';
  }
  // dopo una modifica la partita riprende da capo: niente promozioni in sospeso, matto o patta cancellati
  g.phase = 'play'; g.winner = null; g.reason = null; g.pending = null; g.shieldLock = null; g.freeUsed = false; g.event = null; g.lastMove = null;
  return null;
}

function publicState(room, color) {
  const g = room.game;
  const opp = other(color);
  const reveal = g.phase === 'play' || g.phase === 'over';
  const myTurn = g.phase === 'play' && g.turn === color && !g.pending;
  const live = g.phase === 'play' || g.phase === 'over';
  return {
    code: room.code,
    you: color,
    phase: g.phase,
    turn: g.turn,
    connected: { w: !!(room.players.w && (room.players.w.sid || room.players.w.bot || room.players.w.local)), b: !!(room.players.b && (room.players.b.sid || room.players.b.bot || room.players.b.local)) },
    bot: room.bot ? { color: room.bot.color, level: room.bot.level } : null,
    local: !!room.local,
    sandbox: !!g.sandbox,
    run: g.run ? { stage: g.run.stage, bonuses: g.run.bonuses, color: g.run.color, choices: SC.choicesNeeded(g.run), undoLeft: room.undoLeft || 0 } : null,
    puzzle: g.puzzle ? { id: g.puzzle.id, goal: g.puzzle.goal, moves: g.puzzle.moves, used: g.puzzle.used, state: g.phase === 'over' ? (g.winner === 'w' ? 'solved' : 'failed') : 'play' } : null,
    surv: g.surv ? { wave: g.surv.wave, cleared: g.surv.cleared, state: g.phase === 'over' && g.surv.state !== 'cleared' ? 'lost' : g.surv.state, bonusDue: g.surv.bonusDue, every: SV.EVERY, bonusNow: SV.BONUS_NOW, bonusKeep: SV.BONUS_KEEP, random: g.surv.random, enemies: Object.values(g.pieces).filter((p) => p.color === 'b' && p.alive).length } : null,
    kit: kitInfo(g, color),
    mods: g.mods,
    lucky: g.lucky && g.mods.lucky ? { vis: g.mods.lucky.vis, sq: g.lucky.sq && g.mods.lucky.vis !== 'hidden' ? { r: g.lucky.sq.r, c: g.lucky.sq.c, bonus: g.mods.lucky.vis === 'full' ? g.lucky.sq.bonus : null } : null } : null,
    spectators: room.spectators ? room.spectators.size : 0,
    names: { w: (room.players.w && room.players.w.name) || '', b: (room.players.b && room.players.b.name) || '' },
    drawOffer: room.drawOffer || null,
    canUndo: !g.surv && !g.puzzle && !!((room.bot || room.local) && room.snaps && room.snaps.length) && (!room.run || (room.undoLeft > 0 && g.phase === 'play')),
    pieces: Object.values(g.pieces),
    counts: typeCounts(g),
    picks: g.picks,
    itemsReady: g.itemsReady,
    items: { [color]: g.items[color], [opp]: reveal ? g.items[opp] : [] },
    graveyard: g.graveyard,
    pending: g.pending && g.turn === color ? g.pending : null,
    pendingBy: g.pending ? g.turn : null,
    shieldLock: g.shieldLock,
    freeUsed: g.freeUsed,
    check: { w: live && inCheck(g, 'w'), b: live && inCheck(g, 'b') },
    legal: myTurn ? legalMoves(g, color) : {},
    winner: g.winner,
    reason: g.reason,
    log: g.log,
    lastMove: g.lastMove,
    event: g.event,
  };
}

module.exports = {
  puzzleGame, itemCanResolve, newGame, kitInfo, startDraft, nextWave, placePiece, resetPlacement, startWave, draftPick, setItems, move, choosePromotion, useItem, resign,
  legalMoves, inCheck, calcDamage, movesFor, grid, publicState, typeCounts, other,
  actingColor, simClone, sameShade, sandboxGame, sandboxEdit, applyMoveCore, applyItem, // usate dal bot per simulare
};
