#!/usr/bin/env python3
"""The kit the houses of the map are dressed from: build.py   (run in tools/fronts; needs numpy and pillow)

Reads fronts.json and the pictures it names, and writes
  ../../models/fronts.jpg   every front and every stuff in one picture
  ../../js/kit.js           where in that picture each lies, and its measures: what js/fronts.js builds from

A front is a picture of a house taken straight on, measured: its wall to the street (which stretches of it are
plain and may be laid as long as need be, which are a gate or a window and keep their size), the face of the house
over the wall (the pieces of the picture that are house and not sky), a plain piece of its wall to cover what no
picture shows, and its windows, to be lit by night. See README.md.

Of each front only what is used is kept: the strip of its wall, the box round the face of its house, and its
plain piece if that lies in neither. They are laid into the picture close together, each with its edges drawn
out into a gutter round it.
"""
import json

import numpy as np
from PIL import Image, ImageFilter, ImageOps

SIZE = (4096, 2048)  # across, down: both powers of two, so that the picture can be smoothed for the distance
GUTTER = 8
spec = json.load(open('fronts.json'))
pieces = []  # every piece to be laid into the picture; where each lies is found when all are known


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


def cut(image, box, scale=1.0):
    """A box of a picture as a piece to be laid, made smaller or larger by scale."""
    crop = image.crop(tuple(box))
    if scale != 1:
        crop = crop.resize((max(round(crop.width * scale), 1), max(round(crop.height * scale), 1)), Image.LANCZOS)
    pieces.append({'image': crop, 'box': box})
    return pieces[-1]


def evened(piece, reach):
    """A plain piece is laid again and again over a wall: a stain or a shadow on it would be seen again and again,
    in rows. Its broad lights and darks (broader than reach, in spots) are taken out; its grain, its joints and its
    colour are kept."""
    spots = np.asarray(piece).astype(np.float32)
    broad = np.asarray(piece.filter(ImageFilter.GaussianBlur(reach))).astype(np.float32)
    return Image.fromarray(np.clip(spots - broad + spots.reshape(-1, 3).mean(axis=0), 0, 255).astype(np.uint8))


