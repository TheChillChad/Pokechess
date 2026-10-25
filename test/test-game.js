// Test della logica di gioco: node test/test-game.js
const assert = require('assert');
const S = require('../public/shared.js');
const G = require('../game.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

// partita già in fase "play" con kit scelti e tipi assegnati in modo semplice
function startedGame(kitW = ['pozione', 'scudo', 'cristallo'], kitB = ['pozione', 'scudo', 'cristallo']) {
  const g = G.newGame();
  g.phase = 'draft';
  const types = S.TYPES;
  for (const color of ['w', 'b']) {
    let i = 0;
    for (const p of Object.values(g.pieces)) {
      if (p.color === color && p.role !== 're') p.type = types[Math.floor(i++ / 2) % 8];
    }
  }
  g.picks = 30;
  g.phase = 'play';
  g.items = { w: kitW.slice(), b: kitB.slice() };
  g.turn = 'w';
  return g;
}
const at = (g, r, c) => Object.values(g.pieces).find((p) => p.alive && p.r === r && p.c === c);
const clear = (g) => { for (const p of Object.values(g.pieces)) if (p.role !== 're') p.alive = false; };
const place = (g, id, r, c, extra = {}) => { const p = g.pieces[id]; p.alive = true; p.r = r; p.c = c; Object.assign(p, extra); return p; };

console.log('Tipi');
t('la tabella dei tipi è simmetrica: 2 forze, 2 debolezze, 2 resistenze per tipo', () => {
  for (const x of S.TYPES) {
    assert.strictEqual(S.STRONG[x].length, 2, x + ' forze');
    assert.strictEqual(S.RESIST[x].length, 2, x + ' resistenze');
    const weak = S.TYPES.filter((y) => S.STRONG[y].includes(x));
    assert.strictEqual(weak.length, 2, x + ' debolezze');
    for (const y of S.STRONG[x]) assert.ok(!S.RESIST[y].includes(x), `${x}->${y} non può essere sia ×2 che ×0,5`);
  }
});
t('moltiplicatori', () => {
  assert.strictEqual(S.mult('fuoco', 'erba'), 2);
  assert.strictEqual(S.mult('erba', 'fuoco'), 1); // erba contro fuoco: neutro (fuoco è debole a acqua/buio)
  assert.strictEqual(S.mult('fuoco', 'fuoco'), 0.5);
  assert.strictEqual(S.mult(null, 'fuoco'), 1);
});

console.log('Movimento');
t('posizione iniziale: 20 mosse per il Blu', () => {
  const g = G.newGame(); g.phase = 'play';
  const total = Object.values(G.legalMoves(g, 'w')).reduce((n, m) => n + m.length, 0);
  assert.strictEqual(total, 20);
});
t('il pedone non cattura in avanti e cattura in diagonale', () => {
  const g = startedGame(); clear(g);
  place(g, 'w8', 4, 4); place(g, 'b9', 3, 4); place(g, 'b10', 3, 5);
  const mv = G.legalMoves(g, 'w')['w8'];
  assert.ok(!mv.find((m) => m.c === 4 && m.r === 3), 'in avanti bloccato');
  assert.ok(mv.find((m) => m.r === 3 && m.c === 5 && m.kind === 'attack'), 'diagonale');
});
t('la torre si ferma sul primo pezzo', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 4, 0); place(g, 'b8', 4, 3);
  const mv = G.legalMoves(g, 'w')['w0'].filter((m) => m.r === 4 && m.c > 0);
  assert.deepStrictEqual(mv.map((m) => m.c), [1, 2, 3]);
  assert.strictEqual(mv[2].kind, 'attack');
});

