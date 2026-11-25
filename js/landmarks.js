// Riyadh's landmarks, modelled by hand.
//
// The map data knows a tower only as an outline and a height, so on its own it
// draws Kingdom Centre as a plain block. The handful of buildings that make
// the skyline are rebuilt here from photographs. Most are a stack of thin
// slabs, the way a model maker stacks sheets of card. A slab is an outline
// with a bottom and a top; stacking outlines that shrink, turn or part gives
// a taper, a twist or an arch. One by one they are being rebuilt as true
// models instead: flat faces that lean and fold, which the light falls on as
// it does on the real building (see models.js).
//
// Where each one stands, which way it is turned and how large its footprint
// is comes from the buildings data (Overture Maps, release 2026-11-18). Its
// height is the published one. The shape between is read off photographs.
//
// Nothing here touches the browser. Measurements are in metres.

import { WORLD_PARTS, worldPlace } from './boulevard.js';
import { KAFD_PARTS, kafdPlace } from './kafd.js';
import { Model, ModelMesh } from './models.js';
import { PROPS } from './props.js';

const TAU = Math.PI * 2;
const METERS_PER_DEGREE = 111320;

// ── Outlines ──────────────────────────────────────────────────────────────
// An outline is a list of [u, v] corners: u along the building's long axis,
// v to the left of it.

/** A circle of radius r as an outline of n corners, the first one turned by `turn` radians. */
const circle = (r, n = 20, turn = 0) => Array.from({ length: n }, (_, i) => [Math.cos(turn + (i / n) * TAU) * r, Math.sin(turn + (i / n) * TAU) * r]);
/** An ellipse with half-axes a (along) and b (across). */
const oval = (a, b, n = 28) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU) * a, Math.sin((i / n) * TAU) * b]);
/** A rectangle, by its half-sizes and its middle. */
const block = (halfU, halfV, atU = 0, atV = 0) => [[atU - halfU, atV - halfV], [atU + halfU, atV - halfV], [atU + halfU, atV + halfV], [atU - halfU, atV + halfV]];
/** A square with its corners cut off, by its half-size and the size of the cut. */
const cutSquare = (half, cut) => [[half - cut, -half], [half, -half + cut], [half, half - cut], [half - cut, half], [-half + cut, half], [-half, half - cut], [-half, -half + cut], [-half + cut, -half]];
const turned = (outline, degrees) => {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return outline.map(([u, v]) => [u * cos - v * sin, u * sin + v * cos]);
};
const grown = (outline, by, byV = by) => outline.map(([u, v]) => [u * by, v * byV]);
const moved = (outline, du, dv) => outline.map(([u, v]) => [u + du, v + dv]);

/**
 * Stack slabs from one height to another. outlineAt(z) gives the outline for
 * a slab from the height of its middle; paints are used in turn, one per slab.
 */
function stack(slabs, from, to, step, outlineAt, paints, more = {}) {
  let index = 0;
  for (let base = from; base < to - 1e-6; base += step) {
    const top = Math.min(base + step, to);
    const outline = outlineAt((base + top) / 2, index);
    if (outline && outline.length >= 3) slabs.push({ outline, base, top, paint: paints[index % paints.length], ...more });
    index += 1;
  }
}

// ── The towers ────────────────────────────────────────────────────────────

/**
 * Kingdom Centre, 302.3 m (Ellerbe Becket and Omrania, 2002), built as a
 * true model (see models.js). In plan an almond: two arcs that meet in a
 * point at either end, some 78 m from point to point and 40 m across, in
 * silvered glass without a seam, so that the whole tower is a mirror of the
 * sky. From 205 m up an opening is cut right through it in the shape of a
 * parabola, point down, 56 m wide at the top: what is left is two legs that
 * thin out as they rise, joined at 290 m by the sky bridge, a corridor of
 * steel and glass that the public can walk across.
 *
 * By night the tower stays dark but for the inside of the opening and its
 * edge on both faces, which are lit in colours that change all night.
 *
 * Where it stands and which way it is turned are from the buildings data,
 * which also has the opening begin at 205 m. Its height, the height of the
 * bridge's floor, the glass and the lighting are as published; its length
 * and width lie between the published figures and the outline in the data.
 * The width of the opening is measured off a photograph and agrees with the
 * published length of the bridge.
 */
function kingdomCentre(model) {
  const half = 38.75; // from the middle to either point
  const wide = 20; // from the middle to the swell of either face
  const height = 302.3;
  const foot = 205; // where the opening begins
  const deck = 290.4; // the floor of the sky bridge: the top of the opening
  const span = 28; // half the width of the opening under the bridge
  const radius = (half ** 2 + wide ** 2) / (2 * wide);
  const thick = (u) => Math.sqrt(Math.max(radius ** 2 - u ** 2, 0)) - (radius - wide);
  // (The model is turned so that its own north runs along the tower: a place u along it and v to the left is [-v, u].)
  const at = (u, v, z) => [-v, u, z];
  // Which way a face looks at a place along it: square to its arc. side: 1 for the face on the left, -1 for the other.
  const looks = (u, side) => [-side * Math.sqrt(Math.max(radius ** 2 - u ** 2, 0)), u, 0];
  const onFace = (u, side, z, out = 0) => {
    const way = looks(u, side);
    const far = Math.hypot(way[0], way[1]);
    const [east, north] = at(u, side * thick(u), z);
    return [east + (way[0] / far) * out, north + (way[1] / far) * out, z];
  };
  const opening = (z) => span * Math.sqrt(Math.min(Math.max((z - foot) / (deck - foot), 0), 1));

  const glass = { kind: 'glass', colour: '#8ea4b7', storey: 4.3, bay: 3.2, lit: 0.14, floors: 0.18, mirror: 0.8 };
  /** A piece of a face: from u0 to u1 along the tower at the lower height, and from u2 to u3 at the upper. */
  const piece = (side, z0, z1, u0, u1, u2, u3) => {
    // (Bays are counted along the arc from the tower's western point.)
    const along = Math.asin(Math.min(Math.max(u0 / radius, -1), 1)) * radius;
    const run = [u1 - u0, side * (thick(u1) - thick(u0))];
    const far = Math.hypot(run[0], run[1]) || 1;
    const dir = at(run[0] / far, run[1] / far, 0);
    const start = at(u0, side * thick(u0), 0);
    model.quad(onFace(u0, side, z0), onFace(u1, side, z0), onFace(u3, side, z1), onFace(u2, side, z1), glass, {
      out: looks((u0 + u1) / 2, side),
      normals: [looks(u0, side), looks(u1, side), looks(u3, side), looks(u2, side)],
      along: [dir[0], dir[1]],
      from: [start[0] - dir[0] * along, start[1] - dir[1] * along],
      lines: [false, false, false, false],
      own: 9, // one skin without a seam: every piece of it of the same tone
    });
  };
  // The body: the whole almond, up to where the opening begins.
  const strips = 18;
  for (const side of [1, -1]) {
    for (let i = 0; i < strips; i += 1) {
      const u0 = -half + (2 * half * i) / strips;
      const u1 = -half + (2 * half * (i + 1)) / strips;
      piece(side, 0, foot, u0, u1, u0, u1);
    }
  }
  // The legs: what is left of the almond beyond the opening, on either side of it. (The rows are closer
  // together low down, where the parabola opens fastest.) And above the bridge's floor, the tips of the legs.
  const rows = 14;
  const levels = Array.from({ length: rows + 1 }, (_, j) => foot + (deck - foot) * (j / rows) ** 2);
  levels.push(height);
  const across = 4;
  const lit = { kind: 'lamp', colour: '#dfe7ec', light: '#ffffff', glow: 1, changing: true };
  const inside = { kind: 'plain', colour: '#c4ced6', light: '#ffffff', glow: 0.8, changing: true };
  for (let j = 0; j < levels.length - 1; j += 1) {
    const [z0, z1] = [levels[j], levels[j + 1]];
    const [w0, w1] = [opening(z0), opening(z1)];
    for (const leg of [1, -1]) {
      for (const side of [1, -1]) {
        for (let i = 0; i < across; i += 1) {
          const place = (w, k) => leg * (w + ((half - w) * k) / across);
          piece(side, z0, z1, place(w0, i), place(w0, i + 1), place(w1, i), place(w1, i + 1));
        }
        // Along the edge of the opening, on both faces: the band of light the tower is known by after dark.
        if (z0 < deck) {
          model.quad(onFace(leg * (w0 + 0.15), side, z0, 0.25), onFace(leg * (w0 + 2.6), side, z0, 0.25), onFace(leg * (w1 + 2.6), side, z1, 0.25), onFace(leg * (w1 + 0.15), side, z1, 0.25), lit, {
            out: looks(leg * w0, side),
            lines: [false, false, false, false],
          });
        }
      }
      // The inside of the opening: it looks across at the other leg and up at the bridge.
      if (z0 < deck) {
        const slope = (z) => (z - foot < 0.01 ? [0, 0, 1] : [0, -leg, span / (2 * Math.sqrt((z - foot) * (deck - foot)))]);
        model.quad(at(leg * w0, -thick(w0), z0), at(leg * w0, thick(w0), z0), at(leg * w1, thick(w1), z1), at(leg * w1, -thick(w1), z1), inside, {
          out: [0, -leg, 0.4],
          normals: [slope(z0), slope(z0), slope(z1), slope(z1)],
          lines: [false, false, false, false],
        });
      }
    }
  }
  // The tops of the legs.
  const beacons = [];
  for (const leg of [1, -1]) {
    const tip = [];
    for (let i = 0; i <= across; i += 1) tip.push([leg * (span + ((half - span) * i) / across), -1]);
    for (let i = across - 1; i >= 0; i -= 1) tip.push([leg * (span + ((half - span) * i) / across), 1]);
    model.flat(tip.map(([u, side]) => at(u, side * thick(u), height)), { kind: 'plain', colour: '#b9c5cf' });
    beacons.push(at(leg * (half - 4), 0, height + 0.6));
  }
  // The sky bridge: a corridor from leg to leg with windows down both sides, its underside a shallow arch.
  const bridgeHalf = 5.5;
  const under = (u) => deck - 1.6 * (u / span) ** 2;
  const windows = { kind: 'glass', colour: '#93a8ba', storey: 5.95, bay: 2.4, lit: 1, floors: 0.6, mirror: 0.6, light: '#ffffff', glow: 0.7, changing: true };
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    const u0 = -span - 1 + ((2 * span + 2) * i) / steps;
    const u1 = -span - 1 + ((2 * span + 2) * (i + 1)) / steps;
    for (const side of [1, -1]) {
      model.quad(at(u0, side * bridgeHalf, under(u0)), at(u1, side * bridgeHalf, under(u1)), at(u1, side * bridgeHalf, height), at(u0, side * bridgeHalf, height), windows, {
        out: at(0, side, 0),
        along: [at(1, 0, 0)[0], at(1, 0, 0)[1]],
        lines: [false, false, false, false],
        own: 9,
      });
    }
    model.quad(at(u0, -bridgeHalf, under(u0)), at(u1, -bridgeHalf, under(u1)), at(u1, bridgeHalf, under(u1)), at(u0, bridgeHalf, under(u0)), inside, { out: [0, 0, -1], lines: [false, false, false, false] });
  }
  model.flat([[-span - 1, -bridgeHalf], [span + 1, -bridgeHalf], [span + 1, bridgeHalf], [-span - 1, bridgeHalf]].map(([u, v]) => at(u, v, height)), { kind: 'plain', colour: '#b9c5cf' });
  return { beacons };
}

