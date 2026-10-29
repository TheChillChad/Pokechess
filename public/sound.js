// Effetti sonori sintetizzati con Web Audio (nessun file audio da scaricare).
// API: Sfx.play('nome'), Sfx.setMuted(bool), Sfx.isMuted(). Per cambiare i suoni basta modificare SOUNDS.
window.Sfx = (function () {
  let ctx = null, master = null, muted = false, noiseBuf = null;
  try { muted = localStorage.getItem('sm_muted') === '1'; } catch (e) { /* ignora */ }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  // sui telefoni l'audio parte solo dopo un tocco: sblocca al primo gesto
  const unlock = () => { ensure(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  // nota: oscillatore con inviluppo e (opzionale) glissando
  function tone(t0, { f = 440, f2 = null, dur = 0.15, type = 'sine', vol = 0.3, attack = 0.005 }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // rumore filtrato: urti, scintille
  function noise(t0, { dur = 0.1, vol = 0.3, freq = 1500, q = 1, type = 'lowpass', f2 = null }) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(freq, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }
  const arp = (t, notes, step, o) => notes.forEach((f, i) => tone(t + i * step, Object.assign({ f }, o)));

  const SOUNDS = {
    // pezzo che si sposta: tocco di legno
    move: (t) => { tone(t, { f: 220, f2: 110, dur: 0.09, type: 'triangle', vol: 0.35 }); noise(t, { dur: 0.04, vol: 0.18, freq: 2500 }); },
    castle: (t) => { SOUNDS.move(t); SOUNDS.move(t + 0.13); },
    // attacchi
    hit: (t) => { noise(t, { dur: 0.14, vol: 0.45, freq: 1800, f2: 300 }); tone(t, { f: 160, f2: 60, dur: 0.16, type: 'square', vol: 0.18 }); },
    super: (t) => { SOUNDS.hit(t); arp(t + 0.07, [523, 659, 988], 0.07, { dur: 0.14, type: 'square', vol: 0.12 }); },
    weak: (t) => { noise(t, { dur: 0.1, vol: 0.2, freq: 700, f2: 200 }); tone(t, { f: 140, f2: 90, dur: 0.14, type: 'triangle', vol: 0.2 }); },
    kill: (t) => { SOUNDS.hit(t); tone(t + 0.08, { f: 420, f2: 70, dur: 0.4, type: 'sawtooth', vol: 0.14 }); },
    block: (t) => { tone(t, { f: 1250, dur: 0.25, type: 'triangle', vol: 0.25 }); tone(t, { f: 1880, dur: 0.18, type: 'sine', vol: 0.15 }); noise(t, { dur: 0.05, vol: 0.2, freq: 5000, type: 'highpass' }); },
    // strumenti
    heal: (t) => arp(t, [523, 659, 784, 1047], 0.08, { dur: 0.25, type: 'sine', vol: 0.2 }),
    buff: (t) => { arp(t, [660, 880, 1320], 0.06, { dur: 0.2, type: 'triangle', vol: 0.16 }); noise(t, { dur: 0.3, vol: 0.06, freq: 3000, f2: 8000, type: 'highpass' }); },
    bomb: (t) => { noise(t, { dur: 0.5, vol: 0.6, freq: 900, f2: 60 }); tone(t, { f: 120, f2: 35, dur: 0.5, type: 'sine', vol: 0.5 }); },
    // avvisi
    check: (t) => { tone(t, { f: 880, dur: 0.14, type: 'square', vol: 0.15 }); tone(t + 0.15, { f: 660, dur: 0.22, type: 'square', vol: 0.15 }); },
    pick: (t) => { tone(t, { f: 700, f2: 1000, dur: 0.08, type: 'sine', vol: 0.22 }); },
    turn: (t) => { tone(t, { f: 784, dur: 0.12, type: 'sine', vol: 0.14 }); tone(t + 0.09, { f: 1047, dur: 0.2, type: 'sine', vol: 0.12 }); },
    start: (t) => arp(t, [392, 523, 659, 784], 0.1, { dur: 0.3, type: 'triangle', vol: 0.2 }),
    promote: (t) => arp(t, [523, 659, 784, 1047, 1319], 0.07, { dur: 0.3, type: 'triangle', vol: 0.2 }),
    win: (t) => { arp(t, [523, 659, 784, 1047], 0.13, { dur: 0.4, type: 'triangle', vol: 0.25 }); tone(t + 0.55, { f: 1319, dur: 0.7, type: 'triangle', vol: 0.22 }); },
    lose: (t) => arp(t, [392, 349, 294, 220], 0.2, { dur: 0.45, type: 'sawtooth', vol: 0.12 }),
    draw: (t) => arp(t, [440, 440], 0.2, { dur: 0.35, type: 'triangle', vol: 0.18 }),
  };

  function play(name, delay) {
    if (muted || !SOUNDS[name]) return;
    const c = ensure();
    if (!c || c.state === 'suspended') return;
    try { SOUNDS[name](c.currentTime + 0.01 + (delay || 0)); } catch (e) { /* ignora */ }
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('sm_muted', muted ? '1' : '0'); } catch (e) { /* ignora */ }
    if (!muted) play('pick');
  }
  return { play, setMuted, isMuted: () => muted };
})();
