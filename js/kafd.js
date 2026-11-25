// The King Abdullah Financial District: its buildings, each on its own outline.
//
// The district is one plan (Henning Larsen's) built as some ninety-five buildings by many hands, and what
// makes it one place is a way of building: every block is a crystal. Its faces are folded along slanting
// lines, its top is cut off aslant, and its skin is one of a few kinds: dark or blue glass, pale panels
// pierced with diamond windows, stone with slots in it. The map data knows each of them only as an
// outline, and of half of them a height; drawn from that alone the district is a field of plain blocks
// round the two that were built by hand before (the PIF Tower and the metro station: see landmarks.js).
//
// Here every building is rebuilt as a true model (see models.js) on its own outline:
//   - where it stands and its outline are the buildings data's (Overture Maps, as the app's own map
//     draws it; kept in kafd-data.js). Two buildings the data lacks were traced from the satellite photo
//     the app shows (Esri World Imagery): the great faceted hall north of the PIF Tower, and the block
//     east of it;
//   - its height is the data's where the data has one. That is the height of its highest point, a spire
//     included. For the rest it was read off the same satellite photo, which is taken at a slant: the roof
//     of a building lies north-north-west of its foot by 0.48 of its height. Such a height is good to some
//     ten metres;
//   - what it is made of, and how its top is cut, is read off that photo and off photographs of the
//     district from the ground (Wikimedia Commons). For the towers that can be told apart in them it is
//     what the photographs show; for a building seen only from above it is the nearest of the district's
//     kinds to the colour of its roof and of what shows of its walls. None of it is measured.
// The World Trade Center and the Grand Mosque are built to what is published of them besides.
//
// Nothing here touches the browser. Measurements are in metres; places on the map are [lng, lat].

import { KAFD_AT, KAFD_OUTLINES } from './kafd-data.js';
import { beam, frame } from './solids.js';

const METERS_PER_DEGREE = 111320;
const DEGREES = Math.PI / 180;
const SQUEEZE = Math.cos(KAFD_AT[1] * DEGREES) * METERS_PER_DEGREE;

/** The district's buildings: { n, at: [east, north] of KAFD_AT, height, known, ring: [[east, north], …] from its middle, anticlockwise }. */
export const KAFD_BUILDINGS = KAFD_OUTLINES.map(([n, east, north, height, known, flat]) => {
  const ring = [];
  for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] / 10, flat[i + 1] / 10]);
  return { n, at: [east, north], height, known: known === 1, ring };
});

// ── What the district is made of ──────────────────────────────────────────

// The cool white most of the district lights its edges in by night.
const EDGE_LIGHT = '#dcebff';

/**
 * The skins. Of glass: its colour, how much of a mirror it is, how plainly its floors show, the net of fins
 * over it, and how bright the lines along its folds are. Of a pierced skin: its colour, the size of one
 * window with the skin round it, and how much is cut away (see models.js).
 */