def within(inner, outer):
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def around(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def lay(pieces):
    """Find every piece its place: the tallest first, each as high up in the picture as it can lie, and of such
    places the one furthest left (a skyline: how far down the picture is filled, from left to right)."""
    skyline = [[0, SIZE[0], 0]]  # stretches [from, until, filled down to]
    for piece in sorted(pieces, key=lambda p: (-p['image'].height, -p['image'].width)):
        wide, tall = piece['image'].width + 2 * GUTTER, piece['image'].height + 2 * GUTTER
        best = None
        for start in sorted({s[0] for s in skyline}):
            if start + wide > SIZE[0]:
                continue
            top = max(s[2] for s in skyline if s[0] < start + wide and s[1] > start)
            if top + tall <= SIZE[1] and (best is None or top < best[1]):
                best = (start, top)
        if best is None:
            raise SystemExit('no room in the picture for a piece of %d by %d' % piece['image'].size)
        x, y = best
        piece['at'] = (x + GUTTER, y + GUTTER)
        # The skyline with this piece on it.
        fresh = []
        for s in skyline:
            if s[1] <= x or s[0] >= x + wide:
                fresh.append(s)
                continue
            if s[0] < x:
                fresh.append([s[0], x, s[2]])
            if s[1] > x + wide:
                fresh.append([x + wide, s[1], s[2]])
        fresh.append([x, x + wide, y + tall])
        skyline = sorted(fresh)
    return max(s[2] for s in skyline)


def place(piece):
    """Where a place in the piece's own picture came to lie: a function of (across, down)."""
    box, image, (x0, y0) = piece['box'], piece['image'], piece['at']
    sx, sy = image.width / (box[2] - box[0]), image.height / (box[3] - box[1])
    return lambda u, v: [round(x0 + (u - box[0]) * sx, 2), round(y0 + (v - box[1]) * sy, 2)]


# What is needed of each front, as pieces.
fronts = []
for front in spec['fronts']:
    image = edited(front['picture'], front.get('edits'))
    scale = front.get('scale', 1)
    wall, house = front['wall'], front['house']
    rows = wall['rows']
    strip = [min(p[0] for p in wall['pieces']), rows[0], max(p[1] for p in wall['pieces']), rows[1]]
    face = around([b[:4] for b in house['rects']] + house.get('panes', []) + house.get('dark', []) + house.get('lamps', []))
    for lamp in wall.get('lamps', []):
        if not within(lamp, strip):
            raise SystemExit('%s: a lamp of the wall at %s is not on its wall' % (front['name'], lamp))
    kept = {'wall': cut(image, strip, scale), 'house': cut(image, face, scale)}
    # What stands over the wall's top with one of its pieces (a canopy of tiles over the gate, the tops of the
    # gate's piers, a garage's lintel): each a piece of its own.
    kept['over'] = [cut(image, over['box'], scale) for over in wall.get('over', [])]
    # Its plain piece: a piece of its own, evened (see evened; "even": false in fronts.json leaves it as it is, a
    # number is the reach in spots of the picture).
    plain = house['plain']
    even = house.get('even', 16)
    if even:
        kept['plain'] = cut(image, plain, scale)
        kept['plain']['image'] = evened(kept['plain']['image'], max(even * scale, 2))
    else:
        kept['plain'] = kept['house'] if within(plain, face) else kept['wall'] if within(plain, strip) else cut(image, plain, scale)
    tone = np.asarray(image.crop(tuple(plain))).reshape(-1, 3).mean(axis=0) / 255
    fronts.append((front, scale, kept, tone))

stuffs = []
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
    pieces.append({'image': piece, 'box': [0, 0, 128, 128]})
    stuffs.append((name, pieces[-1]))

filled = lay(pieces)

# The picture: each piece in its place, its edges drawn out into the gutter round it (so that nothing from
# beside it shows along its edges, however small it is drawn).
atlas = Image.new('RGB', SIZE, (198, 176, 148))
for piece in pieces:
    grown = np.pad(np.asarray(piece['image']), ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode='edge')
    atlas.paste(Image.fromarray(grown), (piece['at'][0] - GUTTER, piece['at'][1] - GUTTER))

kit = {'size': list(SIZE), 'fronts': [], 'stuff': {}}
for front, scale, kept, tone in fronts:
    wall, house = front['wall'], front['house']
    rows = wall['rows']
    on_wall, on_house, on_plain = place(kept['wall']), place(kept['house']), place(kept['plain'])
    box = lambda at, b: [*at(b[0], b[1]), *at(b[2], b[3])]
    kit['fronts'].append({
        'name': front['name'],
        'styles': front.get('styles', []),
        'rare': front.get('rare', 0),
        'tone': [round(float(v), 3) for v in tone],
        'wall': {
            'height': wall['height'],
            'perMetre': round((rows[1] - rows[0]) / wall['height'] * scale, 3),
            'v': [on_wall(0, rows[0])[1], on_wall(0, rows[1])[1]],
            'pieces': [[on_wall(u0, 0)[0], on_wall(u1, 0)[0], kind] for u0, u1, kind in wall['pieces']],
            'lamps': [box(on_wall, b) for b in wall.get('lamps', [])],
            # Over the wall: its box in the picture; across: from where to where along the wall's strip it
            # stands; rise: from how high to how high over the wall's top, in metres; lean: a little roof, its
            # eaves so far out on either side of the wall (0: it stands upright); out: how far before the wall.
            'over': [{
                'box': box(place(piece), over['box']),
                'across': [on_wall(over['box'][0], 0)[0], on_wall(over['box'][2], 0)[0]],
                'rise': [round((rows[0] - over['box'][3]) / ((rows[1] - rows[0]) / wall['height']), 3), round((rows[0] - over['box'][1]) / ((rows[1] - rows[0]) / wall['height']), 3)],
                'lean': over.get('lean', 0),
                'out': over.get('out', 0),
            } for over, piece in zip(wall.get('over', []), kept['over'])],
        },
        'house': {
            'perMetre': round(house['perMetre'] * scale, 3),
            # (A rect's fifth number, how far it stands out in metres, goes with it as it is.)
            'rects': [box(on_house, b) + list(b[4:5]) for b in house['rects']],
            'plain': box(on_plain, house['plain']),
            'plainPerMetre': round(house.get('plainPerMetre', house['perMetre']) * scale / house.get('plainScale', 1), 3),
            'panes': [box(on_house, b) for b in house.get('panes', [])],
            'dark': [box(on_house, b) for b in house.get('dark', [])],
            'lamps': [box(on_house, b) for b in house.get('lamps', [])],
            # A crest (battlements): the row its merlons stand on, the boxes of one merlon, and from one to the next.
            'crest': {
                'v': on_house(0, house['crest']['row'])[1],
                'rects': [box(on_house, b) for b in house['crest']['merlon']],
                'every': round(house['crest']['every'] * scale, 3),
            } if 'crest' in house else None,
        },
    })
for name, piece in stuffs:
    x0, y0 = piece['at']
    kit['stuff'][name] = [x0 + 3, y0 + 3, x0 + 125, y0 + 125]
    # (The colour of the roofs' floor: a house's own roof colour is laid over it, as its paint is over its front.)
    if name == 'floor':
        kit['floorTone'] = [round(float(v), 3) for v in np.asarray(piece['image']).reshape(-1, 3).mean(axis=0) / 255]

atlas.save('../../models/fronts.jpg', quality=86)
with open('../../js/kit.js', 'w') as out:
    out.write('// The kit the houses of the map are dressed from: where in models/fronts.jpg each front and each stuff\n')
    out.write('// lies, and its measures. Written by tools/fronts/build.py out of tools/fronts/fronts.json: not by hand.\n')
    out.write('// (Places are in spots of that picture, across then down; see js/fronts.js for what is made of them.)\n\n')
    out.write('export const KIT = ' + json.dumps(kit, indent=1) + ';\n')
taken = sum((piece['image'].width + 2 * GUTTER) * (piece['image'].height + 2 * GUTTER) for piece in pieces)
print('fronts:', [f['name'] for f in kit['fronts']], '| the picture is filled down to', filled, 'of', SIZE[1], '| %d%% of it is taken' % round(100 * taken / (SIZE[0] * SIZE[1])))
