#!/usr/bin/env python3
"""A house of Riyadh built by measure, with its own photographs laid on it: a new villa of two storeys behind its
street wall, as five photographs the app's owner sent show it.

Usage: villa.py <straight.jpg> <corner.jpg> <above.jpg> <models/villa>

  straight.jpg  the villa seen straight on from across its street (the owner's IMG_9733)
  corner.jpg    a villa of the same design seen from its street corner (IMG_9732): for the side with two shuttered windows
  above.jpg     the same from a roof across the street (IMG_9729): for what lies on a roof

Writes <name>.vmm (the mesh, as js/props.js reads it) and <name>.jpg (its picture).

How. The straight photograph is nearly a drawing of the front: the camera stood square to the wall. From the height
of the eye (1.6 m) and of a door (2.6 m) the camera stood 14 m from the wall; everything in the photograph is then
measured by where it lies in it, each face at its own distance. The shape is plain: the wall to the street with the
garage door and the door, the box of the upper floor standing out over the yard, a wing set back beside it, a flat
roof behind its parapet with the stair house, a water tank and two cooling units on it. On every face the
photograph shows, the photograph itself is laid, from where the camera stood; the faces it does not show are plain
plaster cut out of the same photograph. The street tree is taken out of the wall first (the wall beside it is
copied over it): the app plants its own trees. What stands behind the wall, and the back, are as the photograph
from above shows the design; their measures are estimates.
"""
import math
import struct
import sys

import numpy as np
from PIL import Image

straight_path, corner_path, above_path, out = sys.argv[1:5]

# ── The camera of the straight photograph ───────────────────────────────────────────────────────────────────────
F = 1800.0          # the lens, in the photograph's own spots (a phone's main camera, at 1792 x 2400)
CX, CY = 896.0, 1200.0
EYE = 1.6           # metres over the ground
FAR = 14.0          # metres from the wall
PITCH = math.atan(73.0 / F)  # the horizon lies 73 spots under the middle: the camera looked that much up
SIN, COS = math.sin(PITCH), math.cos(PITCH)


def ray(u, v):
    """Which way a spot of the photograph looks, in metres east, north and up for one metre of the lens' own way."""
    a, b = (u - CX) / F, (CY - v) / F
    return a, COS - b * SIN, b * COS + SIN


def on_plane(u, v, north, east0=0.0):
    """Where a spot lies, if what it shows stands so far north of the wall's face: (east, up)."""
    a, dn, dz = ray(u, v)
    t = (north + FAR) / dn
    return east0 + t * a, EYE + t * dz


# (The wall's left end shows at 66 spots across: the camera stood this far east of it.)
CAM_EAST = -on_plane(66, 1273, 0.0)[0]


def spot(east, north, up):
    """Where a place shows in the photograph."""
    de, dn, dz = east - CAM_EAST, north + FAR, up - EYE
    side, high, deep = de, -dn * SIN + dz * COS, dn * COS + dz * SIN
    return CX + F * side / deep, CY - F * high / deep