const SKINS = {
  // Dark glass under a net of fins, the folds picked out in pale lines: the PIF Tower's family.
  dark: { kind: 'glass', colour: '#2c3f44', bay: 3, lit: 0.45, fins: 0.75, mirror: 0.15, ridge: 1, light: EDGE_LIGHT, glow: 0.5 },
  // Blue glass that mirrors the sky.
  blue: { kind: 'glass', colour: '#4c7a9f', bay: 3, lit: 0.4, floors: 0.45, mirror: 0.6, ridge: 0.9, light: EDGE_LIGHT, glow: 0.45 },
  // Glass so pale that it is nearly white where the sky is in it.
  ice: { kind: 'glass', colour: '#9db8cb', bay: 3, lit: 0.35, floors: 0.35, mirror: 0.8, ridge: 1, light: '#eef6ff', glow: 0.5 },
  // Grey-blue glass, every floor a strong pale line.
  steel: { kind: 'glass', colour: '#3a4f62', bay: 3, lit: 0.45, floors: 1, mirror: 0.35, ridge: 0.6, light: EDGE_LIGHT, glow: 0.4 },
  // Black glass, in great flat facets.
  black: { kind: 'glass', colour: '#1c242a', bay: 4, lit: 0.25, floors: 0.3, mirror: 0.3, ridge: 1, light: '#ffffff', glow: 0.5 },
  // Clear glass in a white frame: the facets of the hall.
  facet: { kind: 'glass', colour: '#6f93ad', bay: 3.5, lit: 0.6, floors: 0.25, mirror: 0.7, ridge: 1, light: '#ffffff', glow: 0.6 },
  // Pale grey panels in a fine slanting net over glass: the World Trade Center.
  pale: { kind: 'glass', colour: '#8794a0', bay: 2.4, lit: 0.35, fins: 1, floors: 0.3, mirror: 0.45, ridge: 1, light: '#ffffff', glow: 0.55 },
  // White panels with diamond windows, some large and some small.
  lattice: { kind: 'pierced', colour: '#ece9e1', bay: 3.4, storey: 4.2, diamonds: true, holes: 0.45, lit: 0.3, light: '#fff1d8', glow: 0.22 },
  // A cream mesh of diamonds, wide open, with the glass behind it.
  mesh: { kind: 'pierced', colour: '#e4dccb', bay: 5.5, storey: 2.6, diamonds: true, holes: 0.95, lit: 0.3, light: '#fff1d8', glow: 0.2 },
  // White panels pricked with small holes.
  screen: { kind: 'pierced', colour: '#efece6', bay: 2, storey: 2, diamonds: true, holes: 0.2, lit: 0.2, light: '#fff1d8', glow: 0.3 },
  // Tan stone with windows in rows.
  stone: { kind: 'pierced', colour: '#cdbb9b', bay: 3, holes: 0.35, lit: 0.3, light: '#ffe9c4', glow: 0.18 },
  // White stone with windows in rows.
  white: { kind: 'pierced', colour: '#e9e6de', bay: 3, holes: 0.3, lit: 0.3, light: '#fff1d8', glow: 0.2 },
  // White bands and bands of glass, by turns, right round.
  bands: { kind: 'pierced', colour: '#e8e8e4', bay: 3, holes: 1, lit: 0.4, light: '#fff1d8', glow: 0.15 },
  // The red-brown of the low blocks by the station.
  terracotta: { kind: 'pierced', colour: '#8c5140', bay: 3, holes: 0.35, lit: 0.3, light: '#ffd9b0', glow: 0.18 },
  // The mosque's stone: no windows to speak of, and lamps trained on it by night.
  sand: { kind: 'plain', colour: '#e2d8c2', ridge: 0.5, light: '#ffe6bd', glow: 0.55 },
};

/** The colour of a roof under each skin. */
const ROOFS = { dark: '#39434b', blue: '#56677a', ice: '#aebfcc', steel: '#4a5661', black: '#23292e', facet: '#5b6f81', pale: '#c9cfd4', lattice: '#ebe8e0', mesh: '#d9d4c8', screen: '#eeebe5', stone: '#d6ccb8', white: '#ebe8e1', bands: '#e6e6e2', terracotta: '#96503f', sand: '#efe8d8' };

/**
 * How each building is built. skin: one of SKINS. For the rest, what is not said is as follows.
 *   top: 'slope' for glass (its roof one slanting plane), 'flat' for a pierced skin; 'peak': a crown of
 *     facets that meet in a point;
 *   drop: how far a slanting roof falls from its highest corner to its lowest (a fifth of the building's
 *     width, at most a sixth of its height);
 *   high: the way its roof rises, in degrees clockwise from north (each its own);
 *   tiers: for glass, into how many storeys of folds its height is divided (one to some 55 m);
 *   swing: how far its corners go in and out from one level of folds to the next, as a part of their
 *     distance from the middle (0.04);
 *   rise: for a peak, how far below the top its eaves are; apex: where the point stands, [east, north]
 *     from the building's middle;
 *   spire: a mast on its top, reaching the building's height: the roof itself is this much lower;
 *   taper: how much smaller its outline is at the top than at the foot (1: no smaller);
 *   height: what to build it to, where that is not the data's height.
 * (What the photographs show of each is said beside it; a building with nothing beside it was seen only
 * from above.)
 */
