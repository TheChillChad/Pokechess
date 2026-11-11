// Generatore di puzzle: crea posizioni a caso e tiene quelle con vittoria forzata verificata.
// Uso: node tools/puzzle-gen.js <mosse 1|2|3> <mate|kill> <tentativi> [seme]
const G = require('../game.js');
const S = require('../public/shared.js');
const P = require('./puzzle-solve.js');
const [N, GOAL, TRIES] = [+process.argv[2] || 1, process.argv[3] || 'mate', +process.argv[4] || 200];
let seed = +process.argv[5] || Date.now() % 100000;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const wpick = (w) => { let x = rnd() * Object.values(w).reduce((a, b) => a + b, 0); for (const k of Object.keys(w)) { x -= w[k]; if (x < 0) return k; } };
const ITEMS = ['bomba', 'pozione', 'cristallo', 'paralisi', 'scudo', 'metamorfosi'];

function candidate() {
  const used = new Set(); const sq = (r0, r1, c0, c1) => { for (let i = 0; i < 50; i++) { const r = ri(r0, r1), c = ri(c0, c1); if (!used.has(r * 8 + c)) { used.add(r * 8 + c); return [r, c]; } } return null; };
  const w = [], b = [];
  // Re nemico sul bordo alto, Re mio non lontano
  const ek = rnd() < 0.5 ? sq(0, 0, 0, 7) : (rnd() < 0.5 ? sq(0, 3, 0, 0) : sq(0, 3, 7, 7));
  const mk = sq(1, 5, 0, 7);
  if (!ek || !mk) return null;
  w.push(['re', null, 0, mk[0], mk[1]]); b.push(['re', null, 0, ek[0], ek[1]]);
  const nMine = ri(2, 4), nFoe = GOAL === 'kill' ? ri(1, 3) : ri(0, 2);
  const mkp = (list, rows, i) => {
    const role = wpick({ regina: 2, torre: 3, alfiere: 3, cavallo: 3, pedone: 2 });
    const pos = role === 'pedone' ? sq(...rows.pawn) : sq(...rows.any); if (!pos) return;
    const max = S.ROLES[role].hp; const hp = Math.max(1, Math.round(max * (0.35 + rnd() * 0.65)));
    list.push([role, pick(S.TYPES), hp, pos[0], pos[1]]);
  };
  for (let i = 0; i < nMine; i++) mkp(w, { pawn: [3, 6, 0, 7], any: [2, 7, 0, 7] }, i);
  for (let i = 0; i < nFoe; i++) mkp(b, { pawn: [1, 3, 0, 7], any: [0, 4, 0, 7] }, i);
  const items = { w: [], b: [] };
  for (let i = ri(0, 2); i > 0; i--) items.w.push(pick(ITEMS));
  const def = { id: 'g', title: 'g', moves: N, w, b, items };
  def.goal = GOAL === 'kill' ? { type: 'kill', target: ri(1, b.length - 1) } : { type: 'mate' };
  if (def.goal.type === 'kill' && b.length < 2) return null;
  return def;
}
let found = 0, tried = 0;
const t0 = Date.now();
for (; tried < TRIES; tried++) {
  const def = candidate(); if (!def) continue;
  const g = G.puzzleGame(def);
  if (G.inCheck(g, 'w') || G.inCheck(g, 'b')) continue;
  if (!Object.keys(G.legalMoves(g, 'b')).length) continue;
  // niente vittoria in meno mosse
  let shorter = false;
  for (let k = 1; k < N && !shorter; k++) if (P.wins(g, def.goal, k)) shorter = true;
  if (shorter) continue;
  const win = P.firstWinning(g, def.goal, N, false);
  if (!win.length || win.length > 3) continue;
  found++;
  console.log(JSON.stringify({ def: { goal: def.goal, moves: N, w: def.w, b: def.b, items: def.items }, win }));
}
console.error(`tentativi ${tried}, trovati ${found}, ${Math.round((Date.now() - t0) / 1000)}s`);
