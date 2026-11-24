// The people on the pavements.
//
// Riyadh is a city of cars, and its pavements are never crowded; but they are not empty either. Who
// walks there, and when, is set down here as anyone sees it who walks there too, not from a count:
//
//  - Who. Men in the thobe, white from the shoulders to the ankles, with the red-and-white shemagh or
//    the white ghutra on their heads; women in the abaya, most of them black; and the many who have come
//    to work in the city, in shirt and trousers.
//  - When. Few in the heat of the day; more from the late afternoon; most in the evening, when the shops
//    are open and the air has cooled, until late; hardly anybody in the small hours.
//  - Where. Along the pavements the app lays beside its streets (see PAVEMENT_METERS in lib.js): more
//    of them along the main streets, where the shops are, than in the streets of houses.
//
// Each walks along a pavement at a walking pace, goes on along the street that leads straight on where
// one does, and turns back where none does. Nobody here is anybody: where each one is, is made up.
//
// Nothing here touches the browser. Places are in the scene's metres, east and north of its origin.

import { drawBox, heightAlong, localTime, pointAlong, seededRandom } from './life.js';

/** How many people walk along a kilometre of street of each kind when the pavements are at their fullest: both pavements together. */
const WALKERS_PER_KM = { minor: 5, tertiary: 9, secondary: 15, primary: 17 };
/** How wide the pavement beside each kind of street is, in metres (as the map lays it). */
const PAVEMENT_WIDE = { minor: 1.3, tertiary: 3.5, secondary: 3.5, primary: 4.5 };
const ON_THE_LEVEL_METERS = 0.5; // a street is walked along only where it lies on the ground
const STRAIGHT_ON = 0.5; // a street leads straight on if it turns by less than sixty degrees
const TURN_BACK_SHARE = 0.25; // of those who could go straight on, so many turn back all the same

/** How full the pavements are at an hour of the day (0 to 24, by the clock of the place): from 0 to 1. */
export function walkersLevel(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 0.06;
  if (h < 7) return 0.3;
  if (h < 11) return 0.5;
  if (h < 16) return 0.28; // the heat of the day
  if (h < 18) return 0.6;
  if (h < 23) return 1;
  return 0.5;
}

// What they wear, as [red, green, blue].
const THOBE = [236, 236, 230];
const SHEMAGH = [200, 92, 88];
const GHUTRA = [240, 240, 238];
const ABAYA = [28, 28, 32];
const TROUSERS = [54, 58, 68];
const SHIRTS = [[72, 112, 164], [204, 204, 208], [150, 62, 54], [92, 122, 84], [214, 176, 70], [96, 98, 106], [226, 222, 208]];
const SKIN = [172, 128, 98];
const HAIR = [44, 36, 32];

/** The kinds of walker, and what share of the people each is. */
const KINDS = [
  ['thobe', 0.45],
  ['abaya', 0.22],
  ['shirt', 0.33],
];

/** Whether people walk beside a way: a street with a pavement, on the ground, in the open. */
function walked(way) {
  return !way.rail && !way.hidden && !way.ramp && WALKERS_PER_KM[way.class] > 0 && Math.abs(heightAlong(way, way.length / 2)) < ON_THE_LEVEL_METERS;
}

/**
 * Which sides of a way have a pavement: to the right of the way as it runs (1), to its left (-1), or
 * both. A carriageway of a road that is drawn as two has its pavement on the right of its traffic only:
 * on its other side is the median.
 */
function sidesOf(way) {
  if (way.oneway === 1) return [1];
  if (way.oneway === -1) return [-1];
  return [1, -1];
}

export class Walkers {
  /** seed: for the chances it takes. now(): the time, in milliseconds. most: never more people than this. */
  constructor({ seed = 1, now = () => Date.now(), most = 700 } = {}) {
    this.random = seededRandom(seed);
    this.now = now;
    this.most = most;
    this.network = { ways: [], joins: new Map() };
    this.place = { lng: 0, lat: 0 };
    this.walkers = [];
    this.streets = [];
    this.shares = [];
    this.fullest = 0;
    this.spare = [0, 0, 0, 0];
    this.spare2 = [0, 0, 0, 0];
  }