const PLANS = {
  // The World Trade Center: see tradeCentre.
  2: { skin: 'pale', drop: 26, high: 20, tiers: 5 },
  5: { skin: 'pale', drop: 30, high: 200, tiers: 4 },
  // Dark, its top one great slant of glass that rises to the north-west.
  3: { skin: 'steel', drop: 64, high: 322, tiers: 4, swing: 0.03 },
  // Dark glass under a low pyramid, and a mast on it: the data's 231 m is the tip of the mast.
  4: { skin: 'dark', top: 'peak', rise: 22, spire: 44, tiers: 3 },
  // The palest of the towers, under a crown of facets like a cut stone: the photo shows its point some
  // fifty metres over the data's height, which is taken here as its eaves.
  6: { skin: 'ice', top: 'peak', height: 250, rise: 48, tiers: 3, taper: 0.86 },
  7: { skin: 'dark', high: 250 },
  8: { skin: 'dark', high: 140 },
  9: { skin: 'dark', drop: 22, high: 300 },
  10: { skin: 'steel' },
  11: { skin: 'bands' },
  12: { skin: 'blue', high: 30 },
  13: { skin: 'stone' }, // tan stone with square windows, seen from above on its east side
  14: { skin: 'dark' },
  15: { skin: 'bands' }, // a white slab, banded
  16: { skin: 'lattice' },
  17: { skin: 'stone' },
  18: { skin: 'lattice' },
  19: { skin: 'blue', drop: 8 },
  20: { skin: 'dark' },
  21: { skin: 'steel', drop: 6 },
  22: { skin: 'stone' }, // the long terraced block of beige stone along the ring road
  23: { skin: 'screen', top: 'peak', rise: 16, tiers: 0 }, // white, pricked all over with dark holes, its roof in facets
  24: { skin: 'white' },
  25: { skin: 'terracotta' }, // red roofs in ridges
  26: { skin: 'stone' },
  27: { skin: 'terracotta' },
  28: { skin: 'terracotta' },
  29: { skin: 'stone' },
  32: { skin: 'white' },
  33: { skin: 'steel' },
  34: { skin: 'blue' },
  38: { skin: 'mesh' }, // the long block east of the towers, in a pale net
  41: { skin: 'stone' },
  42: { skin: 'facet', drop: 9, high: 215 }, // the wing of the hall that carries the district's name
  45: { skin: 'lattice' }, // white, three-sided
  46: { skin: 'sand' }, // the Grand Mosque: see grandMosque
  47: { skin: 'stone' },
  48: { skin: 'steel', drop: 5 },
  50: { skin: 'white' },
  51: { skin: 'dark' },
  52: { skin: 'stone' }, // tan stone, its roof stepped in terraces
  53: { skin: 'blue' },
  54: { skin: 'stone' },
  55: { skin: 'dark' },
  56: { skin: 'white' }, // the oval pavilion
  57: { skin: 'white' },
  58: { skin: 'stone' },
  60: { skin: 'blue', high: 200 },
  61: { skin: 'steel', swing: 0.07, tiers: 5 },
  62: { skin: 'blue' },
  63: { skin: 'ice' },
  64: { skin: 'stone' },
  65: { skin: 'lattice' },
  67: { skin: 'black', top: 'peak', rise: 12, tiers: 0 }, // black glass in a few great facets, north of the station's forecourt
  68: { skin: 'white', roof: '#6f8a4f' }, // its roof is planted
  69: { skin: 'stone' },
  71: { skin: 'steel', top: 'flat', tiers: 0 }, // the curved block at the district's northern point, banded
  72: { skin: 'stone' },
  73: { skin: 'blue', drop: 5 },
  74: { skin: 'dark', drop: 18 },
  75: { skin: 'lattice' }, // its walls show their diamonds even from above
  76: { skin: 'lattice' },
  77: { skin: 'bands' },
  78: { skin: 'bands' },
  79: { skin: 'blue', drop: 5 },
  80: { skin: 'dark' },
  81: { skin: 'bands', roof: '#50627a' },
  82: { skin: 'blue', drop: 4 },
  // The two traced from the photo: the hall (see hall), and a block of dark glass in white bands with a white roof.
  90: { skin: 'facet' },
  91: { skin: 'bands', roof: '#f0f0ee' },
};

// ── Building ──────────────────────────────────────────────────────────────

const raised = (place, height) => [place[0], place[1], height];
/** The way out of a wall that runs from one corner to the next of an outline that goes round anticlockwise. */
const outOf = (from, to) => [to[1] - from[1], -(to[0] - from[0]), 0];

/**
 * An outline with its small corners taken out: every corner that stands less than so far from the line
 * between its neighbours goes, the slightest first, while more than four are left. (A tower's folds run
 * from corner to corner: a corner that is only a kink in a wall would fold it into slivers.)
 */