/**
 * The podium that Kingdom Centre rises from: the shopping centre and the
 * hall for feasts in its two wings, four storeys. Low and wide: its roof is
 * laid and furnished like any other building's, so it stays a slab.
 */
function kingdomPodium() {
  return [{ outline: KINGDOM_PODIUM, base: 0, top: 16, paint: '#e3ddd2', north: true, roof: true }];
}

/**
 * Hamad Tower, 163 m: the blue sail beside King Fahd Road, next to Al
 * Faisaliah. Two parts stand end to end along the road on one podium. The
 * northern one is the sail. Square at its foot, it narrows upwards along a
 * curve in both directions at once: so its two upright faces of blue glass
 * (to the south and to the east) are each the shape of a sail, and its other
 * two sides are a curved back that leans in from the road and ends in a
 * point 163 m up, over the corner where the upright faces meet. The side of
 * the back that looks over the road is clad in grey metal with a slit of
 * window to each floor. The southern part is a plain block of 25 floors,
 * 98 m high. Both are held in a white frame that shows on the glass: a beam
 * every four floors, and a cross of braces between each beam and the next.
 *
 * (Its outlines are the street map's; its heights and its curve were
 * measured from a photograph taken along the road. What cannot be seen from
 * there, the far sides, is built to match the near ones.)
 */
function hamadTower(model) {
  const { top, roof, tier, braced, edge, wide, deep, south, block } = HAMAD;
  /** How much of its foot the sail still has at a height: all of it on the ground, none at its point. */
  const share = (z) => 1 - (Math.min(Math.max(z, 0), top) / top) ** HAMAD.curve;
  const west = (z) => edge - wide * share(z); // where the back meets the southern face
  const north = (z) => south + deep * share(z); // and where it meets the eastern one
  /** How fast the back leans in at a height: metres across for each metre up, for each metre of the foot. */
  const lean = (z) => (HAMAD.curve * Math.max(z, 0) ** (HAMAD.curve - 1)) / top ** HAMAD.curve;

  const glass = { kind: 'glass', colour: '#2a548a', storey: tier / 4, bay: 3.1, lit: 0.22, floors: 0.45, mirror: 0.5 };
  const frame = { kind: 'plain', colour: '#e4e7e8', light: '#dfe9ff', glow: 0.3 };
  const back = { kind: 'plain', colour: '#b3b8bc' };
  const slit = { kind: 'plain', colour: '#1d2a38' };
  const plain = [false, false, false, false];
  const PROUD = 0.35; // how far the frame stands out from the glass
  /** A member of the frame from one place to another, so thick, on a face that looks a given way. */
  const bar = (p, q, out, thick = 0.9) => {
    const run = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    let side = [out[1] * run[2] - out[2] * run[1], out[2] * run[0] - out[0] * run[2], out[0] * run[1] - out[1] * run[0]];
    const size = Math.hypot(side[0], side[1], side[2]);
    if (!(size > 1e-6)) return;
    side = side.map((part) => ((part / size) * thick) / 2);
    // (Nothing of it goes into the ground.)
    const corner = (at, sign) => [at[0] + side[0] * sign + out[0] * PROUD, at[1] + side[1] * sign + out[1] * PROUD, Math.max(at[2] + side[2] * sign + out[2] * PROUD, 0)];
    model.quad(corner(p, -1), corner(q, -1), corner(q, 1), corner(p, 1), frame, { out, lines: plain });
  };
  /** One tier of an upright face: its glass, the beam at its foot, and the cross of braces. Corners from the lower left, as seen from outside. */
  const panel = (lowLeft, lowRight, highRight, highLeft, out, crossed = true, beam = true) => {
    model.quad(lowLeft, lowRight, highRight, highLeft, glass, { out, lines: plain, own: 5 });
    // (No beam along the ground: the frame stands on the podium.)
    if (beam && lowLeft[2] > 1) bar(lowLeft, lowRight, out);
    if (!crossed) return;
    bar(lowLeft, highRight, out, 0.75);
    bar(lowRight, highLeft, out, 0.75);
  };

  // ── The sail ──
  // Its two upright faces: braced for eight tiers, and unbroken glass from there to the point.
  const SOUTH = [0, -1, 0];
  const EAST = [1, 0, 0];
  const slices = [];
  for (let k = 0; k < braced; k += 1) slices.push([k * tier, (k + 1) * tier, true]);
  const above = braced * tier;
  const steps = 5;
  for (let k = 0; k < steps; k += 1) slices.push([above + ((top - above) * k) / steps, above + ((top - above) * (k + 1)) / steps, false]);
  for (const [z0, z1, crossed] of slices) {
    // (Over the last brace there is one beam more, and then nothing but glass.)
    const beam = crossed || z0 === above;
    panel([west(z0), south, z0], [edge, south, z0], [edge, south, z1], [west(z1), south, z1], SOUTH, crossed, beam);
    panel([edge, south, z0], [edge, north(z0), z0], [edge, north(z1), z1], [edge, south, z1], EAST, crossed, beam);
    // The frame runs up the curved edge of each, and up the corner where the two meet.
    bar([west(z0), south, z0], [west(z1), south, z1], SOUTH, 1.1);
    bar([edge, north(z0), z0], [edge, north(z1), z1], EAST, 1.1);
    bar([edge, south, z0], [edge, south, z1], SOUTH, 1.1);
    bar([edge, south, z0], [edge, south, z1], EAST, 1.1);
  }
  // Its back, floor by floor: the side over the road in grey metal with its slits, the side to the north in glass.
  const floor = tier / 4;
  const floors = Math.round(top / floor);
  for (let k = 0; k < floors; k += 1) {
    const z0 = (top * k) / floors;
    const z1 = (top * (k + 1)) / floors;
    const [n0, n1] = [z0, z1].map((z) => [-1, 0, wide * lean(z)]);
    model.quad([west(z0), north(z0), z0], [west(z0), south, z0], [west(z1), south, z1], [west(z1), north(z1), z1], back, { out: [-1, 0, 0.3], normals: [n0, n0, n1, n1], lines: plain });
    const [m0, m1] = [z0, z1].map((z) => [0, 1, deep * lean(z)]);
    model.quad([edge, north(z0), z0], [west(z0), north(z0), z0], [west(z1), north(z1), z1], [edge, north(z1), z1], glass, { out: [0, 1, 0.3], normals: [m0, m0, m1, m1], lines: plain, own: 5 });
    // (A slit of window to each floor, two along the back, where the back is still long enough to hold them.)
    const middle = (z0 + z1) / 2;
    const long = north(middle) - south;
    if (long < 9) continue;
    const slope = wide * lean(middle);
    const size = Math.hypot(1, slope);
    const out = [-1 / size, 0, slope / size];
    const up = [slope / size, 0, 1 / size]; // up the back
    for (const part of [0.3, 0.64]) {
      const at = [west(middle) + out[0] * 0.12, south + long * part, middle + out[2] * 0.12];
      const corner = (dy, du) => [at[0] + up[0] * du, at[1] + dy, at[2] + up[2] * du];
      model.quad(corner(-1.3, -0.45), corner(1.3, -0.45), corner(1.3, 0.45), corner(-1.3, 0.45), slit, { out, lines: plain });
    }
  }

  // ── The block ──
  const [bWest, bEast, bSouth, bNorth] = block;
  const half = (bSouth + bNorth) / 2;
  for (let k = 0; k < Math.round(roof / tier); k += 1) {
    const z0 = k * tier;
    const z1 = z0 + tier;
    panel([bWest, bSouth, z0], [bEast, bSouth, z0], [bEast, bSouth, z1], [bWest, bSouth, z1], SOUTH);
    for (const [y0, y1] of [[bSouth, half], [half, bNorth]]) {
      panel([bWest, y1, z0], [bWest, y0, z0], [bWest, y0, z1], [bWest, y1, z1], [-1, 0, 0]);
      panel([bEast, y0, z0], [bEast, y1, z0], [bEast, y1, z1], [bEast, y0, z1], EAST);
    }
    // (Its northern face shows only where the sail does not stand against it.)
    model.quad([bEast, bNorth, z0], [bWest, bNorth, z0], [bWest, bNorth, z1], [bEast, bNorth, z1], glass, { out: [0, 1, 0], lines: plain, own: 5 });
  }
  // The frame's posts at its corners and half-way along its sides, the beam round its roof, and the roof.
  for (const [x, y, out] of [[bWest, bSouth, SOUTH], [bEast, bSouth, SOUTH], [bWest, bSouth, [-1, 0, 0]], [bWest, half, [-1, 0, 0]], [bWest, bNorth, [-1, 0, 0]], [bEast, bSouth, EAST], [bEast, half, EAST], [bEast, bNorth, EAST]]) {
    bar([x, y, 0], [x, y, roof], out, 1.1);
  }
  bar([bWest, bSouth, roof], [bEast, bSouth, roof], SOUTH);
  bar([bWest, bNorth, roof], [bWest, bSouth, roof], [-1, 0, 0]);
  bar([bEast, bSouth, roof], [bEast, bNorth, roof], EAST);
  model.flat([[bWest, bSouth, roof], [bEast, bSouth, roof], [bEast, bNorth, roof], [bWest, bNorth, roof]], { kind: 'plain', colour: '#aab2b9', open: true });
  return { beacons: [[edge, south, top + 0.6]] };
}

