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
  place(g, 'b0', 4, 3, { type: 'acqua' });   // torre, 8 HP
  assert.strictEqual(G.move(g, 'w', 'w0', 4, 3), null);
  assert.strictEqual(g.pieces.b0.hp, 5); // acqua vs acqua = ×0,5 → 5×0,5 = 2,5 → 3 danni → 8−3
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
t('il Re elimina in un colpo qualsiasi pezzo, ignorando i tipi', () => {
  const g = startedGame(); clear(g);
  place(g, 'w4', 4, 4);
  place(g, 'b8', 4, 5, { type: 'fuoco' });
  const m = G.legalMoves(g, 'w')['w4'].find((x) => x.r === 4 && x.c === 5);
  assert.strictEqual(m.ko, true);
  assert.strictEqual(m.kill, true);
  assert.strictEqual(G.move(g, 'w', 'w4', 4, 5), null);
  assert.strictEqual(g.pieces.b8.alive, false);
  assert.deepStrictEqual([g.pieces.w4.r, g.pieces.w4.c], [4, 5]);
});
t('il Re uccide anche una Regina a piena vita', () => {
  const g = startedGame(); clear(g);
  place(g, 'w4', 4, 4);
  place(g, 'b3', 4, 5, { type: 'acqua' });
  assert.strictEqual(G.move(g, 'w', 'w4', 4, 5), null);
  assert.strictEqual(g.pieces.b3.alive, false);
});
t('lo Scudo ferma il Re', () => {
  const g = startedGame(); clear(g);
  place(g, 'w4', 4, 4);
  place(g, 'b8', 4, 5, { type: 'fuoco' });
  g.pieces.b8.shield = true;
  const m = G.legalMoves(g, 'w')['w4'].find((x) => x.r === 4 && x.c === 5);
  assert.ok(m.shield);
  assert.strictEqual(G.move(g, 'w', 'w4', 4, 5), null);
  assert.strictEqual(g.pieces.b8.alive, true);
  assert.deepStrictEqual([g.pieces.w4.r, g.pieces.w4.c], [4, 4]);
});
t('il Re non si può mai colpire: nessun attacco sul Re tra le mosse legali', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 4, 0, { type: 'fuoco' });
  g.pieces.b4.r = 4; g.pieces.b4.c = 6; // Re nero in linea con la torre: è sotto scacco
  const mv = G.legalMoves(g, 'w')['w0'] || [];
  assert.ok(!mv.find((m) => m.r === 4 && m.c === 6));
  assert.ok(G.move(g, 'w', 'w0', 4, 6));
  assert.strictEqual(g.phase, 'play');
});
t('non puoi muovere nel turno dell\'avversario né pezzi altrui', () => {
  const g = startedGame();
  assert.ok(G.move(g, 'b', 'b8', 3, 0));
  assert.ok(G.move(g, 'w', 'b8', 3, 0));
});

console.log('Arrocco');
const castleOf = (g, color, id) => (G.legalMoves(g, color)[id] || []).filter((m) => m.kind === 'castle');
t('arrocco corto e lungo: Re di due caselle e Torre dall\'altra parte', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 7, 0, { type: 'fuoco' }); place(g, 'w7', 7, 7, { type: 'fuoco' });
  assert.strictEqual(castleOf(g, 'w', 'w4').length, 2);
  assert.strictEqual(G.move(g, 'w', 'w4', 7, 6), null);
  assert.deepStrictEqual([g.pieces.w4.r, g.pieces.w4.c, g.pieces.w7.r, g.pieces.w7.c], [7, 6, 7, 5]);
  assert.strictEqual(g.turn, 'b');
  const g2 = startedGame(); clear(g2);
  place(g2, 'w0', 7, 0, { type: 'fuoco' }); place(g2, 'w7', 7, 7, { type: 'fuoco' });
  assert.strictEqual(G.move(g2, 'w', 'w4', 7, 2), null);
  assert.deepStrictEqual([g2.pieces.w4.c, g2.pieces.w0.c], [2, 3]);
});
t('niente arrocco con pezzi in mezzo, Re già mosso o Torre già mossa', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 7, 0, { type: 'fuoco' }); place(g, 'w7', 7, 7, { type: 'fuoco' });
  place(g, 'w1', 7, 1, { type: 'fuoco' });
  assert.deepStrictEqual(castleOf(g, 'w', 'w4').map((m) => m.c), [6]); // lungo bloccato
  g.pieces.w7.hasMoved = true;
  assert.strictEqual(castleOf(g, 'w', 'w4').length, 0);
  g.pieces.w7.hasMoved = false; g.pieces.w4.hasMoved = true;
  assert.strictEqual(castleOf(g, 'w', 'w4').length, 0);
});
t('niente arrocco sotto scacco, attraverso una casella minacciata, o con Torre paralizzata', () => {
  const g = startedGame(); clear(g);
  place(g, 'w7', 7, 7, { type: 'fuoco' });
  place(g, 'b0', 5, 5, { type: 'acqua' }); // torre nera: minaccia la colonna f
  assert.strictEqual(castleOf(g, 'w', 'w4').length, 0);
  g.pieces.b0.c = 3; // ora minaccia la colonna d, non quelle dell'arrocco corto
  assert.strictEqual(castleOf(g, 'w', 'w4').length, 1);
  g.pieces.b0.c = 4; // dà scacco al Re
  assert.strictEqual(castleOf(g, 'w', 'w4').length, 0);
  g.pieces.b0.c = 0; g.pieces.w7.frozen = true;
  assert.strictEqual(castleOf(g, 'w', 'w4').length, 0);
});