  /**
   * Swap in a new network (as buildNetwork() in life.js gives it). Whoever is on a street that is still
   * there walks on; the rest are gone. place: where the network is, { lng, lat }.
   */
  setNetwork(network, place = this.place) {
    const byKey = new Map(network.ways.map((way, index) => [way.key, index]));
    this.walkers = this.walkers.filter((walker) => {
      const index = byKey.get(this.network.ways[walker.way]?.key);
      if (index === undefined || !walked(network.ways[index])) return false;
      walker.way = index;
      return true;
    });
    this.network = network;
    this.place = { lng: place.lng, lat: place.lat };
    // The chance of somebody setting out on each street: by its length and its kind.
    this.streets = [];
    this.shares = [];
    let total = 0;
    network.ways.forEach((way, index) => {
      if (!walked(way)) return;
      total += (way.length / 1000) * WALKERS_PER_KM[way.class] * (sidesOf(way).length / 2);
      this.streets.push(index);
      this.shares.push(total);
    });
    this.fullest = total;
    this.fill();
  }

  /** How many people should be out on this network right now. */
  wanted() {
    const { hour } = localTime(new Date(this.now()), this.place.lng);
    return Math.min(Math.round(this.fullest * walkersLevel(hour)), this.most);
  }

  /** Somebody new, somewhere along a street: or null if there is no street to walk along. */
  spawn() {
    const shares = this.shares;
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
    const index = this.streets[low];
    const way = this.network.ways[index];
    const sides = sidesOf(way);
    let pick = random();
    let kind = KINDS[KINDS.length - 1][0];
    for (const [name, share] of KINDS) {
      if (pick < share) {
        kind = name;
        break;
      }
      pick -= share;
    }
    return {
      way: index,
      s: random() * way.length,
      side: sides[Math.floor(random() * sides.length)],
      forward: random() < 0.5,
      // (Not on the kerb and not against the wall: somewhere across the pavement.)
      across: 0.25 + 0.5 * random(),
      pace: 1.0 + 0.5 * random(),
      kind,
      tone: random(),
      shown: 0, // fades in from nothing
      leaving: false,
    };
  }

  /** Bring the number of people to what it should be: the missing set out, those too many leave. */
  fill() {
    const wanted = this.wanted();
    let staying = 0;
    for (const walker of this.walkers) if (!walker.leaving) staying += 1;
    for (let tries = (wanted - staying) * 2; staying < wanted && tries > 0; tries -= 1) {
      const walker = this.spawn();
      if (walker) {
        this.walkers.push(walker);
        staying += 1;
      }
    }
    for (let i = this.walkers.length - 1; i >= 0 && staying > wanted * 1.2 + 3; i -= 1) {
      if (!this.walkers[i].leaving) {
        this.walkers[i].leaving = true;
        staying -= 1;
      }
    }
  }

  /**
   * Where somebody goes at the end of a street: along the street that leads straight on, on the same
   * side of it, if there is one with a pavement on that side; otherwise nowhere (and they turn back).
   * Returns { way, atStart } or null.
   */
  onward(walker) {
    const ways = this.network.ways;
    const way = ways[walker.way];
    const meeting = this.network.joins.get(way.ends[walker.forward ? 1 : 0]);
    if (!meeting) return null;
    const here = pointAlong(way, walker.forward ? way.length : 0, this.spare);
    const sign = walker.forward ? 1 : -1;
    // (Which side of their own way they walk on: to their right or to their left.)
    const hand = walker.side * sign;
    let best = null;
    let most = STRAIGHT_ON;
    for (const other of meeting) {
      if (other.way === walker.way) continue;
      const next = ways[other.way];
      if (!walked(next)) continue;
      const there = pointAlong(next, other.atStart ? 0 : next.length, this.spare2);
      const along = other.atStart ? 1 : -1;
      const straight = (there[2] * here[2] + there[3] * here[3]) * sign * along;
      if (straight <= most || !sidesOf(next).includes(hand * along)) continue;
      most = straight;
      best = other;
    }
    return best;
  }

  /** Move everybody on by a number of seconds. */
  step(seconds) {
    const dt = Math.min(Math.max(seconds, 0), 0.5);
    const ways = this.network.ways;
    let someGone = false;
    for (const walker of this.walkers) {
      walker.shown = Math.min(Math.max(walker.shown + (walker.leaving ? -dt : dt) * 1.2, 0), 1);
      if (walker.leaving && walker.shown === 0) someGone = true;
      const way = ways[walker.way];
      walker.s += walker.pace * dt * (walker.forward ? 1 : -1);
      if (walker.s <= way.length && walker.s >= 0) continue;
      const over = walker.s < 0 ? -walker.s : walker.s - way.length;
      const option = this.random() < TURN_BACK_SHARE ? null : this.onward(walker);
      if (option) {
        const hand = walker.side * (walker.forward ? 1 : -1);
        const other = ways[option.way];
        walker.way = option.way;
        walker.forward = option.atStart;
        walker.side = hand * (option.atStart ? 1 : -1);
        walker.s = option.atStart ? over : other.length - over;
      } else {
        // (They turn back: along the same pavement, the other way.)
        walker.forward = !walker.forward;
        walker.s = Math.min(Math.max(walker.s < 0 ? over : way.length - over, 0), way.length);
      }
    }
    if (someGone) this.walkers = this.walkers.filter((walker) => !(walker.leaving && walker.shown === 0));
    this.fill();
  }

