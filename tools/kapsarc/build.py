#!/usr/bin/env python3
"""Write ../../js/kapsarc-data.js from cells.json: the cells of KAPSARC's honeycomb as the satellite photo shows
their roofs, moved back to where they stand.

    python3 build.py

cells.json: [{ring: [[east, north], …], court: [[east, north], …] | null}], in metres east and north of 46.7218 E,
24.87525 N, as traced on the roofs (see README.md)."""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent
# The satellite photo is taken at a slant: a roof lies north of its foot, by some 0.25 m for every metre of height.
# The roofs are some 16 m up: they are moved back south by 4 m.
SOUTH = 4.0

cells = json.loads((HERE / 'cells.json').read_text())


def area(ring):
    return sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring))) / 2


def moved(ring):
    out = [[round(x, 1), round(y - SOUTH, 1)] for x, y in ring]
    return out if area(out) > 0 else out[::-1]


def middle(ring):
    return [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)]


laid = [{'ring': moved(c['ring']), 'court': moved(c['court']) if c['court'] else None} for c in cells]
# The middle of the honeycomb, which its cells fan out from, smallest there: read off the photo.
focus = [24.0, 17.0 - SOUTH]
laid.sort(key=lambda c: math.dist(middle(c['ring']), focus))
lines = [
    '// The cells of the honeycomb of KAPSARC, written by tools/kapsarc/build.py: do not edit by hand.',
    '//',
    '// Each is the outline of one cell ([east, north], in metres from the landmark\'s middle, anticlockwise) and that',
    '// of the courtyard in it, if it has one. Traced on the satellite photo the app shows (see tools/kapsarc).',
    '',
    f'export const KAPSARC_FOCUS = {json.dumps(focus)};',
    '',
    'export const KAPSARC_CELLS = [',
]
for c in laid:
    lines.append(f"  {{ ring: {json.dumps(c['ring'], separators=(',', ':'))}, court: {json.dumps(c['court'], separators=(',', ':'))} }},")
lines.append('];')
(HERE / '../../js/kapsarc-data.js').write_text('\n'.join(lines) + '\n')
print(len(laid), 'cells; the middle of the honeycomb at', focus)