// Hamad Tower's measures, in metres. (East is away from the road; north, along it towards Kingdom Centre.)
const HAMAD = {
  top: 163, // the point of the sail
  roof: 98, // the roof of the block: six tiers of four floors
  tier: 98 / 6,
  braced: 8, // how many tiers of the sail are braced
  curve: 2.9, // how the sail narrows: by this power of the height
  edge: 12.5, // the sail's upright corner: east of the middle…
  south: 1, // …and north of it
  wide: 28, // the sail at its foot, across the road's line
  deep: 39, // and along it
  block: [-10.5, 17.5, -41, 0.4], // the block: west, east, south, north
};

/** The podium both parts of Hamad Tower stand on: two storeys of entrance halls and car park, as long as the two together. */
function hamadPodium() {
  return [{ outline: block(43.5, 30.5, -2.3, 5.5), base: 0, top: 9, paint: '#dcd8cf', roof: true }];
}

/**
 * The Al Anoud Towers: two of a kind, side by side on King Fahd Road across
 * from Hamad Tower, the first of them the head office of Alinma Bank. Each
 * is a fin that stands end-on to the road: two long side walls of sand-
 * coloured stone, and between them, towards the road, a narrow bowed front
 * of dark glass. The front stands upright for six tenths of its height and
 * then curves back to a peak, from which the roof falls away to the rear and
 * a pair of masts lean back like the sword the design is named for (it is
 * said to be based on a swordfish). In each side wall two tall slots of
 * glass are let into the stone, crossed with white braces.
 *
 * (The first was opened in 2009, "more than 121 m" high, which is what its
 * masts come to in a photograph taken along the road; the second, of 18
 * floors, is the lower. Their plots are the street map's; the shape is
 * measured from that photograph.)
 */
function anoudTower(model, { peak, masts }) {
  const half = 15; // from its middle to its front, and to its back
  const side = 9; // from its middle to either side wall
  const bow = 2.5; // how far the middle of the front stands out
  const fall = 0.67; // how steeply the roof falls to the rear
  // The front, from the ground to the peak: [how far towards the road, how high].
  const front = [[half, 0], [half, 0.2 * peak], [half, 0.4 * peak], [half, 0.6 * peak], [half - 0.8, 0.71 * peak], [half - 2.6, 0.826 * peak], [half - 5.7, 0.93 * peak], [half - 8.6, peak]];
  const crest = half - 8.6; // where the peak stands
  const rear = peak - fall * (crest + half); // the height of the back wall
  const stone = { kind: 'plain', colour: '#cbbd98', light: '#ffe2b0', glow: 0.22 };
  const glass = { kind: 'glass', colour: '#1f2f47', storey: 4, bay: 2.6, lit: 0.2, floors: 0.4, mirror: 0.45 };
  const white = { kind: 'plain', colour: '#eceeed' };
  const plain = [false, false, false, false];

  // The two side walls, each with its two slots of braced glass.
  const low = [[half - 13, 0.12 * peak], [half - 6.4, 0.12 * peak], [half - 6.4, 0.57 * peak], [half - 13, 0.57 * peak]];
  const high = [[half - 12.8, 0.62 * peak], [half - 6.9, 0.62 * peak], [half - 9.5, 0.857 * peak], [half - 12.8, 0.857 * peak]];
  for (const way of [-1, 1]) {
    const out = [0, way, 0];
    const wall = (points, y) => points.map(([x, z]) => [x, y, z]);
    model.flat(wall([[-half, 0], ...front, [-half, rear]], way * side), stone, { out, holes: [wall(low, way * side), wall(high, way * side)] });
    for (const slot of [low, high]) {
      const y = way * (side - 0.4);
      model.quad(...wall(slot, y), glass, { out, lines: plain, own: 11 });
      // Three crosses, one over the other, and a bar between each and the next.
      const at = (part, k) => {
        const [bottom, top] = part === 0 ? [slot[0], slot[3]] : [slot[1], slot[2]];
        return [bottom[0] + ((top[0] - bottom[0]) * k) / 3, way * (side - 0.3), bottom[1] + ((top[1] - bottom[1]) * k) / 3];
      };
      const bar = (p, q, thick = 0.45) => {
        const run = [q[0] - p[0], q[2] - p[2]];
        const size = Math.hypot(run[0], run[1]) || 1;
        const across = [(-run[1] / size) * (thick / 2), (run[0] / size) * (thick / 2)];
        model.quad([p[0] - across[0], p[1], p[2] - across[1]], [q[0] - across[0], q[1], q[2] - across[1]], [q[0] + across[0], q[1], q[2] + across[1]], [p[0] + across[0], p[1], p[2] + across[1]], white, { out, lines: plain });
      };
      for (let k = 0; k < 3; k += 1) {
        bar(at(0, k), at(1, k + 1));
        bar(at(1, k), at(0, k + 1));
        if (k > 0) bar(at(0, k), at(1, k));
      }
    }
  }
  // The front: dark glass, bowed outwards between the two walls, upright and then curving back to the peak.
  const ys = [-side, -side / 2, 0, side / 2, side];
  const out = (y) => bow * (1 - (y / side) ** 2);
  for (let k = 1; k < front.length; k += 1) {
    const [x0, z0] = front[k - 1];
    const [x1, z1] = front[k];
    for (let j = 1; j < ys.length; j += 1) {
      const [y0, y1] = [ys[j - 1], ys[j]];
      model.quad([x0 + out(y0), y0, z0], [x0 + out(y1), y1, z0], [x1 + out(y1), y1, z1], [x1 + out(y0), y0, z1], glass, { out: [1, 0, 0.2], lines: plain, own: 11 });
    }
  }
  // The roof: a cap behind the top of the front, and from the peak a fall to the rear.
  const roofing = { kind: 'plain', colour: '#a9a595', open: true };
  model.flat([...ys.map((y) => [crest + out(y), y, peak]), [crest, side, peak], [crest, -side, peak]].filter((point, i, all) => i === 0 || Math.hypot(point[0] - all[i - 1][0], point[1] - all[i - 1][1]) > 0.01), roofing);
  model.quad([crest, -side, peak], [crest, side, peak], [-half, side, rear], [-half, -side, rear], roofing, { out: [0, 0, 1], lines: plain });
  // The back: stone, with a band of glass up its middle.
  model.quad([-half, side, 0], [-half, -side, 0], [-half, -side, rear], [-half, side, rear], stone, { out: [-1, 0, 0], lines: plain });
  model.quad([-half - 0.15, side - 3, 0.12 * peak], [-half - 0.15, 3 - side, 0.12 * peak], [-half - 0.15, 3 - side, rear - 4], [-half - 0.15, side - 3, rear - 4], glass, { out: [-1, 0, 0], lines: plain, own: 11 });
  // The masts: a pair on the peak, leaning back.
  const lean = (15 * Math.PI) / 180;
  const beacons = [];
  masts.forEach((long, i) => {
    const y = (i === 0 ? -1 : 1) * 3.2;
    const foot = [crest - 0.4, y, peak - 0.3];
    const tip = [foot[0] - long * Math.sin(lean), y, foot[2] + long * Math.cos(lean)];
    const thick = 0.35;
    for (const [dx, dy, looks] of [[0, -thick, [0, -1, 0]], [0, thick, [0, 1, 0]], [thick, 0, [1, 0, 0.3]], [-thick, 0, [-1, 0, -0.3]]]) {
      const [ax, ay] = dx === 0 ? [thick, 0] : [0, thick];
      model.quad([foot[0] + dx - ax, foot[1] + dy - ay, foot[2]], [foot[0] + dx + ax, foot[1] + dy + ay, foot[2]], [tip[0] + dx + ax, tip[1] + dy + ay, tip[2]], [tip[0] + dx - ax, tip[1] + dy - ay, tip[2]], white, { out: looks, lines: plain });
    }
    beacons.push([tip[0], tip[1], tip[2] + 0.5]);
  });
  return { beacons };
}
const anoudFirst = (model) => anoudTower(model, { peak: 100, masts: [22.5, 17] });
const anoudSecond = (model) => anoudTower(model, { peak: 92, masts: [15, 11] });
/** The two storeys each of the Al Anoud Towers stands on: its entrance hall, and the hotel's. */
function anoudPodium() {
  return [{ outline: block(25, 26, 0, 1), base: 0, top: 11, paint: '#d6ccb2', roof: true }];
}