# ── Its measures, read off the photograph ───────────────────────────────────────────────────────────────────────
WIDE = on_plane(1726, 1273, 0.0, CAM_EAST)[0]              # the plot along the street
WALL_LEFT = on_plane(600, 1068, 0.0, CAM_EAST)[1]          # the wall's top over the garage and beside it
WALL_RIGHT = on_plane(1500, 1098, 0.0, CAM_EAST)[1]        # and right of the door, a little lower
STEP = on_plane(1183, 1273, 0.0, CAM_EAST)[0]              # where the one meets the other: the door's left side
BOX_NORTH = 2.2                                            # the upper floor's face stands so far behind the wall's
BOX_LEFT = on_plane(576, 700, BOX_NORTH, CAM_EAST)[0]
BOX_RIGHT = on_plane(1457, 700, BOX_NORTH, CAM_EAST)[0]
TOP = on_plane(1000, 477, BOX_NORTH, CAM_EAST)[1]          # the parapet's top
BOX_FOOT = on_plane(1440, 1074, BOX_NORTH, CAM_EAST)[1]    # the underside of the upper floor
# (The wing beside it is as tall: how far back it stands follows from how much lower its top shows.)
a, dn, dz = ray(423, 573)
WING_NORTH = (TOP - EYE) / dz * dn - FAR
WING_LEFT = on_plane(423, 573, WING_NORTH, CAM_EAST)[0]
GROUND_NORTH = BOX_NORTH + 1.2                             # the ground floor's wall: the upper floor stands out over it
BACK = 14.2                                                # the back of the house
THICK = 0.25                                               # a wall
SIDE = 3.0                                                 # the walls to the neighbours
GARAGE = (4.3, 6.0)                                        # the garage behind its door: so wide, so deep
ROOF = TOP - 1.35                                          # the roof's floor behind its parapet
STAIR = (2.4, 6.4, 9.4, 13.9, ROOF + 3.0)                  # the stair house on the roof: west, east, south, north, top
TANK = (4.0, 12.6, 0.65, 1.2)                              # the water tank on it: east, north, radius, height
print(f'plot {WIDE:.2f} m along the street; wall {WALL_LEFT:.2f} and {WALL_RIGHT:.2f} m; upper floor {BOX_LEFT:.2f} to {BOX_RIGHT:.2f} m, from {BOX_FOOT:.2f} to {TOP:.2f} m up; wing from {WING_LEFT:.2f} m, {WING_NORTH:.2f} m back')

# ── Its picture ─────────────────────────────────────────────────────────────────────────────────────────────────
SIZE = 1024
picture = Image.new('RGB', (SIZE, SIZE), (200, 170, 135))
straight = Image.open(straight_path).convert('RGB')
spots = np.asarray(straight).copy()
# The street tree out of the wall: the wall beside it, copied over it; and the door's own dark over its edge.
spots[1096:1484, 930:1186] = spots[1096:1484, 668:924]
spots[1140:1345, 1186:1218] = spots[1140:1345, 1222:1254]
straight = Image.fromarray(spots)
FRONT = (40, 440, 1752, 1500)  # the part of the photograph that is laid on the front
FRONT_TALL = round(SIZE * (FRONT[3] - FRONT[1]) / (FRONT[2] - FRONT[0]))
picture.paste(straight.crop(FRONT).resize((SIZE, FRONT_TALL), Image.LANCZOS), (0, 0))


def laid(east, north, up):
    """Where on the picture a place of the front lies: as the camera saw it."""
    u, v = spot(east, north, up)
    return (u - FRONT[0]) / (FRONT[2] - FRONT[0]), (v - FRONT[1]) / (FRONT[2] - FRONT[0])


# Plain patches, each cut out of a photograph where it shows nothing but the stuff itself.
patches = {}
row = FRONT_TALL + 8


def patch(name, image, box, at, size=(96, 96)):
    piece = image.crop(box).resize(size, Image.LANCZOS)
    picture.paste(piece, at)
    inset = 6
    patches[name] = ((at[0] + inset) / SIZE, (at[1] + inset) / SIZE, (at[0] + size[0] - inset) / SIZE, (at[1] + size[1] - inset) / SIZE)
    return np.asarray(piece).reshape(-1, 3).mean(axis=0)


above = Image.open(above_path).convert('RGB')
PLASTER = patch('plaster', straight, (1400, 1150, 1700, 1380), (270, row))
patch('plinth', straight, (1400, 1425, 1700, 1468), (370, row))
patch('dark', straight, (1230, 1200, 1300, 1420), (470, row))
floor = np.asarray(above.crop((560, 962, 700, 1002))).astype(np.float32) * 0.86  # (in full sun there: taken down, to be lit again by the app's own sun)
patch('floor', Image.fromarray(floor.astype(np.uint8)), (0, 0, 140, 40), (570, row))  # the roof's own floor
patch('paving', above, (600, 1492, 800, 1540), (670, row))      # the garage's roof and the yard
patch('white', above, (425, 733, 465, 752), (770, row))         # the water tank
patch('coping', straight, (700, 1069, 1100, 1078), (870, row))  # the top of a wall, in the light

