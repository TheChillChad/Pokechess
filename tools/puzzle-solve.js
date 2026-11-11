// Risolutore dei puzzle: cerca se il Blu può vincere (matto o obiettivo) con una vittoria FORZATA entro N mosse,
// qualunque cosa risponda il Rosso (mosse e strumenti). Usato dal generatore e dal controllo dei puzzle.
const G = require('../game.js');
const S = require('../public/shared.js');

const TYPES = S.TYPES;
function clone(g) {
  const sim = G.simClone(g);
  sim.items = { w: g.items.w.slice(), b: g.items.b.slice() };
  sim.pieces = Object.fromEntries(Object.entries(g.pieces).map(([k, p]) => [k, { ...p }]));
  return sim;
}
function promo(sim, p) {
  if (p.role === 'pedone' && (p.r === 0 || p.r === 7)) {
    const st = S.ROLES.cavallo; p.role = 'cavallo'; p.hp = p.maxHp = st.hp; p.atk = st.atk;
  }
}
function endSim(sim, color) {
  for (const p of Object.values(sim.pieces)) if (p.color === color) p.frozen = false;
  sim.shieldLock = null;
  sim.turn = G.other(color);
}
function applyMove(sim, color, a) {
  const p = sim.pieces[a.id];
  const moved = G.applyMoveCore(sim, color, p, a.r, a.c);
  if (moved) promo(sim, p);
}
// tutte le azioni di un turno (mosse, strumenti che costano il turno, strumento gratuito + mossa)
function turnActions(g, color) {
  const out = [];
  const lm = G.legalMoves(g, color);
  for (const id of Object.keys(lm)) for (const m of lm[id]) out.push([{ k: 'm', id, r: m.r, c: m.c }]);
  const kit = [...new Set(g.items[color])];
  const opp = G.other(color);
  const mine = Object.values(g.pieces).filter((p) => p.alive && p.color === color && p.role !== 're');
  const foes = Object.values(g.pieces).filter((p) => p.alive && p.color === opp && p.role !== 're');
  const costly = [];
  const free = [];
  for (const it of kit) {
    if (it === 'bomba') foes.forEach((t) => costly.push({ item: 'bomba', id: t.id }));
    if (it === 'pozione') mine.filter((p) => p.hp < p.maxHp).forEach((p) => costly.push({ item: 'pozione', id: p.id }));
    if (it === 'cristallo') mine.filter((p) => !p.boost).forEach((p) => costly.push({ item: 'cristallo', id: p.id }));
    if (it === 'metamorfosi') mine.forEach((p) => TYPES.filter((t) => t !== p.type).forEach((t) => costly.push({ item: 'metamorfosi', id: p.id, type: t })));
    if (it === 'cambio') for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) costly.push({ item: 'cambio', a: mine[i].id, b: mine[j].id });
    if (it === 'revitalizzante') {
      const rows = color === 'w' ? [6, 7] : [0, 1]; const gr = G.grid(g);
      for (const id of g.graveyard[color]) for (const r of rows) for (let c = 0; c < 8; c++) {
        const d = g.pieces[id];
        if (!gr[r][c] && (d.role !== 'alfiere' || G.sameShade(r, c, d.r, d.c)) && (d.role !== 'pedone' || r === (color === 'w' ? 6 : 1))) costly.push({ item: 'revitalizzante', id, r, c });
      }
    }
    if (it === 'scudo') mine.filter((p) => !p.shield).forEach((p) => free.push({ item: 'scudo', id: p.id }));
    if (it === 'paralisi') foes.filter((p) => !p.frozen).forEach((p) => free.push({ item: 'paralisi', id: p.id }));
  }
  for (const a of costly) out.push([{ k: 'i', a }]);
  for (const a of free) { // gratuito: poi una mossa qualsiasi (non del pezzo con lo Scudo)
    const sim = clone(g);
    if (G.applyItem(sim, color, a)) continue;
    if (a.item === 'scudo') sim.shieldLock = a.id;
    const lm2 = G.legalMoves(sim, color);
    for (const id of Object.keys(lm2)) {
      if (sim.shieldLock === id) continue;
      for (const m of lm2[id]) out.push([{ k: 'i', a }, { k: 'm', id, r: m.r, c: m.c }]);
    }
  }
  return out;
}
// applica un'azione a una copia; restituisce la copia (turno già passato) o null se non valida
function apply(g, color, act) {
  const sim = clone(g);
  if (act[0].k === 'm') { applyMove(sim, color, act[0]); endSim(sim, color); return sim; }
  const a = act[0].a;
  if (G.applyItem(sim, color, a)) return null;
  sim.items[color].splice(sim.items[color].indexOf(a.item), 1);
  if (act.length === 1) { // costa il turno: non deve lasciare il Re sotto scacco
    if (G.inCheck(sim, color)) return null;
    endSim(sim, color);
    return sim;
  }
  if (a.item === 'scudo') sim.shieldLock = a.id;
  applyMove(sim, color, act[1]);
  endSim(sim, color);
  return sim;
}
function goalMet(g, goal) {
  if (goal.type === 'kill') { const t = g.pieces['b' + goal.target]; return !!t && !t.alive; }
  if (goal.type === 'clear') return !Object.values(g.pieces).some((p) => p.color === 'b' && p.alive && p.role !== 're');
  return false;
}
// dopo una mossa del Blu: 'win' | 'lose' | 'cont'
function status(sim, goal) {
  if (goalMet(sim, goal)) return 'win';
  const chk = G.inCheck(sim, 'b');
  const noMoves = Object.keys(G.legalMoves(sim, 'b')).length === 0;
  if (noMoves && chk && !G.itemCanResolve(sim, 'b')) return 'win';
  if (noMoves && !chk) return 'lose';
  return 'cont';
}
// il Blu, con n mosse a disposizione, vince per forza? (tutte le azioni vincenti, o solo la prima)
function resultOfAction(g, goal, act, n) {
  const sim = apply(g, 'w', act);
  if (!sim) return false;
  const st = status(sim, goal);
  if (st === 'win') return true;
  if (st === 'lose' || n <= 1) return false;
  const replies = turnActions(sim, 'b');
  if (!replies.length) return false;
  for (const ra of replies) {
    const sim2 = apply(sim, 'b', ra);
    if (!sim2) continue;
    if (!firstWinning(sim2, goal, n - 1, true).length) return false;
  }
  return true;
}
function firstWinning(g, goal, n, stopAtFirst) {
  const win = [];
  for (const act of turnActions(g, 'w')) {
    if (resultOfAction(g, goal, act, n)) { win.push(act); if (stopAtFirst) return win; }
  }
  return win;
}
const wins = (g, goal, n) => firstWinning(g, goal, n, true).length > 0;
module.exports = { clone, turnActions, apply, status, wins, firstWinning, goalMet };
