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
  place(g, 'b8', 4, 5, { type: 'fuoco' });   // pedone nero, non minaccia il Re
  const m = G.legalMoves(g, 'w')['w4'].find((x) => x.r === 4 && x.c === 5);
  assert.strictEqual(m.dmg, 6);
  assert.strictEqual(m.eff, 1);
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
  place(g, 'w0', 0, 0, { type: 'fuoco' });                 // torre bianca che dà scacco, 10 HP
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
  place(g, 'w3', 3, 1, { role: 'regina', hp: 12, maxHp: 12, atk: 7 });
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
t('Paralisi: il pezzo non muove nel turno avversario, poi torna libero', () => {
  const g = startedGame(['paralisi', 'pozione', 'scudo']);
  assert.strictEqual(G.useItem(g, 'w', { item: 'paralisi', id: 'b8' }), null);
  assert.strictEqual(g.turn, 'b');
  assert.ok(!G.legalMoves(g, 'b')['b8'], 'nessuna mossa per il pezzo paralizzato');
  assert.ok(G.move(g, 'b', 'b8', 2, 0));
  assert.strictEqual(G.move(g, 'b', 'b9', 2, 1), null);
  assert.strictEqual(g.pieces.b8.frozen, false, 'dopo il suo turno è di nuovo libero');
  assert.strictEqual(g.turn, 'w');
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
  assert.strictEqual(g.pieces.b0.hp, 7);
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
  assert.strictEqual(g.pieces.w8.maxHp, 12);
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
  assert.strictEqual(G.setItems(g, 'w', ['scudo', 'scudo', 'pietra']), null);
  assert.strictEqual(g.phase, 'items');
  assert.strictEqual(G.setItems(g, 'b', ['pozione', 'cambio', 'cristallo']), null);
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.turn, 'w');
});

console.log(`\n${passed} test passati`);