/** The four upright faces of a box: face(lower left, lower right, upper right, upper left, the way it looks), each as seen from outside. */
function boxFaces([x0, x1, y0, y1], z0, z1, face) {
  face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  face([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
  face([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0]);
  face([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [-1, 0, 0]);
}
const NO_LINES = [false, false, false, false];

/**
 * The Olaya Towers (BDPL Gulf, 2013): two towers of dark blue glass on King
 * Fahd Road just north of Tahlia Street, 203.4 m and 166.3 m, joined at the
 * ground by one entrance hall. Each is a plain upright block with a
 * narrower crown set on it; by night the crowns are lit, in light that
 * changes colour slowly.
 *
 * (Where they stand, and their heights, are as published; little else about
 * them is, and they are built plainly.)
 */
function olayaTower(model, { roof, top }) {
  const glass = { kind: 'glass', colour: '#22364f', storey: 4.2, bay: 2.8, lit: 0.25, floors: 0.35, mirror: 0.55 };
  const crown = { kind: 'plain', colour: '#c3ccd4', light: '#ffffff', glow: 0.75, changing: true };
  const body = [-22, 22, -16, 16];
  const upper = [-17, 17, -11.5, 11.5];
  boxFaces(body, 0, roof, (a, b, c, d, out) => model.quad(a, b, c, d, glass, { out, lines: NO_LINES, own: 13 }));
  boxFaces(upper, roof, top, (a, b, c, d, out) => model.quad(a, b, c, d, crown, { out, lines: NO_LINES }));
  const deck = { kind: 'plain', colour: '#9aa5ae', open: true };
  model.flat([[body[0], body[2], roof], [body[1], body[2], roof], [body[1], body[3], roof], [body[0], body[3], roof]], deck, { holes: [[[upper[0], upper[2], roof], [upper[1], upper[2], roof], [upper[1], upper[3], roof], [upper[0], upper[3], roof]]] });
  model.flat([[upper[0], upper[2], top], [upper[1], upper[2], top], [upper[1], upper[3], top], [upper[0], upper[3], top]], deck);
  return { beacons: [[upper[0], upper[2], top + 0.6], [upper[1], upper[3], top + 0.6]] };
}
const olayaTall = (model) => olayaTower(model, { roof: 190, top: 203.4 });
const olayaShort = (model) => olayaTower(model, { roof: 154, top: 166.3 });
/** The hall each of the Olaya Towers stands on: as large as its plot, three storeys. */
function olayaPodium() {
  return [{ outline: block(23, 30), base: 0, top: 13, paint: '#c9cdd0', roof: true }];
}

/**
 * The tower of the Ministry of Islamic Affairs, on King Fahd Road between
 * Hamad Tower and Tahlia Street: two white towers end to end, striped from
 * top to bottom with narrow windows. The southern one, 98 m, ends in a
 * slanting skylight; the northern, 112 m, carries a pyramid of blue glass
 * and a mast that reaches 153 m. (Its outline is the street map's, and 24
 * floors; its heights are measured from a photograph taken along the road.)
 */
function ministryTower(model) {
  const stone = { kind: 'plain', colour: '#e9e8e3', light: '#fff1d6', glow: 0.2 };
  const glass = { kind: 'glass', colour: '#2b3a4c', storey: 4, bay: 2.4, lit: 0.3, floors: 0.5, mirror: 0.3 };
  const blue = { kind: 'glass', colour: '#3f79ad', storey: 4, bay: 2.5, lit: 0.6, floors: 0.2, mirror: 0.6 };
  const white = { kind: 'plain', colour: '#eef0ef' };
  /** A face striped upright: stone and window by turns, from one end to the other. */
  const striped = (a, b, c, d, out) => {
    const long = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(Math.round(long / 3.5), 1);
    const at = (low, high, part) => [[low[0] + (high[0] - low[0]) * part, low[1] + (high[1] - low[1]) * part, low[2]], [low[0] + (high[0] - low[0]) * part, low[1] + (high[1] - low[1]) * part, d[2]]];
    for (let k = 0; k < count; k += 1) {
      const [p0, p1, p2] = [k / count, (k + 0.6) / count, (k + 1) / count];
      const [[l0, u0], [l1, u1], [l2, u2]] = [at(a, b, p0), at(a, b, p1), at(a, b, p2)];
      model.quad(l0, l1, u1, u0, stone, { out, lines: NO_LINES });
      model.quad(l1, l2, u2, u1, glass, { out, lines: NO_LINES, own: 17 });
    }
  };
  const south = [-14, 14, -31, -2];
  const north = [-14, 14, 2, 31];
  boxFaces(south, 0, 98, striped);
  boxFaces(north, 0, 112, striped);
  // (Between the two, a lower link.)
  boxFaces([-11, 11, -2, 2], 0, 80, (a, b, c, d, out) => out[1] === 0 && model.quad(a, b, c, d, glass, { out, lines: NO_LINES, own: 17 }));
  const roofing = { kind: 'plain', colour: '#c6c8c4', open: true };
  for (const [[x0, x1, y0, y1], z] of [[south, 98], [north, 112], [[-11, 11, -2, 2], 80]]) model.flat([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], roofing);
  // The southern tower's skylight: a square of glass, slanting up to the north, in a white frame.
  const sky = [[-8, -27, 98.4], [8, -27, 98.4], [8, -11, 104.5], [-8, -11, 104.5]];
  model.quad(...sky, blue, { out: [0, -0.4, 1], lines: NO_LINES });
  model.quad([-8, -11, 98], [8, -11, 98], sky[2], sky[3], white, { out: [0, 1, 0], lines: NO_LINES });
  for (const x of [-8, 8]) model.facet([x, -27, 98.4], [x, -11, 98], [x, -11, 104.5], white, { out: [x, 0, 0], lines: [false, false, false] });
  // The northern tower's pyramid, and its mast.
  const foot = [[-10, 6.5, 112], [10, 6.5, 112], [10, 26.5, 112], [-10, 26.5, 112]];
  const apex = [0, 16.5, 128];
  foot.forEach((corner, i) => model.facet(corner, foot[(i + 1) % 4], apex, blue, { out: [(corner[0] + foot[(i + 1) % 4][0]) / 2, (corner[1] + foot[(i + 1) % 4][1]) / 2 - 16.5, 12], lines: [false, true, true] }));
  boxFaces([-0.35, 0.35, 16.15, 16.85], 126, 153, (a, b, c, d, out) => model.quad(a, b, c, d, white, { out, lines: NO_LINES }));
  return { beacons: [[0, 16.5, 153.6]] };
}

// The violet the financial district lights its tower and its station in.
const PIF_LIGHT = '#a428f5';

// The outline of the Kingdom Centre complex, in metres east and north of the tower's middle.
const KINGDOM_PODIUM = [
  [62.8, 125.5], [92.1, 64.8], [97, 63.7], [106.2, 83.8], [121.4, 69.7], [129, 52.3], [129.5, 34.9], [110, 37.7], [107.3, 30.6], [136, -26.4], [141.5, -84.4], [127.4, -71.9],
  [111.6, -79], [23.2, -12.3], [8, -22], [-4.5, -25.8], [-11.5, -135.9], [-25.6, -141.9], [-26.7, -163.1], [-35.4, -153.8], [-52.2, -150.6], [-75, -133.2], [-84.7, -103.9],
  [-89.1, -99.1], [-93.4, -104.5], [-117.3, -75.7], [-131.9, -45.9], [-140.6, -1.9], [-134.1, -1.9], [-133.6, 7.3], [-148.2, 25.2], [-153.1, 47.4], [-146.6, 68.6], [-140.1, 77.8],
  [-140.1, 84.3], [-125.4, 72.4], [-109.7, 78.3], [-21.3, 12.2], [-2.3, 22.5], [3.7, 23.5], [10.2, 138], [23.8, 145.1], [24.8, 164.6],
];

/**
 * Al Faisaliah Tower, 267 m (Foster + Partners, 2000): the first of the
 * city's skyscrapers, between King Fahd Road and Olaya Street. Square in
 * plan, 41 m a side at the ground, it rises to a point in one smooth arc
 * between four corner beams. Up to its top floor, 195 m up, every storey
 * shows as a deep band of pale sunshades over a strip of dark glass, and at
 * three levels the beams are tied together by a heavier band. Above the top
 * floor the beams run on in the open: first past the observation deck at
 * 200 m, then round the golden glass globe that is caught between them (a
 * restaurant, lit from within by night), and at last together, in a lit
 * lantern that closes in the tip.
 *
 * (Its outline is the street map's; its heights are as published. The
 * curve of its arc is set so that the globe, 24 m across, fits between the
 * beams where it hangs.)
 */
function faisaliahTower(model) {
  const { half, top, floorsTop, storey, curve, deck, globe, lantern } = FAISALIAH;
  /** Half the width of the tower at a height, to the middle of its corner beams. */
  const halfAt = (z) => half * (1 - (Math.min(Math.max(z, 0), top) / top) ** curve);
  /** How fast it draws in: metres for each metre up. */
  const lean = (z) => (half * curve * Math.max(z, 0) ** (curve - 1)) / top ** curve;
  const shade = { kind: 'plain', colour: '#e4e7e9', light: '#dfe8f2', glow: 0.16 };
  const glass = { kind: 'glass', colour: '#3f5266', storey, bay: 3, lit: 0.3, floors: 0, mirror: 0.35 };
  const beam = { kind: 'plain', colour: '#eef0f0', light: '#eaf2ff', glow: 0.5 };
  const plain = [false, false, false, false];
  const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // which way each of its four faces looks
  /** A place on a face: so far along it (-1 to 1, corner to corner), at a height, so far out from it. */
  const on = ([ox, oy], along, z, out = 0) => {
    const h = halfAt(z);
    return [ox * (h + out) - oy * along * h, oy * (h + out) + ox * along * h, z];
  };
  /** A strip of a face from one height to another. */
  const strip = (side, z0, z1, stuff, out = 0, more = {}) => {
    const [n0, n1] = [z0, z1].map((z) => [side[0], side[1], lean(z)]);
    model.quad(on(side, -1, z0, out), on(side, 1, z0, out), on(side, 1, z1, out), on(side, -1, z1, out), stuff, { out: [side[0], side[1], 0.2], normals: [n0, n0, n1, n1], lines: plain, ...more });
  };

  // The floors: to each a band of sunshades, and a strip of glass in its shadow.
  const floors = Math.round(floorsTop / storey);
  for (const side of SIDES) {
    for (let k = 0; k < floors; k += 1) {
      const z0 = k * storey;
      strip(side, z0, z0 + storey * 0.66, shade);
      strip(side, z0 + storey * 0.66, z0 + storey, glass, 0, { own: 3 });
    }
    // Where the beams are tied together: a heavier band right round.
    for (const z of FAISALIAH.ties) strip(side, z - 1.3, z + 1.3, beam, 0.7);
    // The lantern: the tip closed in between the beams, and lit.
    const steps = 6;
    for (let k = 0; k < steps; k += 1) {
      strip(side, lantern + ((top - lantern) * k) / steps, lantern + ((top - lantern) * (k + 1)) / steps, { kind: 'plain', colour: '#eef0ef', light: '#f4f8ff', glow: 0.85 });
    }
  }
  // The roof over the top floor, and the observation deck above it (seen from above, and from below).
  const level = (z, stuff) => {
    const h = halfAt(z) - 0.4;
    const ring = [[-h, -h, z], [h, -h, z], [h, h, z], [-h, h, z]];
    model.flat(ring, stuff, { out: [0, 0, 1] });
    model.flat(ring, stuff, { out: [0, 0, -1] });
  };
  level(floorsTop, { kind: 'plain', colour: '#c9cfd4' });
  level(deck, { kind: 'plain', colour: '#d5dadd', light: '#fff0d0', glow: 0.5 });

  // The four corner beams, from the ground to the lantern: each a square tube that follows the arc.
  const pieces = 34;
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    for (let k = 0; k < pieces; k += 1) {
      const z0 = (lantern * k) / pieces;
      const z1 = (lantern * (k + 1)) / pieces;
      const at = (z, dx, dy) => {
        // (It stands a little proud of the faces, and slims towards the top.)
        const thick = 1.3 * Math.min(Math.max((top - z) / 60, 0.4), 1);
        const middle = halfAt(z) + 0.3;
        return [sx * middle + dx * thick, sy * middle + dy * thick, z];
      };
      for (const [dx0, dy0, dx1, dy1, looks] of [[1, -1, 1, 1, [1, 0, 0.2]], [1, 1, -1, 1, [0, 1, 0.2]], [-1, 1, -1, -1, [-1, 0, 0.2]], [-1, -1, 1, -1, [0, -1, 0.2]]]) {
        model.quad(at(z0, dx0, dy0), at(z0, dx1, dy1), at(z1, dx1, dy1), at(z1, dx0, dy0), beam, { out: looks, lines: plain });
      }
    }
  }

  // The globe: golden glass, with every room in it lit.
  // (By night it glows gold: a line of that light round it at every level, over the lamps of its rooms.)
  const gold = { kind: 'glass', colour: '#c8922e', storey: 3.1, bay: 2.4, lit: 1, floors: 0.4, mirror: 0.5, light: '#ffb23e', glow: 1 };
  const rings = 8;
  const around = 16;
  const globeAt = (i, j) => {
    const polar = (Math.PI * i) / rings;
    const turn = (TAU * j) / around;
    const way = [Math.sin(polar) * Math.cos(turn), Math.sin(polar) * Math.sin(turn), Math.cos(polar)];
    return { at: [way[0] * globe.radius, way[1] * globe.radius, globe.at + way[2] * globe.radius], way };
  };
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const [a, b, c, d] = [globeAt(i + 1, j), globeAt(i + 1, j + 1), globeAt(i, j + 1), globeAt(i, j)];
      model.quad(a.at, b.at, c.at, d.at, gold, { out: a.way[2] < -0.99 ? [0, 0, -1] : [a.way[0] + c.way[0], a.way[1] + c.way[1], a.way[2] + c.way[2]], normals: [a.way, b.way, c.way, d.way], lines: plain, own: 7 });
    }
  }
  return { beacons: [[0, 0, top + 0.6]] };
}

