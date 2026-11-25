// The houses of Riyadh, as they stand.
//
// The map knows a house only as the outline of whatever stands on its ground,
// and in Riyadh that outline is seldom one house's. The buildings were traced
// from the air by a machine, which welds the two or three villas of a row
// into a single block: drawn as it comes, a street of villas is a street of
// flat boxes, each as long as three houses. What stands there in truth was
// looked up in photographs taken along Riyadh's streets and from above (the
// street photographs of OpenStreetView-5M, and the satellite photograph the
// app shows itself; see the README):
//   - a block of villas is a row of plots, each some 16 to 22 m wide along
//     its street; where the block is two plots deep, two rows stand back to
//     back;
//   - a villa leaves a gap of a metre or two to its neighbour;
//   - a villa is never one box. It has a main part of two storeys, a lower
//     wing of one storey beside it or before it, an open court where the car
//     stands, and on some a room on the roof;
//   - each is of its own colour, one of the few its district is built in:
//     tan and peach plaster in the east, cream stone in the older north,
//     white and grey with dark trim in the new north.
// So each block of houses is divided here into plots, and each plot is given a
// house of such parts. Which plot has which shape, and where one plot ends
// and the next begins, is made up: by rule, and the same way every time. That
// the block holds houses of about this size and build is what the
// photographs show.
//
// Nothing here touches the browser. Places are [lng, lat]; the streets'
// network measures in metres east and north of its own origin.

import { nearestOn, pointAlong, unitFrom } from './life.js';

const METERS_PER_DEGREE = 111320;
const SMALLEST_SQUARE_METERS = 150; // less than this is one small house or a shed: left as it is
const LARGEST_SQUARE_METERS = 6000; // more than this is no row of villas
const HOUSE_UP_TO_METERS = 11; // (as in walls.js: what is taller is a block of flats)
const STREET_REACH_METERS = 50; // a block further than this from any street is not divided
const STREET_SQUARE_METERS = 64;
const TWO_ROWS_FROM_METERS = 36; // a block deeper than this is two rows of plots, back to back
const SMALLEST_SIDE_METERS = 9; // a house narrower or shallower than this is not given parts
const SMALLEST_HOUSE_SQUARE_METERS = 60;
const REGULAR_SHARE = 0.8; // how much of its own box a plot's building must fill to be rebuilt as a house of parts
// How wide a plot is along its street in each kind of district, in metres (see districts.js for the kinds).
const PLOT_WIDE_METERS = { north: 17, east: 19, south: 16, villa: 21, midcentury: 22, diplomatic: 24, wadi: 22, open: 19 };
const USUAL_PLOT_WIDE_METERS = 19;
const HALF_GAP_METERS = [0.8, 1, 1.25]; // from a house to the line between it and its neighbour
const YARD_METERS = 2.4; // from a house to its plot's wall, where nothing is in the way
const KERB_STRIP_METERS = 1.3; // a plot's wall keeps this far back from the asphalt: the raised strip at its foot

// The styles a villa is built in, as the photographs show them, and the colours each comes in.
//   plaster: stepped boxes in tan or peach render, small dark windows, canopies of red clay tiles (1990s-2000s);
//   stone:   cream stone with grooved courses, a cornice, arched windows, lanterns on the gate piers;
//   arched:  cream render, round-arched windows, a skirt of brown tiles round the roof;
//   modern:  sharp boxes in white, grey or beige tiles with dark frames (from about 2015).
export const HOUSE_STYLES = {
  plaster: { walls: ['#cfae84', '#d8bb92', '#c9a57a', '#dcc49c', '#d3b48a', '#c6a981', '#d9bf9c'], trim: '#eadcbf', gate: '#4a3a2e', tile: '#a8523a' },
  stone: { walls: ['#e3d6b8', '#dccfae', '#e8dcc2', '#d6c7a2', '#e0d2b0'], trim: '#f0e7d0', gate: '#26221f', tile: '#8a4a36' },
  arched: { walls: ['#e9e0c8', '#e4d9bd', '#efe7d2', '#e2d6b6'], trim: '#f4eddb', gate: '#3a2c22', tile: '#7a4a36' },
  modern: { walls: ['#e7e3da', '#d9d4c8', '#cfc9bb', '#bdb7ab', '#eeebe4', '#d8cdb8'], trim: '#3b3b3d', gate: '#2e2e30', tile: '#5a5a5c' },
};
// How many houses in a hundred are of each style, by the kind of district.
const STYLE_MIX = {
  east: { plaster: 55, stone: 25, arched: 15, modern: 5 },
  south: { plaster: 60, arched: 20, stone: 15, modern: 5 },
  north: { modern: 50, stone: 28, arched: 12, plaster: 10 },
  villa: { stone: 40, arched: 25, plaster: 20, modern: 15 },
  midcentury: { arched: 35, plaster: 30, stone: 25, modern: 10 },
  diplomatic: { stone: 60, modern: 25, arched: 15, plaster: 0 },
};
const USUAL_MIX = { plaster: 40, stone: 30, arched: 20, modern: 10 };

/** The style of a house, by the kind of its district and a number of its own from 0 up to 1. */
export function styleOf(kind, chance) {
  const mix = STYLE_MIX[kind] ?? USUAL_MIX;
  let left = chance * 100;
  for (const [style, share] of Object.entries(mix)) {
    left -= share;
    if (left < 0) return style;
  }
  return Object.keys(mix)[0];
}

