#!/usr/bin/env python3
"""cells_fill.py <clean.json> <courts.json> <outline.json> <out.json> <photo.png> <zoom> <lat> <check.jpg>
Fill the gaps the tracing left: every courtyard found that no traced cell holds gets the part of the roof that is
nearer to it than to any other courtyard (a Voronoi cell), within the building and outside the traced cells."""
import json, math, sys
import cv2
import numpy as np
from shapely.geometry import Polygon, Point, MultiPoint
from shapely.ops import unary_union, voronoi_diagram
clean_path, courts_path, outline_path, out_path, photo, zoom, lat, check_path = sys.argv[1:9]
zoom, lat = float(zoom), float(lat)
cells = json.load(open(clean_path))
foot = Polygon(json.load(open(outline_path)))
# (The roofs lean north of their feet in the photo: the building's area there is its outline and the same moved 5 m north.)
from shapely.affinity import translate
area = unary_union([foot, translate(foot, 0, 5)]).buffer(1)
traced = [Polygon(c['ring']) for c in cells]
# A scrap with no neighbour, far from the rest, is no cell: a patch of paving with a tree's shadow in it.
keep = []
for i, (c, shape) in enumerate(zip(cells, traced)):
    near = any(shape.buffer(1.5).intersects(other) for j, other in enumerate(traced) if j != i)
    if shape.area < 80 and not near:
        continue
    keep.append(i)
cells = [cells[i] for i in keep]
traced = [traced[i] for i in keep]
taken = unary_union([t.buffer(0.3) for t in traced])
courts = []
for c in json.load(open(courts_path)):
    if c.get('court'):
        courts.append(Polygon(c['court']).buffer(0))
held = [c for c in courts if any(t.buffer(1).contains(c.centroid) for t in traced)]
free = [c for c in courts if c not in held and area.contains(c.centroid) and c.area < 400]
seeds = [Polygon(c['court']).centroid for c in cells if c['court']] + [c.centroid for c in free]
regions = voronoi_diagram(MultiPoint(seeds), envelope=area.buffer(50))
leftover = area.difference(taken)
added = 0
for court in free:
    region = next((r for r in regions.geoms if r.contains(court.centroid)), None)
    if region is None:
        continue
    piece = region.intersection(leftover)
    if piece.is_empty:
        continue
    if piece.geom_type != 'Polygon':
        piece = next((g for g in piece.geoms if g.buffer(0.5).contains(court.centroid)), max(piece.geoms, key=lambda g: g.area))
    piece = piece.buffer(-0.2).simplify(0.6)
    if piece.is_empty or piece.area < 30 or not piece.buffer(0.5).contains(court.centroid):
        continue
    if piece.geom_type != 'Polygon':
        piece = max(piece.geoms, key=lambda g: g.area)
    hole = court.intersection(piece.buffer(-0.8))
    hole = hole.convex_hull.simplify(0.4) if (not hole.is_empty and hole.area > 2) else None
    cells.append({'ring': [[round(x, 1), round(y, 1)] for x, y in list(piece.exterior.coords)[:-1]], 'court': [[round(x, 1), round(y, 1)] for x, y in list(hole.exterior.coords)[:-1]] if hole is not None else None, 'filled': True})
    added += 1
# And a large patch of roof that is still no cell's, well inside the building, becomes one; its courtyard is the dark in it.
image0 = cv2.imread(photo)
H0, W0 = image0.shape[:2]
ppm0 = 512 * 2 ** zoom / (40075016.686 * math.cos(math.radians(lat))) * 2
gray0 = cv2.cvtColor(image0, cv2.COLOR_BGR2GRAY)
px0 = lambda x, y: (W0 / 2 + x * ppm0, H0 / 2 - y * ppm0)
m0 = lambda px, py: ((px - W0 / 2) / ppm0, (H0 / 2 - py) / ppm0)
rest = area.difference(unary_union([Polygon(c['ring']).buffer(0.3) for c in cells]))
pieces = [rest] if rest.geom_type == 'Polygon' else list(rest.geoms)
for piece in pieces:
    piece = piece.buffer(-1.0).buffer(0.8)
    if piece.is_empty:
        continue
    if piece.geom_type != 'Polygon':
        piece = max(piece.geoms, key=lambda g: g.area)
    box = piece.minimum_rotated_rectangle
    sides = sorted(math.dist(box.exterior.coords[i], box.exterior.coords[i + 1]) for i in range(2))
    if piece.area < 250 or sides[0] < 9 or piece.intersection(foot).area < 0.75 * piece.area:
        continue
    piece = piece.simplify(0.6)
    mask = np.zeros((H0, W0), np.uint8)
    cv2.fillPoly(mask, [np.array([px0(*p) for p in piece.buffer(-1.0).exterior.coords], np.int32)], 1)
    dark = ((gray0 < 85) & (mask > 0)).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    blobs = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]
    hole = None
    if blobs:
        big = max(blobs, key=cv2.contourArea)
        if cv2.contourArea(big) > 4 * ppm0 * ppm0:
            hole = Polygon([m0(float(p[0][0]), float(p[0][1])) for p in cv2.convexHull(big)]).simplify(0.4)
    cells.append({'ring': [[round(x, 1), round(y, 1)] for x, y in list(piece.exterior.coords)[:-1]], 'court': [[round(x, 1), round(y, 1)] for x, y in list(hole.exterior.coords)[:-1]] if hole is not None else None, 'filled': True})
    added += 1
json.dump(cells, open(out_path, 'w'))
print(len(cells), 'cells (', added, 'filled in);', sum(1 for c in cells if c['court']), 'with a courtyard; roofs', round(sum(Polygon(c['ring']).area for c in cells)), 'm2')
image = cv2.imread(photo)
H, W = image.shape[:2]
ppm = 512 * 2 ** zoom / (40075016.686 * math.cos(math.radians(lat))) * 2
to_px = lambda x, y: (W / 2 + x * ppm, H / 2 - y * ppm)
for c in cells:
    cv2.polylines(image, [np.array([to_px(*p) for p in c['ring']], np.int32)], True, (255, 0, 255) if c.get('filled') else (0, 0, 255), 2)
    if c['court']:
        cv2.polylines(image, [np.array([to_px(*p) for p in c['court']], np.int32)], True, (255, 200, 0), 2)
x0, y0 = to_px(-160, 160); x1, y1 = to_px(160, -160)
cv2.imwrite(check_path, cv2.resize(image[max(int(y0), 0):int(y1), max(int(x0), 0):int(x1)], (1400, 1400)), [cv2.IMWRITE_JPEG_QUALITY, 88])