console.log('Scacco, matto, stallo');
t('scacco: la mossa che lo dà avvisa e l\'avversario può rispondere solo risolvendolo', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 3, 0);        // torre bianca
  place(g, 'b0', 1, 7);        // torre nera, per bloccare
  assert.strictEqual(G.inCheck(g, 'b'), false);
  assert.strictEqual(G.move(g, 'w', 'w0', 0, 0), null); // dà scacco al Re nero in (0,4)
  assert.strictEqual(G.inCheck(g, 'b'), true);
  assert.ok(g.log[g.log.length - 1].includes('Scacco al Re Rosso'));
  const legal = G.legalMoves(g, 'b');
  assert.ok(Object.keys(legal).length > 0, 'il Re può ancora scappare o parare');
  assert.ok(G.move(g, 'b', 'b0', 4, 7), 'una mossa che non risolve lo scacco è rifiutata'); // (1,7)->(4,7) non protegge
  assert.strictEqual(G.move(g, 'b', 'b4', 1, 4), null, 'il Re scappa fuori dalla riga attaccata');
  assert.strictEqual(G.inCheck(g, 'b'), false);
});
t('il Re non può muovere su una casella attaccata', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 5, 3); // torre bianca sulla colonna 3
  const mv = (G.legalMoves(g, 'b')['b4'] || []).map((m) => m.r + ',' + m.c);
  assert.ok(!mv.includes('0,3') && !mv.includes('1,3'), 'colonna 3 attaccata');
  assert.ok(mv.includes('0,5') && mv.includes('1,5'));
});
t('un attacco che non uccide chi dà scacco non risolve lo scacco', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 0, 0, { type: 'fuoco' });                 // torre bianca che dà scacco, 8 HP
  place(g, 'b3', 2, 0, { type: 'erba', atk: 1 });          // regina nera che potrebbe colpirla ma fa pochi danni
  g.pieces.b3.role = 'regina';
  g.turn = 'b';
  const legal = G.legalMoves(g, 'b')['b3'] || [];
  assert.ok(!legal.find((m) => m.r === 0 && m.c === 0), 'colpire senza uccidere non basta');
});
t('scacco matto: partita finita e vincitore', () => {
  const g = startedGame(); clear(g);
  place(g, 'w0', 2, 0);   // torre che darà scacco sulla riga 0
  place(g, 'w7', 1, 7);   // torre che copre la riga 1
  assert.strictEqual(G.move(g, 'w', 'w0', 0, 0), null);
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winner, 'w');
  assert.ok(g.reason.includes('Scacco matto'));
});
t('stallo: patta', () => {
  const g = startedGame(); clear(g);
  g.pieces.b4.r = 0; g.pieces.b4.c = 0;     // Re nero in angolo
  place(g, 'w3', 3, 1, { role: 'regina', hp: 10, maxHp: 10, atk: 6 });
  assert.strictEqual(G.move(g, 'w', 'w3', 2, 1), null); // la Regina toglie ogni casella al Re, senza dare scacco
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winner, null);
  assert.ok(g.reason.includes('Stallo'));
});
t('uno strumento può togliere dallo scacco (Revitalizzante che blocca la linea)', () => {
  const g = startedGame(['pozione', 'scudo', 'cristallo'], ['revitalizzante', 'pozione', 'scudo']); clear(g);
  place(g, 'w0', 0, 0);                       // torre bianca che dà scacco
  place(g, 'b3', 1, 3);                       // regina nera: il Re ha una via di fuga? (1,3) occupata da lei
  g.pieces.b3.alive = false;
  g.graveyard.b = ['b1'];                     // cavallo nero sconfitto
  g.turn = 'b';
  assert.ok(G.useItem(g, 'b', { item: 'pozione', id: 'b1' }), 'Pozione non risolve lo scacco');
  assert.strictEqual(G.useItem(g, 'b', { item: 'revitalizzante', id: 'b1', r: 0, c: 2 }), null);
  assert.strictEqual(g.pieces.b1.r, 0);
  assert.strictEqual(g.turn, 'w');
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
  assert.strictEqual(g.pieces.b0.hp, 8);
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
  const a = [g.pieces.w1.r, g.pieces.w1.c], b = [g.pieces.w6.r, g.pieces.w6.c]; // due cavalli
  assert.strictEqual(G.useItem(g, 'w', { item: 'cambio', a: 'w1', b: 'w6' }), null);
  assert.deepStrictEqual([g.pieces.w1.r, g.pieces.w1.c], b);
  assert.deepStrictEqual([g.pieces.w6.r, g.pieces.w6.c], a);
});
t('Revitalizzante riporta un pezzo con metà HP nelle prime due file', () => {
  const g = startedGame(['revitalizzante', 'pozione', 'scudo']);
  g.pieces.w3.alive = false; g.graveyard.w.push('w3'); // regina
  assert.ok(G.useItem(g, 'w', { item: 'revitalizzante', id: 'w3', r: 3, c: 3 }), 'fuori dalle prime due file');
  assert.ok(G.useItem(g, 'w', { item: 'revitalizzante', id: 'w3', r: 7, c: 4 }), 'casella occupata dal Re');
  g.pieces.w2.alive = false; // libera c2 sulla riga 7
  assert.strictEqual(G.useItem(g, 'w', { item: 'revitalizzante', id: 'w3', r: 7, c: 2 }), null);
  assert.strictEqual(g.pieces.w3.hp, 5);
  assert.deepStrictEqual(g.graveyard.w, []);
});

console.log('Scudo gratuito e nuovi strumenti');
t('Scudo è un\'azione gratuita: poi muovi un altro pezzo, non quello protetto', () => {
  const g = startedGame(['scudo', 'scudo', 'pozione']);
  assert.strictEqual(G.useItem(g, 'w', { item: 'scudo', id: 'w8' }), null);
  assert.strictEqual(g.turn, 'w', 'il turno non passa');
  assert.strictEqual(g.pieces.w8.shield, true);
  assert.ok(G.move(g, 'w', 'w8', 5, 0), 'il pezzo protetto non può muovere in questo turno');
  assert.ok(G.useItem(g, 'w', { item: 'scudo', id: 'w9' }), 'un solo Scudo per turno');
  assert.strictEqual(G.move(g, 'w', 'w9', 5, 1), null);
  assert.strictEqual(g.turn, 'b');
  assert.strictEqual(g.pieces.w8.shield, true, 'lo Scudo resta finché non para un colpo');
  assert.strictEqual(g.shieldLock, null, 'il blocco vale solo per il turno');
  assert.deepStrictEqual(g.items.w, ['scudo', 'pozione'], 'ne è stato consumato uno solo');
});
t('Paralisi è gratuita: poi muovi, e il pezzo non muove nel turno avversario', () => {
  const g = startedGame(['paralisi', 'pozione', 'scudo']);
  assert.strictEqual(G.useItem(g, 'w', { item: 'paralisi', id: 'b8' }), null);
  assert.strictEqual(g.turn, 'w', 'il turno non passa');
  assert.strictEqual(G.move(g, 'w', 'w8', 5, 0), null, 'puoi muovere qualunque pezzo');
  assert.strictEqual(g.turn, 'b');
  assert.ok(!G.legalMoves(g, 'b')['b8'], 'nessuna mossa per il pezzo paralizzato');
  assert.ok(G.move(g, 'b', 'b8', 2, 0), 'mossa rifiutata');
  assert.strictEqual(G.move(g, 'b', 'b9', 2, 1), null);
  assert.strictEqual(g.pieces.b8.frozen, false, 'dopo il suo turno è di nuovo libero');
  assert.strictEqual(g.turn, 'w');
});
t('una sola azione gratuita per turno (Scudo o Paralisi)', () => {
  const g = startedGame(['scudo', 'paralisi', 'pozione']);
  assert.strictEqual(G.useItem(g, 'w', { item: 'scudo', id: 'w8' }), null);
  assert.ok(G.useItem(g, 'w', { item: 'paralisi', id: 'b8' }), 'la seconda azione gratuita è rifiutata');
  assert.strictEqual(g.pieces.b8.frozen, false);
  assert.strictEqual(G.move(g, 'w', 'w9', 5, 1), null);
  // nel turno dopo il contatore si azzera
  assert.strictEqual(G.move(g, 'b', 'b9', 2, 1), null);
  assert.strictEqual(G.useItem(g, 'w', { item: 'paralisi', id: 'b10' }), null);
});
t('la Paralisi su chi dà scacco evita il matto, ma poi devi muovere', () => {
  const g = startedGame(['pozione', 'scudo', 'cristallo'], ['paralisi', 'pozione', 'scudo']); clear(g);
  place(g, 'w0', 2, 0);
  place(g, 'w7', 1, 7);
  assert.strictEqual(G.move(g, 'w', 'w0', 0, 0), null);
  assert.strictEqual(g.phase, 'play', 'non è matto');
  assert.strictEqual(G.useItem(g, 'b', { item: 'paralisi', id: 'w0' }), null);
  assert.strictEqual(g.turn, 'b', 'è gratuita: il Rosso deve ancora muovere');
  assert.strictEqual(G.move(g, 'b', 'b4', 0, 3), null);
});
t('un pezzo paralizzato non dà scacco', () => {
  const g = startedGame(); clear(g);
  place(g, 'b0', 7, 0);
  assert.strictEqual(G.inCheck(g, 'w'), true);
  g.pieces.b0.frozen = true;
  assert.strictEqual(G.inCheck(g, 'w'), false);
});
t('Bomba: 3 danni fissi senza tipi, bloccata dallo Scudo, il Re non si bersaglia', () => {
  const g = startedGame(['bomba', 'bomba', 'bomba']);
  assert.strictEqual(G.useItem(g, 'w', { item: 'bomba', id: 'b0' }), null);
  assert.strictEqual(g.pieces.b0.hp, 5);
  assert.strictEqual(g.turn, 'b');
  g.turn = 'w'; g.pieces.b1.shield = true;
  assert.strictEqual(G.useItem(g, 'w', { item: 'bomba', id: 'b1' }), null);
  assert.strictEqual(g.pieces.b1.hp, 7);
  assert.strictEqual(g.pieces.b1.shield, false);
  g.turn = 'w';
  assert.ok(G.useItem(g, 'w', { item: 'bomba', id: 'b4' }), 'il Re non si può bombardare');
});
t('la Bomba può evitare il matto eliminando chi dà scacco', () => {
  const g = startedGame(['pozione', 'scudo', 'cristallo'], ['bomba', 'pozione', 'scudo']); clear(g);
  place(g, 'w0', 2, 0, { hp: 2 });
  place(g, 'w7', 1, 7);
  assert.strictEqual(G.move(g, 'w', 'w0', 0, 0), null);
  assert.strictEqual(g.phase, 'play', 'non è matto');
  assert.strictEqual(G.useItem(g, 'b', { item: 'bomba', id: 'w0' }), null);
  assert.strictEqual(g.pieces.w0.alive, false);
});
t('Metamorfosi cambia il tipo, costa il turno e non vale sul Re', () => {
  const g = startedGame(['metamorfosi', 'metamorfosi', 'pozione']);
  const old = g.pieces.w8.type, nt = S.TYPES.find((x) => x !== old);
  assert.ok(G.useItem(g, 'w', { item: 'metamorfosi', id: 'w8', type: old }), 'stesso tipo rifiutato');
  assert.ok(G.useItem(g, 'w', { item: 'metamorfosi', id: 'w4', type: nt }), 'il Re è incolore');
  assert.strictEqual(G.useItem(g, 'w', { item: 'metamorfosi', id: 'w8', type: nt }), null);
  assert.strictEqual(g.pieces.w8.type, nt);
  assert.strictEqual(g.turn, 'b');
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
  assert.strictEqual(g.pieces.w8.maxHp, 10);
  assert.ok(!g.items.w.includes('pietra'));
  assert.strictEqual(g.turn, 'b');
});