export function thinned(ring, within) {
  const kept = ring.map((corner) => [corner[0], corner[1]]);
  for (;;) {
    if (kept.length <= 4) return kept;
    let least = Infinity;
    let which = -1;
    for (let i = 0; i < kept.length; i += 1) {
      const before = kept[(i + kept.length - 1) % kept.length];
      const after = kept[(i + 1) % kept.length];
      const long = Math.hypot(after[0] - before[0], after[1] - before[1]);
      const off = long > 1e-6 ? Math.abs((kept[i][0] - before[0]) * (after[1] - before[1]) - (kept[i][1] - before[1]) * (after[0] - before[0])) / long : 0;
      if (off < least) {
        least = off;
        which = i;
      }
    }
    if (least >= within) return kept;
    kept.splice(which, 1);
  }
}

/** How wide an outline is: the longer side of the upright box round it. */
const widthOf = (ring) => Math.max(Math.max(...ring.map((corner) => corner[0])) - Math.min(...ring.map((corner) => corner[0])), Math.max(...ring.map((corner) => corner[1])) - Math.min(...ring.map((corner) => corner[1])));

/**
 * One building of the district as a crystal: its own outline pulled up, folded and cut off.
 *
 * Glass is folded: its height is divided into tiers, and at each level between two tiers its corners
 * stand by turns a little out and a little in, the other way about at the next level; so every wall of
 * a tier is two flat triangles that meet along the line from the corner that stands out below to the one
 * that stands out above. Those lines are the slanting ridges that cross on the district's towers. A
 * pierced skin stands straight. The top is one plane, level or slanting, or a crown of facets up to a
 * point. At the foot of anything tall is a hall of clear glass, lit by night.
 *
 * Returns { beacons }: where the red lamps on its top are.
 */
export function crystal(model, building, plan) {
  const skin = SKINS[plan.skin];
  const glass = skin.kind === 'glass';
  const height = plan.height ?? building.height;
  const spire = plan.spire ?? 0;
  const top = height - spire; // the highest point of the building itself
  const kind = plan.top ?? (glass ? 'slope' : 'flat');
  const tiers = Math.max(plan.tiers ?? (glass ? Math.max(Math.round(top / 55), 1) : 0), 0);
  const ring = tiers > 0 ? thinned(building.ring, plan.thin ?? 2.5) : building.ring;
  const count = ring.length;
  const taper = plan.taper ?? 1;
  const wide = widthOf(ring);
  const rise = kind === 'peak' ? plan.rise ?? Math.min(wide * 0.3, top * 0.2) : 0;
  const eaves = top - rise;
  const drop = kind === 'slope' ? Math.min(plan.drop ?? Math.max(wide * 0.2, 3), eaves * (plan.drop ? 0.5 : 0.17)) : 0;
  // Which way the roof rises: each building its own way, unless told.
  const bearing = (plan.high ?? (building.n * 137.5) % 360) * DEGREES;
  const way = [Math.sin(bearing), Math.cos(bearing)];
  const crown = ring.map(([east, north]) => [east * taper, north * taper]);
  const reach = crown.map((corner) => corner[0] * way[0] + corner[1] * way[1]);
  const [least, most] = [Math.min(...reach), Math.max(...reach)];
  const topAt = (i) => eaves - drop * (1 - (reach[i] - least) / Math.max(most - least, 1e-6));
  const lowest = eaves - drop;
  const storeys = Math.max(Math.round(top / (skin.storey ?? 4.1)), 1);
  const stuff = { ...skin, storey: skin.storey ?? top / storeys };
  // The hall at its foot: two storeys of clear glass with the lamps on.
  const hall = top >= 28 ? [{ from: 0, to: Math.min(9, top * 0.18), stuff: { kind: 'glass', colour: '#6e8794', storey: 4.5, bay: 3, lit: 1, mirror: 0.3, floors: 0.4 } }] : null;

  const levels = Math.max(tiers, 1);
  const swing = tiers > 1 ? plan.swing ?? 0.04 : 0;
  /** Corner i at a level: 0 is the ground, the last is the eaves. */
  const corner = (i, level) => {
    const part = level / levels;
    const out = level > 0 && level < levels ? ((i + level) % 2 === 0 ? swing : -swing) : 0;
    const by = 1 + (taper - 1) * part + out;
    return [ring[i][0] * by, ring[i][1] * by, level === levels ? topAt(i) : lowest * part];
  };
  for (let level = 0; level < levels; level += 1) {
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const [a, b, c, d] = [corner(i, level), corner(j, level), corner(j, level + 1), corner(i, level + 1)];
      const more = { out: outOf(ring[i], ring[j]), along: [ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]], from: ring[i], ...(level === 0 && hall ? { bands: hall } : {}) };
      if (!glass || tiers === 0) {
        model.quad(a, b, c, d, stuff, { ...more, lines: [false, false, false, false] });
      } else if ((i + level) % 2 === 0) {
        // (The fold runs from the corner that stands out below to the one that stands out above.)
        model.facet(a, b, c, stuff, more);
        model.facet(a, c, d, stuff, more);
      } else {
        model.facet(a, b, d, stuff, more);
        model.facet(b, c, d, stuff, more);
      }
    }
  }

  // The top. (It lies inside the block the map has for the building, or over one the map has too low: it
  // takes no shadow.)
  const rim = ring.map((_, i) => corner(i, levels));
  const beacons = [];
  if (kind === 'peak') {
    const [east, north] = plan.apex ?? [0, 0];
    const apex = [east, north, top];
    const facets = glass ? { ...stuff, lit: 0, open: true } : { ...stuff, kind: 'plain', colour: plan.roof ?? ROOFS[plan.skin], ridge: 0.8, open: true };
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      model.facet(rim[i], rim[j], apex, facets, { out: [rim[i][0] + rim[j][0] - 2 * east, rim[i][1] + rim[j][1] - 2 * north, wide] });
    }
    beacons.push([east, north, height + 0.6]);
  } else {
    model.flat(rim, { kind: 'plain', colour: plan.roof ?? ROOFS[plan.skin], open: true });
    // (A lamp on its highest corner; and on a long roof, one on the corner furthest from it.)
    const highest = rim.reduce((best, one) => (one[2] > best[2] ? one : best));
    beacons.push([highest[0] * 0.94, highest[1] * 0.94, highest[2] + 0.6]);
    const far = rim.reduce((best, one) => (Math.hypot(one[0] - highest[0], one[1] - highest[1]) > Math.hypot(best[0] - highest[0], best[1] - highest[1]) ? one : best));
    if (Math.hypot(far[0] - highest[0], far[1] - highest[1]) > 45) beacons.push([far[0] * 0.94, far[1] * 0.94, far[2] + 0.6]);
  }
  if (spire > 0) {
    const [east, north] = plan.apex ?? [0, 0];
    beam(model, [east, north, top - 1], [east, north, height], 1.1, { kind: 'plain', colour: '#d9dde0', light: '#ffffff', glow: 0.4 });
  }
  return { beacons };
}