/** Cut a ring of [x, y] (not closed) to the part of it on one side of a line: where `at(point)` is not less than nothing. */
function cutRing(points, at) {
  const kept = [];
  for (let i = 0; i < points.length; i += 1) {
    const here = points[i];
    const next = points[(i + 1) % points.length];
    const a = at(here);
    const b = at(next);
    if (a >= 0) kept.push(here);
    if (a >= 0 !== b >= 0) {
      const t = a / (a - b);
      kept.push([here[0] + (next[0] - here[0]) * t, here[1] + (next[1] - here[1]) * t]);
    }
  }
  return kept;
}

/** What is left of a ring of [u, v] inside a box of u and v. */
function cutToBox(points, u0, u1, v0, v1) {
  let ring = points;
  for (const at of [(p) => p[0] - u0, (p) => u1 - p[0], (p) => p[1] - v0, (p) => v1 - p[1]]) {
    if (ring.length < 3) return [];
    ring = cutRing(ring, at);
  }
  return ring.length < 3 ? [] : ring;
}

function squareMeters(points) {
  let doubled = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    doubled += x0 * y1 - x1 * y0;
  }
  return Math.abs(doubled) / 2;
}

/** Every street on the ground, filed under the squares of ground it passes near. */
function streetsBySquare(network) {
  const squares = new Map();
  for (const way of network?.ways ?? []) {
    if (way.rail || way.hidden || way.deck > 0 || way.class === 'service') continue;
    const out = way.width / 2 + STREET_REACH_METERS;
    for (let cellX = Math.floor((way.box[0] - out) / STREET_SQUARE_METERS); cellX <= Math.floor((way.box[2] + out) / STREET_SQUARE_METERS); cellX += 1) {
      for (let cellY = Math.floor((way.box[1] - out) / STREET_SQUARE_METERS); cellY <= Math.floor((way.box[3] + out) / STREET_SQUARE_METERS); cellY += 1) {
        const key = `${cellX},${cellY}`;
        if (!squares.has(key)) squares.set(key, []);
        squares.get(key).push(way);
      }
    }
  }
  /** How far a spot is from the edge of the nearest street; Infinity if none is near. */
  return (x, y) => {
    let least = Infinity;
    for (const way of squares.get(`${Math.floor(x / STREET_SQUARE_METERS)},${Math.floor(y / STREET_SQUARE_METERS)}`) ?? []) {
      const reach = way.width / 2 + STREET_REACH_METERS;
      if (x < way.box[0] - reach || x > way.box[2] + reach || y < way.box[1] - reach || y > way.box[3] + reach) continue;
      least = Math.min(least, nearestOn(way, x, y).distance - way.width / 2);
    }
    return least;
  };
}

/**
 * The parts of one house, laid out in the box its plot's building fills: each
 * { a0, a1, b0, b1, height, part }, a across the front and b back from it, in
 * metres from the box's front left corner. wide, deep: the box. chance(n): a
 * number from 0 up to 1 that is the house's own, a different one for each n.
 * Also returns the open court before the house, if it has one: { a0, a1, b0, b1 }.
 */
export function houseParts(wide, deep, chance) {
  // Two storeys with the slab between and the roof on top; a wing of one tall storey.
  const tall = 7.6 + 1.6 * chance(1);
  const low = 3.9 + 0.7 * chance(2);
  const left = chance(3) < 0.5;
  const pick = chance(4);
  if (wide < SMALLEST_SIDE_METERS || deep < SMALLEST_SIDE_METERS) return { parts: [{ a0: 0, a1: wide, b0: 0, b1: deep, height: tall, part: 'main' }], court: null };
  if (pick < 0.42) {
    // A court in front with a wing beside it; the main part behind them, right across.
    const front = Math.min(Math.max(deep * (0.26 + 0.1 * chance(5)), 4.5), 8);
    const wing = wide * (0.44 + 0.14 * chance(6));
    const [w0, w1] = left ? [0, wing] : [wide - wing, wide];
    return {
      parts: [
        { a0: 0, a1: wide, b0: front, b1: deep, height: tall, part: 'main' },
        { a0: w0, a1: w1, b0: 0, b1: front, height: low, part: 'wing' },
      ],
      court: left ? { a0: wing, a1: wide, b0: 0, b1: front } : { a0: 0, a1: wide - wing, b0: 0, b1: front },
    };
  }
  if (pick < 0.74) {
    // The main part from front to back along one side; a wing set back beside it, the car's court before the wing.
    const main = wide * (0.58 + 0.12 * chance(5));
    const back = Math.min(Math.max(deep * (0.26 + 0.14 * chance(6)), 4.5), 9);
    const [m0, m1, w0, w1] = left ? [0, main, main, wide] : [wide - main, wide, 0, wide - main];
    return {
      parts: [
        { a0: m0, a1: m1, b0: 0, b1: deep, height: tall, part: 'main' },
        { a0: w0, a1: w1, b0: back, b1: deep, height: low, part: 'wing' },
      ],
      court: { a0: w0, a1: w1, b0: 0, b1: back },
    };
  }
  // One full block, with a room on its roof set back from the street.
  const r0 = wide * (left ? 0.1 : 0.42);
  return {
    parts: [
      { a0: 0, a1: wide, b0: 0, b1: deep, height: tall, part: 'main' },
      { a0: r0, a1: r0 + wide * 0.48, b0: deep * 0.34, b1: deep * 0.8, height: tall + 3.1, part: 'room' },
    ],
    court: null,
  };
}