console.log('Draft e strumenti iniziali');
t('draft a serpentina: B R R B B R R B … e l\'ultima scelta è del Rosso', () => {
  const g = G.newGame(); g.phase = 'draft';
  const mine = { w: Object.values(g.pieces).filter((p) => p.color === 'w' && p.role !== 're'), b: Object.values(g.pieces).filter((p) => p.color === 'b' && p.role !== 're') };
  assert.ok(G.draftPick(g, 'b', mine.b[0].id, 'fuoco'), 'il Blu comincia');
  assert.strictEqual(G.draftPick(g, 'w', mine.w[0].id, 'fuoco'), null);
  assert.ok(G.draftPick(g, 'w', mine.w[1].id, 'fuoco'), 'ora tocca al Rosso');
  assert.strictEqual(G.draftPick(g, 'b', mine.b[0].id, 'fuoco'), null);
  assert.strictEqual(g.turn, 'b', 'il Rosso sceglie due volte di fila');
  assert.strictEqual(G.draftPick(g, 'b', mine.b[1].id, 'fuoco'), null);
  assert.strictEqual(g.turn, 'w');
  assert.strictEqual(G.draftPick(g, 'w', mine.w[1].id, 'fuoco'), null);
  assert.ok(G.draftPick(g, 'w', mine.w[2].id, 'fuoco'), 'terzo fuoco rifiutato');
  // completa il draft registrando chi sceglie
  const order = ['w', 'b', 'b', 'w']; // le prime 4 scelte fatte a mano qui sopra
  let guard = 0;
  while (g.phase === 'draft' && guard++ < 100) {
    const color = g.turn;
    order.push(color);
    const piece = mine[color].find((p) => !p.type);
    const counts = G.typeCounts(g)[color];
    const type = S.TYPES.find((x) => counts[x] < 2);
    assert.strictEqual(G.draftPick(g, color, piece.id, type), null);
  }
  // l'ordine registrato segue B R R B B R R B … per tutte le 29 scelte prima dell'ultima
  assert.strictEqual(order.length, 30);
  order.slice(0, 30).forEach((c, i) => assert.strictEqual(c, S.draftTurn(i), 'scelta ' + i));
  assert.strictEqual(S.draftTurn(29), 'b');
  assert.strictEqual(g.phase, 'items');
  assert.strictEqual(g.picks, 30);
  const bluPicks = Array.from({ length: 30 }, (_, i) => S.draftTurn(i)).filter((c) => c === 'w').length;
  assert.strictEqual(bluPicks, 15);
});
t('scelta strumenti: 3 a testa, la partita parte quando entrambi hanno scelto', () => {
  const g = G.newGame(); g.phase = 'items';
  assert.ok(G.setItems(g, 'w', ['scudo', 'scudo']));
  assert.ok(G.setItems(g, 'w', ['scudo', 'scudo', 'pietra']), 'Scudo al massimo 1');
  assert.ok(G.setItems(g, 'w', ['paralisi', 'paralisi', 'bomba']), 'Paralisi al massimo 1');
  assert.ok(G.setItems(g, 'w', ['revitalizzante', 'revitalizzante', 'bomba']), 'Revitalizzante al massimo 1');
  assert.ok(G.setItems(g, 'w', ['cambio', 'cambio', 'cambio']), 'Cambio al massimo 2');
  assert.strictEqual(G.setItems(g, 'w', ['bomba', 'bomba', 'bomba']), null, 'Bomba fino a 3');
  assert.strictEqual(g.phase, 'items');
  assert.strictEqual(G.setItems(g, 'b', ['pozione', 'cambio', 'cristallo']), null);
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.turn, 'w');
});

console.log('Caselle fortunate');
// partita con modificatore, pezzi sgomberati e una casella fortunata fissata a mano
function luckyGame(bonus, vis = 'pos') {
  const g = startedGame(['pozione', 'pozione', 'pozione'], ['pozione', 'pozione', 'pozione']);
  g.mods = { lucky: { vis } };
  g.lucky = { sq: { r: 4, c: 3, bonus }, nextAt: 99 };
  clear(g);
  place(g, 'w8', 5, 3);   // pedone Blu sotto la casella
  place(g, 'b8', 1, 0);
  return g;
}
t('senza modificatore non esiste nessuna casella fortunata', () => {
  const g = G.newGame();
  assert.strictEqual(g.lucky, null);
  assert.deepStrictEqual(g.mods, { lucky: null, randomTypes: false, handicap: null });
});
t('la casella compare dopo 4 mezze mosse, libera e nelle righe centrali', () => {
  const g = startedGame(); g.mods = { lucky: { vis: 'pos' } }; g.lucky = { sq: null, nextAt: 4 };
  const moves = [['w', 'w8', 5, 0], ['b', 'b8', 2, 0], ['w', 'w9', 5, 1], ['b', 'b9', 2, 1]];
  moves.forEach(([col, id, r, c], i) => { assert.strictEqual(g.lucky.sq, null, 'non ancora (' + i + ')'); assert.strictEqual(G.move(g, col, id, r, c), null); });
  assert.ok(g.lucky.sq, 'dopo 4 mezze mosse compare');
  assert.ok(g.lucky.sq.r >= 2 && g.lucky.sq.r <= 5);
  assert.ok(!at(g, g.lucky.sq.r, g.lucky.sq.c));
});
t('Cura: +3 HP al pezzo, mai oltre il massimo, e la casella si svuota', () => {
  const g = luckyGame('cura'); g.pieces.w8.hp = 2;
  assert.strictEqual(G.move(g, 'w', 'w8', 4, 3), null);
  assert.strictEqual(g.pieces.w8.hp, 4);                  // pedone da 4 HP: 2+3 → 4 (massimo)
  assert.strictEqual(g.lucky.sq, null);
  assert.ok(g.lucky.nextAt > g.ply);
});
t('Rabbia: +1 danno per 3 turni di chi la prende', () => {
  const g = luckyGame('rabbia'); place(g, 'b9', 4, 5, { type: 'psico' });
  G.move(g, 'w', 'w8', 4, 3); assert.ok(g.pieces.w8.rage > 0);
  const p = g.pieces.w8, d = g.pieces.b9;
  const base = Math.max(1, Math.round(p.atk * S.mult(p.type, d.type)));
  const prevRage = p.rage; p.rage = 0; const noRage = G.calcDamage(p, d).dmg; p.rage = prevRage;
  assert.strictEqual(G.calcDamage(p, d).dmg, noRage + 1);
  assert.strictEqual(noRage, base);
  for (let i = 0; i < 4; i++) { p.rage && p.rage--; }
  assert.strictEqual(G.calcDamage(p, d).dmg, noRage, 'a fine effetto torna normale');
});
t('Corazza: −1 danno subito (minimo 1)', () => {
  const g = luckyGame('corazza'); place(g, 'b9', 3, 3, { type: 'fuoco' });
  G.move(g, 'w', 'w8', 4, 3); const d = g.pieces.w8; assert.ok(d.guard > 0);
  const att = g.pieces.b9; const withG = G.calcDamage(att, d).dmg; d.guard = 0; const without = G.calcDamage(att, d).dmg;
  assert.strictEqual(withG, Math.max(1, without - 1));
});
t('i bonus a strumento finiscono nel kit di chi li prende (anche oltre i limiti)', () => {
  const g = luckyGame('bomba'); const n = g.items.w.length;
  G.move(g, 'w', 'w8', 4, 3);
  assert.strictEqual(g.items.w.length, n + 1); assert.ok(g.items.w.includes('bomba'));
  assert.strictEqual(g.items.b.length, n);
});
t('il Re prende la casella: gli strumenti vanno nel kit, HP e potenziamenti si sprecano', () => {
  const g = luckyGame('cura'); place(g, 'w4', 5, 4);  // Re Blu
  g.pieces.w4.r = 5; g.pieces.w4.c = 4; g.pieces.w8.alive = false;
  const k = Object.values(g.pieces).find((p) => p.role === 're' && p.color === 'w'); k.r = 5; k.c = 3;
  assert.strictEqual(G.move(g, 'w', k.id, 4, 3), null);
  assert.strictEqual(g.lucky.sq, null); assert.ok(!k.rage && !k.guard);
  const g2 = luckyGame('cristallo'); const k2 = Object.values(g2.pieces).find((p) => p.role === 're' && p.color === 'w'); g2.pieces.w8.alive = false; k2.r = 5; k2.c = 3;
  const n = g2.items.w.length; G.move(g2, 'w', k2.id, 4, 3); assert.strictEqual(g2.items.w.length, n + 1);
});
t('un attacco che non uccide non fa prendere la casella', () => {
  const g = luckyGame('cura'); place(g, 'b9', 4, 3, { type: 'erba', hp: 99, maxHp: 99 }); place(g, 'w8', 5, 4);
  assert.strictEqual(G.move(g, 'w', 'w8', 4, 3), null);
  assert.ok(g.lucky.sq, 'la casella è ancora lì');
});
t('visibilità: nascosta non manda niente, visibile manda solo la posizione, completa anche il bonus', () => {
  const room = (g) => ({ code: 'ABCDE', game: g, players: { w: { sid: 'x' }, b: { sid: 'y' } } });
  let g = luckyGame('bomba', 'hidden'); assert.strictEqual(G.publicState(room(g), 'w').lucky.sq, null);
  g = luckyGame('bomba', 'pos'); let q = G.publicState(room(g), 'b').lucky.sq; assert.deepStrictEqual([q.r, q.c, q.bonus], [4, 3, null]);
  g = luckyGame('bomba', 'full'); q = G.publicState(room(g), 'b').lucky.sq; assert.strictEqual(q.bonus, 'bomba');
});
t('nascosta: la cronaca non rivela quando appare', () => {
  const g = startedGame(); g.mods = { lucky: { vis: 'hidden' } }; g.lucky = { sq: null, nextAt: 1 };
  const before = g.log.length; G.move(g, 'w', 'w8', 5, 0);
  assert.ok(g.lucky.sq); assert.ok(!g.log.slice(before).some((l) => /fortunata/i.test(l)));
});
t('rematch e normMods: opzioni sconosciute diventano "visibile"', () => {
  assert.strictEqual(G.newGame({ lucky: { vis: 'boh' } }).mods.lucky.vis, 'pos');
  assert.strictEqual(G.newGame({ lucky: { vis: 'full' } }).mods.lucky.vis, 'full');
});