// Al Faisaliah Tower's measures, in metres.
const FAISALIAH = {
  half: 20.6, // half its width at the ground
  top: 267,
  floorsTop: 195, // its top floor
  storey: 195 / 44,
  curve: 2.8, // how it draws in: by this power of the height
  ties: [44, 88, 132], // where the corner beams are tied together
  deck: 200, // the observation deck
  globe: { at: 217, radius: 12 }, // the golden globe: the height of its middle, and its size
  lantern: 240, // where the tip is closed in
};

/**
 * The PIF Tower in the King Abdullah Financial District, 385 m (HOK and
 * Omrania, 2021): a crystal of dark glass, and the tallest building in the
 * city. It is built as a true model (see models.js), not as slabs.
 *
 * Its plan has six equal sides of some 31 m and six corners that are of two
 * kinds by turns: three apexes, sharp, and between them three pleats, blunt;
 * so it is as much a triangle with its corners cut as a hexagon, and has
 * some 2,550 square metres to a floor. It does not taper: it breathes. At
 * every sixtieth metre of its height the corners change places, the apexes
 * standing out where the pleats stood out the level before, and between two
 * such levels every side is two flat triangles, folded along the line from
 * the corner that stands out below to the one that stands out above. Those
 * folds are the long diagonals that cross on its faces.
 *
 * Beside each apex a cleft runs up the whole height of the tower, dark and
 * unlit, and at the top it opens into a notch in the crown: sixteen metres
 * of glass screen that stand round the roof, a little lower to the
 * south-west. Under the lowest level stands a glass hall, with a canopy
 * that reaches out past the tower.
 *
 * By night a line of violet light runs along the edge of every floor, the
 * folds are picked out in points of light, and below the top sixty metres
 * most floors are offices with their lamps on.
 *
 * Where it stands is from the buildings data; its height, the shape of its
 * plan ("apex and pleat points") and the size of its floors are as
 * published. The count of its levels, how far its corners move, the clefts
 * and the crown are measured off photographs taken from the north.
 */
