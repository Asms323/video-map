#!/usr/bin/env python3
"""The outlines of the King Abdullah Financial District's buildings, for the app: build.py   (run in tools/kafd)

Reads outlines.json and writes ../../js/kafd-data.js, which js/kafd.js builds the district from. See README.md
for where outlines.json comes from.
"""
import json

AT = [46.64, 24.7625]  # the point the district is measured from: [lng, lat]
buildings = json.load(open('outlines.json'))
lines = []
for one in buildings:
    ring = ', '.join('%d, %d' % (round(x * 10), round(y * 10)) for x, y in one['ring'])
    lines.append('  [%d, %s, %s, %s, %d, [%s]],' % (one['n'], one['at'][0], one['at'][1], ('%g' % one['height']), 1 if one['known'] else 0, ring))
with open('../../js/kafd-data.js', 'w') as out:
    out.write('// The buildings of the King Abdullah Financial District: where each stands, how tall it is, and its outline.\n')
    out.write('// Written by tools/kafd/build.py out of tools/kafd/outlines.json: not by hand. (See tools/kafd/README.md for\n')
    out.write('// where the outlines and the heights come from, and js/kafd.js for what is built on them.)\n\n')
    out.write('/** The point the district is measured from: [lng, lat]. */\n')
    out.write('export const KAFD_AT = %s;\n\n' % json.dumps(AT))
    out.write('/**\n * One building to a line: its number; where its middle stands, in metres east and north of KAFD_AT; its\n')
    out.write(' * height in metres; 1 if that height is on record in the buildings data, 0 if it was read off the satellite\n')
    out.write(' * photo; and its outline, anticlockwise: east, north, east, north, … in tenths of a metre from its middle.\n */\n')
    out.write('export const KAFD_OUTLINES = [\n' + '\n'.join(lines) + '\n];\n')
print(len(buildings), 'buildings written')
