// What stands along Riyadh's roads.
//
// The great roads of the city (King Fahd Road, the ring roads, Makkah Road)
// are built alike: four lanes each way, a concrete barrier down the middle
// with the lamp posts behind it, service roads alongside, and every
// kilometre or so a gantry across the carriageway carrying the green signs.
// The avenues between the districts have a raised median instead, its kerb
// painted yellow and black, planted with a row of date palms. None of this
// is on the map: it is stood by rule along the roads the map has, and only
// where there is room for it.
//
// Nothing here touches the browser. Measurements are in metres, east and
// north of the network's origin.

import { faceLight, nearestOn, pointAlong } from './life.js';

const BARRIER_ROADS = new Set(['motorway', 'trunk']);
const BARRIER_HALF_METERS = 0.28;
const BARRIER_TALL_METERS = 0.85;
const BARRIER_PAINT = [205, 203, 196];
const BARRIER_STEP_METERS = 14; // laid in lengths, so that it follows a bend
const GANTRY_ROADS = new Set(['motorway']);
const GANTRY_EVERY_METERS = 950;
const GANTRY_TALL_METERS = 7.4;
const GANTRY_PAINT = [150, 154, 160];
const SIGN_PAINT = [22, 104, 78]; // the green of the signs over a Saudi highway
const SIGN_LINE = [236, 238, 236];
const KERB_ROADS = new Set(['primary', 'secondary', 'tertiary']);
const KERB_HALF_METERS = 0.14;
const KERB_UP_METERS = 0.2;
const KERB_BLACK = [44, 44, 46];
const KERB_YELLOW = [236, 190, 44];
const KERB_STEP_METERS = 4; // two metres yellow, two black
const PALM_ROADS = new Set(['trunk', 'primary', 'secondary']);
const PALM_EVERY_METERS = 16;
const PALM_RADIUS_METERS = 2.3;
const MEDIAN_LEAST_METERS = 2.6; // a median narrower than this has no room for a palm
const MEDIAN_MOST_METERS = 26;
const FROM_END_METERS = 12;
const ROAD_SQUARE_METERS = 48;

/** Every road on the ground, filed under the squares of ground it passes through. */
function filed(network, reach) {
  const squares = new Map();
  const squareOf = (cellX, cellY) => (cellX + 32768) * 65536 + (cellY + 32768);
  for (const way of network.ways) {
    if (way.rail || way.hidden || way.deck > 0) continue;
    const out = way.width / 2 + reach;
    for (let cellX = Math.floor((way.box[0] - out) / ROAD_SQUARE_METERS); cellX <= Math.floor((way.box[2] + out) / ROAD_SQUARE_METERS); cellX += 1) {
      for (let cellY = Math.floor((way.box[1] - out) / ROAD_SQUARE_METERS); cellY <= Math.floor((way.box[3] + out) / ROAD_SQUARE_METERS); cellY += 1) {
        const key = squareOf(cellX, cellY);
        if (!squares.has(key)) squares.set(key, []);
        squares.get(key).push(way);
      }
    }
  }
  return (x, y) => squares.get(squareOf(Math.floor(x / ROAD_SQUARE_METERS), Math.floor(y / ROAD_SQUARE_METERS))) ?? [];
}

/** Which side of a one-way road its median is on: the left of its traffic. 1 for the left of the line as drawn. */
const medianSide = (way) => (way.oneway === 1 ? 1 : way.oneway === -1 ? -1 : 0);
const onGround = (way) => !way.rail && !way.hidden && !(way.deck > 0);

/**
 * Fill a mesh (see Mesh in life.js) with what stands along the roads: the
 * concrete barrier down the middle of a great road, the sign gantries over
 * a motorway, and the yellow-and-black kerb of an avenue's median. light:
 * the sun, as lightFrom() gives it, or null.
 * Returns { barriers (metres), gantries, kerbs (metres) }.
 */