/**
 * Divide the blocks of houses among a list of buildings into houses.
 *
 * buildings: [{ id, height, base, known, kind, use, polygons, tile, replaced }]
 * as buildingFootprints() gives them. network: the streets, as
 * buildNetwork() gives them (it carries its own origin). districtOf(lng,
 * lat): { kind, fenced } for a place (see districts.js). whole(building):
 * whether the building's outline came whole (one that lies across the edge
 * of a map tile comes in pieces, and is left alone). skip: a Set of ids to
 * leave alone as well (mosques, say).
 *
 * Returns { buildings, houses, divided }: the list with each divided block
 * replaced by the parts of its houses (each a building like the others, with
 * `house` set to its house's place in `houses`); the houses, each { id,
 * block, kind, style, paint, trim, gate, tile, at: [lng, lat] of its front
 * left corner, along and back: the way its front runs and the way back from
 * it as [east, north], wide, deep, parts (or, of a house the map has whole,
 * none, and ring: its own outline in its own measure, and height), court,
 * ends: whether its left and
 * right sides are the block's own ends, plot: how far its plot reaches out
 * from it in front, to the left, to the right and behind, and how far its
 * front is from the edge of its street, row, rows and cell: which row of how
 * many it stands in and where along it }; and the ids of the blocks
 * that were divided.
 */
