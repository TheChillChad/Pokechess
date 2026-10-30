# Logo "d'impatto" su fondo scuro, 4 varianti -> public/logos/logo-{a,b,c,d}.svg
#  a: Re stile Lichess + simboli nei cerchi   b: Re stile Lichess + simboli colorati senza cerchi
#  c: Re intero + simboli nei cerchi          d: Re intero + simboli colorati senza cerchi
import math, re, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

root = os.path.join(os.path.dirname(__file__), '..')
out = os.path.join(root, 'public', 'logos'); os.makedirs(out, exist_ok=True)
font = TTFont('/usr/share/fonts/opentype/inter/Inter-Black.otf')
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
def width(s, size, tr=0): return sum(gs[cmap[ord(c)]].width for c in s) * size / upm + tr * (len(s) - 1)
def text(s, size, x0, yb, fill, tr=0):
    sc = size / upm; x = x0; o = []
    for ch in s:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (sc, 0, 0, -sc, x, yb))); d = pen.getCommands()
        if d: o.append(f'<path d="{d}" fill="{fill}"/>')
        x += gs[g].width * sc + tr
    return ''.join(o)

COL = {  # body, dark (come nel gioco)
 'fuoco': '#F08A4B', 'elettro': '#F3D03E', 'erba': '#6DBF5B', 'acqua': '#4FA3E8',
 'ghiaccio': '#9ADCF2', 'psico': '#C97FE3', 'buio': '#5E6384', 'folletto': '#F5A9CB'}
ORDER = ['fuoco', 'elettro', 'erba', 'acqua', 'ghiaccio', 'psico', 'buio', 'folletto']
# 'buio' sul fondo scuro: nei simboli senza cerchio uso una tinta più chiara per leggersi, stesso colore di famiglia
MOTIF = {'fuoco': '#FFD35C', 'elettro': '#FFF8C2', 'erba': '#D8F58A', 'acqua': '#CFEFFF', 'ghiaccio': '#FFFFFF', 'psico': '#FFE6FA', 'buio': '#F4DA6E', 'folletto': '#FFF3A6'}
NOCIRCLE = dict(COL, buio='#8E94BF')

def tipo_inner(t):
    s = open(os.path.join(root, f'public/sprites/classico/tipo_{t}.svg')).read().strip()
    return re.sub(r'^<svg[^>]*>|</svg>\s*$', '', s)
def symbol_only(t):
    # il simbolo (svg annidato 24x24) ricolorato col colore del tipo, con bordo chiaro
    inner = tipo_inner(t)
    m = re.search(r'<svg x="24"[^>]*>(.*)</svg>', inner, re.S)
    body = m.group(1)
    body = body.replace(f'fill="{MOTIF[t]}"', f'fill="{NOCIRCLE[t]}"')
    body = re.sub(r'stroke="#[0-9A-Fa-f]{6}"', 'stroke="#FFF8E7"', body)
    body = body.replace('stroke-width="1.6"', 'stroke-width="1.5"').replace('stroke-width="1.2"', 'stroke-width="1.1"')
    return body  # coordinate 24x24

def king_lichess():
    k = open(os.path.join(root, 'tools/classic-src/wK.svg')).read().strip()
    k = re.sub(r'^<svg[^>]*>|</svg>\s*$', '', k).replace('fill="#fff"', 'fill="url(#gold)"').replace('stroke="#000"', 'stroke="#2A1D05"')
    return k, 45  # lato

def king_full():
    # Re intero, sagoma staunton disegnata a mano (viewBox 100x140)
    st = 'stroke="#2A1D05" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"'
    f = 'fill="url(#gold)"'
    parts = [
      f'<rect x="46.5" y="1" width="7" height="26" rx="2.5" {f} {st}/>',
      f'<rect x="38" y="8" width="24" height="7" rx="2.5" {f} {st}/>',
      f'<path d="M27 66 L20 36 L38 49 L50 30 L62 49 L80 36 L73 66 Z" {f} {st}/>',
      f'<circle cx="20" cy="33" r="4.2" {f} {st}/><circle cx="80" cy="33" r="4.2" {f} {st}/>',
      f'<rect x="25" y="65" width="50" height="9" rx="4" {f} {st}/>',
      f'<path d="M33 74 Q31 98 22 116 L78 116 Q69 98 67 74 Z" {f} {st}/>',
      f'<path d="M36 90 Q50 95 64 90" fill="none" {st}/>',
      f'<rect x="14" y="115" width="72" height="12" rx="5" {f} {st}/>',
      f'<rect x="8" y="126" width="84" height="11" rx="5" {f} {st}/>',
    ]
    return ''.join(parts), 100, 138  # w, h