t('Revitalizzante: l\'alfiere torna solo su caselle del suo colore', () => {
  const g = startedGame(['revitalizzante', 'pozione', 'pozione'], []); clear(g);
  const bish = Object.values(g.pieces).find((p) => p.color === 'w' && p.role === 'alfiere'); // parte in (7,c)
  bish.alive = false; g.graveyard.w.push(bish.id);
  const shade = (bish.r + bish.c) % 2;
  const wrong = [6, 7].flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [r, c])).find(([r, c]) => (r + c) % 2 !== shade && !at(g, r, c));
  const right = [6, 7].flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [r, c])).find(([r, c]) => (r + c) % 2 === shade && !at(g, r, c));
  assert.ok(G.useItem(g, 'w', { item: 'revitalizzante', id: bish.id, r: wrong[0], c: wrong[1] }), 'colore sbagliato rifiutato');
  assert.strictEqual(G.useItem(g, 'w', { item: 'revitalizzante', id: bish.id, r: right[0], c: right[1] }), null);
  assert.ok(bish.alive);
});
t('Cambio: un alfiere non può cambiare colore di casella', () => {
  const g = startedGame(['cambio', 'pozione', 'pozione'], []); clear(g);
  place(g, 'w2', 7, 2); const k = Object.values(g.pieces).find((p) => p.role === 're' && p.color === 'w'); // alfiere in (7,2)
  place(g, 'w1', 6, 2);   // cavallo: (6,2) ha colore opposto a (7,2)
  place(g, 'w6', 6, 3);   // cavallo: (6,3) ha lo stesso colore di (7,2)
  assert.ok(G.useItem(g, 'w', { item: 'cambio', a: 'w2', b: 'w1' }), 'colore diverso: rifiutato');
  assert.strictEqual(G.useItem(g, 'w', { item: 'cambio', a: 'w2', b: 'w6' }), null);
});

console.log('Campo di prova');
t('campo di prova: gli strumenti non si consumano e il cimitero serve al Revitalizzante', () => {
  const g = G.sandboxGame('empty');
  G.sandboxEdit(g, { op: 'put', r: 6, c: 0, color: 'w', role: 'pedone', type: 'erba' });
  G.sandboxEdit(g, { op: 'put', r: 3, c: 0, color: 'b', role: 'pedone', type: 'fuoco' });
  const p = at(g, 6, 0); p.hp = 1;
  assert.strictEqual(G.useItem(g, 'w', { item: 'pozione', id: p.id }), null);
  assert.ok(g.items.w.includes('pozione'), 'lo strumento resta');
  assert.strictEqual(G.sandboxEdit(g, { op: 'kill', r: 3, c: 0 }), null); assert.strictEqual(g.graveyard.b.length, 1);
  g.turn = 'b';
  assert.strictEqual(G.useItem(g, 'b', { item: 'revitalizzante', id: g.graveyard.b[0], r: 1, c: 1 }), null);
});
t('campo di prova: dopo una modifica il matto sparisce e si può rigiocare', () => {
  const g = G.sandboxGame('empty'); g.phase = 'over'; g.winner = 'w'; g.reason = 'x';
  assert.strictEqual(G.sandboxEdit(g, { op: 'turn', color: 'b' }), null);
  assert.strictEqual(g.phase, 'play'); assert.strictEqual(g.winner, null); assert.strictEqual(g.turn, 'b');
  assert.ok(G.sandboxEdit(G.newGame(), { op: 'turn', color: 'w' }), 'fuori dal campo di prova non funziona');
});