/**
 * The KAFD World Trade Center (Gensler; 303 m, 67 floors above ground): the second-tallest tower of the
 * city. Its designers describe a solid rock split in two, with a wadi between: two shafts, the northern
 * one a third taller than the southern, in a skin of pale panels set in a fine slanting net, and between
 * them a seam of clear glass that runs the whole height.
 *
 * (The two shafts and their heights are the buildings data's, which has them apart: 304 m and 221 m. The
 * seam joins them here. How each top is cut is judged from the satellite photo.)
 */
function tradeCentre(model, tall, short) {
  // Built about the taller shaft's middle; the shorter one stands this far off.
  const off = [short.at[0] - tall.at[0], short.at[1] - tall.at[1]];
  const made = crystal(model, tall, PLANS[tall.n]);
  const moved = { ...short, ring: short.ring.map(([east, north]) => [east + off[0], north + off[1]]) };
  // (The shorter shaft's folds turn about its own middle, not the taller one's.)
  const lower = crystal(new Shifted(model, off), short, PLANS[short.n]);
  // The seam: clear glass between the two, from the ground to the shorter one's shoulder, lit from top to
  // bottom by night. It stands between the corners of the two that face each other.
  const nearest = (ring, towards) => [...ring].sort((p, q) => Math.hypot(p[0] - towards[0], p[1] - towards[1]) - Math.hypot(q[0] - towards[0], q[1] - towards[1])).slice(0, 2);
  const a = nearest(tall.ring, off);
  const b = nearest(moved.ring, [0, 0]);
  const seam = { kind: 'glass', colour: '#7fa3bd', storey: 4.4, bay: 2, lit: 1, mirror: 0.5, floors: 0.3, ridge: 0.6, light: '#ffffff', glow: 0.8 };
  const until = short.height * 0.86;
  // (Each wall of the seam runs from a corner of the taller shaft to the nearer corner of the shorter.)
  const pair = (from) => b.reduce((best, one) => (Math.hypot(one[0] - from[0], one[1] - from[1]) < Math.hypot(best[0] - from[0], best[1] - from[1]) ? one : best));
  const middle = [(a[0][0] + a[1][0] + b[0][0] + b[1][0]) / 4, (a[0][1] + a[1][1] + b[0][1] + b[1][1]) / 4];
  for (const from of a) {
    const to = pair(from);
    const inset = (place) => [place[0] + (middle[0] - place[0]) * 0.18, place[1] + (middle[1] - place[1]) * 0.18];
    const [p, q] = [inset(from), inset(to)];
    model.quad(raised(p, 0), raised(q, 0), raised(q, until), raised(p, until), seam, { out: [(p[0] + q[0]) / 2 - middle[0], (p[1] + q[1]) / 2 - middle[1], 0], lines: [false, true, false, true] });
  }
  return { beacons: [...made.beacons, ...lower.beacons.map(([east, north, up]) => [east + off[0], north + off[1], up])] };
}