  /**
   * Call back with everybody: (x, y, east, north, kind, tone, shown), where (east, north) is the way they
   * walk and tone a number of their own, 0 to 1, by which their clothes are picked.
   */
  each(draw) {
    const ways = this.network.ways;
    const spot = this.spare;
    for (const walker of this.walkers) {
      const way = ways[walker.way];
      pointAlong(way, walker.s, spot);
      const out = (way.width / 2 + PAVEMENT_WIDE[way.class] * walker.across) * walker.side;
      const sign = walker.forward ? 1 : -1;
      draw(spot[0] + spot[3] * out, spot[1] - spot[2] * out, spot[2] * sign, spot[3] * sign, walker.kind, walker.tone, walker.shown);
    }
  }
}

// How they are drawn: sizes in metres.
const BODY_HALF_WIDE = 0.21;
const BODY_HALF_DEEP = 0.13;
const SHOULDERS_UP = 1.44;
const HEAD_HALF = 0.1;
const HEAD_FROM = 1.47;
const HEAD_TO = 1.71;
const WAIST_UP = 0.84;
export const WALKER_SHADE_LONGEST = 2.2; // their shadow is drawn no longer than this many times their height

/**
 * Fill a mesh with the people who can be made out: those within near.within metres of the eye
 * (near.eye, [x, y, z]). Each is a body and a head (and, in shirt and trousers, legs of another colour),
 * with the shade they throw when the sun is up. light: as lightFrom() gives it; reach: as shadowReach()
 * gives it, or null. Returns how many were drawn.
 */
export function drawWalkers(mesh, walkers, light, reach, near) {
  mesh.clear();
  if (!walkers || !near || !(near.within > 0)) return 0;
  const within = near.within * near.within;
  let drawn = 0;
  walkers.each((x, y, east, north, kind, tone, shown) => {
    if ((x - near.eye[0]) ** 2 + (y - near.eye[1]) ** 2 + near.eye[2] ** 2 > within) return;
    if (reach) {
      // Their shade: from their feet to where the shadow of their head falls.
      const direction = (reach.bearing * Math.PI) / 180;
      const far = Math.min(reach.factor, WALKER_SHADE_LONGEST) * HEAD_TO;
      const [dx, dy] = [Math.sin(direction) * far, Math.cos(direction) * far];
      const [wx, wy] = [Math.cos(direction) * BODY_HALF_WIDE, -Math.sin(direction) * BODY_HALF_WIDE];
      mesh.face([x - wx, y - wy, 0.05], [x + wx, y + wy, 0.05], [x + wx + dx, y + wy + dy, 0.05], [x - wx + dx, y - wy + dy, 0.05], 16, 20, 32, 0.28 * shown);
    }
    const pick = (list) => list[Math.floor(tone * list.length) % list.length];
    if (kind === 'shirt') {
      drawBox(mesh, x, y, east, north, BODY_HALF_DEEP * 0.9, BODY_HALF_WIDE * 0.8, 0, WAIST_UP, TROUSERS, light, shown);
      drawBox(mesh, x, y, east, north, BODY_HALF_DEEP, BODY_HALF_WIDE, WAIST_UP, SHOULDERS_UP, pick(SHIRTS), light, shown);
      drawBox(mesh, x, y, east, north, HEAD_HALF, HEAD_HALF, HEAD_FROM, HEAD_TO, SKIN, light, shown, HAIR);
    } else if (kind === 'abaya') {
      drawBox(mesh, x, y, east, north, BODY_HALF_DEEP, BODY_HALF_WIDE, 0, SHOULDERS_UP, ABAYA, light, shown);
      drawBox(mesh, x, y, east, north, HEAD_HALF * 1.15, HEAD_HALF * 1.15, HEAD_FROM - 0.05, HEAD_TO, ABAYA, light, shown);
    } else {
      // (The cloth on his head hangs to his shoulders: wider than the head under it.)
      drawBox(mesh, x, y, east, north, BODY_HALF_DEEP, BODY_HALF_WIDE, 0, SHOULDERS_UP, THOBE, light, shown);
      drawBox(mesh, x, y, east, north, HEAD_HALF * 1.2, HEAD_HALF * 1.3, HEAD_FROM - 0.07, HEAD_TO, tone < 0.6 ? SHEMAGH : GHUTRA, light, shown);
    }
    drawn += 1;
  });
  return drawn;
}
