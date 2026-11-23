// The lights of the 3D city by night.
//
// The street lamps along the roads and the pool of light each throws on the
// ground, the lights of the traffic, the light that falls from shop windows
// onto the pavement, and the red lamps on top of what is tall. A lamp post
// stands by day as well, so the posts go into one mesh and everything that
// gives light into another, which the scene draws only by night and adds to
// what lies under it (see "glow" in scene.js).
//
// Where the lamps of a street really stand, no open map says. They are stood
// by rule: every so many metres, taller and further apart along the great
// roads; along the median of a road whose two carriageways are mapped apart;
// by turns on either side of a wide two-way street; down one side of a
// residential street. The colour of their light goes by the kind of road, as
// it does in Riyadh: white on the great roads, the amber of sodium lamps on
// the side streets.
//
// Light comes in two kinds. Light that lies on something (a pool on the road,
// the beam of a headlight, the glow from a shop window) is a patch of
// triangles. A lamp itself, seen from wherever, is a point of light: one
// corner in a mesh the scene draws as points, each a round glow that never
// gets smaller than a speck however far off it is. That is what carries the
// city's lights to the horizon.
//
// Nothing here touches the browser. Measurements are in metres, east and
// north of the network's origin.

import { LAMP_LIGHT } from './lib.js';
import { PARAPET_METERS as BRIDGE_PARAPET_METERS, VEHICLES, faceLight, heightAlong, nearestOn, pointAlong } from './life.js';
import { facadeOf, localRing, wallsOfRing } from './walls.js';

const METERS_PER_DEGREE = 111320;
const hex = (text) => [parseInt(text.slice(1, 3), 16), parseInt(text.slice(3, 5), 16), parseInt(text.slice(5, 7), 16)];
const LIGHT = { big: hex(LAMP_LIGHT.big), main: hex(LAMP_LIGHT.main), side: hex(LAMP_LIGHT.side), led: hex(LAMP_LIGHT.led) };

/**
 * The lamps of each kind of road: how far apart they stand (every), how tall
 * they are, how far the arm reaches out over the road, how wide the pool of
 * light under each is (its radius), which colour of light they give, and
 * whether a one-way carriageway has them along its median (its left) rather
 * than its kerb.
 */
export const LAMPS = {
  motorway: { every: 42, tall: 12, arm: 2.6, pool: 13, light: 'big', median: true },
  trunk: { every: 42, tall: 12, arm: 2.6, pool: 13, light: 'big', median: true },
  primary: { every: 38, tall: 11, arm: 2.4, pool: 12, light: 'main', median: true },
  secondary: { every: 34, tall: 10, arm: 2.2, pool: 11, light: 'main', median: true },
  tertiary: { every: 34, tall: 9, arm: 2, pool: 10, light: 'side', median: false },
  minor: { every: 30, tall: 8, arm: 1.6, pool: 9, light: 'side', median: false },
  busway: { every: 34, tall: 9, arm: 2, pool: 10, light: 'side', median: false },
};
// A car park has lamps of its own down its lanes: lower, with the lamp on top of the post, and white.
const CAR_PARK_LAMPS = { every: 28, tall: 7, arm: 0, pool: 10, light: 'main', median: false };
// The wide two-way streets have lamps by turns on either side.
const BOTH_SIDES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'busway']);

const POST_HALF_METERS = 0.16; // a little thicker than life, to be seen at all
const POST_PAINT = [128, 132, 138];
const HEAD_PAINT = [178, 182, 188];
const LAMP_FROM_END_METERS = 7; // no lamp this close to where a street meets another: it would stand in the junction
const LAMP_BEHIND_KERB_METERS = 0.6;
const POOL_UP_METERS = 0.24; // just clear of the paint on the road
const POOL_SIDES = 12;
const POOL_STRENGTH = 0.27;
const POOL_CORE = 0.45; // how far out the bright middle of a pool reaches, as a part of its radius
const POOL_SKIRT = 0.3; // and how much of its strength is left there, to fade out over the rest
const POOL_FINE_WITHIN_METERS = 900; // further off than this a pool is drawn more simply
const HEAD_GLOW_METERS = 1.3;
const ROAD_SQUARE_METERS = 48;

