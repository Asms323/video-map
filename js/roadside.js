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

import { faceLight, heightAlong, nearestOn, pointAlong, unitFrom } from './life.js';

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

/**
 * A whole number that is a road's own: the same whenever the same road is read from the map again,
 * wherever it then comes among the others. (What stands along a road by chance stands where it stood.)
 */
const ownNumber = (way) => Math.floor(unitFrom(way.key ?? '') * 1000003);

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
      const first = 120 + ((ownNumber(way) * 197) % 400);
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

// ── Signs and hoardings ───────────────────────────────────────────────────
//
// Saudi road signs are of the kind used across Europe and the Gulf: what is ordered stands in a circle
// (a speed limit is a white disc in a red ring), and the sign to stop is the red octagon, with the word
// in Arabic. And Riyadh's great roads are lined with advertising hoardings, each a wide board high up
// on a single post. Where any of these really stands, no map says: they are stood by rule. A speed
// limit every few hundred metres along a main road, on the right of the traffic it is for. A stop sign
// where a side street comes out into a greater road. A hoarding every half kilometre or so beside a
// great road, where there is room for it: not on a road, not in a building. What is on a hoarding is
// colours only: no name, no brand, nothing that is anybody's.
const LIMIT_ROADS = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
const LIMIT_EVERY_METERS = 420;
const LIMIT_FIRST_METERS = 45;
const STOP_ROADS = { minor: 0, tertiary: 1 };
const GREATER_THAN_STOP = { tertiary: 1, secondary: 2, primary: 3, trunk: 4, motorway: 5 };
const STOP_BEFORE_METERS = 2.5; // before the edge of the road that is come out into
const SIGN_FROM_KERB_METERS = 0.8;
const SIGN_UP_METERS = 2.35; // to the middle of the sign
const SIGN_RADIUS_METERS = 0.4;
const SIGN_POST_HALF_METERS = 0.045;
const SIGN_RED = [196, 30, 34];
const SIGN_WHITE = [240, 240, 236];
const SIGN_BLACK = [30, 30, 32];
const SIGN_BACK = [150, 153, 158];
const SIGN_POST = [158, 161, 166];
const HOARDING_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary']);
const HOARDING_EVERY_METERS = 540;
const HOARDING_FROM_KERB_METERS = 6;
const HOARDING_POST_METERS = 10.5;
const HOARDING_HALF_WIDE_METERS = 5;
const HOARDING_LOOK_ON_METERS = 180; // where there is no room for one, room is looked for this far further along
const HOARDING_LOOK_STEP_METERS = 30;
const HOARDING_TALL_METERS = 4;
const HOARDING_POST_HALF_METERS = 0.38;
const HOARDING_FRAME = [70, 74, 80];
/** What a hoarding shows: [its ground, a band across it, a block on it], for want of anything real. */
const HOARDING_ART = [
  [[226, 222, 210], [190, 44, 48], [34, 40, 52]],
  [[24, 60, 110], [236, 196, 60], [240, 240, 236]],
  [[236, 236, 232], [28, 122, 92], [214, 150, 40]],
  [[40, 42, 48], [226, 96, 36], [236, 232, 220]],
  [[232, 206, 150], [110, 44, 96], [250, 246, 236]],
  [[16, 110, 126], [240, 240, 236], [232, 72, 60]],
];
const HOARDING_GLOW = 0.5; // how strongly a hoarding is lit by night

/**
 * Fill a mesh with the signs that stand along the roads and the hoardings beside the great ones (see
 * above), and a mesh of light with the hoardings as they are lit by night. light: the sun, as
 * lightFrom() gives it, or null. built(x, y): whether a building stands at a spot; without it there
 * are no hoardings. Returns { limits, stops, hoardings }.
 */
