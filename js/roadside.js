// What stands along Riyadh's roads.
//
// The great roads of the city (King Fahd Road, the ring roads, Makkah Road)
// are built alike: four lanes each way, a concrete barrier down the middle
// with the lamp posts behind it, service roads alongside, and every
// kilometre or so a gantry across the carriageway carrying the green signs.
// The avenues between the districts have a raised median instead, its kerb
// painted yellow and black, planted with a row of date palms; and where a
// great road has a wide median of its own (King Fahd Road through Al Olaya),
// that is planted too, two rows deep. None of this
// is on the map: it is stood by rule along the roads the map has, and only
// where there is room for it.
//
// Nothing here touches the browser. Measurements are in metres, east and
// north of the network's origin.

import { faceLight, heightAlong, nearestOn, pointAlong } from './life.js';

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
const PALM_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary']);
const PALM_EVERY_METERS = 16;
const GREAT_PALM_EVERY_METERS = 9; // down the middle of a great road they stand closer, and two abreast where there is room
const TWO_ROWS_FROM_METERS = 7;
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
    // (A slip road has neither barrier nor median: it is one side of nothing.)
    if (BARRIER_ROADS.has(way.class) && !way.ramp) {
      // The barrier: just beyond the edge of the carriageway, on the side of its median.
      const across = side * (way.width / 2 + 0.2 + BARRIER_HALF_METERS);
      for (let s = from; s < to; s += BARRIER_STEP_METERS) {
        const until = Math.min(s + BARRIER_STEP_METERS, to);
        // (In a cutting the barrier stands down on the road.)
        const floor = way.sunk ? heightAlong(way, (s + until) / 2) : 0;
        box(way, s, until, across, BARRIER_HALF_METERS, floor, floor + BARRIER_TALL_METERS, BARRIER_PAINT);
      }
      made.barriers += to - from;
    }
    if (KERB_ROADS.has(way.class) && !way.ramp) {
      // The kerb of the median: black, with a length of yellow every few metres.
      const across = side * (way.width / 2 + KERB_HALF_METERS);
      for (let s = from; s < to; s += KERB_STEP_METERS) {
        const until = Math.min(s + KERB_STEP_METERS, to);
        const half = Math.min(s + KERB_STEP_METERS / 2, until);
        // (Where the avenue dives under a crossing, its kerb goes down with it.)
        const floor = way.sunk ? heightAlong(way, (s + until) / 2) : 0;
        box(way, s, half, across, KERB_HALF_METERS, floor, floor + KERB_UP_METERS, KERB_YELLOW);
        if (until > half) box(way, half, until, across, KERB_HALF_METERS, floor, floor + KERB_UP_METERS, KERB_BLACK);
      }
      made.kerbs += to - from;
    }
    if (GANTRY_ROADS.has(way.class) && !way.ramp && way.length > 260) {
      // The gantries: the first a way along (no two roads alike), then one every kilometre or so.
      const first = 120 + ((index * 197) % 400);
      for (let s = first; s < way.length - 60; s += GANTRY_EVERY_METERS) {
        if (way.sunk && heightAlong(way, s) < -0.5) continue; // none down in a cutting
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
    const every = way.class === 'motorway' ? GREAT_PALM_EVERY_METERS : PALM_EVERY_METERS;
    if (side === 0 || way.length < FROM_END_METERS * 2 + every) return;
    for (let s = FROM_END_METERS + ((index * 7) % every); s < way.length - FROM_END_METERS && palms.length < most; s += every) {
      if (way.sunk && heightAlong(way, s) < -0.3) continue; // the median of a cutting is down in it
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
      // (Down the wide median of a great road, two rows of them.)
      const rows = way.class === 'motorway' && gap >= TWO_ROWS_FROM_METERS ? [-gap / 5, gap / 5] : [0];
      for (const row of rows) {
        const px = x + outEast * (way.width / 2 + gap / 2 + row);
        const py = y + outNorth * (way.width / 2 + gap / 2 + row);
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
    }
  });
  return palms;
}