/** A model that puts down its faces so far off from where another would: for a part of a building that is measured from a middle of its own. */
class Shifted {
  constructor(model, [east, north]) {
    this.model = model;
    this.by = [east, north];
    this.mesh = model.mesh;
  }

  moved(place) {
    return [place[0] + this.by[0], place[1] + this.by[1], place[2]];
  }

  facet(a, b, c, stuff, more = {}) {
    this.model.facet(this.moved(a), this.moved(b), this.moved(c), stuff, { ...more, ...(more.from ? { from: [more.from[0] + this.by[0], more.from[1] + this.by[1]] } : {}) });
  }

  quad(a, b, c, d, stuff, more = {}) {
    this.model.quad(this.moved(a), this.moved(b), this.moved(c), this.moved(d), stuff, { ...more, ...(more.from ? { from: [more.from[0] + this.by[0], more.from[1] + this.by[1]] } : {}) });
  }

  flat(points, stuff, more = {}) {
    this.model.flat(points.map((point) => this.moved(point)), stuff, { ...more, holes: (more.holes ?? []).map((hole) => hole.map((point) => this.moved(point))) });
  }
}

/**
 * The KAFD Grand Mosque (Omrania, 2017): a desert rose. Its walls are great leaning petals of pale stone
 * with hardly a window, and its roof is cut in facets; it stands where three of the district's wadis
 * meet, with a paved court for prayer on its north-east side and two slender minarets of 60 m.
 *
 * (Its outline is the buildings data's. That its walls are petals of stone, and its minarets and their
 * height, are as published; how high the hall itself stands, some 20 m, is read off the satellite photo.
 * Where the minarets stand is a judgement: at the edge of the court.)
 */