function pifTower(model) {
  const top = 385; // the rim of the crown
  const roof = 369; // where the crown begins: the highest of the levels at which the corners change places
  const foot = 10; // the lowest of those levels, over the hall
  const tiers = 6;
  const tier = (roof - foot) / tiers;
  const storey = tier / 14;
  const apexOut = 33; // how far from the middle an apex stands, between its going in and out
  const pleatOut = 29.8; // and a pleat
  const first = 40.7; // degrees clockwise from north to the first apex; the corners follow every 60 degrees
  const swing = [0.08, 0.04]; // how far in and out an apex goes, as a part of its distance; and a pleat
  // From an apex along the tower's side to the far edge of its cleft: the cleft widens as it rises, and
  // most towards the top, where it opens into the notch.
  const lipAt = (height) => 3 + 4.5 * (Math.min(height, roof) / roof) ** 2;
  const deep = 3.4; // how deep the cleft is cut

  // The corners: 0, 2, 4 are apexes and 1, 3, 5 pleats, clockwise from the north-east.
  const corner = (i, by) => {
    const angle = ((first + i * 60) * Math.PI) / 180;
    const far = (i % 2 === 0 ? apexOut : pleatOut) * by;
    return [Math.sin(angle) * far, Math.cos(angle) * far];
  };
  // How far out a corner stands at a level, as a part of its usual distance. Levels 0 to 6 are those at
  // which the corners change places; 7 is the rim of the crown, under which the tower draws in a little.
  const standing = (i, level) => {
    if (level > tiers) return i % 2 === 0 ? 0.985 : 0.915;
    if (level === tiers) return i % 2 === 0 ? 0.99 : 0.93;
    const out = (level % 2 === 1) === (i % 2 === 0); // apexes stand out at odd levels, pleats at even ones
    return 1 + (out ? swing[i % 2] : -swing[i % 2]);
  };
  // (The rim is highest over the north-eastern apex, and some four metres lower across the roof from it.)
  const highest = corner(0, standing(0, tiers + 1));
  const rimAt = ([east, north]) => top - 2.2 * (1 - (0.6 * east + 0.8 * north) / (0.6 * highest[0] + 0.8 * highest[1]));
  const heightOf = (level, place) => (level > tiers ? rimAt(place) : foot + level * tier);
  const raised = (place, height) => [place[0], place[1], height];
  const unit = ([x, y]) => [x / Math.hypot(x, y), y / Math.hypot(x, y)];

  /**
   * The outline at a level, clockwise: for each apex the pleat before it, then the cleft (its far edge on
   * the tower's side, its back, and the apex itself). The far edge of a cleft stands still while its apex
   * goes in and out, so the cleft is wider where the apex stands out than where it stands in.
   */
  const outlineAt = (level) => {
    const sides = [];
    for (const i of [0, 2, 4]) {
      const before = (i + 5) % 6;
      const apex = corner(i, standing(i, level));
      const pleat = corner(before, standing(before, level));
      const usual = unit([corner(before, 1)[0] - corner(i, 1)[0], corner(before, 1)[1] - corner(i, 1)[1]]);
      const lip = lipAt(foot + Math.min(level, tiers) * tier);
      const still = [corner(i, 1)[0] + usual[0] * lip, corner(i, 1)[1] + usual[1] * lip];
      const run = [pleat[0] - apex[0], pleat[1] - apex[1]];
      const part = ((still[0] - apex[0]) * usual[0] + (still[1] - apex[1]) * usual[1]) / (run[0] * usual[0] + run[1] * usual[1]);
      const edge = [apex[0] + run[0] * part, apex[1] + run[1] * part];
      // (Going clockwise the inside of the tower is on the right.)
      const way = unit([-run[0], -run[1]]);
      const back = [edge[0] + way[1] * deep, edge[1] - way[0] * deep];
      sides.push({ i, pleat, edge, back, apex, towards: unit(run), after: corner((i + 1) % 6, standing((i + 1) % 6, level)) });
    }
    return sides;
  };

  const violet = PIF_LIGHT;
  // The glass of each tier: how strongly its floors are lined with light, and what share of them are lit offices.
  const lit = [0.3, 0.45, 0.55, 0.6, 0.55, 0];
  const glassOf = (t) => ({ kind: 'glass', colour: '#2f4649', storey, bay: 3, light: violet, glow: t === tiers - 1 ? 1 : 0.8, lit: lit[t], fins: 0.8, ridge: 1 });
  const cleft = { kind: 'plain', colour: '#1e2b2c' };
  // (Two bands of floors that are lit before any other as the day ends: a sky lobby and the plant under it.)
  const bright = { ...glassOf(4), lit: 1 };
  const bands = [
    { from: foot + 57 * storey, to: foot + 58 * storey, stuff: bright },
    { from: foot + 65 * storey, to: foot + 68 * storey, stuff: bright },
  ];

  /**
   * One side of the tower between two levels: two flat triangles, folded along the line from the corner
   * that stands out below to the one that stands out above. from, to: its two ends at the lower level,
   * clockwise; fromUp, toUp: at the upper one.
   */
  const side = (from, to, fromUp, toUp, fromIsOut, stuff, more = {}) => {
    const out = [-(to[1] - from[1]), to[0] - from[0], 0];
    const along = { along: [to[0] - from[0], to[1] - from[1]], from: [from[0], from[1]] };
    if (fromIsOut) {
      model.facet(from, to, toUp, stuff, { out, ...along, ...more });
      model.facet(from, toUp, fromUp, stuff, { out, ...along, ...more });
    } else {
      model.facet(from, to, fromUp, stuff, { out, ...along, ...more });
      model.facet(to, toUp, fromUp, stuff, { out, ...along, ...more });
    }
  };
  /** A wall of a cleft between two levels: dark, and no line is drawn along its edges. */
  const wall = (from, to, fromUp, toUp) => {
    const out = [-(to[1] - from[1]), to[0] - from[0], 0];
    model.quad(from, to, toUp, fromUp, cleft, { out, lines: [false, false, false, false] });
  };

  // From the ground to the lowest level the tower stands straight, behind its hall.
  for (let level = -1; level < tiers; level += 1) {
    const low = outlineAt(Math.max(level, 0));
    const high = outlineAt(level + 1);
    const z0 = level < 0 ? 0 : heightOf(level);
    const z1 = level < 0 ? foot : heightOf(level + 1);
    const t = Math.max(level, 0);
    const stuff = level < 0 ? { ...glassOf(0), lit: 1 } : glassOf(t);
    const more = t === 4 ? { bands } : {};
    low.forEach((here, n) => {
      const above = level < 0 ? here : high[n];
      const pleatsOut = t % 2 === 0; // at even levels the pleats stand out, at odd ones the apexes
      side(raised(here.pleat, z0), raised(here.edge, z0), raised(above.pleat, z1), raised(above.edge, z1), pleatsOut, stuff, more);
      wall(raised(here.edge, z0), raised(here.back, z0), raised(above.edge, z1), raised(above.back, z1));
      wall(raised(here.back, z0), raised(here.apex, z0), raised(above.back, z1), raised(above.apex, z1));
      side(raised(here.apex, z0), raised(here.after, z0), raised(above.apex, z1), raised(above.after, z1), !pleatsOut, stuff, more);
    });
  }

  // The crown: a screen of glass round the roof, with a notch where each cleft comes up. The screen along
  // a side of the tower stops short of the cleft, and its end leans away from it; the back wall of the
  // cleft runs up to the rim at the apex and down to nothing at the far end.
  const crownGlass = { ...glassOf(tiers - 1), lit: 0 };
  // (Seen from the roof the screen is the same glass, without its lights.)
  const inside = { ...crownGlass, light: null, ridge: 0.4, open: true };
  const eaves = outlineAt(tiers);
  const rim = outlineAt(tiers + 1);
  const beacons = [];
  const screen = (corners, stuff, out, lines) => {
    if (corners.length === 4) model.quad(...corners, stuff, { out, lines });
    else model.facet(...corners, stuff, { out, lines: lines.slice(0, 3) });
    // (And its inner side, towards the roof.)
    const inner = [-out[0], -out[1], 0];
    const within = stuff === cleft ? { ...cleft, open: true } : inside;
    if (corners.length === 4) model.quad(...corners, within, { out: inner, lines: [false, false, true, false] });
    else model.facet(...corners, within, { out: inner, lines: [false, false, false] });
  };
  eaves.forEach((here, n) => {
    const above = rim[n];
    const endLow = [here.edge[0] + here.towards[0] * 3, here.edge[1] + here.towards[1] * 3];
    const endHigh = [above.edge[0] + above.towards[0] * 9, above.edge[1] + above.towards[1] * 9];
    const outOf = (from, to) => [-(to[1] - from[1]), to[0] - from[0], 0];
    screen(
      [raised(here.pleat, roof), raised(endLow, roof), raised(endHigh, rimAt(endHigh)), raised(above.pleat, rimAt(above.pleat))],
      crownGlass,
      outOf(here.pleat, here.edge),
      [true, true, true, true],
    );
    screen([raised(here.back, roof), raised(here.apex, roof), raised(above.apex, rimAt(above.apex))], cleft, outOf(here.back, here.apex), [false, false, true]);
    screen(
      [raised(here.apex, roof), raised(here.after, roof), raised(above.after, rimAt(above.after)), raised(above.apex, rimAt(above.apex))],
      crownGlass,
      outOf(here.apex, here.after),
      [true, true, true, true],
    );
    beacons.push([above.apex[0], above.apex[1], rimAt(above.apex) + 0.6]);
  });
  // The roof inside the crown: dark, under its field of solar panels.
  model.flat(eaves.flatMap((here) => [here.pleat, here.edge, here.back, here.apex]).map((place) => raised(place, roof)), { kind: 'plain', colour: '#3a4858', open: true });

  // At its foot: the glass hall, lit from within, and over it the canopy that reaches out from the tower.
  const ground = [0, 1, 2, 3, 4, 5].map((i) => corner(i, standing(i, 0)));
  const wider = (by) => ground.map(([east, north]) => [east * by, north * by]);
  const hall = wider(1.13);
  const hallGlass = { kind: 'glass', colour: '#5f7f8d', storey: 5.5, bay: 2.5, lit: 1, ridge: 0.6 };
  hall.forEach((from, i) => {
    const to = hall[(i + 1) % 6];
    model.quad(raised(from, 0), raised(to, 0), raised(to, 11), raised(from, 11), hallGlass, { out: [-(to[1] - from[1]), to[0] - from[0], 0] });
  });
  const canopy = wider(1.27);
  const pale = { kind: 'plain', colour: '#cfd5d8' };
  model.flat(canopy.map((place) => raised(place, 12.6)), pale);
  // (Its underside is lit by the lamps of the hall.)
  model.flat(canopy.map((place) => raised(place, 11)), { kind: 'plain', colour: '#dfe3e4', light: '#ffe9c8', glow: 0.7 }, { out: [0, 0, -1] });
  canopy.forEach((from, i) => {
    const to = canopy[(i + 1) % 6];
    model.quad(raised(from, 11), raised(to, 11), raised(to, 12.6), raised(from, 12.6), pale, { out: [-(to[1] - from[1]), to[0] - from[0], 0], lines: [false, false, false, false] });
  });
  return { beacons };
}

/**
 * Burj Rafal, 308 m: a slim tower, oval in plan, in pale blue glass. Its top
 * is notched in the middle, which leaves a rounded horn at either end, each
 * carrying a mast.
 */
function burjRafal() {
  const slabs = [];
  const a = 29.1;
  const b = 18.4;
  const height = 308;
  const shoulder = 284;
  const glass = ['#84b4c9', '#96c2d4'];
  stack(slabs, 0, shoulder, 4, () => oval(a, b, 28), glass);
  // The horns: what is left of the oval beyond a gap that widens to the top.
  const edge = (u) => b * Math.sqrt(Math.max(1 - (u / a) ** 2, 0));
  const horn = (inner, side) => {
    const near = [];
    const far = [];
    for (let i = 0; i <= 5; i += 1) {
      const u = inner + ((a - inner) * i) / 5;
      if (i === 5) near.push([side * u, 0]);
      else {
        near.push([side * u, -edge(u)]);
        far.push([side * u, edge(u)]);
      }
    }
    return [...near, ...far.reverse()];
  };
  for (const side of [1, -1]) {
    stack(slabs, shoulder, height, 4, (z) => horn(4 + ((z - shoulder) / (height - shoulder)) * 17, side), glass);
    slabs.push({ outline: block(0.7, 0.7, side * 24, 0), base: height, top: height + 22, paint: '#dfe5e8' });
  }
  return slabs;
}

/**
 * Al Majdoul Tower, 232 m: a square tower that turns a quarter of a turn on
 * its way up. Every floor is a white band of louvres over dark glass, and
 * the roof slopes up to a point at one corner.
 */
function majdoul() {
  const slabs = [];
  const half = 19.2;
  const height = 232;
  const shoulder = 208;
  const turn = (z) => (z / height) * 90;
  for (let base = 0; base < shoulder; base += 4) {
    slabs.push({ outline: turned(cutSquare(half, 4.5), turn(base + 1.3)), base, top: base + 2.6, paint: '#eef0f1' });
    slabs.push({ outline: turned(cutSquare(half - 0.6, 4.3), turn(base + 3.3)), base: base + 2.6, top: base + 4, paint: '#4f6478' });
  }
  // The sloping roof: the square draws in towards one of its corners.
  stack(slabs, shoulder, height, 3, (z) => {
    const up = (z - shoulder) / (height - shoulder);
    return turned(moved(grown(cutSquare(half, 4.5), 1 - up * 0.82), up * 13, up * 13), turn(z));
  }, ['#eef0f1', '#dfe4e7']);
  return slabs;
}

/**
 * Riyadh TV Tower, 170 m: a sand-coloured shaft on a base of fins, with a
 * faceted glass lantern near the top like a cut stone in its setting.
 */