// ── The footbridges ──
//
// Nobody crosses one of Riyadh's great roads on foot at street level: there
// is a footbridge every so often instead, a roofed and glazed walkway some
// six metres up, with a tower at each end for its stairs and its lift (the
// bus stations in the middle of the avenues are reached the same way). The
// street map has them, as footpaths marked as bridges; what one looks like
// is set down here.
const WALK_HALF_METERS = 1.7; // half the width of the walkway
const WALK_UP_METERS = 5.9; // from the road to the floor of the walkway
const WALK_THICK_METERS = 0.55;
const WALK_RAIL_METERS = 1.1; // its solid sides, up to where the glazing begins
const WALK_ROOF_METERS = 2.75; // from its floor to its roof
const WALK_ROOF_OUT_METERS = 0.3; // how far the roof stands out past the sides
const WALK_PIER_EVERY_METERS = 27;
const WALK_PIER_HALF_METERS = 0.4;
const WALK_TOWER_LONG_METERS = 4.4; // a tower: along the walkway, and across it
const WALK_TOWER_WIDE_METERS = 5.4;
const WALK_JOIN_METERS = 2.5; // two lengths of walkway that end this close together are one
const WALK_PAINT = [226, 223, 216];
const WALK_ROOF_PAINT = [186, 191, 197];
const WALK_GLASS = [112, 146, 164];
const WALK_GLASS_SOLID = 0.5;
const WALK_TOWER_PAINT = [214, 209, 198];

/**
 * Fill a mesh (see Mesh in life.js) with the footbridges over the roads.
 *
 * walks: [{ coordinates: [[lng, lat], …] }], the footpaths the map marks as
 * bridges (a bridge that crosses the edge of a map tile comes in two
 * lengths, which meet end to end). network: the roads, as buildNetwork()
 * gives them, so that no pier is stood in a carriageway (or null). origin:
 * { lng, lat }. light: the sun, as lightFrom() gives it.
 *
 * Each has a floor 5.9 m up, solid sides a metre high with glazing above
 * them, a roof, a pier every so often where there is ground to stand one
 * on, and a tower at each of its ends. Returns { bridges (lengths), metres,
 * towers, piers }.
 */
