#!/usr/bin/env python3
"""cells3.py <photo.png> <zoom> <lat> <outline.json> <out.json> <check.jpg> [block px] [C]
The cells of a honeycomb roof in a straight-down photo. The seams between the cells are lines a little darker than
the roofs beside them: they are found against the brightness round each pixel, and every roof they enclose is a
cell. Its courtyard is the dark inside it. Places in metres east and north of the photo's middle."""
import json, math, sys
import cv2
import numpy as np
from shapely.geometry import Polygon
photo, zoom, lat, outline_path, out_path, check_path = sys.argv[1:7]
block = int(sys.argv[7]) if len(sys.argv) > 7 else 31
C = int(sys.argv[8]) if len(sys.argv) > 8 else 10
zoom, lat = float(zoom), float(lat)
image = cv2.imread(photo)
H, W = image.shape[:2]
ppm = 512 * 2 ** zoom / (40075016.686 * math.cos(math.radians(lat))) * 2
to_px = lambda x, y: (W / 2 + x * ppm, H / 2 - y * ppm)
to_m = lambda px, py: ((px - W / 2) / ppm, (H / 2 - py) / ppm)
foot = Polygon(json.load(open(outline_path)))
region = foot.buffer(6)
gray = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (3, 3), 0)
inside = np.zeros((H, W), np.uint8)
cv2.fillPoly(inside, [np.array([to_px(*p) for p in region.exterior.coords], np.int32)], 1)
# Roof: not darker than its surroundings, and bright enough to be roof at all.
local = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, block, -C // 3)
roof = ((local > 0) & (gray > 140) & (inside > 0)).astype(np.uint8) * 255
roof = cv2.morphologyEx(roof, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
roof = cv2.erode(roof, np.ones((3, 3), np.uint8))
count, labels, stats, _ = cv2.connectedComponentsWithStats(roof, connectivity=4)
dark = ((gray < 85) & (inside > 0)).astype(np.uint8)
cells = []
for k in range(1, count):
    if stats[k, cv2.CC_STAT_AREA] < 12 * ppm * ppm:
        continue
    mask = cv2.dilate((labels == k).astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    contour = max(cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0], key=cv2.contourArea)
    hull = cv2.convexHull(contour)
    ring = Polygon([to_m(float(p[0][0]), float(p[0][1])) for p in contour]).buffer(0)
    if ring.geom_type != 'Polygon':
        ring = max(ring.geoms, key=lambda g: g.area)
    hullPoly = Polygon([to_m(float(p[0][0]), float(p[0][1])) for p in hull])
    # (A roof with a courtyard in it is a ring of roof: its outline is that of its hull.)
    filled = np.zeros((H, W), np.uint8)
    cv2.fillPoly(filled, [hull], 1)
    hole = (filled & dark & (mask == 0)).astype(np.uint8) * 255
    hole = cv2.morphologyEx(hole, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    court = None
    holes = cv2.findContours(hole, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]
    if holes:
        big = max(holes, key=cv2.contourArea)
        if cv2.contourArea(big) > 2 * ppm * ppm:
            cp = Polygon([to_m(float(p[0][0]), float(p[0][1])) for p in cv2.convexHull(big)]).simplify(0.4)
            if hullPoly.buffer(-0.5).contains(cp.centroid):
                court = cp
    outline = hullPoly if (court is not None and hullPoly.area < ring.area * 1.6) else ring
    outline = outline.simplify(0.7)
    if outline.area < 12:
        continue
    cells.append({'ring': [[round(x, 1), round(y, 1)] for x, y in list(outline.exterior.coords)[:-1]], 'court': [[round(x, 1), round(y, 1)] for x, y in list(court.exterior.coords)[:-1]] if court is not None else None, 'area': round(outline.area, 1)})
json.dump(cells, open(out_path, 'w'))
print(len(cells), 'cells;', sum(1 for c in cells if c['court']), 'with a courtyard; roof', round(sum(c['area'] for c in cells)), 'm2; the outline', round(foot.area), 'm2')
check = image.copy()
for c in cells:
    cv2.polylines(check, [np.array([to_px(*p) for p in c['ring']], np.int32)], True, (0, 0, 255), 2)
    if c['court']:
        cv2.polylines(check, [np.array([to_px(*p) for p in c['court']], np.int32)], True, (255, 200, 0), 2)
cv2.polylines(check, [np.array([to_px(*p) for p in foot.exterior.coords], np.int32)], True, (0, 255, 0), 2)
x0, y0 = to_px(-160, 160); x1, y1 = to_px(160, -160)
cv2.imwrite(check_path, cv2.resize(check[max(int(y0), 0):int(y1), max(int(x0), 0):int(x1)], (1400, 1400)), [cv2.IMWRITE_JPEG_QUALITY, 88])