const HEADLIGHT = [255, 244, 222];
const BEAM_METERS = 10;
const BEAM_STRENGTH = 0.2;
const TAIL_LIGHT = [255, 44, 30];
const CABIN_LIGHT = [255, 236, 190];
const SHOP_LIGHT = [255, 226, 178];
const BEACON = [255, 58, 40];
const ROOF_LIGHT = [255, 204, 138];

/** A round patch of light lying flat: brightest in the middle, gone at its edge. */
function disc(glow, x, y, z, radius, colour, strength, sides = 6) {
  glow.room(sides * 3);
  let px = x + radius;
  let py = y;
  for (let i = 1; i <= sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const qx = x + Math.cos(angle) * radius;
    const qy = y + Math.sin(angle) * radius;
    glow.glow(x, y, z, colour[0], colour[1], colour[2], strength);
    glow.glow(px, py, z, colour[0], colour[1], colour[2], 0);
    glow.glow(qx, qy, z, colour[0], colour[1], colour[2], 0);
    px = qx;
    py = qy;
  }
}

/**
 * A pool of light on the ground: a bright middle and a wide soft skirt
 * round it, so that the pools of two lamps run into each other without a
 * crease between them.
 */
function pool(glow, x, y, z, radius, colour, strength, sides = POOL_SIDES) {
  glow.room(sides * 9);
  const [r, g, b] = colour;
  const core = radius * POOL_CORE;
  const skirt = strength * POOL_SKIRT;
  let cos = 1;
  let sin = 0;
  for (let i = 1; i <= sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const nextCos = Math.cos(angle);
    const nextSin = Math.sin(angle);
    glow.glow(x, y, z, r, g, b, strength);
    glow.glow(x + cos * core, y + sin * core, z, r, g, b, skirt);
    glow.glow(x + nextCos * core, y + nextSin * core, z, r, g, b, skirt);
    glow.glow(x + cos * core, y + sin * core, z, r, g, b, skirt);
    glow.glow(x + cos * radius, y + sin * radius, z, r, g, b, 0);
    glow.glow(x + nextCos * radius, y + nextSin * radius, z, r, g, b, 0);
    glow.glow(x + cos * core, y + sin * core, z, r, g, b, skirt);
    glow.glow(x + nextCos * radius, y + nextSin * radius, z, r, g, b, 0);
    glow.glow(x + nextCos * core, y + nextSin * core, z, r, g, b, skirt);
    cos = nextCos;
    sin = nextSin;
  }
}

/**
 * Stand the street lamps of a network.
 *
 * posts: a Mesh for the posts with their arms and heads, which stand by day
 * too. glow: a Mesh for their light: the lit head of each, and the pool of
 * light under it. light: the sun, as lightFrom() gives it, or null. most:
 * the most lamps, those nearest the middle of the network first. built(x, y):
 * whether a building stands at a spot, where that is known: no post stands
 * in a building. heads: a Mesh of points of light for the lit heads, one
 * corner each; without it each head is a small round patch in `glow`.
 * ledAt(x, y): whether the streets at a spot have the new white lamps (the
 * great roads have them everywhere).
 *
 * A post stands just behind the kerb, clear of every other road, or on the
 * parapet of a bridge; where there is no room on the side the rule gives, it
 * stands on the other, and where there is none on either the street goes
 * without that lamp. Returns { lamps, ways, reach }: how many lamps were
 * stood, along how many stretches of road, and how far from the middle of
 * the network they reach (every street nearer than that has its lamps;
 * Infinity if none was left out).
 */
