// The moving life of the 3D city: cars, buses and trains that travel the real
// streets and tracks of the map. It is a model railway, not a traffic report:
// the roads, rails, lanes and directions are real, where each vehicle is at
// any moment is made up.
//
// Nothing here touches the browser. Positions are in metres east and north of
// an origin, so the numbers stay small.

const METERS_PER_DEGREE = 111320;
const LANE_METERS = 3.4;

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
// metres a second, vehicles per kilometre of one direction when traffic is
// normal, and how many of them are buses.
const ROADS = {
  motorway: { lanes: 3, speed: 27, perKm: 42, buses: 0.02 },
  trunk: { lanes: 3, speed: 22, perKm: 38, buses: 0.04 },
  primary: { lanes: 2, speed: 16, perKm: 30, buses: 0.06 },
  secondary: { lanes: 2, speed: 13, perKm: 20, buses: 0.06 },
  tertiary: { lanes: 1, speed: 11, perKm: 11, buses: 0.03 },
  minor: { lanes: 1, speed: 8, perKm: 3.5, buses: 0 },
  busway: { lanes: 1, speed: 12, perKm: 4, buses: 1 },
  service: { lanes: 1, speed: 5, perKm: 0.8, buses: 0 },
};
const RAILS = new Set(['rail', 'transit']);

// Vehicles as stacks of boxes. Each box: [from, to] along the length (0 rear,
// 1 front), share of the width, bottom and top in metres, and what it is made of.
export const VEHICLES = {
  car: { length: 4.5, width: 1.8, boxes: [[0, 1, 1, 0.25, 0.82, 'body'], [0.24, 0.8, 0.9, 0.82, 1.4, 'glass'], [0.28, 0.76, 0.86, 1.4, 1.46, 'body']] },
  suv: { length: 4.9, width: 1.95, boxes: [[0, 1, 1, 0.3, 1.0, 'body'], [0.12, 0.8, 0.9, 1.0, 1.7, 'glass'], [0.14, 0.78, 0.88, 1.7, 1.77, 'body']] },
  van: { length: 5.3, width: 2.0, boxes: [[0, 1, 1, 0.3, 1.15, 'body'], [0.02, 0.9, 0.94, 1.15, 1.95, 'body'], [0.72, 0.93, 0.95, 1.2, 1.8, 'glass']] },
  truck: { length: 9, width: 2.5, boxes: [[0, 0.74, 1, 0.9, 3.4, 'cargo'], [0.78, 1, 0.96, 0.5, 2.6, 'body'], [0.9, 1.0, 0.97, 1.5, 2.3, 'glass']] },
  bus: { length: 12, width: 2.55, boxes: [[0, 1, 1, 0.35, 1.3, 'body'], [0.01, 0.99, 0.97, 1.3, 2.5, 'glass'], [0, 1, 1, 2.5, 3.1, 'body']] },
  coach: { length: 20, width: 2.9, boxes: [[0, 1, 1, 0.5, 1.6, 'body'], [0.02, 0.98, 0.97, 1.6, 2.9, 'glass'], [0, 1, 1, 2.9, 3.7, 'body']] },
};

// Paint, as [red, green, blue]. Cars: what is common on the road, most common first.
const CAR_PAINT = [
  [238, 238, 234], [238, 238, 234], [238, 238, 234], [238, 238, 234], [205, 208, 212], [205, 208, 212],
  [150, 155, 162], [40, 42, 48], [40, 42, 48], [196, 180, 150], [150, 34, 40], [38, 70, 130], [226, 226, 222],
];
const BUS_PAINT = [[24, 150, 140], [30, 118, 190], [226, 150, 30]];
const CARGO_PAINT = [[232, 232, 228], [210, 205, 190], [190, 196, 204]];
const TRAIN_PAINT = [[236, 238, 240]];
export const GLASS = [48, 62, 82];

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

const endKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

/**
 * Turn map lines into ways that can be driven.
 *
 * lines: [{ class, oneway (1, -1 or 0), tunnel, coordinates: [[lng, lat], …] }]
 * origin: { lng, lat }
 * Returns { ways, joins, roadKm, railKm }.
 */
