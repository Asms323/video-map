// A true-size airliner, for the aircraft that fly over the 3D city: its body, wings, engines, tail and
// wheels, as triangles in its own frame. x runs to its right, y ahead, z up, in metres, with the ground
// under its wheels at z = 0 and its middle (half way along its body) at x = y = 0.
//
// Two sizes are drawn: a single-aisle airliner, as the A320 family that most flights at Riyadh are flown
// with, and a wide-bodied one, as the 787 and the A350. No airline's mark or name is on either: the body
// in one colour, the belly in light grey, the fin in the airline's colour (see flights.js).

const RADIANS = Math.PI / 180;

/** The sizes of the two, in metres and degrees, from the makers' published figures (rounded). */
export const AIRLINERS = {
  narrow: {
    length: 37.6,
    width: 3.95,
    height: 4.14,
    centre: 3.9, // how high the middle of its body is over the ground, standing on its wheels
    span: 35.8,
    root: 6.6, // the chord of the wing where it meets the body
    tip: 1.5,
    sweep: 25,
    dihedral: 5.5,
    wingAt: 0.44, // how far back along the body the wing's quarter chord meets it, as a part of the length
    winglet: 2.4, // how tall the blade standing up at each wing tip is (0: none)
    engine: { at: 5.75, radius: 1.05, length: 4.4, ahead: 1.6, drop: 1.3 },
    tailplane: { span: 12.5, root: 3.6, tip: 1.4, sweep: 30, at: 0.83 },
    fin: { height: 5.9, root: 6.4, tip: 2.6, sweep: 38, at: 0.69 },
    gear: { track: 7.6, wheel: 1.14, nose: 0.74, axles: 1, noseAt: 0.135 },
    windows: { pitch: 0.53, from: 0.18, to: 0.72 },
  },
  wide: {
    length: 64,
    width: 5.9,
    height: 6.0,
    centre: 5.4,
    span: 60,
    root: 11,
    tip: 2.6,
    sweep: 31.5,
    dihedral: 6,
    wingAt: 0.45,
    winglet: 0, // (its wing tips are raked back instead)
    engine: { at: 9.8, radius: 1.75, length: 7, ahead: 2.6, drop: 1.5 },
    tailplane: { span: 20.5, root: 6.2, tip: 2.4, sweep: 33, at: 0.83 },
    fin: { height: 9.4, root: 10.5, tip: 4, sweep: 40, at: 0.69 },
    gear: { track: 11, wheel: 1.3, nose: 1, axles: 2, noseAt: 0.11 },
    windows: { pitch: 0.53, from: 0.16, to: 0.73 },
  },
};

/** What each triangle is part of: each is painted its own way (see AIRLINER_PAINT and drawAircraft()). */
export const AIRLINER_PARTS = ['body', 'belly', 'cockpit', 'fin', 'wing', 'engine', 'intake', 'exhaust', 'strut', 'tyre', 'window'];
const PART = Object.fromEntries(AIRLINER_PARTS.map((name, index) => [name, index]));

// The body, nose to tail: how far back (as a part of the length), how wide and how tall (as parts of the
// full width and height), and how far its middle stands above or below the line of the body (as a part
// of half the height): the nose a little low, the tail swept up to a point under the fin.
const BODY = [
  [0, 0, 0, -0.22],
  [0.006, 0.2, 0.24, -0.19],
  [0.02, 0.44, 0.48, -0.14],
  [0.045, 0.68, 0.72, -0.08],
  [0.08, 0.86, 0.89, -0.035],
  [0.125, 0.96, 0.97, -0.01],
  [0.18, 1, 1, 0],
  [0.63, 1, 1, 0],
  [0.73, 0.88, 0.9, 0.08],
  [0.83, 0.66, 0.66, 0.28],
  [0.92, 0.4, 0.38, 0.5],
  [0.98, 0.16, 0.15, 0.66],
  [1, 0.07, 0.07, 0.7],
];
const RING = 14; // the sides of the body all round

/** The body's section at a point along it (t from 0 at the nose to 1 at the tail): [wide, tall, rise]. */
function sectionAt(t) {
  const k = Math.max(BODY.findIndex((row) => row[0] >= t), 1);
  const [a, b] = [BODY[k - 1], BODY[k]];
  const f = Math.min(Math.max((t - a[0]) / (b[0] - a[0] || 1), 0), 1);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
  const size = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / size, a[1] / size, a[2] / size];
};