t('campo di prova: parte con la posizione iniziale e tutti gli strumenti, scacchiera vuota = solo i Re', () => {
  const g = G.sandboxGame('start');
  assert.strictEqual(Object.values(g.pieces).filter((p) => p.alive).length, 32);
  assert.strictEqual(g.items.w.length, S.ITEM_IDS.length);
  assert.strictEqual(G.sandboxEdit(g, { op: 'reset', preset: 'empty' }), null);
  assert.deepStrictEqual(Object.values(g.pieces).map((p) => p.role), ['re', 're']);
  assert.ok(g.sandbox && g.phase === 'play');
});
t('campo di prova: put, set, move, kill, remove e strumenti', () => {
  const g = G.sandboxGame('empty');
  assert.strictEqual(G.sandboxEdit(g, { op: 'put', r: 3, c: 3, color: 'w', role: 'regina', type: 'fuoco' }), null);
  const q = at(g, 3, 3); assert.strictEqual(q.type, 'fuoco'); assert.strictEqual(q.hp, 10);
  assert.strictEqual(G.sandboxEdit(g, { op: 'put', r: 3, c: 4, color: 'b', role: 'pedone', type: 'erba' }), null);
  assert.strictEqual(G.sandboxEdit(g, { op: 'set', id: q.id, field: 'hp', value: 4 }), null); assert.strictEqual(q.hp, 4);
  assert.ok(G.sandboxEdit(g, { op: 'set', id: q.id, field: 'hp', value: 0 }), 'HP non validi');
  assert.strictEqual(G.sandboxEdit(g, { op: 'set', id: q.id, field: 'shield', value: true }), null); assert.ok(q.shield);
  assert.strictEqual(G.sandboxEdit(g, { op: 'move', id: q.id, r: 4, c: 3 }), null); assert.strictEqual(q.r, 4);
  assert.ok(G.sandboxEdit(g, { op: 'put', r: 4, c: 3, color: 'b', role: 'pedone' }) === null, 'un pezzo ne sostituisce un altro');
  const re = Object.values(g.pieces).find((p) => p.role === 're' && p.color === 'w');
  assert.ok(G.sandboxEdit(g, { op: 'remove', r: re.r, c: re.c }), 'i Re non si tolgono');
  assert.strictEqual(G.sandboxEdit(g, { op: 'kill', r: 3, c: 4 }), null);
  assert.strictEqual(g.graveyard.b.length, 1);
  assert.strictEqual(G.sandboxEdit(g, { op: 'items', color: 'w', list: ['bomba', 'bomba', 'cristallo'] }), null);
  assert.deepStrictEqual(g.items.w, ['cristallo', 'bomba']);
  assert.ok(G.sandboxEdit(g, { op: 'items', color: 'w', list: ['inesistente'] }));
  assert.strictEqual(G.sandboxEdit(g, { op: 'turn', color: 'b' }), null); assert.strictEqual(g.turn, 'b');
});
t('campo di prova: si gioca la posizione costruita (danni e tipi come nel gioco)', () => {
  const g = G.sandboxGame('empty');
  const re = Object.values(g.pieces).filter((p) => p.role === 're');
  G.sandboxEdit(g, { op: 'put', r: 5, c: 4, color: 'w', role: 'cavallo', type: 'fuoco' });
  G.sandboxEdit(g, { op: 'put', r: 3, c: 3, color: 'b', role: 'torre', type: 'erba' });
  const n = at(g, 5, 4), tr = at(g, 3, 3);
  assert.strictEqual(G.move(g, 'w', n.id, 3, 3), null);
  assert.strictEqual(tr.hp, 8 - 8, 'fuoco su erba ×2: 4×2 = 8 uccide la Torre da 8 HP');
  assert.ok(!tr.alive && re.length === 2);
});

console.log('Scalata');
const SC = require('../public/scalata.js');
function runGame(bonuses, stage, choices) {
  const g = G.newGame(null, { stage: stage || 1, bonuses, color: 'w' });
  g.phase = 'draft';
  S.TYPES.forEach(() => {});
  for (const color of ['w', 'b']) { let i = 0; for (const p of Object.values(g.pieces)) if (p.color === color && p.role !== 're') p.type = S.TYPES[Math.floor(i++ / 2) % 8]; }
  g.phase = 'items';
  const kw = G.kitInfo(g, 'w'), kb = G.kitInfo(g, 'b');
  const pick = (k) => ['pozione', 'scudo', 'cristallo', 'bomba', 'cambio', 'metamorfosi', 'paralisi'].slice(0, k.picks);
  return { g, kw, kb, errW: () => G.setItems(g, 'w', pick(kw), choices), errB: () => G.setItems(g, 'b', pick(kb)) };
}
t('scalata: senza bonus il kit è di 3 e nessuna statistica cambia', () => {
  const r = runGame([], 1); assert.strictEqual(r.kw.picks, 3);
  assert.strictEqual(r.errW(), null); assert.strictEqual(r.errB(), null);
  assert.strictEqual(r.g.phase, 'play'); assert.strictEqual(r.g.pieces.w8.hp, S.ROLES.pedone.hp);
});
t('scalata: bonus di HP e attacco (Armatura, Cuore forte, Affilati, Assalto)', () => {
  const r = runGame(['armatura', 'cuore', 'affilati', 'assalto'], 1); r.errW(); r.errB();
  const P = r.g.pieces; // w0 torre, w1 cavallo, w3 regina, w8 pedone
  assert.strictEqual(P.w8.hp, S.ROLES.pedone.hp + 1 - 1); assert.strictEqual(P.w8.atk, S.ROLES.pedone.atk + 1);
  assert.strictEqual(P.w3.hp, S.ROLES.regina.hp + 2 - 1); assert.strictEqual(P.w0.maxHp, S.ROLES.torre.hp + 2 - 1);
  assert.strictEqual(P.w1.atk, S.ROLES.cavallo.atk + 2); assert.strictEqual(P.b8.hp, S.ROLES.pedone.hp, 'il bot non cambia');
});
t('scalata: Zaino, Pietra, Scorta, Patto e Regina d\'acciaio cambiano il kit', () => {
  assert.strictEqual(runGame(['zaino'], 1).kw.picks, 4);
  assert.strictEqual(runGame(['acciaio'], 1).kw.picks, 2);
  const r = runGame(['patto', 'pietra', 'scorta'], 1); assert.strictEqual(r.kw.picks, 5);
  assert.strictEqual(r.errW(), null); r.errB();
  assert.strictEqual(r.g.items.w.length, 7); assert.ok(r.g.items.w.includes('pietra'));
  assert.strictEqual(r.g.pieces.w3.hp, S.ROLES.regina.hp - 3);
  assert.ok(G.setItems(runGame(['zaino'], 1).g, 'w', ['pozione', 'scudo', 'cristallo']), 'kit di 3 con lo Zaino: rifiutato');
});
t('scalata: i limiti del kit si superano solo con gli strumenti extra', () => {
  const a = runGame([], 1);
  assert.ok(G.setItems(a.g, 'w', ['scudo', 'scudo', 'pozione']), 'senza bonus: 2 Scudi non vanno');
  const b = runGame(['zaino'], 1);
  assert.strictEqual(G.setItems(b.g, 'w', ['scudo', 'scudo', 'pozione', 'cristallo']), null);
});
t('scalata: Veterano, Sarto e Vivaio chiedono una scelta valida', () => {
  const r = runGame(['veterano', 'sarto', 'vivaio'], 1, null);
  assert.ok(r.errW(), 'senza scelte: rifiutato');
  const ok = { veterano: 'w1', sarto: { id: 'w3', type: 'psico' }, vivaio: 'w9' };
  const r2 = runGame(['veterano', 'sarto', 'vivaio'], 1, ok); assert.strictEqual(r2.errW(), null); r2.errB();
  assert.ok(r2.g.pieces.w1.shield); assert.strictEqual(r2.g.pieces.w3.type, 'psico'); assert.strictEqual(r2.g.pieces.w9.r, 5);
  assert.ok(runGame(['vivaio'], 1, { vivaio: 'w3' }).errW(), 'Vivaio vuole un pedone');
  assert.ok(runGame(['veterano'], 1, { veterano: 'w4' }).errW(), 'non il Re');
  assert.ok(runGame(['veterano'], 1, { veterano: 'b1' }).errW(), 'non un pezzo avversario');
});
t('scalata: Pedine d\'oro toglie un Alfiere senza metterlo nel cimitero', () => {
  const r = runGame(['pedine'], 1); r.errW(); r.errB();
  assert.strictEqual(Object.values(r.g.pieces).filter((p) => p.color === 'w' && p.role === 'alfiere' && p.alive).length, 1);
  assert.strictEqual(r.g.graveyard.w.length, 0); assert.strictEqual(r.g.pieces.w8.hp, S.ROLES.pedone.hp + 3);
});
t('scalata: Pugno di ferro (Bomba da 5) e Scudo al bot', () => {
  const r = runGame(['pugno'], 1); r.errW(); r.errB();
  assert.ok(r.g.items.b.includes('scudo') && r.g.items.b.length === 4);
  r.g.items.w.push('bomba');
  const t0 = r.g.pieces.b9; t0.hp = 8; t0.maxHp = 8;
  assert.strictEqual(G.useItem(r.g, 'w', { item: 'bomba', id: 'b9' }), null); assert.strictEqual(t0.hp, 3);
});
t('scalata: i bot degli ultimi scontri hanno vantaggi', () => {
  const r = runGame([], 8); r.errW(); r.errB();
  assert.strictEqual(r.g.pieces.b3.hp, S.ROLES.regina.hp + 2); assert.strictEqual(r.g.pieces.b8.hp, S.ROLES.pedone.hp + 1);
  assert.strictEqual(r.g.items.b.length, 5);
  const r6 = runGame([], 6); r6.errW(); r6.errB(); assert.strictEqual(r6.g.pieces.b3.hp, S.ROLES.regina.hp);
});
t('scalata: normRun e offerta dei bonus', () => {
  assert.deepStrictEqual(SC.normRun({ stage: 99, bonuses: ['zaino', 'zaino', 'zaino', 'finto'] }), { stage: 8, bonuses: ['zaino', 'zaino'] });
  for (let i = 0; i < 50; i++) {
    const o = SC.offer({ bonuses: ['rivincita', 'pietra'] });
    assert.strictEqual(o.length, 3); assert.strictEqual(new Set(o).size, 3);
    assert.ok(!o.includes('rivincita') && !o.includes('pietra'), 'bonus già al massimo non si offrono');
  }
});
t('scalata: senza corsa niente cambia', () => { const g = G.newGame(); assert.strictEqual(g.run, null); assert.strictEqual(G.kitInfo(g, 'w').picks, 3); });