# The side with the two shuttered windows, out of the corner photograph: its face there is a slanting four-sided
# piece (its level lines run to one spot far off on the right, at the height of the eye), drawn out square here.
corner = Image.open(corner_path).convert('RGB')
VANISH = (4379.0, 1380.0)


def on_line(through, east):
    return through[1] + (VANISH[1] - through[1]) / (VANISH[0] - through[0]) * (east - through[0])


top_line, foot_line = (1200.0, 569.0), (1543.0, 1150.0)
left, right = 1242.0, 1543.0
quad = (left, on_line(top_line, left), left, on_line(foot_line, left), right, on_line(foot_line, right), right, on_line(top_line, right))
SHUTTERED = (4.17, None)  # so long, by its windows, which are a metre wide
side_size = (236, 312)
side = corner.transform(side_size, Image.QUAD, quad, Image.BICUBIC)
side_spots = np.asarray(side).astype(np.float32)
# (Its foot is hidden behind the yard wall there: plain plaster in its place. And its plaster is brought to the
# colour of the straight photograph's, which was taken in another light.)
plain = side_spots[40:120, 20:60].reshape(-1, 3).mean(axis=0)
side_spots *= PLASTER / plain
side_spots[-34:] = side_spots[-70:-36].mean(axis=(0, 1))
side = Image.fromarray(np.clip(side_spots, 0, 255).astype(np.uint8))
side_at = (8, row)
picture.paste(side, side_at)
patches['shuttered'] = ((side_at[0] + 2) / SIZE, (side_at[1] + 2) / SIZE, (side_at[0] + side_size[0] - 2) / SIZE, (side_at[1] + side_size[1] - 2) / SIZE)

# A cooling unit's face, from above (its maker's badge painted out).
unit = np.asarray(above.crop((318, 926, 384, 986))).copy()
unit[9:17, 28:42] = unit[9:17, 42:56]
unit_at = (270, row + 110)
picture.paste(Image.fromarray(unit).resize((96, 88), Image.LANCZOS), unit_at)
patches['unit'] = ((unit_at[0] + 3) / SIZE, (unit_at[1] + 3) / SIZE, (unit_at[0] + 93) / SIZE, (unit_at[1] + 85) / SIZE)

# ── Its shape ───────────────────────────────────────────────────────────────────────────────────────────────────
corners = []    # (east, north, up, across, down)
triangles = []
lamps = []      # for each corner, how it shows by night: 0 as the rest; 255 a lamp; another number a window (see js/props.js)
by_night = 0    # what the faces being made now are


def face(points, looks, across):
    """A flat four-sided face: its corners (east, north, up), which way it looks, and where each lies on the picture."""
    a, b, c = (np.array(p, dtype=float) for p in points[:3])
    normal = np.cross(b - a, c - a)
    order = list(range(len(points)))
    if np.dot(normal, looks) < 0:  # (wound anticlockwise seen from outside)
        order.reverse()
    first = len(corners)
    for k in order:
        corners.append((*points[k], *across[k]))
        lamps.append(by_night)
    for k in range(1, len(points) - 1):
        triangles.append((first, first + k, first + k + 1))


def plain_face(points, looks, stuff):
    u0, v0, u1, v1 = patches[stuff]
    face(points, looks, [(u0, v1), (u1, v1), (u1, v0), (u0, v0)][:len(points)])


