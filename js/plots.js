// The walls round the houses.
//
// A house in Riyadh does not stand open to the street. Every villa has its
// own plot, and round the plot runs a wall taller than a man, with a gate of
// sheet metal in it for the car: from the street a residential district is
// walls and gates, with the houses looking over them. The map knows the
// houses but not the plots, so the walls are stood by rule: a couple of
// metres out from the house on every side (the setback the city asks for),
// pulled in where that would put them on a pavement or in the neighbour's
// house, and with the gate in the side nearest a street. How many of a
// district's houses have one goes by the kind of district it is (see
// districts.js): nearly all in the villa districts, few in the old town.
//
// Nothing here touches the browser. Places are [lng, lat]; the scene's own
// measure is metres east and north of an origin.

import { faceLight, nearestOn } from './life.js';
import { facadeOf, seedOf } from './walls.js';

const METERS_PER_DEGREE = 111320;
const SETBACK_METERS = 2.2; // from the house to its wall
const WALL_THICK_METERS = 0.22;
const WALL_TALL_METERS = [2.4, 2.7, 3]; // no two neighbours build quite alike
const GATE_WIDE_METERS = 3.6;
const GATE_PAINT = [92, 78, 66]; // sheet metal, painted brown
const GATE_NEAR_STREET_METERS = 16;
const SMALLEST_SQUARE_METERS = 70; // less than this is a shed, not a house
const LARGEST_SQUARE_METERS = 900;
const PAVEMENT_CLEAR_METERS = 3; // a wall keeps this far back from the edge of a road
const ROAD_SQUARE_METERS = 48;
const WITHIN_METERS = 1200; // the walls are stood round the houses this near the middle of the scene

/**
 * Fill a mesh (see Mesh in life.js) with the walls round the houses.
 *
 * buildings: [{ id, height, base, use, polygons }] as the roofs are laid
 * from. network: the streets, as buildNetwork() gives them, or null. origin:
 * { lng, lat }. light: the sun, as lightFrom() gives it, or null.
 * fencedAt(lng, lat): { fenced, fence } for a place: the share of houses
 * there that have a wall, and its colour as #rrggbb. built(x, y): whether a
 * building stands at a spot, where that is known.
 * Returns { houses, walled, sides, gates }.
 */
