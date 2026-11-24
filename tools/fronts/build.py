#!/usr/bin/env python3
"""The kit the houses of the map are dressed from: build.py   (run in tools/fronts; needs numpy and pillow)

Reads fronts.json and the pictures it names, and writes
  ../../models/fronts.jpg   every front and every stuff in one picture
  ../../js/kit.js           where in that picture each lies, and its measures: what js/fronts.js builds from

A front is a picture of a house taken straight on, measured: its wall to the street (which stretches of it are
plain and may be laid as long as need be, which are a gate or a window and keep their size), the face of the house
over the wall (the pieces of the picture that are house and not sky), a plain piece of its wall to cover what no
picture shows, and its windows, to be lit by night. See README.md.
"""
import json

import numpy as np
from PIL import Image, ImageFilter, ImageOps

SIZE = 2048
GUTTER = 8
spec = json.load(open('fronts.json'))
atlas = Image.new('RGB', (SIZE, SIZE), (198, 176, 148))
kit = {'size': [SIZE, SIZE], 'fronts': [], 'stuff': {}}
shelves = [[0, 0], [1024, 0]]  # two columns: where the next piece goes in each


def edited(picture, edits):
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


def placed(piece):
    """Paste a piece into the shorter column, its edges drawn out into the gutter round it (so that nothing from
    beside it shows along its edges, however small it is drawn); returns where its own corner lies."""
    column = min(shelves, key=lambda shelf: shelf[1])
    x, y = column[0] + GUTTER, column[1] + GUTTER
    if piece.width + 2 * GUTTER > 1024 or y + piece.height + GUTTER > SIZE:
        raise SystemExit('no room in the picture for a piece of %d by %d' % piece.size)
    grown = np.pad(np.asarray(piece), ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode='edge')
    atlas.paste(Image.fromarray(grown), (x - GUTTER, y - GUTTER))
    column[1] = y + piece.height + GUTTER
    return x, y


for front in spec['fronts']:
    image = edited(front['picture'], front.get('edits'))
    crop, scale = front['crop'], front['scale']
    piece = image.crop(tuple(crop))
    piece = piece.resize((round(piece.width * scale), round(piece.height * scale)), Image.LANCZOS)
    x0, y0 = placed(piece)
    at = lambda u, v: [round(x0 + (u - crop[0]) * scale, 2), round(y0 + (v - crop[1]) * scale, 2)]
    box = lambda b: [*at(b[0], b[1]), *at(b[2], b[3])]
    wall, house = front['wall'], front['house']
    rows = wall['rows']
    plain = np.asarray(image.crop(tuple(house['plain']))).reshape(-1, 3).mean(axis=0) / 255
    kit['fronts'].append({
        'name': front['name'],
        'tone': [round(float(v), 3) for v in plain],
        'wall': {
            'height': wall['height'],
            'perMetre': round((rows[1] - rows[0]) / wall['height'] * scale, 3),
            'v': [at(0, rows[0])[1], at(0, rows[1])[1]],
            'pieces': [[at(u0, 0)[0], at(u1, 0)[0], kind] for u0, u1, kind in wall['pieces']],
            'lamps': [box(b) for b in wall.get('lamps', [])],
        },
        'house': {
            'perMetre': round(house['perMetre'] * scale, 3),
            'rects': [box(b) for b in house['rects']],
            'plain': box(house['plain']),
            'plainPerMetre': round(house.get('plainPerMetre', house['perMetre']) * scale / house.get('plainScale', 1), 3),
            'panes': [box(b) for b in house.get('panes', [])],
        },
    })

for name, stuff in spec['stuff'].items():
    image = edited(stuff['picture'], stuff.get('edits'))
    piece = image.crop(tuple(stuff['box'])).resize((128, 128), Image.LANCZOS)
    if 'gain' in stuff:
        piece = Image.fromarray(np.clip(np.asarray(piece).astype(np.float32) * stuff['gain'], 0, 255).astype(np.uint8))
    if 'calm' in stuff:
        # A stuff that is laid over a whole roof: its stains would be laid out as large as the roof. They are
        # smoothed away, and its colour taken part of the way to grey: a roof's floor is paler than its walls.
        soft = np.asarray(piece.filter(ImageFilter.GaussianBlur(18))).astype(np.float32)
        grey = soft.mean(axis=2, keepdims=True)
        soft = soft + (grey - soft) * stuff['calm']
        piece = Image.fromarray(np.clip(soft * (stuff.get('light', 200) / soft.mean()), 0, 255).astype(np.uint8))
    x0, y0 = placed(piece)
    kit['stuff'][name] = [x0 + 3, y0 + 3, x0 + 125, y0 + 125]

atlas.save('../../models/fronts.jpg', quality=86)
with open('../../js/kit.js', 'w') as out:
    out.write('// The kit the houses of the map are dressed from: where in models/fronts.jpg each front and each stuff\n')
    out.write('// lies, and its measures. Written by tools/fronts/build.py out of tools/fronts/fronts.json: not by hand.\n')
    out.write('// (Places are in spots of that picture, across then down; see js/fronts.js for what is made of them.)\n\n')
    out.write('export const KIT = ' + json.dumps(kit, indent=1) + ';\n')
print('fronts:', [f['name'] for f in kit['fronts']], '| columns filled to', [s[1] for s in shelves])