console.log('Tipi a caso');
t('tipi a caso: niente draft, tipi dati subito a tutti i pezzi tranne i Re', () => {
  for (let n = 0; n < 20; n++) {
    const g = G.newGame({ randomTypes: true });
    G.startDraft(g);
    assert.strictEqual(g.phase, 'items'); assert.strictEqual(g.picks, S.DRAFT_PICKS); assert.strictEqual(g.turn, 'w');
    const count = { w: {}, b: {} };
    for (const p of Object.values(g.pieces)) {
      if (p.role === 're') { assert.ok(!p.type, 'il Re non ha tipo'); continue; }
      assert.ok(S.TYPES.includes(p.type), 'ogni pezzo ha un tipo'); count[p.color][p.type] = (count[p.color][p.type] || 0) + 1;
    }
    for (const c of ['w', 'b']) for (const ty of S.TYPES) assert.ok((count[c][ty] || 0) <= S.MAX_PER_TYPE, 'al massimo 2 per tipo');
    assert.deepStrictEqual(count.w, count.b, 'stesso mazzo di tipi per i due lati');
  }
});
t('tipi a caso: si può poi giocare normalmente (kit e inizio partita)', () => {
  const g = G.newGame({ randomTypes: true }); G.startDraft(g);
  assert.strictEqual(G.setItems(g, 'w', ['pozione', 'cristallo', 'bomba']), null);
  assert.strictEqual(G.setItems(g, 'b', ['pozione', 'cristallo', 'bomba']), null);
  assert.strictEqual(g.phase, 'play');
  assert.ok(G.draftPick(g, 'w', 'w8', 'fuoco'), 'il draft non è più possibile');
});
t('draft normale invariato senza il modificatore', () => {
  const g = G.newGame(); G.startDraft(g);
  assert.strictEqual(g.phase, 'draft'); assert.strictEqual(g.picks, 0); assert.ok(!g.pieces.w8.type);
  assert.strictEqual(G.newGame({ randomTypes: 1 }).mods.randomTypes, true); assert.strictEqual(G.newGame().mods.randomTypes, false);
});

console.log('Handicap');
const hcGame = (level, color) => { const g = G.newGame({ randomTypes: true, handicap: { level, color } }); G.startDraft(g); return g; };
const hcPlay = (g, kitW, kitB) => { assert.strictEqual(G.setItems(g, 'w', kitW), null); assert.strictEqual(G.setItems(g, 'b', kitB), null); assert.strictEqual(g.phase, 'play'); };
const alive = (g, c) => Object.values(g.pieces).filter((p) => p.color === c && p.alive);
t('handicap leggero: 2 strumenti per il lato svantaggiato, 3 per l\'altro, nessun pezzo in meno', () => {
  const g = hcGame('light', 'b');
  assert.strictEqual(G.kitInfo(g, 'b').picks, 2); assert.strictEqual(G.kitInfo(g, 'w').picks, 3);
  assert.ok(G.setItems(g, 'b', ['pozione', 'cristallo', 'bomba']), 'tre strumenti non vanno bene');
  hcPlay(g, ['pozione', 'cristallo', 'bomba'], ['pozione', 'bomba']);
  assert.strictEqual(alive(g, 'b').length, 16); assert.strictEqual(g.items.b.length, 2);
});
t('handicap medio: toglie i pedoni delle colonne c e f (senza cimitero)', () => {
  const g = hcGame('medium', 'w'); hcPlay(g, ['pozione', 'bomba'], ['pozione', 'cristallo', 'bomba']);
  assert.strictEqual(alive(g, 'w').length, 14); assert.strictEqual(alive(g, 'b').length, 16);
  assert.ok(!alive(g, 'w').some((p) => p.role === 'pedone' && (p.c === 2 || p.c === 5)));
  assert.deepStrictEqual(g.graveyard.w, []);
});
t('handicap pesante: toglie un Cavallo e una Torre', () => {
  const g = hcGame('heavy', 'b'); hcPlay(g, ['pozione', 'cristallo', 'bomba'], ['pozione', 'bomba']);
  const b = alive(g, 'b');
  assert.strictEqual(b.length, 14); assert.strictEqual(b.filter((p) => p.role === 'torre').length, 1); assert.strictEqual(b.filter((p) => p.role === 'cavallo').length, 1);
  assert.strictEqual(b.filter((p) => p.role === 'pedone').length, 8);
});
t('handicap estremo: niente strumenti e niente Regina', () => {
  const g = hcGame('extreme', 'w');
  assert.strictEqual(G.kitInfo(g, 'w').picks, 0);
  hcPlay(g, [], ['pozione', 'cristallo', 'bomba']);
  assert.deepStrictEqual(g.items.w, []); assert.ok(!alive(g, 'w').some((p) => p.role === 'regina')); assert.ok(alive(g, 'b').some((p) => p.role === 'regina'));
  assert.ok(Object.keys(G.legalMoves(g, 'w')).length > 0);
});
t('handicap: valori non validi ignorati e stato pubblico', () => {
  assert.strictEqual(G.newGame({ handicap: { level: 'boh', color: 'w' } }).mods.handicap, null);
  assert.strictEqual(G.newGame({ handicap: { level: 'light', color: 'x' } }).mods.handicap, null);
  assert.deepStrictEqual(G.publicState({ code: 'ABCDE', game: hcGame('heavy', 'b'), players: { w: { sid: 'x' }, b: { sid: 'y' } } }, 'w').mods.handicap, { level: 'heavy', color: 'b' });
});
t('handicap: il bot sceglie il kit giusto e la partita va avanti', () => {
  const B = require('../bot.js');
  for (const lv of ['light', 'extreme']) {
    const g = hcGame(lv, 'w');
    for (const c of ['w', 'b']) assert.strictEqual(B.act(g, c, 'normal'), null);
    assert.strictEqual(g.phase, 'play'); assert.strictEqual(g.items.w.length, lv === 'extreme' ? 0 : 2);
  }
});