export function buildNetwork(lines, origin) {
  const squeeze = Math.cos((origin.lat * Math.PI) / 180) * METERS_PER_DEGREE;
  const ways = [];
  const joins = new Map();
  let roadKm = 0;
  let railKm = 0;

  for (const line of lines) {
    const rail = RAILS.has(line.class);
    const road = ROADS[line.class];
    const coordinates = line.coordinates;
    if ((!rail && !road) || !Array.isArray(coordinates) || coordinates.length < 2) continue;

    const count = coordinates.length;
    const xy = new Float64Array(count * 2);
    const along = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      xy[i * 2] = (coordinates[i][0] - origin.lng) * squeeze;
      xy[i * 2 + 1] = (coordinates[i][1] - origin.lat) * METERS_PER_DEGREE;
      if (i > 0) along[i] = along[i - 1] + Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]);
    }
    const length = along[count - 1];
    if (!(length > 1)) continue;

    const first = coordinates[0];
    const last = coordinates[count - 1];
    const way = {
      // The same line gets the same name every time the network is rebuilt, so vehicles can stay on it.
      key: `${line.class}:${first[0].toFixed(6)},${first[1].toFixed(6)}:${last[0].toFixed(6)},${last[1].toFixed(6)}:${count}`,
      rail,
      class: line.class,
      oneway: rail ? 0 : Number(line.oneway) || 0,
      hidden: Boolean(line.tunnel),
      lanes: rail ? 1 : road.lanes,
      speed: rail ? 20 : road.speed,
      perKm: rail ? 0 : road.perKm,
      buses: rail ? 0 : road.buses,
      xy,
      along,
      length,
    };
    const index = ways.push(way) - 1;
    for (const [atStart, x, y] of [[true, xy[0], xy[1]], [false, xy[count * 2 - 2], xy[count * 2 - 1]]]) {
      const key = `${rail ? 'r' : 'd'}${endKey(x, y)}`;
      if (!joins.has(key)) joins.set(key, []);
      joins.get(key).push({ way: index, atStart });
    }
    if (rail) railKm += length / 1000;
    else roadKm += (length / 1000) * (way.oneway === 0 ? 2 : 1);
  }
  return { ways, joins, roadKm, railKm };
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

/** The traffic on a network: vehicles on the roads and trains on the rails. */
export class Traffic {
  constructor({ seed = 1, most = 650 } = {}) {
    this.random = seededRandom(seed);
    this.most = most;
    this.network = { ways: [], joins: new Map(), roadKm: 0, railKm: 0 };
    this.vehicles = [];
    this.trains = [];
    this.level = 1;
    this.sinceSorted = 0;
    this.spare = [0, 0, 0, 0];
  }

  /**
   * Swap in a new network. Vehicles on a line that is still there carry on; the
   * rest are dropped. shift: how far the new origin moved the ground, [east, north] in metres.
   */
  setNetwork(network, shift = [0, 0]) {
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
    this.roads = network.ways.map((way, index) => (way.rail ? null : index)).filter((index) => index !== null);
    this.rails = network.ways.map((way, index) => (way.rail && !way.hidden ? index : null)).filter((index) => index !== null);
    // Chance of a new vehicle starting on each road: by its length and how busy its kind is.
    let total = 0;
    this.roadShares = this.roads.map((index) => {
      const way = network.ways[index];
      total += way.length * way.perKm * (way.oneway === 0 ? 2 : 1);
      return total;
    });
    this.fill();
  }

  /** How many vehicles this network should carry right now. */
  wanted() {
    let count = 0;
    for (const index of this.roads ?? []) {
      const way = this.network.ways[index];
      count += (way.length / 1000) * way.perKm * (way.oneway === 0 ? 2 : 1);
    }
    return Math.min(Math.round(count * this.level), this.most);
  }

  wantedTrains() {
    return this.network.railKm > 0.3 ? Math.min(Math.max(Math.round(this.network.railKm * 0.8), 1), 6) : 0;
  }

  fill() {
    const wanted = this.wanted();
    let tries = wanted * 3;
    while (this.vehicles.length < wanted && tries > 0) {
      tries -= 1;
      const vehicle = this.spawn();
      if (vehicle) this.vehicles.push(vehicle);
    }
    // When the streets should be emptier, the surplus drives off: it fades out rather than vanishing.
    let staying = 0;
    for (const vehicle of this.vehicles) if (!vehicle.leaving) staying += 1;
    for (let i = this.vehicles.length - 1; i >= 0 && staying > wanted * 1.2 + 5; i -= 1) {
      if (!this.vehicles[i].leaving) {
        this.vehicles[i].leaving = true;
        staying -= 1;
      }
    }
    while (this.trains.length < this.wantedTrains()) {
      const train = this.spawnTrain();
      if (!train) break;
      this.trains.push(train);
    }
  }

