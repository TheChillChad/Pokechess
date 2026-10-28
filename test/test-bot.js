// Bot contro bot: le partite devono finire senza errori e in tempi ragionevoli.
const assert = require('assert');
const G = require('../game.js');
const B = require('../bot.js');

function match(lvW, lvB, maxPlies) {
  const g = G.newGame();
  g.phase = 'draft';
  const lv = { w: lvW, b: lvB };
  let plies = 0, slowest = 0;
  while (g.phase !== 'over' && plies < maxPlies) {
    let acted = false;
    for (const c of ['w', 'b']) {
      if (!B.needsAction(g, c)) continue;
      const t = Date.now();
      const err = B.act(g, c, lv[c]);
      slowest = Math.max(slowest, Date.now() - t);
      assert.strictEqual(err, null, `errore bot ${c}: ${err} (fase ${g.phase})`);
      acted = true;
      if (g.phase === 'play') plies++;
      break;
    }
    assert.ok(acted, 'nessuno deve agire: partita bloccata in fase ' + g.phase);
  }
  return { g, plies, slowest };
}

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

t('facile vs facile: partita senza errori', () => { const r = match('easy', 'easy', 400); assert.ok(r.plies > 5); });
t('normale vs facile: il normale non perde quasi mai', () => {
  let wins = 0, losses = 0;
  for (let i = 0; i < 4; i++) {
    const r = match('normal', 'easy', 300);
    if (r.g.winner === 'w') wins++; else if (r.g.winner === 'b') losses++;
    console.log(`     partita ${i + 1}: ${r.g.phase === 'over' ? r.g.reason : 'non finita'} (${r.plies} mosse, max ${r.slowest} ms)`);
    assert.ok(r.slowest < 3000, 'mossa troppo lenta: ' + r.slowest);
  }
  assert.ok(wins >= losses, `il normale ha perso più di quanto ha vinto (${wins}-${losses})`);
});
console.log(n + ' test bot passati');