function tvTower() {
  const slabs = [];
  const stone = ['#d9c9a9', '#d1c09d'];
  const shaftTop = 116;
  const shaft = (z) => 5.6 - (z / shaftTop) * 2.1;
  // Four fins that brace the foot of the shaft.
  for (const degrees of [0, 90]) {
    stack(slabs, 0, 24, 4, (z) => turned(block(13 - z * 0.33, 1.3), degrees), stone);
  }
  stack(slabs, 0, shaftTop, 6, (z) => cutSquare(shaft(z), shaft(z) * 0.4), stone);
  // The lantern: it widens, holds, and draws in again.
  const lantern = [[116, 4], [120, 7.2], [124, 9.6], [133, 9.6], [137, 7.4], [140, 4.6]];
  for (let i = 1; i < lantern.length; i += 1) {
    const [z0, r0] = lantern[i - 1];
    const [z1, r1] = lantern[i];
    const steps = Math.max(Math.round((z1 - z0) / 2), 1);
    for (let k = 0; k < steps; k += 1) {
      const r = r0 + ((r1 - r0) * (k + 0.5)) / steps;
      slabs.push({ outline: circle(r, 12, Math.PI / 12), base: z0 + ((z1 - z0) * k) / steps, top: z0 + ((z1 - z0) * (k + 1)) / steps, paint: i === 3 ? (k % 2 === 0 ? '#3f566c' : '#c9a24c') : '#bfa770' });
    }
  }
  stack(slabs, 140, 150, 5, () => cutSquare(2.6, 1), stone);
  slabs.push({ outline: block(0.7, 0.7), base: 150, top: 170, paint: '#d5d7d8' });
  return slabs;
}

/**
 * Riyadh Water Tower, 61 m: a stem that opens out into a wide bowl, striped
 * from top to bottom, with a flat lid.
 */
function waterTower() {
  const slabs = [];
  const profile = [[0, 9], [6, 6.5], [26, 6], [34, 9], [42, 15], [50, 22.5], [54, 26], [58, 26]];
  const stripes = 16;
  const paints = ['#2d5ea6', '#f0ede2'];
  const radiusAt = (z) => {
    for (let i = 1; i < profile.length; i += 1) {
      if (z <= profile[i][0]) {
        const [z0, r0] = profile[i - 1];
        const [z1, r1] = profile[i];
        return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
      }
    }
    return profile[profile.length - 1][1];
  };
  // Each level is cut like a cake, so the stripes can run up and down.
  for (let base = 0; base < 58; base += 4) {
    const top = Math.min(base + 4, 58);
    const r = radiusAt((base + top) / 2);
    for (let i = 0; i < stripes; i += 1) {
      const from = (i / stripes) * TAU;
      const to = ((i + 1) / stripes) * TAU;
      const middle = (from + to) / 2;
      slabs.push({ outline: [[0, 0], [Math.cos(from) * r, Math.sin(from) * r], [Math.cos(middle) * r, Math.sin(middle) * r], [Math.cos(to) * r, Math.sin(to) * r]], base, top, paint: paints[i % 2] });
    }
  }
  slabs.push({ outline: circle(23, 24), base: 58, top: 61, paint: '#e6e2d6' });
  return slabs;
}

/**
 * The metro station of the King Abdullah Financial District, 210 m long: a
 * white shell whose sides ripple like wind-blown sand, a different ripple at
 * every level, under a roof that rolls in waves from one end to the other.
 * Glass at the ground, and pale gold where the shell is pierced.
 */
function kafdStation() {
  const slabs = [];
  const halfLength = 105;
  const halfWidth = 20.5;
  const eaves = 25; // the viaducts run in through its ends on two levels, the upper one some 20 m up
  // The shell between two places along its length, at a height: rounded at its two ends, rippling along its sides.
  const shell = (from, to, z, inset = 0) => {
    const near = [];
    const far = [];
    const steps = Math.max(Math.round((to - from) / 5), 2);
    for (let i = 0; i <= steps; i += 1) {
      const u = from + ((to - from) * i) / steps;
      const taper = Math.sqrt(Math.max(1 - (Math.abs(u) / halfLength) ** 4, 0));
      const half = Math.max(halfWidth * taper - inset, 0);
      if (half < 0.3) {
        near.push([u, 0]);
        continue;
      }
      near.push([u, -half * (1 + 0.075 * Math.sin(u / 8 + z * 0.5))]);
      far.push([u, half * (1 + 0.075 * Math.sin(u / 8 - z * 0.5 + 2))]);
    }
    return [...near, ...far.reverse()];
  };
  // Glass where people walk in, then the shell in bands of white and pale gold.
  stack(slabs, 0, 4.5, 4.5, (z) => shell(-halfLength + 4, halfLength - 4, z, 1.5), ['#8fa7b8']);
  stack(slabs, 4.5, eaves, 2.05, (z) => shell(-halfLength, halfLength, z), ['#f5f3ee', '#e6d9bb', '#f5f3ee', '#efe9dc', '#f5f3ee', '#e6d9bb', '#f5f3ee', '#efe9dc', '#f5f3ee', '#f5f3ee']);
  // The roof: its height rolls along the building, so each level up covers less of it.
  const roofAt = (u) => eaves + 5 + 4.2 * Math.sin(u / 15 + 0.6) - 3.5 * (Math.abs(u) / halfLength) ** 2;
  for (let base = eaves; base < eaves + 10; base += 1.25) {
    let from = null;
    for (let u = -halfLength; u <= halfLength + 0.1; u += 3) {
      const covered = u <= halfLength && roofAt(u) > base;
      if (covered && from === null) from = u;
      if (!covered && from !== null) {
        if (u - 3 - from >= 6) slabs.push({ outline: shell(from, u - 3, base, (base - eaves) * 0.55), base, top: base + 1.25, paint: Math.round(base / 1.25) % 2 === 0 ? '#f5f3ee' : '#ebe5d6' });
        from = null;
      }
    }
  }
  return slabs;
}

/**
 * The landmarks: where each stands ([lng, lat] of the middle of its
 * footprint), which way its long axis points (degrees clockwise from north),
 * and how to build it: build() gives its slabs, model(model) builds it as a
 * true model (one may have both: a model that stands on a slab). clear: within this many metres of its middle the map's
 * own buildings are taken out, so the model does not stand inside a block.
 * shade: a footprint and height for its shadow, where the map data has none
 * (shades: several, each with its own place, in metres east and north of the
 * landmark's middle). covers(lng, lat): ground the landmark takes whole, a
 * lake say; the map's own buildings standing on it are taken out as well.
 * within: its model is built only for a view whose middle is no further off
 * than this, in metres (without it: always, to be seen from across the city).
 */
export const LANDMARKS = [
  { id: 'kingdom-centre', name: 'Kingdom Centre', at: [46.67441, 24.711346], bearing: 63.4, height: 302, clear: 48, build: kingdomPodium, model: kingdomCentre, nights: { '#e3ddd2': '#4a3f2e' } },
  { id: 'al-faisaliah', name: 'Al Faisaliah Tower', at: [46.68501, 24.6902], bearing: 113.8, height: 267, clear: 30, model: faisaliahTower },
  { id: 'hamad-tower', name: 'Hamad Tower', at: [46.682825, 24.692065], bearing: 342, height: 163, clear: 40, build: hamadPodium, model: hamadTower, nights: { '#dcd8cf': '#4a4334' } },
  { id: 'al-anoud-tower', name: 'Al Anoud Tower', at: [46.681436, 24.692002], bearing: 334, height: 121, clear: 30, build: anoudPodium, model: anoudFirst, nights: { '#d6ccb2': '#4d4433' } },
  { id: 'al-anoud-tower-2', name: 'Al Anoud Tower 2', at: [46.681674, 24.691597], bearing: 334, height: 106, clear: 30, build: anoudPodium, model: anoudSecond, nights: { '#d6ccb2': '#4d4433' } },
  { id: 'islamic-affairs', name: 'Ministry of Islamic Affairs', at: [46.682305, 24.693105], bearing: 335, height: 153, clear: 38, model: ministryTower },
  { id: 'olaya-tower', name: 'Olaya Towers (north)', at: [46.682347, 24.697437], bearing: 10, height: 203, clear: 34, build: olayaPodium, model: olayaTall, nights: { '#c9cdd0': '#3c4148' } },
  { id: 'olaya-tower-2', name: 'Olaya Towers (south)', at: [46.68221, 24.696875], bearing: 10, height: 166, clear: 34, build: olayaPodium, model: olayaShort, nights: { '#c9cdd0': '#3c4148' } },
  { id: 'pif-tower', name: 'PIF Tower', at: [46.641519, 24.763701], bearing: 0, height: 385, clear: 36, model: pifTower },
  { id: 'burj-rafal', name: 'Burj Rafal', at: [46.632342, 24.792398], bearing: 81.6, height: 308, clear: 32, build: burjRafal, nights: { '#84b4c9': '#1a3340', '#96c2d4': '#27485a', '#dfe5e8': '#95a5af' } },
  { id: 'al-majdoul', name: 'Al Majdoul Tower', at: [46.659233, 24.739117], bearing: 20, height: 232, clear: 30, build: majdoul, nights: { '#eef0f1': '#7b8793', '#4f6478': '#1b2532', '#dfe4e7': '#6d7985' } },
  {
    id: 'tv-tower',
    name: 'Riyadh TV Tower',
    at: [46.69601, 24.64322],
    bearing: 0,
    height: 170,
    clear: 0,
    build: tvTower,
    shade: { radius: 5, height: 150 },
    // A floodlit shaft, and the lantern lit like a lamp.
    nights: { '#d9c9a9': '#75684f', '#d1c09d': '#6c6048', '#3f566c': '#ffe9ad', '#c9a24c': '#ffce63', '#bfa770': '#8f7d54', '#d5d7d8': '#b0b6ba' },
  },
  { id: 'water-tower', name: 'Riyadh Water Tower', at: [46.712275, 24.645119], bearing: 0, height: 61, clear: 30, build: waterTower, shade: { radius: 12, height: 58 }, nights: { '#2d5ea6': '#2a5aa6', '#f0ede2': '#aeaba1', '#e6e2d6': '#56544f' } },
  {
    id: 'kafd-station',
    name: 'KAFD Metro Station',
    at: [46.642994, 24.767531],
    bearing: 155.8,
    height: 34,
    clear: 70,
    build: kafdStation,
    // Lit from within, in the district's violet: light through the glass at its foot and through the bands where the shell is pierced.
    nights: { '#8fa7b8': '#efe0ff', '#f5f3ee': '#8a8798', '#e6d9bb': '#b24dff', '#efe9dc': '#9a93ad', '#ebe5d6': '#66627a' },
  },
  // Boulevard World: its lagoon and what stands round it, each thing a landmark of its own (see boulevard.js).
  // (They are many and low: built only for a view within a few kilometres of them.)
  ...WORLD_PARTS.map(({ at, ...part }) => ({ ...part, at: worldPlace(at), bearing: 0, within: 4000 })),
  // The King Abdullah Financial District: every building of it on its own outline (see kafd.js), round the
  // tower and the station above. (Its towers are built for any view, the rest only for one near them.)
  ...KAFD_PARTS.map(({ at, ...part }) => ({ ...part, at: kafdPlace(at), bearing: 0 })),
];

