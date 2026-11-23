// The moving life of the 3D city: cars, buses and trains that travel the real
// streets and tracks of the map. It is a model railway, not a traffic report:
// the roads, rails, lanes and directions are real, where each vehicle is at
// any moment is made up.
//
// Nothing here touches the browser. Positions are in metres east and north of
// an origin, so the numbers stay small.

import { shadeOnRoof } from './roofs.js';

import { sinkWays, sunkAlong } from './cuttings.js';

const METERS_PER_DEGREE = 111320;
const LANE_METERS = 3.4;
const NARROW_LANE_METERS = 2; // on a residential street, where cars are parked along both sides

// Bridges. The map says which stretches are on a bridge, and gives each a
// number for its level; how high that is, it does not say. The numbers only
// tell which of two bridges passes over the other (a viaduct numbered 3 from
// end to end is not three bridges up), so a bridge is taken to be on the
// first level unless it passes over another bridge: see stackBridges(). A
// road deck on the first level is taken to be 6.5 m up and a railway viaduct
// 8.5 m, each level above the first another 5.5 m, and where a bridge meets
// the ground it comes down in a ramp.
const ROAD_DECK_METERS = 6.5;
const RAIL_DECK_METERS = 8.5;
const DECK_ABOVE_DECK_METERS = 5.5;
const BRIDGE_RAMP_METERS = 90;
const DECK_THICK_METERS = 1.4;
export const PARAPET_METERS = 0.9;
const RAIL_DECK_HALF_METERS = 2.7;
const PIER_EVERY_METERS = 30;
const BRIDGE_SQUARE_METERS = 96; // bridges are filed under squares of ground this wide, to find which pass over which
const BRIDGES_MEET_METERS = 3; // decks whose middle lines come this close share ground: one is over the other
const TRACK_BED_HALF_METERS = 2.3; // a track on the ground: its bed of ballast, and the rails down its middle
const TRACK_UP_METERS = 0.16; // just clear of the shadows the map lays on the ground

/** How far apart two stretches of line come at their nearest: 0 where they cross. Each is [x0, y0, x1, y1]. */
function stretchesApart(a, b) {
  const side = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = side(b[0], b[1], b[2], b[3], a[0], a[1]);
  const d2 = side(b[0], b[1], b[2], b[3], a[2], a[3]);
  const d3 = side(a[0], a[1], a[2], a[3], b[0], b[1]);
  const d4 = side(a[0], a[1], a[2], a[3], b[2], b[3]);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  const toStretch = (px, py, [x0, y0, x1, y1]) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.min(Math.max(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1), 0), 1);
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  };
  return Math.min(toStretch(a[0], a[1], b), toStretch(a[2], a[3], b), toStretch(b[0], b[1], a), toStretch(b[2], b[3], a));
}

/**
 * Work out on which level each bridge really is, and put that in place of
 * the number the map gave it. A bridge is on the first level, unless it
 * passes over another bridge: one it crosses, or runs along above, and has
 * the higher number of the two. Then it is one level above that one.
 */
function stackBridges(drafts) {
  const bridges = drafts.filter((draft) => draft.level > 0);
  if (bridges.length === 0) return;
  // Every stretch of every bridge, filed under the squares of ground it passes through.
  const squares = new Map();
  const squareOf = (cellX, cellY) => (cellX + 32768) * 65536 + (cellY + 32768);
  const stretchesOf = (draft) => {
    const out = [];
    for (let k = 1; k < draft.xy.length / 2; k += 1) out.push([draft.xy[k * 2 - 2], draft.xy[k * 2 - 1], draft.xy[k * 2], draft.xy[k * 2 + 1]]);
    return out;
  };
  const squaresOf = (stretch, visit) => {
    const reach = BRIDGES_MEET_METERS;
    for (let cellX = Math.floor((Math.min(stretch[0], stretch[2]) - reach) / BRIDGE_SQUARE_METERS); cellX <= Math.floor((Math.max(stretch[0], stretch[2]) + reach) / BRIDGE_SQUARE_METERS); cellX += 1) {
      for (let cellY = Math.floor((Math.min(stretch[1], stretch[3]) - reach) / BRIDGE_SQUARE_METERS); cellY <= Math.floor((Math.max(stretch[1], stretch[3]) + reach) / BRIDGE_SQUARE_METERS); cellY += 1) visit(squareOf(cellX, cellY));
    }
  };
  bridges.forEach((draft, index) => {
    for (const stretch of stretchesOf(draft)) {
      squaresOf(stretch, (key) => {
        if (!squares.has(key)) squares.set(key, []);
        squares.get(key).push({ index, stretch });
      });
    }
  });
  // From the lowest number up: by the time a bridge is looked at, all that it could pass over have their level.
  const numbered = bridges.map((draft) => draft.level);
  const level = new Array(bridges.length).fill(1);
  const order = bridges.map((_, index) => index).sort((a, b) => numbered[a] - numbered[b]);
  for (const index of order) {
    for (const stretch of stretchesOf(bridges[index])) {
      squaresOf(stretch, (key) => {
        for (const other of squares.get(key) ?? []) {
          if (numbered[other.index] >= numbered[index] || level[other.index] < level[index]) continue;
          if (stretchesApart(stretch, other.stretch) <= BRIDGES_MEET_METERS) level[index] = level[other.index] + 1;
        }
      });
    }
  }
  bridges.forEach((draft, index) => {
    draft.level = level[index];
  });
}

/**
 * How high above the ground a way runs at a distance along it, in metres: 0
 * except on a bridge, and less than nothing where a great road runs in a
 * cutting (see cuttings.js).
 */
export function heightAlong(way, distance) {
  if (!(way.deck > 0)) return way.sunk ? -sunkAlong(way, distance) : 0;
  const run = Math.min(BRIDGE_RAMP_METERS, way.length * 0.45);
  const ease = (t) => {
    const k = Math.min(Math.max(t, 0), 1);
    return k * k * (3 - 2 * k);
  };
  const fromStart = way.rise[0] + (way.deck - way.rise[0]) * ease(distance / run);
  const fromEnd = way.rise[1] + (way.deck - way.rise[1]) * ease((way.length - distance) / run);
  return Math.min(fromStart, fromEnd);
}

/** How many lanes a way has for one direction of traffic. */
const lanesOf = (way) => (way.oneway === 0 ? Math.max(way.lanes - 1, 1) : way.lanes);

/**
 * How far to the right of a way's middle line a lane runs, in metres. Right-hand
 * traffic: a two-way road keeps its lanes to the right of the middle line.
 */
function laneOffset(way, lane) {
  if (way.oneway !== 0) return (lane - (way.lanes - 1) / 2) * LANE_METERS;
  return (lane + 0.5) * (way.class === 'minor' ? NARROW_LANE_METERS : LANE_METERS);
}

/** Random numbers that repeat for the same seed, so traffic can be tested. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How each kind of road is driven: lanes in one direction, usual speed in
// metres a second, and vehicles per kilometre of one direction when traffic is
// normal.
// (Riyadh's great roads are full for most of the day: most of the traffic is put on them.)
const ROADS = {
  // (The great roads are the busy ones: King Fahd Road is full from wall to wall at either end of the working day.)
  motorway: { lanes: 4, speed: 27, perKm: 96 },
  trunk: { lanes: 3, speed: 22, perKm: 70 },
  primary: { lanes: 2, speed: 16, perKm: 38 },
  secondary: { lanes: 2, speed: 13, perKm: 22 },
  tertiary: { lanes: 1, speed: 11, perKm: 11 },
  minor: { lanes: 1, speed: 8, perKm: 3 },
  busway: { lanes: 1, speed: 12, perKm: 0 },
  service: { lanes: 1, speed: 5, perKm: 0.8 },
};
// Buses run only along streets that have a bus stop on the map, and on along
// the same street for a way either side of each stop. One that strays further
// than BUS_ASTRAY_METERS from them is taken off the road.
const BUS_ROADS = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'minor', 'busway']);
const BUS_STOP_REACH_METERS = 35;
const BUS_RUNS_ON_METERS = 1200;
const BUS_ASTRAY_METERS = 700;
const STATION_REACH_METERS = 70;
const JUNCTION_REACH_METERS = 2; // a line's end this close to another line meets it
const JUNCTION_CELL_METERS = 64;
const JOIN_REACH_METERS = 2.5; // road ends this close together are one junction
const RAIL_JOIN_REACH_METERS = 1.5; // tracks lie side by side only a few metres apart
const RAILS = new Set(['rail', 'transit']);

// Vehicles as stacks of boxes. Each box: [from, to] along the length (0 rear,
// 1 front), share of the width, bottom and top in metres, and what it is made of.
// Each vehicle is a few boxes: [from, to, share, bottom, top, material, lean]. from and to are how far
// along the vehicle the box runs (0 its rear, 1 its front), share how much of the width it takes, bottom
// and top its height in metres. lean, for a cabin: how far its rear, its front and its sides draw in
// towards the roof (as parts of the vehicle's length and of the box's width), which gives it a sloping
// windscreen; such a cabin is glass all round under a roof in the body's paint.
export const VEHICLES = {
  car: { length: 4.5, width: 1.8, boxes: [[0.04, 0.96, 0.94, 0.02, 0.3, 'tyre'], [0, 1, 1, 0.26, 0.84, 'body'], [0.2, 0.8, 0.92, 0.84, 1.42, 'glass', [0.1, 0.15, 0.16]]] },
  suv: { length: 4.9, width: 1.95, boxes: [[0.04, 0.96, 0.94, 0.02, 0.36, 'tyre'], [0, 1, 1, 0.32, 1.02, 'body'], [0.1, 0.8, 0.92, 1.02, 1.74, 'glass', [0.03, 0.13, 0.1]]] },
  van: { length: 5.3, width: 2.0, boxes: [[0, 1, 1, 0.3, 1.15, 'body'], [0.02, 0.9, 0.94, 1.15, 1.95, 'body'], [0.72, 0.93, 0.95, 1.2, 1.8, 'glass']] },
  truck: { length: 9, width: 2.5, boxes: [[0, 0.74, 1, 0.9, 3.4, 'cargo'], [0.78, 1, 0.96, 0.5, 2.6, 'body'], [0.9, 1.0, 0.97, 1.5, 2.3, 'glass']] },
  bus: { length: 12, width: 2.55, boxes: [[0, 1, 1, 0.35, 1.3, 'body'], [0.01, 0.99, 0.97, 1.3, 2.5, 'glass'], [0, 1, 1, 2.5, 3.1, 'body']] },
  coach: { length: 20, width: 2.9, boxes: [[0, 1, 1, 0.5, 1.6, 'body'], [0.02, 0.98, 0.97, 1.6, 2.9, 'glass'], [0, 1, 1, 2.9, 3.6, 'body'], [0.08, 0.92, 0.42, 3.6, 3.9, 'cargo']] },
};

// Paint, as [red, green, blue]. Cars: what is common on the road, most common first.
const CAR_PAINT = [
  [238, 238, 234], [238, 238, 234], [238, 238, 234], [238, 238, 234], [205, 208, 212], [205, 208, 212],
  [150, 155, 162], [40, 42, 48], [40, 42, 48], [196, 180, 150], [150, 34, 40], [38, 70, 130], [226, 226, 222],
];
const BUS_PAINT = [[24, 150, 140], [30, 118, 190], [226, 150, 30]];
const CARGO_PAINT = [[232, 232, 228], [210, 205, 190], [190, 196, 204]];
const TRAIN_PAINT = [[240, 242, 244], [132, 142, 156]];
export const GLASS = [48, 62, 82];
const TYRE = [30, 31, 35];
const HEADLIGHTS = [250, 244, 226];
const TAIL_LIGHTS = [150, 30, 30];
const VEHICLE_SHADE_LONGEST = 2.5; // a vehicle's shadow is drawn no longer than this many times its height

const TRAIN_CAR_METERS = 21; // a 20 m car and the gap to the next
const TRAIL_STEP_METERS = 2;

/** How busy the streets are at a time of day, for a place: 0.25 at night to 1.2 in the rush hours. */
export function trafficLevel(date, lng) {
  const hour = (((date.getUTCHours() + date.getUTCMinutes() / 60 + lng / 15) % 24) + 24) % 24; // by the sun, not the clock
  const stops = [[0, 0.3], [4.5, 0.25], [6, 0.6], [7.5, 1.2], [10, 0.85], [13, 0.9], [16, 1.05], [18, 1.2], [21, 0.95], [24, 0.3]];
  for (let i = 1; i < stops.length; i += 1) {
    if (hour <= stops[i][0]) {
      const [h0, v0] = stops[i - 1];
      const [h1, v1] = stops[i];
      return v0 + ((v1 - v0) * (hour - h0)) / (h1 - h0);
    }
  }
  return 0.3;
}

// ── Public transport timing ───────────────────────────────────────────────
//
// No timetable for Riyadh's buses or metro is published as open data, only
// their hours and how often they run. Those are what is kept to here:
// the metro from 05:30 to midnight (from 10:00 on Fridays), a train every four
// minutes in the rush hours and every seven and a half otherwise; buses from
// 05:00 to midnight, about one every ten minutes each way along a street.
// Which minute a train or bus passes is therefore right in rhythm, not to the
// clock.

/** The hour of the day and the day of the week at a longitude, to the nearest hour of time zone: { hour: 0–24, day: 0 (Sunday) – 6 }. */
export function localTime(date, lng) {
  const shifted = new Date(date.getTime() + Math.round(lng / 15) * 3600000);
  return { hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60 + shifted.getUTCSeconds() / 3600, day: shifted.getUTCDay() };
}

const inRiyadh = (place) => place.lat > 24.2 && place.lat < 25.3 && place.lng > 46.2 && place.lng < 47.3;

/** Whether the metro ('metro') or the buses ('bus') are running at a time and place { lng, lat }. */
export function serviceRuns(kind, date, place) {
  const { hour, day } = localTime(date, place.lng);
  if (kind === 'metro') return hour >= (day === 5 && inRiyadh(place) ? 10 : 5.5);
  return hour >= 5;
}

/** Seconds between metro trains one way: 240 in the rush hours, 450 otherwise. */
export function metroHeadway(date, place) {
  const { hour } = localTime(date, place.lng);
  return (hour >= 6.5 && hour < 9.5) || (hour >= 16 && hour < 20) ? 240 : 450;
}

// One bus for every so many metres of served street, each way: ten minutes apart at a bus's pace.
const BUS_SPACING_METERS = 4200;
const BUS_HEADWAY_SECONDS = 600;
const BUS_SPEED = 11; // metres a second between stops
const TRAIN_SPEED = 22; // metres a second between stations
const TRAIN_CARS = 3;
const SINGLE_LINE_OFFSET_METERS = 1.9;
const PAIR_REACH_METERS = 45; // the two tracks of a line, or its two tunnels, lie within this of each other
const STATION_WAIT_SECONDS = 22;
const SAME_TRAIN_METERS = 600; // two trains on one track are never this close: minutes apart is kilometres apart

const endKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

/**
 * The nearest street to a point: { x, y, east, north, distance }, the place
 * on it that is nearest, the way it runs there and how far off that is; or
 * null if no street of the network lies within `reach` metres. Tracks and
 * tunnels do not count.
 */
export function streetNear(network, x, y, reach = 60) {
  let best = null;
  for (const way of network.ways) {
    if (way.rail || way.hidden || x < way.box[0] - reach || x > way.box[2] + reach || y < way.box[1] - reach || y > way.box[3] + reach) continue;
    const found = nearestOn(way, x, y);
    if (found.distance <= reach && (!best || found.distance < best.distance)) best = { way, ...found };
  }
  if (!best) return null;
  const there = pointAlong(best.way, best.along);
  return { x: there[0], y: there[1], east: there[2], north: there[3], distance: best.distance };
}

/** Which way the nearest street runs at a point: [east, north], or null if none lies within `reach` metres. */
export function streetDirection(network, x, y, reach = 60) {
  const street = streetNear(network, x, y, reach);
  return street ? [street.east, street.north] : null;
}

