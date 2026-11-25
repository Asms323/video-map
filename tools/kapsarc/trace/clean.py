#!/usr/bin/env python3
"""cells_clean.py <cells.json> <outline.json> <out.json> <photo.png> <zoom> <lat> <check.jpg>
Tidy traced cells: keep those of the building, drop the facets traced inside a larger cell (handing on their
courtyards), make every cell convex and keep the cells from overlapping."""
import json, math, sys
import cv2
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
cells_path, outline_path, out_path, photo, zoom, lat, check_path = sys.argv[1:8]
zoom, lat = float(zoom), float(lat)
foot = Polygon(json.load(open(outline_path))).buffer(3)
raw = json.load(open(cells_path))
items = []
for c in raw:
    poly = Polygon(c['ring']).buffer(0)
    if poly.is_empty:
        continue
    hull = poly.convex_hull
    court = Polygon(c['court']).buffer(0) if c['court'] else None
    items.append({'hull': hull, 'solid': poly.area / max(hull.area, 1e-9), 'court': court})
# A courtyard lies well inside its cell: a dark band along the cell's edge is its wall, seen aslant, or a shadow.
for it in items:
    if it['court'] is not None and not it['court'].within(it['hull'].buffer(-0.6)):
        # (Unless most of it lies well inside: then it is the courtyard, and only its edge is trimmed.)
        trimmed = it['court'].intersection(it['hull'].buffer(-0.8))
        it['court'] = trimmed.convex_hull if (not trimmed.is_empty and trimmed.area > 0.75 * it['court'].area) else None
# Of the building: mostly within its outline; not a ragged scrap of paving; and, without a courtyard, not a strip along the edge.
inner = Polygon(json.load(open(outline_path)))
def keep(it):
    hull = it['hull']
    # (A roof that runs right round its courtyard is solid; one the courtyard breaks open is a C, but still one
    # cell; one that is far less than its hull is several cells' facets run together.)
    if hull.intersection(foot).area < 0.7 * hull.area or it['solid'] < (0.36 if it['court'] is not None else 0.72):
        return False
    if it['court'] is None:
        box = hull.minimum_rotated_rectangle
        sides = sorted(math.dist(box.exterior.coords[i], box.exterior.coords[i + 1]) for i in range(2))
        if hull.intersection(inner).area < 0.8 * hull.area or sides[0] < 4.5:
            return False
    return True
items = [it for it in items if keep(it)]
items.sort(key=lambda it: -it['hull'].area)
kept = []
for it in items:
    home = next((k for k in kept if k['hull'].intersection(it['hull']).area > 0.5 * it['hull'].area), None)
    if home is not None:
        if home['court'] is None and it['court'] is not None and home['hull'].contains(it['court'].centroid):
            home['court'] = it['court']
        continue
    kept.append(it)
# No two overlap: each gives way to the larger ones already laid, and a seam of 0.4 m is left between them.
laid = []
cells = []
for it in kept:
    shape = it['hull'].buffer(-0.2)
    if laid:
        shape = shape.difference(unary_union(laid).buffer(0.2))
    if shape.is_empty:
        continue
    if shape.geom_type != 'Polygon':
        shape = max(shape.geoms, key=lambda g: g.area)
    shape = shape.simplify(0.5)
    if shape.area < 10:
        continue
    laid.append(shape)
    court = it['court']
    if court is not None:
        court = court.intersection(shape.buffer(-0.8))
        if court.is_empty or court.area < 2:
            court = None
        elif court.geom_type != 'Polygon':
            court = max(court.geoms, key=lambda g: g.area)
        if court is not None:
            court = court.convex_hull.simplify(0.4)
    cells.append({'ring': [[round(x, 1), round(y, 1)] for x, y in list(shape.exterior.coords)[:-1]], 'court': [[round(x, 1), round(y, 1)] for x, y in list(court.exterior.coords)[:-1]] if court is not None else None})
json.dump(cells, open(out_path, 'w'))
print(len(cells), 'cells;', sum(1 for c in cells if c['court']), 'with a courtyard; roofs', round(sum(Polygon(c['ring']).area for c in cells)), 'm2')
image = cv2.imread(photo)
H, W = image.shape[:2]
ppm = 512 * 2 ** zoom / (40075016.686 * math.cos(math.radians(lat))) * 2
to_px = lambda x, y: (W / 2 + x * ppm, H / 2 - y * ppm)
for c in cells:
    cv2.polylines(image, [np.array([to_px(*p) for p in c['ring']], np.int32)], True, (0, 0, 255), 2)
    if c['court']:
        cv2.polylines(image, [np.array([to_px(*p) for p in c['court']], np.int32)], True, (255, 200, 0), 2)
x0, y0 = to_px(-160, 160); x1, y1 = to_px(160, -160)
cv2.imwrite(check_path, cv2.resize(image[max(int(y0), 0):int(y1), max(int(x0), 0):int(x1)], (1400, 1400)), [cv2.IMWRITE_JPEG_QUALITY, 88])
