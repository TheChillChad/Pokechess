// Avversario controllato dal computer. Usa solo l'API pubblica di game.js:
// per scegliere simula le mosse su copie della partita e poi gioca con le stesse funzioni dei giocatori.
const G = require('./game.js');
const S = require('./public/shared.js');

const VAL = { pedone: 1, cavallo: 3, alfiere: 3, torre: 5, regina: 9, re: 0 };
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// valutazione dal punto di vista di `me`: materiale pesato dagli HP rimasti
function ev(g, me) {
  if (g.phase === 'over') return g.winner === me ? 1000 : g.winner === null ? 0 : -1000;
  let v = 0;
  for (const p of Object.values(g.pieces)) {
    if (!p.alive || p.role === 're') continue;
    const x = VAL[p.role] * (0.4 + 0.6 * p.hp / p.maxHp);
    v += p.color === me ? x : -x;
  }
  return v;
}

function promoSim(sim, p) {
  if (p.role === 'pedone' && (p.r === 0 || p.r === 7)) {
    const st = S.ROLES.cavallo;
    p.role = 'cavallo'; p.hp = p.maxHp = st.hp; p.atk = st.atk;
  }
}
function play(sim, color, id, r, c) {
  const p = sim.pieces[id];
  const moved = G.applyMoveCore(sim, color, p, r, c);
  if (moved) promoSim(sim, p);
}
function endSim(sim, color) {
  for (const p of Object.values(sim.pieces)) if (p.color === color) p.frozen = false;
  sim.shieldLock = null;
  sim.turn = G.other(color);
}

// punteggio dopo la migliore risposta dell'avversario (cerca anche il matto)
function replyScore(sim, me) {
  const opp = G.other(me);
  const lm = G.legalMoves(sim, opp);
  const ids = Object.keys(lm);
  if (!ids.length) return G.inCheck(sim, opp) ? 1000 : 0;
  let worst = Infinity;
  for (const id of ids) for (const m of lm[id]) {
    const s2 = G.simClone(sim);
    play(s2, opp, id, m.r, m.c);
    let v = ev(s2, me);
    if (v > worst) continue;
    if (G.inCheck(s2, me) && Object.keys(G.legalMoves(s2, me)).length === 0) v = -1000;
    if (v < worst) worst = v;
  }
  return worst;
}

// ---------- draft ----------
function draft(g, color) {
  const mine = Object.values(g.pieces).filter((p) => p.alive && p.color === color && p.role !== 're' && !p.type);
  const order = ['regina', 'torre', 'cavallo', 'alfiere', 'pedone'];
  mine.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || Math.random() - 0.5);
  const piece = mine[0];
  const counts = G.typeCounts(g)[color];
  const enemies = Object.values(g.pieces).filter((p) => p.color !== color && p.type);
  let best = [], bestScore = -Infinity;
  for (const t of S.TYPES) {
    if (counts[t] >= S.MAX_PER_TYPE) continue;
    let sc = Math.random() * 0.5;
    for (const e of enemies) sc += VAL[e.role] * (S.mult(t, e.type) - S.mult(e.type, t));
    if (sc > bestScore) { bestScore = sc; best = [t]; }
  }
  return G.draftPick(g, color, piece.id, best[0]);
}

function kit(g, color, level) {
  const list = level === 'easy'
    ? shuffle(S.ITEM_IDS).slice(0, S.KIT_SIZE)
    : ['bomba'].concat(shuffle(['paralisi', 'scudo', 'pozione', 'revitalizzante', 'pietra']).slice(0, S.KIT_SIZE - 1));
  return G.setItems(g, color, list);
}

