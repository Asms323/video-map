// The roads of Riyadh that run below the ground.
//
// King Fahd Road, the spine of the city, does not cross its centre at street
// level. For 5.1 km between Aseer Street and Al-Mazar Street it runs in an
// open cutting: of the road's whole width of 95 m, the middle 40 m lie some
// 8 m below the ground, three lanes each way with a shoulder either side and
// a barrier between; the service roads, 15 m wide, run along the top of the
// retaining walls on either side, and every street that crosses does so on
// the level, over a short covered length of the road below (the Royal
// Commission for Riyadh City's own account of the road). Further north the
// same road dips under single streets in the same way, and so do the city's
// other great roads at their main crossings.
//
// And the avenues do it too: where two of them cross, one very often dives
// under the other in an underpass a few hundred metres long (Prince Turki
// Al Awwal Road, Takhassusi Street, Abu Bakr Al Siddiq Road, Salahuddin Al
// Ayubi Road, King Abdullah Road at its four tunnels…): the street map has
// some twenty kilometres of them in the middle of the city alone.
//
// The street map has the covered lengths as tunnels and everything between
// them as plain road. So: a road goes down to meet every tunnel it runs
// into; and along the stretch set down here it stays down from one tunnel
// to the next. What is made here is the cutting itself, for the scene to
// draw: its floor, its walls, the dark mouths of the tunnels, and the ground
// beside it, which hides whatever of the cutting lies behind it.
//
// Nothing here touches the browser. Places are [lng, lat]; the scene's own
// measure is metres east and north of an origin.

import { LAMP_LIGHT } from './lib.js';
import { faceLight, heightAlong, nearestOn, pointAlong } from './life.js';

const METERS_PER_DEGREE = 111320;

/**
 * The stretches that are cuttings from end to end, by research: the line
 * down the middle of the road, south to north, and how deep it lies.
 */
export const CUTTINGS = [
  {
    name: 'King Fahd Road, from Aseer Street to Al-Mazar Street',
    deep: 8,
    lanes: 3, // each way, with a shoulder either side
    line: [[46.706, 24.6212], [46.7057, 24.624], [46.705, 24.628], [46.7046, 24.632], [46.7041, 24.636], [46.70355, 24.64], [46.70303, 24.644], [46.70253, 24.648], [46.70216, 24.652], [46.70144, 24.656], [46.70087, 24.66], [46.70002, 24.664], [46.69855, 24.666], [46.6963, 24.6678], [46.6951, 24.6686]],
  },
];
/** How far below the ground a great road is where it runs into a tunnel that is not part of such a stretch. */
export const PORTAL_DEEP_METERS = 6.5;
const CUTTING_REACH_METERS = 30; // a junction of the road this near the line of a cutting is down in it,
const ALONG_LEAST = 0.7; // if the road runs the way the cutting does there (within some 45 degrees): a road that crosses it is not
const GREAT = new Set(['motorway', 'trunk']); // the roads a cutting from end to end is made for
// The roads that go under a crossing at all: the great roads, and the avenues between the districts, which
// dive under one another at the main crossings of the grid. (A lane that runs under a building does not go down.)
const DEEP_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const goesUnder = (way) => !way.rail && DEEP_ROADS.has(way.class);
/** Such a road itself: not a slip road off it. */
const isGreat = (way) => goesUnder(way) && !way.ramp;

const FLAT_METERS = 15; // how far from a tunnel's mouth a road is still at its full depth
const SLOPE_METERS = 130; // and over how long a run it climbs from there to the ground
/** How much of its full depth a road still has at a distance from the mouth it climbs away from: all of it at first, none from 145 m on. */
const profile = (far) => {
  const k = Math.min(Math.max((far - FLAT_METERS) / SLOPE_METERS, 0), 1);
  return 1 - k * k * (3 - 2 * k);
};