export function drawLamps(posts, glow, network, light, { most = 3000, built = null, heads = null, ledAt = null } = {}) {
  posts.clear();
  glow.clear();
  heads?.clear();
  const spot = [0, 0, 0, 0];

  // Every road on the ground, filed under the squares of ground it passes through: a post keeps off them all.
  const squares = new Map();
  const squareOf = (cellX, cellY) => (cellX + 32768) * 65536 + (cellY + 32768);
  for (const way of network.ways) {
    if (way.rail || way.hidden || way.deck > 0) continue;
    const out = way.width / 2 + 1;
    for (let cellX = Math.floor((way.box[0] - out) / ROAD_SQUARE_METERS); cellX <= Math.floor((way.box[2] + out) / ROAD_SQUARE_METERS); cellX += 1) {
      for (let cellY = Math.floor((way.box[1] - out) / ROAD_SQUARE_METERS); cellY <= Math.floor((way.box[3] + out) / ROAD_SQUARE_METERS); cellY += 1) {
        const key = squareOf(cellX, cellY);
        if (!squares.has(key)) squares.set(key, []);
        squares.get(key).push(way);
      }
    }
  }
  const onRoad = (x, y, own) => {
    for (const way of squares.get(squareOf(Math.floor(x / ROAD_SQUARE_METERS), Math.floor(y / ROAD_SQUARE_METERS))) ?? []) {
      if (way === own) continue;
      const clear = way.width / 2 + 0.1;
      if (x < way.box[0] - clear || x > way.box[2] + clear || y < way.box[1] - clear || y > way.box[3] + clear) continue;
      if (nearestOn(way, x, y).distance < clear) return true;
    }
    return false;
  };

  const lit = (paint, east, north, up) => {
    const bright = faceLight(light, east, north, up);
    return [paint[0] * bright, paint[1] * bright, paint[2] * bright];
  };
  const postTop = lit(HEAD_PAINT, 0, 0, 1);

  /** One lamp: its post from the ground (or the deck) up, the arm, the head at the end of it, and its light. */
  const stand = (way, rule, s, side) => {
    pointAlong(way, s, spot);
    const [x, y, east, north] = spot;
    const deck = way.deck > 0;
    const lift = deck ? Math.max(heightAlong(way, s), 0) : 0;
    const across = deck ? way.width / 2 + 0.52 : way.width / 2 + LAMP_BEHIND_KERB_METERS;
    // To the right of the way as it is drawn (side 1), or to its left (side -1).
    const outEast = north * side;
    const outNorth = -east * side;
    const px = x + outEast * across;
    const py = y + outNorth * across;
    if (!deck && ((built && built(px, py)) || onRoad(px, py, way))) return false;
    const foot = lift + (deck ? BRIDGE_PARAPET_METERS : 0);
    const top = lift + rule.tall;
    const h = POST_HALF_METERS;
    // The post: four sides, each lit by how it faces.
    for (const [nAlong, nAcross] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nEast = east * nAlong + outEast * nAcross;
      const nNorth = north * nAlong + outNorth * nAcross;
      const [r, g, b] = lit(POST_PAINT, nEast, nNorth, 0);
      const ax = px + nEast * h - nNorth * h;
      const ay = py + nNorth * h + nEast * h;
      const bx = px + nEast * h + nNorth * h;
      const by = py + nNorth * h - nEast * h;
      posts.face([ax, ay, foot], [bx, by, foot], [bx, by, top], [ax, ay, top], r, g, b, 1);
    }
    // The arm, out over the road, and the head at its end.
    const hx = px - outEast * rule.arm;
    const hy = py - outNorth * rule.arm;
    if (rule.arm > 0) {
      posts.face([px + east * 0.1, py + north * 0.1, top], [px - east * 0.1, py - north * 0.1, top], [hx - east * 0.1, hy - north * 0.1, top], [hx + east * 0.1, hy + north * 0.1, top], postTop[0] * 0.8, postTop[1] * 0.8, postTop[2] * 0.8, 1);
    }
    const headLong = rule.arm > 0 ? 0.55 : 0.4;
    const headWide = rule.arm > 0 ? 0.28 : 0.4;
    posts.face(
      [hx + outEast * headLong + east * headWide, hy + outNorth * headLong + north * headWide, top + 0.04],
      [hx + outEast * headLong - east * headWide, hy + outNorth * headLong - north * headWide, top + 0.04],
      [hx - outEast * headLong - east * headWide, hy - outNorth * headLong - north * headWide, top + 0.04],
      [hx - outEast * headLong + east * headWide, hy - outNorth * headLong + north * headWide, top + 0.04],
      postTop[0],
      postTop[1],
      postTop[2],
      1,
    );

    // Its light: the head, seen as a point of light; and the pool it throws. (A side street has the new
    // white lamps where its district has been given them, and the amber of sodium where it has not.)
    const colour = rule.light !== 'big' && ledAt && ledAt(px, py) ? LIGHT.led : LIGHT[rule.light];
    const head = [255, (colour[1] + 255) / 2, (colour[2] + 255) / 2];
    if (heads) {
      heads.room(1);
      heads.glow(hx, hy, top + 0.12, head[0], head[1], head[2], 1);
    } else {
      disc(glow, hx, hy, top + 0.12, HEAD_GLOW_METERS, head, 1);
    }
    if (deck) {
      // On a bridge the light lies on the deck and nowhere else: a band across it, fading both ways along it.
      const half = way.width / 2 + 0.3;
      const cuts = [-rule.pool, 0, rule.pool].map((by) => {
        const at = Math.min(Math.max(s + by, 0), way.length);
        const there = pointAlong(way, at, [0, 0, 0, 0]);
        return { x: there[0], y: there[1], east: there[2], north: there[3], z: Math.max(heightAlong(way, at), 0) + 0.12, strength: by === 0 ? POOL_STRENGTH : 0 };
      });
      const edge = (cut, to) => [cut.x - cut.north * to, cut.y + cut.east * to, cut.z];
      glow.room(12);
      for (let i = 1; i < cuts.length; i += 1) {
        const a = cuts[i - 1];
        const b = cuts[i];
        for (const [cut, to] of [[a, half], [a, -half], [b, -half], [a, half], [b, -half], [b, half]]) {
          const [cx, cy, cz] = edge(cut, to);
          glow.glow(cx, cy, cz, colour[0], colour[1], colour[2], cut.strength);
        }
      }
    } else if (Math.hypot(hx, hy) <= POOL_FINE_WITHIN_METERS) {
      pool(glow, hx, hy, POOL_UP_METERS, rule.pool, colour, POOL_STRENGTH);
    } else {
      disc(glow, hx, hy, POOL_UP_METERS, rule.pool * 0.8, colour, POOL_STRENGTH * 0.8, 8);
    }
    return true;
  };

  // The nearest streets first: the lamps that are left out are the far ones.
  const streets = [];
  for (const way of network.ways) {
    if (way.rail || way.hidden) continue;
    const rule = way.class === 'service' ? (way.service === 'parking_aisle' ? CAR_PARK_LAMPS : null) : LAMPS[way.class];
    if (!rule || way.length < 20) continue;
    streets.push({ way, rule, far: Math.hypot((way.box[0] + way.box[2]) / 2, (way.box[1] + way.box[3]) / 2) });
  }
  streets.sort((a, b) => a.far - b.far);
  let lamps = 0;
  let ways = 0;
  let reach = Infinity;
  for (const { way, rule, far } of streets) {
    if (lamps >= most) {
      reach = far;
      break;
    }
    const usable = way.length - 2 * LAMP_FROM_END_METERS;
    const count = Math.max(Math.round(usable / rule.every), 1);
    let stood = 0;
    for (let i = 0; i < count && lamps < most; i += 1) {
      const s = LAMP_FROM_END_METERS + (usable * (i + 0.5)) / count;
      // Which side: the median of a great road's carriageway (the left of its traffic), else its kerb; a
      // wide two-way street by turns on either side; any other on its right.
      let side = 1;
      if (way.oneway !== 0) side = rule.median ? -way.oneway : way.oneway;
      else if (BOTH_SIDES.has(way.class)) side = i % 2 === 0 ? 1 : -1;
      if (stand(way, rule, s, side) || stand(way, rule, s, -side)) {
        lamps += 1;
        stood += 1;
      }
    }
    if (stood > 0) ways += 1;
  }
  return { lamps, ways, reach };
}

