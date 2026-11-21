# Musica di sottofondo di EleMate

Carica qui i file audio (formato **.mp3**, consigliato anche una copia **.ogg**). Nomi esatti:

| File               | Quando suona                                   |
|--------------------|------------------------------------------------|
| `menu.mp3`         | Home, menu, Avventure, Scalata (tra gli scontri) |
| `battaglia.mp3`    | Durante una partita (anche puzzle, bot, online)  |
| `campagna.mp3`     | Modalità Campagna (quando ci sarà)              |

Regole utili:
- Tracce fatte per andare in **loop** senza stacco (inizio e fine che si raccordano).
- Peso consigliato: sotto 2–3 MB a traccia (mp3 128 kbps, 2–3 minuti).
- Se un file manca il gioco funziona lo stesso, semplicemente in silenzio.

Per aggiungere una traccia nuova: metti il file qui e aggiungi una riga in `TRACKS`
dentro `public/music.js`, poi assegnala a una schermata in `sceneFor()`.
Il pulsante Musica è in ⚙️ Impostazioni e la scelta resta salvata (`sm_music`).
