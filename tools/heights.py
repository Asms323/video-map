#!/usr/bin/env python3
"""Cut Riyadh's building heights out of the GlobalBuildingAtlas and lay them out as small tiles.

GlobalBuildingAtlas (Zhu, Chen, Zhang, Shi, Wang: Earth System Science Data 17, 2025) has a height for
nearly every building in the world, estimated from satellite pictures. It comes as tiles of five degrees
a side: the outlines (GBA.ODbLPolygon, Open Database License) as GeoJSON in web-mercator metres, one
building a line, and the heights (GBA.LoD1, CC BY-NC 4.0) as one JSON object that gives every outline's
height by its name.

This reads one such pair and writes, for the part of it that is Riyadh, pictures of 512 by 512 spots,
one to each map tile of zoom 13 that has a building in it: every spot holds the height of the building
that stands there, or nothing. (A spot is some 8.7 m of ground at Riyadh's latitude.) The app reads the
height of a building off these where it has none on record.

How a height is kept in one byte: 0 for no building; up to 100 m in steps of half a metre (1 to 200);
above that in steps of five metres (201 to 255, which is 375 m).

Usage: heights.py <outlines.geojson> <heights.json> <folder to write into> [zoom [spots a side]]
"""
import json
import math
import os
import re
import sys

from PIL import Image, ImageDraw

WEST, SOUTH, EAST, NORTH = 46.25, 24.3, 47.15, 25.15  # Riyadh, as the app has it (RIYADH.bounds in lib.js)
ZOOM = 13
SIZE = 512
HALF_WORLD = 20037508.342789244


def metres(lng, lat):
    """Web-mercator metres of a place."""
    return lng * HALF_WORLD / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * HALF_WORLD / math.pi


def kept_as(height):
    """A height in metres as the byte that keeps it."""
    if not height > 0:
        return 0
    if height <= 100:
        return max(1, round(height * 2))
    return min(200 + round((height - 100) / 5), 255)


def read_heights(path):
    """Every outline's height, by its name."""
    with open(path, encoding='utf-8') as source:
        text = source.read()
    found = {}
    for match in re.finditer(r'"([^"]+)":\s*\{"height":\s*(-?[0-9.eE+]+),\s*"var":\s*(-?[0-9.eE+]+)\}', text):
        height = float(match.group(2))
        if height > 0:
            found[match.group(1)] = height
    return found


def main(outlines_path, heights_path, out, zoom=ZOOM, size=SIZE):
    global ZOOM, SIZE
    ZOOM, SIZE = int(zoom), int(size)
    heights = read_heights(heights_path)
    print(f'{len(heights)} outlines have a height', file=sys.stderr)
    west, south = metres(WEST, SOUTH)
    east, north = metres(EAST, NORTH)
    spots = 2 ** ZOOM * SIZE  # spots across the whole world
    to_spot = spots / (2 * HALF_WORLD)
    tiles = {}  # (x, y) → picture
    drawers = {}
    seen = with_height = 0
    tallest = 0.0
    ring_pattern = re.compile(r'\[\s*\[\s*(\[.*?\])\s*\]')
    with open(outlines_path, encoding='utf-8') as source:
        for line in source:
            if '"Feature"' not in line:
                continue
            # (A quick look at the first corner spares reading most lines in full: the tile is far larger than the city.)
            first = re.search(r'"coordinates":\s*\[\s*\[\s*\[\s*(-?[0-9.]+),\s*(-?[0-9.]+)', line)
            if not first:
                continue
            x0, y0 = float(first.group(1)), float(first.group(2))
            if x0 < west - 500 or x0 > east + 500 or y0 < south - 500 or y0 > north + 500:
                continue
            feature = json.loads(line.rstrip().rstrip(','))
            properties = feature.get('properties') or {}
            geometry = feature.get('geometry') or {}
            seen += 1
            name = f"{properties.get('source', '')}{properties.get('id', '')}{properties.get('region', '')}"
            height = heights.get(name)
            if not height:
                continue
            polygons = geometry.get('coordinates') or []
            if geometry.get('type') == 'Polygon':
                polygons = [polygons]
            elif geometry.get('type') != 'MultiPolygon':
                continue
            with_height += 1
            tallest = max(tallest, height)
            value = kept_as(height)
            for polygon in polygons:
                if not polygon or len(polygon[0]) < 4:
                    continue
                outer = [((x + HALF_WORLD) * to_spot, (HALF_WORLD - y) * to_spot) for x, y in polygon[0]]
                xs = [p[0] for p in outer]
                ys = [p[1] for p in outer]
                for tx in range(int(min(xs) // SIZE), int(max(xs) // SIZE) + 1):
                    for ty in range(int(min(ys) // SIZE), int(max(ys) // SIZE) + 1):
                        key = (tx, ty)
                        if key not in tiles:
                            tiles[key] = Image.new('L', (SIZE, SIZE), 0)
                            drawers[key] = ImageDraw.Draw(tiles[key])
                        drawers[key].polygon([(px - tx * SIZE, py - ty * SIZE) for px, py in outer], fill=value)
                        # (A courtyard is no building: but only one that is several spots across is cut out, for a
                        # smaller one would take the walls round it with it.)
                        for hole in polygon[1:]:
                            if len(hole) < 4:
                                continue
                            inner = [((x + HALF_WORLD) * to_spot - tx * SIZE, (HALF_WORLD - y) * to_spot - ty * SIZE) for x, y in hole]
                            if max(p[0] for p in inner) - min(p[0] for p in inner) >= 4 and max(p[1] for p in inner) - min(p[1] for p in inner) >= 4:
                                drawers[key].polygon(inner, fill=0)
    written = []
    total = 0
    for (tx, ty), picture in sorted(tiles.items()):
        if picture.getbbox() is None:
            continue
        folder = os.path.join(out, str(ZOOM), str(tx))
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f'{ty}.png')
        picture.save(path, optimize=True)
        total += os.path.getsize(path)
        written.append(f'{tx}/{ty}')
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as index:
        json.dump({'zoom': ZOOM, 'size': SIZE, 'tiles': written}, index, separators=(',', ':'))
    print(f'{seen} outlines in Riyadh, {with_height} with a height (the tallest {tallest:.0f} m); {len(written)} tiles, {total / 1e6:.1f} MB', file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) not in (4, 5, 6):
        sys.exit(__doc__)
    main(*sys.argv[1:])