W, H = 800, 960
cx, cy = 400, 400
DEFS = ('<defs>'
  '<radialGradient id="bg" cx="50%" cy="42%" r="65%"><stop offset="0" stop-color="#454B7A"/><stop offset=".6" stop-color="#252844"/><stop offset="1" stop-color="#14162A"/></radialGradient>'
  '<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0B3"/><stop offset=".55" stop-color="#F5C54E"/><stop offset="1" stop-color="#D9952A"/></linearGradient>'
  '<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE9A0" stop-opacity=".55"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/></radialGradient>'
  '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>'
  '<filter id="drop" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".45"/></filter>'
  '</defs>')

def build(kind, circles, transparent=False):
    p = [DEFS] + ([] if transparent else [f'<rect width="{W}" height="{H}" rx="70" fill="#14162A"/>'])
    if not transparent:
        p.append(f'<circle cx="{cx}" cy="{cy}" r="385" fill="url(#bg)"/>')
        p.append(f'<circle cx="{cx}" cy="{cy}" r="385" fill="none" stroke="#FFF8E7" stroke-opacity=".18" stroke-width="3"/>')
        p.append(f'<circle cx="{cx}" cy="{cy}" r="268" fill="none" stroke="#FFF8E7" stroke-opacity=".12" stroke-width="2" stroke-dasharray="3 12" stroke-linecap="round"/>')
    R = 268
    for i, t in enumerate(ORDER):
        a = -math.pi / 2 + i * math.pi / 4
        x, y = cx + R * math.cos(a), cy + R * math.sin(a)
        if circles:
            s = 1.5
            if not transparent: p.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="62" fill="{COL[t]}" opacity=".55" filter="url(#glow)"/>')
            p.append(f'<g filter="url(#drop)" transform="translate({x - 50 * s:.1f},{y - 50 * s:.1f}) scale({s})">{tipo_inner(t)}</g>')
        else:
            s = 4.6  # simbolo 24x24 -> ~110 px
            if not transparent: p.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="50" fill="{NOCIRCLE[t]}" opacity=".45" filter="url(#glow)"/>')
            p.append(f'<g filter="url(#drop)" transform="translate({x - 12 * s:.1f},{y - 12 * s:.1f}) scale({s})">{symbol_only(t)}</g>')
    # alone dietro al Re
    if not transparent:
        p.append(f'<circle cx="{cx}" cy="{cy}" r="190" fill="url(#halo)"/>')
    if kind == 'lichess':
        k, side = king_lichess(); sc = 7.2
        p.append(f'<g filter="url(#drop)" transform="translate({cx - side * sc / 2:.1f},{cy - side * sc / 2 + 6:.1f}) scale({sc})">{k}</g>')
    else:
        k, kw, kh = king_full(); sc = 2.35
        p.append(f'<g filter="url(#drop)" transform="translate({cx - kw * sc / 2:.1f},{cy - kh * sc / 2:.1f}) scale({sc})">{k}</g>')
    # scritta EleMate: "Ele" in chiaro (scuro nella versione trasparente), "Mate" in verde
    size = 150; w1 = width('Ele', size, 1); w2 = width('Mate', size, 1)
    x0 = (W - w1 - w2) / 2
    c1 = '#FFF8E7'
    c2 = '#5FD39B'
    t1 = text('Ele', size, x0, 910, c1, 1); t2 = text('Mate', size, x0 + w1, 910, c2, 1)
    if transparent:  # contorno scuro: si legge su qualsiasi sfondo
        halo = lambda t: t.replace('/>', ' stroke="#1F2236" stroke-width="12" stroke-linejoin="round"/>')
        p.append(halo(t1) + halo(t2))
    p.append(t1 + t2)
    svgs = ''.join(p)
    if transparent: svgs = svgs.replace(' filter="url(#drop)"', '').replace('stroke="#FFF8E7"', 'stroke="#1F2236"')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><title>EleMate</title>' + svgs + '</svg>'

for name, kind, circ in [('a', 'lichess', True), ('b', 'lichess', False), ('c', 'full', True), ('d', 'full', False)]:
    open(os.path.join(out, f'logo-{name}.svg'), 'w').write(build(kind, circ))
    open(os.path.join(out, f'logo-{name}-trasparente.svg'), 'w').write(build(kind, circ, True))
print('ok')