export function drawRoadside(mesh, network, light) {
  mesh.clear();
  const made = { barriers: 0, gantries: 0, kerbs: 0 };
  const a = [0, 0, 0, 0];
  const b = [0, 0, 0, 0];
  const lit = (paint, east, north, up) => {
    const bright = faceLight(light, east, north, up);
    return [paint[0] * bright, paint[1] * bright, paint[2] * bright];
  };
  /** A box along a way from one distance to another, at an offset to the left of its middle. */
  const box = (way, from, to, across, half, low, high, paint) => {
    pointAlong(way, from, a);
    pointAlong(way, to, b);
    const corner = (p, offset) => [p[0] - p[3] * offset, p[1] + p[2] * offset];
    const [a0, a1, b0, b1] = [corner(a, across - half), corner(a, across + half), corner(b, across - half), corner(b, across + half)];
    const [leftEast, leftNorth] = [-a[3], a[2]];
    const right = lit(paint, -leftEast, -leftNorth, 0);
    const left = lit(paint, leftEast, leftNorth, 0);
    const top = lit(paint, 0, 0, 1);
    mesh.face([a0[0], a0[1], low], [b0[0], b0[1], low], [b0[0], b0[1], high], [a0[0], a0[1], high], right[0], right[1], right[2], 1);
    mesh.face([b1[0], b1[1], low], [a1[0], a1[1], low], [a1[0], a1[1], high], [b1[0], b1[1], high], left[0], left[1], left[2], 1);
    mesh.face([a0[0], a0[1], high], [b0[0], b0[1], high], [b1[0], b1[1], high], [a1[0], a1[1], high], top[0], top[1], top[2], 1);
  };

  network.ways.forEach((way, index) => {
    if (!onGround(way)) return;
    const side = medianSide(way);
    if (side === 0 || way.length < FROM_END_METERS * 2 + 6) return;
    const from = FROM_END_METERS;
    const to = way.length - FROM_END_METERS;
    if (BARRIER_ROADS.has(way.class)) {
      // The barrier: just beyond the edge of the carriageway, on the side of its median.
      const across = side * (way.width / 2 + 0.2 + BARRIER_HALF_METERS);
      for (let s = from; s < to; s += BARRIER_STEP_METERS) box(way, s, Math.min(s + BARRIER_STEP_METERS, to), across, BARRIER_HALF_METERS, 0, BARRIER_TALL_METERS, BARRIER_PAINT);
      made.barriers += to - from;
    }
    if (KERB_ROADS.has(way.class)) {
      // The kerb of the median: black, with a length of yellow every few metres.
      const across = side * (way.width / 2 + KERB_HALF_METERS);
      for (let s = from; s < to; s += KERB_STEP_METERS) {
        const until = Math.min(s + KERB_STEP_METERS, to);
        const half = Math.min(s + KERB_STEP_METERS / 2, until);
        box(way, s, half, across, KERB_HALF_METERS, 0, KERB_UP_METERS, KERB_YELLOW);
        if (until > half) box(way, half, until, across, KERB_HALF_METERS, 0, KERB_UP_METERS, KERB_BLACK);
      }
      made.kerbs += to - from;
    }
    if (GANTRY_ROADS.has(way.class) && way.length > 260) {
      // The gantries: the first a way along (no two roads alike), then one every kilometre or so.
      const first = 120 + ((index * 197) % 400);
      for (let s = first; s < way.length - 60; s += GANTRY_EVERY_METERS) {
        pointAlong(way, s, a);
        const [x, y, east, north] = a;
        const half = way.width / 2 + 1;
        // (Traffic runs along the line, or against it: the signs face the drivers coming.)
        const towards = way.oneway === 1 ? -1 : 1;
        const post = (offset) => {
          const px = x - north * offset;
          const py = y + east * offset;
          const h = 0.22;
          for (const [nAlong, nAcross] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nEast = east * nAlong - north * nAcross;
            const nNorth = north * nAlong + east * nAcross;
            const [r, g, bl] = lit(GANTRY_PAINT, nEast, nNorth, 0);
            const ax = px + nEast * h - nNorth * h;
            const ay = py + nNorth * h + nEast * h;
            const bx = px + nEast * h + nNorth * h;
            const by = py + nNorth * h - nEast * h;
            mesh.face([ax, ay, 0], [bx, by, 0], [bx, by, GANTRY_TALL_METERS], [ax, ay, GANTRY_TALL_METERS], r, g, bl, 1);
          }
        };
        post(half);
        post(-half);
        // The beam across, and the sign boards hung on it: one over each pair of lanes.
        const span = (offset0, offset1, low, high, paint, forward) => {
          const [r, g, bl] = lit(paint, east * forward, north * forward, 0);
          const lift = forward * 0.24;
          const p0 = [x - north * offset0 + east * lift, y + east * offset0 + north * lift];
          const p1 = [x - north * offset1 + east * lift, y + east * offset1 + north * lift];
          mesh.face([p0[0], p0[1], low], [p1[0], p1[1], low], [p1[0], p1[1], high], [p0[0], p0[1], high], r, g, bl, 1);
        };
        for (const forward of [1, -1]) span(-half, half, GANTRY_TALL_METERS - 0.7, GANTRY_TALL_METERS, GANTRY_PAINT, forward);
        const boards = Math.max(Math.round(way.width / 7), 1);
        for (let k = 0; k < boards; k += 1) {
          const left = -way.width / 2 + 0.6 + (k * (way.width - 1.2)) / boards;
          const right = left + (way.width - 1.2) / boards - 0.7;
          span(left, right, GANTRY_TALL_METERS - 2.9, GANTRY_TALL_METERS - 0.2, SIGN_PAINT, towards * 1.4);
          // (Two lines of writing on each: Arabic over English.)
          for (const [low, high] of [[GANTRY_TALL_METERS - 1.25, GANTRY_TALL_METERS - 0.85], [GANTRY_TALL_METERS - 2.2, GANTRY_TALL_METERS - 1.9]]) span(left + 0.5, right - 0.5, low, high, SIGN_LINE, towards * 1.6);
          span(left, right, GANTRY_TALL_METERS - 2.9, GANTRY_TALL_METERS - 0.2, GANTRY_PAINT, -towards * 1.4);
        }
        made.gantries += 1;
      }
    }
  });
  return made;
}

