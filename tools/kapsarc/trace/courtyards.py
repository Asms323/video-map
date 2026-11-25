#!/usr/bin/env python3
"""cells2.py <photo.png> <zoom> <lat> <outline.json> <out.json> <check.jpg>
The cells of a honeycomb roof in a straight-down photo: every dark courtyard seeds a cell, and the cells grow out
from them over the roofs until they meet along the seams (a watershed). Places in metres east and north of the
photo's middle."""
import json, math, sys
import cv2
import numpy as np
from shapely.geometry import Polygon
photo, zoom, lat, outline_path, out_path, check_path = sys.argv[1:7]
zoom, lat = float(zoom), float(lat)
image = cv2.imread(photo)
H, W = image.shape[:2]
ppm = 512 * 2 ** zoom / (40075016.686 * math.cos(math.radians(lat))) * 2
to_px = lambda x, y: (W / 2 + x * ppm, H / 2 - y * ppm)
to_m = lambda px, py: ((px - W / 2) / ppm, (H / 2 - py) / ppm)
foot = Polygon(json.load(open(outline_path)))
region = foot.buffer(5)
gray = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (3, 3), 0)
inside = np.zeros((H, W), np.uint8)
cv2.fillPoly(inside, [np.array([to_px(*p) for p in region.exterior.coords], np.int32)], 1)
edge = np.zeros((H, W), np.uint8)
cv2.fillPoly(edge, [np.array([to_px(*p) for p in region.buffer(-5).exterior.coords], np.int32)], 1)
# The courtyards: dark, compact, and not along the building's edge (where the dark is its walls, seen aslant, or shadow).
dark = ((gray < 80) & (inside > 0)).astype(np.uint8) * 255
dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
count, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
markers = np.zeros((H, W), np.int32)
markers[inside == 0] = 1  # the ground round the building
courts = {}
next_label = 2
for k in range(1, count):
    a = stats[k, cv2.CC_STAT_AREA] / ppm / ppm
    if a < 2.5 or a > 700:
        continue
    blob = (labels == k)
    if (blob & (edge == 0)).sum() > 0.15 * blob.sum():
        continue
    contour = max(cv2.findContours(blob.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0], key=cv2.contourArea)
    hull = cv2.convexHull(contour)
    solidity = cv2.contourArea(contour) / max(cv2.contourArea(hull), 1)
    if solidity < 0.55:
        continue
    markers[blob] = next_label
    courts[next_label] = [to_m(float(p[0][0]), float(p[0][1])) for p in hull]
    next_label += 1
print(len(courts), 'courtyards found')
# Grow the cells over the roofs: the seams between them are darker lines, which is where the floods meet.
relief = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
cv2.watershed(relief, markers)
cells = []
for label, court in courts.items():
    mask = (markers == label).astype(np.uint8) * 255
    contours = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]
    if not contours:
        continue
    contour = max(contours, key=cv2.contourArea)
    ring = Polygon([to_m(float(p[0][0]), float(p[0][1])) for p in contour]).buffer(0)
    if ring.geom_type != 'Polygon':
        ring = max(ring.geoms, key=lambda g: g.area)
    ring = ring.simplify(0.7)
    court_poly = Polygon(court).simplify(0.5)
    cells.append({'ring': [[round(x, 1), round(y, 1)] for x, y in list(ring.exterior.coords)[:-1]], 'court': [[round(x, 1), round(y, 1)] for x, y in list(court_poly.exterior.coords)[:-1]], 'area': round(ring.area, 1), 'courtArea': round(court_poly.area, 1)})
json.dump(cells, open(out_path, 'w'))
print(len(cells), 'cells; roof area', round(sum(c['area'] for c in cells)), 'm2; the outline', round(foot.area), 'm2')
check = image.copy()
for c in cells:
    cv2.polylines(check, [np.array([to_px(*p) for p in c['ring']], np.int32)], True, (0, 0, 255), 3)
    cv2.polylines(check, [np.array([to_px(*p) for p in c['court']], np.int32)], True, (255, 200, 0), 2)
cv2.polylines(check, [np.array([to_px(*p) for p in foot.exterior.coords], np.int32)], True, (0, 255, 0), 2)
x0, y0 = to_px(-160, 160); x1, y1 = to_px(160, -160)
cv2.imwrite(check_path, cv2.resize(check[max(int(y0), 0):int(y1), max(int(x0), 0):int(x1)], (1400, 1400)), [cv2.IMWRITE_JPEG_QUALITY, 88])