console.log('Sopravvivenza');
const SV = require('../public/survival.js');
const svGame = (random) => { const g = G.newGame({ lucky: { vis: 'full' } }, null, { random }); G.startDraft(g); return g; };
const svStart = (items) => { const g = svGame(true); assert.strictEqual(G.setItems(g, 'w', items || ['pozione', 'pozione', 'pozione', 'bomba', 'bomba', 'scudo']), null); assert.strictEqual(g.phase, 'prep'); assert.strictEqual(G.startWave(g, 'w'), null); return g; };
const svEnemies = (g) => Object.values(g.pieces).filter((p) => p.color === 'b' && p.alive);
t('sopravvivenza: parte con la sola tua squadra, kit da 6, tipi a caso max 2 per tipo', () => {
  const g = svGame(true);
  assert.strictEqual(Object.values(g.pieces).filter((p) => p.color === 'b').length, 0);
  assert.strictEqual(g.phase, 'items'); assert.strictEqual(G.kitInfo(g, 'w').picks, 6); assert.strictEqual(g.itemsReady.b, true);
  const cnt = {}; for (const p of Object.values(g.pieces)) if (p.role !== 're') { assert.ok(S.TYPES.includes(p.type)); cnt[p.type] = (cnt[p.type] || 0) + 1; }
  assert.ok(Object.values(cnt).every((n) => n <= 2));
  assert.ok(G.setItems(g, 'w', ['pozione', 'bomba', 'scudo']), 'servono 6 strumenti');
});
t('sopravvivenza: draft manuale di soli 15 pezzi, sempre il tuo turno', () => {
  const g = svGame(false);
  assert.strictEqual(g.phase, 'draft');
  const mine = Object.values(g.pieces).filter((p) => p.role !== 're');
  mine.forEach((p, i) => { assert.strictEqual(g.turn, 'w'); assert.strictEqual(G.draftPick(g, 'w', p.id, S.TYPES[i % 8]), null); });
  assert.strictEqual(g.phase, 'items');
});
t('sopravvivenza: l\'ondata 1 compare nelle prime file nemiche, il nemico muove per primo', () => {
  const g = svStart();
  assert.strictEqual(g.phase, 'play'); assert.strictEqual(g.turn, 'b'); assert.strictEqual(g.surv.wave, 1);
  const en = svEnemies(g);
  assert.ok(en.length >= 1 && en.every((p) => S.TYPES.includes(p.type) && p.r <= 2 && (p.role !== 'pedone' || p.r >= 1) && !(p.role !== 'pedone' && p.r > 1)));
  assert.ok(new Set(en.map((p) => p.r * 8 + p.c)).size === en.length, 'nessuna casella doppia');
  assert.ok(!en.some((p) => p.role === 're'));
});
t('sopravvivenza: budget e limiti delle ondate rispettati (30 ondate)', () => {
  for (let w = 1; w <= 30; w++) for (let k = 0; k < 20; k++) {
    const g = svStart(); g.surv.wave = w - 1; for (const p of Object.values(g.pieces)) if (p.color === 'b') delete g.pieces[p.id];
    g.phase = 'over'; g.surv.state = 'cleared'; assert.strictEqual(G.nextWave(g, 'w', 'now'), null); assert.strictEqual(G.startWave(g, 'w'), null);
    const en = svEnemies(g); const roles = en.map((p) => p.role);
    const cost = roles.reduce((a, r) => a + SV.COST[r], 0);
    assert.ok(cost <= SV.budget(w) && en.length <= 24, `ondata ${w}: costo ${cost}`);
    for (const r of Object.keys(SV.COST)) assert.ok(roles.filter((x) => x === r).length <= SV.CAP[r](w), `${r} oltre il limite all'ondata ${w}`);
  }
});
t('sopravvivenza: sconfiggere tutti i nemici supera l\'ondata, la squadra torna a casa e resta ferita', () => {
  const g = svStart();
  const [keep, ...rest] = svEnemies(g); for (const p of rest) { p.alive = false; g.graveyard.b.push(p.id); }
  keep.alive = true; keep.role = 'pedone'; keep.hp = 3; keep.maxHp = 4; keep.r = 2; keep.c = 3;
  g.turn = 'w';
  g.pieces.w10.hp = 1; g.pieces.w12.alive = false; g.graveyard.w.push('w12'); g.pieces.w3.r = 4; g.pieces.w3.c = 4;
  assert.strictEqual(G.useItem(g, 'w', { item: 'bomba', id: keep.id }), null);
  assert.strictEqual(g.phase, 'over'); assert.strictEqual(g.winner, 'w'); assert.strictEqual(g.surv.state, 'cleared'); assert.strictEqual(g.surv.cleared, 1);
  assert.strictEqual(g.surv.bonusDue, false);
  assert.strictEqual(G.nextWave(g, 'w'), null);
  assert.strictEqual(g.phase, 'prep'); assert.strictEqual(G.startWave(g, 'w'), null);
  assert.strictEqual(g.phase, 'play'); assert.strictEqual(g.turn, 'b'); assert.strictEqual(g.surv.wave, 2);
  assert.strictEqual(g.pieces.w10.hp, 1, 'gli HP persi restano'); assert.strictEqual(g.pieces.w12.alive, false, 'i caduti restano caduti');
  assert.deepStrictEqual([g.pieces.w3.r, g.pieces.w3.c], [7, 3], 'tornato alla casa');
  assert.deepStrictEqual(g.graveyard.w, ['w12']); assert.deepStrictEqual(g.graveyard.b.filter((id) => g.pieces[id]), []);
  assert.ok(G.nextWave(g, 'w'), 'a partita in corso non si può chiamare');
});
t('sopravvivenza: ogni 3 ondate un bonus (subito +2 HP oppure Cura di squadra da tenere)', () => {
  const clear = (g) => { for (const p of svEnemies(g)) { p.alive = false; } g.turn = 'w'; g.items.w.push('bomba'); g.pieces.b999 = { ...g.pieces.w8, id: 'b999', color: 'b', alive: true, hp: 1, r: 1, c: 0 }; assert.strictEqual(G.useItem(g, 'w', { item: 'bomba', id: 'b999' }), null); };
  const g = svStart(); g.surv.cleared = 2; g.pieces.w9.hp = 1; g.pieces.w10.hp = 3;
  clear(g);
  assert.strictEqual(g.surv.cleared, 3); assert.strictEqual(g.surv.bonusDue, true);
  assert.ok(G.nextWave(g, 'w'), 'senza scelta non si va avanti'); assert.ok(G.nextWave(g, 'w', 'boh'));
  const g2 = structuredClone(g);
  assert.strictEqual(G.nextWave(g, 'w', 'now'), null); assert.strictEqual(g.phase, 'prep');
  assert.strictEqual(g.pieces.w9.hp, 3); assert.strictEqual(g.pieces.w10.hp, 4, 'non oltre il massimo');
  assert.strictEqual(G.nextWave(g2, 'w', 'keep'), null);
  assert.ok(g2.items.w.includes('curasq')); assert.strictEqual(g2.pieces.w9.hp, 1);
  assert.strictEqual(G.startWave(g2, 'w'), null); g2.turn = 'w';
  assert.strictEqual(G.useItem(g2, 'w', { item: 'curasq' }), null);
  assert.strictEqual(g2.pieces.w9.hp, 2); assert.ok(!g2.items.w.includes('curasq')); assert.strictEqual(g2.turn, 'b', 'costa il turno');
});
t('sopravvivenza: la casella fortunata compare vicino al Re, la prende solo il Re e ne esce una sola per ondata', () => {
  const g = svStart(); const king = g.pieces.w4;
  for (const p of svEnemies(g)) p.alive = false;
  g.pieces.b900 = { ...g.pieces.w8, id: 'b900', color: 'b', alive: true, r: 1, c: 0, hp: 40, maxHp: 40 };
  g.items.w.push('cristallo'); g.pieces.w15.hp = 1;
  for (let i = 0; i < 4 && !g.lucky.sq; i++) { // quattro mezze mosse: tocca al nemico poi a te…
    const c = g.turn; const lm = G.legalMoves(g, c);
    const id = Object.keys(lm).find((k) => lm[k].some((m) => m.kind === 'move') && g.pieces[k].role === 'pedone');
    const m = lm[id].find((x) => x.kind === 'move');
    assert.strictEqual(G.move(g, c, id, m.r, m.c), null);
  }
  const sq = g.lucky.sq; assert.ok(sq, 'la casella è comparsa');
  const d = Math.max(Math.abs(sq.r - king.r), Math.abs(sq.c - king.c));
  assert.ok(d >= 2 && d <= 3); assert.ok(Object.keys(SV.SQUARE).includes(sq.bonus)); assert.strictEqual(g.lucky.used, true);
  // un pezzo normale non la prende; il Re sì
  g.lucky.sq = { r: 4, c: 4, bonus: 'pozione' };
  for (const p of Object.values(g.pieces)) if (p.color === 'w' && p.alive && p.id !== 'w8' && p.id !== 'w4' && p.r >= 4) p.alive = false;
  Object.assign(g.pieces.w8, { r: 5, c: 4 }); Object.assign(king, { r: 5, c: 6, hasMoved: true });
  for (const p of svEnemies(g)) if (p.id !== 'b900') p.alive = false;
  g.turn = 'w'; g.pending = null; g.shieldLock = null;
  const n0 = g.items.w.length;
  assert.strictEqual(G.move(g, 'w', 'w8', 4, 4), null);
  assert.ok(g.lucky.sq, 'il pedone non la prende'); assert.strictEqual(g.items.w.length, n0);
  Object.assign(g.pieces.w8, { r: 3, c: 3 }); Object.assign(king, { r: 5, c: 5 });
  g.turn = 'w';
  assert.strictEqual(G.move(g, 'w', 'w4', 4, 4), null);
  assert.strictEqual(g.lucky.sq, null); assert.strictEqual(g.items.w.length, n0 + 1);
  for (let i = 0; i < 12; i++) { const c = g.turn; const lm = G.legalMoves(g, c); const id = Object.keys(lm).find((k) => lm[k].some((m) => m.kind === 'move') && g.pieces[k].role !== 're'); if (!id) break; const m = lm[id].find((x) => x.kind === 'move'); if (G.move(g, c, id, m.r, m.c)) break; if (g.phase !== 'play') break; }
  assert.strictEqual(g.lucky.sq, null, 'una sola casella per ondata');
});
t('sopravvivenza: prima dell\'ondata sistemi i pezzi nelle prime 3 file (pedoni non nella prima), poi Via', () => {
  const g = svGame(true); G.setItems(g, 'w', ['pozione', 'pozione', 'pozione', 'bomba', 'bomba', 'scudo']);
  assert.strictEqual(g.phase, 'prep'); assert.strictEqual(g.surv.wave, 0);
  assert.strictEqual(svEnemies(g).length, 0, 'i nemici non si vedono prima');
  assert.strictEqual(G.placePiece(g, 'w', 'w3', 5, 4), null); // regina in terza fila
  assert.deepStrictEqual([g.pieces.w3.r, g.pieces.w3.c], [5, 4]);
  assert.ok(G.placePiece(g, 'w', 'w3', 4, 4), 'solo prime 3 file');
  assert.ok(G.placePiece(g, 'w', 'w8', 7, 0), 'pedone non in prima fila (e la torre sarebbe scambiata)');
  assert.strictEqual(G.placePiece(g, 'w', 'w4', 7, 3), null, 'scambio Re e Regina: il Re va dove stava la Regina');
  assert.deepStrictEqual([g.pieces.w4.r, g.pieces.w4.c], [7, 3]); assert.deepStrictEqual([g.pieces.w3.r, g.pieces.w3.c], [5, 4]);
  assert.strictEqual(G.placePiece(g, 'w', 'w8', 5, 0), null, 'pedone in terza fila'); // w8 era (6,0)
  assert.strictEqual(G.placePiece(g, 'w', 'w9', 6, 0), null, 'scambia con chi c\'è (nessuno ora: w8 è salito)');
  assert.ok(G.placePiece(g, 'b', 'w3', 6, 4), 'solo il giocatore');
  assert.ok(G.nextWave(g, 'w'), 'nextWave non vale in prep');
  assert.strictEqual(G.startWave(g, 'w'), null);
  assert.strictEqual(g.phase, 'play'); assert.strictEqual(g.turn, 'b');
  assert.strictEqual(g.pieces.w4.hasMoved, true, 'il Re fuori casa non arrocca'); assert.strictEqual(g.pieces.w8.hasMoved, true, 'pedone in 3ª fila: niente doppio passo');
  assert.strictEqual(g.pieces.w0.hasMoved, false, 'la Torre in casa può ancora arroccare');
  assert.ok(G.placePiece(g, 'w', 'w3', 5, 5), 'a ondata in corso non si sposta');
});
t('sopravvivenza: le posizioni scelte non si ripetono: dopo l\'ondata si riparte dalle case ma si può risistemare', () => {
  const g = svStart();
  for (const p of svEnemies(g)) p.alive = false; g.turn = 'w'; g.items.w.push('bomba');
  g.pieces.b900 = { ...g.pieces.w8, id: 'b900', color: 'b', alive: true, hp: 1, r: 1, c: 0 };
  assert.strictEqual(G.useItem(g, 'w', { item: 'bomba', id: 'b900' }), null);
  assert.strictEqual(G.nextWave(g, 'w'), null); assert.strictEqual(g.phase, 'prep');
  assert.deepStrictEqual([g.pieces.w3.r, g.pieces.w3.c], [7, 3]);
  G.placePiece(g, 'w', 'w3', 5, 3); assert.strictEqual(G.resetPlacement(g, 'w'), null);
  assert.deepStrictEqual([g.pieces.w3.r, g.pieces.w3.c], [7, 3]);
});
t('sopravvivenza: perdere il Re (matto) finisce la corsa', () => {
  const g = svStart();
  const st = G.publicState({ code: 'ABCDE', game: g, players: { w: { sid: 'x' }, b: { bot: true } }, surv: true }, 'w');
  assert.strictEqual(st.surv.wave, 1); assert.strictEqual(st.surv.state, 'play'); assert.strictEqual(st.canUndo, false); assert.ok(st.surv.enemies >= 1);
  g.phase = 'over'; g.winner = 'b';
  assert.strictEqual(G.publicState({ code: 'ABCDE', game: g, players: { w: { sid: 'x' }, b: { bot: true } } }, 'w').surv.state, 'lost');
});

