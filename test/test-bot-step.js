// Verifica che il passo di simulazione leggero del bot (stepSim) dia lo stesso risultato della versione lunga
// (simClone + applyMoveCore + fine turno) su molte posizioni reali. Uso: node test/test-bot-step.js [bot.js]
const path = require('path');
const G = require('../game.js');
const B = require(path.resolve(process.argv[2] || './bot.js'));
const { stepSim, play, endSim } = B._sim;
const norm = (s) => JSON.stringify({
  t: s.turn, gy: s.graveyard, lock: s.shieldLock || null,
  p: Object.keys(s.pieces).sort().map((k) => { const p = s.pieces[k]; return [k, p.alive, p.r, p.c, p.hp, p.role, p.type, !!p.frozen, !!p.shield, !!p.hasMoved, !!p.boost, p.maxHp, p.atk]; }),
});
let checked = 0, bad = 0;
for (let game = 0; game < 25; game++) {
  const g = G.newGame(); g.phase = 'draft'; let n = 0;
  while (g.phase !== 'play' && n++ < 300) for (const c of ['w', 'b']) if (B.needsAction(g, c)) { B.act(g, c, 'normal'); break; }
  for (let i = 0; i < 70 && g.phase === 'play'; i++) {
    const gr = G.grid(g), lm = G.legalMoves(g, g.turn, gr);
    const before = norm(g);
    for (const id of Object.keys(lm)) for (const m of lm[id]) {
      const a = G.simClone(g); play(a, g.turn, id, m.r, m.c); endSim(a, g.turn);
      const b = stepSim(g, g.turn, id, m, gr);
      checked++;
      if (norm(a) !== norm(b)) { bad++; if (bad < 4) console.log('DIVERSO', id, JSON.stringify(m), '\n', norm(a), '\n', norm(b)); }
    }
    if (norm(g) !== before) { bad++; console.log('LA POSIZIONE ORIGINALE È STATA MODIFICATA'); }
    B.act(g, g.turn, Math.random() < 0.5 ? 'l2' : 'l4');
  }
}
console.log(`${checked} mosse confrontate, ${bad} differenze`);
process.exit(bad ? 1 : 0);
