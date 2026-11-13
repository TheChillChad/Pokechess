// Avversario controllato dal computer. Usa solo l'API pubblica di game.js:
// per scegliere simula le mosse su copie della partita e poi gioca con le stesse funzioni dei giocatori.
const G = require('./game.js');
const S = require('./public/shared.js');

const VAL = { pedone: 1, cavallo: 3, alfiere: 3, torre: 5, regina: 9, re: 0 };
const LUCK = 1.2;
const MOPUP = true; // quanto vale per il bot prendere una casella fortunata
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// valutazione dal punto di vista di `me`: materiale pesato dagli HP rimasti, più un piccolo premio per i pedoni avanzati
function ev(g, me) {
  if (g.phase === 'over') return g.winner === me ? 1000 : g.winner === null ? 0 : -1000;
  let v = 0, ek = null;
  for (const p of Object.values(g.pieces)) {
    if (!p.alive) continue;
    if (p.role === 're') { if (p.color !== me) ek = p; continue; }
    let x = VAL[p.role] * (0.4 + 0.6 * p.hp / p.maxHp);
    if (p.role === 'pedone') { const adv = p.color === 'w' ? 6 - p.r : p.r - 1; x += 0.04 * adv + (adv >= 4 ? 0.15 * (adv - 3) : 0); }
    v += p.color === me ? x : -x;
  }
  // Convertire il vantaggio: quando si è avanti, si spinge il Re avversario verso il bordo e lo si avvicina
  // (altrimenti il bot si ferma ad "avere più materiale" senza mai dare matto)
  if (MOPUP && ek && v > 2) {
    let mk = null;
    for (const p of Object.values(g.pieces)) if (p.alive && p.role === 're' && p.color === me) mk = p;
    const edge = Math.abs(ek.r - 3.5) + Math.abs(ek.c - 3.5);
    const near = mk ? 8 - Math.max(Math.abs(ek.r - mk.r), Math.abs(ek.c - mk.c)) : 0;
    v += Math.min(v, 6) / 6 * (0.12 * edge + 0.06 * near);
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

// Passo di simulazione leggero (senza log né griglie): copia solo i pezzi toccati dalla mossa (chi muove, il bersaglio, la Torre dell'arrocco).
// Equivale a simClone + play + endSim, ma molto più veloce. Il test test/test-bot-step.js lo verifica contro la versione lunga.
function stepSim(sim, color, id, m, gr) {
  const pieces = Object.assign({}, sim.pieces);
  const p = Object.assign({}, pieces[id]); pieces[id] = p;
  const t0 = gr[m.r][m.c];
  let graveyard = sim.graveyard, moved = false;
  if (!t0 && p.role === 're' && m.r === p.r && Math.abs(m.c - p.c) === 2) {
    const rk0 = gr[m.r][m.c > p.c ? 7 : 0], rk = Object.assign({}, rk0); pieces[rk.id] = rk;
    rk.c = m.c > p.c ? m.c - 1 : m.c + 1; rk.hasMoved = true;
    p.r = m.r; p.c = m.c; moved = true;
  } else if (!t0) { p.r = m.r; p.c = m.c; moved = true; }
  else {
    const t = Object.assign({}, t0); pieces[t.id] = t;
    if (t.shield) { t.shield = false; p.boost = false; }
    else {
      const { dmg } = G.calcDamage(p, t);
      p.boost = false;
      t.hp = Math.max(0, t.hp - dmg);
      if (t.hp === 0) {
        t.alive = false;
        graveyard = { w: sim.graveyard.w, b: sim.graveyard.b };
        graveyard[t.color] = graveyard[t.color].concat(t.id);
        p.r = m.r; p.c = m.c; moved = true;
      }
    }
  }
  if (moved) { p.hasMoved = true; promoSim(sim, p); }
  for (const k in pieces) { const q = pieces[k]; if (q.color === color && q.frozen) pieces[k] = Object.assign({}, q, { frozen: false }); }
  return Object.assign({}, sim, { pieces, graveyard, shieldLock: null, turn: G.other(color), lastMove: null });
}

// Ordine delle mosse: prima quelle che sconfiggono o ferirebbero di più (più potature = ricerca più profonda)
function ordered(sim, toMove, lm, onlyAttacks, gr, ttm) {
  gr = gr || G.grid(sim);
  const moves = [];
  for (const id of Object.keys(lm)) for (const m of lm[id]) {
    if (ttm && ttm.id === id && ttm.r === m.r && ttm.c === m.c) { moves.push({ id, m, k: 1000 }); continue; }
    if (m.kind !== 'attack') { if (!onlyAttacks) moves.push({ id, m, k: m.kind === 'castle' ? 0.5 : 0 }); continue; }
    const t = gr[m.r][m.c];
    if (m.shield) { if (!onlyAttacks) moves.push({ id, m, k: 0.1 }); continue; }
    const frac = Math.min(1, (m.dmg || 0) / t.hp);
    moves.push({ id, m, k: 1 + VAL[t.role] * (m.kill ? 1 : frac * 0.6) - VAL[sim.pieces[id].role] * 0.02 });
  }
  return moves.sort((x, y) => y.k - x.k);
}

// Ricerca a fine percorso: si continua solo con gli attacchi, così il bot non si ferma "a metà scambio"
// (altrimenti vedrebbe un colpo e non la risposta). Dà anche matto e stallo senza altro lavoro.
let QS = true;
let DELTA = true, USE_TT = true;
const QDEPTH = 3;
function quiesce(sim, me, toMove, alpha, beta, qd, ply) {
  if (sim.phase === 'over') return ev(sim, me);
  const gr = G.grid(sim);
  const lm = G.legalMoves(sim, toMove, gr);
  if (!Object.keys(lm).length) return G.inCheck(sim, toMove) ? (toMove === me ? -1000 + ply : 1000 - ply) : 0;
  const stand = ev(sim, me);
  if (!QS || qd <= 0) return stand;
  const maximizing = toMove === me;
  let best = stand;
  if (maximizing) { if (best >= beta) return best; if (best > alpha) alpha = best; }
  else { if (best <= alpha) return best; if (best < beta) beta = best; }
  for (const { id, m } of ordered(sim, toMove, lm, true, gr)) {
    if (DELTA) { // potatura: un attacco che non può migliorare nemmeno nel caso migliore (materiale + margine) si salta
      const t = gr[m.r][m.c], gain = VAL[t.role] * (m.kill ? 1 : Math.min(1, (m.dmg || 0) / t.hp)) + 1.2;
      if (maximizing ? stand + gain <= alpha : stand - gain >= beta) continue;
    }
    const s2 = stepSim(sim, toMove, id, m, gr);
    const v = quiesce(s2, me, G.other(toMove), alpha, beta, qd - 1, ply + 1);
    if (maximizing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (beta <= alpha) break;
  }
  return best;
}

// Ricerca a profondità limitata (minimax con potatura alfa-beta) dal punto di vista di `me`.
// `toMove` è chi muove nel nodo; a profondità 0 si passa alla ricerca a fine percorso. Scade con il tempo (deadline).
let DEADLINE = Infinity;
const TIMEOUT = new Error('timeout');
let TT = new Map();
const RC = { re: 1, regina: 2, torre: 3, alfiere: 4, cavallo: 5, pedone: 6 };
const TC = {}; S.TYPES.forEach((t, i) => { TC[t] = i + 1; });
function hashSim(sim, toMove) {
  let h1 = toMove === 'w' ? 0x9e3779b9 : 0x7f4a7c15, h2 = 0x85ebca6b;
  for (const p of Object.values(sim.pieces)) {
    if (!p.alive) continue;
    const x = (p.r * 8 + p.c) | (p.hp << 6) | ((p.frozen ? 1 : 0) << 11) | ((p.shield ? 1 : 0) << 12) | ((p.hasMoved ? 1 : 0) << 13) | (RC[p.role] << 14) | ((TC[p.type] || 0) << 17) | ((p.color === 'w' ? 1 : 0) << 21);
    h1 = Math.imul(h1 ^ x, 0x85ebca6b) + 0x27d4eb2f | 0; h1 ^= h1 >>> 15;
    h2 = Math.imul(h2 + x, 0xc2b2ae35) ^ (h2 >>> 13);
  }
  return (h1 & 0x1fffff) * 4294967296 + (h2 >>> 0);
}
function search(sim, me, toMove, depth, alpha, beta, ply) {
  if (Date.now() > DEADLINE) throw TIMEOUT;
  if (sim.phase === 'over') return ev(sim, me);
  if (depth <= 0) return quiesce(sim, me, toMove, alpha, beta, QDEPTH, ply);
  let key = 0, ttm = null;
  const alpha0 = alpha, beta0 = beta;
  if (USE_TT) {
    key = hashSim(sim, toMove);
    const e = TT.get(key);
    if (e) {
      ttm = e.m;
      if (e.d >= depth) {
        if (e.f === 0) return e.v;
        if (e.f === 1 && e.v >= beta) return e.v;
        if (e.f === 2 && e.v <= alpha) return e.v;
      }
    }
  }
  const gr = G.grid(sim);
  const lm = G.legalMoves(sim, toMove, gr);
  if (!Object.keys(lm).length) return G.inCheck(sim, toMove) ? (toMove === me ? -1000 + ply : 1000 - ply) : 0; // matto o stallo
  const maximizing = toMove === me;
  let best = maximizing ? -Infinity : Infinity, bm = null;
  for (const { id, m } of ordered(sim, toMove, lm, false, gr, ttm)) {
    const s2 = stepSim(sim, toMove, id, m, gr);
    const v = search(s2, me, G.other(toMove), depth - 1, alpha, beta, ply + 1);
    if (maximizing) { if (v > best) { best = v; bm = { id, r: m.r, c: m.c }; } if (best > alpha) alpha = best; }
    else { if (v < best) { best = v; bm = { id, r: m.r, c: m.c }; } if (best < beta) beta = best; }
    if (beta <= alpha) break;
  }
  if (USE_TT) {
    const f = best <= alpha0 ? 2 : best >= beta0 ? 1 : 0;
    const old = TT.get(key);
    if (!old || old.d <= depth) TT.set(key, { d: depth, v: best, f, m: bm });
  }
  return best;
}

// livelli: profondità massima (mosse dopo la nostra), tempo a disposizione, ricerca a fine percorso,
// rumore (casualità sul punteggio, in "pedoni") e scivolone (probabilità di giocare una delle migliori 3 mosse a caso)
const LEVELS = {
  easy: { depth: 0, ms: 0, qs: false },
  normal: { depth: 1, ms: 0, qs: false },
  hard: { depth: 3, ms: 1500, qs: true },
  master: { depth: 8, ms: 3500, qs: true },
  quick: { depth: 3, ms: 300, qs: true }, // solo per gli esperimenti dell'arena
  // Scala per la modalità "Scalata": da l1 (principiante) a l10 (come il Maestro). l1 = Facile, l3 = Normale, l7 = Difficile, l10 = Maestro.
  l1: { alias: 'easy' },
  l2: { depth: 1, ms: 0, qs: false, noise: 1.2, slip: 0.35 },
  l3: { alias: 'normal' },
  l4: { depth: 2, ms: 400, qs: false, noise: 0.5, slip: 0.2 },
  l5: { depth: 2, ms: 700, qs: true, noise: 0.35, slip: 0.12 },
  l6: { depth: 3, ms: 1000, qs: true, noise: 0.2, slip: 0.06 },
  l7: { alias: 'hard' },
  l8: { depth: 5, ms: 2300, qs: true },
  l9: { depth: 6, ms: 3000, qs: true },
  l10: { alias: 'master' },
};
const TS = +process.env.BOT_TIME_SCALE || 1; // solo per gli esperimenti (accorcia i tempi)
const resolve = (level) => { let L = LEVELS[level] || LEVELS.normal; if (L.alias) { level = L.alias; L = LEVELS[level]; } return { name: level, L }; };

// Dà un punteggio a tutte le mosse candidate. Approfondimento iterativo: si completa un livello per TUTTE
// le candidate prima di passare al successivo, e se il tempo scade vale l'ultimo livello completato.
function scoreAll(entries, me, level) {
  const L = resolve(level).L;
  const opp = G.other(me);
  QS = L.qs;
  if (TT.size > 400000) TT = new Map();
  DEADLINE = Infinity;
  // Dal secondo livello in poi si parte dalle candidate migliori del livello precedente e si usa il punteggio
  // della migliore come limite: le altre vengono scartate presto (stesso risultato, ricerca molto più rapida).
  let scores = entries.map(() => 0);
  const run = (d, first) => {
    const out = entries.map(() => 0);
    const order = entries.map((_, i) => i).sort((x, y) => scores[y] - entries[y].cost - (scores[x] - entries[x].cost));
    let bestAdj = -Infinity;
    for (const i of order) {
      const e = entries[i];
      const alpha = first || bestAdj === -Infinity ? -Infinity : bestAdj + e.cost - 0.1;
      const v = search(e.sim, me, opp, d, alpha, Infinity, 1);
      out[i] = v;
      if (v - e.cost > bestAdj) bestAdj = v - e.cost;
    }
    return out;
  };
  scores = run(1, true); // il primo livello si completa sempre
  const t0 = Date.now(); DEADLINE = t0 + L.ms * TS;
  for (let d = 2; d <= L.depth; d++) {
    try { scores = run(d, false); } catch (e) { if (e !== TIMEOUT) throw e; break; }
  }
  DEADLINE = Infinity;
  entries.forEach((e, i) => { e.c.score = scores[i] - e.cost + Math.random() * (0.05 + (L.noise || 0)); });
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
  const n = G.kitInfo(g, color).picks;
  const list = level === 'easy'
    ? shuffle(S.ITEM_IDS).slice(0, n)
    : (n > 0 ? ['bomba'] : []).concat(shuffle(['paralisi', 'scudo', 'pozione', 'revitalizzante', 'pietra']).slice(0, Math.max(0, n - 1)));
  return G.setItems(g, color, list);
}

// ---------- partita ----------
function cands(g, color, level) {
  const opp = G.other(color);
  const out = [], entries = [];
  const lm = G.legalMoves(g, color);
  const lsq = !g.surv && g.lucky && g.lucky.sq && g.mods && g.mods.lucky && g.mods.lucky.vis !== 'hidden' ? g.lucky.sq : null; // nascosta: il bot non la conosce
  for (const id of Object.keys(lm)) for (const m of lm[id]) {
    const sim = G.simClone(g);
    play(sim, color, id, m.r, m.c);
    endSim(sim, color);
    const c = { kind: 'move', id, r: m.r, c: m.c, score: 0 };
    out.push(c);
    // casella fortunata nota (visibile): arrivarci vale come un po' di materiale
    const luck = lsq && sim.pieces[id].r === lsq.r && sim.pieces[id].c === lsq.c ? LUCK : 0;
    if (level === 'easy') c.score = ev(sim, color) + Math.random() * 2.5 + luck;
    else entries.push({ c, sim, cost: -luck });
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
    const c = { kind: 'item', a, score: 0 };
    out.push(c); entries.push({ c, sim, cost });
  };
  if (kitNow.includes('bomba')) for (const t of enemies) pushItem({ item: 'bomba', id: t.id }, 0.8, false);
  if (kitNow.includes('pozione')) for (const p of mine) if (p.maxHp - p.hp >= 3) pushItem({ item: 'pozione', id: p.id }, 0.8, false);
  if (kitNow.includes('revitalizzante') && g.graveyard[color].length) {
    const rows = color === 'w' ? [6, 7] : [0, 1];
    const gr = G.grid(g);
    const free = [];
    for (const r of rows) for (let c = 0; c < 8; c++) if (!gr[r][c]) free.push([r, c]);
    for (const id of g.graveyard[color]) {
      const dead = g.pieces[id];
      const ok = free.filter(([r, c]) => dead.role !== 'alfiere' || G.sameShade(r, c, dead.r, dead.c)); // l'alfiere torna sul suo colore
      for (const [r, c] of shuffle(ok).slice(0, 3)) pushItem({ item: 'revitalizzante', id, r, c }, 0.8, false);
    }
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
  scoreAll(entries, color, level);
  return out;
}

function playTurn(g, color, level) {
  if (g.pending) return G.choosePromotion(g, color, g.items[color].includes('pietra') ? 'regina' : 'cavallo');
  const list = cands(g, color, level).sort((a, b) => b.score - a.score);
  if (level === 'easy') {
    if (Math.random() < 0.2) { const moves = list.filter((c) => c.kind === 'move'); if (moves.length) list.unshift(moves[rnd(moves.length)]); }
  } else {
    const slip = resolve(level).L.slip || 0; // scivolone: una delle prime 3 scelte al posto della migliore
    if (slip && Math.random() < slip && list.length > 1) { const [x] = list.splice(rnd(Math.min(3, list.length)), 1); list.unshift(x); }
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
  level = resolve(level).name; // gli alias (l1, l3, l7, l10) valgono come i livelli con nome
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

module.exports = { act, needsAction, _sim: { stepSim, play, endSim } };
