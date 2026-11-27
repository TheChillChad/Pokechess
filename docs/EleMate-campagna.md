# EleMate – Campagna: documento di riferimento

Questo documento raccoglie tutto ciò che è stato deciso per la modalità **Campagna** di EleMate: storia, personaggi, meccaniche, missioni e grafica. Serve come fonte di verità per chi lavora al progetto (anche in Claude Code). Le parti segnate **provvisorio** sono numeri o idee da provare a gioco fatto; le parti segnate **da valutare** non vanno implementate senza l'ok di Racutigno.

**Regole di lavoro:** le regole base di EleMate (scacchi con HP, 8 tipi, strumenti) non cambiano. Quello che si aggiunge vale solo in Campagna. Ogni cambio di regola si propone con pro e contro e si aspetta l'ok. Prima la storia, poi la grafica, il codice per ultimo.

## 1. Panoramica

Una modalità a storia in stile Pokémon, con tono leggero (avventura, amicizia, un po' di umorismo, cattivi non del tutto cattivi). Il giocatore è un giovane Re incolore che cattura e fa crescere i propri pezzi, gira un regno, affronta 8 Capipalestra (uno per tipo) e la Torre Prisma. Il percorso è guidato: la storia finisce uguale per tutti, ma squadra, strumenti e alcune scelte cambiano.

- Gli scontri usano il motore di EleMate già esistente, con bot a livelli 1-10.
- La campagna ha una **collezione di pezzi** persistente, a differenza delle altre modalità.
- Gli 8 tipi sono Fuoco, Acqua, Erba, Elettro, Ghiaccio, Psico, Buio, Folletto. Il Re è incolore, senza HP e senza tipo.
- Colori dei tipi: Fuoco #F08A4B, Acqua #4FA3E8, Erba #6DBF5B, Elettro #F3D03E, Ghiaccio #9ADCF2, Psico #C97FE3, Buio #5E6384, Folletto #F5A9CB.

## 2. Il mondo: Cromia

A Cromia **il colore è elemento**. Le creature nascono **grigie** (pedine, cavalli, alfieri, torri, regine) e vengono **risvegliate** da un Re, che le lega a un elemento. "Re" è il titolo di chi guida i pezzi, per chiunque, maschio o femmina.

La leggenda dice che il primo Re spezzò il **Prisma** in 8 **Gemme**, custodite dalle 8 Palestre. Chi le ottiene tutte può entrare nella **Torre Prisma**.

## 3. I personaggi

### Il giocatore

Giovane Re incolore, grigio. Sceglie **nome** (lo chiede il Professore) e **genere** (maschio o femmina, per i dialoghi). Esistono **due versioni grafiche**, una maschile e una femminile, con lo stesso cappotto e cappello grigi e un bottone chiaro che il gioco colora con le Gemme. Il Re sulla scacchiera ha un'aura che prende i colori delle Gemme vinte (solo estetica, fatta dal codice).

### Pedino

Pedina grigia parlante, ansiosa e fedelissima, compagna del giocatore. È un **pezzo vero**: il primo pedone della collezione. **Resta incolore per tutta la storia**: senza tipo non ha forze né debolezze. Evolve come gli altri, e le sue evoluzioni sono momenti della storia. Commenta le scene e le mosse importanti con brevi nuvolette. Opzione finale (facoltativa): un alone che cambia colore come il Re.

### Professor Arrocco

Anziano, svampito e gentile. Cerca gli occhiali che ha sulla fronte (la sua unica gag). Consegna le prime pedine e spiega il Risveglio. Ha un legame con il passato di Lord Stallo e sa più di quanto dica: gli ha scritto una frase su una scacchiera che non gli ha mai consegnato.

### Gambetto, il Rivale

Coetaneo del giocatore, sicuro di sé, battuta pronta, sotto è insicuro: ha paura di restare "uno qualunque". Giacca arancione, sciarpa lunga. Perde, ci rimane male, torna più forte. Compagno: **Torretta**, una torre grigia (si evolve in torre vera, ma resta sua, non usabile dal giocatore). Sceglie sempre i tipi **forti contro i tuoi**. Mossa firma **Gambetto**: parte con un pedone in meno e uno strumento in più.

**Cinque scontri:** (1) Villaggio Pedina, bot livello 2, tutorial, facile ma perdibile; (2) Strada del Ponte, livello 3-4; (3) inizio Atto II, livello 6; (4) inizio Atto III, livello 8; (5) base della Torre Prisma, sfida amichevole, poi resta fuori a trattenere i Grigi.

### Team Stallo

Cappotti grigi con il simbolo **=** (segno uguale). Motto: "Pari è meglio!". Vogliono un mondo dove nessuno vince e nessuno perde: spengono i colori e rubano le Gemme per una macchina nella Torre (il **Grande Pari**). Tono più burocratico che surreale.

- **I Grigi**: sgherri con pezzi senza tipo (grigi), bot livello 1-6. Formule: "È il regolamento.", "Il Team Stallo non perde. Pareggia." Dopo Città Velo sono meno convinti: "Pari è meglio... credo."
- **Patta**: luogotenente, elegante e fredda. Ex campionessa di tornei, sconfitta per un solo punto di danno dai tipi. Kit Scudo e Paralisi. Tre scontri: bot livello 5 (Atto II, furto della Gemma Scarica), livello 7 (prima di Città Velo), livello 9 (Torre). Perde sempre, alla fine ti lascia passare e parte per un viaggio.
- **Equo**: omone gentile, crede davvero nel Grande Pari ("È più giusto così.", sempre meno sicuro). Kit Cambio, Pozione, Scudo. Bot livello 6 al Villaggio Coltre e livello 8 nella Torre. Dopo la storia cucina nel ristorante di Chef Peperoncino.
- **Grigio n.7**: sgherro sfortunato e simpatico, cappello troppo grande. Compare a Strada del Ponte, Borgo Brace, Città Velo e Torre. Nell'epilogo apre un negozio (sconti per chi lo ha battuto).

### Lord Stallo (Magnus Remis), boss finale

Capo del Team Stallo, nome da giovane **Magnus Remis** (omaggio a Magnus Carlsen, solo il nome). Pacato, educato, stanco, non urla mai. Cappotto grigio lungo, guanti, spilla = in oro.

**Il twist:** era un **Re incolore**, deriso da giovane, allievo del Professor Arrocco. Perse il Torneo dei Nove Troni contro un Re dai colori forti e decise che il problema erano i colori. Non ha mai scoperto che l'incolore non è un vuoto ma lo spazio dove entrano tutti i colori. È lo specchio del giocatore.

**Scontro in due fasi, bot livello 10, kit Scudo, Paralisi, Revitalizzante:**

- **Fase 1, "Il Grande Pari"**: i tipi non contano (niente ×2 e ×0,5, per entrambi). I suoi pezzi sono grigi.
- **Fase 2, "I colori tornano"**: dopo aver sconfitto alcuni suoi pezzi, le Gemme brillano, la tabella dei tipi si riaccende e i suoi pezzi prendono i 8 colori. La scacchiera piccola del Professore si accende e mostra la scritta: *"Il vuoto non è mancanza: è lo spazio dove entrano tutti i colori. — A."*

**Dopo lo scontro:** Magnus capisce che il maestro l'aveva scritta per lui. Lascia la spilla al giocatore ("Per ricordarti cosa non diventare"). Il Prisma si ricompone nel Re del giocatore. Il Professore arriva e si siede accanto a lui, senza battute.

### Re Primordiale, boss segreto

Il primo Re era **incolore**: il Prisma sono i suoi resti, divisi in 8 colori. L'incolore non è un'anomalia, è l'origine. Non è un nemico ma un esaminatore: chiede "Chi sei?" (tre risposte, cambia solo la sua battuta). Squadra con tutti e 8 i tipi, 2 pezzi per tipo, bot livello 10, kit forte (Cristallo, Scudo, Bomba). Mossa firma **Prisma**: ogni volta che un suo pezzo attacca, cambia tipo con il successivo. Ricompensa: aura prismatica animata sul Re del giocatore e titolo "Re del Prisma".

## 4. I Capipalestra

Un boss per tipo, con **squadra fissa completa** (senza budget), un Re del colore del proprio tipo (solo estetico) e una **mossa firma**. I numeri sono **provvisori**.

1. **Camomilla (Erba)**, bot livello 3. Gentile e testarda, "tutto cresce, basta aspettare". Pezzi Erba e Folletto. Kit Pozione, Pozione, Scudo. Mossa firma **Radici**: i suoi pezzi fermi sulla casella di partenza hanno Corazza (−1 danno). Gemma Foglia. Città Germoglio.
2. **Nonno Flutto (Acqua)**, livello 4. Pescatore anziano e sereno, ogni frase diventa una storia di pesca, consigli quasi sempre giusti. Pezzi Acqua e Ghiaccio. Kit Scudo, Pozione, Revitalizzante. Mossa firma **Marea**: ogni 2 suoi turni il suo pezzo più ferito recupera 1 HP. Gemma Marea. Porto Flutto.
3. **Chef Peperoncino (Fuoco)**, livello 5. Urla, ride, cucina. Pezzi Fuoco e Buio. Kit Bomba, Cristallo, Pozione. Mossa firma **Fiamma che cresce**: ogni suo pezzo che sconfigge un tuo pezzo guadagna +1 attacco permanente (fino a +2). Gemma Brace. Borgo Brace (primo incontro con il Team Stallo: i Grigi hanno spento i suoi fornelli).
4. **Ing. Scintilla (Elettro)**, livello 6. Inventrice pasticciona, parla veloce e salta da un'idea all'altra. Pezzi Elettro e Ghiaccio. Kit Paralisi, Bomba, Bomba. Mossa firma **Scarica**: quando un suo pezzo cade, il pezzo che lo ha sconfitto resta paralizzato un turno. Gemma Scarica (rubata da Patta dopo la vittoria, recuperata nella Torre). Valle Scintilla.
5. **Barone Coltre (Ghiaccio)**, livello 7. Dorme sempre, ama il suo villaggio fermo; il Team l'aveva scambiato per un alleato. Pezzi Ghiaccio e Psico. Kit Scudo, Paralisi, Pozione. Mossa firma **Gelo perenne**: i suoi pezzi nella sua metà di scacchiera hanno Corazza (−1 danno). Gemma Cristallo. Villaggio Coltre.
6. **Madama Nebbia (Psico)**, livello 7. Indovina teatrale che parla per enigmi, sbaglia le previsioni banali ma su di te ha sempre ragione. Pezzi Psico e Folletto. Kit Metamorfosi, Metamorfosi, Cambio. Mossa firma **Illusione**: una volta per scontro cambia il tipo di un suo pezzo senza perdere il turno. Gemma Velo. Città Velo. Dopo lo scontro rivela che il tuo Re è "senza confini" e mostra la foto del Professore con Magnus giovane.
7. **Marchese Ombra (Buio)**, livello 8. Ladro elegante e ironico, poche parole. Accusato dei furti del Team, in realtà lo insegue. Pezzi Buio e Psico. Kit Cambio, Cambio, Paralisi. Mossa firma **Furto**: ogni volta che un suo pezzo sconfigge uno dei tuoi, ti ruba uno strumento del kit (massimo 2 per partita). Gemma Ombra. Città Lanterna. Dopo lo scontro è tuo alleato e ti restituisce la Gemma Scarica nella Torre.
8. **Birba (Folletto)**, livello 9. Bambina di dieci anni, dispettosa e sveglia, la più giovane e la più forte. Dietro gli scherzi c'è un'idea seria: i colori servono a stare insieme. Pezzi Folletto ed Elettro. Kit Cambio, Cambio, Bomba. Mossa firma **Giravolta**: ogni 5 suoi turni scambia di posto due suoi pezzi gratis. Gemma Stella. Villaggio Girandola.

## 5. La storia, atto per atto

### Prologo: Villaggio Pedina

1. **Casa**: sei solo con Pedino, tutti gli altri ragazzi hanno già pezzi risvegliati.
2. **Piazza**: ti chiamano "Re Incolore"; Gambetto li zittisce per orgoglio e ti dà appuntamento al laboratorio.
3. **Laboratorio**: il Professore chiede nome e genere, spiega il Risveglio, consegna **8 pedoni grigi** (con Pedino). Scegli il tipo del primo pezzo risvegliato tra **Erba, Fuoco e Acqua**; Gambetto sceglie dopo di te il tipo che lo batte.
4. **Primo scontro** contro Gambetto (livello 2, facile ma perdibile) con guida a schermo che riprende il Tutorial.
5. **Il Professore** racconta la leggenda del Prisma. Pedino trova un bottone grigio con il segno = e il Professore lo guarda un attimo di troppo. Ti dà 3 Richiami e una mappa.
6. **Prato Verde**: prima cattura guidata (un pedone Erba) con il Richiamo.

### Atto I: Le terre verdi (3 Gemme)

Luoghi: Prato Verde (zona Erba), Ruscello Fresco (Acqua), Collina Brace (Fuoco, rari Folletto), Città Germoglio (Palestra di Camomilla), Strada del Ponte, Porto Flutto (Palestra di Flutto), Sentiero delle Braci, Borgo Brace (Palestra di Chef).

- Eventi con scelta: il pezzo ferito al Ruscello, il mercante dei Cimeli, i Grigi che chiedono un pedaggio al ponte.
- Missione secondaria: Il cavallo smarrito.
- Gambetto (scontro 2) sul ponte. Nonno Flutto dà un vero consiglio sui tipi.
- A Borgo Brace compare Patta, che osserva. Un Grigio grida "Lord Stallo non sarà contento!".
- Fine atto: Pedino evolve (cavallo o alfiere, a scelta, resta incolore).

### Atto II: Le terre alte (5 Gemme dopo il furto)

Luoghi: Valle Scintilla, Cime Bianche, Villaggio Coltre, Boschetto Nebbioso, Città Velo.

- Gambetto (scontro 3): ha visto i Grigi portare via cose da un laboratorio.
- Nella Valle ripari il quadro elettrico (mini-puzzle) prima della Palestra. Dopo la vittoria **Patta ruba la Gemma Scarica**. Scintilla migliorerà il Richiamo.
- Evento a Cime Bianche: un pezzo Ghiaccio intrappolato, liberarlo con calma o proseguire.
- Villaggio Coltre: Equo prova a convincere il Barone ad aiutare il Team.
- Patta, secondo scontro. Città Velo: la foto del Professore con il giovane Re incolore.
- **Primo incontro con Lord Stallo** su una collina, senza battaglia: "Un altro Re incolore. Ti consiglio di fermarti."

### Atto III: Le terre d'ombra (8 Gemme)

Luoghi: Sentiero del Crepuscolo (zona Buio), Città Lanterna, Prateria Stellata (zona Folletto), Villaggio Girandola, Torre Prisma.

- Gambetto (scontro 4): ha scoperto il piano delle 8 Gemme.
- Città Lanterna: manifesti di ricercato, trovi il Marchese Ombra, alleanza e ingresso segreto alla Torre.
- Prateria Stellata: gli scherzi di Birba (nasconde i Richiami, lascia bigliettini).
- Villaggio Girandola: indovinelli sui tipi, poi lo scontro. Birba lascia un indizio sul primo Re (da decidere se tenerlo).
- Gambetto (scontro 5) alla base della Torre. Il Professore ti dà la scacchiera piccola e spenta.
- **Torre Prisma, tre piani:** (1) tre scontri rapidi contro i Grigi, il Marchese ti restituisce la Gemma Scarica; (2) Equo, livello 8; (3) Patta, livello 9; in cima, **Lord Stallo**.

### Finale ed epilogo

Il Prisma si ricompone nel Re del giocatore. Epilogo al Villaggio Pedina con tutti i personaggi: Equo con Chef Peperoncino, Patta in viaggio, Grigio n.7 con il suo negozio, Gambetto che ti sfiderà ogni anno. Ultima scena: una porta chiusa in cima alla Torre.

### Post-gioco: il boss segreto

La porta ha 8 incavi: servono **8 Schegge del Prisma**, una per tipo, ottenute con missioni legate ai Capipalestra (sezione 7). Aperta la porta, scontro con il Re Primordiale.

## 6. Meccaniche della campagna

### Collezione e risveglio

- Hai **solo i pezzi che hai catturato o risvegliato**. Conoscere un tipo non regala pezzi.
- Si inizia con 8 pedoni grigi (Pedino incolore, 1 pezzo risvegliato con il tipo scelto, 6 grigi).
- Un pezzo grigio si **risveglia** al Centro Cura scegliendo un tipo che **conosci**, pagando qualche moneta; è definitivo. Un tipo si conosce catturando un pezzo di quel tipo (o sconfiggendo la Palestra).
- Un pezzo grigio senza tipo è giocabile: non ha forze né debolezze.
- Ogni pezzo ha nome (scelto dal giocatore o dal gioco), tipo, ruolo, livello e un Cimelio facoltativo.

### Cattura

- Negli **incontri selvatici** giochi una mini-partita contro 1-3 pezzi di un solo tipo (quello della zona).
- Lo strumento **Richiamo** (scorta separata dal kit, costa un turno) cattura un pezzo avversario se i suoi HP sono sotto la metà. **Deterministico**, senza fortuna, e non uccide mai.
- Se il pezzo selvatico muore, l'incontro si ripete **gratis**. Le zone selvatiche sono rivisitabili.
- Rarità: pedoni comuni, cavalli e alfieri meno, torri rare. **La regina non si cattura**: si ottiene solo evolvendo.

### Squadra e budget (provvisorio)

- Prima di ogni scontro scegli la squadra dalla collezione. I pezzi occupano le caselle di partenza del loro ruolo; con meno pezzi restano caselle vuote.
- **Budget di squadra** come freno alle evoluzioni: pedone 1, cavallo 2, alfiere 3, torre 4, regina 7. Si parte con circa 20 e ogni Gemma dà +2. Puoi schierare meno di 15 pezzi.
- Limiti per ruolo come negli scacchi (1 regina, 2 torri, e così via). **Nessun limite di 2 pezzi per tipo** in campagna; il bonus **Arcobaleno** (+2 al budget) vale se nessun tipo supera i 2 pezzi.
- Gli **alfieri** devono essere di colori di casella diversi. Il **cavallo costa 2** (contro 3 dell'alfiere) per non scegliere sempre l'alfiere.
- I boss non hanno budget: squadra fissa completa, quindi il giocatore è spesso in inferiorità numerica. Si compensa con livelli, Cimeli, strumenti e bot bassi nei primi boss.

### Livelli ed evoluzione

- I pezzi guadagnano XP quando sconfiggono avversari; a fine scontro anche i pezzi in panchina ne ricevono un po'.
- **Livelli 1-5**: +1 HP per livello (fino a +3), con un bonus di tipo all'ultimo livello. **L'attacco cresce solo con l'evoluzione.**
- Evoluzione fuori dalla partita: pedone → **cavallo o alfiere** (a scelta, con livello sufficiente) → **torre** (1 Pietra Evolutiva) → **regina** (1 Pietra in più, una sola regina per squadra). Il tipo resta quello del pezzo.

### Cimeli (oggetti tenuti)

1 Cimelio per pezzo, passivo e permanente, bonus piccoli: Amuleto (+1 HP), Lente (+1 attacco al primo colpo di ogni partita), Mantello del tipo (−1 danno dai tipi a cui il pezzo è debole), Sciarpa (resiste alla prima Paralisi), Medaglia della Palestra (effetto a tema, una per tipo). Slot limitati all'inizio (3), se ne aggiungono con le Gemme.

### Come si gioca una partita

- Stesso motore di EleMate, vince lo scacco matto. **Niente draft**: i tipi sono quelli dei tuoi pezzi.
- Scegli un **kit di 3 strumenti** dall'inventario, con i limiti per tipo già presenti nel gioco.
- **Vinci:** XP, monete, Gemma, avanzamento. **Perdi:** riprovi lo scontro e la squadra torna com'era.
- I boss hanno ognuno la propria **mossa firma** (regola speciale solo in campagna; provvisorie, da regolare con i test).

### Cure e Centri Cura

- I pezzi non muoiono per sempre, ma un pezzo **KO resta KO** e gli HP persi restano finché non li curi. (Modalità Nuzlocke opzionale in futuro.)
- **Centro Cura**: uno per città, mai dentro la Palestra. Cura tutti gli HP e rianima tutti i KO, gratis. Serve anche per Risveglio, evoluzioni e craft.
- **Locande e fontane** lungo il percorso: riserva limitata di HP (circa 15), non rianimano.
- **Scorte** in negozio: Cure e Rianimazioni, separate dal kit.
- **Garanzia**: prima di ogni Palestra c'è sempre un Centro Cura; perdendo, la squadra torna com'era.
- **Da valutare:** prima del boss, due duelli contro i suoi scagnozzi; se vinci ti curano, se perdi sei rimandato fuori.

### Economia: Pietre, Frammenti, oggetti nascosti (provvisorio)

- Una squadra completa (2 torri e 1 regina) richiede circa **4 Pietre Evolutive**; avere tutte le torri e regine di ogni tipo (circa 32) è un obiettivo di fine gioco, non un obbligo.
- Fonti delle Pietre: circa 10 **fisse** (una per Palestra, una dal collezionista, alcune dalle missioni); **craft** (4 Frammenti di Pietra fanno una Pietra al Centro Cura); **negozio** (una per città, a prezzo alto, scorta che si rinnova dopo ogni Palestra).
- **Frammenti**: zone selvatiche (circa uno ogni 2-3 incontri), punti nascosti, missione del minatore, **la Cava** (scontri ripetibili dopo la missione).
- **Riposo** (opzionale): riporta un pezzo allo stadio precedente e restituisce 2 Frammenti.
- **Punti nascosti**: 1-3 per luogo, raccolti una sola volta (strumenti, Richiami, Frammenti, Cimeli, monete). Gli strumenti più forti (Revitalizzante, Paralisi, Scudo) solo qui. Il **Sensore** di Scintilla li fa brillare; un diario mostra quanti ne hai trovati per luogo.

### Mappa e presentazione

- **Fase B (iniziale):** mappa a nodi con scene illustrate. Ogni luogo è uno sfondo con personaggi e punti da toccare; tra i luoghi, il personaggio cammina sulla mappa. Tipi di nodo: incontro selvatico, allenatore, evento con scelta, Centro Cura, negozio, Palestra.
- **Fase C (futura):** mappa esplorabile stile Pokémon. Si può aggiungere senza rifare la storia se luoghi, dialoghi, eventi e progressi restano dati separati dalla grafica. Per questo il protagonista va disegnato anche con la camminata in 4 direzioni.
- Il percorso ha qualche bivio che poi si ricongiunge.

## 7. Missioni secondarie

Ognuna si completa una sola volta, in ordine libero.

1. **Il cavallo smarrito** (Atto I, Germoglio): ricompensa un Cimelio e un cavallo catturabile gratis.
2. **La staffetta dei pacchi** (Atto I-II): tre consegne in ordine; monete e un Cimelio.
3. **Il torneo monotipo di Porto Flutto** (Atto I): tre duelli con un solo tipo; un Cimelio e un titolo.
4. **Le pagine dell'archivio** (Atto II): tre pagine del diario del Professore; Richiami e lore su Magnus giovane.
5. **Il collezionista** (Atto II-III): tre pezzi precisi; una Pietra Evolutiva.
6. **Il Grigio pentito** (Atto II-III): accompagni Grigio n.7 al confine; sconto permanente nel suo negozio.
7. **Il minatore** (Atto I, Collina Brace): riapre la Cava; Frammenti.

Idee per dopo: una missione con i puzzle (il guardiano del faro), una di Birba, una legata a Pedino.

### Le 8 Schegge del Prisma (per sbloccare il boss segreto)

Una per tipo, 3-4 passaggi ciascuna, meccaniche diverse.

1. **Erba, Camomilla, "Il giardino spento"**: acqua pulita al Ruscello, un pezzo Erba di livello 5, il giardino rifiorisce.
2. **Acqua, Nonno Flutto, "Il pesce grosso"**: canna ed esca, scegliere dove pescare, cattura di un raro pezzo Acqua con la Scheggia dentro.
3. **Fuoco, Chef Peperoncino, "La ricetta perduta"**: tre ingredienti nelle zone dell'Atto I, ordine di cottura, la Scheggia nel vecchio forno.
4. **Elettro, Ing. Scintilla, "Il segnale"**: un secondo quadro più difficile, seguire il segnale in tre luoghi; ricevi anche il Sensore.
5. **Ghiaccio, Barone Coltre, "Il sonno profondo"**: sfida con limite di 20 mosse per svegliarlo, la Scheggia è sotto il cuscino.
6. **Psico, Madama Nebbia, "Le tre visioni"**: tre puzzle (matto in 2) che indicano un luogo.
7. **Buio, Marchese Ombra, "Il colpo del secolo"**: scelta del ruolo e tre scelte con costi, breve scontro con le guardie.
8. **Folletto, Birba, "La caccia al tesoro"**: indizi in versi, tre indizi nei luoghi già visti, indovinello finale sui tipi.

## 8. Tono e dialoghi

Regole: una sola abitudine per personaggio, nessuna esclamazione vuota, nessuna battuta senza senso, niente parole inglesi, i boss reagiscono a ciò che fai. Frasi brevi, dirette, con la personalità evidente. Segnaposto per il genere ({nome}, forme maschili e femminili) e frasi neutre dove possibile.

Esempi (versioni riviste):

- **Camomilla:** "Benvenuto, {nome}. Qui le cose crescono con calma, e nelle partite è lo stesso. Vediamo come giochi."
- **Nonno Flutto:** "L'acqua spegne il fuoco, ma l'erba la beve. Ricordatelo."
- **Chef Peperoncino:** "Hanno spento i miei fornelli. Aiutami a riaccenderli e ti do la Gemma."
- **Barone Coltre:** "Un Re incolore alla mia porta? ...Va bene. Per questo mi sveglio."
- **Madama Nebbia:** "Il tuo Re non è senza colore. È senza confini."
- **Marchese Ombra:** "Anche tu mi cerchi per i furti? No, hai un'altra faccia. Ma battimi, o non mi fido."
- **Birba:** "I colori servono a stare insieme, non a stare contro."
- **Lord Stallo:** "Nessun vantaggio, nessuno svantaggio. Così nessuno perde per ciò che è."
- **Re Primordiale:** "Sei arrivato senza nessun colore tuo. Dimmi: chi sei?"

I testi completi di tutti i dialoghi stanno nella scheda "Storia completa" del documento di lavoro.

## 9. Grafica

- **Stile:** pixel art retro (GBA / Pokémon dei primi anni), poi si provano un paio di personaggi cartoon e si decide. Realistico scartato.
- **Strumenti:** Pixel Lab (sprite pixel veri, 8 direzioni; vista Low Top-Down, **48 × 48** per tutti i personaggi, stesso livello di dettaglio e contorno sempre) e Makko AI (ritratti ed eventuali sfondi, con lo sprite di Pixel Lab come riferimento). Gemini per concept gratuiti da usare come riferimento. Controllare i termini d'uso prima di pubblicare.
- **Palette:** limitata e la stessa per tutto; protagonista e Pedino in grigio; ogni boss con il colore del proprio tipo come tinta dominante.
- **Re sulla scacchiera:** Re del giocatore grigio con aura che prende i colori delle Gemme (animata dal codice); un Re per ogni Capopalestra nel suo colore; Re di Lord Stallo grigio con = dorato; Re Primordiale prismatico.
- **Stato:** primo modello del protagonista maschile generato (troppo da detective, da ringiovanire); versione femminile da generare.
- **Ordine di lavoro:** (1) protagonista (due versioni) e Pedino; (2) Professor Arrocco e Gambetto, per avere il prologo; (3) un Capopalestra di prova (Camomilla); (4) gli altri, un atto alla volta; poi ambienti, oggetti e interfaccia, animazioni.
- **Elenco completo dei concept** (18 personaggi, ambienti per atto, oggetti, animazioni) nella scheda "Grafica" del documento di lavoro.

## 10. Decisioni aperte

- Numeri provvisori: budget iniziale, bonus Arcobaleno, soglia del Richiamo, prezzo e quantità delle Pietre, numeri delle mosse firma.
- Nomi: alcuni potrebbero cambiare.
- Il gancio di Birba sul primo Re: tenerlo o no.
- Duelli prima del boss (curano o rimandano fuori): da valutare.
- Scontro di Lord Stallo in due fasi: versione semplice (una sola) se la fase 2 è troppo complessa da programmare.
- Fase C (mappa esplorabile) e modalità Nuzlocke: possibili sviluppi futuri.
- Le mosse firma, il budget e le altre regole nuove vanno provate a gioco fatto con gli amici.