def photo_face(points, looks):
    """A face the straight photograph shows: the photograph laid on it (drawn in a touch from its edges, so that
    nothing from beside it shows along them)."""
    across = [laid(*p) for p in points]
    mu, mv = sum(a for a, _ in across) / len(across), sum(b for _, b in across) / len(across)
    pull = 2.5 / (FRONT[2] - FRONT[0])
    across = [(a + math.copysign(min(pull, abs(mu - a)), mu - a), b + math.copysign(min(pull, abs(mv - b)), mv - b)) for a, b in across]
    face(points, looks, across)


def upright(x0, y0, x1, y1, z0, z1, looks, stuff=None):
    """A wall from one place on the ground to another, between two heights."""
    points = [(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)]
    if stuff is None:
        photo_face(points, looks)
    else:
        plain_face(points, looks, stuff)


def level(x0, y0, x1, y1, z, stuff, looks=(0, 0, 1)):
    plain_face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], looks, stuff)


def box(x0, y0, x1, y1, z0, z1, walls, top):
    upright(x0, y0, x1, y0, z0, z1, (0, -1, 0), walls)
    upright(x1, y0, x1, y1, z0, z1, (1, 0, 0), walls)
    upright(x1, y1, x0, y1, z0, z1, (0, 1, 0), walls)
    upright(x0, y1, x0, y0, z0, z1, (-1, 0, 0), walls)
    level(x0, y0, x1, y1, z1, top)