/** Where on a way is nearest to a point: { along, distance }, both in metres. */
export function nearestOn(way, x, y) {
  const { xy, along } = way;
  let best = Infinity;
  let at = 0;
  for (let i = 1; i < along.length; i += 1) {
    const x0 = xy[i * 2 - 2];
    const y0 = xy[i * 2 - 1];
    const dx = xy[i * 2] - x0;
    const dy = xy[i * 2 + 1] - y0;
    const span = dx * dx + dy * dy || 1;
    const t = Math.min(Math.max(((x - x0) * dx + (y - y0) * dy) / span, 0), 1);
    const distance = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
    if (distance < best) {
      best = distance;
      at = along[i - 1] + (along[i] - along[i - 1]) * t;
    }
  }
  return { along: at, distance: best };
}

/**
 * Find where lines meet away from their ends, and note on each line where it
 * has to be cut so the meeting becomes a junction.
 *
 * The map gives a through road as one long line, with the side streets ending
 * on it, and two roads that cross as two lines that simply cross. A line is
 * cut where another line's end lies on it, and roads on the same level are cut
 * where they cross. Tracks only branch: where two tracks cross, trains keep to
 * their own.
 */
function cutAtJunctions(drafts) {
  // Every stretch of every line, filed under the squares of ground it passes through.
  const grid = new Map();
  const file = (cellX, cellY, draft, segment) => {
    const cell = (cellX + 32768) * 65536 + (cellY + 32768);
    let list = grid.get(cell);
    if (!list) grid.set(cell, (list = []));
    if (list[list.length - 2] !== draft || list[list.length - 1] !== segment) list.push(draft, segment);
  };
  drafts.forEach((draft, index) => {
    const { xy } = draft;
    for (let k = 1; k < xy.length / 2; k += 1) {
      const x0 = xy[k * 2 - 2];
      const y0 = xy[k * 2 - 1];
      const dx = xy[k * 2] - x0;
      const dy = xy[k * 2 + 1] - y0;
      // A long straight stretch is filed in parts, or it would be filed under every square of its whole surroundings.
      const parts = Math.max(Math.ceil(Math.hypot(dx, dy) / JUNCTION_CELL_METERS), 1);
      for (let part = 0; part < parts; part += 1) {
        const ax = x0 + (dx * part) / parts;
        const ay = y0 + (dy * part) / parts;
        const bx = x0 + (dx * (part + 1)) / parts;
        const by = y0 + (dy * (part + 1)) / parts;
        for (let cellX = Math.floor(Math.min(ax, bx) / JUNCTION_CELL_METERS); cellX <= Math.floor(Math.max(ax, bx) / JUNCTION_CELL_METERS); cellX += 1) {
          for (let cellY = Math.floor(Math.min(ay, by) / JUNCTION_CELL_METERS); cellY <= Math.floor(Math.max(ay, by) / JUNCTION_CELL_METERS); cellY += 1) {
            file(cellX, cellY, index, k);
          }
        }
      }
    }
  });

  const reach = JUNCTION_REACH_METERS;
  const cut = (draft, segment, t, x, y) => {
    const { xy, cuts } = draft;
    const last = xy.length - 2;
    // Its own ends are junctions already, and so is a cut made a step away.
    if (Math.hypot(x - xy[0], y - xy[1]) <= reach || Math.hypot(x - xy[last], y - xy[last + 1]) <= reach) return;
    if (cuts.some((other) => Math.hypot(x - other.x, y - other.y) <= reach)) return;
    cuts.push({ at: segment - 1 + Math.min(Math.max(t, 0), 1), x, y });
  };

  // A line's end lying on another line: a side street meeting a through road, or a branch leaving a track.
  drafts.forEach((draft, index) => {
    const { xy } = draft;
    for (const end of [0, xy.length - 2]) {
      const px = xy[end];
      const py = xy[end + 1];
      for (let cellX = Math.floor((px - reach) / JUNCTION_CELL_METERS); cellX <= Math.floor((px + reach) / JUNCTION_CELL_METERS); cellX += 1) {
        for (let cellY = Math.floor((py - reach) / JUNCTION_CELL_METERS); cellY <= Math.floor((py + reach) / JUNCTION_CELL_METERS); cellY += 1) {
          const list = grid.get((cellX + 32768) * 65536 + (cellY + 32768));
          for (let i = 0; list && i < list.length; i += 2) {
            const other = drafts[list[i]];
            // A street that ends above a tunnel does not join it, nor one that ends under a bridge.
            if (list[i] === index || other.rail !== draft.rail || other.level !== draft.level) continue;
            const k = list[i + 1];
            const x0 = other.xy[k * 2 - 2];
            const y0 = other.xy[k * 2 - 1];
            const dx = other.xy[k * 2] - x0;
            const dy = other.xy[k * 2 + 1] - y0;
            const t = Math.min(Math.max(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1), 0), 1);
            if (Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t)) <= reach) cut(other, k, t, px, py);
          }
        }
      }
    }
  });

  // Two roads crossing on the same level.
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i += 2) {
      const a = drafts[list[i]];
      if (a.rail) continue;
      const ka = list[i + 1];
      const ax = a.xy[ka * 2 - 2];
      const ay = a.xy[ka * 2 - 1];
      const adx = a.xy[ka * 2] - ax;
      const ady = a.xy[ka * 2 + 1] - ay;
      for (let j = i + 2; j < list.length; j += 2) {
        const b = drafts[list[j]];
        if (list[j] === list[i] || b.rail || b.level !== a.level) continue;
        const kb = list[j + 1];
        const bx = b.xy[kb * 2 - 2];
        const by = b.xy[kb * 2 - 1];
        const bdx = b.xy[kb * 2] - bx;
        const bdy = b.xy[kb * 2 + 1] - by;
        const cross = adx * bdy - ady * bdx;
        if (Math.abs(cross) < 1e-9) continue; // side by side
        const s = ((bx - ax) * bdy - (by - ay) * bdx) / cross;
        const t = ((bx - ax) * ady - (by - ay) * adx) / cross;
        if (s < 0 || s > 1 || t < 0 || t > 1) continue;
        const x = ax + adx * s;
        const y = ay + ady * s;
        cut(a, ka, s, x, y);
        cut(b, kb, t, x, y);
      }
    }
  }
}

/** The stretches a line falls into once it is cut at its junctions: a list of point lists, [x, y, x, y, …]. */
function piecesOf(draft) {
  const { xy, cuts } = draft;
  if (cuts.length === 0) return [xy];
  cuts.sort((a, b) => a.at - b.at);
  const pieces = [];
  let piece = [xy[0], xy[1]];
  const add = (x, y) => {
    // The same point twice in a row would be a stretch with no direction.
    if (Math.hypot(x - piece[piece.length - 2], y - piece[piece.length - 1]) > 0.01) piece.push(x, y);
  };
  let next = 0;
  for (let k = 1; k < xy.length / 2; k += 1) {
    while (next < cuts.length && cuts[next].at <= k) {
      const { x, y } = cuts[next];
      next += 1;
      add(x, y);
      pieces.push(piece);
      piece = [x, y];
    }
    add(xy[k * 2], xy[k * 2 + 1]);
  }
  pieces.push(piece);
  return pieces.filter((points) => points.length >= 4).map((points) => Float64Array.from(points));
}

/**
 * Turn map lines into ways that can be driven.
 *
 * lines: [{ class, subclass, oneway (1, -1 or 0), tunnel, bridge, layer (the map's number for a bridge's level), service (the kind of service lane), width (metres, as drawn), coordinates: [[lng, lat], …] }]
 * origin: { lng, lat }
 * busStops, stations: [[lng, lat], …], the stops and stations on the map
 * Returns { ways, joins, roadKm, railKm, busKm }. A way runs from one junction
 * to the next. Each knows the stops along it (stops: [{ at: metres along,
 * side: 1 for traffic going forward, -1 for the other way, 0 for both,
 * kerb: 1 if it stands on the right of the way, -1 on the left }]) and
 * whether buses use it (bus). A way on a bridge knows how high its deck is
 * (deck, metres) and how high it is where it starts and where it ends (rise).
 */
export function buildNetwork(lines, origin, { busStops = [], stations = [] } = {}) {
  const squeeze = Math.cos((origin.lat * Math.PI) / 180) * METERS_PER_DEGREE;
  const ways = [];
  const joins = new Map();
  let roadKm = 0;
  let railKm = 0;

  // Every line that can be driven, measured in metres from the origin.
  const drafts = [];
  for (const line of lines) {
    const rail = RAILS.has(line.class);
    const road = ROADS[line.class];
    const coordinates = line.coordinates;
    if ((!rail && !road) || !Array.isArray(coordinates) || coordinates.length < 2) continue;
    if (rail && line.service) continue; // depot tracks, sidings and crossovers carry no passengers
    const xy = new Float64Array(coordinates.length * 2);
    for (let i = 0; i < coordinates.length; i += 1) {
      xy[i * 2] = (coordinates[i][0] - origin.lng) * squeeze;
      xy[i * 2 + 1] = (coordinates[i][1] - origin.lat) * METERS_PER_DEGREE;
    }
    // Its level: 0 on the ground, 1 or more on a bridge, below 0 in a tunnel. (For a bridge: the number
    // the map gives it for now, and the level it is really on once all the bridges are known.)
    const storey = Math.max(Math.abs(Math.round(Number(line.layer) || 0)), 1);
    drafts.push({ line, rail, road, xy, hidden: Boolean(line.tunnel), level: line.tunnel ? -storey : line.bridge ? storey : 0, cuts: [] });
  }
  stackBridges(drafts);
  cutAtJunctions(drafts);

  // Two map tiles can put the same junction a metre apart, so line ends are
  // matched by nearness. Each junction is named after the first end found there.
  const cells = new Map();
  const joinAt = (rail, x, y) => {
    const prefix = rail ? 'r' : 'd';
    const reach = rail ? RAIL_JOIN_REACH_METERS : JOIN_REACH_METERS;
    const cellX = Math.floor(x / 4);
    const cellY = Math.floor(y / 4);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const spot of cells.get(`${prefix}${cellX + dx},${cellY + dy}`) ?? []) {
          if (Math.hypot(spot.x - x, spot.y - y) <= reach) return spot.key;
        }
      }
    }
    let key = `${prefix}${endKey(x, y)}`;
    while (joins.has(key)) key += "'"; // two junctions a step apart that round to the same metre
    const cell = `${prefix}${cellX},${cellY}`;
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push({ x, y, key });
    joins.set(key, []);
    return key;
  };

  const place6 = (value) => value.toFixed(6);
  for (const draft of drafts) {
    const { line, rail, road } = draft;
    const pieces = piecesOf(draft);
    for (const xy of pieces) {
      const count = xy.length / 2;
      const along = new Float64Array(count);
      let west = Infinity;
      let east = -Infinity;
      let south = Infinity;
      let north = -Infinity;
      for (let i = 0; i < count; i += 1) {
        if (i > 0) along[i] = along[i - 1] + Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]);
        west = Math.min(west, xy[i * 2]);
        east = Math.max(east, xy[i * 2]);
        south = Math.min(south, xy[i * 2 + 1]);
        north = Math.max(north, xy[i * 2 + 1]);
      }
      const length = along[count - 1];
      if (!(length > 1)) continue;

      // The same stretch gets the same name every time the network is rebuilt, so vehicles can stay on it.
      const whole = pieces.length === 1;
      const first = whole ? line.coordinates[0] : [origin.lng + xy[0] / squeeze, origin.lat + xy[1] / METERS_PER_DEGREE];
      const last = whole ? line.coordinates[count - 1] : [origin.lng + xy[count * 2 - 2] / squeeze, origin.lat + xy[count * 2 - 1] / METERS_PER_DEGREE];
      // (A slip road is two lanes at the most, whatever road it is a slip road of.)
      const lanes = rail ? 1 : line.ramp ? Math.min(road.lanes, 2) : road.lanes;
      const way = {
        key: `${line.class}:${place6(first[0])},${place6(first[1])}:${place6(last[0])},${place6(last[1])}:${count}`,
        rail,
        class: line.class,
        service: line.service ?? null, // what kind of service lane it is, if it is one: the lane of a car park, a driveway…
        idle: rail && (line.class === 'rail' || line.subclass === 'monorail'), // a track the trains here do not use: the main-line railway, a monorail
        oneway: rail ? 0 : Number(line.oneway) || 0,
        hidden: draft.hidden,
        deck: draft.level > 0 ? (rail ? RAIL_DECK_METERS : ROAD_DECK_METERS) + (draft.level - 1) * DECK_ABOVE_DECK_METERS : 0, // how high its bridge carries it
        rise: null, // on a bridge: how high it is at its start and at its end
        ramp: Boolean(line.ramp), // a slip road
        sunk: null, // in a cutting: how deep it lies at its start and at its end
        dips: null, // and, for a great road, the slope it is on from each end (see cuttings.js)
        clear: null, // for a slip road that leaves a great road below the ground: how far it runs beside it before it can climb
        lanes: rail ? 1 : lanes,
        width: Number(line.width) > 0 ? Number(line.width) : rail ? 5 : lanes * LANE_METERS * (Number(line.oneway) ? 1 : 2),
        speed: rail ? 20 : road.speed,
        perKm: rail ? 0 : road.perKm,
        stops: [], // the bus stops or stations along it
        bus: false, // whether buses use it
        xy,
        along,
        length,
        box: [west, south, east, north],
        ends: null, // the junctions at its start and its end
      };
      const index = ways.push(way) - 1;
      way.ends = [joinAt(rail, xy[0], xy[1]), joinAt(rail, xy[count * 2 - 2], xy[count * 2 - 1])];
      joins.get(way.ends[0]).push({ way: index, atStart: true });
      joins.get(way.ends[1]).push({ way: index, atStart: false });
      if (rail) railKm += length / 1000;
      else roadKm += (length / 1000) * (way.oneway === 0 ? 2 : 1);
    }
  }

  // A bridge comes down to whatever it meets at each end: the ground, or the bridge it carries on as.
  for (const way of ways) {
    if (!(way.deck > 0)) continue;
    way.rise = way.ends.map((key) => {
      let met = 0;
      for (const join of joins.get(key)) {
        const other = ways[join.way];
        if (other !== way && other.rail === way.rail) met = Math.max(met, other.deck);
      }
      return Math.min(way.deck, met);
    });
  }

  // A great road goes down to meet a tunnel, and along a cutting it stays down (see cuttings.js). A slip
  // road that leaves it there climbs to the street from where it leaves.
  sinkWays(ways, joins, origin);

  // Put each bus stop on the street it stands beside, and each station on every track that passes it.
  const place = (points, fits, reach, onlyNearest) => {
    for (const point of points) {
      const x = (point[0] - origin.lng) * squeeze;
      const y = (point[1] - origin.lat) * METERS_PER_DEGREE;
      let nearest = null;
      for (const way of ways) {
        if (!fits(way) || x < way.box[0] - reach || x > way.box[2] + reach || y < way.box[1] - reach || y > way.box[3] + reach) continue;
        const found = nearestOn(way, x, y);
        if (found.distance > reach) continue;
        if (!onlyNearest) way.stops.push({ at: found.along, side: 0, kerb: 1 });
        else if (!nearest || found.distance < nearest.distance) nearest = { way, ...found };
      }
      if (nearest) {
        // Buses pull in on the right, so the side of the street a stop stands on says which way its buses go.
        const there = pointAlong(nearest.way, nearest.along);
        const toLeft = there[2] * (y - there[1]) - there[3] * (x - there[0]);
        const kerb = Math.abs(toLeft) < 1.5 || toLeft < 0 ? 1 : -1; // a stop marked on the road itself is taken to stand on its right
        nearest.way.stops.push({ at: nearest.along, side: nearest.way.oneway !== 0 || Math.abs(toLeft) < 1.5 ? 0 : kerb, kerb });
      }
    }
  };
  place(busStops, (way) => !way.rail && !way.hidden && !(way.deck > 0) && BUS_ROADS.has(way.class), BUS_STOP_REACH_METERS, true);
  place(stations, (way) => way.rail, STATION_REACH_METERS, false);

  // A bus route carries on along its street between stops: the street straight
  // on from a stop, for 1200 m either way, is a bus street too.
  const reached = new Map(); // way → the furthest a bus street has been found to run on from it
  const onward = [];
  ways.forEach((way, index) => {
    way.stops.sort((a, b) => a.at - b.at);
    if (way.rail || way.stops.length === 0) return;
    way.bus = true;
    onward.push([index, true, BUS_RUNS_ON_METERS], [index, false, BUS_RUNS_ON_METERS]);
  });
  while (onward.length > 0) {
    const [index, fromEnd, left] = onward.pop();
    const way = ways[index];
    const here = pointAlong(way, fromEnd ? way.length : 0);
    const out = fromEnd ? 1 : -1; // leaving by the end runs with the way, leaving by the start against it
    for (const join of joins.get(way.ends[fromEnd ? 1 : 0])) {
      const other = ways[join.way];
      if (join.way === index || !BUS_ROADS.has(other.class)) continue;
      const there = pointAlong(other, join.atStart ? 0 : other.length);
      if ((there[2] * here[2] + there[3] * here[3]) * out * (join.atStart ? 1 : -1) < 0.8) continue; // a turn, not the same street
      if (left * 2 < other.length) continue; // less than half of it lies within reach of the stop
      const remaining = left - other.length;
      if ((reached.get(join.way) ?? -Infinity) >= remaining) continue;
      reached.set(join.way, remaining);
      other.bus = true;
      if (remaining > 0) onward.push([join.way, join.atStart, remaining]);
    }
  }
  let busKm = 0;
  for (const way of ways) {
    if (way.bus && !way.hidden) busKm += (way.length / 1000) * (way.oneway === 0 ? 2 : 1);
  }
  return { origin: { lng: origin.lng, lat: origin.lat }, ways, joins, roadKm, railKm, busKm };
}