export function drawFootbridges(mesh, walks, network, origin, light) {
  mesh.clear();
  const made = { bridges: 0, metres: 0, towers: 0, piers: 0 };
  if (!walks || walks.length === 0 || !origin) return made;
  const squeeze = Math.cos((origin.lat * Math.PI) / 180) * 111320;
  const lines = walks
    .map((walk) => walk.coordinates.map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * 111320]))
    .filter((xy) => xy.length >= 2 && Math.hypot(xy[xy.length - 1][0] - xy[0][0], xy[xy.length - 1][1] - xy[0][1]) > 3);
  if (lines.length === 0) return made;
  const near = network ? filed(network, 2) : () => [];
  const onRoad = (x, y) => near(x, y).some((way) => nearestOn(way, x, y).distance < way.width / 2 + 0.8);
  const lit = (paint, east, north, up) => {
    const bright = faceLight(light, east, north, up);
    return [paint[0] * bright, paint[1] * bright, paint[2] * bright];
  };
  /** A box along a stretch from a to b: so far to the left of it, so wide, from so high to so high. */
  const box = (a, b, across, half, low, high, paint, solid = 1) => {
    const long = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [east, north] = [(b[0] - a[0]) / long, (b[1] - a[1]) / long];
    const corner = (p, offset) => [p[0] - north * offset, p[1] + east * offset];
    const [a0, a1, b0, b1] = [corner(a, across - half), corner(a, across + half), corner(b, across - half), corner(b, across + half)];
    const right = lit(paint, north, -east, 0);
    const left = lit(paint, -north, east, 0);
    const top = lit(paint, 0, 0, 1);
    const under = lit(paint, 0, 0, -1);
    const ahead = lit(paint, east, north, 0);
    const behind = lit(paint, -east, -north, 0);
    mesh.face([a0[0], a0[1], low], [b0[0], b0[1], low], [b0[0], b0[1], high], [a0[0], a0[1], high], right[0], right[1], right[2], solid);
    mesh.face([b1[0], b1[1], low], [a1[0], a1[1], low], [a1[0], a1[1], high], [b1[0], b1[1], high], left[0], left[1], left[2], solid);
    mesh.face([a0[0], a0[1], high], [b0[0], b0[1], high], [b1[0], b1[1], high], [a1[0], a1[1], high], top[0], top[1], top[2], solid);
    if (low > 0.01) mesh.face([a0[0], a0[1], low], [a1[0], a1[1], low], [b1[0], b1[1], low], [b0[0], b0[1], low], under[0], under[1], under[2], solid);
    mesh.face([b0[0], b0[1], low], [b1[0], b1[1], low], [b1[0], b1[1], high], [b0[0], b0[1], high], ahead[0], ahead[1], ahead[2], solid);
    mesh.face([a1[0], a1[1], low], [a0[0], a0[1], low], [a0[0], a0[1], high], [a1[0], a1[1], high], behind[0], behind[1], behind[2], solid);
  };
  // Where each length ends: one that ends where another does carries on as it, and has no tower there.
  const ends = lines.flatMap((xy, line) => [{ at: xy[0], line }, { at: xy[xy.length - 1], line }]);
  const free = (at, line) => !ends.some((end) => end.line !== line && Math.hypot(end.at[0] - at[0], end.at[1] - at[1]) < WALK_JOIN_METERS);
  const floor = WALK_UP_METERS;
  const top = floor + WALK_ROOF_METERS;

  lines.forEach((xy, line) => {
    made.bridges += 1;
    let along = 0;
    let nextPier = WALK_PIER_EVERY_METERS / 2;
    for (let i = 1; i < xy.length; i += 1) {
      const a = xy[i - 1];
      const b = xy[i];
      const long = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!(long > 0.05)) continue;
      // The walkway: its floor, its two solid sides, the glazing over them, and its roof.
      box(a, b, 0, WALK_HALF_METERS, floor - WALK_THICK_METERS, floor, WALK_PAINT);
      for (const side of [1, -1]) {
        box(a, b, side * (WALK_HALF_METERS - 0.08), 0.08, floor, floor + WALK_RAIL_METERS, WALK_PAINT);
        box(a, b, side * (WALK_HALF_METERS - 0.08), 0.03, floor + WALK_RAIL_METERS, top, WALK_GLASS, WALK_GLASS_SOLID);
      }
      box(a, b, 0, WALK_HALF_METERS + WALK_ROOF_OUT_METERS, top, top + 0.16, WALK_ROOF_PAINT);
      // Its piers: one every so often, moved along a little where it would stand in a road, left out where it cannot be.
      while (nextPier < along + long) {
        for (const shift of [0, 4, -4, 8, -8]) {
          const s = nextPier - along + shift;
          if (s < 0.5 || s > long - 0.5) continue;
          const [x, y] = [a[0] + ((b[0] - a[0]) * s) / long, a[1] + ((b[1] - a[1]) * s) / long];
          if (onRoad(x, y)) continue;
          const [east, north] = [(b[0] - a[0]) / long, (b[1] - a[1]) / long];
          box([x - east * WALK_PIER_HALF_METERS, y - north * WALK_PIER_HALF_METERS], [x + east * WALK_PIER_HALF_METERS, y + north * WALK_PIER_HALF_METERS], 0, WALK_PIER_HALF_METERS, 0, floor - WALK_THICK_METERS, WALK_PAINT);
          made.piers += 1;
          break;
        }
        nextPier += WALK_PIER_EVERY_METERS;
      }
      along += long;
    }
    made.metres += along;
    // A tower at each end that is an end: the stairs and the lift, as tall as the walkway's roof.
    for (const [at, towards] of [[xy[0], xy[1]], [xy[xy.length - 1], xy[xy.length - 2]]]) {
      if (!free(at, line)) continue;
      const long = Math.hypot(at[0] - towards[0], at[1] - towards[1]) || 1;
      const [east, north] = [(at[0] - towards[0]) / long, (at[1] - towards[1]) / long];
      // (It stands beyond the end of the walkway, on the ground the bridge comes down to.)
      box([at[0] - east * 0.3, at[1] - north * 0.3], [at[0] + east * WALK_TOWER_LONG_METERS, at[1] + north * WALK_TOWER_LONG_METERS], 0, WALK_TOWER_WIDE_METERS / 2, 0, top + 0.5, WALK_TOWER_PAINT);
      made.towers += 1;
    }
  });
  return made;
}
