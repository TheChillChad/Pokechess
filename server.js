// Server: file statici + stanze online con Socket.io
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const G = require('./game.js');
const Bot = require('./bot.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Non trovato'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const io = new Server(httpServer);

const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}
const validToken = (t) => typeof t === 'string' && t.length >= 8 && t.length <= 80;
const REACTIONS = ['👍', '😮', '😂', '🔥', '😅', 'GG'];
const cleanName = (n) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f<>&"'`\\]/g, '').trim().slice(0, 14) : '');
const validCode = (c) => typeof c === 'string' && /^[A-Z0-9]{5}$/.test(c);

// vista per gli spettatori: Blu in basso, nessuna mossa possibile, strumenti visibili solo a partita iniziata
function spectatorState(room) {
  const st = G.publicState(room, 'w');
  st.you = null; st.spectator = true; st.legal = {}; st.pending = null;
  if (room.game.phase !== 'play' && room.game.phase !== 'over') st.items = { w: [], b: [] };
  return st;
}
function sendSpectators(room) {
  if (!room.spectators || !room.spectators.size) return;
  const st = spectatorState(room);
  for (const sid of room.spectators) io.to(sid).emit('state', st);
}

function broadcast(room) {
  room.touched = Date.now();
  if (room.local) {
    // un solo dispositivo: la vista segue chi deve giocare
    const pl = room.players.w;
    if (pl && pl.sid) io.to(pl.sid).emit('state', G.publicState(room, G.actingColor(room.game)));
    return;
  }
  for (const color of ['w', 'b']) {
    const pl = room.players[color];
    if (pl && pl.sid) io.to(pl.sid).emit('state', G.publicState(room, color));
  }
  sendSpectators(room);
  scheduleBot(room);
}

// ---------- bot ----------
// room.bot = { color, level }: il bot occupa un posto (players[color].bot = true) e gioca con un po' di ritardo
function scheduleBot(room) {
  if (!room.bot || room.botTimer) return;
  const g = room.game;
  if (!Bot.needsAction(g, room.bot.color)) return;
  const delay = g.phase === 'play' ? 900 + Math.random() * 700 : 450 + Math.random() * 300;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!rooms.has(room.code) || !room.bot) return;
    try {
      const err = Bot.act(room.game, room.bot.color, room.bot.level);
      if (err) console.error('Bot:', err);
    } catch (e) { console.error(e); }
    broadcast(room);
  }, delay);
}

function seat(room, socket, color, token, name) {
  const old = room.players[color];
  room.players[color] = { token, sid: socket.id, name: name || (old && old.name) || '' };
  socket.data.code = room.code;
  socket.data.color = color;
  socket.data.spectator = false;
}

