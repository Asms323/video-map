#!/usr/bin/env python3
"""A front's measures drawn over its picture, to check them by eye: check.py <name> <out.jpg>   (run in tools/fronts)

The wall's strip between its two rows, each piece in its colour (plain: green, one that keeps its size: red, one
that may be left out: orange), its lamps white, what stands over its top yellow; the face of the house in light blue, its windows blue (those never
lit: violet), its lamps white; its plain piece pink. What a box does not cover is not drawn in the app; what it
covers that is sky is drawn as house.
"""
import json
import sys

from PIL import Image, ImageDraw, ImageOps


def edited(picture, edits):
    """The picture as build.py takes it: with its edits made."""
    image = Image.open('pictures/' + picture).convert('RGB')
    for edit in edits or []:
        box = edit.get('copy') or edit.get('stretch')
        piece = image.crop(tuple(box))
        if edit.get('mirror'):
            piece = ImageOps.mirror(piece)
        to = edit['to']
        if 'stretch' in edit:
            piece = piece.resize((to[2] - to[0], to[3] - to[1]), Image.LANCZOS)
        image.paste(piece, (to[0], to[1]))
    return image


name, out = sys.argv[1], sys.argv[2]
front = next(f for f in json.load(open('fronts.json'))['fronts'] if f['name'] == name)
image = edited(front['picture'], front.get('edits'))
draw = ImageDraw.Draw(image)
wall, house = front['wall'], front['house']
top, foot = wall['rows']
colours = {'plain': (0, 220, 0), 'fixed': (255, 0, 0), 'optional': (255, 150, 0)}
for u0, u1, kind in wall['pieces']:
    draw.rectangle([u0, top, u1 - 1, foot - 1], outline=colours[kind], width=2)
for over in wall.get('over', []):
    b = over['box']
    draw.rectangle([b[0], b[1], b[2] - 1, b[3] - 1], outline=(255, 230, 0), width=2)
for b in wall.get('lamps', []) + house.get('lamps', []):
    draw.rectangle([b[0], b[1], b[2] - 1, b[3] - 1], outline=(255, 255, 255), width=1)
for b in house['rects']:
    # (One that stands out before the wall: drawn the thicker the further it stands out.)
    draw.rectangle([b[0], b[1], b[2] - 1, b[3] - 1], outline=(0, 230, 255), width=1 + round(2 * (b[4] if len(b) > 4 else 0)))
for b in house.get('panes', []):
    draw.rectangle([b[0], b[1], b[2] - 1, b[3] - 1], outline=(40, 80, 255), width=2)
for b in house.get('dark', []):
    draw.rectangle([b[0], b[1], b[2] - 1, b[3] - 1], outline=(170, 60, 255), width=2)
b = house['plain']
draw.rectangle([b[0], b[1], b[2] - 1, b[3] - 1], outline=(255, 90, 200), width=2)
image.save(out, quality=90)
metres = (foot - top) / wall['height']
print('%s: wall %.1f spots to the metre, pieces %s m; face %.1f m by %.1f m' % (
    name, metres, [round((u1 - u0) / metres, 2) for u0, u1, _ in wall['pieces']],
    (max(r[2] for r in house['rects']) - min(r[0] for r in house['rects'])) / house['perMetre'],
    (max(r[3] for r in house['rects']) - min(r[1] for r in house['rects'])) / house['perMetre']))