S, N, E, W, UP, DOWN = (0, -1, 0), (0, 1, 0), (1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1)
T = THICK
# The wall to the street: the photograph on its face; its top; its back towards the yard.
upright(0, 0, STEP, 0, 0, WALL_LEFT, S)
upright(STEP, 0, WIDE, 0, 0, WALL_RIGHT, S)
upright(STEP, 0, STEP, T, WALL_RIGHT, WALL_LEFT, E, 'plaster')
level(0, 0, STEP, T, WALL_LEFT, 'coping')
level(STEP, 0, WIDE, T, WALL_RIGHT, 'coping')
upright(STEP, T, GARAGE[0], T, 0, WALL_LEFT, N, 'plaster')
upright(WIDE, T, STEP, T, 0, WALL_RIGHT, N, 'plaster')
# The garage behind its door: its roof, its side to the yard, its back.
level(0, T, GARAGE[0], GARAGE[1], WALL_LEFT, 'paving')
upright(GARAGE[0], T, GARAGE[0], GARAGE[1], 0, WALL_LEFT, E, 'plaster')
upright(GARAGE[0], GARAGE[1], 0, GARAGE[1], 0, WALL_LEFT, N, 'plaster')
# The walls to the neighbours, and what closes the plot behind the house.
upright(0, BACK, 0, 0, 0, SIDE, W, 'plaster')
upright(0, 0, 0, GARAGE[1], SIDE, WALL_LEFT, W, 'plaster')
upright(T, GARAGE[1], T, BACK, 0, SIDE, E, 'plaster')
level(0, GARAGE[1], T, BACK, SIDE, 'coping')
upright(WIDE, 0, WIDE, BACK, 0, WALL_RIGHT, E, 'plaster')
upright(WIDE - T, BACK, WIDE - T, T, 0, WALL_RIGHT, W, 'plaster')
level(WIDE - T, T, WIDE, BACK, WALL_RIGHT, 'coping')
upright(WING_LEFT, BACK, 0, BACK, 0, SIDE, N, 'plaster')
upright(WIDE, BACK, BOX_RIGHT, BACK, 0, WALL_RIGHT, N, 'plaster')
upright(0, BACK - T, WING_LEFT, BACK - T, 0, SIDE, S, 'plaster')
upright(BOX_RIGHT, BACK - T, WIDE, BACK - T, 0, WALL_RIGHT, S, 'plaster')
# The yard's paving.
level(T, T, WIDE - T, BACK, 0.05, 'paving')
# The ground floor: its wall under the upper floor, with the door of the house; its sides; the back of the house.
upright(BOX_LEFT, GROUND_NORTH, BOX_RIGHT, GROUND_NORTH, 0, BOX_FOOT, S, 'plaster')
upright(6.9, GROUND_NORTH - 0.03, 8.0, GROUND_NORTH - 0.03, 0.05, 2.45, S, 'dark')
upright(WING_LEFT, WING_NORTH, BOX_LEFT, WING_NORTH, 0, BOX_FOOT + 0.36, S, 'plaster')
upright(BOX_RIGHT, GROUND_NORTH, BOX_RIGHT, BACK, 0, BOX_FOOT, E, 'plaster')
upright(WING_LEFT, BACK, WING_LEFT, WING_NORTH, 0, TOP, W, 'plaster')
upright(BOX_RIGHT, BACK, WING_LEFT, BACK, 0, TOP, N, 'plaster')
# The upper floor: its face with the band of wood and the three windows, as the photograph has it; its underside
# over the yard; the wing's face beside it (the photograph above the yard wall, plaster below); its sides.
upright(BOX_LEFT, BOX_NORTH, BOX_RIGHT, BOX_NORTH, BOX_FOOT, TOP, S)
level(BOX_LEFT, BOX_NORTH, BOX_RIGHT, GROUND_NORTH, BOX_FOOT, 'dark', DOWN)
upright(WING_LEFT, WING_NORTH, BOX_LEFT, WING_NORTH, BOX_FOOT + 0.36, TOP, S)
upright(BOX_LEFT, WING_NORTH, BOX_LEFT, BOX_NORTH, BOX_FOOT, TOP, W, 'plaster')
shutters = (8.6, 8.6 + SHUTTERED[0])
upright(BOX_RIGHT, BOX_NORTH, BOX_RIGHT, shutters[0], BOX_FOOT, TOP, E, 'plaster')
upright(BOX_RIGHT, shutters[0], BOX_RIGHT, shutters[1], BOX_FOOT, TOP, E, 'shuttered')
upright(BOX_RIGHT, shutters[1], BOX_RIGHT, BACK, BOX_FOOT, TOP, E, 'plaster')
# By night: the glass of the three windows in the band of wood may be lit (each its own pane, a finger's breadth
# before the face, the photograph on it as on the face behind); and beside the door to the street two lamps are.
for group, (u0, v0, u1, v1) in enumerate([(616, 766, 668, 854), (949, 770, 1089, 933), (1199, 770, 1338, 933)], start=1):
    by_night = group
    (x0, z1), (x1, z0) = on_plane(u0, v0, BOX_NORTH, CAM_EAST), on_plane(u1, v1, BOX_NORTH, CAM_EAST)
    photo_face([(x0, BOX_NORTH - 0.02, z0), (x1, BOX_NORTH - 0.02, z0), (x1, BOX_NORTH - 0.02, z1), (x0, BOX_NORTH - 0.02, z1)], S)
by_night = 255
door = (on_plane(1185, 1273, 0.0, CAM_EAST)[0], on_plane(1320, 1273, 0.0, CAM_EAST)[0])
for east in (door[0] - 0.55, door[1] + 0.55):
    upright(east - 0.08, -0.06, east + 0.08, -0.06, 2.12, 2.42, S, 'dark')
by_night = 0
# The roof: the parapet's top all round, its inner side, and the roof's floor behind it.
outline = [(WING_LEFT, WING_NORTH), (BOX_LEFT, WING_NORTH), (BOX_LEFT, BOX_NORTH), (BOX_RIGHT, BOX_NORTH), (BOX_RIGHT, BACK), (WING_LEFT, BACK)]
inner = [(WING_LEFT + T, WING_NORTH + T), (BOX_LEFT + T, WING_NORTH + T), (BOX_LEFT + T, BOX_NORTH + T), (BOX_RIGHT - T, BOX_NORTH + T), (BOX_RIGHT - T, BACK - T), (WING_LEFT + T, BACK - T)]
for k in range(6):
    (ax, ay), (bx, by), (cx, cy), (dx, dy) = outline[k], outline[(k + 1) % 6], inner[(k + 1) % 6], inner[k]
    plain_face([(ax, ay, TOP), (bx, by, TOP), (cx, cy, TOP), (dx, dy, TOP)], UP, 'coping')
    inward = (-(cy - dy), cx - dx, 0)  # (to the left of the way round: into the roof)
    plain_face([(dx, dy, ROOF), (cx, cy, ROOF), (cx, cy, TOP), (dx, dy, TOP)], inward, 'plaster')