/**
 * The lights of one vehicle, added to a mesh of light: two headlights and
 * their beam on the road ahead, two tail lights; and the lit windows of a
 * bus or of a train's car. (x, y) is its middle, (east, north) the way it
 * points. shown: how far it has faded in, 0 to 1. scale: 1 is life size.
 * lift: how high the road is under it, on a bridge. points: a Mesh of points
 * of light for the lamps themselves, one corner each; without it each lamp
 * is a small round patch in `glow`.
 */
export function vehicleLights(glow, type, x, y, east, north, shown = 1, scale = 1, lift = 0, points = null) {
  const shape = VEHICLES[type];
  if (!shape || !(shown > 0)) return;
  const length = shape.length * scale;
  const halfLength = length / 2;
  const halfWidth = (shape.width * scale) / 2;
  const rightEast = north;
  const rightNorth = -east;
  const at = (along, across) => [x + east * along + rightEast * across, y + north * along + rightNorth * across];
  if (type !== 'coach') {
    // (A train's cars come one by one, and none of them knows whether it is the first: they carry no lamps.)
    for (const side of [-1, 1]) {
      const [fx, fy] = at(halfLength + 0.06, side * halfWidth * 0.62);
      const [bx, by] = at(-halfLength - 0.06, side * halfWidth * 0.66);
      if (points) {
        points.room(2);
        points.glow(fx, fy, lift + 0.72 * scale, HEADLIGHT[0], HEADLIGHT[1], HEADLIGHT[2], shown);
        points.glow(bx, by, lift + 0.82 * scale, TAIL_LIGHT[0], TAIL_LIGHT[1], TAIL_LIGHT[2], 0.9 * shown);
      } else {
        disc(glow, fx, fy, lift + 0.72 * scale, 0.8 * scale, HEADLIGHT, shown, 5);
        disc(glow, bx, by, lift + 0.82 * scale, 0.58 * scale, TAIL_LIGHT, 0.9 * shown, 5);
      }
    }
    // The beam: on the road from the bumper forward, widening and fading.
    const reach = BEAM_METERS * scale;
    const z = lift + POOL_UP_METERS + 0.02;
    const near = [at(halfLength, -halfWidth * 0.9), at(halfLength, halfWidth * 0.9)];
    const far = [at(halfLength + reach, -halfWidth - 1.6 * scale), at(halfLength + reach, halfWidth + 1.6 * scale)];
    const strength = BEAM_STRENGTH * shown;
    glow.room(6);
    glow.glow(near[0][0], near[0][1], z, HEADLIGHT[0], HEADLIGHT[1], HEADLIGHT[2], strength);
    glow.glow(near[1][0], near[1][1], z, HEADLIGHT[0], HEADLIGHT[1], HEADLIGHT[2], strength);
    glow.glow(far[1][0], far[1][1], z, HEADLIGHT[0], HEADLIGHT[1], HEADLIGHT[2], 0);
    glow.glow(near[0][0], near[0][1], z, HEADLIGHT[0], HEADLIGHT[1], HEADLIGHT[2], strength);
    glow.glow(far[1][0], far[1][1], z, HEADLIGHT[0], HEADLIGHT[1], HEADLIGHT[2], 0);
    glow.glow(far[0][0], far[0][1], z, HEADLIGHT[0], HEADLIGHT[1], HEADLIGHT[2], 0);
  }
  if (type === 'bus' || type === 'coach') {
    // The lights are on inside: a band of lit glass down each side.
    const glass = shape.boxes.find((box) => box[5] === 'glass');
    if (glass) {
      const [from, to, share, bottom, top] = glass;
      const rear = -halfLength + length * from;
      const front = -halfLength + length * to;
      const low = lift + bottom * scale;
      const high = lift + top * scale;
      const strength = 0.55 * shown;
      glow.room(12);
      for (const side of [-1, 1]) {
        const across = side * (halfWidth * share + 0.05);
        const a = at(rear, across);
        const b = at(front, across);
        for (const [point, z] of [[a, low], [b, low], [b, high], [a, low], [b, high], [a, high]]) glow.glow(point[0], point[1], z, CABIN_LIGHT[0], CABIN_LIGHT[1], CABIN_LIGHT[2], strength);
      }
    }
  }
}