const PZ = require('../public/puzzles.js');
const PS = require('../tools/puzzle-solve.js');
t('puzzle: ids unici, partenza valida (nessun scacco), bersagli esistenti', () => {
  assert.ok(PZ.LIST.length >= 10);
  assert.strictEqual(new Set(PZ.LIST.map((p) => p.id)).size, PZ.LIST.length);
  for (const d of PZ.LIST) {
    const g = G.puzzleGame(d);
    assert.strictEqual(g.phase, 'play'); assert.strictEqual(g.turn, 'w');
    assert.ok(!G.inCheck(g, 'w') && !G.inCheck(g, 'b'), d.id + ' parte senza scacco');
    assert.ok(g.pieces.w0 && g.pieces.w0.role === 're' && g.pieces.b0 && g.pieces.b0.role === 're', d.id + ' ha i due Re');
    if (d.goal.type === 'kill') assert.ok(g.pieces['b' + d.goal.target] && g.pieces['b' + d.goal.target].alive, d.id + ' bersaglio');
    assert.ok(PZ.byId(d.id) === d && PZ.goalText(d).length > 5 && d.hint);
  }
});
t('puzzle: i puzzle a 1-2 mosse hanno una soluzione forzata e non più breve', () => {
  for (const d of PZ.LIST.filter((p) => p.moves <= 2)) {
    const g = G.puzzleGame(d);
    assert.ok(PS.firstWinning(g, d.goal, d.moves, false).length > 0, d.id + ' risolvibile');
    for (let k = 1; k < d.moves; k++) assert.ok(!PS.wins(g, d.goal, k), d.id + ' non in meno mosse');
  }
});
t('puzzle: p1 si risolve con Regina in b7; mosse finite = non risolto; niente undo', () => {
  const g = G.puzzleGame(PZ.byId('p1'));
  assert.strictEqual(G.move(g, 'w', 'w1', 1, 1), null);
  assert.strictEqual(g.phase, 'over'); assert.strictEqual(g.winner, 'w');
  const st = G.publicState({ code: 'ABCDE', game: g, players: { w: { sid: 'x' }, b: { bot: true } } }, 'w');
  assert.strictEqual(st.puzzle.state, 'solved'); assert.strictEqual(st.canUndo, false);
  const h = G.puzzleGame(PZ.byId('p1'));
  assert.strictEqual(G.move(h, 'w', 'w0', 4, 3), null); // mossa sbagliata
  assert.strictEqual(h.phase, 'over'); assert.strictEqual(h.winner, null);
  assert.strictEqual(G.publicState({ code: 'ABCDE', game: h, players: { w: { sid: 'x' }, b: { bot: true } } }, 'w').puzzle.state, 'failed');
});

console.log(`\n${passed} test passati`);
