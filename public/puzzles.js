// Puzzle: posizioni già pronte con un obiettivo e un numero massimo di mosse.
// Pezzo: [ruolo, tipo, HP, riga, colonna, extra?]; il Blu (in basso) è sempre il giocatore.
// Obiettivo: {type:'mate'} (dai scacco matto), {type:'kill', target:n} (sconfiggi il pezzo n della lista b) o {type:'clear'}.
// «moves» = i tuoi turni (le azioni gratuite, Scudo e Paralisi, non contano). Controllo: node tools/puzzle-check.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Puzzles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LIST = [
    { id: 'p1', title: "Matto della regina", text: "Il Re nero è chiuso vicino all'angolo.", hint: "Cerca la casella dove la Regina è protetta dall'Alfiere.",
      goal: {"type":"mate"}, moves: 1,
      w: [["re",null,0,4,4], ["regina","acqua",4,2,2], ["alfiere","folletto",6,2,0]],
      b: [["re",null,0,1,0]],
      items: {"w":[],"b":[]} },
    { id: 'p2', title: "La regina bloccata", text: "La Regina nera difende il suo Re. E se non potesse muoversi?", hint: "Paralizza la Regina nera, poi chiudi il Re con una Torre.",
      goal: {"type":"mate"}, moves: 1,
      w: [["re",null,0,5,3], ["torre","fuoco",4,6,4], ["torre","psico",5,3,1]],
      b: [["re",null,0,0,0], ["cavallo","elettro",7,0,7], ["regina","fuoco",9,0,2]],
      items: {"w":["pozione","paralisi"],"b":[]} },
    { id: 'p3', title: "Il pezzo fragile", text: "Il bersaglio ha pochi HP, ma nessun tuo pezzo lo raggiunge.", hint: "Uno strumento colpisce anche da lontano.",
      goal: {"type":"kill","target":1}, moves: 1,
      w: [["re",null,0,2,5], ["cavallo","folletto",5,7,1], ["torre","psico",3,5,2]],
      b: [["re",null,0,2,7], ["torre","erba",3,3,3], ["regina","buio",7,3,0]],
      items: {"w":["bomba","cristallo"],"b":[]} },
    { id: 'p4', title: "Il colpo giusto", text: "Il bersaglio ha 5 HP.", hint: "Solo un tuo pezzo ha abbastanza attacco per eliminarlo in un colpo.",
      goal: {"type":"kill","target":2}, moves: 1,
      w: [["re",null,0,3,0], ["cavallo","folletto",6,7,2], ["alfiere","folletto",7,2,6], ["regina","psico",6,2,5]],
      b: [["re",null,0,0,2], ["torre","buio",3,0,6], ["alfiere","fuoco",5,3,4]],
      items: {"w":[],"b":[]} },
    { id: 'p5', title: "Re, Cavallo e Torre", text: "Due mosse: la prima non dà scacco.", hint: "Porta il Re vicino prima di dare scacco.",
      goal: {"type":"mate"}, moves: 2,
      w: [["re",null,0,2,4], ["cavallo","erba",6,4,5], ["torre","elettro",6,4,6]],
      b: [["re",null,0,2,7]],
      items: {"w":[],"b":[]} },
    { id: 'p6', title: "Torre sotto scacco", text: "La Torre nera protegge il suo Re. Fermala per un turno.", hint: "Paralizza la Torre nera, poi cerca il matto.",
      goal: {"type":"mate"}, moves: 2,
      w: [["re",null,0,4,1], ["regina","elettro",9,2,4], ["torre","psico",3,7,1]],
      b: [["re",null,0,3,7], ["torre","elettro",5,1,6]],
      items: {"w":["paralisi"],"b":[]} },
    { id: 'p7', title: "L'alfiere in fuga", text: "Due mosse, due strumenti: usali nell'ordine giusto.", hint: "Lo Scudo non costa il turno: puoi usarlo e muovere subito.",
      goal: {"type":"kill","target":1}, moves: 2,
      w: [["re",null,0,5,2], ["torre","fuoco",6,6,3], ["torre","buio",5,3,0]],
      b: [["re",null,0,0,1], ["alfiere","folletto",5,1,7]],
      items: {"w":["scudo","bomba"],"b":[]} },
    { id: 'p8', title: "Il cavallo d'erba", text: "Il Cavallo nero è lontano dal tuo Re. Hai due Paralisi.", hint: "Paralizza il Cavallo subito e avvicina l'Alfiere.",
      goal: {"type":"kill","target":1}, moves: 2,
      w: [["re",null,0,3,1], ["alfiere","psico",5,4,7], ["pedone","elettro",4,5,3]],
      b: [["re",null,0,0,0], ["cavallo","erba",4,0,7]],
      items: {"w":["paralisi","paralisi"],"b":[]} },
    { id: 'p9', title: "Tre mosse", text: "Il Re nero è vicino al bordo: stringilo con calma.", hint: "Muovi prima il Re per togliergli delle caselle.",
      goal: {"type":"mate"}, moves: 3,
      w: [["re",null,0,1,4], ["regina","acqua",6,7,1], ["cavallo","ghiaccio",3,2,7]],
      b: [["re",null,0,2,0]],
      items: {"w":[],"b":[]} },
    { id: 'p10', title: "Il Cavallo difensore", text: "Il Cavallo nero difende il suo Re.", hint: "Paralizza il Cavallo, poi avvicina il Re.",
      goal: {"type":"mate"}, moves: 2,
      w: [["re",null,0,5,5], ["torre","ghiaccio",6,2,4], ["pedone","buio",2,6,0]],
      b: [["re",null,0,3,7], ["cavallo","elettro",7,4,2]],
      items: {"w":["paralisi"],"b":[]} },
  ];
  const byId = (id) => LIST.find((p) => p.id === id) || null;
  const goalText = (p) => (p.goal.type === 'mate' ? 'Dai scacco matto' : p.goal.type === 'kill' ? 'Sconfiggi il pezzo evidenziato' : 'Sconfiggi tutti i pezzi nemici') + ` in ${p.moves} ${p.moves === 1 ? 'mossa' : 'mosse'}`;
  return { LIST, byId, goalText };
});