/**
 * Fill a mesh of light with the lights of everything that moves. Returns
 * the number of vehicles and train cars lit. scale: as for drawTraffic().
 * points: a Mesh of points of light for the lamps themselves (see
 * vehicleLights); it is emptied first too.
 */
export function drawTrafficLights(glow, traffic, scale = 1, points = null) {
  glow.clear();
  points?.clear();
  let lit = 0;
  traffic.eachVehicle((type, x, y, east, north, _paint, _cargo, shown, lift) => {
    vehicleLights(glow, type, x, y, east, north, shown, scale, lift, points);
    lit += 1;
  });
  return lit;
}

/**
 * The light that falls out of shop windows onto the pavement: a strip along
 * every wall of a building with shops at its foot (see facadeOf in walls.js),
 * brightest at the wall and gone a few metres out. Added to a mesh of light,
 * which is not emptied first. buildings, origin: as for wallsOf(). Returns
 * the number of strips.
 */
export function shopSpill(glow, buildings, origin, { reach = 5, strength = 0.3, up = POOL_UP_METERS } = {}) {
  let strips = 0;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  for (const building of buildings) {
    if (building.base > 0 || building.replaced || building.kind === 'station' || facadeOf(building) !== 'shops') continue;
    for (const polygon of building.polygons) {
      for (const wall of wallsOfRing(localRing(polygon[0], origin, squeeze, building.within))) {
        const [x0, y0] = wall.from;
        const [x1, y1] = wall.to;
        if (Math.hypot(x1 - x0, y1 - y0) < 2.5) continue;
        const ox = wall.east * reach;
        const oy = wall.north * reach;
        glow.room(6);
        glow.glow(x0, y0, up, SHOP_LIGHT[0], SHOP_LIGHT[1], SHOP_LIGHT[2], strength);
        glow.glow(x1, y1, up, SHOP_LIGHT[0], SHOP_LIGHT[1], SHOP_LIGHT[2], strength);
        glow.glow(x1 + ox, y1 + oy, up, SHOP_LIGHT[0], SHOP_LIGHT[1], SHOP_LIGHT[2], 0);
        glow.glow(x0, y0, up, SHOP_LIGHT[0], SHOP_LIGHT[1], SHOP_LIGHT[2], strength);
        glow.glow(x1 + ox, y1 + oy, up, SHOP_LIGHT[0], SHOP_LIGHT[1], SHOP_LIGHT[2], 0);
        glow.glow(x0 + ox, y0 + oy, up, SHOP_LIGHT[0], SHOP_LIGHT[1], SHOP_LIGHT[2], 0);
        strips += 1;
      }
    }
  }
  return strips;
}

