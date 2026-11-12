// Controlla i puzzle di public/puzzles.js: vittoria forzata entro «moves» e NON in meno mosse.
// Uso: node tools/puzzle-check.js   (il puzzle a 3 mosse può richiedere qualche secondo)
const G = require('../game.js');
const P = require('./puzzle-solve.js');
const Puzzles = require('../public/puzzles.js');
// Controllo col motore VERO (partita reale, tutte le risposte del Rosso): niente scorciatoie della simulazione
function doTurn(g, color, act) {
  for (const x of act) {
    const err = x.k === 'm' ? G.move(g, color, x.id, x.r, x.c) : G.useItem(g, color, x.a);
    if (err) return false;
    if (g.pending) G.choosePromotion(g, color, 'cavallo');
  }
  return true;
}
function realWins(g) {
  for (const act of P.turnActions(g, 'w')) {
    const g1 = structuredClone(g);
    if (!doTurn(g1, 'w', act)) continue;
    if (g1.phase === 'over') { if (g1.winner === 'w') return act; continue; }
    let all = true;
    const replies = P.turnActions(g1, 'b');
    if (!replies.length) continue;
    for (const ra of replies) {
      const g2 = structuredClone(g1);
      if (!doTurn(g2, 'b', ra)) continue;
      if (g2.phase === 'over') { if (g2.winner !== 'w') { all = false; break; } continue; }
      if (!realWins(g2)) { all = false; break; }
    }
    if (all) return act;
  }
  return null;
}
let bad = 0;
for (const d of Puzzles.LIST.concat(Puzzles.TUTORIAL)) {
  const g = G.puzzleGame(d);
  if (d.manual) { console.log(`${G.inCheck(g, 'w') || G.inCheck(g, 'b') ? 'ERRORE' : 'ok  '} ${d.id} ${d.title}: verificato a mano nei test (promozione)`); continue; }
  const t = Date.now();
  const win = P.firstWinning(g, d.goal, d.moves, false);
  let shorter = false;
  for (let k = 1; k < d.moves; k++) if (P.wins(g, d.goal, k)) shorter = true;
  const ok = win.length > 0 && !shorter && !G.inCheck(g, 'w') && !G.inCheck(g, 'b');
  let real = '';
  if (process.argv.includes('--real')) { const r = realWins(G.puzzleGame(d)); real = r ? ' · motore vero: ok' : ' · motore vero: NON risolvibile'; if (!r) bad++; }
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'ERRORE'} ${d.id} ${d.title}: ${win.length} prime mosse vincenti${shorter ? ', ma si vince in meno mosse' : ''} (${Date.now() - t} ms)${real}`);
}
process.exit(bad ? 1 : 0);