export function plotWalls(mesh, buildings, network, origin, light, { fencedAt, built = null } = {}) {
  mesh.clear();
  const made = { houses: 0, walled: 0, sides: 0, gates: 0 };
  if (!fencedAt) return made;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;

  // Every road on the ground, filed under the squares of ground it passes through.
  const squares = new Map();
  const squareOf = (cellX, cellY) => (cellX + 32768) * 65536 + (cellY + 32768);
  for (const way of network?.ways ?? []) {
    if (way.rail || way.hidden || way.deck > 0) continue;
    const out = way.width / 2 + GATE_NEAR_STREET_METERS;
    for (let cellX = Math.floor((way.box[0] - out) / ROAD_SQUARE_METERS); cellX <= Math.floor((way.box[2] + out) / ROAD_SQUARE_METERS); cellX += 1) {
      for (let cellY = Math.floor((way.box[1] - out) / ROAD_SQUARE_METERS); cellY <= Math.floor((way.box[3] + out) / ROAD_SQUARE_METERS); cellY += 1) {
        const key = squareOf(cellX, cellY);
        if (!squares.has(key)) squares.set(key, []);
        squares.get(key).push(way);
      }
    }
  }
  /** How far a spot is from the edge of the nearest road (less than nothing: on it); Infinity if none is near. */
  const fromRoad = (x, y) => {
    let least = Infinity;
    for (const way of squares.get(squareOf(Math.floor(x / ROAD_SQUARE_METERS), Math.floor(y / ROAD_SQUARE_METERS))) ?? []) {
      const reach = way.width / 2 + GATE_NEAR_STREET_METERS;
      if (x < way.box[0] - reach || x > way.box[2] + reach || y < way.box[1] - reach || y > way.box[3] + reach) continue;
      least = Math.min(least, nearestOn(way, x, y).distance - way.width / 2);
    }
    return least;
  };
  const lit = (paint, east, north, up) => {
    const bright = faceLight(light, east, north, up);
    return [paint[0] * bright, paint[1] * bright, paint[2] * bright];
  };
  /** A length of wall from one spot to another: its two faces and its top; out: the way its outer face looks. */
  const length = (ax, ay, bx, by, tall, paint, outEast, outNorth, from = 0) => {
    const h = WALL_THICK_METERS / 2;
    for (const side of [1, -1]) {
      const [r, g, b] = lit(paint, outEast * side, outNorth * side, 0);
      const ox = outEast * h * side;
      const oy = outNorth * h * side;
      mesh.face([ax + ox, ay + oy, from], [bx + ox, by + oy, from], [bx + ox, by + oy, tall], [ax + ox, ay + oy, tall], r, g, b, 1);
    }
    const [r, g, b] = lit(paint, 0, 0, 1);
    mesh.face([ax - outEast * h, ay - outNorth * h, tall], [bx - outEast * h, by - outNorth * h, tall], [bx + outEast * h, by + outNorth * h, tall], [ax + outEast * h, ay + outNorth * h, tall], r, g, b, 1);
  };

  for (const building of buildings) {
    if (building.base > 0 || building.replaced || facadeOf(building) !== 'house') continue;
    const outer = building.polygons[0]?.[0];
    if (!outer || outer.length < 4) continue;
    const ring = outer.map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]);
    if (Math.hypot(ring[0][0], ring[0][1]) > WITHIN_METERS) continue;
    // How large it is, and which way it lies: along its longest side.
    let doubled = 0;
    let longest = 0;
    let along = [1, 0];
    for (let i = 1; i < ring.length; i += 1) {
      doubled += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      const run = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
      if (run > longest) {
        longest = run;
        along = [(ring[i][0] - ring[i - 1][0]) / run, (ring[i][1] - ring[i - 1][1]) / run];
      }
    }
    const area = Math.abs(doubled) / 2;
    if (area < SMALLEST_SQUARE_METERS || area > LARGEST_SQUARE_METERS) continue;
    made.houses += 1;
    const seed = seedOf(building.id);
    const { fenced, fence } = fencedAt(outer[0][0], outer[0][1]);
    // (The same houses every time: by the house's own number.)
    if (!(((seed * 37) % 61) / 61 < fenced)) continue;
    const paint = [1, 3, 5].map((from) => parseInt(String(fence).slice(from, from + 2), 16));
    const across = [-along[1], along[0]];
    let [low, high, left, right] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of ring) {
      const u = x * along[0] + y * along[1];
      const v = x * across[0] + y * across[1];
      low = Math.min(low, u);
      high = Math.max(high, u);
      left = Math.min(left, v);
      right = Math.max(right, v);
    }
    const tall = WALL_TALL_METERS[seed % WALL_TALL_METERS.length];
    const spot = (u, v) => [u * along[0] + v * across[0], u * along[1] + v * across[1]];
    // The four sides: how far out each stands (pulled in where a pavement or a neighbour is in the way, or
    // not stood at all), and how near a street it is. A side is tried along the house only; how far it
    // runs on past the corners is settled by where its two neighbours stand.
    const drafts = [[low, -1, left, right, true], [high, 1, left, right, true], [left, -1, low, high, false], [right, 1, low, high, false]].map(([fixed, sign, from, to, isU]) => {
      for (const set of [SETBACK_METERS, 1.3, 0.6]) {
        const at = fixed + sign * set;
        const points = [0.1, 0.5, 0.9].map((part) => (isU ? spot(at, from + (to - from) * part) : spot(from + (to - from) * part, at)));
        // (Its middle tells how far it is from the street it runs along; a wall that runs up to a street
        // ends at the house's own front, or at the wall along that street.)
        const nearRoad = fromRoad(points[1][0], points[1][1]);
        if (nearRoad < PAVEMENT_CLEAR_METERS || (built && points.some(([x, y]) => built(x, y)))) continue;
        return { at, isU, sign, nearRoad };
      }
      return null;
    });
    const [uLow, uHigh, vLow, vHigh] = drafts;
    // (Where a side is not stood, its neighbours end flush with the house.)
    const bounds = { low: uLow?.at ?? low, high: uHigh?.at ?? high, left: vLow?.at ?? left, right: vHigh?.at ?? right };
    const sides = drafts.filter(Boolean).map((side) => ({ ...side, ends: side.isU ? [bounds.left, bounds.right] : [bounds.low, bounds.high] }));
    if (sides.length < 2) continue;
    made.walled += 1;
    const gated = sides.reduce((best, side) => (side.nearRoad < (best?.nearRoad ?? GATE_NEAR_STREET_METERS) ? side : best), null);
    for (const side of sides) {
      const [a, b] = side.isU ? [spot(side.at, side.ends[0]), spot(side.at, side.ends[1])] : [spot(side.ends[0], side.at), spot(side.ends[1], side.at)];
      const out = side.isU ? [along[0] * side.sign, along[1] * side.sign] : [across[0] * side.sign, across[1] * side.sign];
      const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (side === gated && run > GATE_WIDE_METERS + 2) {
        // The gate: off the middle, the way a drive is; the wall carries on either side of it.
        const middle = 0.5 + (((seed * 13) % 7) - 3) * 0.06;
        const g0 = middle - GATE_WIDE_METERS / 2 / run;
        const g1 = middle + GATE_WIDE_METERS / 2 / run;
        const on = (part) => [a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part];
        length(...a, ...on(g0), tall, paint, out[0], out[1]);
        length(...on(g1), ...b, tall, paint, out[0], out[1]);
        length(...on(g0), ...on(g1), tall - 0.25, GATE_PAINT, out[0], out[1], 0.08);
        made.gates += 1;
      } else {
        length(...a, ...b, tall, paint, out[0], out[1]);
      }
      made.sides += 1;
    }
  }
  return made;
}