console.log('Combattimento a HP');
t('se il bersaglio sopravvive, l\'attaccante resta fermo', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 4, 0, { type: 'acqua' });   // torre, atk 5
  place(g, 'b0', 4, 3, { type: 'acqua' });   // torre, 10 HP
  assert.strictEqual(G.move(g, 'w', 'w0', 4, 3), null);
  assert.strictEqual(g.pieces.b0.hp, 7); // acqua vs acqua = ×0,5 → 5×0,5 = 2,5 → 3 danni → 10−3
  assert.strictEqual(g.pieces.b0.alive, true);
  assert.strictEqual(g.pieces.w0.c, 0);
  assert.strictEqual(g.turn, 'b');
});
t('danno super efficace uccide e l\'attaccante avanza', () => {
  const g = startedGame(); clear(g);
  place(g, 'w8', 4, 4, { type: 'fuoco' });   // pedone atk 2
  place(g, 'b9', 3, 5, { type: 'erba', hp: 4 });
  assert.strictEqual(G.move(g, 'w', 'w8', 3, 5), null); // 2×2 = 4 → morto
  assert.strictEqual(g.pieces.b9.alive, false);
  assert.deepStrictEqual([g.pieces.w8.r, g.pieces.w8.c], [3, 5]);
  assert.deepStrictEqual(g.graveyard.b, ['b9']);
});
t('il Re fa sempre 6 (3×2) ignorando i tipi', () => {
  const g = startedGame(); clear(g);
  place(g, 'w4', 4, 4);
  place(g, 'b0', 4, 5, { type: 'fuoco' });
  const m = G.legalMoves(g, 'w')['w4'].find((x) => x.r === 4 && x.c === 5);
  assert.strictEqual(m.dmg, 6);
  assert.strictEqual(m.eff, 1);
});
t('colpire il Re avversario vince la partita', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 4, 0, { type: 'fuoco' });
  g.pieces.b4.r = 4; g.pieces.b4.c = 6;
  assert.strictEqual(G.move(g, 'w', 'w0', 4, 6), null);
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winner, 'w');
});
t('non puoi muovere nel turno dell\'avversario né pezzi altrui', () => {
  const g = startedGame();
  assert.ok(G.move(g, 'b', 'b8', 3, 0));
  assert.ok(G.move(g, 'w', 'b8', 3, 0));
});

console.log('Strumenti');
t('Pozione cura al massimo +5 e costa il turno', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 4, 0, { hp: 3 });
  assert.strictEqual(G.useItem(g, 'w', { item: 'pozione', id: 'w0' }), null);
  assert.strictEqual(g.pieces.w0.hp, 8);
  assert.strictEqual(g.turn, 'b');
  assert.deepStrictEqual(g.items.w, ['scudo', 'cristallo']);
});
t('Pozione rifiutata su pezzo con HP pieni', () => {
  const g = startedGame();
  assert.ok(G.useItem(g, 'w', { item: 'pozione', id: 'w8' }));
  assert.strictEqual(g.turn, 'w');
});
t('Scudo blocca un attacco e si consuma', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 4, 0, { type: 'fuoco' });
  place(g, 'b0', 4, 3, { type: 'erba', shield: true });
  assert.strictEqual(G.move(g, 'w', 'w0', 4, 3), null);
  assert.strictEqual(g.pieces.b0.hp, 10);
  assert.strictEqual(g.pieces.b0.shield, false);
});
t('Cristallo moltiplica ×1,5 una volta sola', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 4, 0, { type: 'psico', boost: true }); // atk 5
  place(g, 'b0', 4, 3, { type: 'fuoco' });              // psico vs fuoco: nessuna relazione → ×1
  const m = G.legalMoves(g, 'w')['w0'].find((x) => x.c === 3);
  assert.strictEqual(m.dmg, Math.round(5 * 1.5));
  G.move(g, 'w', 'w0', 4, 3);
  assert.strictEqual(g.pieces.w0.boost, false);
});
t('Cambio scambia due pezzi', () => {
  const g = startedGame(['cambio', 'pozione', 'scudo']);
  const a = [g.pieces.w1.r, g.pieces.w1.c], b = [g.pieces.w2.r, g.pieces.w2.c];
  assert.strictEqual(G.useItem(g, 'w', { item: 'cambio', a: 'w1', b: 'w2' }), null);
  assert.deepStrictEqual([g.pieces.w1.r, g.pieces.w1.c], b);
  assert.deepStrictEqual([g.pieces.w2.r, g.pieces.w2.c], a);
});
t('Revitalizzante riporta un pezzo con metà HP nelle prime due file', () => {
  const g = startedGame(['revitalizzante', 'pozione', 'scudo']);
  g.pieces.w3.alive = false; g.graveyard.w.push('w3'); // regina
  assert.ok(G.useItem(g, 'w', { item: 'revitalizzante', id: 'w3', r: 3, c: 3 }), 'fuori dalle prime due file');
  assert.ok(G.useItem(g, 'w', { item: 'revitalizzante', id: 'w3', r: 7, c: 4 }), 'casella occupata dal Re');
  g.pieces.w2.alive = false; // libera c2 sulla riga 7
  assert.strictEqual(G.useItem(g, 'w', { item: 'revitalizzante', id: 'w3', r: 7, c: 2 }), null);
  assert.strictEqual(g.pieces.w3.hp, 6);
  assert.deepStrictEqual(g.graveyard.w, []);
});