/**
 * Where the palms of the medians stand: along an avenue whose two
 * carriageways are mapped apart, down the middle of the strip between them,
 * one every sixteen metres. A palm is stood only where the other
 * carriageway really lies across the median, where the median is wide
 * enough, and where nothing is in the way: not on any road, not in a
 * building. built(x, y): whether a building stands at a spot.
 * Returns [{ x, y, radius, palm: true }].
 */
export function medianPalms(network, { built = null, most = 1500 } = {}) {
  const palms = [];
  const near = filed(network, MEDIAN_MOST_METERS);
  const spot = [0, 0, 0, 0];
  network.ways.forEach((way, index) => {
    if (palms.length >= most || !onGround(way) || !PALM_ROADS.has(way.class)) return;
    const side = medianSide(way);
    if (side === 0 || way.length < FROM_END_METERS * 2 + PALM_EVERY_METERS) return;
    for (let s = FROM_END_METERS + ((index * 7) % PALM_EVERY_METERS); s < way.length - FROM_END_METERS && palms.length < most; s += PALM_EVERY_METERS) {
      pointAlong(way, s, spot);
      const [x, y, east, north] = spot;
      // Out across the median: the nearest other carriageway that runs the other way.
      const outEast = -north * side;
      const outNorth = east * side;
      let other = null;
      let gap = Infinity;
      for (const candidate of near(x, y)) {
        if (candidate === way || candidate.class !== way.class || medianSide(candidate) === 0) continue;
        const found = nearestOn(candidate, x, y);
        if (found.distance > way.width / 2 + candidate.width / 2 + MEDIAN_MOST_METERS) continue;
        const there = pointAlong(candidate, found.along, [0, 0, 0, 0]);
        // It lies on the median's side, runs the other way, and its own median faces this road.
        const across = (there[0] - x) * outEast + (there[1] - y) * outNorth;
        const opposed = (there[2] * candidate.oneway) * (east * way.oneway) + (there[3] * candidate.oneway) * (north * way.oneway) < -0.8;
        if (!(across > 0) || !opposed || Math.abs((there[0] - x) * east + (there[1] - y) * north) > 6) continue;
        const between = found.distance - way.width / 2 - candidate.width / 2;
        if (between < gap) {
          gap = between;
          other = candidate;
        }
      }
      if (!other || gap < MEDIAN_LEAST_METERS || gap > MEDIAN_MOST_METERS) continue;
      // (One row to a median: stood from the carriageway that comes first in the network.)
      if (network.ways.indexOf(other) < index) continue;
      const px = x + outEast * (way.width / 2 + gap / 2);
      const py = y + outNorth * (way.width / 2 + gap / 2);
      if (built && built(px, py)) continue;
      // Not on any road at all: a turning lane, a U-turn through the median.
      let clear = true;
      for (const candidate of near(px, py)) {
        if (nearestOn(candidate, px, py).distance < candidate.width / 2 + 0.9) {
          clear = false;
          break;
        }
      }
      if (clear) palms.push({ x: px, y: py, radius: PALM_RADIUS_METERS, palm: true });
    }
  });
  return palms;
}