/** The point at a distance along a way, and the direction of the way there: [x, y, east, north]. */
export function pointAlong(way, distance, out = [0, 0, 0, 0]) {
  const { xy, along } = way;
  const count = along.length;
  const d = Math.min(Math.max(distance, 0), way.length);
  // The ways are short: a walk from the nearer end finds the stretch.
  let i = 1;
  while (i < count - 1 && along[i] < d) i += 1;
  const span = along[i] - along[i - 1] || 1;
  const t = (d - along[i - 1]) / span;
  const x0 = xy[i * 2 - 2];
  const y0 = xy[i * 2 - 1];
  const dx = xy[i * 2] - x0;
  const dy = xy[i * 2 + 1] - y0;
  out[0] = x0 + dx * t;
  out[1] = y0 + dy * t;
  out[2] = dx / span;
  out[3] = dy / span;
  return out;
}

const pick = (list, random) => list[Math.floor(random() * list.length)];

/** A number from 0 up to 1 that is always the same for the same text. */
function unitFrom(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/**
 * Where trains come onto the network: the open ends of the tracks, at the edge
 * of what the map has loaded. Of a pair of tracks side by side (or of tunnels
 * side by side) a train takes the right-hand one. Where the map draws both
 * tracks as one line, trains run each way along it, each a little to its own right.
 * No train comes onto a track that is marked idle: the trains here are the
 * metro's, which do not run on the main-line railway or on a monorail.
 * Returns [{ way, atStart, key, offset }].
 */
export function railEntries(network) {
  const rails = [];
  network.ways.forEach((way, index) => {
    if (way.rail && !way.idle) rails.push({ way, index });
  });
  const entries = [];
  for (const { way, index } of rails) {
    for (const atStart of [true, false]) {
      const meeting = network.joins.get(way.ends[atStart ? 0 : 1]) ?? [];
      if (meeting.some((join) => join.way !== index)) continue; // the track carries on

      const probe = pointAlong(way, atStart ? Math.min(40, way.length / 2) : Math.max(way.length - 40, way.length / 2));
      const east = probe[2] * (atStart ? 1 : -1);
      const north = probe[3] * (atStart ? 1 : -1);
      let onLeft = false;
      let onRight = false;
      for (const other of rails) {
        const box = other.way.box;
        if (other.index === index || probe[0] < box[0] - PAIR_REACH_METERS || probe[0] > box[2] + PAIR_REACH_METERS || probe[1] < box[1] - PAIR_REACH_METERS || probe[1] > box[3] + PAIR_REACH_METERS) continue;
        const found = nearestOn(other.way, probe[0], probe[1]);
        if (found.distance < 2 || found.distance > PAIR_REACH_METERS) continue;
        const there = pointAlong(other.way, found.along);
        if (Math.abs(there[2] * east + there[3] * north) < 0.9) continue; // crossing it, not running beside it
        if (east * (there[1] - probe[1]) - north * (there[0] - probe[0]) > 0) onLeft = true;
        else onRight = true;
      }
      if (onRight && !onLeft) continue; // the left-hand track of a pair: trains the other way use it
      entries.push({ way: index, atStart, key: `${way.key}${atStart ? '>' : '<'}`, offset: onLeft || onRight ? 0 : SINGLE_LINE_OFFSET_METERS });
    }
  }
  return entries;
}

/** The traffic on a network: cars on the roads, buses along the streets with stops, trains on the rails. */
export class Traffic {
  /** now(): the clock in milliseconds, which a test can replace. */
  constructor({ seed = 1, most = 880, now = () => Date.now() } = {}) {
    this.random = seededRandom(seed);
    this.most = most;
    this.now = now;
    this.place = { lng: 0, lat: 0 }; // where the network is, for the time of day there
    this.view = null; // [west, south, east, north] in metres: what is on screen, where a bus should not appear from nowhere
    this.network = { ways: [], joins: new Map(), roadKm: 0, railKm: 0, busKm: 0 };
    this.vehicles = [];
    this.trains = [];
    this.level = 1;
    this.sinceSorted = 0;
    this.spare = [0, 0, 0, 0];
    this.spare2 = [0, 0, 0, 0];
    this.roads = [];
    this.roadShares = [];
    this.busWays = [];
    this.busShares = [];
    this.entries = [];
    this.departures = new Map(); // track end → when its next train leaves, in seconds
    this.passed = new Map(); // stretch of track and direction → when the front of the last train came onto it, in seconds
  }

  /**
   * Swap in a new network. Vehicles on a line that is still there carry on; the
   * rest are dropped. shift: how far the new origin moved the ground, [east,
   * north] in metres. place: where the network is, { lng, lat }.
   */
  setNetwork(network, shift = [0, 0], place = this.place) {
    const byKey = new Map(network.ways.map((way, index) => [way.key, index]));
    const keep = (item) => {
      const index = byKey.get(this.network.ways[item.way]?.key);
      if (index === undefined) return false;
      item.way = index;
      return true;
    };
    this.vehicles = this.vehicles.filter(keep);
    this.trains = this.trains.filter(keep);
    for (const train of this.trains) {
      for (const point of train.trail) {
        point[0] += shift[0];
        point[1] += shift[1];
      }
    }
    this.network = network;
    this.place = { lng: place.lng, lat: place.lat };
    // Chance of a new vehicle starting on each road: by its length and how busy its kind is.
    // A bus starts anywhere along the bus streets.
    this.roads = [];
    this.roadShares = [];
    this.busWays = [];
    this.busShares = [];
    let total = 0;
    let busTotal = 0;
    network.ways.forEach((way, index) => {
      if (way.rail) return;
      const both = way.oneway === 0 ? 2 : 1;
      total += way.length * way.perKm * both;
      this.roads.push(index);
      this.roadShares.push(total);
      if (way.bus && !way.hidden) {
        busTotal += way.length * both;
        this.busWays.push(index);
        this.busShares.push(busTotal);
      }
    });
    this.entries = railEntries(network);
    const open = new Set(this.entries.map((entry) => entry.key));
    for (const key of this.departures.keys()) if (!open.has(key)) this.departures.delete(key);
    this.fill();
  }

  /** How many cars, vans and lorries this network should carry right now. */
  wanted() {
    let count = 0;
    for (const index of this.roads) {
      const way = this.network.ways[index];
      count += (way.length / 1000) * way.perKm * (way.oneway === 0 ? 2 : 1);
    }
    return Math.min(Math.round(count * this.level), this.most);
  }

  /**
   * How many buses: one for every ten minutes' drive of bus street, each way,
   * while the buses are running. A stretch too short for a whole bus has one
   * for part of every ten minutes.
   */
  wantedBuses() {
    const now = this.now();
    if (!serviceRuns('bus', new Date(now), this.place)) return 0;
    const share = ((this.network.busKm ?? 0) * 1000) / BUS_SPACING_METERS;
    const turn = (now / 1000 / BUS_HEADWAY_SECONDS) % 1; // where in its ten minutes the clock is
    return Math.floor(share) + (turn < share % 1 ? 1 : 0);
  }

  fill() {
    const count = (isBus) => {
      let staying = 0;
      for (const vehicle of this.vehicles) if ((vehicle.type === 'bus') === isBus && !vehicle.leaving) staying += 1;
      return staying;
    };

    const wanted = this.wanted();
    let staying = count(false);
    for (let tries = (wanted - staying) * 3; staying < wanted && tries > 0; tries -= 1) {
      const vehicle = this.spawn();
      if (vehicle) {
        this.vehicles.push(vehicle);
        staying += 1;
      }
    }
    // When there should be fewer, the surplus drives off: it fades out rather than vanishing.
    for (let i = this.vehicles.length - 1; i >= 0 && staying > wanted * 1.2 + 5; i -= 1) {
      const vehicle = this.vehicles[i];
      if (vehicle.type !== 'bus' && !vehicle.leaving) {
        vehicle.leaving = true;
        staying -= 1;
      }
    }

    // Buses: a missing one sets off; one too many is left to drive out of the
    // picture by itself. When the service ends for the night they all go.
    const buses = this.wantedBuses();
    staying = count(true);
    for (let tries = (buses - staying) * 3; staying < buses && tries > 0; tries -= 1) {
      const bus = this.spawnBus();
      if (bus) {
        this.vehicles.push(bus);
        staying += 1;
      }
    }
    for (let i = this.vehicles.length - 1; i >= 0 && staying > (buses === 0 ? 0 : buses + 1); i -= 1) {
      const vehicle = this.vehicles[i];
      if (vehicle.type === 'bus' && !vehicle.leaving) {
        vehicle.leaving = true;
        staying -= 1;
      }
    }
  }

  /** A way picked by its share, and which way along it and in which lane a newcomer drives. */
  startOn(ways, shares, kerb) {
    if (shares.length === 0 || !(shares[shares.length - 1] > 0)) return null;
    const random = this.random;
    const at = random() * shares[shares.length - 1];
    let low = 0;
    let high = shares.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (shares[middle] < at) low = middle + 1;
      else high = middle;
    }
    const wayIndex = ways[low];
    const way = this.network.ways[wayIndex];
    const forward = way.oneway === 1 || (way.oneway === 0 && random() < 0.5);
    const lanes = lanesOf(way);
    const lane = kerb ? lanes - 1 : Math.floor(random() * lanes);
    return {
      way: wayIndex,
      forward,
      s: random() * way.length,
      lane,
      offset: laneOffset(way, lane),
      shown: 0, // fades in from nothing
      leaving: false,
    };
  }

  spawn() {
    const vehicle = this.startOn(this.roads, this.roadShares, false);
    if (!vehicle) return null;
    const random = this.random;
    const way = this.network.ways[vehicle.way];
    let type = 'car';
    const roll = random();
    if (roll < 0.3) type = 'suv';
    else if (roll < 0.37) type = 'van';
    else if (roll < 0.37 + (way.lanes >= 2 ? 0.06 : 0.01)) type = 'truck';
    const paint = pick(CAR_PAINT, random);
    vehicle.type = type;
    vehicle.wish = way.speed * (type === 'truck' ? 0.8 : 0.85 + random() * 0.35);
    vehicle.speed = way.speed * 0.8;
    vehicle.paint = paint;
    vehicle.cargo = type === 'truck' ? pick(CARGO_PAINT, random) : paint;
    return vehicle;
  }

  /** A bus, somewhere along a bus street, in the lane by the kerb: off screen when there is anywhere off screen to start. */
  spawnBus() {
    let bus = null;
    for (let tries = 0; tries < 8; tries += 1) {
      bus = this.startOn(this.busWays, this.busShares, true);
      if (!bus || !this.view) break;
      const spot = pointAlong(this.network.ways[bus.way], bus.s, this.spare);
      if (spot[0] < this.view[0] || spot[0] > this.view[2] || spot[1] < this.view[1] || spot[1] > this.view[3]) break;
    }
    if (!bus) return null;
    const paint = pick(BUS_PAINT, this.random);
    bus.type = 'bus';
    bus.wish = Math.min(this.network.ways[bus.way].speed, BUS_SPEED);
    bus.speed = bus.wish * 0.6;
    bus.paint = paint;
    bus.cargo = paint;
    bus.waiting = 0; // seconds left at a stop
    bus.clear = 0; // metres to go before the next stop counts
    bus.astray = 0; // metres driven since it left the bus streets
    return bus;
  }

  /**
   * Where a vehicle goes when its way ends: one of the ways that meet it there, or nowhere.
   * Drivers mostly go straight on, and turn more readily onto a busy road than
   * into a side street. A bus keeps to the bus streets. A train stays on its track.
   */
  next(item, rail) {
    const way = this.network.ways[item.way];
    const options = this.network.joins.get(way.ends[item.forward ? 1 : 0]);
    if (!options) return null;
    const here = pointAlong(way, item.forward ? way.length : 0, this.spare);
    const east = here[2] * (item.forward ? 1 : -1);
    const north = here[3] * (item.forward ? 1 : -1);
    const isBus = item.type === 'bus';

    const weights = [];
    let total = 0;
    let straightest = null;
    let mostStraight = 0.5; // a train never takes a turn sharper than this
    for (const option of options) {
      weights.push(0);
      if (option.way === item.way) continue;
      const other = this.network.ways[option.way];
      const there = pointAlong(other, option.atStart ? 0 : other.length, this.spare2);
      const straight = (there[2] * east + there[3] * north) * (option.atStart ? 1 : -1);
      if (rail) {
        if (straight > mostStraight) {
          mostStraight = straight;
          straightest = option;
        }
        continue;
      }
      // Entering at its start means driving it forwards, which a one-way road may forbid.
      if ((option.atStart && other.oneway === -1) || (!option.atStart && other.oneway === 1)) continue;
      if (straight < -0.5) continue; // no U-turns
      let weight = 0.08 + Math.max(straight, 0) ** 2;
      if (isBus) {
        // Off its streets a bus only ever follows a main road, never a side street.
        if (!other.bus && (other.class === 'minor' || other.class === 'service')) continue;
        if (other.bus) weight *= 40;
      } else {
        weight *= Math.sqrt(other.perKm);
      }
      weights[weights.length - 1] = weight;
      total += weight;
    }
    if (rail) return straightest;
    if (!(total > 0)) return null;
    let pick = this.random() * total;
    for (let i = 0; i < options.length; i += 1) {
      pick -= weights[i];
      if (weights[i] > 0 && pick <= 0) return options[i];
    }
    return options[weights.findLastIndex((weight) => weight > 0)];
  }

  /** Move everything on by a number of seconds. */
  step(seconds) {
    const dt = Math.min(Math.max(seconds, 0), 0.25);
    const ways = this.network.ways;

    // Every half second each driver looks at the vehicle ahead in the same lane.
    this.sinceSorted += dt;
    if (this.sinceSorted >= 0.5) {
      this.sinceSorted = 0;
      this.lookAhead();
    }

    let someGone = false;
    for (const vehicle of this.vehicles) {
      const way = ways[vehicle.way];
      vehicle.shown = Math.min(Math.max(vehicle.shown + (vehicle.leaving ? -dt : dt) * 1.5, 0), 1);
      if (vehicle.leaving && vehicle.shown === 0) someGone = true;
      if (vehicle.parked) continue;
      let target = Math.min(vehicle.wish, vehicle.limit ?? Infinity);

      if (vehicle.type === 'bus') {
        if (vehicle.waiting > 0) {
          vehicle.waiting -= dt; // doors open
          vehicle.speed = 0;
          continue;
        }
        if (vehicle.clear <= 0) {
          // The next stop ahead on its side of the street: slow down for it, then stand a while.
          const side = vehicle.forward ? 1 : -1;
          let ahead = Infinity;
          for (const stop of way.stops) {
            if (stop.side !== 0 && stop.side !== side) continue;
            const distance = (stop.at - vehicle.s) * side;
            if (distance > -1 && distance < ahead) ahead = distance;
          }
          if (ahead < 1.2) {
            vehicle.waiting = 12 + this.random() * 9;
            vehicle.clear = 40; // stops closer together than this are one stop
            vehicle.speed = 0;
            continue;
          }
          if (ahead < Infinity) target = Math.min(target, Math.sqrt(2 * 1.3 * ahead) + 0.4);
        }
      }

      vehicle.speed += Math.min(Math.max(target - vehicle.speed, -6 * dt), 2.5 * dt);
      const moved = vehicle.speed * dt;
      vehicle.s += moved * (vehicle.forward ? 1 : -1);
      if (vehicle.type === 'bus') {
        if (vehicle.clear > 0) vehicle.clear -= moved;
        // A bus that has left the streets with stops is off its route: it is taken out of the picture.
        vehicle.astray = way.bus ? 0 : vehicle.astray + moved;
        if (vehicle.astray > BUS_ASTRAY_METERS) vehicle.leaving = true;
      }

      if (vehicle.s > way.length || vehicle.s < 0) {
        const over = vehicle.s < 0 ? -vehicle.s : vehicle.s - way.length;
        const option = this.next(vehicle, false);
        if (option) {
          const other = ways[option.way];
          const lanes = lanesOf(other);
          const isBus = vehicle.type === 'bus';
          vehicle.way = option.way;
          vehicle.forward = option.atStart;
          vehicle.s = option.atStart ? over : other.length - over;
          vehicle.lane = isBus ? lanes - 1 : Math.min(vehicle.lane, lanes - 1);
          vehicle.offset = laneOffset(other, vehicle.lane);
          vehicle.wish = isBus ? Math.min(other.speed, BUS_SPEED) : (vehicle.wish / way.speed) * other.speed;
        } else {
          // The road ran out: the edge of the map, or a dead end. It pulls up there and fades from the picture.
          vehicle.s = Math.min(Math.max(vehicle.s, 0), way.length);
          vehicle.speed = 0;
          vehicle.parked = true;
          vehicle.leaving = true;
        }
      }
    }
    if (someGone) this.vehicles = this.vehicles.filter((vehicle) => !(vehicle.leaving && vehicle.shown === 0));

    this.sendTrains();
    const at = this.now() / 1000;
    for (const train of this.trains) {
      train.shown = Math.min(Math.max(train.shown + (train.leaving ? -dt : dt), 0), 1);
      this.moveTrain(train, dt, at);
    }
    if (this.trains.some((train) => train.leaving && train.shown === 0)) {
      this.trains = this.trains.filter((train) => !(train.leaving && train.shown === 0));
    }
    this.fill();
  }

  /**
   * Start the trains that are due. Each open end of track sends a train every
   * few minutes, by the clock: the same end always sends them at the same
   * minutes past the hour. When the map moves and a track is now known from
   * further out or further in, the trains seen on it before set the time, so
   * the rhythm carries on.
   */
  sendTrains() {
    if (this.entries.length === 0) return;
    const now = this.now() / 1000;
    const date = new Date(this.now());
    const running = serviceRuns('metro', date, this.place);
    const headway = metroHeadway(date, this.place);
    for (const entry of this.entries) {
      let next = this.departures.get(entry.key);
      if (next === undefined) {
        // First sight of this end. How long ago did its last train leave?
        let since = (now + unitFrom(entry.key) * headway) % headway;
        const before = this.passed.get(entry.key);
        if (before !== undefined && now - before < headway * 3) {
          since = (now - before) % headway; // until now the track came from further out, and a train came through here then
        } else {
          const ahead = this.probe(entry);
          // Further in, trains have been coming through at known times: this end is set by them.
          if (ahead && now - ahead.passed < headway * 3) since = (((now + ahead.seconds - ahead.passed) % headway) + headway) % headway;
        }
        next = now - since + headway;
        // The trains on their way along the track from here: that one, the one before it, and so on.
        for (let back = since, tries = 0; running && tries < 8; back += headway, tries += 1) {
          if (!this.startTrain(entry, back, now)) break; // one that left so long ago is off the map again, and so are all before it
        }
      } else if (now >= next) {
        if (running) this.startTrain(entry, Math.min(now - next, headway), now);
        while (next <= now) next += headway;
      }
      this.departures.set(entry.key, next);
    }
    // A long drive passes a lot of track: forget what was seen more than an hour ago.
    if (this.passed.size > 4000) {
      for (const [key, at] of this.passed) if (now - at > 3600) this.passed.delete(key);
    }
  }

  newTrain(entry) {
    const way = this.network.ways[entry.way];
    return {
      way: entry.way,
      forward: entry.atStart,
      s: entry.atStart ? 0 : way.length,
      offset: entry.offset,
      speed: TRAIN_SPEED,
      cars: TRAIN_CARS,
      paint: TRAIN_PAINT[0],
      stripe: TRAIN_PAINT[1],
      trail: [],
      travelled: 0,
      shown: 1,
      leaving: false,
      waiting: 0, // seconds left at a station
      clear: 0, // metres to go before the next station counts
    };
  }

  /**
   * How long a train from an open end takes to reach track that trains have
   * already been seen on: { seconds, passed: when the last one came onto that
   * track }, or null if it meets none.
   */
  probe(entry) {
    const train = this.newTrain(entry);
    for (let seconds = 0; seconds < 1500 && !train.leaving; seconds += 0.25) {
      const way = train.way;
      this.moveTrain(train, 0.25, null);
      if (train.way === way) continue;
      const onto = this.network.ways[train.way];
      const passed = this.passed.get(`${onto.key}${train.forward ? '>' : '<'}`);
      if (passed === undefined) continue;
      const over = train.forward ? train.s : onto.length - train.s;
      return { seconds: seconds + 0.25 - over / Math.max(train.speed, 0.5), passed };
    }
    return null;
  }

  /**
   * Put a train on the track as it is `since` seconds after coming onto the
   * network at an open end. Returns false if by now it has left again. A train
   * that is already running where this one would be is the same train, and
   * is not put there twice.
   */
  startTrain(entry, since, now) {
    const train = this.newTrain(entry);
    train.shown = since > 2 ? 1 : 0; // one caught in mid-journey is simply there; one coming onto the map fades in
    const left = now - since;
    this.notePassing(entry.key, left);
    for (let run = 0; run < since && !train.leaving; run += 0.25) {
      const step = Math.min(since - run, 0.25);
      this.moveTrain(train, step, left + run + step);
    }
    if (train.leaving) return false;
    const [x, y, east, north] = this.frontOf(train);
    for (const other of this.trains) {
      const [ox, oy, oEast, oNorth] = this.frontOf(other, this.spare2);
      if (Math.hypot(ox - x, oy - y) < SAME_TRAIN_METERS && east * oEast + north * oNorth > 0.7) return true;
    }
    this.trains.push(train);
    return true;
  }

  /** Where the front of a train is and which way it is heading: [x, y, east, north]. */
  frontOf(train, out = this.spare) {
    const front = pointAlong(this.network.ways[train.way], train.s, out);
    if (!train.forward) {
      front[2] = -front[2];
      front[3] = -front[3];
    }
    return front;
  }

  /** Note when the front of a train came onto a stretch of track. */
  notePassing(key, at) {
    if (!(this.passed.get(key) >= at)) this.passed.set(key, at);
  }

  /**
   * Run one train on: along the track, slowing for each station and standing
   * there a while. at: the time once it has moved, in seconds, from which to
   * note when it came onto each new stretch of track (null to note nothing).
   */
  moveTrain(train, dt, at) {
    const ways = this.network.ways;
    const way = ways[train.way];
    if (train.leaving) return; // it stands at the end of the track while it fades
    if (train.waiting > 0) {
      train.waiting -= dt; // doors open
      return;
    }
    let target = TRAIN_SPEED;
    if (train.clear <= 0) {
      // The train stops with its middle at the station, or as near as this stretch of track allows.
      const half = (train.cars * TRAIN_CAR_METERS) / 2;
      const side = train.forward ? 1 : -1;
      let ahead = Infinity;
      for (const stop of way.stops) {
        const place = train.forward ? Math.min(stop.at + half, way.length - 1) : Math.max(stop.at - half, 1);
        const distance = (place - train.s) * side;
        if (distance > -1 && distance < ahead) ahead = distance;
      }
      if (ahead < 1.5) {
        train.waiting = STATION_WAIT_SECONDS;
        train.clear = 250; // the same station marked on the next stretch of track is not another stop
        train.speed = 0;
        return;
      }
      if (ahead < Infinity) target = Math.min(target, Math.sqrt(2 * 0.9 * ahead) + 0.5);
    }
    train.speed += Math.min(Math.max(target - train.speed, -1.2 * dt), 0.9 * dt);
    const moved = Math.max(train.speed, 0.5) * dt;
    train.s += moved * (train.forward ? 1 : -1);
    train.travelled += moved;
    if (train.clear > 0) train.clear -= moved;
    if (train.s > way.length || train.s < 0) {
      const over = train.s < 0 ? -train.s : train.s - way.length;
      const option = this.next(train, true);
      if (option) {
        train.way = option.way;
        train.forward = option.atStart;
        train.s = option.atStart ? over : ways[option.way].length - over;
        // It came onto this stretch a moment before the end of the step: as long ago as the overshoot took.
        if (at !== null) this.notePassing(`${ways[train.way].key}${train.forward ? '>' : '<'}`, at - over / Math.max(train.speed, 0.5));
      } else {
        train.s = Math.min(Math.max(train.s, 0), way.length);
        train.leaving = true; // the end of the track, as far as the map has loaded it
      }
    }
    // Remember where the front has been, so the cars behind can follow the same curve.
    const now = pointAlong(ways[train.way], train.s, this.spare);
    const sign = train.forward ? 1 : -1;
    const x = now[0] + now[3] * sign * train.offset;
    const y = now[1] - now[2] * sign * train.offset;
    const trail = train.trail;
    const lastAt = trail.length > 0 ? trail[trail.length - 1][2] : -Infinity;
    if (train.travelled - lastAt >= TRAIL_STEP_METERS) {
      trail.push([x, y, train.travelled, ways[train.way].hidden, heightAlong(ways[train.way], train.s)]);
      const keep = Math.ceil((train.cars * TRAIN_CAR_METERS) / TRAIL_STEP_METERS) + 4;
      if (trail.length > keep) trail.splice(0, trail.length - keep);
    }
  }

  /** Slow each vehicle that is closing on the one ahead of it in its lane. */
  lookAhead() {
    const sorted = this.vehicles.slice().sort((a, b) => {
      if (a.way !== b.way) return a.way - b.way;
      if (a.forward !== b.forward) return a.forward ? -1 : 1;
      if (a.lane !== b.lane) return a.lane - b.lane;
      return a.forward ? a.s - b.s : b.s - a.s;
    });
    for (let i = 0; i < sorted.length; i += 1) {
      const vehicle = sorted[i];
      const ahead = sorted[i + 1];
      vehicle.limit = Infinity;
      if (!ahead || ahead.way !== vehicle.way || ahead.forward !== vehicle.forward || ahead.lane !== vehicle.lane) continue;
      const gap = Math.abs(ahead.s - vehicle.s) - (VEHICLES[ahead.type].length + VEHICLES[vehicle.type].length) / 2;
      // Keep about a second and a half behind; stop short of touching.
      if (gap < vehicle.speed * 1.5 + 3) vehicle.limit = Math.max(ahead.speed * Math.min(Math.max((gap - 1.5) / 6, 0), 1), 0);
    }
  }

  /**
   * Call back with each vehicle that can be seen: (type, x, y, east, north,
   * paint, cargo, shown, lift). A train's cars come as 'coach'; those in a
   * tunnel are not seen, and do not come. lift: how high the road is there,
   * on a bridge.
   */
  eachVehicle(draw) {
    const ways = this.network.ways;
    const spot = this.spare;
    for (const vehicle of this.vehicles) {
      const way = ways[vehicle.way];
      if (way.hidden || vehicle.shown <= 0) continue;
      pointAlong(way, vehicle.s, spot);
      const sign = vehicle.forward ? 1 : -1;
      const east = spot[2] * sign;
      const north = spot[3] * sign;
      // The lane lies to the right of the middle line, seen the way the vehicle travels.
      draw(vehicle.type, spot[0] + north * vehicle.offset, spot[1] - east * vehicle.offset, east, north, vehicle.paint, vehicle.cargo, vehicle.shown, heightAlong(way, vehicle.s));
    }
    for (const train of this.trains) {
      const trail = train.trail;
      if (train.shown <= 0 || trail.length < 2) continue;
      for (let car = 0; car < train.cars; car += 1) {
        // The middle of each car, measured back along where the front has been.
        const back = train.travelled - (car + 0.5) * TRAIN_CAR_METERS;
        let i = trail.length - 1;
        while (i > 0 && trail[i - 1][2] > back) i -= 1;
        if (i === 0 || trail[i - 1][2] > back) break; // the rest has not come into view yet
        const a = trail[i - 1];
        const b = trail[i];
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const t = (back - a[2]) / (b[2] - a[2] || 1);
        // (In a tunnel a car is out of sight: the train comes into view car by car at the tunnel's mouth.)
        if (b[3]) continue;
        draw('coach', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / span, (b[1] - a[1]) / span, train.paint, train.stripe, train.shown, a[4] + (b[4] - a[4]) * t);
      }
    }
  }

  counts() {
    let buses = 0;
    for (const vehicle of this.vehicles) if (vehicle.type === 'bus') buses += 1;
    return { vehicles: this.vehicles.length, buses, trains: this.trains.length, ways: this.network.ways.length };
  }
}