/** Triangles as they are built: corners, the way each faces, and what each is part of. */
class Build {
  constructor() {
    this.corners = [];
    this.normals = [];
    this.parts = [];
  }

  /** A triangle, turned so that it faces the way told (outward), if one is told. */
  tri(a, b, c, part, outward = null) {
    let n = cross(minus(b, a), minus(c, a));
    if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return;
    if (outward && dot(n, outward) < 0) {
      [b, c] = [c, b];
      n = [-n[0], -n[1], -n[2]];
    }
    this.corners.push(...a, ...b, ...c);
    this.normals.push(...unit(n));
    this.parts.push(PART[part]);
  }

  /** A four-cornered face, corners in order round its edge. */
  quad(a, b, c, d, part, outward = null) {
    this.tri(a, b, c, part, outward);
    this.tri(a, c, d, part, outward);
  }

  /** The same, seen from both sides (a thin plate: a flap, a strut). */
  plate(a, b, c, d, part) {
    const n = cross(minus(b, a), minus(c, a));
    this.quad(a, b, c, d, part, n);
    this.quad(a, b, c, d, part, [-n[0], -n[1], -n[2]]);
  }

  /**
   * A tube along y: rings (each [y, x, z, radius across, radius up]) joined side to side; its ends
   * closed if told. part may be a function of the ring and the angle.
   */
  tube(rings, sides, part, { front = null, back = null } = {}) {
    const point = ([y, x, z, across, up], k) => {
      const a = (k / sides) * Math.PI * 2;
      return [x + across * Math.sin(a), y, z + up * Math.cos(a)];
    };
    for (let i = 0; i + 1 < rings.length; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const [p, q, r, s] = [point(rings[i], k), point(rings[i], k + 1), point(rings[i + 1], k + 1), point(rings[i + 1], k)];
        const middle = (k + 0.5) / sides;
        const out = [Math.sin(middle * Math.PI * 2), 0, Math.cos(middle * Math.PI * 2)];
        const which = typeof part === 'function' ? part(i, middle) : part;
        this.quad(p, q, r, s, which, out);
      }
    }
    const cap = (ring, way, which) => {
      const centre = [ring[1], ring[0], ring[2]];
      for (let k = 0; k < sides; k += 1) this.tri(centre, point(ring, k), point(ring, k + 1), which, [0, way, 0]);
    };
    if (front) cap(rings[0], 1, front);
    if (back) cap(rings.at(-1), -1, back);
  }

  /** A box between two corners, its sides square to x, y and z. */
  box([x0, y0, z0], [x1, y1, z1], part) {
    const c = (x, y, z) => [x, y, z];
    this.quad(c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1), part, [0, 0, 1]);
    this.quad(c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0), part, [0, 0, -1]);
    this.quad(c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1), part, [0, Math.sign(y0 - y1) || -1, 0]);
    this.quad(c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1), part, [0, Math.sign(y1 - y0) || 1, 0]);
    this.quad(c(x0, y0, z0), c(x0, y1, z0), c(x0, y1, z1), c(x0, y0, z1), part, [Math.sign(x0 - x1) || -1, 0, 0]);
    this.quad(c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1), part, [Math.sign(x1 - x0) || 1, 0, 0]);
  }

  /** A wheel: its axle along x, so wide, so tall. */
  wheel([x, y, z], wide, tall, sides = 8) {
    const r = tall / 2;
    const rim = (side) =>
      Array.from({ length: sides }, (_, k) => {
        const a = ((k + 0.5) / sides) * Math.PI * 2;
        return [x + side * wide * 0.5, y + r * Math.sin(a), z + r * Math.cos(a)];
      });
    const [left, right] = [rim(-1), rim(1)];
    for (let k = 0; k < sides; k += 1) {
      const j = (k + 1) % sides;
      const a = ((k + 1) / sides) * Math.PI * 2;
      this.quad(left[k], right[k], right[j], left[j], 'tyre', [0, Math.sin(a), Math.cos(a)]);
    }
    for (const [ring, side] of [[left, -1], [right, 1]]) {
      const hub = [x + side * wide * 0.5, y, z];
      for (let k = 0; k < sides; k += 1) this.tri(hub, ring[k], ring[(k + 1) % sides], 'strut', [side, 0, 0]);
    }
  }
}

/**
 * A wing (or a tailplane): from its root to its tip on one side (side: 1 right, -1 left). root, tip:
 * [x, y of the leading edge, z, chord, thickness]. Where it is told to, flaps hang from the inner part of
 * the trailing edge, so many degrees down.
 */
