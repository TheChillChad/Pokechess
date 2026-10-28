// Genera il set "classico" in public/sprites/classico/: i pezzi di scacchi tradizionali (Cburnett)
// ricolorati col colore del tipo, con in basso a destra il simbolo del tipo.
// Sorgenti in tools/classic-src (Colin M. L. Burnett, CC BY-SA 3.0 — vedi public/sprites/classico/LICENSE.txt).
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'classic-src');
const OUT = path.join(__dirname, '..', 'public', 'sprites', 'classico');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  fuoco:    { body: '#F08A4B', dark: '#8E3A17', motif: '#FFD35C', symbol: 'flame' },
  acqua:    { body: '#4FA3E8', dark: '#1B4F8A', motif: '#CFEFFF', symbol: 'drop' },
  erba:     { body: '#6DBF5B', dark: '#25672F', motif: '#D8F58A', symbol: 'leaf' },
  elettro:  { body: '#F3D03E', dark: '#7A5A00', motif: '#FFF8C2', symbol: 'bolt' },
  ghiaccio: { body: '#9ADCF2', dark: '#2C7A9E', motif: '#FFFFFF', symbol: 'crystal' },
  psico:    { body: '#C97FE3', dark: '#6B2F86', motif: '#FFE6FA', symbol: 'eye' },
  buio:     { body: '#5E6384', dark: '#1F2236', motif: '#F4DA6E', symbol: 'moon' },
  folletto: { body: '#F5A9CB', dark: '#A53A74', motif: '#FFF3A6', symbol: 'star' },
};
const NEUTRAL = { body: '#EDE3C0', dark: '#4F5566', motif: '#F5C542' };
const UNASSIGNED = { body: '#C9CDD6', dark: '#4F5566', motif: '#C9CDD6' };

// simboli dei tipi (viewBox 24x24)
const SYMBOLS = {
  flame:   (c) => `<path d="M12 2 C14 7 19 9 19 15 A7 7 0 0 1 5 15 C5 11 8 10 9 6 C10 8 11 8 12 2 Z" ${mo(c)}/>`,
  drop:    (c) => `<path d="M12 2 C16 8 19 11 19 15 A7 7 0 0 1 5 15 C5 11 8 8 12 2 Z" ${mo(c)}/>`,
  leaf:    (c) => `<path d="M4 20 C4 9 12 4 20 4 C20 13 15 20 4 20 Z" ${mo(c)}/><path d="M4 20 L14 10" fill="none" stroke="${c.dark}" stroke-width="1.6" stroke-linecap="round"/>`,
  bolt:    (c) => `<path d="M13 2 L5 14 H11 L9 22 L19 9 H13 Z" ${mo(c)}/>`,
  crystal: (c) => `<path d="M12 2 L19 12 L12 22 L5 12 Z" ${mo(c)}/><path d="M12 2 V22 M5 12 H19" fill="none" stroke="${c.dark}" stroke-width="1.2"/>`,
  eye:     (c) => `<path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z" ${mo(c)}/><circle cx="12" cy="12" r="3.2" fill="${c.dark}"/>`,
  moon:    (c) => `<path d="M16 3 A9 9 0 1 0 21 14 A7 7 0 1 1 16 3 Z" ${mo(c)}/>`,
  star:    (c) => `<path d="M12 2 L14.8 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.4 L5.8 21 L7.4 14 L2 9.3 L9.2 8.6 Z" ${mo(c)}/>`,
};
function mo(c) {
  return `fill="${c.motif}" stroke="${c.dark}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
}

const FILES = { pedone: 'wP', cavallo: 'wN', alfiere: 'wB', torre: 'wR', regina: 'wQ', re: 'wK' };

function piece(role, c, withBadge) {
  let svg = fs.readFileSync(path.join(SRC, FILES[role] + '.svg'), 'utf8');
  svg = svg.replace(/fill="#fff"/g, `fill="${c.body}"`);
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const badge = withBadge ? `<circle cx="36.5" cy="36.5" r="8.5" fill="${c.body}" stroke="${c.dark}" stroke-width="1.6"/>
<svg x="30.5" y="30.5" width="12" height="12" viewBox="0 0 24 24">${SYMBOLS[c.symbol](c)}</svg>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45">${inner}${badge}</svg>`;
}
const write = (name, content) => fs.writeFileSync(path.join(OUT, name + '.svg'), content);

let count = 0;
for (const [type, c] of Object.entries(TYPES)) {
  for (const role of ['pedone', 'cavallo', 'alfiere', 'torre', 'regina']) { write(`${role}_${type}`, piece(role, c, true)); count++; }
  write(`tipo_${type}`, `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${c.body}" stroke="${c.dark}" stroke-width="4"/>
<svg x="24" y="24" width="52" height="52" viewBox="0 0 24 24">${SYMBOLS[c.symbol](c)}</svg></svg>`);
  count++;
}
for (const role of ['pedone', 'cavallo', 'alfiere', 'torre', 'regina']) { write(`${role}_neutro`, piece(role, UNASSIGNED, false)); count++; }
write('re', piece('re', NEUTRAL, false));
count++;
console.log(`Creati ${count} sprite in ${OUT}`);