export function parcelHouses(buildings, network, { districtOf = () => ({ kind: 'villa', fenced: 0.9 }), whole = () => true, skip = null } = {}) {
  const origin = network?.origin;
  if (!origin) return { buildings, houses: [], divided: [] };
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  const fromStreet = streetsBySquare(network);
  const times = new Map();
  for (const building of buildings) times.set(building.id, (times.get(building.id) ?? 0) + 1);
  const out = [];
  const houses = [];
  const divided = [];

  for (const building of buildings) {
    const plan = () => {
      if (typeof building.id !== 'number' || times.get(building.id) !== 1 || skip?.has(building.id) || !whole(building)) return null;
      if (building.replaced || building.kind !== undefined || building.base > 0 || building.known !== false) return null;
      if (!(building.height <= HOUSE_UP_TO_METERS) || !(building.use === 'residential' || building.use === undefined)) return null;
      if (building.polygons.length !== 1 || building.polygons[0].length !== 1) return null;
      const outer = building.polygons[0][0];
      const closed = outer.length > 1 && outer[0][0] === outer[outer.length - 1][0] && outer[0][1] === outer[outer.length - 1][1];
      const ring = outer.slice(0, outer.length - (closed ? 1 : 0)).map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]);
      if (ring.length < 3) return null;
      const area = squareMeters(ring);
      if (area < SMALLEST_SQUARE_METERS || area > LARGEST_SQUARE_METERS) return null;
      const district = districtOf(outer[0][0], outer[0][1]);
      if (!(district.fenced >= 0.5)) return null;

      // Which way the block lies: along its longest side.
      let longest = 0;
      let e1 = [1, 0];
      for (let i = 0; i < ring.length; i += 1) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[(i + 1) % ring.length];
        const run = Math.hypot(x1 - x0, y1 - y0);
        if (run > longest) {
          longest = run;
          e1 = [(x1 - x0) / run, (y1 - y0) / run];
        }
      }
      const e2 = [-e1[1], e1[0]];
      let [p0, p1, q0, q1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const [x, y] of ring) {
        const p = x * e1[0] + y * e1[1];
        const q = x * e2[0] + y * e2[1];
        p0 = Math.min(p0, p);
        p1 = Math.max(p1, p);
        q0 = Math.min(q0, q);
        q1 = Math.max(q1, q);
      }
      // Which of its four sides is its front: the one nearest a street.
      const spot = (p, q) => [p * e1[0] + q * e2[0], p * e1[1] + q * e2[1]];
      const sides = [
        { along: e1, back: e2, from: [p0, q0], wide: p1 - p0, deep: q1 - q0 }, // the side at q0, looking out the way of -e2
        { along: [-e1[0], -e1[1]], back: [-e2[0], -e2[1]], from: [p1, q1], wide: p1 - p0, deep: q1 - q0 },
        { along: [-e2[0], -e2[1]], back: e1, from: [p0, q1], wide: q1 - q0, deep: p1 - p0 },
        { along: e2, back: [-e1[0], -e1[1]], from: [p1, q0], wide: q1 - q0, deep: p1 - p0 },
      ].map((side) => {
        const corner = spot(...side.from);
        const middle = [corner[0] + side.along[0] * side.wide * 0.5, corner[1] + side.along[1] * side.wide * 0.5];
        return { ...side, corner, toStreet: fromStreet(middle[0] - side.back[0] * 1.5, middle[1] - side.back[1] * 1.5) };
      });
      const front = sides.reduce((best, side) => (side.toStreet < best.toStreet ? side : best));
      if (!(front.toStreet < STREET_REACH_METERS) || front.wide < SMALLEST_SIDE_METERS || front.deep < SMALLEST_SIDE_METERS) return null;
      // The block in its front's own measure: u along the front from its left corner, v back from it.
      const { along, back, corner, wide, deep } = front;
      const inFront = ring.map(([x, y]) => [(x - corner[0]) * along[0] + (y - corner[1]) * along[1], (x - corner[0]) * back[0] + (y - corner[1]) * back[1]]);

      const own = (n) => unitFrom(`${building.id}:${n}`);
      const plotWide = (PLOT_WIDE_METERS[district.kind] ?? USUAL_PLOT_WIDE_METERS) * (0.9 + 0.2 * own('wide'));
      const across = Math.max(Math.round(wide / plotWide), 1);
      const rows = deep > TWO_ROWS_FROM_METERS ? 2 : 1;
      const made = [];
      for (let row = 0; row < rows; row += 1) {
        for (let cell = 0; cell < across; cell += 1) {
          const chance = (n) => unitFrom(`${building.id}:${row}:${cell}:${n}`);
          const gap = HALF_GAP_METERS[Math.floor(chance('gap') * HALF_GAP_METERS.length)];
          const u0 = (wide * cell) / across + (cell > 0 ? gap : 0);
          const u1 = (wide * (cell + 1)) / across - (cell < across - 1 ? gap : 0);
          const v0 = rows === 2 && row === 1 ? deep / 2 + gap : 0;
          const v1 = rows === 2 && row === 0 ? deep / 2 - gap : deep;
          const built = cutToBox(inFront, u0, u1, v0, v1);
          const builtArea = built.length >= 3 ? squareMeters(built) : 0;
          if (builtArea < SMALLEST_HOUSE_SQUARE_METERS) continue;
          let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
          for (const [u, v] of built) {
            a0 = Math.min(a0, u);
            a1 = Math.max(a1, u);
            b0 = Math.min(b0, v);
            b1 = Math.max(b1, v);
          }
          const style = styleOf(district.kind, chance('style'));
          const look = HOUSE_STYLES[style];
          const paint = look.walls[Math.floor(chance('paint') * look.walls.length)];
          // The house's own measure: from the front left corner of what stands on its plot. The back row
          // of two looks the other way: its front is the block's far side.
          const turned = row === 1;
          const houseWide = a1 - a0;
          const houseDeep = b1 - b0;
          const at = turned ? [a1, b1] : [a0, b0];
          const houseAlong = turned ? [-along[0], -along[1]] : along;
          const houseBack = turned ? [-back[0], -back[1]] : back;
          const place = (a, b) => {
            const u = at[0] + (turned ? -a : a);
            const v = at[1] + (turned ? -b : b);
            const x = corner[0] + along[0] * u + back[0] * v;
            const y = corner[1] + along[1] * u + back[1] * v;
            return [origin.lng + x / squeeze, origin.lat + y / METERS_PER_DEGREE];
          };
          // A block that is one plot is a house the map has whole: it keeps its own outline, as it stands.
          // A plot cut out of a row of houses is given a house of parts, if what stands on it fills its box.
          const alone = across === 1 && rows === 1;
          const regular = builtArea / (houseWide * houseDeep) >= REGULAR_SHARE;
          const laid = regular && !alone ? houseParts(houseWide, houseDeep, chance) : { parts: null, court: null };
          const ownHeight = 7.6 + 1.6 * chance(1);
          const index = houses.length + made.length;
          const idOf = (n) => Math.floor(unitFrom(`${building.id}:${row}:${cell}:part:${n}`) * 2 ** 40) + 1;
          const piece = (ring, height, part, n) => ({ id: idOf(n), height, base: 0, known: false, kind: undefined, use: 'residential', usual: undefined, polygons: [[ring]], colour: paint, house: index, part });
          const parts = laid.parts
            ? laid.parts.map((part, n) => piece([place(part.a0, part.b0), place(part.a1, part.b0), place(part.a1, part.b1), place(part.a0, part.b1), place(part.a0, part.b0)], part.height, part.part, n))
            : [
                piece(
                  [...built, built[0]].map(([u, v]) => {
                    const x = corner[0] + along[0] * u + back[0] * v;
                    const y = corner[1] + along[1] * u + back[1] * v;
                    return [origin.lng + x / squeeze, origin.lat + y / METERS_PER_DEGREE];
                  }),
                  ownHeight,
                  'main',
                  0,
                ),
              ];
          // (Turned about, a house's left is the block's right.)
          const blockEnds = [cell === 0, cell === across - 1];
          // Where its plot ends. In front: a yard a couple of metres deep if the street leaves room, the
          // wall keeping a strip's width clear of the asphalt. At the sides: half-way to the neighbour,
          // or a yard's width beyond the block's end. Behind: half-way to the house at its back, or a yard.
          const metres = (a, b) => {
            const u = at[0] + (turned ? -a : a);
            const v = at[1] + (turned ? -b : b);
            return [corner[0] + along[0] * u + back[0] * v, corner[1] + along[1] * u + back[1] * v];
          };
          const gapTo = (a, b) => fromStreet(...metres(a, b));
          const frontGap = gapTo(houseWide / 2, 0);
          const yard = (room) => (room < STREET_REACH_METERS ? Math.min(Math.max(room - KERB_STRIP_METERS, 0), YARD_METERS) : YARD_METERS);
          const ends = turned ? [blockEnds[1], blockEnds[0]] : blockEnds;
          const plot = {
            front: yard(frontGap),
            toStreet: frontGap,
            left: ends[0] ? yard(gapTo(0, houseDeep / 2)) : gap,
            right: ends[1] ? yard(gapTo(houseWide, houseDeep / 2)) : gap,
            behind: rows === 2 ? gap : yard(gapTo(houseWide / 2, houseDeep)),
          };
          made.push({
            id: parts[0].id,
            block: building.id,
            kind: district.kind,
            style,
            paint,
            trim: look.trim,
            gate: look.gate,
            tile: look.tile,
            at: place(0, 0),
            along: houseAlong,
            back: houseBack,
            wide: houseWide,
            deep: houseDeep,
            parts: laid.parts,
            // (Of a house without parts: its own outline in its own measure, along its front and back from
            // it, from its front left corner; and how tall it is.)
            ring: laid.parts ? null : built.map(([u, v]) => (turned ? [at[0] - u, at[1] - v] : [u - at[0], v - at[1]])),
            height: laid.parts ? undefined : ownHeight,
            court: laid.court,
            ends,
            plot,
            row,
            rows,
            cell,
            pieces: parts,
          });
        }
      }
      return made.length > 0 ? made : null;
    };
    const made = plan();
    if (!made) {
      out.push(building);
      continue;
    }
    divided.push(building.id);
    for (const house of made) {
      houses.push(house);
      out.push(...house.pieces);
    }
  }
  return { buildings: out, houses, divided };
}

