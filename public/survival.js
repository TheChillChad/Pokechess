// Sopravvivenza: ondate di nemici casuali contro la tua squadra, che si consuma (hardcore).
// Dati condivisi tra server e client. Per bilanciare basta cambiare i numeri qui.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Survival = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KIT = 6;          // strumenti scelti all'inizio (uno solo, per tutta la corsa)
  const EVERY = 3;        // un bonus ogni 3 ondate superate
  const BONUS_NOW = 2;    // «usalo subito»: +2 HP a tutti i pezzi sopravvissuti
  const BONUS_KEEP = 1;   // «tienilo»: strumento Cura di squadra, +1 HP a tutti
  const COST = { pedone: 1, cavallo: 3, alfiere: 3, torre: 4, regina: 7 };
  const WEIGHT = { pedone: 45, cavallo: 20, alfiere: 20, torre: 10, regina: 5 };
  // quanti pezzi di un ruolo al massimo in un'ondata (w = numero dell'ondata)
  const CAP = {
    pedone: () => 16,
    cavallo: (w) => 1 + Math.floor(w / 2),
    alfiere: (w) => 1 + Math.floor(w / 2),
    torre: (w) => Math.floor(w / 3),
    regina: (w) => Math.floor(w / 5),
  };
  const budget = (w) => 3 + 2 * w;                 // punti da spendere per le ondata w
  const hpBonus = (w) => Math.floor((w - 1) / 5);  // dopo l'ondata 5, 10… tutti i nemici hanno +1 HP in più
  const LEVELS = ['l1', 'l3', 'l4', 'l5', 'l6', 'l7']; // livello del bot per ondata (dal sesto in poi: l7)
  const levelFor = (w) => LEVELS[Math.max(0, Math.min(LEVELS.length, w) - 1)];
  // bonus della casella del Re (w = peso)
  const SQUARE = { pozione: 30, revitalizzante: 25, metamorfosi: 20, scudo: 25 };
  const SQUARE_DIST = [2, 3]; // distanza dal Re (in mosse del Re) a cui compare la casella
  return { KIT, EVERY, BONUS_NOW, BONUS_KEEP, COST, WEIGHT, CAP, budget, hpBonus, LEVELS, levelFor, SQUARE, SQUARE_DIST };
});