// ── Drawing ───────────────────────────────────────────────────────────────

/**
 * A growing list of coloured triangles: three numbers of position (metres east,
 * north and up) and four of colour for every corner. Colours are stored the way
 * the map blends them, already multiplied by how solid they are.
 */
export class Mesh {
  constructor(corners = 4096) {
    this.positions = new Float32Array(corners * 3);
    this.colours = new Uint8Array(corners * 4);
    this.count = 0;
  }

  clear() {
    this.count = 0;
  }

  room(corners) {
    if (this.count + corners <= this.positions.length / 3) return;
    const size = Math.max((this.count + corners) * 2, 4096);
    const positions = new Float32Array(size * 3);
    positions.set(this.positions.subarray(0, this.count * 3));
    const colours = new Uint8Array(size * 4);
    colours.set(this.colours.subarray(0, this.count * 4));
    this.positions = positions;
    this.colours = colours;
  }

  corner(x, y, z, r, g, b, a) {
    const p = this.count * 3;
    const c = this.count * 4;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.colours[c] = r * a;
    this.colours[c + 1] = g * a;
    this.colours[c + 2] = b * a;
    this.colours[c + 3] = 255 * a;
    this.count += 1;
  }

  /**
   * A corner of light: its colour is added to whatever lies behind it, as
   * strongly as told (0 to 1), and it covers nothing. For the parts of the
   * scene that give light (see "glow" in scene.js). wide: for a point of
   * light in the sky, how much wider than the faintest it is drawn, 0 to 1.
   */
  glow(x, y, z, r, g, b, strength, wide = 0) {
    const p = this.count * 3;
    const c = this.count * 4;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.colours[c] = Math.min(r * strength, 255);
    this.colours[c + 1] = Math.min(g * strength, 255);
    this.colours[c + 2] = Math.min(b * strength, 255);
    this.colours[c + 3] = 255 * wide;
    this.count += 1;
  }