// ── The plot round each house ──────────────────────────────────────────────
//
// What stands between a villa and its street, as the photographs show it: a wall
// some 2.6 to 3 m tall in the house's own colour or near it, with a darker band
// along its foot and a coping along its top; at the gate a pair of piers,
// taller than the wall and capped; a steel gate for the car, dark and
// two-leaved, with a smaller door for people beside it; on a house in plaster
// often a small canopy of red clay tiles over the gate; and an electricity
// meter's grey box let into the wall. Behind the wall the court is tiled, and
// many have a shade for the car on four posts. Before the wall the asphalt
// runs to a narrow raised strip at its foot, dusty where cars stand.

const WALL_TALL_METERS = [2.6, 2.8, 3];
const WALL_THICK_METERS = 0.22;
const BASE_BAND_METERS = 0.45;
const COPING_METERS = 0.1;
const PIER_METERS = 0.46;
const PIER_OVER_METERS = 0.35; // how far a gate pier stands up over its wall
const GATE_WIDE_METERS = 3.4;
const DOOR_WIDE_METERS = 1.05;
const SHUTTER_PAINT = [226, 220, 204]; // a garage's roller door, cream
const METER_PAINT = [150, 152, 150];
const COURT_TILES = [[216, 205, 184], [201, 168, 136], [206, 198, 186], [222, 214, 198]];
const SHADE_PAINTS = [[232, 228, 216], [206, 212, 220], [214, 196, 160]];
const DUSTY_ASPHALT = [132, 131, 128]; // the edge of a house street, where cars stand and dust gathers: paler than the road
const STRIP_PAVING = [198, 192, 180]; // the raised strip at the foot of a plot's wall
const STRIP_UP_METERS = 0.15;
const APRON_UP_METERS = 0.03;
const APRON_MOST_METERS = 13; // no further from a street's edge than this is a building taken to stand along it
const APRON_STEP_METERS = 8;
const APRON_FROM_END_METERS = 6; // (a street is left as the map draws it where it meets another: just clear of the other's roadway)
const APRON_ROADS = new Set(['minor', 'tertiary']);

const paintOf = (hex) => [1, 3, 5].map((from) => parseInt(String(hex).slice(from, from + 2), 16));

/**
 * Fill a mesh (see Mesh in life.js) with what stands round each house on its
 * plot: wall, gate, piers, canopy, court, the car's shade, and the strip
 * and asphalt before the wall.
 *
 * houses: as parcelHouses() gives them. origin: { lng, lat }, the scene's.
 * lit(east, north, up): how bright a face that looks that way is (see
 * faceLight in life.js). Returns { houses, walls, gates, canopies, shades }.
 */