io.on('connection', (socket) => {
  socket.on('create', (data, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    if (!data || !validToken(data.token)) return cb({ error: 'Richiesta non valida' });
    const room = { code: newCode(), game: G.newGame(), players: { w: null, b: null }, touched: Date.now() };
    rooms.set(room.code, room);
    seat(room, socket, Math.random() < 0.5 ? 'w' : 'b', data.token, cleanName(data.name));
    cb({ ok: true, code: room.code });
    broadcast(room);
  });

  // partita contro il computer: il bot prende il posto dell'avversario e il draft parte subito
  socket.on('createBot', (data, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    if (!data || !validToken(data.token)) return cb({ error: 'Richiesta non valida' });
    const level = ['easy', 'normal', 'hard', 'master'].includes(data.level) ? data.level : 'normal';
    const room = { code: newCode(), game: G.newGame(), players: { w: null, b: null }, touched: Date.now() };
    rooms.set(room.code, room);
    const mine = Math.random() < 0.5 ? 'w' : 'b';
    seat(room, socket, mine, data.token, cleanName(data.name));
    const bc = G.other(mine);
    room.players[bc] = { token: '__bot__', sid: null, bot: true };
    room.bot = { color: bc, level };
    room.game.phase = 'draft';
    room.game.log.push(`Partita contro il computer (${{ easy: 'facile', normal: 'normale', hard: 'difficile', master: 'maestro' }[level]}). Draft dei tipi: il Blu comincia.`);
    cb({ ok: true, code: room.code });
    broadcast(room);
  });

  // partita in due sullo stesso dispositivo: la vista passa da un giocatore all'altro
  socket.on('createLocal', (data, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    if (!data || !validToken(data.token)) return cb({ error: 'Richiesta non valida' });
    const room = { code: newCode(), game: G.newGame(), players: { w: null, b: null }, touched: Date.now(), local: true };
    rooms.set(room.code, room);
    seat(room, socket, 'w', data.token, cleanName(data.name));
    room.players.b = { token: data.token, sid: null, local: true };
    room.game.phase = 'draft';
    room.game.log.push('Partita in locale: passatevi il dispositivo. Draft dei tipi: il Blu comincia.');
    cb({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('join', (data, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    if (!data || !validToken(data.token) || !validCode(data.code)) return cb({ error: 'Codice non valido' });
    const room = rooms.get(data.code);
    if (!room) return cb({ error: 'Stanza non trovata' });
    let color = ['w', 'b'].find((c) => room.players[c] && room.players[c].token === data.token);
    if (color) {
      const old = room.players[color].sid;
      if (old && old !== socket.id) { const s = io.sockets.sockets.get(old); if (s) { s.data.code = null; s.data.color = null; } }
      seat(room, socket, color, data.token, cleanName(data.name));
    } else {
      color = ['w', 'b'].find((c) => !room.players[c]);
      if (!color) {
        // stanza piena: si entra come spettatore (non nelle partite in locale)
        if (room.local) return cb({ error: 'La stanza è piena' });
        if (!room.spectators) room.spectators = new Set();
        if (room.spectators.size >= 20 && !room.spectators.has(socket.id)) return cb({ error: 'Troppi spettatori in questa stanza' });
        room.spectators.add(socket.id);
        socket.data.name = cleanName(data.name);
        socket.data.code = room.code; socket.data.color = null; socket.data.spectator = true;
        cb({ ok: true, code: room.code, spectator: true });
        return broadcast(room);
      }
      seat(room, socket, color, data.token, cleanName(data.name));
      if (room.players.w && room.players.b && room.game.phase === 'lobby') {
        room.game.phase = 'draft';
        room.game.log.push('Entrambi in stanza. Draft dei tipi: scegliete a turno, il Blu comincia.');
      }
    }
    cb({ ok: true, code: room.code });
    broadcast(room);
  });

  // esegue un'azione di gioco sulla stanza del socket
  function act(fn) {
    const room = rooms.get(socket.data.code);
    let color = socket.data.color;
    if (socket.data.spectator) return socket.emit('errore', 'Stai guardando: non puoi giocare');
    if (room && room.local && color) color = G.actingColor(room.game);
    if (!room || !color) return socket.emit('errore', 'Non sei in una stanza');
    let err;
    // contro il bot e in locale si salva la posizione prima di ogni azione, per poterla annullare
    const snap = (room.bot || room.local) && room.game.phase === 'play' ? structuredClone(room.game) : null;
    try { err = fn(room.game, color, room); } catch (e) { console.error(e); err = 'Errore interno'; }
    if (err) socket.emit('errore', err);
    else {
      room.drawOffer = null;
      if (snap) { (room.snaps = room.snaps || []).push(snap); if (room.snaps.length > 60) room.snaps.shift(); }
    }
    broadcast(room);
  }

  socket.on('draft', (d) => d && act((g, c) => G.draftPick(g, c, d.id, d.type)));
  socket.on('items', (d) => d && act((g, c) => G.setItems(g, c, d.list)));
  socket.on('move', (d) => d && act((g, c) => G.move(g, c, d.id, d.r, d.c)));
  socket.on('item', (d) => d && act((g, c) => G.useItem(g, c, d)));
  socket.on('promote', (d) => d && act((g, c) => G.choosePromotion(g, c, d.role)));
  socket.on('resign', () => act((g, c) => G.resign(g, c)));
  socket.on('rematch', () => act((g, c, room) => {
    if (g.phase !== 'over') return 'La partita non è finita';
    room.game = G.newGame();
    room.snaps = []; room.drawOffer = null;
    room.game.phase = 'draft';
    // scambia i colori: chi era Rosso ora muove per primo
    if (!room.local) {
    const { w, b } = room.players;
    room.players.w = b; room.players.b = w;
    if (room.bot) room.bot.color = G.other(room.bot.color);
    for (const col of ['w', 'b']) {
      const pl = room.players[col];
      const s = pl && pl.sid ? io.sockets.sockets.get(pl.sid) : null;
      if (s) s.data.color = col;
    }
    }
    room.game.log.push(room.local ? 'Nuova partita! Draft dei tipi: comincia il Blu.' : 'Nuova partita! Colori scambiati. Draft dei tipi: comincia il Blu.');
    return null;
  }));

  // esce dalla stanza e torna alla home (se la partita online è in corso conta come resa)
  const everyone = (room) => [...['w', 'b'].map((c) => room.players[c] && room.players[c].sid), ...(room.spectators || [])].filter(Boolean);
  socket.on('react', (d) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.local || room.bot || !d || !REACTIONS.includes(d.e)) return;
    const now = Date.now();
    if (now - (socket.data.lastReact || 0) < 800) return;
    socket.data.lastReact = now;
    const from = socket.data.spectator ? 's' : socket.data.color;
    const name = socket.data.spectator ? socket.data.name : (room.players[from] && room.players[from].name) || '';
    for (const sid of everyone(room)) io.to(sid).emit('reaction', { from, name, e: d.e });
  });

  // patta concordata (solo online)
  socket.on('draw', () => {
    const room = rooms.get(socket.data.code); const color = socket.data.color;
    if (!room || !color || socket.data.spectator || room.local) return;
    if (room.bot) return socket.emit('errore', 'Il bot non accetta la patta');
    if (room.game.phase !== 'play' || room.drawOffer) return;
    room.drawOffer = color; broadcast(room);
  });
  socket.on('drawReply', (d) => {
    const room = rooms.get(socket.data.code); const color = socket.data.color;
    if (!room || !color || socket.data.spectator || !room.drawOffer || room.drawOffer === color || room.game.phase !== 'play') return;
    const offerer = room.players[room.drawOffer];
    room.drawOffer = null;
    if (d && d.accept) {
      const g = room.game;
      g.phase = 'over'; g.winner = null; g.reason = 'Patta concordata';
      g.log.push('Patta concordata.');
    } else if (offerer && offerer.sid) io.to(offerer.sid).emit('errore', 'La patta è stata rifiutata');
    broadcast(room);
  });

  // annulla l'ultima azione (solo contro il bot o in locale)
  socket.on('undo', () => {
    const room = rooms.get(socket.data.code);
    if (!room || socket.data.spectator || !(room.bot || room.local)) return;
    const snap = room.snaps && room.snaps.pop();
    if (!snap) return socket.emit('errore', 'Niente da annullare');
    clearTimeout(room.botTimer); room.botTimer = null;
    room.game = snap;
    room.game.log.push('Mossa annullata.');
    broadcast(room);
  });

  function dropSpectator() {
    const room = rooms.get(socket.data.code);
    if (room && room.spectators) { room.spectators.delete(socket.id); broadcast(room); }
    socket.data.code = null; socket.data.spectator = false;
  }
  socket.on('leave', () => {
    if (socket.data.spectator) return dropSpectator();
    const room = rooms.get(socket.data.code);
    const color = socket.data.color;
    socket.data.code = null; socket.data.color = null;
    if (!room || !color) return;
    if (room.bot || room.local) { clearTimeout(room.botTimer); rooms.delete(room.code); return; }
    if (room.game.phase === 'play') G.resign(room.game, color);
    room.players[color] = null;
    const other = room.players[G.other(color)];
    if (!other || !other.sid) rooms.delete(room.code); else broadcast(room);
  });

  socket.on('disconnect', () => {
    if (socket.data.spectator) return dropSpectator();
    const room = rooms.get(socket.data.code);
    const color = socket.data.color;
    if (!room || !color) return;
    const pl = room.players[color];
    if (pl && pl.sid === socket.id) { pl.sid = null; broadcast(room); }
  });
});

// pulizia stanze inattive da più di 6 ore
setInterval(() => {
  const limit = Date.now() - 6 * 3600 * 1000;
  for (const [code, room] of rooms) if (room.touched < limit) rooms.delete(code);
}, 10 * 60 * 1000).unref();

httpServer.listen(PORT, () => console.log(`EleMate in ascolto su http://localhost:${PORT}`));
