// Logica di gioco (nessuna dipendenza da rete o grafica).
// Coordinate: r = riga 0..7 (0 = fondo del Rosso, 7 = fondo del Blu), c = colonna 0..7.
// Colori interni: 'w' = Blu (muove per primo), 'b' = Rosso.
const S = require('./public/shared.js');

const BACK_RANK = ['torre', 'cavallo', 'alfiere', 'regina', 're', 'alfiere', 'cavallo', 'torre'];
const other = (c) => (c === 'w' ? 'b' : 'w');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const inb = (r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < 8 && c >= 0 && c < 8;

function mkPiece(id, color, role, r, c) {
  const st = S.ROLES[role];
  return { id, color, role, type: null, hp: st.hp, maxHp: st.hp, atk: st.atk, r, c, alive: true, shield: false, boost: false, frozen: false };
}

function newGame() {
  const pieces = {};
  for (const color of ['w', 'b']) {
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
    itemsReady: { w: false, b: false },
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
  };
}

// ---------- utilità ----------
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
// Il Re è sotto scacco se un pezzo avversario potrebbe attaccare la sua casella.
function inCheck(g, color) {
  const king = Object.values(g.pieces).find((p) => p.alive && p.color === color && p.role === 're');
  if (!king) return false;
  const gr = grid(g);
  for (const p of Object.values(g.pieces)) {
    if (!p.alive || p.color === color || p.frozen) continue; // un pezzo paralizzato non può attaccare
    if (movesFor(p, gr).some((m) => m.kind === 'attack' && m.r === king.r && m.c === king.c)) return true;
  }
  return false;
}

// ---------- danno ----------
function calcDamage(att, def) {
  let eff = 1;
  let base;
  if (att.role === 're') base = att.atk * 2; // il Re ignora i tipi
  else { eff = S.mult(att.type, def.type); base = att.atk * eff; }
  if (att.boost) base *= 1.5;
  return { dmg: Math.max(1, Math.round(base)), eff };
}

function preview(att, def) {
  if (def.shield) return { shield: true, dmg: 0 };
  const { dmg, eff } = calcDamage(att, def);
  return { dmg, eff, kill: dmg >= def.hp };
}

// Applica una mossa o un attacco (senza cambiare turno). Usata anche per le simulazioni.
function applyMoveCore(g, color, p, r, c) {
  const t = grid(g)[r][c];
  const from = [p.r, p.c];
  let moved = false;
  if (!t) {
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
      const { dmg, eff } = calcDamage(p, t);
      p.boost = false;
      t.hp = Math.max(0, t.hp - dmg);
      const txt = eff > 1 ? ' super efficace!' : eff < 1 ? ' poco efficace…' : '';
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
  g.lastMove = { from, to: [r, c] };
  return moved;
}

// Mosse legali: quelle che non lasciano il proprio Re sotto scacco (simulando anche i danni).
// Il Re avversario non si può mai colpire: si dà scacco e si cerca il matto.
function legalMoves(g, color) {
  const gr = grid(g);
  const res = {};
  for (const p of Object.values(g.pieces)) {
    if (!p.alive || p.color !== color) continue;
    if (p.frozen || g.shieldLock === p.id) continue; // paralizzato, o appena protetto dallo Scudo
    const mv = [];
    for (const m of movesFor(p, gr)) {
      const target = m.kind === 'attack' ? gr[m.r][m.c] : null;
      if (target && target.role === 're') continue;
      const sim = simClone(g);
      applyMoveCore(sim, color, sim.pieces[p.id], m.r, m.c);
      if (inCheck(sim, color)) continue;
      if (target) Object.assign(m, preview(p, target));
      mv.push(m);
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
  if (g.picks >= S.DRAFT_PICKS) {
    g.phase = 'items';
    g.turn = 'w';
    log(g, 'Draft finito. Ora scegliete 3 strumenti a testa.');
  } else {
    g.turn = S.draftTurn(g.picks); // serpentina: A B B A A B B A …
  }
  return null;
}

function setItems(g, color, list) {
  if (g.phase !== 'items') return 'Non è il momento di scegliere gli strumenti';
  if (g.itemsReady[color]) return 'Hai già scelto';
  if (!Array.isArray(list) || list.length !== S.KIT_SIZE || !list.every((i) => S.ITEM_IDS.includes(i))) {
    return `Scegli esattamente ${S.KIT_SIZE} strumenti`;
  }
  g.items[color] = list.slice();
  g.itemsReady[color] = true;
  if (g.itemsReady.w && g.itemsReady.b) {
    g.phase = 'play';
    g.turn = 'w';
    log(g, 'Si parte! Muove il Blu.');
  }
  return null;
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
      log(g, `${team} usa Paralisi su ${name(t)}: salta il prossimo turno.`);
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
        t.hp = Math.max(0, t.hp - 3);
        if (t.hp === 0) {
          t.alive = false;
          g.graveyard[t.color].push(t.id);
          log(g, `${team} lancia una Bomba su ${name(t)}: −3 HP, sconfitto!`);
          event(g, t.r, t.c, '−3', 'kill');
        } else {
          log(g, `${team} lancia una Bomba su ${name(t)}: −3 HP (restano ${t.hp}).`);
          event(g, t.r, t.c, '−3', 'hit');
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
      p.alive = true; p.r = a.r; p.c = a.c;
      p.hp = Math.ceil(p.maxHp / 2);
      p.shield = false; p.boost = false; p.frozen = false;
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
    return !inCheck(sim, color);
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

// ---------- turni ----------
function endTurn(g) {
  if (g.phase === 'over') return;
  const prev = g.turn;
  const next = other(prev);
  // la Paralisi dura un solo turno: finisce quando chi la subiva ha "saltato" il suo
  for (const p of Object.values(g.pieces)) if (p.color === prev) p.frozen = false;
  g.turn = next;
  g.shieldLock = null;
  g.freeUsed = false;
  const chk = inCheck(g, next);
  const noMoves = Object.keys(legalMoves(g, next)).length === 0;
  const king = Object.values(g.pieces).find((p) => p.alive && p.color === next && p.role === 're');
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
  if (!movesFor(p, grid(g)).find((m) => m.r === r && m.c === c)) return 'Mossa non valida';
  if (!(legalMoves(g, color)[id] || []).find((m) => m.r === r && m.c === c)) {
    return inCheck(g, color) ? 'Sei sotto scacco: quella mossa non lo risolve' : 'Il tuo Re finirebbe sotto scacco';
  }
  const moved = applyMoveCore(g, color, p, r, c);
  if (g.phase === 'over') return null;

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
    g.items[color].splice(i, 1);
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
  if (free && g.freeUsed) return 'Hai già usato lo Scudo in questo turno';
  // prova su una copia
  const sim = simClone(g);
  const err = applyItem(sim, color, a);
  if (err) return err;
  if (free) {
    // azione gratuita: dopo deve restare almeno una mossa possibile con un altro pezzo
    if (Object.keys(legalMoves(sim, color)).length === 0) return 'Dopo lo Scudo non ti resterebbe nessuna mossa';
  } else if (inCheck(sim, color)) {
    // gli strumenti che costano il turno non devono lasciare il Re sotto scacco
    return inCheck(g, color) ? 'Sei sotto scacco: questo strumento non lo risolve' : 'Il tuo Re finirebbe sotto scacco';
  }
  applyItem(g, color, a);
  g.items[color].splice(idx, 1);
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
    connected: { w: !!(room.players.w && room.players.w.sid), b: !!(room.players.b && room.players.b.sid) },
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
  newGame, draftPick, setItems, move, choosePromotion, useItem, resign,
  legalMoves, inCheck, calcDamage, movesFor, grid, publicState, typeCounts, other,
};
