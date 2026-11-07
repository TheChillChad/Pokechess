// Scalata: 8 scontri contro bot di forza crescente. Dopo ogni vittoria si sceglie 1 bonus tra 3.
// Dati condivisi tra server e client. Per bilanciare basta cambiare i numeri qui.
// Stato di una "corsa" (run): { stage: 1..8, bonuses: [id, ...], choices: { veterano, sarto, vivaio } }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scalata = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // livello del bot (vedi LEVELS in bot.js) e vantaggi dati al bot (solo gli ultimi due scontri)
  const STAGES = [
    { name: 'Recluta', level: 'l1' },
    { name: 'Soldato', level: 'l3' },
    { name: 'Sergente', level: 'l4' },
    { name: 'Capitano', level: 'l5' },
    { name: 'Maggiore', level: 'l6' },
    { name: 'Colonnello', level: 'l7' },
    { name: 'Generale', level: 'l7', hp: { pedone: 1 }, items: ['pozione'] },
    { name: 'Campione', level: 'l7', hp: { pedone: 1, regina: 2, torre: 2 }, items: ['pozione', 'scudo'] },
  ];

  // choice: 'piece' (un tuo pezzo, non il Re), 'pawn' (un tuo pedone), 'type' (un tuo pezzo + un tipo)
  const BONUSES = {
    armatura: { icon: '🛡️', label: 'Armatura', desc: '+1 HP a tutti i pedoni.', w: 10, max: 2 },
    cuore: { icon: '❤️', label: 'Cuore forte', desc: '+2 HP alla Regina e alle Torri.', w: 10, max: 2 },
    affilati: { icon: '🗡️', label: 'Affilati', desc: '+1 attacco ai Cavalli e agli Alfieri.', w: 10, max: 2 },
    zaino: { icon: '🎒', label: 'Zaino', desc: '+1 strumento nel kit (anche oltre i limiti).', w: 10, max: 2 },
    scorta: { icon: '🧪', label: 'Scorta', desc: 'Parti con una Pozione in più.', w: 10, max: 2 },
    veterano: { icon: '🎖️', label: 'Veterano', desc: 'Un pezzo a scelta parte con lo Scudo già attivo.', w: 10, max: 1, choice: 'piece' },
    sarto: { icon: '🎨', label: 'Sarto dei tipi', desc: 'Cambi il tipo di un pezzo prima della partita.', w: 10, max: 1, choice: 'type' },
    vivaio: { icon: '🌱', label: 'Vivaio', desc: 'Un pedone a scelta parte già in terza fila.', w: 10, max: 1, choice: 'pawn' },
    pietra: { icon: '💎', label: 'Pietra', desc: 'Un quarto strumento: la Pietra Evolutiva in più rispetto ai 3 del kit.', w: 12, max: 1 },
    seconda: { icon: '↶', label: 'Seconda possibilità', desc: 'Una volta per scontro puoi annullare una tua mossa.', w: 10, max: 1 },
    rivincita: { icon: '🔁', label: 'Rivincita', desc: 'Se perdi uno scontro lo ripeti una volta (poi il bonus sparisce).', w: 5, max: 1 },
    acciaio: { icon: '👑', label: 'Regina d\'acciaio', desc: '+4 HP alla Regina, ma il kit scende a 2 strumenti.', w: 13, max: 1, price: true },
    assalto: { icon: '⚔️', label: 'Assalto', desc: '+1 attacco a tutti i pezzi, ma −1 HP a tutti.', w: 13, max: 2, price: true },
    pugno: { icon: '💥', label: 'Pugno di ferro', desc: 'La tua Bomba fa 5 danni invece di 3, ma il bot parte con uno Scudo.', w: 13, max: 1, price: true },
    pedine: { icon: '🪙', label: 'Pedine d\'oro', desc: '+3 HP a tutti i pedoni, ma perdi un Alfiere.', w: 13, max: 1, price: true },
    patto: { icon: '📜', label: 'Patto del Re', desc: '+2 strumenti extra, ma la Regina parte con 7 HP invece di 10.', w: 8, max: 1, price: true },
  };
  const BONUS_IDS = Object.keys(BONUSES);
  const STAGE_COUNT = STAGES.length;

  const count = (run, id) => ((run && run.bonuses) || []).filter((b) => b === id).length;
  const has = (run, id) => count(run, id) > 0;

  // Rende valida una corsa arrivata dal client (numero di scontro, bonus noti, massimo per bonus)
  function normRun(run) {
    if (!run || typeof run !== 'object') return null;
    const stage = Math.min(STAGE_COUNT, Math.max(1, Math.floor(+run.stage) || 1));
    const bonuses = [];
    for (const id of Array.isArray(run.bonuses) ? run.bonuses : []) {
      if (BONUSES[id] && bonuses.filter((b) => b === id).length < BONUSES[id].max && bonuses.length < STAGE_COUNT - 1) bonuses.push(id);
    }
    return { stage, bonuses };
  }

  // Kit di uno dei due lati: quanti strumenti si scelgono, quali sono dati in più e di quanto si superano i limiti
  function kitFor(run, isPlayer, base) {
    if (!run) return { picks: base, forced: [], extraCap: 0 };
    if (!isPlayer) {
      const st = STAGES[run.stage - 1];
      const forced = (st.items || []).slice();
      if (has(run, 'pugno')) forced.push('scudo');
      return { picks: base, forced, extraCap: 0 };
    }
    const extra = count(run, 'zaino') + 2 * count(run, 'patto');
    const forced = [];
    for (let i = 0; i < count(run, 'scorta'); i++) forced.push('pozione');
    for (let i = 0; i < count(run, 'pietra'); i++) forced.push('pietra');
    return { picks: Math.max(1, base + extra - count(run, 'acciaio')), forced, extraCap: extra };
  }

  // Scelte che il giocatore deve fare prima della partita (in base ai bonus presi)
  const choicesNeeded = (run) => BONUS_IDS.filter((id) => BONUSES[id].choice && has(run, id)).map((id) => ({ id, kind: BONUSES[id].choice }));

  // 3 bonus a caso (con peso), senza quelli già al massimo
  function offer(run, rnd, n = 3) {
    rnd = rnd || Math.random;
    const pool = BONUS_IDS.filter((id) => count(run, id) < BONUSES[id].max);
    const out = [];
    while (out.length < n && pool.length) {
      const tot = pool.reduce((s, id) => s + BONUSES[id].w, 0);
      let x = rnd() * tot, k = 0;
      for (; k < pool.length - 1; k++) { x -= BONUSES[pool[k]].w; if (x < 0) break; }
      out.push(pool.splice(k, 1)[0]);
    }
    return out;
  }

  return { STAGES, BONUSES, BONUS_IDS, STAGE_COUNT, count, has, normRun, kitFor, choicesNeeded, offer };
});