function grandMosque(model, building) {
  const stone = SKINS.sand;
  const ring = thinned(building.ring, 3);
  const count = ring.length;
  const eaves = 13;
  const top = building.height;
  // Each wall is a petal: it leans outwards as it rises, and its upper edge is a point over its middle.
  const petals = [];
  for (let i = 0; i < count; i += 1) {
    const [from, to] = [ring[i], ring[(i + 1) % count]];
    const out = outOf(from, to);
    const long = Math.hypot(out[0], out[1]) || 1;
    const lean = [(out[0] / long) * 1.6, (out[1] / long) * 1.6];
    const middle = [(from[0] + to[0]) / 2 + lean[0], (from[1] + to[1]) / 2 + lean[1]];
    const tip = raised(middle, eaves + 3.2);
    model.facet(raised(from, 0), raised(to, 0), tip, stone, { out });
    // (Between two petals, the wall behind them: it stands a little in.)
    petals.push({ from, to, tip, out });
  }
  const inner = ring.map(([east, north]) => [east * 0.9, north * 0.9]);
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const before = petals[(i + count - 1) % count];
    const here = petals[i];
    // From the tip of the petal before, down to this corner, and up to the tip of this petal: the gap
    // between two petals, closed by a facet that leans back to the roof.
    model.facet(before.tip, raised(ring[i], 0), here.tip, { ...stone, colour: '#d6cab0' }, { out: [ring[i][0], ring[i][1], 0], lines: [true, true, false] });
    model.facet(before.tip, here.tip, raised(inner[i], top - 2), { ...stone, open: true }, { out: [ring[i][0], ring[i][1], 12] });
    model.facet(here.tip, raised(inner[j], top - 2), raised(inner[i], top - 2), { ...stone, open: true }, { out: [here.out[0], here.out[1], 12] });
  }
  // The roof: low facets up to a point.
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    model.facet(raised(inner[i], top - 2), raised(inner[j], top - 2), [0, 0, top], { ...stone, colour: '#efe8d8', open: true }, { out: [inner[i][0] + inner[j][0], inner[i][1] + inner[j][1], 40] });
  }
  // The minarets: square, slender, drawing in to a point; lit from the foot by night.
  const shaft = { kind: 'plain', colour: '#e6dcc6', light: '#ffe6bd', glow: 0.7, ridge: 0.3 };
  const minarets = [[34, 25], [50, 17]];
  for (const [east, north] of minarets) {
    const to = frame([east, north], 28 * DEGREES);
    const half = 1.9;
    const waist = 1.1;
    const levels = [[0, half], [MINARET_METERS - 16, waist], [MINARET_METERS - 6, waist * 0.9], [MINARET_METERS, 0.05]];
    for (let k = 0; k < levels.length - 1; k += 1) {
      const [[z0, h0], [z1, h1]] = [levels[k], levels[k + 1]];
      const square = (h, z) => [to(-h, -h, z), to(h, -h, z), to(h, h, z), to(-h, h, z)];
      const [low, high] = [square(h0, z0), square(h1, z1)];
      for (let s = 0; s < 4; s += 1) {
        const t = (s + 1) % 4;
        model.quad(low[s], low[t], high[t], high[s], shaft, { out: [low[s][0] + low[t][0] - 2 * east, low[s][1] + low[t][1] - 2 * north, 0], lines: [false, true, false, true] });
      }
    }
  }
  return { beacons: [] };
}

/**
 * The hall north of the PIF Tower: a low crystal of clear glass in a white frame, each wall cut into
 * great triangles that lean by turns out and in, so that its upper edge runs in points. (The buildings
 * data does not have it: its outline was traced from the satellite photo, and its height, some 45 m,
 * read off the same.)
 */
function hall(model, building, plan) {
  const skin = { ...SKINS[plan.skin], storey: 5 };
  const ring = building.ring;
  const top = building.height;
  // Along each wall, a point every thirty metres or so; at the top they stand by turns high and out, low and in.
  const foot = [];
  const head = [];
  for (let i = 0; i < ring.length; i += 1) {
    const [from, to] = [ring[i], ring[(i + 1) % ring.length]];
    const long = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const pieces = Math.max(Math.round(long / 30), 1) * 2;
    const out = outOf(from, to);
    const size = Math.hypot(out[0], out[1]) || 1;
    for (let k = 0; k < pieces; k += 1) {
      const place = [from[0] + ((to[0] - from[0]) * k) / pieces, from[1] + ((to[1] - from[1]) * k) / pieces];
      const up = k % 2 === 1;
      // (A corner of the hall itself stands still: only the points along a wall lean.)
      const by = k === 0 ? 0 : up ? 2.6 : -1.2;
      foot.push({ place, wall: i });
      head.push([place[0] + (out[0] / size) * by, place[1] + (out[1] / size) * by, k === 0 ? top - 4 : up ? top : top - 8]);
    }
  }
  const count = foot.length;
  const lobby = [{ from: 0, to: 7, stuff: { ...skin, lit: 1, mirror: 0.3 } }];
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const [from, to] = [ring[foot[i].wall], ring[(foot[i].wall + 1) % ring.length]];
    const more = { out: outOf(from, to), along: [to[0] - from[0], to[1] - from[1]], from, bands: lobby };
    const [a, b] = [raised(foot[i].place, 0), raised(foot[j].place, 0)];
    if (i % 2 === 0) {
      model.facet(a, b, head[j], skin, more);
      model.facet(a, head[j], head[i], skin, more);
    } else {
      model.facet(a, b, head[i], skin, more);
      model.facet(b, head[j], head[i], skin, more);
    }
  }
  // The roof: a low pyramid of the same glass, in facets from point to point.
  const apex = [0, 0, top + 2];
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    model.facet(head[i], head[j], apex, { ...skin, colour: ROOFS.facet, lit: 0, mirror: 0.5, open: true }, { out: [head[i][0] + head[j][0], head[i][1] + head[j][1], 400] });
  }
  return { beacons: [] };
}