/**
 * The lamps left on up on the roofs: by the door at the head of the stairs,
 * under an awning where people sit of an evening. A soft patch of warm
 * light on the roof round each of the points given, [x, y, height] in the
 * scene's metres (see drawRoofs in life.js for where they are). Fills a mesh
 * of light; returns how many.
 */
export function drawRoofLights(glow, points, radius = 3.2, strength = 0.42) {
  glow.clear();
  for (const [x, y, z] of points) disc(glow, x, y, z, radius, ROOF_LIGHT, strength, 8);
  return points.length;
}

/**
 * The red lamps on top of what is tall, for aircraft to see: one at each of
 * the points given, [x, y, height] in the scene's metres. Added to a mesh of
 * light, which is not emptied first. Returns how many.
 */
export function drawBeacons(glow, points, radius = 2) {
  for (const [x, y, z] of points) disc(glow, x, y, z, radius, BEACON, 1, 6);
  return points.length;
}

/**
 * Points of light, one at each of the places given ([x, y, height] in the
 * scene's metres), in one colour: added to a mesh of points of light, which
 * is not emptied first. Returns how many.
 */
export function lightPoints(points, places, colour = BEACON, strength = 1) {
  points.room(places.length);
  for (const [x, y, z] of places) points.glow(x, y, z, colour[0], colour[1], colour[2], strength);
  return places.length;
}

