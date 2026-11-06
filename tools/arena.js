// Arena: fa giocare due versioni del bot una contro l'altra per misurare se un cambiamento le rende più forti.
// Uso: node tools/arena.js <bot A> <livello A> <bot B> <livello B> [partite=10] [mosse massime=140]
// I file bot si indicano col percorso (es. ./bot.js). Ogni partita ha draft e colori scambiati a turno.
// A fine partita non conclusa si assegna la vittoria a chi ha più materiale (pesato dagli HP) con margine netto.
const path = require('path');
const G = require('../game.js');
const [, , fa, la, fb, lb, nStr, maxStr] = process.argv;
if (!fa || !la || !fb || !lb) { console.log('Uso: node tools/arena.js <botA> <livelloA> <botB> <livelloB> [partite] [mosse]'); process.exit(1); }
const A = require(path.resolve(fa)), B = require(path.resolve(fb));
const N = +nStr || 10, MAX = +maxStr || 140;
const VAL = { pedone: 1, cavallo: 3, alfiere: 3, torre: 5, regina: 9, re: 0 };
const mat = (g, c) => Object.values(g.pieces).filter((p) => p.alive && p.color === c).reduce((s, p) => s + VAL[p.role] * p.hp / p.maxHp, 0);

function match(botW, lvW, botB, lvB) {
  const g = G.newGame(); g.phase = 'draft';
  const bots = { w: [botW, lvW], b: [botB, lvB] };
  let plies = 0, tmax = { w: 0, b: 0 };
  while (g.phase !== 'over' && plies < MAX) {
    let acted = false;
    for (const c of ['w', 'b']) {
      if (!bots[c][0].needsAction(g, c)) continue;
      const t = Date.now();
      const err = bots[c][0].act(g, c, bots[c][1]);
      tmax[c] = Math.max(tmax[c], Date.now() - t);
      if (err) { console.log('errore', c, err); return { w: 0, tmax, plies }; }
      acted = true; if (g.phase === 'play') plies++;
      break;
    }
    if (!acted) break;
  }
  if (g.phase === 'over') return { w: g.winner === 'w' ? 1 : g.winner === 'b' ? -1 : 0, tmax, plies, how: 'fine' };
  const d = mat(g, 'w') - mat(g, 'b');
  return { w: d > 3 ? 1 : d < -3 ? -1 : 0, tmax, plies, how: 'materiale' };
}

let a = 0, b = 0, d = 0, tA = 0, tB = 0;
for (let i = 0; i < N; i++) {
  const aWhite = i % 2 === 0;
  const r = aWhite ? match(A, la, B, lb) : match(B, lb, A, la);
  const res = aWhite ? r.w : -r.w; // dal punto di vista di A
  if (res > 0) a++; else if (res < 0) b++; else d++;
  tA = Math.max(tA, aWhite ? r.tmax.w : r.tmax.b); tB = Math.max(tB, aWhite ? r.tmax.b : r.tmax.w);
  console.log(`partita ${i + 1}: ${res > 0 ? 'A' : res < 0 ? 'B' : 'patta'} (${r.plies} mosse, ${r.how})`);
}
console.log(`\nA (${fa} ${la}) ${a} - ${d} - ${b} B (${fb} ${lb})   mossa più lenta: A ${tA} ms, B ${tB} ms`);