// ---------- partita ----------
function cands(g, color, level) {
  const opp = G.other(color);
  const out = [];
  const lm = G.legalMoves(g, color);
  for (const id of Object.keys(lm)) for (const m of lm[id]) {
    const sim = G.simClone(g);
    play(sim, color, id, m.r, m.c);
    endSim(sim, color);
    const score = level === 'easy' ? ev(sim, color) + Math.random() * 2.5 : replyScore(sim, color) + Math.random() * 0.05;
    out.push({ kind: 'move', id, r: m.r, c: m.c, score });
  }
  if (level === 'easy') return out;

  const kitNow = g.items[color];
  const enemies = Object.values(g.pieces).filter((p) => p.alive && p.color === opp && p.role !== 're');
  const mine = Object.values(g.pieces).filter((p) => p.alive && p.color === color && p.role !== 're');
  const pushItem = (a, cost, free) => {
    const sim = G.simClone(g);
    if (G.applyItem(sim, color, a)) return;
    if (free) {
      const lm2 = G.legalMoves(sim, color);
      let bestMv = null, bestV = -Infinity;
      for (const id of Object.keys(lm2)) for (const m of lm2[id]) {
        const s2 = G.simClone(sim);
        play(s2, color, id, m.r, m.c);
        const v = ev(s2, color);
        if (v > bestV) { bestV = v; bestMv = { id, m }; }
      }
      if (!bestMv) return;
      play(sim, color, bestMv.id, bestMv.m.r, bestMv.m.c);
    } else if (G.inCheck(sim, color)) return;
    endSim(sim, color);
    out.push({ kind: 'item', a, score: replyScore(sim, color) - cost });
  };
  if (kitNow.includes('bomba')) for (const t of enemies) pushItem({ item: 'bomba', id: t.id }, 0.8, false);
  if (kitNow.includes('pozione')) for (const p of mine) if (p.maxHp - p.hp >= 3) pushItem({ item: 'pozione', id: p.id }, 0.8, false);
  if (kitNow.includes('revitalizzante') && g.graveyard[color].length) {
    const rows = color === 'w' ? [6, 7] : [0, 1];
    const gr = G.grid(g);
    const free = [];
    for (const r of rows) for (let c = 0; c < 8; c++) if (!gr[r][c]) free.push([r, c]);
    for (const id of g.graveyard[color]) for (const [r, c] of shuffle(free).slice(0, 3)) pushItem({ item: 'revitalizzante', id, r, c }, 0.8, false);
  }
  if (!g.freeUsed) {
    const oppMoves = G.legalMoves(g, opp);
    const attacked = new Set();
    for (const id of Object.keys(oppMoves)) for (const m of oppMoves[id]) if (m.kind === 'attack') attacked.add(m.r * 8 + m.c);
    if (kitNow.includes('scudo')) {
      const t = mine.filter((p) => attacked.has(p.r * 8 + p.c) && !p.shield).sort((a, b) => VAL[b.role] - VAL[a.role]).slice(0, 3);
      for (const p of t) pushItem({ item: 'scudo', id: p.id }, 0.6, true);
    }
    if (kitNow.includes('paralisi')) {
      const t = enemies.filter((p) => (oppMoves[p.id] || []).some((m) => m.kind === 'attack') && !p.frozen)
        .sort((a, b) => VAL[b.role] * b.atk - VAL[a.role] * a.atk).slice(0, 4);
      for (const p of t) pushItem({ item: 'paralisi', id: p.id }, 0.6, true);
    }
  }
  return out;
}

function playTurn(g, color, level) {
  if (g.pending) return G.choosePromotion(g, color, g.items[color].includes('pietra') ? 'regina' : 'cavallo');
  const list = cands(g, color, level).sort((a, b) => b.score - a.score);
  if (level === 'easy' && Math.random() < 0.2) {
    const moves = list.filter((c) => c.kind === 'move');
    if (moves.length) list.unshift(moves[rnd(moves.length)]);
  }
  for (const c of list) {
    const err = c.kind === 'move' ? G.move(g, color, c.id, c.r, c.c) : G.useItem(g, color, c.a);
    if (!err) return null;
  }
  return rescue(g, color);
}

// Nessuna mossa: l'ultima speranza è uno strumento che scioglie lo scacco (anche Cambio, che il bot di norma non usa)
function rescue(g, color) {
  const mine = Object.values(g.pieces).filter((p) => p.alive && p.color === color);
  const foes = Object.values(g.pieces).filter((p) => p.alive && p.color !== color && p.role !== 're');
  const tries = [];
  for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) tries.push({ item: 'cambio', a: mine[i].id, b: mine[j].id });
  for (const t of foes) { tries.push({ item: 'bomba', id: t.id }); tries.push({ item: 'paralisi', id: t.id }); }
  const rows = color === 'w' ? [6, 7] : [0, 1];
  for (const id of g.graveyard[color]) for (const r of rows) for (let c = 0; c < 8; c++) tries.push({ item: 'revitalizzante', id, r, c });
  for (const a of tries) if (g.items[color].includes(a.item) && !G.useItem(g, color, a)) return null;
  return 'nessuna mossa';
}

// Fa UNA azione del bot nella fase corrente. Restituisce errore o null.
function act(g, color, level) {
  if (g.phase === 'draft') return g.turn === color ? draft(g, color) : null;
  if (g.phase === 'items') return g.itemsReady[color] ? null : kit(g, color, level);
  if (g.phase === 'play') return g.turn === color ? playTurn(g, color, level) : null;
  return null;
}

// il bot deve agire adesso?
function needsAction(g, color) {
  if (g.phase === 'draft' || g.phase === 'play') return g.turn === color;
  if (g.phase === 'items') return !g.itemsReady[color];
  return false;
}

module.exports = { act, needsAction };