// A lamp to every so many metres of road in the tiles the map loads for what is near. The tiles it loads
// for the far part of a picture are coarser, a level at a time; in those the points stand twice as far
// apart for every level (seen along the ground they still close up).
const FAR_EVERY_METERS = 40;
const FAR_NEAR_LEVEL = 14;
const FAR_UP_METERS = 9; // as high as a lamp's head
const FAR_LIGHT = { motorway: 'big', trunk: 'big', primary: 'main', secondary: 'main', tertiary: 'side', minor: 'side', busway: 'side' };

/**
 * The lights of the city beyond where its lamps stand one by one: a point of
 * light every so many metres along the roads in every map tile that is
 * loaded, out to the horizon.
 *
 * points: a Mesh of points of light; it is emptied first.
 * lines: [{ class, tile: [level, column, row], coordinates: [[lng, lat], …] }],
 * the roads as the map has them, each cut to its own tile. Where the map has
 * a place in a finer tile as well as in a coarser one, the finer one counts.
 * origin: { lng, lat }, the place the scene measures from.
 * skip(x, y): whether a spot is among the lamps that stand one by one, and
 * needs no point. most: the most points.
 * Returns the number of points.
 */
export function drawFarLights(points, lines, origin, { skip = () => false, most = 40000 } = {}) {
  points.clear();
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  // Which tiles there are, level by level.
  const tiles = new Set();
  const levels = new Set();
  const nameOf = (level, column, row) => level * 4294967296 + column * 65536 + row;
  for (const line of lines) {
    if (!FAR_LIGHT[line.class] || !Array.isArray(line.tile)) continue;
    tiles.add(nameOf(line.tile[0], line.tile[1], line.tile[2]));
    levels.add(line.tile[0]);
  }
  const finest = [...levels].sort((a, b) => b - a);
  const inFiner = (level, lng, lat) => {
    const across = (lng + 180) / 360;
    const down = (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
    for (const finer of finest) {
      if (finer <= level) return false;
      const size = 2 ** finer;
      if (tiles.has(nameOf(finer, Math.floor(across * size), Math.floor(down * size)))) return true;
    }
    return false;
  };
  let count = 0;
  for (const line of lines) {
    const kind = FAR_LIGHT[line.class];
    if (!kind || !Array.isArray(line.tile) || !Array.isArray(line.coordinates) || line.coordinates.length < 2) continue;
    const level = line.tile[0];
    const every = FAR_EVERY_METERS * 2 ** Math.max(FAR_NEAR_LEVEL - level, 0);
    const colour = LIGHT[kind];
    const strength = kind === 'big' ? 0.95 : kind === 'main' ? 0.85 : 0.7;
    // Walk along the road, a point at every so many metres, starting half a step in.
    let left = every / 2;
    for (let i = 1; i < line.coordinates.length && count < most; i += 1) {
      const [lng0, lat0] = line.coordinates[i - 1];
      const [lng1, lat1] = line.coordinates[i];
      const x0 = (lng0 - origin.lng) * squeeze;
      const y0 = (lat0 - origin.lat) * METERS_PER_DEGREE;
      const dx = (lng1 - lng0) * squeeze;
      const dy = (lat1 - lat0) * METERS_PER_DEGREE;
      const span = Math.hypot(dx, dy);
      let at = left;
      while (at <= span && count < most) {
        const t = at / span;
        const x = x0 + dx * t;
        const y = y0 + dy * t;
        if (!skip(x, y) && !inFiner(level, lng0 + (lng1 - lng0) * t, lat0 + (lat1 - lat0) * t)) {
          points.room(1);
          points.glow(x, y, FAR_UP_METERS, colour[0], colour[1], colour[2], strength);
          count += 1;
        }
        at += every;
      }
      left = at - span;
    }
  }
  return count;
}
