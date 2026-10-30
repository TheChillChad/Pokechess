# Genera public/logo.svg: il Re al centro, gli 8 simboli dei tipi attorno (stessi colori e simboli del gioco)
# e la scritta "EleMate" convertita in tracciati (non servono font). Uso: python3 tools/gen-logo.py
import math, re, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

root = os.path.join(os.path.dirname(__file__), '..')
font = TTFont('/usr/share/fonts/opentype/inter/Inter-Black.otf')
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm

def text_path(s, size, x0, y_base, fill, track=0):
    scale = size / upm; x = x0; out = []
    for ch in s:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, x, y_base)))
        d = pen.getCommands()
        if d: out.append(f'<path d="{d}" fill="{fill}"/>')
        x += gs[g].width * scale + track
    return ''.join(out), x - x0 - track

def width(s, size, track=0):
    return sum(gs[cmap[ord(c)]].width for c in s) * size / upm + track * (len(s) - 1)

TYPES = ['fuoco', 'elettro', 'erba', 'acqua', 'ghiaccio', 'psico', 'buio', 'folletto']  # giro in senso orario dall'alto
W, H = 700, 820
cx, cy, R = 350, 330, 245

def icon(t):
    svg = open(os.path.join(root, 'public/sprites/classico/tipo_%s.svg' % t)).read()
    return re.sub(r'^<svg[^>]*>|</svg>\s*$', '', svg.strip())

parts = []
# fascia dietro l'anello
parts.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="#E4D9B8" stroke-width="10"/>')
parts.append(f'<circle cx="{cx}" cy="{cy}" r="170" fill="#FBF4DA" stroke="#1F2236" stroke-width="6"/>')
for i, t in enumerate(TYPES):
    a = -math.pi / 2 + i * 2 * math.pi / 8
    x, y = cx + R * math.cos(a), cy + R * math.sin(a)
    s = 1.35
    parts.append(f'<g transform="translate({x - 50 * s:.1f},{y - 50 * s:.1f}) scale({s})">{icon(t)}</g>')
# Re (Cburnett, CC BY-SA 3.0) al centro
king = open(os.path.join(root, 'tools/classic-src/wK.svg')).read()
king = re.sub(r'^<svg[^>]*>|</svg>\s*$', '', king.strip()).replace('fill="#fff"', 'fill="#FBF4DA"')
ks = 7.0
parts.append(f'<g transform="translate({cx - 22.5 * ks:.1f},{cy - 22.5 * ks + 8:.1f}) scale({ks})">{king}</g>')
# scritta
size = 130
w1 = width('Ele', size); w2 = width('Mate', size)
x0 = (W - (w1 + w2)) / 2
p1, _ = text_path('Ele', size, x0, 735, '#1F2236')
p2, _ = text_path('Mate', size, x0 + w1, 735, '#2E7D5B')
parts.append(p1 + p2)

svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><title>EleMate</title>' + ''.join(parts) + '</svg>'
open(os.path.join(root, 'public/logo.svg'), 'w').write(svg)
print('logo.svg', len(svg), 'byte; scritta larga', round(w1 + w2))

# icona quadrata (senza scritta) per la scheda del browser
icon_svg = svg.replace(f'viewBox="0 0 {W} {H}" width="{W}" height="{H}"', 'viewBox="50 30 600 600" width="256" height="256"')
open(os.path.join(root, 'public/favicon.svg'), 'w').write(icon_svg)
