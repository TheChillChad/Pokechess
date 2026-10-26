# Scacchi Mostri

Scacchi con HP, tipi e strumenti, da giocare online in due (stanza con codice o link).

## Avvio

```bash
npm install
npm start          # http://localhost:3000
```

Uno clicca **Crea stanza** e manda il link (o il codice di 5 lettere) all'amico. Se si ricarica la pagina si rientra da soli nella stessa stanza.

Per giocare con amici lontani il server deve essere raggiungibile da internet: vedi "Mettere online" qui sotto.

## Regole in breve

- Si muove come negli scacchi (senza arrocco né presa al varco: al loro posto ci sono gli strumenti).
- **Catturare = attaccare**: il bersaglio perde HP pari all'attacco del pezzo, moltiplicato per il tipo (×2 / ×0,5). Se sopravvive, l'attaccante resta fermo. Se muore, l'attaccante occupa la casella.
- HP / attacco: Pedone 4/2, Cavallo 7/4, Alfiere 7/4, Torre 10/5, Regina 12/7.
- **Re**: incolore, senza HP, fa sempre ×2 (6 danni). Non si può colpire: valgono scacco e scacco matto come negli scacchi. Se il Re è minacciato devi spostarlo, pararti o eliminare chi lo minaccia (un attacco che non uccide non basta). Gli strumenti si possono usare sotto scacco solo se lo risolvono (Cambio, Revitalizzante). Senza mosse e senza scacco è patta (stallo).
- **Draft dei tipi**: i 30 pezzi (15 a testa, senza Re) ricevono un tipo a serpentina: Blu, Rosso, Rosso, Blu, Blu, Rosso… L'ultima scelta è del Rosso, che muove per secondo. Ogni tipo si usa al massimo 2 volte a testa.
- **Strumenti** (3 a testa, anche doppioni, ognuno si usa una volta): Pozione (+5 HP), Revitalizzante (riporta in campo un pezzo sconfitto), **Scudo** (azione gratuita: un pezzo ignora il prossimo attacco, poi muovi un altro pezzo; quello protetto non muove in quel turno), Cristallo (prossimo attacco ×1,5), Cambio (scambia due tuoi pezzi), **Paralisi** (un pezzo avversario salta il suo prossimo turno e non dà scacco), **Metamorfosi** (cambia il tipo di un tuo pezzo), **Bomba** (3 danni fissi a un pezzo avversario), Pietra Evolutiva (passiva: alla promozione scegli il pezzo; senza Pietra il pedone diventa Cavallo). Tutti costano il turno tranne lo Scudo.
- Dopo la partita c'è la rivincita, con i colori scambiati.

## Dove si cambiano le cose

| Cosa | File |
|---|---|
| Tipi, tabella forze/resistenze, HP e attacco, strumenti | `public/shared.js` |
| Regole di gioco (movimento, danni, strumenti, promozione) | `game.js` |
| Stanze e rete | `server.js` |
| Interfaccia | `public/index.html`, `style.css`, `client.js` |
| Grafica dei pezzi | `public/sprites/` |

Dopo aver toccato le regole: `npm test` (32 test sulla logica).

## Cambiare gli sprite

Ogni pezzo è un file con nome fisso: `<ruolo>_<tipo>.svg` (es. `pedone_fuoco.svg`), più `<ruolo>_neutro.svg` (pezzo senza tipo ancora), `re.svg` e `tipo_<tipo>.svg` (icone dei tipi). Ruoli: pedone, cavallo, alfiere, torre, regina. Tipi: fuoco, acqua, erba, elettro, ghiaccio, psico, buio, folletto.

1. Copia `public/sprites/mostri/` in `public/sprites/nuovo/` e sostituisci i file (SVG, quadrati, meglio con la base in basso).
2. Per provarlo apri il gioco con `?sprites=nuovo`.
3. Per renderlo definitivo cambia il valore predefinito in `public/config.js`.

I formati diversi da SVG richiedono di cambiare l'estensione in `client.js` (funzione `sprite`). Gli sprite attuali sono creature originali generate da `npm run sprites` (`tools/gen-sprites.js`).

> Se userai personaggi Pokémon o disegni di altri come sprite, vale per loro il diritto d'autore: va bene per giocare tra amici, non per pubblicare o vendere il gioco.

## Mettere online

Serve un hosting che esegua Node.js e supporti WebSocket (Render, Railway, Fly.io…). Su Render, ad esempio: nuovo "Web Service" dal repository, build `npm install`, start `npm start`. La variabile `PORT` viene letta in automatico. Le partite vivono in memoria: se il server si riavvia o va in stop (piano gratuito), le stanze aperte si perdono.