/**
 * How deep each junction of a network lies: a Map from a junction's key to
 * { deep, full, far, held }, holding only those that are below the ground.
 * deep: metres below the ground. full and far: the road there is climbing
 * away from a place where it is `full` metres down, `far` metres back along
 * it. held: on one of the stretches that are cuttings from end to end.
 *
 * A junction is down where a great road or an avenue runs into a tunnel,
 * and where it lies on such a stretch and a great road runs along it. From
 * there the road climbs to the ground along a set slope, through however
 * many junctions lie on the way: so each of those is as far down as the
 * slope has it. (The slope is not carried on along a slip road: the far
 * end of one is up on the service road.)
 *
 * ways, joins: as buildNetwork() has them (each way with its ends); origin:
 * { lng, lat }.
 */
export function sunkJoins(ways, joins, origin) {
  const squeeze = Math.cos((origin.lat * Math.PI) / 180) * METERS_PER_DEGREE;
  const lines = CUTTINGS.map((cutting) => ({ deep: cutting.deep, xy: cutting.line.map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]) }));
  /** How far a place is from a line, and which way the line runs where it is nearest. */
  const onLine = (xy, x, y) => {
    const found = { far: Infinity, east: 0, north: 0 };
    for (let i = 1; i < xy.length; i += 1) {
      const [x0, y0] = xy[i - 1];
      const [x1, y1] = xy[i];
      const long = Math.hypot(x1 - x0, y1 - y0) || 1;
      const t = Math.min(Math.max(((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (long * long), 0), 1);
      const far = Math.hypot(x - (x0 + (x1 - x0) * t), y - (y0 + (y1 - y0) * t));
      if (far < found.far) {
        found.far = far;
        found.east = (x1 - x0) / long;
        found.north = (y1 - y0) / long;
      }
    }
    return found;
  };
  const sunk = new Map();
  for (const way of ways) {
    if (!goesUnder(way) || way.deck > 0) continue;
    const count = way.xy.length / 2;
    way.ends.forEach((key, end) => {
      const i = end === 0 ? 0 : count - 1;
      const j = end === 0 ? 1 : count - 2;
      const x = way.xy[i * 2];
      const y = way.xy[i * 2 + 1];
      let full = 0;
      let held = false;
      // Where it runs into a tunnel (or out of one): down at the tunnel's mouth.
      if (way.hidden || joins.get(key).some((join) => ways[join.way].hidden && goesUnder(ways[join.way]))) full = PORTAL_DEEP_METERS;
      // On a stretch that is a cutting from end to end: as deep as that is.
      const run = Math.hypot(way.xy[j * 2] - x, way.xy[j * 2 + 1] - y) || 1;
      for (const line of lines) {
        if (way.ramp || !GREAT.has(way.class)) break;
        const found = onLine(line.xy, x, y);
        if (found.far > CUTTING_REACH_METERS) continue;
        if (Math.abs(((way.xy[j * 2] - x) * found.east + (way.xy[j * 2 + 1] - y) * found.north) / run) < ALONG_LEAST) continue;
        full = Math.max(full, line.deep);
        held = true;
      }
      if (!(full > 0)) return;
      const had = sunk.get(key);
      if (!had || full > had.deep || (held && !had.held && full >= had.deep)) sunk.set(key, { deep: full, full, far: 0, held });
    });
  }
  // From each of those the road climbs away, and every junction it passes on the way up is as deep as its slope is there.
  const queue = [...sunk.keys()];
  while (queue.length > 0) {
    const key = queue.pop();
    const from = sunk.get(key);
    for (const join of joins.get(key)) {
      const way = ways[join.way];
      if (!isGreat(way) || way.hidden || way.deck > 0) continue;
      const other = way.ends[join.atStart ? 1 : 0];
      if (other === key) continue;
      const far = from.far + way.length;
      const deep = from.full * profile(far);
      if (!(deep > 0.05)) continue;
      const had = sunk.get(other);
      if (had && had.deep >= deep - 1e-6) continue;
      sunk.set(other, { deep, full: from.full, far, held: false });
      queue.push(other);
    }
  }
  return sunk;
}

/**
 * Put the roads of a network that run below the ground, below it. Each
 * such way is given way.sunk: [how deep at its start, how deep at its
 * end], in metres; a great road itself is given way.dips besides: for each
 * end that is down, [the depth it is climbing away from, how far back
 * along the road that is]; and along a stretch that is a cutting from end
 * to end it has the lanes that were counted there. Any other road that
 * meets a junction that is down (the slip road off a great road in a
 * cutting, above all) starts from that depth and climbs to the street.
 * Returns how many ways were put down.
 */
export function sinkWays(ways, joins, origin) {
  const sunk = sunkJoins(ways, joins, origin);
  let count = 0;
  if (sunk.size === 0) return count;
  const great = [];
  for (const way of ways) {
    if (way.rail || way.hidden || way.deck > 0) continue;
    const first = sunk.get(way.ends[0]);
    const last = sunk.get(way.ends[1]);
    if (!first && !last) continue;
    way.sunk = [first ? first.deep : 0, last ? last.deep : 0];
    count += 1;
    if (!isGreat(way)) continue;
    great.push(way);
    // (From one junction of a cutting to the next the road does not climb at all.)
    const level = Boolean(first && last && first.held && last.held);
    way.dips = [first ? [first.full, level ? -Infinity : first.far] : null, last ? [last.full, level ? -Infinity : last.far] : null];
    if (level) {
      const cutting = CUTTINGS.find((one) => way.sunk[0] >= one.deep && way.sunk[1] >= one.deep);
      if (cutting) way.lanes = cutting.lanes;
    }
  }
  // A slip road cannot climb until it has drawn clear of the road it leaves: so far it runs at that road's level.
  const spot = [0, 0, 0, 0];
  for (const way of ways) {
    if (!way.sunk || way.dips || way.sunk[0] > 0 === way.sunk[1] > 0) continue;
    const least = Math.min(FLAT_METERS, way.length * 0.2);
    const most = way.length * 0.6;
    const beside = great.filter((other) => other.box[0] - 40 <= way.box[2] && other.box[2] + 40 >= way.box[0] && other.box[1] - 40 <= way.box[3] && other.box[3] + 40 >= way.box[1]);
    let clear = most;
    for (let from = 0; from < most; from += 3) {
      pointAlong(way, way.sunk[0] > 0 ? from : way.length - from, spot);
      const tight = beside.some((other) => {
        const found = nearestOn(other, spot[0], spot[1]);
        return found.distance < other.width / 2 + way.width / 2 + 0.5 && sunkAlong(other, found.along) > 0.4;
      });
      if (!tight) {
        clear = from;
        break;
      }
    }
    way.clear = Math.max(clear, least);
  }
  return count;
}

/**
 * Whether a spot lies over the floor of a cutting: where a road of the
 * network runs more than a metre below the ground. (Nothing that stands on
 * the ground stands there.)
 */
export function overCutting(network, x, y) {
  for (const way of network.ways) {
    if (!way.sunk || way.hidden || way.rail) continue;
    const reach = way.width / 2 + 12;
    if (x < way.box[0] - reach || x > way.box[2] + reach || y < way.box[1] - reach || y > way.box[3] + reach) continue;
    const found = nearestOn(way, x, y);
    if (found.distance <= reach && -heightAlong(way, found.along) > 1) return true;
  }
  return false;
}

/**
 * How far below the ground a way runs at a distance along it, in metres.
 * A great road is as deep as the slope from either of its ends has it
 * (way.dips): down at both ends of a long stretch it comes up in between,
 * and along a cutting it does not come up at all. Any other road that is
 * down at one end (a slip road) runs level until it is clear of the road it
 * leaves (way.clear), climbs from there, and is up within a hundred and
 * thirty metres more or by its other end, whichever comes first.
 */
export function sunkAlong(way, distance) {
  const sunk = way.sunk;
  if (!sunk) return 0;
  const s = Math.min(Math.max(distance, 0), way.length);
  const dips = way.dips;
  if (dips) {
    let deep = 0;
    if (dips[0]) deep = dips[0][0] * profile(dips[0][1] + s);
    if (dips[1]) deep = Math.max(deep, dips[1][0] * profile(dips[1][1] + way.length - s));
    return deep;
  }
  const [first, last] = sunk;
  if (first > 0 && last > 0) return first + ((last - first) * s) / way.length;
  const from = first > 0 ? s : way.length - s;
  const deep = Math.max(first, last);
  const flat = way.clear ?? Math.min(FLAT_METERS, way.length * 0.2);
  const run = Math.min(SLOPE_METERS, way.length - flat);
  const k = Math.min(Math.max((from - flat) / Math.max(run, 1), 0), 1);
  return deep * (1 - k * k * (3 - 2 * k));
}

const FLOOR_PAINT = [115, 120, 130]; // asphalt, as the map draws its roads
const WALL_PAINT = [201, 197, 187]; // the concrete of the retaining walls
const MOUTH_PAINT = [26, 28, 34]; // the dark inside a tunnel
const STEP_METERS = 9;
const SHOULDER_METERS = 1.2; // from the edge of the carriageway to the foot of the wall
const BANK_METERS = 95; // how far the ground beside a cutting hides what is under it
// By night the lamps' light lies along every street (the map lays it on the ground: see 'city-glow' in
// lib.js). A road below the ground has its own, laid on its floor as strongly, and fainter on its walls.
const GLOW_FLOOR = 0.3;
const GLOW_WALL = 0.17;
const GLOW_UP_METERS = 0.05;
const hex = (colour) => [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
const LAMPS = { big: hex(LAMP_LIGHT.big), main: hex(LAMP_LIGHT.main), side: hex(LAMP_LIGHT.side) };
/** The colour of the lamps along a road, as the map has it for the light on the ground. */
const lampOf = (way) => (GREAT.has(way.class) ? LAMPS.big : way.class === 'primary' || way.class === 'secondary' ? LAMPS.main : LAMPS.side);
const MEDIAN_MOST_METERS = 22; // two sunken roads no further apart than this lie in one cutting
const ROAD_SQUARE_METERS = 48;

/**
 * Fill two meshes (see Mesh in life.js) with the cuttings of a network.
 *
 * mesh: what is seen: the floor of each cutting at the depth of its road,
 * the retaining walls up to the ground, and a dark face across the mouth of
 * a tunnel. banks: the ground beside each cutting and over each tunnel it
 * runs into, lying flat at the level of the street. The scene draws that
 * unseen, into the picture's depth only, so that it hides whatever of the
 * cutting (and of the traffic in it) lies behind it from where the eye is;
 * and it is what throws the shadow that lies along one side of a cutting.
 * light: the sun, as lightFrom() gives it. glow: a mesh for the light the
 * lamps throw on the floor and walls by night (the scene draws it as light:
 * it shows as the lamps come on), or none.
 *
 * Where the two carriageways of a road run side by side in one cutting,
 * the floor of each reaches to the middle of the strip between them and
 * there is no wall on that side; where one of the two is higher than the
 * other (a slip road on its way up), the higher has a wall down to the
 * lower. Returns { ways, metres, mouths }.
 */
export function drawCuttings(mesh, banks, network, light, glow = null) {
  mesh.clear();
  banks.clear();
  glow?.clear();
  const made = { ways: 0, metres: 0, mouths: 0 };
  const sunken = network.ways.filter((way) => way.sunk && !way.hidden && !way.rail && !(way.deck > 0));
  if (sunken.length === 0) return made;
  // The sunken ways, filed under the squares of ground they pass through or near.
  const squares = new Map();
  const squareOf = (cellX, cellY) => (cellX + 32768) * 65536 + (cellY + 32768);
  for (const way of sunken) {
    const out = way.width / 2 + SHOULDER_METERS + BANK_METERS;
    for (let cellX = Math.floor((way.box[0] - out) / ROAD_SQUARE_METERS); cellX <= Math.floor((way.box[2] + out) / ROAD_SQUARE_METERS); cellX += 1) {
      for (let cellY = Math.floor((way.box[1] - out) / ROAD_SQUARE_METERS); cellY <= Math.floor((way.box[3] + out) / ROAD_SQUARE_METERS); cellY += 1) {
        const key = squareOf(cellX, cellY);
        if (!squares.has(key)) squares.set(key, []);
        squares.get(key).push(way);
      }
    }
  }
  const near = (x, y) => squares.get(squareOf(Math.floor(x / ROAD_SQUARE_METERS), Math.floor(y / ROAD_SQUARE_METERS))) ?? [];
  const lit = (paint, east, north, up) => {
    const bright = faceLight(light, east, north, up);
    return [paint[0] * bright, paint[1] * bright, paint[2] * bright];
  };
  // (The floor is the colour the map gives its roads at street level, whatever the sun: it is the same road.)
  const floorPaint = FLOOR_PAINT;
  const spot = [0, 0, 0, 0];
  const there = [0, 0, 0, 0];
  /**
   * One side of a way at a distance along it (side: 1 for the left of the line as drawn): how far its
   * floor reaches; whether a wall stands there (none where another sunken road lies alongside: `beside`
   * is how deep that one is); and how far the ground behind the wall runs before the next cutting.
   */
  const edge = (way, s, side) => {
    pointAlong(way, s, spot);
    const [x, y, east, north] = spot;
    const outEast = -north * side;
    const outNorth = east * side;
    const own = way.width / 2 + SHOULDER_METERS;
    let reach = own;
    let wall = true;
    let beside = 0;
    let least = Infinity; // the strip between this road and the nearest one alongside
    let bank = BANK_METERS;
    for (const other of near(x, y)) {
      if (other === way) continue;
      const found = nearestOn(other, x, y);
      if (found.distance > own + other.width / 2 + SHOULDER_METERS + BANK_METERS) continue;
      const deep = -heightAlong(other, found.along);
      if (!(deep > 0.4)) continue;
      pointAlong(other, found.along, there);
      if (!((there[0] - x) * outEast + (there[1] - y) * outNorth > 0.5)) continue;
      const gap = found.distance - way.width / 2 - other.width / 2;
      if (gap <= MEDIAN_MOST_METERS) {
        // Another road in the same cutting: no wall between them. (Of several, the nearest is the one this floor meets.)
        wall = false;
        if (gap < least) {
          least = gap;
          beside = deep;
        }
      } else {
        // A cutting of its own, further off on this side: the ground between the two ends at its wall.
        bank = Math.min(bank, found.distance - other.width / 2 - SHOULDER_METERS - own - 0.5);
      }
    }
    // Its floor and this one meet in the middle of the strip between the two roads (and lap over a little).
    if (least > 0 && least < Infinity) reach = Math.max(own, way.width / 2 + least / 2 + 0.3);
    if (wall) {
      // No wall, either, where it would stand on the floor of another: a slip road that has not yet drawn clear.
      const ex = x + outEast * reach;
      const ey = y + outNorth * reach;
      for (const other of near(ex, ey)) {
        if (other === way) continue;
        const found = nearestOn(other, ex, ey);
        if (found.distance > other.width / 2 + SHOULDER_METERS - 0.05) continue;
        const deep = -heightAlong(other, found.along);
        if (!(deep > 0.4)) continue;
        wall = false;
        beside = Math.max(beside, deep);
      }
    }
    return { x, y, east, north, outEast, outNorth, reach, wall, beside, bank };
  };
  /** How long the tunnel is that begins at a junction: as far as the ground over it can hide anything. */
  const tunnelFrom = (key) => {
    let long = 0;
    let at = key;
    let last = null;
    for (let hop = 0; hop < 12 && long < BANK_METERS; hop += 1) {
      const next = (network.joins.get(at) ?? []).find((join) => network.ways[join.way].hidden && !network.ways[join.way].rail && network.ways[join.way] !== last);
      if (!next) break;
      last = network.ways[next.way];
      long += last.length;
      at = last.ends[next.atStart ? 1 : 0];
    }
    return Math.min(long, BANK_METERS);
  };

  for (const way of sunken) {
    let any = false;
    for (let s = 0; s < way.length - 0.01; s += STEP_METERS) {
      const until = Math.min(s + STEP_METERS, way.length);
      const deep0 = -heightAlong(way, s);
      const deep1 = -heightAlong(way, until);
      if (!(deep0 > 0.03) && !(deep1 > 0.03)) continue;
      any = true;
      made.metres += until - s;
      const sides = [1, -1].map((side) => [edge(way, s, side), edge(way, until, side)]);
      const at = (cut, z) => [cut.x + cut.outEast * cut.reach, cut.y + cut.outNorth * cut.reach, z];
      const [[l0, l1], [r0, r1]] = sides;
      // The floor.
      mesh.face(at(r0, -deep0), at(r1, -deep1), at(l1, -deep1), at(l0, -deep0), floorPaint[0], floorPaint[1], floorPaint[2], 1);
      const lamp = glow ? lampOf(way) : null;
      if (glow) glow.face(at(r0, GLOW_UP_METERS - deep0), at(r1, GLOW_UP_METERS - deep1), at(l1, GLOW_UP_METERS - deep1), at(l0, GLOW_UP_METERS - deep0), lamp[0], lamp[1], lamp[2], GLOW_FLOOR);
      for (const [a, b] of sides) {
        if (a.wall && b.wall) {
          // The wall on this side, from the floor to the street: it looks in over the road.
          const [r, g, bl] = lit(WALL_PAINT, -a.outEast, -a.outNorth, 0);
          mesh.face(at(a, -deep0), at(b, -deep1), at(b, 0), at(a, 0), r, g, bl, 1);
          if (glow) {
            const inside = (cut, z) => [cut.x + cut.outEast * (cut.reach - GLOW_UP_METERS), cut.y + cut.outNorth * (cut.reach - GLOW_UP_METERS), z];
            glow.face(inside(a, -deep0), inside(b, -deep1), inside(b, 0), inside(a, 0), lamp[0], lamp[1], lamp[2], GLOW_WALL);
          }
          // And the ground behind it, as far as it can hide anything.
          const bank = Math.min(a.bank, b.bank);
          if (!(bank > 0.5)) continue;
          const far = (cut) => [cut.x + cut.outEast * (cut.reach + bank), cut.y + cut.outNorth * (cut.reach + bank), 0];
          banks.face(at(a, 0), at(b, 0), far(b), far(a), 0, 0, 0, 1);
        } else if (a.beside > deep0 + 0.3 || b.beside > deep1 + 0.3) {
          // The road alongside lies lower: a wall from this floor down to that one, looking out over it.
          const [r, g, bl] = lit(WALL_PAINT, a.outEast, a.outNorth, 0);
          mesh.face(at(a, -Math.max(a.beside, deep0)), at(b, -Math.max(b.beside, deep1)), at(b, -deep1), at(a, -deep0), r, g, bl, 1);
        }
      }
    }
    if (!any) continue;
    made.ways += 1;
    // Where it runs into a tunnel: the tunnel's mouth, dark, right across the cutting.
    way.ends.forEach((key, end) => {
      const long = tunnelFrom(key);
      const s = end === 0 ? 0 : way.length;
      const deep = -heightAlong(way, s);
      if (!(long > 0) || !(deep > 1)) return;
      const left = edge(way, s, 1);
      const right = edge(way, s, -1);
      const back = end === 0 ? -1 : 1; // which way along the road the tunnel lies from here
      // (A hand's breadth inside the cutting, clear of its end.)
      const p = (cut, z, far = -0.3) => [cut.x + cut.outEast * cut.reach + cut.east * back * far, cut.y + cut.outNorth * cut.reach + cut.north * back * far, z];
      mesh.face(p(right, -deep), p(left, -deep), p(left, -0.9), p(right, -0.9), MOUTH_PAINT[0], MOUTH_PAINT[1], MOUTH_PAINT[2], 1);
      // Over the mouth, the edge of the street that crosses above; and the ground the tunnel runs under.
      const [r, g, bl] = lit(WALL_PAINT, -left.east * back, -left.north * back, 0);
      mesh.face(p(right, -0.9), p(left, -0.9), p(left, 0), p(right, 0), r, g, bl, 1);
      banks.face(p(right, 0, 0), p(left, 0, 0), p(left, 0, long), p(right, 0, long), 0, 0, 0, 1);
      made.mouths += 1;
    });
  }
  return made;
}