// ── The district on the map ───────────────────────────────────────────────

const building = (n) => KAFD_BUILDINGS.find((one) => one.n === n);
/** [lng, lat] of a place in the district's own measure. */
export const kafdPlace = ([east, north]) => [KAFD_AT[0] + east / SQUEEZE, KAFD_AT[1] + north / METERS_PER_DEGREE];

/** Whether a place (in the district's own measure) lies inside an outline that stands about a middle. */
function inside(ring, at, east, north) {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x0, y0] = [ring[i][0] + at[0], ring[i][1] + at[1]];
    const [x1, y1] = [ring[j][0] + at[0], ring[j][1] + at[1]];
    if (y0 > north !== y1 > north && east < x0 + ((north - y0) / (y1 - y0)) * (x1 - x0)) within = !within;
  }
  return within;
}

const REACHES = KAFD_BUILDINGS.map((one) => Math.max(...one.ring.map((corner) => Math.hypot(corner[0], corner[1]))));
const BOX = {
  west: Math.min(...KAFD_BUILDINGS.map((one, i) => one.at[0] - REACHES[i])),
  east: Math.max(...KAFD_BUILDINGS.map((one, i) => one.at[0] + REACHES[i])),
  south: Math.min(...KAFD_BUILDINGS.map((one, i) => one.at[1] - REACHES[i])),
  north: Math.max(...KAFD_BUILDINGS.map((one, i) => one.at[1] + REACHES[i])),
};

/**
 * Whether one of the district's buildings that is built here stands at a place: the map's own block
 * there is then left out. ([lng, lat] is the middle of that block: inside one of the outlines, or within
 * a few metres of its middle.)
 */
export function onKafd(lng, lat) {
  const east = (lng - KAFD_AT[0]) * SQUEEZE;
  const north = (lat - KAFD_AT[1]) * METERS_PER_DEGREE;
  if (east < BOX.west || east > BOX.east || north < BOX.south || north > BOX.north) return false;
  for (let i = 0; i < KAFD_BUILDINGS.length; i += 1) {
    const one = KAFD_BUILDINGS[i];
    const far = Math.hypot(east - one.at[0], north - one.at[1]);
    if (far > REACHES[i]) continue;
    if (far < 6 || inside(one.ring, one.at, east, north)) return true;
  }
  return false;
}

/** How tall the Grand Mosque's two minarets are. */
const MINARET_METERS = 60;

/** How far off a building of the district that is not a tower is still built: the towers are, from anywhere. */
const LOW_WITHIN_METERS = 6000;
const TOWER_FROM_METERS = 60;

/**
 * The district as landmarks for the map (see landmarks.js): first the ground it takes, then each
 * building: its name, where its middle is in metres east and north of KAFD_AT, how tall, and how it is
 * built. A building whose height the data does not have throws its shadow from a round of its own size.
 */
export const KAFD_PARTS = [
  { id: 'kafd', name: 'King Abdullah Financial District', at: [0, 0], height: 0, clear: 0, covers: onKafd },
  ...KAFD_BUILDINGS.filter((one) => PLANS[one.n] && one.n !== 5).map((one) => {
    const plan = PLANS[one.n];
    const height = plan.height ?? one.height;
    const area = Math.abs(one.ring.reduce((sum, corner, i) => sum + corner[0] * one.ring[(i + 1) % one.ring.length][1] - one.ring[(i + 1) % one.ring.length][0] * corner[1], 0)) / 2;
    const model = one.n === 2 ? (to) => tradeCentre(to, one, building(5)) : one.n === 46 ? (to) => grandMosque(to, one) : one.n === 90 ? (to) => hall(to, one, plan) : (to) => crystal(to, one, plan);
    return {
      id: `kafd-${one.n}`,
      name: one.n === 2 ? 'KAFD World Trade Center' : one.n === 46 ? 'KAFD Grand Mosque' : `King Abdullah Financial District, building ${one.n}`,
      at: one.at,
      // (The mosque is as tall as its minarets; its hall is the height told.)
      height: one.n === 46 ? MINARET_METERS : height,
      clear: 0,
      model,
      ...(height < TOWER_FROM_METERS ? { within: LOW_WITHIN_METERS } : {}),
      ...(!one.known && height >= 20 ? { shade: { radius: Math.sqrt(area / Math.PI) * 0.85, height } } : {}),
    };
  }),
];