  spawn() {
    const shares = this.roadShares;
    if (!shares || shares.length === 0 || !(shares[shares.length - 1] > 0)) return null;
    const random = this.random;
    const at = random() * shares[shares.length - 1];
    let low = 0;
    let high = shares.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (shares[middle] < at) low = middle + 1;
      else high = middle;
    }
    const wayIndex = this.roads[low];
    const way = this.network.ways[wayIndex];
    const forward = way.oneway === 1 || (way.oneway === 0 && random() < 0.5);
    const lanes = way.oneway === 0 ? Math.max(way.lanes - 1, 1) : way.lanes;
    const lane = Math.floor(random() * lanes);

    let type = 'car';
    const roll = random();
    if (random() < way.buses) type = 'bus';
    else if (roll < 0.3) type = 'suv';
    else if (roll < 0.37) type = 'van';
    else if (roll < 0.37 + (way.lanes >= 2 ? 0.06 : 0.01)) type = 'truck';
    const heavy = type === 'bus' || type === 'truck';
    const paint = type === 'bus' ? pick(BUS_PAINT, random) : pick(CAR_PAINT, random);

    return {
      way: wayIndex,
      forward,
      s: random() * way.length,
      lane,
      // Right-hand traffic: a two-way road keeps its lanes to the right of the middle line.
      offset: way.oneway === 0 ? (lane + 0.5) * LANE_METERS : (lane - (lanes - 1) / 2) * LANE_METERS,
      wish: way.speed * (heavy ? 0.8 : 0.85 + random() * 0.35),
      speed: way.speed * 0.8,
      type,
      paint,
      cargo: type === 'truck' ? pick(CARGO_PAINT, random) : paint,
      shown: 0, // fades in from nothing
      leaving: false,
    };
  }

  spawnTrain() {
    if (!this.rails || this.rails.length === 0) return null;
    const random = this.random;
    const wayIndex = pick(this.rails, random);
    const way = this.network.ways[wayIndex];
    const forward = random() < 0.5;
    return {
      way: wayIndex,
      forward,
      s: forward ? 0 : way.length,
      speed: 14 + random() * 8,
      cars: 4 + Math.floor(random() * 3),
      paint: pick(TRAIN_PAINT, random),
      stripe: pick(BUS_PAINT, random),
      trail: [],
      travelled: 0,
      shown: 0,
      leaving: false,
      wait: random() * 6, // seconds before it sets off
    };
  }

  /** Where a vehicle goes when its way ends: another way that starts there, or nowhere. */
  next(item, rail) {
    const way = this.network.ways[item.way];
    const at = item.forward ? way.along.length - 1 : 0;
    const x = way.xy[at * 2];
    const y = way.xy[at * 2 + 1];
    const options = this.network.joins.get(`${rail ? 'r' : 'd'}${endKey(x, y)}`);
    if (!options) return null;
    const here = pointAlong(way, item.forward ? way.length : 0, this.spare);
    const east = here[2] * (item.forward ? 1 : -1);
    const north = here[3] * (item.forward ? 1 : -1);

    let best = null;
    let bestScore = 0;
    for (const option of options) {
      if (option.way === item.way) continue;
      const other = this.network.ways[option.way];
      if (rail ? other.hidden : false) continue; // a train stops where the track goes underground
      // Entering at its start means driving it forwards, which a one-way road may forbid.
      if (!rail && ((option.atStart && other.oneway === -1) || (!option.atStart && other.oneway === 1))) continue;
      const there = pointAlong(other, option.atStart ? 0 : other.length, [0, 0, 0, 0]);
      const straight = (there[2] * east + there[3] * north) * (option.atStart ? 1 : -1);
      if (straight < -0.5) continue; // no U-turns
      // Mostly straight on, mostly staying on the same kind of road, never quite certain.
      const score = (0.15 + Math.max(straight, 0)) * (other.class === way.class ? 2 : 1) * (0.5 + this.random());
      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }
    return best;
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

    for (const vehicle of this.vehicles) {
      const way = ways[vehicle.way];
      const target = Math.min(vehicle.wish, vehicle.limit ?? Infinity);
      vehicle.speed += Math.min(Math.max(target - vehicle.speed, -6 * dt), 2.5 * dt);
      vehicle.s += vehicle.speed * dt * (vehicle.forward ? 1 : -1);
      vehicle.shown = Math.min(Math.max(vehicle.shown + (vehicle.leaving ? -dt : dt) * 1.5, 0), 1);

      if (vehicle.s > way.length || vehicle.s < 0) {
        const over = vehicle.s < 0 ? -vehicle.s : vehicle.s - way.length;
        const option = this.next(vehicle, false);
        if (option) {
          const other = ways[option.way];
          const lanes = other.oneway === 0 ? Math.max(other.lanes - 1, 1) : other.lanes;
          vehicle.way = option.way;
          vehicle.forward = option.atStart;
          vehicle.s = option.atStart ? over : other.length - over;
          vehicle.lane = Math.min(vehicle.lane, lanes - 1);
          vehicle.offset = other.oneway === 0 ? (vehicle.lane + 0.5) * LANE_METERS : (vehicle.lane - (lanes - 1) / 2) * LANE_METERS;
          vehicle.wish = (vehicle.wish / way.speed) * other.speed;
        } else {
          vehicle.gone = true; // the road ran out: the edge of the map, or a dead end
        }
      }
    }
    if (this.vehicles.some((vehicle) => vehicle.gone || (vehicle.leaving && vehicle.shown === 0))) {
      this.vehicles = this.vehicles.filter((vehicle) => !vehicle.gone && !(vehicle.leaving && vehicle.shown === 0));
    }

    for (const train of this.trains) {
      if (train.wait > 0) {
        train.wait -= dt;
        continue;
      }
      const way = ways[train.way];
      train.shown = Math.min(Math.max(train.shown + (train.leaving ? -dt : dt), 0), 1);
      const moved = train.speed * dt;
      train.s += moved * (train.forward ? 1 : -1);
      train.travelled += moved;
      if (train.s > way.length || train.s < 0) {
        const over = train.s < 0 ? -train.s : train.s - way.length;
        const option = this.next(train, true);
        if (option) {
          train.way = option.way;
          train.forward = option.atStart;
          train.s = option.atStart ? over : ways[option.way].length - over;
        } else {
          train.s = Math.min(Math.max(train.s, 0), way.length);
          train.leaving = true; // end of the line in view
        }
      }
      // Remember where the front has been, so the cars behind can follow the same curve.
      const now = pointAlong(ways[train.way], train.s, this.spare);
      const trail = train.trail;
      const lastAt = trail.length > 0 ? trail[trail.length - 1][2] : -Infinity;
      if (train.travelled - lastAt >= TRAIL_STEP_METERS) {
        trail.push([now[0], now[1], train.travelled]);
        const keep = Math.ceil((train.cars * TRAIN_CAR_METERS) / TRAIL_STEP_METERS) + 4;
        if (trail.length > keep) trail.splice(0, trail.length - keep);
      }
    }
    if (this.trains.some((train) => train.leaving && train.shown === 0)) {
      this.trains = this.trains.filter((train) => !(train.leaving && train.shown === 0));
    }
    this.fill();
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

  /** Call back with each vehicle that can be seen: (type, x, y, east, north, paint, cargo, shown). */
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
      draw(vehicle.type, spot[0] + north * vehicle.offset, spot[1] - east * vehicle.offset, east, north, vehicle.paint, vehicle.cargo, vehicle.shown);
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
        draw('coach', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / span, (b[1] - a[1]) / span, train.paint, train.stripe, train.shown);
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
 * Add one vehicle to a mesh: its boxes, and the shade it throws on the road.
 * (x, y) is its middle, (east, north) the way it points. reach: what
 * shadowReach() gives, or null. scale: 1 is life size.
 */
export function drawVehicle(mesh, type, x, y, east, north, paint, cargo, shown, light, reach, scale = 1) {
  const shape = VEHICLES[type];
  const length = shape.length * scale;
  const halfLength = length / 2;
  const halfWidth = (shape.width * scale) / 2;
  // Right of the vehicle, seen the way it points.
  const rightEast = north;
  const rightNorth = -east;

  if (reach) {
    // A dark patch under and beside the vehicle, pulled out the way shadows fall.
    const direction = (reach.bearing * Math.PI) / 180;
    const pull = Math.min(reach.factor, 2) * 1.2 * scale;
    const sx = x + Math.sin(direction) * pull;
    const sy = y + Math.cos(direction) * pull;
    const corner = (along, across) => [sx + east * along + rightEast * across, sy + north * along + rightNorth * across, 0.06];
    mesh.face(corner(-halfLength, -halfWidth), corner(halfLength, -halfWidth), corner(halfLength, halfWidth), corner(-halfLength, halfWidth), 16, 20, 32, 0.3 * shown);
  }

  for (const [from, to, share, bottom, top, material] of shape.boxes) {
    const rear = -halfLength + length * from;
    const front = -halfLength + length * to;
    const side = halfWidth * share;
    const low = bottom * scale;
    const high = top * scale;
    const colour = material === 'glass' ? GLASS : material === 'cargo' ? cargo : paint;
    const at = (along, across, z) => [x + east * along + rightEast * across, y + north * along + rightNorth * across, z];
    const paintFace = (a, b, c, d, nEast, nNorth, nUp) => {
      const lit = faceLight(light, nEast, nNorth, nUp);
      mesh.face(a, b, c, d, colour[0] * lit, colour[1] * lit, colour[2] * lit, shown);
    };
    paintFace(at(rear, -side, high), at(front, -side, high), at(front, side, high), at(rear, side, high), 0, 0, 1);
    paintFace(at(front, -side, low), at(front, side, low), at(front, side, high), at(front, -side, high), east, north, 0);
    paintFace(at(rear, side, low), at(rear, -side, low), at(rear, -side, high), at(rear, side, high), -east, -north, 0);
    paintFace(at(rear, side, low), at(front, side, low), at(front, side, high), at(rear, side, high), rightEast, rightNorth, 0);
    paintFace(at(front, -side, low), at(rear, -side, low), at(rear, -side, high), at(front, -side, high), -rightEast, -rightNorth, 0);
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
  traffic.eachVehicle((type, x, y, east, north, paint, cargo, shown) => {
    drawVehicle(mesh, type, x, y, east, north, paint, cargo, shown, light, reach, scale);
    drawn += 1;
  });
  return drawn;
}

// ── Trees ─────────────────────────────────────────────────────────────────

const LEAVES = [[58, 102, 52], [70, 116, 58], [48, 92, 50], [82, 122, 62]];
const BARK = [104, 84, 62];

/**
 * Fill a mesh with trees: a trunk, a crown of six sides that narrows to a
 * point, and its shade on the ground. trees: [{ x, y, radius }] in metres,
 * radius being the crown's. The same tree always comes out the same.
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
    const trunk = 1.2 + radius * 0.5;
    const shoulder = trunk + radius * 0.9;
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

    const width = 0.12 + radius * 0.07;
    const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    sides.forEach(([east, north], i) => {
      const [nextEast, nextNorth] = sides[(i + 1) % 4];
      const a = [x + (east - nextEast) * width, y + (north - nextNorth) * width];
      const b = [x + (east + nextEast) * width, y + (north + nextNorth) * width];
      const lit = faceLight(light, east, north, 0);
      mesh.face([a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], trunk + 0.3], [a[0], a[1], trunk + 0.3], BARK[0] * lit, BARK[1] * lit, BARK[2] * lit, 1);
    });

    const low = ring(radius * 0.7, trunk);
    const wide = ring(radius, shoulder);
    const peak = [x, y, top];
    for (let i = 0; i < 6; i += 1) {
      const next = (i + 1) % 6;
      const angle = turn + ((i + 0.5) * Math.PI) / 3;
      // The skirt of the crown looks outwards and a little down; the cap outwards and well up.
      const skirt = faceLight(light, Math.sin(angle) * 0.95, Math.cos(angle) * 0.95, -0.3);
      mesh.face(low[i], low[next], wide[next], wide[i], leaves[0] * skirt * 0.85, leaves[1] * skirt * 0.85, leaves[2] * skirt * 0.85, 1);
      const cap = faceLight(light, Math.sin(angle) * 0.7, Math.cos(angle) * 0.7, 0.7);
      mesh.face(wide[i], wide[next], peak, peak, leaves[0] * cap, leaves[1] * cap, leaves[2] * cap, 1);
    }
  }
  return trees.length;
}
