// Dati condivisi tra server e client (tipi, statistiche, strumenti).
// Unica fonte di verità: per bilanciare il gioco basta modificare qui.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shared = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = ['fuoco', 'acqua', 'erba', 'elettro', 'ghiaccio', 'psico', 'buio', 'folletto'];

  const TYPE_LABEL = {
    fuoco: 'Fuoco', acqua: 'Acqua', erba: 'Erba', elettro: 'Elettro',
    ghiaccio: 'Ghiaccio', psico: 'Psico', buio: 'Buio', folletto: 'Folletto',
  };

  // L'attaccante di tipo X fa ×2 ai tipi in STRONG[X]
  const STRONG = {
    fuoco: ['erba', 'ghiaccio'],
    acqua: ['fuoco', 'psico'],
    erba: ['acqua', 'folletto'],
    elettro: ['acqua', 'buio'],
    ghiaccio: ['erba', 'folletto'],
    psico: ['elettro', 'ghiaccio'],
    buio: ['psico', 'fuoco'],
    folletto: ['buio', 'elettro'],
  };

  // Il difensore di tipo X subisce ×0,5 dagli attaccanti in RESIST[X]
  const RESIST = {
    fuoco: ['fuoco', 'folletto'],
    acqua: ['fuoco', 'acqua'],
    erba: ['acqua', 'erba'],
    elettro: ['elettro', 'erba'],
    ghiaccio: ['ghiaccio', 'elettro'],
    psico: ['psico', 'ghiaccio'],
    buio: ['buio', 'psico'],
    folletto: ['buio', 'folletto'],
  };

  const ROLES = {
    pedone: { label: 'Pedone', hp: 4, atk: 2 },
    cavallo: { label: 'Cavallo', hp: 7, atk: 4 },
    alfiere: { label: 'Alfiere', hp: 7, atk: 4 },
    torre: { label: 'Torre', hp: 10, atk: 5 },
    regina: { label: 'Regina', hp: 12, atk: 7 },
    re: { label: 'Re', hp: null, atk: 3 }, // il Re non ha HP, fa sempre ×2 e non si può colpire: si perde per scacco matto
  };

  const ITEMS = {
    pozione: { label: 'Pozione', active: true, desc: '+5 HP a un tuo pezzo ferito.' },
    revitalizzante: { label: 'Revitalizzante', active: true, desc: 'Riporta in campo un tuo pezzo sconfitto con metà HP, nelle tue prime due file.' },
    scudo: { label: 'Scudo', active: true, free: true, desc: 'Un tuo pezzo ignora il prossimo attacco. Non costa il turno: poi muovi un altro pezzo (quello con lo Scudo no). Una sola azione gratuita per turno.' },
    cristallo: { label: 'Cristallo', active: true, desc: 'Il prossimo attacco di un tuo pezzo fa ×1,5 di danno.' },
    cambio: { label: 'Cambio', active: true, desc: 'Scambia di posto due tuoi pezzi.' },
    paralisi: { label: 'Paralisi', active: true, free: true, desc: 'Un pezzo avversario (non il Re) non può muoversi né attaccare al suo prossimo turno. Non costa il turno: poi muovi un pezzo.' },
    metamorfosi: { label: 'Metamorfosi', active: true, desc: 'Cambia il tipo di un tuo pezzo (non il Re) con un tipo a scelta.' },
    bomba: { label: 'Bomba', active: true, desc: 'Infligge 3 danni fissi (senza tipi) a un pezzo avversario, anche lontano. Il Re non si può colpire.' },
    pietra: { label: 'Pietra Evolutiva', active: false, desc: 'Si usa da sola: quando un tuo pedone arriva in fondo scegli Regina, Torre, Alfiere o Cavallo. Senza Pietra diventa Cavallo.' },
  };
  const ITEM_IDS = ['pozione', 'revitalizzante', 'scudo', 'cristallo', 'cambio', 'paralisi', 'metamorfosi', 'bomba', 'pietra'];

  const TEAM = { w: 'Blu', b: 'Rosso' };
  const MAX_PER_TYPE = 2;
  const KIT_SIZE = 3;
  const DRAFT_PICKS = 30; // 15 pezzi a testa (il Re non ha tipo)

  // Ordine del draft a serpentina: Blu, Rosso, Rosso, Blu, Blu, Rosso, Rosso, Blu…
  // (i = numero di scelte già fatte). L'ultima scelta, la 30ª, è del Rosso, che muove per secondo.
  function draftTurn(i) { return i % 4 === 0 || i % 4 === 3 ? 'w' : 'b'; }

  // moltiplicatore di tipo: attaccante -> difensore
  function mult(attType, defType) {
    if (!attType || !defType) return 1;
    if (STRONG[attType] && STRONG[attType].includes(defType)) return 2;
    if (RESIST[defType] && RESIST[defType].includes(attType)) return 0.5;
    return 1;
  }

  return { TYPES, TYPE_LABEL, STRONG, RESIST, ROLES, ITEMS, ITEM_IDS, TEAM, MAX_PER_TYPE, KIT_SIZE, DRAFT_PICKS, draftTurn, mult };
});