  /** A flat four-cornered face, corners given in order round its edge. */
  face(a, b, c, d, r, g, bl, alpha) {
    this.room(6);
    this.corner(a[0], a[1], a[2], r, g, bl, alpha);
    this.corner(b[0], b[1], b[2], r, g, bl, alpha);
    this.corner(c[0], c[1], c[2], r, g, bl, alpha);
    this.corner(a[0], a[1], a[2], r, g, bl, alpha);
    this.corner(c[0], c[1], c[2], r, g, bl, alpha);
    this.corner(d[0], d[1], d[2], r, g, bl, alpha);
  }
}

/**
 * How bright a face is under a sun: light = { east, north, up } pointing at the
 * sun, or null at night. Faces turned away keep 65% of their colour.
 */
export function faceLight(light, east, north, up) {
  if (!light) return 0.8;
  const facing = Math.max(east * light.east + north * light.north + up * light.up, 0);
  return 0.65 + 0.35 * facing;
}

/** The direction to the sun as { east, north, up }, kept at least 35° above the horizon as the buildings' light is. */
export function lightFrom(sun) {
  if (!sun || !(sun.altitude > 3)) return null;
  const altitude = (Math.max(sun.altitude, 35) * Math.PI) / 180;
  const azimuth = (sun.azimuth * Math.PI) / 180;
  return { east: Math.sin(azimuth) * Math.cos(altitude), north: Math.cos(azimuth) * Math.cos(altitude), up: Math.sin(altitude) };
}

/**
 * Add one vehicle to a mesh: its boxes, and the shade it throws on the road
 * (twelve corners, when the sun is up). (x, y) is its middle, (east, north)
 * the way it points. reach: what shadowReach() gives, or null. scale: 1 is
 * life size. lift: how high the road is under it, on a bridge.
 */
export function drawVehicle(mesh, type, x, y, east, north, paint, cargo, shown, light, reach, scale = 1, lift = 0) {
  const shape = VEHICLES[type];
  const length = shape.length * scale;
  const halfLength = length / 2;
  const halfWidth = (shape.width * scale) / 2;
  // Right of the vehicle, seen the way it points.
  const rightEast = north;
  const rightNorth = -east;

  if (reach) {
    // The shade it throws on the road: from under the vehicle out to where the shadow of its roof falls,
    // all of a piece. (A patch of shade lying apart from the vehicle would make it seem to hover.)
    const direction = (reach.bearing * Math.PI) / 180;
    const tall = shape.boxes.reduce((most, box) => Math.max(most, box[4]), 0) * scale;
    const far = Math.min(reach.factor, VEHICLE_SHADE_LONGEST) * tall;
    const dx = Math.sin(direction) * far;
    const dy = Math.cos(direction) * far;
    const foot = [[-halfLength, -halfWidth], [halfLength, -halfWidth], [halfLength, halfWidth], [-halfLength, halfWidth]].map(([along, across]) => [x + east * along + rightEast * across, y + north * along + rightNorth * across]);
    const outline = hullOf(foot.concat(foot.map(([fx, fy]) => [fx + dx, fy + dy])));
    // (Always four triangles, so that a vehicle is as many corners wherever the sun stands.)
    mesh.room(12);
    for (let i = 1; i <= 4; i += 1) {
      for (const [sx, sy] of [outline[0], outline[Math.min(i, outline.length - 1)], outline[Math.min(i + 1, outline.length - 1)]]) mesh.corner(sx, sy, lift + 0.06, 16, 20, 32, 0.3 * shown);
    }
  }

  let bodies = 0;
  for (const [from, to, share, bottom, top, material, lean] of shape.boxes) {
    const rear = -halfLength + length * from;
    const front = -halfLength + length * to;
    const side = halfWidth * share;
    const low = lift + bottom * scale;
    const high = lift + top * scale;
    // Where the box ends at its top: a cabin draws in towards its roof.
    const rearTop = rear + length * (lean?.[0] ?? 0);
    const frontTop = front - length * (lean?.[1] ?? 0);
    const sideTop = side * (1 - (lean?.[2] ?? 0));
    const slope = lean ? 0.55 : 0; // how far a leaning face looks up at the sky
    const colour = material === 'glass' ? GLASS : material === 'cargo' ? cargo : material === 'tyre' ? TYRE : paint;
    const first = material === 'body' && bodies === 0; // the body proper carries the lights
    if (material === 'body') bodies += 1;
    const at = (along, across, z) => [x + east * along + rightEast * across, y + north * along + rightNorth * across, z];
    const paintFace = (a, b, c, d, nEast, nNorth, nUp, face = colour, mixed = 0, other = colour) => {
      const lit = faceLight(light, nEast, nNorth, nUp);
      mesh.face(a, b, c, d, (face[0] + (other[0] - face[0]) * mixed) * lit, (face[1] + (other[1] - face[1]) * mixed) * lit, (face[2] + (other[2] - face[2]) * mixed) * lit, shown);
    };
    // The top: of a cabin, its roof, in the body's paint.
    paintFace(at(rearTop, -sideTop, high), at(frontTop, -sideTop, high), at(frontTop, sideTop, high), at(rearTop, sideTop, high), 0, 0, 1, lean ? paint : colour);
    // Front and rear: on the body they carry the lights, pale ahead and red behind.
    paintFace(at(front, -side, low), at(front, side, low), at(frontTop, sideTop, high), at(frontTop, -sideTop, high), east, north, slope, colour, first ? 0.34 : 0, HEADLIGHTS);
    paintFace(at(rear, side, low), at(rear, -side, low), at(rearTop, -sideTop, high), at(rearTop, sideTop, high), -east, -north, slope, colour, first ? 0.3 : 0, TAIL_LIGHTS);
    paintFace(at(rear, side, low), at(front, side, low), at(frontTop, sideTop, high), at(rearTop, sideTop, high), rightEast, rightNorth, slope * 0.5);
    paintFace(at(front, -side, low), at(rear, -side, low), at(rearTop, -sideTop, high), at(frontTop, -sideTop, high), -rightEast, -rightNorth, slope * 0.5);
  }
}

/**
 * Fill a mesh with everything that moves. Returns the number of vehicles and
 * train cars drawn. scale: how much larger than life to draw them, so they can
 * still be made out when the map shows a wide area.
 */
export function drawTraffic(mesh, traffic, light, reach, scale = 1) {
  mesh.clear();
  let drawn = 0;
  traffic.eachVehicle((type, x, y, east, north, paint, cargo, shown, lift) => {
    drawVehicle(mesh, type, x, y, east, north, paint, cargo, shown, light, reach, scale, lift);
    drawn += 1;
  });
  return drawn;
}

// ── What stands still ─────────────────────────────────────────────────────

/** A box standing at (x, y), turned so that its length runs along (east, north). lid: the colour of its top, if not that of its sides. */
function drawBox(mesh, x, y, east, north, halfLength, halfWidth, low, high, colour, light, alpha = 1, lid = colour) {
  const rightEast = north;
  const rightNorth = -east;
  const at = (along, across, z) => [x + east * along + rightEast * across, y + north * along + rightNorth * across, z];
  const paintFace = (a, b, c, d, nEast, nNorth, nUp, paint = colour) => {
    const lit = faceLight(light, nEast, nNorth, nUp);
    mesh.face(a, b, c, d, paint[0] * lit, paint[1] * lit, paint[2] * lit, alpha);
  };
  paintFace(at(-halfLength, -halfWidth, high), at(halfLength, -halfWidth, high), at(halfLength, halfWidth, high), at(-halfLength, halfWidth, high), 0, 0, 1, lid);
  paintFace(at(halfLength, -halfWidth, low), at(halfLength, halfWidth, low), at(halfLength, halfWidth, high), at(halfLength, -halfWidth, high), east, north, 0);
  paintFace(at(-halfLength, halfWidth, low), at(-halfLength, -halfWidth, low), at(-halfLength, -halfWidth, high), at(-halfLength, halfWidth, high), -east, -north, 0);
  paintFace(at(-halfLength, halfWidth, low), at(halfLength, halfWidth, low), at(halfLength, halfWidth, high), at(-halfLength, halfWidth, high), rightEast, rightNorth, 0);
  paintFace(at(halfLength, -halfWidth, low), at(-halfLength, -halfWidth, low), at(-halfLength, -halfWidth, high), at(halfLength, -halfWidth, high), -rightEast, -rightNorth, 0);
}

// Which streets have cars parked along them, and how full their kerbs are.
const PARKING = { minor: 0.3, tertiary: 0.22 };
const PARKING_SLOT_METERS = 6;
const PARKING_FROM_CORNER_METERS = 9;
const SHELTER_PAINT = [224, 228, 232];
const SHELTER_ROOF = [70, 82, 100];
// Car parks. Beside the lanes of a car park cars stand in rows, nose or tail to the lane, each in a bay
// marked out on the ground; and so they do, unmarked and fewer, beside any other service lane that has
// room for them. The lanes are on the map. Where the bays are and how full, is made up.
const BAYS_FULL = { parking_aisle: 0.62, lane: 0.3 };
const NO_BAYS = new Set(['driveway', 'alley', 'drive-through', 'emergency_access']);
const BAY_WIDE_METERS = 2.7;
const BAY_DEEP_METERS = 5;
const BAY_FROM_LANE_METERS = 3; // from the middle of the lane to the mouth of a bay
const BAY_FROM_END_METERS = 7; // no bay this close to where the lane meets another
const BAY_CLEAR_OF_STREET_METERS = 5; // room for a pavement between a street and a row of cars
const BAY_NEAR_BUILDING_METERS = 45; // beside a lane that is no car park's, cars stand only this near a building
const BAY_LINE_HALF_METERS = 0.07;

/**
 * Fill a mesh with what stands still along the streets: cars parked at the
 * kerbs of residential streets, cars in rows beside the lanes of car parks,
 * and a shelter at every bus stop on the map. The parked cars are set out
 * by chance, but the same way every time, so a street looks the same whenever
 * it is drawn. most: the most cars, nearest the middle of the network first.
 *
 * built(x, y): whether a building stands at a spot (in the network's metres),
 * and within: [west, south, east, north], the ground that is known for.
 * Without them no car park is filled: a row of cars might stand in a house.
 * near(x, y, reach): whether a building stands within reach of a spot. People
 * park where they are going: beside a lane that is not marked as a car
 * park's, cars stand only near a building, not out along a track through
 * open ground.
 *
 * Returns { parked, shelters, bays }: all the cars, the shelters, and how
 * many of the cars stand in car parks.
 */
export function drawStreet(mesh, network, light, reach, most = 2500, { built = null, within = null, near = null } = {}) {
  mesh.clear();
  const spot = [0, 0, 0, 0];
  let parked = 0;
  let shelters = 0;
  let bays = 0;

  // Every road and track, filed under the squares of ground it passes through: a bay keeps clear of them all.
  const SQUARE = 48;
  const squares = new Map();
  const squareOf = (cellX, cellY) => (cellX + 32768) * 65536 + (cellY + 32768);
  if (built) {
    for (const way of network.ways) {
      if (way.hidden || way.deck > 0) continue;
      const out = way.width / 2 + BAY_CLEAR_OF_STREET_METERS + 1;
      for (let cellX = Math.floor((way.box[0] - out) / SQUARE); cellX <= Math.floor((way.box[2] + out) / SQUARE); cellX += 1) {
        for (let cellY = Math.floor((way.box[1] - out) / SQUARE); cellY <= Math.floor((way.box[3] + out) / SQUARE); cellY += 1) {
          const key = squareOf(cellX, cellY);
          if (!squares.has(key)) squares.set(key, []);
          squares.get(key).push(way);
        }
      }
    }
  }
  const onRoad = (x, y, own) => {
    for (const way of squares.get(squareOf(Math.floor(x / SQUARE), Math.floor(y / SQUARE))) ?? []) {
      if (way === own) continue;
      const clear = way.width / 2 + (way.class === 'service' ? 0.6 : BAY_CLEAR_OF_STREET_METERS);
      if (x < way.box[0] - clear || x > way.box[2] + clear || y < way.box[1] - clear || y > way.box[3] + clear) continue;
      if (nearestOn(way, x, y).distance < clear) return true;
    }
    return false;
  };
  // The cars that stand in bays so far, filed the same way but finer: no two in one spot.
  const SPOT = 4;
  const stood = new Map();
  const taken = (x, y) => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const [px, py] of stood.get(squareOf(Math.floor(x / SPOT) + dx, Math.floor(y / SPOT) + dy)) ?? []) {
          if (Math.hypot(px - x, py - y) < 2.6) return true;
        }
      }
    }
    return false;
  };

  /** Cars at the kerbs of a residential street, both sides, facing the way they would drive off. */
  const alongKerbs = (way) => {
    const random = seededRandom(Math.floor(unitFrom(way.key) * 4294967296));
    const aside = way.width / 2 - 0.65; // the wheels on the kerb side stand just off the edge of the road as drawn
    for (const side of [1, -1]) {
      for (let s = PARKING_FROM_CORNER_METERS + random() * PARKING_SLOT_METERS; s < way.length - PARKING_FROM_CORNER_METERS; s += PARKING_SLOT_METERS) {
        const there = random() < PARKING[way.class];
        const kind = random();
        const paint = pick(CAR_PAINT, random);
        // Nobody parks in a bus stop.
        if (!there || parked >= most || way.stops.some((stop) => stop.kerb === side && Math.abs(stop.at - s) < 14)) continue;
        pointAlong(way, s, spot);
        // On the right of the street a car faces the way the street runs, on the left the other way, unless the street is one-way.
        const facing = side === 1 || way.oneway === 1 ? 1 : -1;
        const turned = way.oneway === -1 ? -facing : facing;
        drawVehicle(mesh, kind < 0.32 ? 'suv' : kind < 0.38 ? 'van' : 'car', spot[0] + spot[3] * side * aside, spot[1] - spot[2] * side * aside, spot[2] * turned, spot[3] * turned, paint, paint, 1, light, reach);
        parked += 1;
      }
    }
  };

  /** Cars in a row of bays down each side of a service lane, wherever there is room for a bay. */
  const besideLane = (way) => {
    const marked = way.service === 'parking_aisle';
    const full = marked ? BAYS_FULL.parking_aisle : BAYS_FULL.lane;
    const random = seededRandom(Math.floor(unitFrom(`${way.key}:bays`) * 4294967296));
    const middle = BAY_FROM_LANE_METERS + BAY_DEEP_METERS / 2;
    const deep = BAY_DEEP_METERS / 2 + 0.5;
    const wide = BAY_WIDE_METERS / 2;
    for (const side of [1, -1]) {
      for (let s = BAY_FROM_END_METERS; s <= way.length - BAY_FROM_END_METERS; s += BAY_WIDE_METERS) {
        const car = random() < full;
        const kind = random();
        const paint = pick(CAR_PAINT, random);
        const noseOut = random() < 0.7; // most drive straight in
        pointAlong(way, s, spot);
        // Out from the lane, to its right or to its left; and the bay's middle, where a car would stand.
        const outX = spot[3] * side;
        const outY = -spot[2] * side;
        const x = spot[0] + outX * middle;
        const y = spot[1] + outY * middle;
        if (within && (x < within[0] || x > within[2] || y < within[1] || y > within[3])) continue;
        if (!marked && near && !near(x, y, BAY_NEAR_BUILDING_METERS)) continue;
        // Room for a bay: no building and no road from its mouth to its far end, across its whole width.
        const corner = (along, across) => [x + outX * along + spot[2] * across, y + outY * along + spot[3] * across];
        const far = corner(deep, 0);
        if ([corner(0, 0), corner(deep, wide), corner(deep, -wide), corner(-deep * 0.6, wide), corner(-deep * 0.6, -wide)].some(([px, py]) => built(px, py)) || onRoad(x, y, way) || onRoad(far[0], far[1], way)) continue;
        if (taken(x, y)) continue;
        if (marked) {
          // The line between this bay and the one before it.
          const from = corner(-BAY_DEEP_METERS / 2, -wide);
          const to = corner(BAY_DEEP_METERS / 2, -wide);
          const hx = spot[2] * BAY_LINE_HALF_METERS;
          const hy = spot[3] * BAY_LINE_HALF_METERS;
          mesh.face([from[0] - hx, from[1] - hy, MARKS_UP_METERS], [from[0] + hx, from[1] + hy, MARKS_UP_METERS], [to[0] + hx, to[1] + hy, MARKS_UP_METERS], [to[0] - hx, to[1] - hy, MARKS_UP_METERS], LINE_PAINT[0], LINE_PAINT[1], LINE_PAINT[2], 0.85);
        }
        if (!car || parked >= most) continue;
        const turned = noseOut ? 1 : -1;
        drawVehicle(mesh, kind < 0.36 ? 'suv' : kind < 0.42 ? 'van' : 'car', x, y, outX * turned, outY * turned, paint, paint, 1, light, reach);
        const key = squareOf(Math.floor(x / SPOT), Math.floor(y / SPOT));
        if (!stood.has(key)) stood.set(key, []);
        stood.get(key).push([x, y]);
        parked += 1;
        bays += 1;
      }
    }
  };

  // Streets and car parks alike, the nearest first: the cars that are left out are the far ones.
  const places = [];
  network.ways.forEach((way) => {
    if (way.rail || way.hidden || way.deck > 0) return;
    const far = Math.hypot((way.box[0] + way.box[2]) / 2, (way.box[1] + way.box[3]) / 2);
    if (PARKING[way.class] > 0 && way.length >= PARKING_FROM_CORNER_METERS * 2 + PARKING_SLOT_METERS) places.push({ way, far, park: alongKerbs });
    else if (built && way.class === 'service' && !NO_BAYS.has(way.service) && way.length >= BAY_FROM_END_METERS * 2 + BAY_WIDE_METERS) places.push({ way, far, park: besideLane });
  });
  places.sort((a, b) => a.far - b.far);
  for (const { way, park } of places) {
    if (parked >= most) break;
    park(way);
  }

  for (const way of network.ways) {
    if (way.rail || way.hidden) continue;
    for (const stop of way.stops) {
      pointAlong(way, stop.at, spot);
      // Behind the kerb, open towards the street: a glass back and a dark roof on two posts.
      const aside = (way.width / 2 + 1.6) * stop.kerb;
      const x = spot[0] + spot[3] * aside;
      const y = spot[1] - spot[2] * aside;
      const back = 0.6 * stop.kerb;
      drawBox(mesh, x + spot[3] * back, y - spot[2] * back, spot[2], spot[3], 2.1, 0.06, 0.2, 2.3, SHELTER_PAINT, light, 0.75);
      drawBox(mesh, x, y, spot[2], spot[3], 2.3, 0.85, 2.3, 2.45, SHELTER_ROOF, light);
      for (const along of [-2.1, 2.1]) drawBox(mesh, x + spot[2] * along + spot[3] * back, y + spot[3] * along - spot[2] * back, spot[2], spot[3], 0.06, 0.06, 0, 2.3, SHELTER_ROOF, light);
      shelters += 1;
    }
  }
  return { parked, shelters, bays };
}