console.log('Promozione');
t('senza Pietra il pedone diventa Cavallo', () => {
  const g = startedGame(['pozione', 'scudo', 'cristallo']); clear(g);
  place(g, 'w8', 1, 0, { type: 'fuoco' });
  assert.strictEqual(G.move(g, 'w', 'w8', 0, 0), null);
  assert.strictEqual(g.pieces.w8.role, 'cavallo');
  assert.strictEqual(g.pieces.w8.hp, 7);
  assert.strictEqual(g.turn, 'b');
});
t('con Pietra si sceglie il ruolo e la Pietra si consuma', () => {
  const g = startedGame(['pietra', 'scudo', 'cristallo']); clear(g);
  place(g, 'w8', 1, 0, { type: 'fuoco' });
  G.move(g, 'w', 'w8', 0, 0);
  assert.strictEqual(g.turn, 'w');
  assert.ok(g.pending);
  assert.strictEqual(G.choosePromotion(g, 'w', 'regina'), null);
  assert.strictEqual(g.pieces.w8.role, 'regina');
  assert.strictEqual(g.pieces.w8.maxHp, 12);
  assert.ok(!g.items.w.includes('pietra'));
  assert.strictEqual(g.turn, 'b');
});

console.log('Draft e strumenti iniziali');
t('draft: massimo 2 per tipo, turni alternati, 30 scelte', () => {
  const g = G.newGame(); g.phase = 'draft';
  const mine = { w: Object.values(g.pieces).filter((p) => p.color === 'w' && p.role !== 're'), b: Object.values(g.pieces).filter((p) => p.color === 'b' && p.role !== 're') };
  assert.ok(G.draftPick(g, 'b', mine.b[0].id, 'fuoco'), 'il Blu comincia');
  assert.strictEqual(G.draftPick(g, 'w', mine.w[0].id, 'fuoco'), null);
  assert.ok(G.draftPick(g, 'w', mine.w[1].id, 'fuoco'), 'non è più il suo turno');
  assert.strictEqual(G.draftPick(g, 'b', mine.b[0].id, 'fuoco'), null);
  assert.strictEqual(G.draftPick(g, 'w', mine.w[1].id, 'fuoco'), null);
  assert.strictEqual(G.draftPick(g, 'b', mine.b[1].id, 'fuoco'), null);
  assert.ok(G.draftPick(g, 'w', mine.w[2].id, 'fuoco'), 'terzo fuoco rifiutato');
  // completa il draft
  let guard = 0;
  while (g.phase === 'draft' && guard++ < 100) {
    const color = g.turn;
    const piece = mine[color].find((p) => !p.type);
    const counts = G.typeCounts(g)[color];
    const type = S.TYPES.find((x) => counts[x] < 2);
    assert.strictEqual(G.draftPick(g, color, piece.id, type), null);
  }
  assert.strictEqual(g.phase, 'items');
  assert.strictEqual(g.picks, 30);
});
t('scelta strumenti: 3 a testa, la partita parte quando entrambi hanno scelto', () => {
  const g = G.newGame(); g.phase = 'items';
  assert.ok(G.setItems(g, 'w', ['scudo', 'scudo']));
  assert.strictEqual(G.setItems(g, 'w', ['scudo', 'scudo', 'pietra']), null);
  assert.strictEqual(g.phase, 'items');
  assert.strictEqual(G.setItems(g, 'b', ['pozione', 'cambio', 'cristallo']), null);
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.turn, 'w');
});

console.log(`\n${passed} test passati`);