level(WING_LEFT + T, WING_NORTH + T, BOX_LEFT + T, BACK - T, ROOF, 'floor')
level(BOX_LEFT + T, BOX_NORTH + T, BOX_RIGHT - T, BACK - T, ROOF, 'floor')
# On the roof: the stair house with its door, the water tank on it, two cooling units before it.
box(STAIR[0], STAIR[2], STAIR[1], STAIR[3], ROOF, STAIR[4], 'plaster', 'coping')
upright(4.7, STAIR[2] - 0.03, 5.6, STAIR[2] - 0.03, ROOF + 0.05, ROOF + 2.15, S, 'plinth')
tank = [(TANK[0] + TANK[2] * math.cos(k * math.pi / 4), TANK[1] + TANK[2] * math.sin(k * math.pi / 4)) for k in range(8)]
for k in range(8):
    (ax, ay), (bx, by) = tank[k], tank[(k + 1) % 8]
    upright(ax, ay, bx, by, STAIR[4], STAIR[4] + TANK[3], ((ax + bx) / 2 - TANK[0], (ay + by) / 2 - TANK[1], 0), 'white')
u0, v0, u1, v1 = patches['white']
face([(x, y, STAIR[4] + TANK[3]) for x, y in tank], UP, [((u0 + u1) / 2, (v0 + v1) / 2)] * 8)
for west in (2.9, 4.05):
    x0, x1, y0, y1, z1 = west, west + 0.95, STAIR[2] - 0.75, STAIR[2] - 0.38, ROOF + 0.7
    upright(x0, y0, x1, y0, ROOF, z1, S, 'unit')
    upright(x1, y0, x1, y1, ROOF, z1, E, 'white')
    upright(x1, y1, x0, y1, ROOF, z1, N, 'white')
    upright(x0, y1, x0, y0, ROOF, z1, W, 'white')
    level(x0, y0, x1, y1, z1, 'white')

# ── The file ────────────────────────────────────────────────────────────────────────────────────────────────────
tall = max(c[2] for c in corners)
print(f'{len(corners)} corners, {len(triangles)} triangles; {tall:.2f} m to the top of the tank, the roof\'s edge at {TOP / tall:.3f} of that; its plaster is {[round(float(v) / 255, 3) for v in PLASTER]}')
places = np.array([[(c[0] - WIDE / 2) / tall, (c[1] - BACK / 2) / tall, c[2] / tall] for c in corners], dtype=np.float64)
low, high = places.min(axis=0), places.max(axis=0)
packed = np.round((places - low) / np.maximum(high - low, 1e-9) * 65535).astype('<u2')
on_picture = np.round(np.clip(np.array([[c[3], c[4]] for c in corners]), 0, 1) * 65535).astype('<u2')
order = np.array(triangles, dtype='<u2').reshape(-1)


def padded(data):
    return data + b'\0' * ((4 - len(data) % 4) % 4)


with open(out + '.vmm', 'wb') as file:
    file.write(b'VMM1' + struct.pack('<II', len(corners), len(order)) + struct.pack('<6f', *low, *high))
    file.write(padded(packed.tobytes()) + padded(on_picture.tobytes()) + padded(order.tobytes()) + bytes(lamps))
picture.save(out + '.jpg', quality=90)
print('saved', out + '.vmm', out + '.jpg')