// ── What is painted on the roads ──────────────────────────────────────────

const MARKED = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const CROSSED = new Set(['primary', 'secondary', 'tertiary', 'minor']);
const THROUGH = new Set(['primary', 'secondary', 'tertiary']);
const MARKS_UP_METERS = 0.16; // just clear of the shadows the map lays on the ground
const DASH_METERS = 3;
const DASH_EVERY_METERS = 9;
const MARKS_CLEAR_OF_END_METERS = 8;
const CROSSING_DEEP_METERS = 3;
const LINE_PAINT = [240, 240, 236];
const CENTRE_PAINT = [233, 196, 92];

/**
 * Fill a mesh with what is painted on the roads: on the main roads a broken
 * line between lanes, a line along each edge and, where traffic runs both
 * ways, a yellow line down the middle; and a zebra crossing over a street
 * where it meets, at an angle, a through street at least as large as itself
 * (so over the mouth of a side street on a main road, and over all the arms
 * of a crossroads of main roads; but not over a main road at every side
 * street, nor where two side streets meet).
 *
 * The lanes are the ones the traffic keeps to, and nothing is painted beyond
 * the width a road is drawn at. Whether a given road really has these lines,
 * and a given junction a crossing, the map does not say.
 * Returns { lines, crossings }.
 */
export function drawMarks(mesh, network) {
  mesh.clear();
  const a = [0, 0, 0, 0];
  const b = [0, 0, 0, 0];
  let lines = 0;
  let crossings = 0;
  const z = MARKS_UP_METERS;
  // A strip of paint along a way, from one distance to another, at an offset to the left of its middle.
  const strip = (way, from, to, across, half, paint, alpha = 1) => {
    pointAlong(way, from, a);
    pointAlong(way, to, b);
    // (Down in a cutting the paint lies on the road down there.)
    const za = way.sunk ? z + heightAlong(way, from) : z;
    const zb = way.sunk ? z + heightAlong(way, to) : z;
    mesh.face(
      [a[0] - a[3] * (across + half), a[1] + a[2] * (across + half), za],
      [a[0] - a[3] * (across - half), a[1] + a[2] * (across - half), za],
      [b[0] - b[3] * (across - half), b[1] + b[2] * (across - half), zb],
      [b[0] - b[3] * (across + half), b[1] + b[2] * (across + half), zb],
      paint[0],
      paint[1],
      paint[2],
      alpha,
    );
  };
  const painted = (way) => !way.rail && !way.hidden && !(way.deck > 0);

  for (const way of network.ways) {
    if (!painted(way) || !MARKED.has(way.class) || way.length < MARKS_CLEAR_OF_END_METERS * 2 + DASH_METERS) continue;
    const band = way.width / 2 - 0.35;
    const from = MARKS_CLEAR_OF_END_METERS;
    const to = way.length - MARKS_CLEAR_OF_END_METERS;
    const both = way.oneway === 0;
    // Where the lines between lanes lie, and the two edges.
    const between = [];
    for (let k = 1; k < way.lanes; k += 1) {
      if (both) between.push(k * LANE_METERS, -k * LANE_METERS);
      else between.push((k - way.lanes / 2) * LANE_METERS);
    }
    const edge = Math.min((both ? way.lanes : way.lanes / 2) * LANE_METERS + 0.25, band);
    for (let s = from; s + DASH_METERS <= to; s += DASH_EVERY_METERS) {
      for (const across of between) if (Math.abs(across) < edge - 0.8) strip(way, s, s + DASH_METERS, across, 0.07, LINE_PAINT, 0.9);
    }
    // The lines that run unbroken: laid in short lengths, so that they follow a bend.
    for (let s = from; s < to; s += DASH_EVERY_METERS) {
      const until = Math.min(s + DASH_EVERY_METERS, to);
      // (Along a one-way carriageway the edge by the median, on the left of its traffic, is yellow: as on Saudi roads.)
      strip(way, s, until, edge, 0.07, way.oneway === 1 ? CENTRE_PAINT : LINE_PAINT, 0.85);
      strip(way, s, until, -edge, 0.07, way.oneway === -1 ? CENTRE_PAINT : LINE_PAINT, 0.85);
      if (both) strip(way, s, until, 0, 0.09, CENTRE_PAINT, 0.9);
    }
    lines += 1;
  }

  // Zebra crossings, just outside the junction itself.
  const corners = [];
  for (const [key, meeting] of network.joins) {
    const arms = [];
    for (const join of meeting) {
      const way = network.ways[join.way];
      if (!way || !painted(way)) continue;
      // The way each arm leaves the junction.
      pointAlong(way, join.atStart ? 0 : way.length, a);
      arms.push({ way, atStart: join.atStart, x: a[0], y: a[1], east: join.atStart ? a[2] : -a[2], north: join.atStart ? a[3] : -a[3] });
    }
    if (arms.length < 3 || arms.some((arm) => arm.way.class === 'motorway' || arm.way.class === 'trunk')) continue;
    corners.push({ key, x: arms[0].x, y: arms[0].y, arms });
  }
  for (const corner of corners) {
    const widest = Math.max(...corner.arms.map((arm) => Math.min(arm.way.width, 16)));
    for (const arm of corner.arms) {
      const way = arm.way;
      const band = Math.min(way.width, 16);
      if (!CROSSED.has(way.class) || !(band >= 6)) continue;
      // Met at an angle (not its own continuation, nor a fork off it) by a through street no smaller than itself.
      const crossed = corner.arms.some((other) => other !== arm && THROUGH.has(other.way.class) && other.way.width >= way.width - 0.1 && Math.abs(other.east * arm.east + other.north * arm.north) < 0.7);
      if (!crossed) continue;
      const near = widest / 2 + 1.5;
      if (way.length < near * 2 + CROSSING_DEEP_METERS * 2 + 6) continue;
      const start = arm.atStart ? near : way.length - near - CROSSING_DEEP_METERS;
      // Not inside another junction that lies a few steps on.
      pointAlong(way, start + CROSSING_DEEP_METERS / 2, a);
      if (corners.some((other) => other !== corner && Math.hypot(other.x - a[0], other.y - a[1]) < 12)) continue;
      const half = band / 2 - 0.5;
      for (let across = -half + 0.25; across <= half - 0.25; across += 1) strip(way, start, start + CROSSING_DEEP_METERS, across, 0.25, LINE_PAINT, 0.9);
      crossings += 1;
    }
  }
  return { lines, crossings };
}

const ROAD_PAINT = [124, 129, 139];
const RAIL_BED_PAINT = [198, 192, 180];
const RAIL_PAINT = [78, 82, 92];
const CONCRETE_PAINT = [214, 209, 198];
const PARAPET_PAINT = [233, 229, 221];
const MARK_PAINT = [236, 236, 232];

/**
 * Fill a mesh with the bridges of a network: for every stretch of road or
 * track on a bridge a deck at its height, with parapets along both edges, a
 * line down the middle of a road and rails on a viaduct, standing on piers.
 * A track on the ground gets its bed and its rails here too, for the trains
 * to be seen to run on. Returns the number of stretches of bridge drawn.
 */
export function drawBridges(mesh, network, light, stayed = []) {
  mesh.clear();
  const spot = [0, 0, 0, 0];
  let drawn = 0;
  const shade = (paint, east, north, up) => {
    const lit = faceLight(light, east, north, up);
    return [paint[0] * lit, paint[1] * lit, paint[2] * lit];
  };
  // The bridges that hang from cables stand on no piers of their own.
  const hung = stayedHere(network, stayed);
  const hangs = (x, y) => hung.some((frame) => {
    const along = (x - frame.x) * frame.east + (y - frame.y) * frame.north;
    const across = -(x - frame.x) * frame.north + (y - frame.y) * frame.east;
    return along > frame.from - 4 && along < frame.to + 4 && Math.abs(across) < frame.bridge.between + 14;
  });
  for (const frame of hung) drawStays(mesh, network, frame, shade);
  for (const way of network.ways) {
    if (way.hidden) continue;
    if (way.rail && !(way.deck > 0)) {
      // A track on the ground: a bed of ballast, with the rails as a dark band down its middle.
      const bed = shade(RAIL_BED_PAINT, 0, 0, 1);
      const rails = shade(RAIL_PAINT, 0, 0, 1);
      const steps = Math.max(Math.ceil(way.length / 9), 1);
      let before = null;
      for (let i = 0; i <= steps; i += 1) {
        pointAlong(way, (way.length * i) / steps, spot);
        const here = { x: spot[0], y: spot[1], east: spot[2], north: spot[3] };
        if (before) {
          const edge = (cut, across) => [cut.x - cut.north * across, cut.y + cut.east * across, TRACK_UP_METERS];
          for (const [from, to, paint] of [[TRACK_BED_HALF_METERS, 0.9, bed], [0.9, -0.9, rails], [-0.9, -TRACK_BED_HALF_METERS, bed]]) {
            mesh.face(edge(before, from), edge(before, to), edge(here, to), edge(here, from), paint[0], paint[1], paint[2], 1);
          }
        }
        before = here;
      }
      continue;
    }
    if (!(way.deck > 0)) continue;
    const half = way.rail ? RAIL_DECK_HALF_METERS : way.width / 2 + 0.7;
    const steps = Math.max(Math.ceil(way.length / 9), 1);
    // The deck's two edges at each step along it, and how high it is there.
    const cuts = [];
    for (let i = 0; i <= steps; i += 1) {
      const s = (way.length * i) / steps;
      pointAlong(way, s, spot);
      cuts.push({ x: spot[0], y: spot[1], east: spot[2], north: spot[3], h: Math.max(heightAlong(way, s), 0.05), s });
    }
    const edge = (cut, across, z) => [cut.x - cut.north * across, cut.y + cut.east * across, z]; // across: metres to the left of the way
    const top = shade(way.rail ? RAIL_BED_PAINT : ROAD_PAINT, 0, 0, 1);
    const capTop = shade(PARAPET_PAINT, 0, 0, 1);
    for (let i = 1; i < cuts.length; i += 1) {
      const a = cuts[i - 1];
      const b = cuts[i];
      mesh.face(edge(a, half, a.h), edge(a, -half, a.h), edge(b, -half, b.h), edge(b, half, b.h), top[0], top[1], top[2], 1);
      for (const side of [1, -1]) {
        // Its flank, from the underside of the deck to the top of the parapet; then the parapet's top and its inner face.
        const out = shade(CONCRETE_PAINT, -a.north * side, a.east * side, 0);
        const inner = shade(CONCRETE_PAINT, a.north * side, -a.east * side, 0);
        const under = (cut) => Math.max(cut.h - DECK_THICK_METERS, 0);
        mesh.face(edge(a, half * side, under(a)), edge(b, half * side, under(b)), edge(b, half * side, b.h + PARAPET_METERS), edge(a, half * side, a.h + PARAPET_METERS), out[0], out[1], out[2], 1);
        const lip = (half - 0.35) * side;
        mesh.face(edge(a, half * side, a.h + PARAPET_METERS), edge(b, half * side, b.h + PARAPET_METERS), edge(b, lip, b.h + PARAPET_METERS), edge(a, lip, a.h + PARAPET_METERS), capTop[0], capTop[1], capTop[2], 1);
        mesh.face(edge(a, lip, a.h), edge(b, lip, b.h), edge(b, lip, b.h + PARAPET_METERS), edge(a, lip, a.h + PARAPET_METERS), inner[0], inner[1], inner[2], 1);
      }
      if (way.rail) {
        // The two rails, as one dark band down the middle of the bed.
        const rails = shade(RAIL_PAINT, 0, 0, 1);
        mesh.face(edge(a, 0.9, a.h + 0.06), edge(a, -0.9, a.h + 0.06), edge(b, -0.9, b.h + 0.06), edge(b, 0.9, b.h + 0.06), rails[0], rails[1], rails[2], 1);
      } else if (way.lanes >= 2 && i % 2 === 0) {
        // A broken line between the lanes.
        const mark = shade(MARK_PAINT, 0, 0, 1);
        mesh.face(edge(a, 0.13, a.h + 0.05), edge(a, -0.13, a.h + 0.05), edge(b, -0.13, b.h + 0.05), edge(b, 0.13, b.h + 0.05), mark[0], mark[1], mark[2], 0.85);
      }
    }
    // Piers: one every 30 m where the deck is clear of the ground, as wide as half the deck.
    const pierHalf = Math.min(Math.max(half * 0.5, 1), 3.4);
    for (let s = PIER_EVERY_METERS / 2; s < way.length; s += PIER_EVERY_METERS) {
      const high = heightAlong(way, s) - DECK_THICK_METERS;
      if (high < 2.5) continue;
      pointAlong(way, s, spot);
      if (!way.rail && hangs(spot[0], spot[1])) continue;
      const pier = { x: spot[0], y: spot[1], east: spot[2], north: spot[3] };
      const at = (along, across, z) => [pier.x + pier.east * along - pier.north * across, pier.y + pier.north * along + pier.east * across, z];
      for (const [nAlong, nAcross] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const lit = shade(CONCRETE_PAINT, pier.east * nAlong - pier.north * nAcross, pier.north * nAlong + pier.east * nAcross, 0);
        const a = nAlong !== 0 ? at(0.8 * nAlong, -pierHalf, 0) : at(-0.8, pierHalf * nAcross, 0);
        const b = nAlong !== 0 ? at(0.8 * nAlong, pierHalf, 0) : at(0.8, pierHalf * nAcross, 0);
        mesh.face(a, b, [b[0], b[1], high], [a[0], a[1], high], lit[0] * 0.92, lit[1] * 0.92, lit[2] * 0.92, 1);
      }
    }
    drawn += 1;
  }
  return drawn;
}