/** [lng, lat] of a point given in a landmark's own measure: u along its axis and v to the left, or east and north. */
function place(landmark, u, v, north) {
  const angle = (landmark.bearing * Math.PI) / 180;
  const east = north ? u : u * Math.sin(angle) - v * Math.cos(angle);
  const up = north ? v : u * Math.cos(angle) + v * Math.sin(angle);
  const squeeze = Math.cos((landmark.at[1] * Math.PI) / 180) * METERS_PER_DEGREE;
  return [landmark.at[0] + east / squeeze, landmark.at[1] + up / METERS_PER_DEGREE];
}

let made = null;

/**
 * Every landmark as map data: one feature per slab, with where it starts
 * (b), where it ends (t) and its colour (c), ready for a layer of 3D blocks.
 * A slab that is lit by night has the colour it shows in then as well (n):
 * its own, or the one its landmark gives for its paint (nights).
 */
export function landmarkSlabs() {
  if (made) return made;
  const features = [];
  for (const landmark of LANDMARKS) {
    for (const slab of landmark.build?.() ?? []) {
      const ring = slab.outline.map(([u, v]) => place(landmark, u, v, slab.north));
      ring.push(ring[0]);
      const properties = { landmark: landmark.id, b: Math.round(slab.base * 100) / 100, t: Math.round(slab.top * 100) / 100, c: slab.paint };
      const night = slab.night ?? landmark.nights?.[slab.paint];
      if (night) properties.n = night;
      features.push({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } });
    }
  }
  made = { type: 'FeatureCollection', features };
  return made;
}

// Each landmark's model, built once about its own middle. (The mesh they are laid into is made afresh
// whenever the place it is measured from moves on, which it does as the map is moved: with a hundred
// models and more, building every face again each time is what would be felt.)
const built = new Map();

/**
 * Build the landmarks that are true models into a mesh (a ModelMesh: see
 * models.js), each where it stands, measured in metres east and north of
 * origin ({ lng, lat }). Returns how many were built: those that are only
 * for a view near them (within) are left out of one far off.
 */
export function landmarkModels(mesh, origin) {
  mesh.clear();
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  let models = 0;
  for (const landmark of LANDMARKS) {
    if (!landmark.model) continue;
    const east = (landmark.at[0] - origin.lng) * squeeze;
    const north = (landmark.at[1] - origin.lat) * METERS_PER_DEGREE;
    if (landmark.within && Math.hypot(east, north) > landmark.within) continue;
    let own = built.get(landmark);
    if (!own) {
      own = new ModelMesh(256);
      landmark.model(new Model(own, { turn: landmark.bearing }));
      built.set(landmark, own);
    }
    mesh.add(own, east, north);
    models += 1;
  }
  return models;
}

let lamps = null;

/**
 * Where the red lamps on top of the tall landmarks are: one on each of a
 * landmark's highest slabs (the two points of Kingdom Centre, a mast), or
 * where its model says, as [lng, lat, height]. Those under 60 m have none.
 * (Worked out once: a model is built to ask it, and there are many.)
 */
export function landmarkBeacons() {
  if (lamps) return lamps;
  const beacons = [];
  for (const landmark of LANDMARKS) {
    if (!(landmark.height >= 60)) continue;
    if (landmark.model) {
      // (A model is measured east and north of its middle, turned with it.)
      const angle = (landmark.bearing * Math.PI) / 180;
      for (const [east, north, up] of landmark.model(new Model(new ModelMesh(16))).beacons ?? []) {
        beacons.push([...place(landmark, east * Math.cos(angle) + north * Math.sin(angle), north * Math.cos(angle) - east * Math.sin(angle), true), up]);
      }
      continue;
    }
    const slabs = landmark.build();
    const top = Math.max(...slabs.map((slab) => slab.top));
    for (const slab of slabs) {
      if (slab.top < top - 0.01) continue;
      const u = slab.outline.reduce((sum, corner) => sum + corner[0], 0) / slab.outline.length;
      const v = slab.outline.reduce((sum, corner) => sum + corner[1], 0) / slab.outline.length;
      beacons.push([...place(landmark, u, v, slab.north), top + 0.6]);
    }
  }
  lamps = beacons;
  return beacons;
}

/**
 * The flat roofs among the landmarks' slabs: the wings of a mall at a tower's
 * foot, the hall of a station. Each is laid and furnished like any other
 * roof, so they come in the form the roof layer takes buildings in (see
 * roofDecks in roofs.js): [{ height, base, replaced, roofTop, roofColour,
 * roofing, polygons }], in the slab's own colour, covered with slabs.
 */
export function landmarkRoofs() {
  const roofs = [];
  for (const landmark of LANDMARKS) {
    for (const slab of landmark.build?.() ?? []) {
      if (!slab.roof) continue;
      const ring = slab.outline.map(([u, v]) => place(landmark, u, v, slab.north));
      ring.push(ring[0]);
      roofs.push({ height: slab.top, base: 0, replaced: true, roofTop: slab.top, roofColour: slab.paint, roofing: 'slabs', polygons: [[ring]] });
    }
  }
  return roofs;
}

/**
 * Bridges that hang from cables. The map has their decks, as it has every
 * bridge's; what stands on the deck is set out here and drawn with the
 * bridges (see drawBridges in life.js).
 *
 * Wadi Laban Bridge carries the Western Ring Road over the wadi in three
 * spans, the middle one 405 m. Two slender concrete masts stand in the
 * middle of the deck, and from each a single fan of white cables runs down
 * to the deck's centre line on either side.
 */
export const STAYED_BRIDGES = [
  {
    id: 'wadi-laban',
    name: 'Wadi Laban Bridge',
    at: [46.58268, 24.616195], // the middle of the main span
    bearing: 336.6, // the way the deck runs
    masts: [-202.5, 202.5], // where they stand, in metres along the deck from the middle
    mast: 96, // how far each rises above the deck
    cables: 22, // in each fan, on either side of a mast
    reach: { bank: 168, span: 196 }, // how far a fan reaches along the deck: towards the bank, and towards the middle of the bridge
    between: 10, // from the deck's centre line to the middle of each carriageway
  },
];

/**
 * The footprints that landmarks without a building on the map throw a
 * shadow from, in the form buildingShadows() takes: [{ height, base, polygons }].
 * (The landmarks' first, then the models' that carry a picture, then the bridges' masts.)
 */
export function landmarkShades() {
  const shades = [];
  // (And of the models that carry a picture: see props.js.)
  for (const landmark of [...LANDMARKS, ...PROPS]) {
    for (const shade of [...(landmark.shade ? [landmark.shade] : []), ...(landmark.shades ?? [])]) {
      const [east, north] = shade.at ?? [0, 0];
      const ring = circle(shade.radius, 12).map(([u, v]) => place(landmark, east + u, north + v, true));
      ring.push(ring[0]);
      shades.push({ height: shade.height, base: 0, polygons: [[ring]] });
    }
  }
  // The masts of the cable-stayed bridges.
  for (const bridge of STAYED_BRIDGES) {
    for (const along of bridge.masts) {
      const ring = block(2.2, 1.8).map(([u, v]) => place(bridge, u + along, v));
      ring.push(ring[0]);
      shades.push({ height: bridge.mast, base: 0, polygons: [[ring]] });
    }
  }
  return shades;
}

/**
 * Which of the map's own buildings a landmark model stands in for: those
 * whose middle lies within the landmark's clearing and which are not much
 * larger than it (a tower's outline, not the whole block it stands in).
 *
 * outlines: [{ id, ring: [[lng, lat], …] }]. Returns the ids to leave out.
 */
export function replacedByLandmarks(outlines) {
  const out = new Set();
  // (A model that carries a picture has its clearing too: see props.js.)
  for (const landmark of [...LANDMARKS, ...PROPS]) {
    if (landmark.covers) {
      for (const { id, ring } of outlines) {
        if (id === undefined || id === null || !ring || ring.length < 4) continue;
        let lng = 0;
        let lat = 0;
        for (let i = 1; i < ring.length; i += 1) {
          lng += ring[i][0];
          lat += ring[i][1];
        }
        if (landmark.covers(lng / (ring.length - 1), lat / (ring.length - 1))) out.add(id);
      }
    }
    if (!(landmark.clear > 0)) continue;
    const squeeze = Math.cos((landmark.at[1] * Math.PI) / 180) * METERS_PER_DEGREE;
    const reach = landmark.clear * 3 / METERS_PER_DEGREE; // nothing further off than this needs a closer look
    for (const { id, ring } of outlines) {
      if (id === undefined || id === null || !ring || ring.length < 4) continue;
      if (Math.abs(ring[0][1] - landmark.at[1]) > reach || Math.abs(ring[0][0] - landmark.at[0]) > reach * 1.2) continue;
      let east = 0;
      let north = 0;
      for (let i = 1; i < ring.length; i += 1) {
        east += (ring[i][0] - landmark.at[0]) * squeeze;
        north += (ring[i][1] - landmark.at[1]) * METERS_PER_DEGREE;
      }
      east /= ring.length - 1;
      north /= ring.length - 1;
      let widest = 0;
      for (const [lng, lat] of ring) widest = Math.max(widest, Math.hypot((lng - landmark.at[0]) * squeeze - east, (lat - landmark.at[1]) * METERS_PER_DEGREE - north));
      if (Math.hypot(east, north) <= landmark.clear && widest <= landmark.clear * 1.6) out.add(id);
    }
  }
  return out;
}
