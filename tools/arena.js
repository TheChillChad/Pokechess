// Arena: fa giocare due versioni del bot una contro l'altra per misurare se un cambiamento le rende più forti.
// Uso: node tools/arena.js <bot A> <livello A> <bot B> <livello B> [coppie=10] [mosse massime=140]
// I file bot si indicano col percorso (es. ./bot.js). Ogni coppia parte dalla stessa posizione (draft e kit uguali) e si gioca due volte con i colori scambiati.
// A fine partita non conclusa si assegna la vittoria a chi ha più materiale (pesato dagli HP) con margine netto.
const path = require('path');
const G = require('../game.js');
const [, , fa, la, fb, lb, nStr, maxStr] = process.argv;
if (!fa || !la || !fb || !lb) { console.log('Uso: node tools/arena.js <botA> <livelloA> <botB> <livelloB> [partite] [mosse]'); process.exit(1); }
const A = require(path.resolve(fa)), B = require(path.resolve(fb));
const N = +nStr || 10, MAX = +maxStr || 140;
const VAL = { pedone: 1, cavallo: 3, alfiere: 3, torre: 5, regina: 9, re: 0 };
const mat = (g, c) => Object.values(g.pieces).filter((p) => p.alive && p.color === c).reduce((s, p) => s + VAL[p.role] * p.hp / p.maxHp, 0);

// Parte da una posizione già "draftata" (uguale per le due partite di una coppia, così la fortuna del draft non conta):
// la stessa posizione si gioca due volte, scambiando i colori dei due bot.
function startPosition(bot) {
  const g = G.newGame(); g.phase = 'draft';
  let guard = 0;
  while (g.phase !== 'play' && guard++ < 200) {
    let acted = false;
    for (const c of ['w', 'b']) if (bot.needsAction(g, c)) { bot.act(g, c, 'normal'); acted = true; break; }
    if (!acted) break;
  }
  return g;
}
function match(start, botW, lvW, botB, lvB) {
  const g = structuredClone(start);
  const bots = { w: [botW, lvW], b: [botB, lvB] };
  // ARENA_HANDICAP=1: il bot B parte senza Regina (serve a misurare quanto bene il bot A converte un vantaggio in matto)
  if (process.env.ARENA_HANDICAP && botW !== botB) { const loser = botW === A ? 'b' : 'w'; for (const p of Object.values(g.pieces)) if (p.color === loser && p.role === 'regina') p.alive = false; }
  let plies = 0, tmax = { w: 0, b: 0 };
  while (g.phase !== 'over' && plies < MAX) {
    const c = g.turn;
    const t = Date.now();
    const err = bots[c][0].needsAction(g, c) ? bots[c][0].act(g, c, bots[c][1]) : 'non tocca a lui';
    tmax[c] = Math.max(tmax[c], Date.now() - t);
    if (err) { console.log('errore', c, err); return { w: 0, tmax, plies, how: 'errore' }; }
    plies++;
  }
  if (g.phase === 'over') return { w: g.winner === 'w' ? 1 : g.winner === 'b' ? -1 : 0, tmax, plies, how: 'fine' };
  const d = mat(g, 'w') - mat(g, 'b');
  return { w: d > 3 ? 1 : d < -3 ? -1 : 0, tmax, plies, how: 'materiale' };
}

let a = 0, b = 0, d = 0, tA = 0, tB = 0;
for (let i = 0; i < N; i++) {
  const start = startPosition(A);
  for (const aWhite of [true, false]) {
    const r = aWhite ? match(start, A, la, B, lb) : match(start, B, lb, A, la);
    const res = aWhite ? r.w : -r.w; // dal punto di vista di A
    if (res > 0) a++; else if (res < 0) b++; else d++;
    tA = Math.max(tA, aWhite ? r.tmax.w : r.tmax.b); tB = Math.max(tB, aWhite ? r.tmax.b : r.tmax.w);
    console.log(`coppia ${i + 1}${aWhite ? 'a' : 'b'}: ${res > 0 ? 'A' : res < 0 ? 'B' : 'patta'} (${r.plies} mosse, ${r.how})`);
  }
}
const pts = a + d / 2, tot = a + b + d;
console.log(`\nA (${fa} ${la}) ${a} - ${d} - ${b} B (${fb} ${lb})   punti A: ${pts}/${tot}   mossa più lenta: A ${tA} ms, B ${tB} ms`);