const MAST_PAINT = [222, 217, 206];
const CABLE_PAINT = [247, 246, 242];
const CABLE_HALF_METERS = 0.28; // drawn thicker than life, to be seen from across the city
const STAYS_WITHIN_METERS = 9000;

/** The road deck nearest to a point, within a reach: how high it is there and half its width. Null if there is none. */
function deckNear(network, x, y, reach) {
  let best = null;
  for (const way of network.ways) {
    if (!(way.deck > 0) || way.hidden || way.rail) continue;
    if (x < way.box[0] - reach || x > way.box[2] + reach || y < way.box[1] - reach || y > way.box[3] + reach) continue;
    const found = nearestOn(way, x, y);
    if (found.distance > reach || (best && found.distance >= best.distance)) continue;
    best = { distance: found.distance, h: heightAlong(way, found.along), half: way.width / 2 + 0.7 };
  }
  return best;
}

/**
 * Which of the cable-stayed bridges (see STAYED_BRIDGES in landmarks.js) have
 * their deck among a network's ways, each with its place in the network's
 * metres: [{ bridge, x, y, east, north, from, to }], from and to being how
 * far its cables reach along the deck either side of its middle.
 */
export function stayedHere(network, stayed = []) {
  const frames = [];
  if (!network?.origin) return frames;
  const squeeze = Math.cos((network.origin.lat * Math.PI) / 180) * METERS_PER_DEGREE;
  for (const bridge of stayed) {
    const x = (bridge.at[0] - network.origin.lng) * squeeze;
    const y = (bridge.at[1] - network.origin.lat) * METERS_PER_DEGREE;
    if (Math.hypot(x, y) > STAYS_WITHIN_METERS) continue;
    const turn = (bridge.bearing * Math.PI) / 180;
    const frame = { bridge, x, y, east: Math.sin(turn), north: Math.cos(turn), from: Math.min(...bridge.masts) - bridge.reach.bank, to: Math.max(...bridge.masts) + bridge.reach.bank };
    // Every mast must have the deck under it; a bridge only half on the map is left as the map has it.
    const decked = bridge.masts.every((along) => deckNear(network, x + frame.east * along, y + frame.north * along, bridge.between + 8));
    if (decked) frames.push(frame);
  }
  return frames;
}

/**
 * What a cable-stayed bridge has that other bridges have not: the strip down
 * the middle of its deck, its masts standing in that strip, and from each
 * mast a fan of cables down to the deck on either side.
 */
function drawStays(mesh, network, frame, shade) {
  const { bridge, east, north } = frame;
  const at = (along, across, z) => [frame.x + east * along - north * across, frame.y + north * along + east * across, z];
  const deckAt = (along) => {
    const [x, y] = at(along, 0, 0);
    return deckNear(network, x, y, bridge.between + 8) ?? { h: 0.05, half: bridge.between - 2 };
  };
  // The middle strip, from the first cable to the last, between the two carriageways.
  const strip = Math.max(bridge.between - deckAt(0).half + 0.5, 1.2);
  const top = shade(PARAPET_PAINT, 0, 0, 1);
  const pieces = Math.ceil((frame.to - frame.from) / 12);
  for (let i = 0; i < pieces; i += 1) {
    const a = frame.from + ((frame.to - frame.from) * i) / pieces;
    const b = frame.from + ((frame.to - frame.from) * (i + 1)) / pieces;
    const ha = deckAt(a).h + 0.3;
    const hb = deckAt(b).h + 0.3;
    mesh.face(at(a, strip, ha), at(a, -strip, ha), at(b, -strip, hb), at(b, strip, hb), top[0], top[1], top[2], 1);
  }
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // the four ways a mast's faces look: along the deck and across it
  for (const place of bridge.masts) {
    const deck = deckAt(place).h;
    const crown = deck + bridge.mast;
    // Under the deck, one broad pier carries mast and deck together.
    const pierHalf = bridge.between + deckAt(place).half - 1.5;
    const under = Math.max(deck - DECK_THICK_METERS, 0);
    if (under > 1) {
      for (const [nAlong, nAcross] of sides) {
        const lit = shade(CONCRETE_PAINT, east * nAlong - north * nAcross, north * nAlong + east * nAcross, 0);
        const a = nAlong !== 0 ? at(place + 2.4 * nAlong, -pierHalf, 0) : at(place - 2.4, pierHalf * nAcross, 0);
        const b = nAlong !== 0 ? at(place + 2.4 * nAlong, pierHalf, 0) : at(place + 2.4, pierHalf * nAcross, 0);
        mesh.face(a, b, [b[0], b[1], under], [a[0], a[1], under], lit[0] * 0.92, lit[1] * 0.92, lit[2] * 0.92, 1);
      }
    }
    // The mast: a slender concrete blade, a little slimmer at its head than at its foot.
    const foot = [2.4, 1.8];
    const head = [1.7, 1.3];
    for (const [nAlong, nAcross] of sides) {
      const lit = shade(MAST_PAINT, east * nAlong - north * nAcross, north * nAlong + east * nAcross, 0);
      const corner = (size, turn, z) => (nAlong !== 0 ? at(place + size[0] * nAlong, size[1] * turn, z) : at(place + size[0] * turn, size[1] * nAcross, z));
      mesh.face(corner(foot, -1, deck), corner(foot, 1, deck), corner(head, 1, crown), corner(head, -1, crown), lit[0], lit[1], lit[2], 1);
    }
    const cap = shade(MAST_PAINT, 0, 0, 1);
    mesh.face(at(place - head[0], -head[1], crown), at(place + head[0], -head[1], crown), at(place + head[0], head[1], crown), at(place - head[0], head[1], crown), cap[0], cap[1], cap[2], 1);
    // The cables: the shortest from two fifths of the way up the mast to near its foot, the longest from its head to the far end of its fan.
    for (const towards of [-1, 1]) {
      const inwards = Math.sign(place) !== towards; // a fan towards the middle of the bridge reaches further than one towards the bank
      const reach = bridge.masts.length > 1 && inwards ? bridge.reach.span : bridge.reach.bank;
      for (let i = 0; i < bridge.cables; i += 1) {
        const t = bridge.cables > 1 ? i / (bridge.cables - 1) : 1;
        const anchor = place + towards * (14 + (reach - 14) * t);
        const high = [place + towards * 1.2, deck + bridge.mast * (0.4 + 0.585 * t)];
        const low = [anchor, deckAt(anchor).h + 0.6];
        const w = CABLE_HALF_METERS;
        // Two ribbons crossed, so the cable shows from the side and from above.
        mesh.face(at(high[0], 0, high[1] + w), at(high[0], 0, high[1] - w), at(low[0], 0, low[1] - w), at(low[0], 0, low[1] + w), CABLE_PAINT[0], CABLE_PAINT[1], CABLE_PAINT[2], 1);
        mesh.face(at(high[0], w, high[1]), at(high[0], -w, high[1]), at(low[0], -w, low[1]), at(low[0], w, low[1]), CABLE_PAINT[0] * 0.93, CABLE_PAINT[1] * 0.93, CABLE_PAINT[2] * 0.93, 1);
      }
    }
  }
}

/** True if a point lies inside a ring of [x, y] corners. */
function insideRing(ring, x, y) {
  let inside = false;
  for (let i = 1; i < ring.length; i += 1) {
    const [x0, y0] = ring[i - 1];
    const [x1, y1] = ring[i];
    if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
  }
  return inside;
}

const VAULT_PAINT = [226, 229, 232];
const VAULT_GLASS = [132, 160, 184];

/** A barrel vault over a long building: along (east, north), from the roof's edge up to a ridge and down again. */
function drawVault(mesh, ring, east, north, top, light) {
  let low = Infinity;
  let high = -Infinity;
  let lowAcross = Infinity;
  let highAcross = -Infinity;
  for (const [x, y] of ring) {
    const along = x * east + y * north;
    const across = -x * north + y * east;
    low = Math.min(low, along);
    high = Math.max(high, along);
    lowAcross = Math.min(lowAcross, across);
    highAcross = Math.max(highAcross, across);
  }
  const eaves = 1.2; // how far the roof reaches past the walls
  const middle = (lowAcross + highAcross) / 2;
  const half = (highAcross - lowAcross) / 2 + eaves;
  const rise = Math.min(Math.max(half * 0.36, 2), 4.6);
  const at = (along, across, z) => [along * east - across * north, along * north + across * east, z];
  const strips = 8;
  const edge = (i) => {
    const turn = (-1 + (2 * i) / strips) * (Math.PI / 2);
    return [middle + Math.sin(turn) * half, top + Math.cos(turn) * rise, turn];
  };
  for (let i = 0; i < strips; i += 1) {
    const [across0, z0, turn0] = edge(i);
    const [across1, z1, turn1] = edge(i + 1);
    const turn = (turn0 + turn1) / 2;
    // Each strip looks outwards and up; the two along the ridge are glass.
    const lit = faceLight(light, -north * Math.sin(turn) * 0.8, east * Math.sin(turn) * 0.8, Math.cos(turn) * 0.6 + 0.4);
    const paint = i === strips / 2 - 1 || i === strips / 2 ? VAULT_GLASS : VAULT_PAINT;
    mesh.face(at(low - eaves, across0, z0), at(high + eaves, across0, z0), at(high + eaves, across1, z1), at(low - eaves, across1, z1), paint[0] * lit, paint[1] * lit, paint[2] * lit, 1);
    // The two ends, closed.
    for (const [end, facing] of [[low - eaves, -1], [high + eaves, 1]]) {
      const gable = faceLight(light, east * facing, north * facing, 0);
      mesh.face(at(end, across0, top), at(end, across1, top), at(end, across1, z1), at(end, across0, z0), VAULT_PAINT[0] * gable, VAULT_PAINT[1] * gable, VAULT_PAINT[2] * gable, 1);
    }
  }
}

const ROOF_PAINT = [233, 230, 222]; // plaster, where a building's own colour is not known
const PLANT_PAINT = [176, 180, 184];
const PLANT_LID = [120, 124, 130]; // the grille over the fans
const UNIT_PAINT = [206, 208, 209];
const UNIT_LID = [132, 136, 142];
const TANK_PAINT = [230, 232, 230];
const TANK_LID = [208, 211, 210];
const PANEL_PAINT = [48, 64, 100]; // the glass of a solar panel
const AWNING_PAINT = [224, 208, 178];
const POST_PAINT = [150, 142, 128];
const MAST_PAINT_ROOF = [210, 210, 214];
const ROOF_SHADE_UP = 0.05; // how far above the roof the shade of what stands on it is laid
const ROOF_LAMP_UP = 0.12; // and how far above it the light of a lamp lies
const ROOF_SHADE_LONGEST = 8;
// By night the light is even, and a box of one colour all round is a flat patch on its roof. What stands on
// the roofs is given a little form then: lit as if from above and a touch from the south-west, and dimmed
// until its top is as bright as everything else is by night.
const NIGHT_FORM = { east: -0.2, north: -0.35, up: 0.9 };
const NIGHT_DIM = 0.83;

/** The corners of the smallest outline without dents that holds a set of points: [[x, y], …], anticlockwise. */
export function hullOf(points) {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  return half(sorted).concat(half(sorted.reverse()));
}

/**
 * Fill a mesh with what stands on flat roofs. On a house: the room at the
 * head of the stairs, a water tank, the outdoor halves of its air
 * conditioners, on some an awning to sit under or a few solar panels. On a
 * block of flats or shops more of the same, and on a large roof rows of
 * cooling plant. On a tower the lift's machine room, plant, and on the
 * tallest a mast.
 *
 * buildings: [{ ring: [[x, y], …] in metres, top: the height of the roof,
 * vault: true for a station, kind: 'house', 'block', 'shops' or 'tower',
 * wall: the colour of its walls as [red, green, blue], seed: a number of its
 * own }]. A station gets a long vaulted roof with a strip of glass along its
 * ridge, in place of furniture.
 * fall: how far a shadow falls for each metre of height, [east, north], or
 * null by night; shade: a Mesh the shade of each thing on its roof is added
 * to (it is not emptied first). beacons: a list the top of each mast is
 * added to, as [x, y, height]: where the red lamp of a tall tower goes.
 * lamps: a list the lamps left on up on the roofs are added to, the same
 * way: by the door at the head of the stairs on three roofs in ten, and
 * under every awning.
 *
 * Nobody maps these things, so they are made up: placed by chance, but the
 * same way every time for the same building. Returns the number of roofs
 * furnished.
 */