export function drawSigns(mesh, lights, network, light, { built = null } = {}) {
  mesh.clear();
  lights?.clear();
  const made = { limits: 0, stops: 0, hoardings: 0 };
  const spot = [0, 0, 0, 0];
  const lit = (paint, east, north, up) => {
    const bright = faceLight(light, east, north, up);
    return [paint[0] * bright, paint[1] * bright, paint[2] * bright];
  };
  /** A post standing at a place: its four sides, of a half-width, from the ground to a height. */
  const post = (x, y, east, north, half, tall, paint) => {
    for (const [nAlong, nAcross] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nEast = east * nAlong - north * nAcross;
      const nNorth = north * nAlong + east * nAcross;
      const [r, g, bl] = lit(paint, nEast, nNorth, 0);
      const ax = x + nEast * half - nNorth * half;
      const ay = y + nNorth * half + nEast * half;
      const bx = x + nEast * half + nNorth * half;
      const by = y + nNorth * half - nEast * half;
      mesh.face([ax, ay, 0], [bx, by, 0], [bx, by, tall], [ax, ay, tall], r, g, bl, 1);
    }
  };
  /** A flat plate of eight sides that faces along (east, north): its middle, how far it stands out towards where it faces, its radius and its paint. */
  const plate = (x, y, z, east, north, out, radius, paint) => {
    const [r, g, bl] = lit(paint, east, north, 0);
    const [cx, cy] = [x + east * out, y + north * out];
    const at = (k) => {
      const angle = ((k + 0.5) * Math.PI) / 4;
      return [cx + north * Math.cos(angle) * radius, cy - east * Math.cos(angle) * radius, z + Math.sin(angle) * radius];
    };
    mesh.room(18);
    const first = at(0);
    for (let k = 1; k < 7; k += 1) {
      for (const corner of [first, at(k), at(k + 1)]) mesh.corner(corner[0], corner[1], corner[2], r, g, bl, 1);
    }
  };
  /** A flat upright bar on a sign that faces along (east, north): from one place across it and up it to another, in metres from its middle. */
  const bar = (x, y, z, east, north, out, across0, across1, up0, up1, paint) => {
    const [r, g, bl] = lit(paint, east, north, 0);
    const at = (across, up) => [x + east * out + north * across, y + north * out - east * across, z + up];
    mesh.face(at(across0, up0), at(across1, up0), at(across1, up1), at(across0, up1), r, g, bl, 1);
  };
  /** A sign on its post at the kerb, for traffic that drives along (east, north) and has the post on its right: 'limit' or 'stop'. */
  const sign = (x, y, east, north, kind) => {
    post(x, y, east, north, SIGN_POST_HALF_METERS, SIGN_UP_METERS + SIGN_RADIUS_METERS * 0.6, SIGN_POST);
    // (It faces the traffic that comes: against the way that traffic drives. Its back is bare metal.)
    const [fe, fn] = [-east, -north];
    plate(x, y, SIGN_UP_METERS, east, north, SIGN_POST_HALF_METERS + 0.01, SIGN_RADIUS_METERS, SIGN_BACK);
    plate(x, y, SIGN_UP_METERS, fe, fn, SIGN_POST_HALF_METERS + 0.01, SIGN_RADIUS_METERS, SIGN_RED);
    if (kind === 'limit') {
      plate(x, y, SIGN_UP_METERS, fe, fn, SIGN_POST_HALF_METERS + 0.02, SIGN_RADIUS_METERS * 0.74, SIGN_WHITE);
      // (Its number: two figures, too small to be read from where the map is seen.)
      bar(x, y, SIGN_UP_METERS, fe, fn, SIGN_POST_HALF_METERS + 0.03, -0.16, -0.03, -0.13, 0.13, SIGN_BLACK);
      bar(x, y, SIGN_UP_METERS, fe, fn, SIGN_POST_HALF_METERS + 0.03, 0.03, 0.16, -0.13, 0.13, SIGN_BLACK);
    } else {
      // (The word on it: a line of white.)
      bar(x, y, SIGN_UP_METERS, fe, fn, SIGN_POST_HALF_METERS + 0.02, -0.24, 0.24, -0.07, 0.07, SIGN_WHITE);
    }
  };
  const roads = built ? filed(network, 3) : null;

  network.ways.forEach((way, index) => {
    if (!onGround(way) || way.ramp) return;
    const own = ownNumber(way);
    // The ways traffic drives along it: with the line, against it, or both.
    const ways = way.oneway === 1 ? [1] : way.oneway === -1 ? [-1] : [1, -1];
    if (LIMIT_ROADS.has(way.class) && way.length > LIMIT_FIRST_METERS + 30) {
      for (const along of ways) {
        // (No two roads alike: the first stands a different way along each.)
        const first = LIMIT_FIRST_METERS + ((own * 131 + (along > 0 ? 0 : 211)) % LIMIT_EVERY_METERS);
        for (let s = first; s < way.length - 20; s += LIMIT_EVERY_METERS) {
          const at = along > 0 ? s : way.length - s;
          if (way.sunk && heightAlong(way, at) < -0.5) continue; // none down in a cutting
          pointAlong(way, at, spot);
          const [east, north] = [spot[2] * along, spot[3] * along];
          const out = way.width / 2 + SIGN_FROM_KERB_METERS;
          sign(spot[0] + north * out, spot[1] - east * out, east, north, 'limit');
          made.limits += 1;
        }
      }
    }
    if (STOP_ROADS[way.class] !== undefined) {
      for (const along of ways) {
        // Where its traffic comes out: into a road greater than itself?
        const meeting = network.joins.get(way.ends[along > 0 ? 1 : 0]) ?? [];
        const greater = meeting.filter((other) => other.way !== index && (GREATER_THAN_STOP[network.ways[other.way].class] ?? 0) > STOP_ROADS[way.class]);
        if (greater.length === 0) continue;
        // (The sign stands before the edge of the road that is come out into, not in it.)
        const before = Math.max(...greater.map((other) => network.ways[other.way].width / 2)) + STOP_BEFORE_METERS;
        if (way.length < before + 2) continue;
        pointAlong(way, along > 0 ? way.length - before : before, spot);
        const [east, north] = [spot[2] * along, spot[3] * along];
        const out = way.width / 2 + SIGN_FROM_KERB_METERS;
        sign(spot[0] + north * out, spot[1] - east * out, east, north, 'stop');
        made.stops += 1;
      }
    }
    if (roads && HOARDING_ROADS.has(way.class) && way.length > 120) {
      const first = 70 + ((own * 173) % HOARDING_EVERY_METERS);
      for (let from = first; from < way.length - 50; from += HOARDING_EVERY_METERS) {
        // Room for it: its post clear of every other road, and its post and both ends of its board clear of
        // every building. Where there is none, a little further along.
        let s = from;
        let x = 0;
        let y = 0;
        let east = 0;
        let north = 0;
        let room = false;
        for (; s <= from + HOARDING_LOOK_ON_METERS && s < way.length - 30 && !room; s += room ? 0 : HOARDING_LOOK_STEP_METERS) {
          if (way.sunk && heightAlong(way, s) < -0.5) continue;
          pointAlong(way, s, spot);
          // (On the right of a carriageway's traffic, away from its median; beside a road with traffic both ways, by turns on either side.)
          const side = way.oneway === 1 ? 1 : way.oneway === -1 ? -1 : (own + Math.floor(from / HOARDING_EVERY_METERS)) % 2 === 0 ? 1 : -1;
          [east, north] = [spot[2], spot[3]];
          const out = (way.width / 2 + HOARDING_FROM_KERB_METERS) * side;
          [x, y] = [spot[0] + north * out, spot[1] - east * out];
          const ends = [[x, y], [x + north * HOARDING_HALF_WIDE_METERS, y - east * HOARDING_HALF_WIDE_METERS], [x - north * HOARDING_HALF_WIDE_METERS, y + east * HOARDING_HALF_WIDE_METERS]];
          room = !ends.some(([px, py]) => built(px, py)) && !roads(x, y).some((other) => other !== way && nearestOn(other, x, y).distance < other.width / 2 + 2.5);
          if (room) break;
        }
        if (!room) continue;
        post(x, y, east, north, HOARDING_POST_HALF_METERS, HOARDING_POST_METERS, HOARDING_FRAME);
        // Its board: across the way the road runs, so that it is read from the road; a face each way.
        const [low, high] = [HOARDING_POST_METERS, HOARDING_POST_METERS + HOARDING_TALL_METERS];
        const art = HOARDING_ART[(own * 7 + Math.floor(s)) % HOARDING_ART.length];
        const corner = (across, z, ahead) => [x + north * across + east * ahead, y - east * across + north * ahead, z];
        for (const facing of [1, -1]) {
          const ahead = facing * 0.25;
          const face = (across0, across1, z0, z1, paint, proud) => {
            const [r, g, bl] = lit(paint, east * facing, north * facing, 0);
            const d = ahead + facing * proud;
            mesh.face(corner(across0, z0, d), corner(across1, z0, d), corner(across1, z1, d), corner(across0, z1, d), r, g, bl, 1);
            if (lights && proud > 0) {
              lights.room(6);
              for (const [across, z] of [[across0, z0], [across1, z0], [across1, z1], [across0, z0], [across1, z1], [across0, z1]]) {
                const [gx, gy, gz] = corner(across, z, d + facing * 0.02);
                lights.glow(gx, gy, gz, paint[0], paint[1], paint[2], HOARDING_GLOW);
              }
            }
          };
          const w = HOARDING_HALF_WIDE_METERS;
          face(-w, w, low, high, HOARDING_FRAME, 0);
          face(-w + 0.25, w - 0.25, low + 0.25, high - 0.25, art[0], 0.02);
          // (A band across it and a block on it: which side of the board each is on turns with the face.)
          face(-w + 0.25, w - 0.25, low + 0.7, low + 1.5, art[1], 0.04);
          face(facing * (w - 4.4), facing * (w - 1.2), low + 2.0, high - 0.7, art[2], 0.04);
        }
        // Its edges: top and bottom, and the two ends.
        const [topR, topG, topB] = lit(HOARDING_FRAME, 0, 0, 1);
        const w = HOARDING_HALF_WIDE_METERS;
        mesh.face(corner(-w, high, -0.25), corner(w, high, -0.25), corner(w, high, 0.25), corner(-w, high, 0.25), topR, topG, topB, 1);
        for (const end of [-1, 1]) {
          const [r, g, bl] = lit(HOARDING_FRAME, north * end, -east * end, 0);
          mesh.face(corner(w * end, low, -0.25), corner(w * end, low, 0.25), corner(w * end, high, 0.25), corner(w * end, high, -0.25), r, g, bl, 1);
        }
        made.hoardings += 1;
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
// A skywalk: one of the glazed bridges that join the towers of the financial district, three storeys up.
// It is wider and taller than a footbridge over a road, glazed from its floor to its roof in a white
// frame, and ends in the buildings it joins: it has no towers of its own.
const SKYWALK_HALF_METERS = 2.5;
const SKYWALK_UP_METERS = 14;
const SKYWALK_ROOF_METERS = 4.4;
const SKYWALK_RAIL_METERS = 0.45;
const SKYWALK_PIER_EVERY_METERS = 34;
const SKYWALK_PIER_HALF_METERS = 0.6;
const SKYWALK_PAINT = [238, 238, 234];
const SKYWALK_GLASS = [96, 138, 166];

/**
 * Fill a mesh (see Mesh in life.js) with the footbridges over the roads.
 *
 * walks: [{ coordinates: [[lng, lat], …], sky }], the footpaths the map marks
 * as bridges (a bridge that crosses the edge of a map tile comes in two
 * lengths, which meet end to end); sky: true for a skywalk between towers
 * (see above): higher, wider, glazed all the way up, without towers. network: the roads, as buildNetwork()
 * gives them, so that no pier is stood in a carriageway (or null). origin:
 * { lng, lat }. light: the sun, as lightFrom() gives it.
 *
 * Each has a floor 5.9 m up, solid sides a metre high with glazing above
 * them, a roof, a pier every so often where there is ground to stand one
 * on, and a tower at each of its ends. Returns { bridges (lengths), metres,
 * towers, piers, sky (how many of the lengths are skywalks) }.
 */
export function drawFootbridges(mesh, walks, network, origin, light) {
  mesh.clear();
  const made = { bridges: 0, metres: 0, towers: 0, piers: 0, sky: 0 };
  if (!walks || walks.length === 0 || !origin) return made;
  const squeeze = Math.cos((origin.lat * Math.PI) / 180) * 111320;
  const lines = walks
    .map((walk) => ({ sky: Boolean(walk.sky), xy: walk.coordinates.map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * 111320]) }))
    .filter(({ xy }) => xy.length >= 2 && Math.hypot(xy[xy.length - 1][0] - xy[0][0], xy[xy.length - 1][1] - xy[0][1]) > 3);
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
  const ends = lines.flatMap(({ xy }, line) => [{ at: xy[0], line }, { at: xy[xy.length - 1], line }]);
  const free = (at, line) => !ends.some((end) => end.line !== line && Math.hypot(end.at[0] - at[0], end.at[1] - at[1]) < WALK_JOIN_METERS);

  lines.forEach(({ xy, sky }, line) => {
    made.bridges += 1;
    if (sky) made.sky += 1;
    const half = sky ? SKYWALK_HALF_METERS : WALK_HALF_METERS;
    const floor = sky ? SKYWALK_UP_METERS : WALK_UP_METERS;
    const top = floor + (sky ? SKYWALK_ROOF_METERS : WALK_ROOF_METERS);
    const rail = sky ? SKYWALK_RAIL_METERS : WALK_RAIL_METERS;
    const paint = sky ? SKYWALK_PAINT : WALK_PAINT;
    const pierEvery = sky ? SKYWALK_PIER_EVERY_METERS : WALK_PIER_EVERY_METERS;
    const pierHalf = sky ? SKYWALK_PIER_HALF_METERS : WALK_PIER_HALF_METERS;
    let along = 0;
    let nextPier = pierEvery / 2;
    for (let i = 1; i < xy.length; i += 1) {
      const a = xy[i - 1];
      const b = xy[i];
      const long = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!(long > 0.05)) continue;
      // The walkway: its floor, its two solid sides, the glazing over them, and its roof.
      box(a, b, 0, half, floor - WALK_THICK_METERS, floor, paint);
      for (const side of [1, -1]) {
        box(a, b, side * (half - 0.08), 0.08, floor, floor + rail, paint);
        box(a, b, side * (half - 0.08), 0.03, floor + rail, top, sky ? SKYWALK_GLASS : WALK_GLASS, sky ? 0.72 : WALK_GLASS_SOLID);
      }
      box(a, b, 0, half + WALK_ROOF_OUT_METERS, top, top + (sky ? 0.4 : 0.16), sky ? SKYWALK_PAINT : WALK_ROOF_PAINT);
      // Its piers: one every so often, moved along a little where it would stand in a road, left out where it cannot be.
      while (nextPier < along + long) {
        for (const shift of [0, 4, -4, 8, -8]) {
          const s = nextPier - along + shift;
          if (s < 0.5 || s > long - 0.5) continue;
          const [x, y] = [a[0] + ((b[0] - a[0]) * s) / long, a[1] + ((b[1] - a[1]) * s) / long];
          if (onRoad(x, y)) continue;
          const [east, north] = [(b[0] - a[0]) / long, (b[1] - a[1]) / long];
          box([x - east * pierHalf, y - north * pierHalf], [x + east * pierHalf, y + north * pierHalf], 0, pierHalf, 0, floor - WALK_THICK_METERS, paint);
          made.piers += 1;
          break;
        }
        nextPier += pierEvery;
      }
      along += long;
    }
    made.metres += along;
    // A tower at each end that is an end: the stairs and the lift, as tall as the walkway's roof.
    for (const [at, towards] of [[xy[0], xy[1]], [xy[xy.length - 1], xy[xy.length - 2]]]) {
      if (sky || !free(at, line)) continue; // (a skywalk ends in the buildings it joins)
      const long = Math.hypot(at[0] - towards[0], at[1] - towards[1]) || 1;
      const [east, north] = [(at[0] - towards[0]) / long, (at[1] - towards[1]) / long];
      // (It stands beyond the end of the walkway, on the ground the bridge comes down to.)
      box([at[0] - east * 0.3, at[1] - north * 0.3], [at[0] + east * WALK_TOWER_LONG_METERS, at[1] + north * WALK_TOWER_LONG_METERS], 0, WALK_TOWER_WIDE_METERS / 2, 0, top + 0.5, WALK_TOWER_PAINT);
      made.towers += 1;
    }
  });
  return made;
}
