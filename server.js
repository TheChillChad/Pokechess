// Server: file statici + stanze online con Socket.io
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const G = require('./game.js');

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
const validCode = (c) => typeof c === 'string' && /^[A-Z0-9]{5}$/.test(c);

function broadcast(room) {
  room.touched = Date.now();
  for (const color of ['w', 'b']) {
    const pl = room.players[color];
    if (pl && pl.sid) io.to(pl.sid).emit('state', G.publicState(room, color));
  }
}

function seat(room, socket, color, token) {
  room.players[color] = { token, sid: socket.id };
  socket.data.code = room.code;
  socket.data.color = color;
}

io.on('connection', (socket) => {
  socket.on('create', (data, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    if (!data || !validToken(data.token)) return cb({ error: 'Richiesta non valida' });
    const room = { code: newCode(), game: G.newGame(), players: { w: null, b: null }, touched: Date.now() };
    rooms.set(room.code, room);
    seat(room, socket, Math.random() < 0.5 ? 'w' : 'b', data.token);
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
      seat(room, socket, color, data.token);
    } else {
      color = ['w', 'b'].find((c) => !room.players[c]);
      if (!color) return cb({ error: 'La stanza è piena' });
      seat(room, socket, color, data.token);
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
    const color = socket.data.color;
    if (!room || !color) return socket.emit('errore', 'Non sei in una stanza');
    let err;
    try { err = fn(room.game, color, room); } catch (e) { console.error(e); err = 'Errore interno'; }
    if (err) socket.emit('errore', err);
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
    room.game.phase = 'draft';
    // scambia i colori: chi era Rosso ora muove per primo
    const { w, b } = room.players;
    room.players.w = b; room.players.b = w;
    for (const col of ['w', 'b']) {
      const pl = room.players[col];
      const s = pl && pl.sid ? io.sockets.sockets.get(pl.sid) : null;
      if (s) s.data.color = col;
    }
    room.game.log.push('Nuova partita! Colori scambiati. Draft dei tipi: comincia il Blu.');
    return null;
  }));

  socket.on('disconnect', () => {
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

httpServer.listen(PORT, () => console.log(`Scacchi Mostri in ascolto su http://localhost:${PORT}`));