export function drawRoofs(mesh, buildings, sunlight, { fall = null, shade = null, beacons = null, lamps = null } = {}) {
  mesh.clear();
  let furnished = 0;
  const light = sunlight ?? NIGHT_FORM;
  const dim = sunlight ? 1 : NIGHT_DIM;
  const toned = (paint) => (dim === 1 ? paint : paint.map((part) => part * dim));
  for (const building of buildings) {
    const ring = building.ring;
    if (!Array.isArray(ring) || ring.length < 4) continue;
    // Its area, its middle, and the way its longest wall runs.
    let doubled = 0;
    let sumX = 0;
    let sumY = 0;
    let longest = 0;
    let east = 1;
    let north = 0;
    for (let i = 1; i < ring.length; i += 1) {
      const [x0, y0] = ring[i - 1];
      const [x1, y1] = ring[i];
      const cross = x0 * y1 - x1 * y0;
      doubled += cross;
      sumX += (x0 + x1) * cross;
      sumY += (y0 + y1) * cross;
      const wall = Math.hypot(x1 - x0, y1 - y0);
      if (wall > longest) {
        longest = wall;
        east = (x1 - x0) / wall;
        north = (y1 - y0) / wall;
      }
    }
    const area = Math.abs(doubled) / 2;
    if (!(area > 45) || !(building.top > 0)) continue;
    if (building.vault) {
      drawVault(mesh, ring, east, north, building.top, sunlight);
      furnished += 1;
      continue;
    }
    const middleX = sumX / (3 * doubled);
    const middleY = sumY / (3 * doubled);
    const random = seededRandom(Number.isFinite(building.seed) ? building.seed : Math.round(middleX * 131 + middleY * 71) + Math.round(area));
    const top = building.top;
    const outline = shade && fall ? ring.slice(0, -1) : null;
    const taken = []; // what stands on this roof so far: [x, y, as far as it reaches]
    const fits = (x, y, halfLength, halfWidth) => {
      for (const [along, across] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!insideRing(ring, x + east * along * (halfLength + 0.6) + north * across * (halfWidth + 0.6), y + north * along * (halfLength + 0.6) - east * across * (halfWidth + 0.6))) return false;
      }
      const reach = Math.hypot(halfLength, halfWidth);
      return !taken.some(([tx, ty, far]) => Math.hypot(tx - x, ty - y) < far + reach * 0.8);
    };
    // The shade of something that stands so high on corners given as [x, y].
    const shadeOf = (corners, height) => {
      if (!outline) return;
      const pull = Math.min(1, ROOF_SHADE_LONGEST / Math.max(Math.hypot(fall[0], fall[1]) * height, 0.001));
      const dx = fall[0] * height * pull;
      const dy = fall[1] * height * pull;
      shadeOnRoof(shade, outline, hullOf(corners.concat(corners.map(([x, y]) => [x + dx, y + dy]))), top + ROOF_SHADE_UP);
    };
    const cornersOf = (x, y, halfLength, halfWidth) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([along, across]) => [x + east * along * halfLength + north * across * halfWidth, y + north * along * halfLength - east * across * halfWidth]);
    const box = (x, y, halfLength, halfWidth, height, colour, lid = colour) => {
      drawBox(mesh, x, y, east, north, halfLength, halfWidth, top, top + height, toned(colour), light, 1, toned(lid));
      shadeOf(cornersOf(x, y, halfLength, halfWidth), height);
      taken.push([x, y, Math.hypot(halfLength, halfWidth)]);
    };
    // A water tank: round, as far as six sides make it.
    const tank = (x, y, radius, height) => {
      const corners = [];
      for (let i = 0; i < 6; i += 1) corners.push([x + Math.cos((i * Math.PI) / 3) * radius, y + Math.sin((i * Math.PI) / 3) * radius]);
      for (let i = 0; i < 6; i += 1) {
        const [x0, y0] = corners[i];
        const [x1, y1] = corners[(i + 1) % 6];
        const lit = faceLight(light, Math.cos(((i + 0.5) * Math.PI) / 3), Math.sin(((i + 0.5) * Math.PI) / 3), 0) * dim;
        mesh.face([x0, y0, top], [x1, y1, top], [x1, y1, top + height], [x0, y0, top + height], TANK_PAINT[0] * lit, TANK_PAINT[1] * lit, TANK_PAINT[2] * lit, 1);
      }
      const lit = faceLight(light, 0, 0, 1) * dim;
      const lidAt = (i) => [corners[i][0], corners[i][1], top + height];
      mesh.face(lidAt(0), lidAt(1), lidAt(2), lidAt(3), TANK_LID[0] * lit, TANK_LID[1] * lit, TANK_LID[2] * lit, 1);
      mesh.face(lidAt(0), lidAt(3), lidAt(4), lidAt(5), TANK_LID[0] * lit, TANK_LID[1] * lit, TANK_LID[2] * lit, 1);
      shadeOf(corners, height);
      taken.push([x, y, radius]);
    };
    // A spot part of the way from the middle towards a corner.
    const somewhere = (least = 0.2, most = 0.7) => {
      const corner = ring[Math.floor(random() * (ring.length - 1))];
      const share = least + random() * (most - least);
      return [middleX + (corner[0] - middleX) * share, middleY + (corner[1] - middleY) * share];
    };
    // Put one thing somewhere it fits, in a few tries. Returns whether it found a place.
    const place = (halfLength, halfWidth, put, tries = 5, least = 0.2, most = 0.7) => {
      for (let n = 0; n < tries; n += 1) {
        const [x, y] = somewhere(least, most);
        if (!fits(x, y, halfLength, halfWidth)) continue;
        put(x, y);
        return true;
      }
      return false;
    };
    // A row of like things along the building, as many as fit. Returns how many were put.
    const row = (count, halfLength, halfWidth, gap, put, least = 0.45, most = 0.8) => {
      for (let n = 0; n < 4; n += 1) {
        const [x, y] = somewhere(least, most);
        if (!fits(x, y, halfLength, halfWidth)) continue;
        // Towards whichever end of the building has more room.
        const way = (x - middleX) * east + (y - middleY) * north > 0 ? -1 : 1;
        let stood = 0;
        for (let k = 0; k < count; k += 1) {
          const px = x + east * way * k * (halfLength * 2 + gap);
          const py = y + north * way * k * (halfLength * 2 + gap);
          if (!fits(px, py, halfLength, halfWidth)) break;
          put(px, py);
          stood += 1;
        }
        return stood;
      }
      return 0;
    };

    const wall = building.wall ?? ROOF_PAINT;
    const tower = building.kind === 'tower' || top >= 60;
    const large = area >= 700 || building.kind === 'store';
    const before = mesh.count;
    if (tower) {
      // The lift's machine room, cooling plant round it, and on the tallest a mast.
      place(3.2, 2.6, (x, y) => box(x, y, 3.2, 2.6, 3.4, wall), 6, 0, 0.35);
      row(2 + Math.floor(random() * 3), 1.8, 1.2, 0.9, (x, y) => box(x, y, 1.8, 1.2, 1.6, PLANT_PAINT, PLANT_LID));
      row(2 + Math.floor(random() * 3), 1.8, 1.2, 0.9, (x, y) => box(x, y, 1.8, 1.2, 1.6, PLANT_PAINT, PLANT_LID));
      if (top >= 90) {
        place(0.2, 0.2, (x, y) => {
          box(x, y, 0.16, 0.16, 11, MAST_PAINT_ROOF);
          beacons?.push([x, y, top + 11.3]);
        }, 10, 0, 0.5);
      }
    } else if (large) {
      // A large roof: rows of cooling plant, the head of the stairs, tanks.
      const units = Math.min(Math.max(Math.round(area / 300), 2), 10);
      const first = row(Math.ceil(units / 2), 1.8, 1.2, 0.9, (x, y) => box(x, y, 1.8, 1.2, 1.6, PLANT_PAINT, PLANT_LID));
      if (units - first > 0) row(units - first, 1.8, 1.2, 0.9, (x, y) => box(x, y, 1.8, 1.2, 1.6, PLANT_PAINT, PLANT_LID));
      place(2.4, 1.8, (x, y) => box(x, y, 2.4, 1.8, 2.6, wall));
      if (random() < 0.7) row(2, 0.75, 0.75, 0.5, (x, y) => tank(x, y, 0.75, 1.5));
    } else {
      // A house or a block: the stair head, and beside it a water tank; the air conditioners in a row by the parapet.
      const small = building.kind === 'house' || area < 260;
      // (Which roofs have a lamp left on goes by the building's own number, not by chance: by day nothing is to change for it.)
      const lampOn = (Number.isFinite(building.seed) ? Math.abs(Math.round(building.seed)) : Math.round(area)) % 10 < 3;
      place(2.2, 1.6, (x, y) => {
        box(x, y, 2.2, 1.6, 2.5, wall);
        const tankAt = [x + east * 3.3, y + north * 3.3];
        if (fits(tankAt[0], tankAt[1], 0.7, 0.7)) tank(tankAt[0], tankAt[1], 0.7, 1.4);
        // The lamp by the door, on the side away from the tank.
        const doorAt = [x - east * 3, y - north * 3];
        if (lamps && lampOn && insideRing(ring, doorAt[0], doorAt[1])) lamps.push([doorAt[0], doorAt[1], top + ROOF_LAMP_UP]);
      });
      if (!small || random() < 0.5) place(0.75, 0.75, (x, y) => tank(x, y, 0.75, 1.5), 3);
      row(small ? 1 + Math.floor(random() * 3) : 3 + Math.floor(random() * 4), 0.45, 0.24, 0.5, (x, y) => box(x, y, 0.45, 0.24, 0.75, UNIT_PAINT, UNIT_LID), 0.55, 0.85);
      const extra = random();
      if (extra < 0.16) {
        // An awning to sit under: a sheet on four posts.
        place(2.2, 1.7, (x, y) => {
          drawBox(mesh, x, y, east, north, 2.2, 1.7, top + 2.3, top + 2.42, toned(AWNING_PAINT), light);
          for (const [px, py] of cornersOf(x, y, 2.05, 1.55)) drawBox(mesh, px, py, east, north, 0.06, 0.06, top, top + 2.3, toned(POST_PAINT), light);
          shadeOf(cornersOf(x, y, 2.2, 1.7), 2.4);
          taken.push([x, y, 2.8]);
          // (Where people sit of an evening there is a lamp.)
          lamps?.push([x, y, top + ROOF_LAMP_UP]);
        }, 4);
      } else if (extra < 0.27) {
        // Solar panels, flat and dark, a few in a row.
        row(2 + Math.floor(random() * 3), 0.55, 0.9, 0.12, (x, y) => box(x, y, 0.55, 0.9, 0.22, PANEL_PAINT), 0.3, 0.7);
      }
    }
    if (mesh.count > before) furnished += 1;
  }
  return furnished;
}

// ── Trees ─────────────────────────────────────────────────────────────────

const LEAVES = [[58, 102, 52], [70, 116, 58], [48, 92, 50], [82, 122, 62], [66, 104, 44], [52, 98, 62]];
const FRONDS = [[74, 110, 58], [64, 100, 54], [86, 118, 64]];
const BARK = [104, 84, 62];
const PALM_BARK = [128, 108, 82];
// A crown no wider than this is as likely a palm as not; the widest are never palms.
const PALM_MOST_RADIUS = 3.4;

/** Whether the tree at a place is drawn as a palm: by its size and by chance, the same every time. */
export function isPalm(x, y, radius) {
  if (!(radius <= PALM_MOST_RADIUS)) return false;
  const chance = seededRandom(Math.round(x * 13 + y * 29) + 3)();
  return chance < (radius <= 2.4 ? 0.6 : 0.25);
}

/**
 * Fill a mesh with trees and their shade on the ground. Two kinds: a tree
 * with a trunk and a rounded crown of six sides, and a date palm, a tall
 * bare trunk with a head of drooping fronds. trees: [{ x, y, radius }] in
 * metres, radius being the crown's. Which kind a tree is, the photo it was
 * found in cannot say: the smaller crowns are more often made palms. The
 * same tree always comes out the same.
 */
export function drawTrees(mesh, trees, light, reach) {
  mesh.clear();
  const direction = reach ? (reach.bearing * Math.PI) / 180 : 0;
  for (const tree of trees) {
    const { x, y, radius } = tree;
    // No two trees quite alike, but each the same every time it is drawn.
    const random = seededRandom(Math.round(x * 31 + y * 17) + 7);
    const leaves = LEAVES[Math.floor(random() * LEAVES.length)];
    const turn = random() * Math.PI;
    const palm = tree.palm ?? isPalm(x, y, radius);
    const trunk = palm ? 4.2 + radius * 0.9 + random() * 1.6 : 1.2 + radius * 0.5;
    const shoulder = palm ? trunk : trunk + radius * 0.9;
    const top = shoulder + radius * (0.9 + random() * 0.5);
    const ring = (size, height) =>
      Array.from({ length: 6 }, (_, i) => {
        const angle = turn + (i * Math.PI) / 3;
        return [x + Math.sin(angle) * size, y + Math.cos(angle) * size, height];
      });

    if (reach) {
      // The crown's shade: a six-sided patch on the ground, out along the shadows, by the crown's height.
      const pull = Math.min(reach.factor, 2.5) * shoulder;
      const centre = [x + Math.sin(direction) * pull, y + Math.cos(direction) * pull, 0.06];
      const edge = ring(radius, 0.06).map(([px, py, pz]) => [px + Math.sin(direction) * pull, py + Math.cos(direction) * pull, pz]);
      for (let i = 0; i < 6; i += 2) mesh.face(centre, edge[i], edge[i + 1], edge[(i + 2) % 6], 16, 20, 32, 0.3);
    }

    const width = palm ? 0.2 : 0.12 + radius * 0.07;
    const bark = palm ? PALM_BARK : BARK;
    const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    sides.forEach(([east, north], i) => {
      const [nextEast, nextNorth] = sides[(i + 1) % 4];
      const a = [x + (east - nextEast) * width, y + (north - nextNorth) * width];
      const b = [x + (east + nextEast) * width, y + (north + nextNorth) * width];
      const lit = faceLight(light, east, north, 0);
      mesh.face([a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], trunk + 0.3], [a[0], a[1], trunk + 0.3], bark[0] * lit, bark[1] * lit, bark[2] * lit, 1);
    });

    if (palm) {
      // A head of fronds: each rises a little from the top of the trunk, then droops to its tip.
      const fronds = FRONDS[Math.floor(random() * FRONDS.length)];
      const count = 7;
      const reachOut = Math.max(radius, 1.9);
      for (let i = 0; i < count; i += 1) {
        const angle = turn + (i * 2 * Math.PI) / count;
        const east = Math.sin(angle);
        const north = Math.cos(angle);
        const half = 0.42;
        const at = (out, side, height) => [x + east * out - north * side, y + north * out + east * side, height];
        const lit = faceLight(light, east * 0.3, north * 0.3, 0.95);
        mesh.face(at(0, half * 0.5, trunk + 0.2), at(0, -half * 0.5, trunk + 0.2), at(reachOut * 0.55, -half, trunk + 0.75), at(reachOut * 0.55, half, trunk + 0.75), fronds[0] * lit, fronds[1] * lit, fronds[2] * lit, 1);
        const droop = faceLight(light, east * 0.7, north * 0.7, 0.7);
        mesh.face(at(reachOut * 0.55, half, trunk + 0.75), at(reachOut * 0.55, -half, trunk + 0.75), at(reachOut, -half * 0.3, trunk - 0.5), at(reachOut, half * 0.3, trunk - 0.5), fronds[0] * droop * 0.9, fronds[1] * droop * 0.9, fronds[2] * droop * 0.9, 1);
      }
      continue;
    }

    // A rounded crown: a ball of leaves, a little taller or flatter than it is wide, cut into bands
    // from its underside to its top. Each face is lit by the way it looks; the underside is in the
    // crown's own shade, and each band is its own shade of green, as leaves in clumps are.
    const tall = radius * (0.82 + random() * 0.36);
    const middle = trunk + tall * 0.8;
    const tone = 0.88 + random() * 0.24;
    const bands = CROWN_BANDS.map(([across, up]) => ring8(x, y, turn, radius * across, middle + tall * up));
    const peak = [x, y, middle + tall];
    for (let band = 0; band < CROWN_BANDS.length; band += 1) {
      const lower = bands[band];
      const upper = bands[band + 1];
      const [across, up] = CROWN_BANDS[band];
      const [nextAcross, nextUp] = CROWN_BANDS[band + 1] ?? [0, 1];
      // The way this band looks: outwards by how far it is from the top, upwards by how high it is.
      const out = (across + nextAcross) / 2;
      const rise = (up + nextUp) / 2;
      const size = Math.hypot(out, rise) || 1;
      const clump = tone * (0.93 + 0.14 * random()) * (rise < 0 ? 0.72 : 1);
      for (let i = 0; i < CROWN_SIDES; i += 1) {
        const next = (i + 1) % CROWN_SIDES;
        const angle = turn + ((i + 0.5) * 2 * Math.PI) / CROWN_SIDES;
        const lit = faceLight(light, (Math.sin(angle) * out) / size, (Math.cos(angle) * out) / size, rise / size) * clump;
        mesh.face(lower[i], lower[next], upper ? upper[next] : peak, upper ? upper[i] : peak, leaves[0] * lit, leaves[1] * lit, leaves[2] * lit, 1);
      }
    }
  }
  return trees.length;
}

// A crown's bands, from its underside up: how wide each ring is (as a part of the crown's radius) and how
// high (as a part of its half height, from its middle). Above the last ring it closes to a point.
const CROWN_SIDES = 7;
const CROWN_BANDS = [[0.55, -0.8], [0.96, -0.3], [0.94, 0.28], [0.56, 0.78]];

/** A ring of CROWN_SIDES points round (x, y) at a height. */
function ring8(x, y, turn, size, height) {
  return Array.from({ length: CROWN_SIDES }, (_, i) => {
    const angle = turn + (i * 2 * Math.PI) / CROWN_SIDES;
    return [x + Math.sin(angle) * size, y + Math.cos(angle) * size, height];
  });
}
