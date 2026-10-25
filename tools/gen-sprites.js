// Genera gli sprite SVG in public/sprites/mostri/
// Un file per ogni combinazione ruolo_tipo (es. pedone_fuoco.svg), più:
//   <ruolo>_neutro.svg (pezzo non ancora assegnato), re.svg, tipo_<tipo>.svg (icona del tipo).
// Per cambiare grafica: crea un'altra cartella in public/sprites/ con gli stessi nomi di file
// e punta a lei in public/config.js (oppure apri il gioco con ?sprites=nomecartella).
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'sprites', 'mostri');
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
const NEUTRAL = { body: '#C9CDD6', dark: '#4F5566', motif: '#F5C542' };
const UNASSIGNED = { body: '#B8BCC8', dark: '#5B6070', motif: '#B8BCC8' };

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

// sagome dei ruoli (viewBox 100x100). Classi: b corpo, d scuro, g oro, o contorno, s tratto scuro
const ROLES = {
  pedone: `<ellipse cx="50" cy="90" rx="28" ry="6" class="d"/>
<path class="b o" d="M28 88 Q26 64 50 58 Q74 64 72 88 Z"/>
<path class="b o" d="M34 30 L31 12 L46 22 Z"/>
<path class="b o" d="M66 30 L69 12 L54 22 Z"/>
<circle class="b o" cx="50" cy="40" r="20"/>`,
  cavallo: `<ellipse cx="50" cy="90" rx="28" ry="6" class="d"/>
<path class="b o" d="M26 88 Q24 56 40 40 L38 18 L50 28 Q70 24 80 42 L84 56 Q76 60 68 54 Q64 62 60 68 Q70 78 74 88 Z"/>
<path class="b o" d="M54 28 L60 14 L65 31 Z"/>
<path class="d" d="M38 20 Q30 40 30 60 Q36 56 40 50 Q40 40 46 30 Z"/>`,
  alfiere: `<ellipse cx="50" cy="90" rx="28" ry="6" class="d"/>
<path class="b o" d="M30 88 Q28 64 42 58 L58 58 Q72 64 70 88 Z"/>
<path class="b o" d="M50 14 Q70 28 66 46 Q64 58 50 58 Q36 58 34 46 Q30 28 50 14 Z"/>
<circle class="m o" cx="50" cy="11" r="5"/>
<path class="s" d="M56 22 L47 33" fill="none" stroke-width="3" stroke-linecap="round"/>
<ellipse class="d" cx="50" cy="58" rx="15" ry="4"/>`,
  torre: `<ellipse cx="50" cy="90" rx="28" ry="6" class="d"/>
<path class="b o" d="M26 88 L30 48 L26 46 L26 20 L38 20 L38 30 L45 30 L45 20 L55 20 L55 30 L62 30 L62 20 L74 20 L74 46 L70 48 L74 88 Z"/>
<path class="s" d="M27 46 H73" fill="none" stroke-width="3"/>
<path class="d" d="M45 88 L45 80 Q50 74 55 80 L55 88 Z"/>`,
  regina: `<ellipse cx="50" cy="90" rx="30" ry="6" class="d"/>
<path class="b o" d="M24 88 Q28 58 40 50 L60 50 Q72 58 76 88 Z"/>
<circle class="b o" cx="50" cy="38" r="15"/>
<path class="g o" d="M34 28 L35 8 L43 20 L50 6 L57 20 L65 8 L66 28 Z"/>`,
  re: `<ellipse cx="50" cy="90" rx="30" ry="6" class="d"/>
<path class="b o" d="M22 88 Q26 58 38 50 L62 50 Q74 58 78 88 Z"/>
<circle class="b o" cx="50" cy="40" r="16"/>
<path class="s" d="M50 14 V2 M45 7 H55" fill="none" stroke-width="7" stroke-linecap="round"/>
<path d="M50 14 V2 M45 7 H55" fill="none" stroke="#F5C542" stroke-width="3.5" stroke-linecap="round"/>
<path class="g o" d="M33 30 L35 14 L43 22 L50 14 L57 22 L65 14 L67 30 Z"/>`,
};

// dove va il simbolo sul corpo: [x, y, dimensione]
const PLACE = {
  pedone: [39, 64, 22], cavallo: [34, 62, 22], alfiere: [39, 64, 22], torre: [39, 52, 22], regina: [38, 58, 24],
};

function wrap(inner, c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<style>.b{fill:${c.body}}.d{fill:${c.dark}}.m{fill:${c.motif}}.g{fill:#F5C542}.o{stroke:${c.dark};stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.s{stroke:${c.dark}}</style>
${inner}
</svg>
`;
}
function write(name, content) {
  fs.writeFileSync(path.join(OUT, name + '.svg'), content);
}

let count = 0;
for (const [type, c] of Object.entries(TYPES)) {
  for (const role of Object.keys(PLACE)) {
    const [x, y, s] = PLACE[role];
    const sym = `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 24 24">${SYMBOLS[c.symbol](c)}</svg>`;
    write(`${role}_${type}`, wrap(ROLES[role] + sym, c));
    count++;
  }
  // icona del tipo (per pulsanti e legenda)
  const icon = `<circle cx="50" cy="50" r="46" fill="${c.body}" stroke="${c.dark}" stroke-width="4"/>
<svg x="24" y="24" width="52" height="52" viewBox="0 0 24 24">${SYMBOLS[c.symbol](c)}</svg>`;
  write(`tipo_${type}`, wrap(icon, c));
  count++;
}
for (const role of Object.keys(PLACE)) {
  write(`${role}_neutro`, wrap(ROLES[role], UNASSIGNED));
  count++;
}
write('re', wrap(ROLES.re, NEUTRAL));
count++;

console.log(`Creati ${count} sprite in ${OUT}`);