function wingOf(build, side, root, tip, part, { flaps = 0, flapSpan = 0, tipFace = true } = {}) {
  const at = (end, along, up) => [side * end[0], end[1] - along * end[3], end[2] + up * end[4]];
  const crest = 0.32; // where it is thickest, as a part of its chord
  const [rl, rt, rb, re] = [at(root, 0, 0), at(root, crest, 0.55), at(root, crest, -0.45), at(root, 1, 0.02)];
  const [tl, tt, tb, te] = [at(tip, 0, 0), at(tip, crest, 0.55), at(tip, crest, -0.45), at(tip, 1, 0.02)];
  build.quad(rl, rt, tt, tl, part, [0, 0.3, 1]);
  build.quad(rt, re, te, tt, part, [0, -0.2, 1]);
  build.quad(rl, tl, tb, rb, part, [0, 0.3, -1]);
  build.quad(rb, tb, te, re, part, [0, -0.2, -1]);
  if (tipFace) build.quad(tl, tt, te, tb, part, [side, 0, 0]);
  if (flaps > 0 && flapSpan > 0) {
    // The flaps: from the root out to so far along the span, a fifth of the chord deep, swung down.
    const out = (f) => root.map((value, k) => value + (tip[k] - value) * f);
    const [inner, outer] = [out(0.04), out(flapSpan)];
    const down = flaps * RADIANS;
    const hang = (end) => {
      const edge = at(end, 1, 0);
      const deep = end[3] * 0.22;
      return [edge, [edge[0], edge[1] - deep * Math.cos(down), edge[2] - deep * Math.sin(down)]];
    };
    const [[a, b], [c, d]] = [hang(inner), hang(outer)];
    build.plate(a, c, d, b, 'wing');
  }
}

/** Where the leading edge of the main wing is, so far out from the middle: [y, z]. */
function wingEdge(s, x) {
  const [root, tip] = wingEnds(s);
  const f = Math.min(Math.max((x - root[0]) / (tip[0] - root[0]), 0), 1);
  return [root[1] + (tip[1] - root[1]) * f, root[2] + (tip[2] - root[2]) * f, root[3] + (tip[3] - root[3]) * f, root[4] + (tip[4] - root[4]) * f];
}

/** The main wing's root and tip: [x, y of the leading edge, z, chord, thickness]. */
export function wingEndsOf(s) {
  return wingEnds(s);
}

function wingEnds(s) {
  const rootX = s.width * 0.42;
  const tipX = s.span / 2 - (s.winglet > 0 ? 0.2 : 0);
  const quarter = s.length / 2 - s.wingAt * s.length;
  const back = (tipX - rootX) * Math.tan(s.sweep * RADIANS);
  const rootZ = s.centre - 0.27 * s.height;
  return [
    [rootX, quarter + 0.25 * s.root, rootZ, s.root, 0.15 * s.root],
    [tipX, quarter - back + 0.25 * s.tip, rootZ + (tipX - rootX) * Math.tan(s.dihedral * RADIANS), s.tip, 0.11 * s.tip],
  ];
}

const models = new Map();

/**
 * An airliner as triangles: { corners (nine numbers to a triangle), normals (three to a triangle: the
 * way it faces), parts (what each is part of: an index into AIRLINER_PARTS), windows ([x, y, z] of
 * each cabin window, for their light by night), lamps: { left, right, tail, top, bottom, landing: [..] },
 * size } in its own frame (see the head of this file). kind: 'narrow' or 'wide'. gear: whether its wheels
 * are down. flaps: how far its flaps are down, in degrees.
 */