export function dressHouses(mesh, houses, origin, lit = () => 1) {
  mesh.clear();
  const made = { houses: 0, walls: 0, gates: 0, canopies: 0, shades: 0 };
  if (!origin) return made;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  for (const house of houses) {
    // (A house drawn as a model that has its own wall and gate to the street needs none from here: see props.js.)
    if (house.walled) continue;
    const base = [(house.at[0] - origin.lng) * squeeze, (house.at[1] - origin.lat) * METERS_PER_DEGREE];
    const { along, back, wide, deep, plot } = house;
    const chance = (n) => unitFrom(`${house.id}:dress:${n}`);
    const at = (a, b, z) => [base[0] + along[0] * a + back[0] * b, base[1] + along[1] * a + back[1] * b, z];
    /** A face with its corners given in order in the house's own measure; (ea, eb, up): the way it looks. */
    const face = (corners, paint, ea, eb, up) => {
      const bright = lit(along[0] * ea + back[0] * eb, along[1] * ea + back[1] * eb, up);
      mesh.face(at(...corners[0]), at(...corners[1]), at(...corners[2]), at(...corners[3]), paint[0] * bright, paint[1] * bright, paint[2] * bright, 1);
    };
    /** A box from (a0, b0) to (a1, b1), from z0 up to z1: its four sides and its top. */
    const box = (a0, a1, b0, b1, z0, z1, paint, top = paint) => {
      face([[a0, b0, z0], [a1, b0, z0], [a1, b0, z1], [a0, b0, z1]], paint, 0, -1, 0);
      face([[a1, b1, z0], [a0, b1, z0], [a0, b1, z1], [a1, b1, z1]], paint, 0, 1, 0);
      face([[a0, b1, z0], [a0, b0, z0], [a0, b0, z1], [a0, b1, z1]], paint, -1, 0, 0);
      face([[a1, b0, z0], [a1, b1, z0], [a1, b1, z1], [a1, b0, z1]], paint, 1, 0, 0);
      face([[a0, b0, z1], [a1, b0, z1], [a1, b1, z1], [a0, b1, z1]], top, 0, 0, 1);
    };
    const wallPaint = paintOf(house.paint);
    const trim = paintOf(house.trim);
    const gatePaint = paintOf(house.gate);
    const tile = paintOf(house.tile);
    const footPaint = wallPaint.map((value) => value * 0.84);
    const tall = WALL_TALL_METERS[Math.floor(chance('tall') * WALL_TALL_METERS.length)];
    const half = WALL_THICK_METERS / 2;
    /** A length of the plot's wall along a (at b) or along b (at a): foot band, wall and coping. */
    const wallAlongA = (a0, a1, b) => {
      if (a1 - a0 < 0.3) return;
      box(a0, a1, b - half, b + half, 0, BASE_BAND_METERS, footPaint);
      box(a0, a1, b - half, b + half, BASE_BAND_METERS, tall, wallPaint);
      box(a0, a1, b - half - 0.04, b + half + 0.04, tall, tall + COPING_METERS, trim);
      made.walls += 1;
    };
    const wallAlongB = (b0, b1, a) => {
      if (b1 - b0 < 0.3) return;
      box(a - half, a + half, b0, b1, 0, BASE_BAND_METERS, footPaint);
      box(a - half, a + half, b0, b1, BASE_BAND_METERS, tall, wallPaint);
      box(a - half - 0.04, a + half + 0.04, b0, b1, tall, tall + COPING_METERS, trim);
      made.walls += 1;
    };
    const pier = (a, b) => {
      const h = PIER_METERS / 2;
      box(a - h, a + h, b - h, b + h, 0, tall + PIER_OVER_METERS, wallPaint);
      box(a - h - 0.05, a + h + 0.05, b - h - 0.05, b + h + 0.05, tall + PIER_OVER_METERS, tall + PIER_OVER_METERS + 0.12, trim);
    };

    // The plot's four lines.
    const front = -plot.front;
    const left = -plot.left;
    const right = wide + plot.right;
    const behind = deep + plot.behind;
    const walled = plot.front >= 0.6; // (with no room for a yard the house's own front is the plot's edge)

    // The side and back walls. A wall between two neighbours is stood once: by the house on its right.
    wallAlongB(walled ? front : 0, behind, left);
    if (house.ends[1]) wallAlongB(walled ? front : 0, behind, right);
    if (house.rows === 1 || house.row === 0) wallAlongA(left, right, behind);

    // The front wall, with the gate for the car where the court is (or to one side), and a door beside it.
    if (walled) {
      const court = house.court;
      const room = court ? court.a1 - court.a0 : wide * 0.5;
      const gateWide = Math.min(GATE_WIDE_METERS, Math.max(room - 0.9, 2.6));
      const middle = court ? (court.a0 + court.a1) / 2 : wide * (chance('side') < 0.5 ? 0.24 : 0.76);
      const g0 = Math.min(Math.max(middle - gateWide / 2, left + 0.6), right - gateWide - 0.6);
      const g1 = g0 + gateWide;
      // (The door for people: on the side of the gate that the rest of the house is on.)
      const doorLeft = g0 - left > right - g1;
      const d0 = doorLeft ? g0 - PIER_METERS - 0.5 - DOOR_WIDE_METERS : g1 + PIER_METERS + 0.5;
      const d1 = d0 + DOOR_WIDE_METERS;
      const hasDoor = d0 > left + 0.5 && d1 < right - 0.5;
      const cuts = [[g0, g1]];
      if (hasDoor) cuts.push([d0, d1]);
      cuts.sort((p, q) => p[0] - q[0]);
      let from = left;
      for (const [c0, c1] of cuts) {
        wallAlongA(from, c0, front);
        from = c1;
      }
      wallAlongA(from, right, front);
      pier(g0 - PIER_METERS / 2 + 0.05, front);
      pier(g1 + PIER_METERS / 2 - 0.05, front);
      // The gate: two dark leaves of steel, each with a panel worked into it; or on a plain house a roller door.
      const shutter = house.style === 'plaster' && chance('shutter') < 0.3;
      const leafTop = tall - 0.12;
      const gb = front + 0.05;
      if (shutter) {
        face([[g0, gb, 0.03], [g1, gb, 0.03], [g1, gb, leafTop], [g0, gb, leafTop]], SHUTTER_PAINT, 0, -1, 0);
        // (Its slats: a darker line every third of a metre.)
        for (let z = 0.36; z < leafTop - 0.1; z += 0.33) face([[g0, gb - 0.01, z], [g1, gb - 0.01, z], [g1, gb - 0.01, z + 0.03], [g0, gb - 0.01, z + 0.03]], SHUTTER_PAINT.map((value) => value * 0.8), 0, -1, 0);
      } else {
        const lighter = gatePaint.map((value) => Math.min(value * 1.5 + 22, 255));
        for (const [l0, l1] of [[g0, (g0 + g1) / 2 - 0.02], [(g0 + g1) / 2 + 0.02, g1]]) {
          face([[l0, gb, 0.06], [l1, gb, 0.06], [l1, gb, leafTop], [l0, gb, leafTop]], gatePaint, 0, -1, 0);
          if (house.style === 'modern') {
            // Slats across.
            for (let z = 0.3; z < leafTop - 0.15; z += 0.24) face([[l0 + 0.08, gb - 0.012, z], [l1 - 0.08, gb - 0.012, z], [l1 - 0.08, gb - 0.012, z + 0.1], [l0 + 0.08, gb - 0.012, z + 0.1]], lighter, 0, -1, 0);
          } else {
            // A worked panel in the upper half, and a plain one below.
            face([[l0 + 0.16, gb - 0.012, leafTop * 0.5], [l1 - 0.16, gb - 0.012, leafTop * 0.5], [l1 - 0.16, gb - 0.012, leafTop - 0.2], [l0 + 0.16, gb - 0.012, leafTop - 0.2]], lighter, 0, -1, 0);
            face([[l0 + 0.16, gb - 0.012, 0.25], [l1 - 0.16, gb - 0.012, 0.25], [l1 - 0.16, gb - 0.012, leafTop * 0.5 - 0.14], [l0 + 0.16, gb - 0.012, leafTop * 0.5 - 0.14]], gatePaint.map((value) => value * 1.25 + 8), 0, -1, 0);
          }
        }
      }
      made.gates += 1;
      if (hasDoor) {
        // (Over the door the wall carries on as a lintel.)
        face([[d0, gb, 0.06], [d1, gb, 0.06], [d1, gb, 2.15], [d0, gb, 2.15]], gatePaint, 0, -1, 0);
        box(d0, d1, front - half, front + half, 2.15, tall, wallPaint);
        box(d0, d1, front - half - 0.04, front + half + 0.04, tall, tall + COPING_METERS, trim);
      }
      // The meter's box, let into the wall beside the gate.
      const m0 = doorLeft ? g1 + PIER_METERS + 0.4 : g0 - PIER_METERS - 0.95;
      if (m0 > left + 0.3 && m0 + 0.55 < right - 0.3 && !(hasDoor && m0 < d1 + 0.2 && m0 + 0.55 > d0 - 0.2)) box(m0, m0 + 0.55, front - half - 0.06, front - half, 1.0, 1.7, METER_PAINT);
      // A canopy of clay tiles over the gate: sloping down towards the street from above the gate's head.
      const canopied = house.style === 'plaster' ? chance('canopy') < 0.7 : house.style === 'arched' && chance('canopy') < 0.35;
      if (canopied && !shutter) {
        const c0 = g0 - PIER_METERS - 0.15;
        const c1 = g1 + PIER_METERS + 0.15;
        const high = tall + PIER_OVER_METERS + 0.75;
        const low = tall + PIER_OVER_METERS + 0.2;
        const ridge = front + 0.15;
        face([[c0, front - 0.95, low], [c1, front - 0.95, low], [c1, ridge, high], [c0, ridge, high]], tile, 0, -0.5, 0.87);
        face([[c1, front + 1.1, low], [c0, front + 1.1, low], [c0, ridge, high], [c1, ridge, high]], tile, 0, 0.5, 0.87);
        // (Its two open ends, in the wall's colour.)
        for (const [c, way] of [[c0, -1], [c1, 1]]) {
          const ends = way < 0 ? [[c, front + 1.1, low], [c, front - 0.95, low], [c, ridge, high], [c, ridge, high]] : [[c, front - 0.95, low], [c, front + 1.1, low], [c, ridge, high], [c, ridge, high]];
          face(ends, trim, way, 0, 0);
        }
        made.canopies += 1;
      }
    }

    // The court and the yard in front: tiled. And over the car, on some, a shade on four posts.
    const tiles = COURT_TILES[Math.floor(chance('tiles') * COURT_TILES.length)];
    const yardFront = walled ? front + half : 0;
    face([[left + half, yardFront, 0.05], [right - (house.ends[1] ? half : 0), yardFront, 0.05], [right - (house.ends[1] ? half : 0), behind - half, 0.05], [left + half, behind - half, 0.05]], tiles, 0, 0, 1);
    if (house.court && chance('shade') < 0.45) {
      const court = house.court;
      const s0 = court.a0 + 0.5;
      const s1 = Math.min(court.a1 - 0.5, s0 + 5.6);
      const t0 = Math.max(yardFront + 0.4, court.b0 - plot.front + 0.5);
      const t1 = Math.min(court.b1 - 0.4, t0 + 5.4);
      if (s1 - s0 > 2.6 && t1 - t0 > 3) {
        const cloth = SHADE_PAINTS[Math.floor(chance('cloth') * SHADE_PAINTS.length)];
        for (const [a, b] of [[s0, t0], [s1, t0], [s0, t1], [s1, t1]]) box(a - 0.05, a + 0.05, b - 0.05, b + 0.05, 0.05, 2.5, [120, 122, 126]);
        // (A sheet with a slight fall to the front; seen from below and from above.)
        face([[s0 - 0.3, t0 - 0.3, 2.45], [s1 + 0.3, t0 - 0.3, 2.45], [s1 + 0.3, t1 + 0.3, 2.75], [s0 - 0.3, t1 + 0.3, 2.75]], cloth, 0, -0.05, 1);
        face([[s1 + 0.3, t0 - 0.3, 2.44], [s0 - 0.3, t0 - 0.3, 2.44], [s0 - 0.3, t1 + 0.3, 2.74], [s1 + 0.3, t1 + 0.3, 2.74]], cloth.map((value) => value * 0.7), 0, 0, -1);
        made.shades += 1;
      }
    }

    made.houses += 1;
  }
  return made;
}