export function airliner(kind = 'narrow', { gear = false, flaps = 0 } = {}) {
  const key = `${kind}:${gear ? 1 : 0}:${Math.round(flaps)}`;
  if (models.has(key)) return models.get(key);
  const s = AIRLINERS[kind] ?? AIRLINERS.narrow;
  const build = new Build();
  const yAt = (t) => s.length / 2 - t * s.length;

  // The body: round, a little taller than wide; its belly light grey; the windows of the flight deck
  // round the top of its nose.
  const rings = BODY.map(([t, wide, tall, rise]) => [yAt(t), 0, s.centre + (rise * s.height) / 2, (wide * s.width) / 2, (tall * s.height) / 2]);
  build.tube(rings, RING, (i, middle) => {
    const up = Math.cos(middle * Math.PI * 2);
    const t = (BODY[i][0] + BODY[i + 1][0]) / 2;
    if (t > 0.04 && t < 0.095 && up > 0.05 && up < 0.92) return 'cockpit';
    return up < -0.42 ? 'belly' : 'body';
  });

  // The cabin windows, a row down each side: a little out from the body so they lie on top of it.
  const windows = [];
  const { pitch, from, to } = s.windows;
  const up = 0.3; // how high on the side, as a part of half the height
  const angle = Math.acos(up);
  for (let y = yAt(from); y >= yAt(to); y -= pitch) {
    const t = (s.length / 2 - y) / s.length;
    const [wide, tall, rise] = sectionAt(t);
    for (const side of [-1, 1]) {
      const x = side * ((wide * s.width) / 2) * Math.sin(angle) + side * 0.03;
      const z = s.centre + ((rise + tall * up) * s.height) / 2;
      const [w, h] = [0.13, 0.19];
      build.quad([x, y + w, z - h], [x, y - w, z - h], [x, y - w, z + h], [x, y + w, z + h], 'window', [side, 0, 0.3]);
      windows.push([x, y, z]);
    }
  }

  // The wings, swept and set up at their tips; the flaps on their inner part when they are down.
  const [root, tip] = wingEnds(s);
  for (const side of [-1, 1]) {
    wingOf(build, side, root, tip, 'wing', { flaps, flapSpan: 0.68, tipFace: s.winglet === 0 });
    if (s.winglet > 0) {
      // The blade at the tip: standing up from it, leaning out a little and swept back.
      const [tipLead, tipZ, chord] = [tip[1], tip[2], tip[3]];
      const base = [side * tip[0], tipLead, tipZ];
      const baseBack = [side * tip[0], tipLead - chord, tipZ];
      const top = [side * (tip[0] + 0.55), tipLead - s.winglet * 0.85, tipZ + s.winglet];
      const topBack = [top[0], top[1] - chord * 0.42, top[2]];
      build.plate(base, baseBack, topBack, top, 'wing');
    }
  }

  // The engines: one under each wing, its intake ahead of the wing's edge; the cone of the exhaust
  // behind; and the pylon that holds it.
  const e = s.engine;
  for (const side of [-1, 1]) {
    const [lead, z, chord, thick] = wingEdge(s, e.at);
    const front = lead + e.ahead;
    const zc = z - thick * 0.45 - e.drop;
    const x = side * e.at;
    const R = e.radius;
    build.tube(
      [
        [front, x, zc, R * 0.93, R * 0.93],
        [front - e.length * 0.1, x, zc, R, R],
        [front - e.length * 0.55, x, zc, R * 0.98, R * 0.98],
        [front - e.length, x, zc, R * 0.66, R * 0.66],
      ],
      12,
      'engine',
      { front: 'intake', back: 'exhaust' },
    );
    build.tube(
      [
        [front - e.length, x, zc, R * 0.5, R * 0.5],
        [front - e.length * 1.28, x, zc - R * 0.05, R * 0.06, R * 0.06],
      ],
      8,
      'exhaust',
    );
    // (The pylon: a thin plate from the top of the engine up into the wing.)
    const pylon = [
      [x, front - e.length * 0.25, zc + R * 0.9],
      [x, front - e.length * 0.95, zc + R * 0.55],
      [x, lead - chord * 0.75, z - thick * 0.2],
      [x, lead - chord * 0.05, z - thick * 0.2],
    ];
    for (const shift of [-0.16, 0.16]) build.quad(...pylon.map((p) => [p[0] + shift, p[1], p[2]]), 'engine', [Math.sign(shift), 0, 0]);
    build.quad(...pylon.slice(0, 2).map((p) => [p[0] - 0.16, p[1], p[2]]), ...pylon.slice(0, 2).reverse().map((p) => [p[0] + 0.16, p[1], p[2]]), 'engine', [0, 0, -1]);
  }

  // The tailplane, on the swept-up tail; and the fin over it, in the airline's colour.
  const tp = s.tailplane;
  const [tWide, , tRise] = sectionAt(tp.at + 0.03);
  const tz = s.centre + (tRise * s.height) / 2;
  const tRootX = (tWide * s.width) / 2 * 0.8;
  const tBack = (tp.span / 2 - tRootX) * Math.tan(tp.sweep * RADIANS);
  for (const side of [-1, 1]) {
    wingOf(build, side, [tRootX, yAt(tp.at), tz, tp.root, 0.11 * tp.root], [tp.span / 2, yAt(tp.at) - tBack - 0.25 * (tp.root - tp.tip), tz + (tp.span / 2) * Math.tan(6 * RADIANS), tp.tip, 0.1 * tp.tip], 'wing');
  }
  const f = s.fin;
  const [, fTall, fRise] = sectionAt(f.at);
  const finBase = s.centre + ((fRise + fTall * 0.94) * s.height) / 2;
  const finLead = yAt(f.at);
  const tipLead = finLead - f.height * Math.tan(f.sweep * RADIANS);
  const thick = 0.1 * f.root;
  const fin = {
    lead: [0, finLead, finBase],
    back: [0, finLead - f.root, finBase],
    tipLead: [0, tipLead, finBase + f.height],
    tipBack: [0, tipLead - f.tip, finBase + f.height],
  };
  for (const side of [-1, 1]) {
    const crest = (a, b, along, wide) => [side * wide, a[1] + (b[1] - a[1]) * along, a[2] + (b[2] - a[2]) * along];
    const [rootCrest, tipCrest] = [crest(fin.lead, fin.back, 0.3, thick / 2), crest(fin.tipLead, fin.tipBack, 0.3, (thick / 2) * (f.tip / f.root))];
    build.quad(fin.lead, rootCrest, tipCrest, fin.tipLead, 'fin', [side, 0.4, 0]);
    build.quad(rootCrest, fin.back, fin.tipBack, tipCrest, 'fin', [side, -0.2, 0]);
  }
  build.quad(fin.tipLead, [thick * 0.15, fin.tipLead[1] - f.tip * 0.3, fin.tipLead[2]], fin.tipBack, [-thick * 0.15, fin.tipLead[1] - f.tip * 0.3, fin.tipLead[2]], 'fin', [0, 0, 1]);

  // The wheels, when they are down: the main legs under the wings' roots, the nose leg under the flight deck.
  if (gear) {
    const g = s.gear;
    const mainY = root[1] - root[3] * 0.72;
    const legTop = root[2] - root[4] * 0.4;
    for (const side of [-1, 1]) {
      const x = side * (g.track / 2);
      const axle = g.wheel / 2;
      build.box([x - 0.14, mainY - 0.14, axle], [x + 0.14, mainY + 0.14, legTop], 'strut');
      const spread = g.axles > 1 ? 1.5 : 0;
      for (let k = 0; k < g.axles; k += 1) {
        const y = mainY + (k - (g.axles - 1) / 2) * spread;
        if (g.axles > 1) build.box([x - 0.1, mainY - spread / 2 - 0.1, axle - 0.1], [x + 0.1, mainY + spread / 2 + 0.1, axle + 0.12], 'strut');
        for (const out of [-1, 1]) build.wheel([x + out * (g.wheel * 0.42), y, axle], g.wheel * 0.34, g.wheel);
      }
    }
    const noseY = yAt(g.noseAt);
    const [, noseTall, noseRise] = sectionAt(g.noseAt);
    const noseTop = s.centre + ((noseRise - noseTall * 0.85) * s.height) / 2;
    build.box([-0.09, noseY - 0.09, g.nose / 2], [0.09, noseY + 0.09, noseTop], 'strut');
    for (const out of [-1, 1]) build.wheel([out * g.nose * 0.32, noseY, g.nose / 2], g.nose * 0.3, g.nose);
  }

  // Where its lamps are: red on the left wing tip, green on the right, white at the tail; the red beacons
  // on its roof and its belly; and its landing lamps, in the roots of the wings.
  const tipZ = tip[2] + (s.winglet > 0 ? 0.1 : 0);
  const model = {
    kind,
    size: { length: s.length, span: s.span, height: fin.tipLead[2] },
    corners: new Float32Array(build.corners),
    normals: new Float32Array(build.normals),
    parts: new Uint8Array(build.parts),
    windows,
    lamps: {
      left: [-tip[0], tip[1] - 0.2, tipZ],
      right: [tip[0], tip[1] - 0.2, tipZ],
      tail: [0, -s.length / 2 - 0.1, s.centre + (0.7 * s.height) / 2],
      top: [0, yAt(0.4), s.centre + s.height / 2 + 0.1],
      bottom: [0, yAt(0.45), s.centre - s.height / 2 - 0.1],
      landing: [-1, 1].map((side) => [side * (root[0] + 0.8), root[1] - 0.3, root[2] - 0.2]),
    },
  };
  models.set(key, model);
  return model;
}