/**
 * A house street in Riyadh is asphalt from plot wall to plot wall: there is no
 * pavement to speak of, only a narrow raised strip at the foot of the walls,
 * and the cars stand on the asphalt along them. The map draws a street as a
 * ribbon of one width, and the ground beside it as bare plot. So the ground
 * between each house street and whatever is built along it is filled in here:
 * asphalt, a little paler and dustier than the roadway, out to where a plot's
 * wall would stand, and at its edge the strip.
 *
 * mesh: a Mesh (see life.js). network: the streets. origin: { lng, lat },
 * the scene's. built(x, y): whether a building stands at a spot, in the
 * scene's metres. lit(east, north, up): how bright a face is.
 * Returns { streets, stretches }.
 */
export function streetAprons(mesh, network, origin, built, lit = () => 1) {
  mesh.clear();
  const made = { streets: 0, stretches: 0 };
  if (!network?.origin || !origin || !built) return made;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  const east = (network.origin.lng - origin.lng) * squeeze;
  const north = (network.origin.lat - origin.lat) * METERS_PER_DEGREE;
  const up = lit(0, 0, 1);
  const asphalt = DUSTY_ASPHALT.map((value) => value * up);
  const paving = STRIP_PAVING.map((value) => value * up);
  const spot = [0, 0, 0, 0];
  for (const way of network.ways) {
    if (!APRON_ROADS.has(way.class) || way.rail || way.hidden || way.deck > 0 || way.sunk || way.ramp || way.length < 2 * APRON_FROM_END_METERS + 2) continue;
    const half = way.width / 2;
    const run = way.length - 2 * APRON_FROM_END_METERS;
    const steps = Math.max(Math.round(run / APRON_STEP_METERS), 1);
    let any = false;
    for (const side of [1, -1]) {
      // How far out the asphalt runs at each step along the street: to a yard and a strip short of the first building.
      const places = [];
      for (let k = 0; k <= steps; k += 1) {
        pointAlong(way, APRON_FROM_END_METERS + (run * k) / steps, spot);
        const [x, y, dx, dy] = spot;
        const nx = side * dy;
        const ny = -side * dx;
        let clear = null;
        // (Felt for half a metre at a time: the building's front lies between the last free spot and the first built one.)
        for (let d = half + 0.25; d <= half + APRON_MOST_METERS; d += 0.5) {
          if (built(x + east + nx * d, y + north + ny * d)) {
            clear = d - 0.25;
            break;
          }
        }
        places.push({ x: x + east, y: y + north, nx, ny, out: clear === null ? null : Math.max(clear - YARD_METERS - KERB_STRIP_METERS - 0.1, half) });
      }
      for (let k = 0; k < steps; k += 1) {
        const a = places[k];
        const b = places[k + 1];
        if (a.out === null || b.out === null) continue;
        // (No further out than its neighbours either side: a building between two steps is not run over.)
        const outA = Math.min(a.out, places[k - 1]?.out ?? a.out, b.out);
        const outB = Math.min(b.out, places[k + 2]?.out ?? b.out, a.out);
        const from = half - 0.4;
        const at = (place, d, z) => [place.x + place.nx * d, place.y + place.ny * d, z];
        const quad = (d0a, d0b, d1a, d1b, z, paint) => {
          const corners = side > 0 ? [at(a, d0a, z), at(a, d1a, z), at(b, d1b, z), at(b, d0b, z)] : [at(a, d0a, z), at(b, d0b, z), at(b, d1b, z), at(a, d1a, z)];
          mesh.face(...corners, paint[0], paint[1], paint[2], 1);
        };
        if (outA - from > 0.3 || outB - from > 0.3) quad(from, from, outA, outB, APRON_UP_METERS, asphalt);
        quad(outA, outB, outA + KERB_STRIP_METERS, outB + KERB_STRIP_METERS, STRIP_UP_METERS, paving);
        made.stretches += 1;
        any = true;
      }
    }
    if (any) made.streets += 1;
  }
  return made;
}
