// Plain solids for the true models.
//
// A model (see models.js) is built of flat triangles. Most of what stands in
// a place like Boulevard World is made of a few kinds of solid, over and over:
// a block, a block that narrows, a thing turned on a lathe (a column, a dome,
// a ball), a beam between two points, a roof that sweeps down to its eaves
// and up again at its corners. They are made here, each out of triangles
// that know which way they face, so that one written line builds one solid.
//
// Places are given in a frame: a spot on the ground and a direction, so that
// a hall may be built square to its own walls wherever it stands and however
// it is turned. Nothing here touches the browser. Measurements are metres.

const TAU = Math.PI * 2;

const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const long = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const size = long(a) || 1;
  return [a[0] / size, a[1] / size, a[2] / size];
};
const mix = (a, b, t) => a + (b - a) * t;

/**
 * A frame on the ground: a place [east, north], the way its own first
 * direction (u) points, in radians anticlockwise from east, and the height
 * its own ground lies at. Returns to(u, v, up): the place [east, north, up]
 * of a point u along, v to the left and up above. to.way(u, v, up) turns a
 * direction the same way without moving it; to.sub([u, v], turn, up) is a
 * frame within this one.
 */
export function frame([east = 0, north = 0] = [], angle = 0, lift = 0) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const to = (u, v, up = 0) => [east + u * cos - v * sin, north + u * sin + v * cos, lift + up];
  to.way = (u, v, up = 0) => [u * cos - v * sin, u * sin + v * cos, up];
  to.sub = ([u, v], turn = 0, up = 0) => frame([east + u * cos - v * sin, north + u * sin + v * cos], angle + turn, lift + up);
  to.angle = angle;
  return to;
}

/**
 * A block: [u0, u1, v0, v1] on the ground, from z0 up to z1. faces: other
 * stuff for single sides ({ south, east, north, west }: south is the side at
 * v0, east the one at u1), or null to leave one out; top: the stuff of its
 * roof, or null for none.
 */
export function block(model, to, [u0, u1, v0, v1], z0, z1, stuff, { top = stuff, faces = {} } = {}) {
  const wall = (a, b, out, name) => {
    const made = name in faces ? faces[name] : stuff;
    if (made) model.quad(to(a[0], a[1], z0), to(b[0], b[1], z0), to(b[0], b[1], z1), to(a[0], a[1], z1), made, { out: to.way(out[0], out[1]) });
  };
  wall([u0, v0], [u1, v0], [0, -1], 'south');
  wall([u1, v0], [u1, v1], [1, 0], 'east');
  wall([u1, v1], [u0, v1], [0, 1], 'north');
  wall([u0, v1], [u0, v0], [-1, 0], 'west');
  if (top) model.flat([to(u0, v0, z1), to(u1, v0, z1), to(u1, v1, z1), to(u0, v1, z1)], top);
}

/**
 * A block that narrows (or widens) as it rises: from the rectangle low at
 * z0 to the rectangle high at z1, each [u0, u1, v0, v1]. A rectangle with no
 * width is a ridge, one with neither width nor depth a point.
 */
export function taper(model, to, low, high, z0, z1, stuff, { top = stuff, faces = {} } = {}) {
  const side = (a0, b0, a1, b1, out, name) => {
    const made = name in faces ? faces[name] : stuff;
    if (made) model.quad(to(a0[0], a0[1], z0), to(b0[0], b0[1], z0), to(b1[0], b1[1], z1), to(a1[0], a1[1], z1), made, { out: to.way(out[0], out[1], 0.35) });
  };
  const [a, b, c, d] = [[low[0], low[2]], [low[1], low[2]], [low[1], low[3]], [low[0], low[3]]];
  const [e, f, g, h] = [[high[0], high[2]], [high[1], high[2]], [high[1], high[3]], [high[0], high[3]]];
  side(a, b, e, f, [0, -1], 'south');
  side(b, c, f, g, [1, 0], 'east');
  side(c, d, g, h, [0, 1], 'north');
  side(d, a, h, e, [-1, 0], 'west');
  if (top && high[1] - high[0] > 0.01 && high[3] - high[2] > 0.01) model.flat([to(e[0], e[1], z1), to(f[0], f[1], z1), to(g[0], g[1], z1), to(h[0], h[1], z1)], top);
}

/**
 * A prism over any outline: ring: its corners [[u, v], …] in order, either
 * way round; from z0 up to z1. top: the stuff of its lid, or null.
 */
export function prism(model, to, ring, z0, z1, stuff, { top = stuff } = {}) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    area += x0 * y1 - x1 * y0;
  }
  const turn = area >= 0 ? 1 : -1; // anticlockwise: the outside is to the right of each side
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    if (Math.hypot(x1 - x0, y1 - y0) < 1e-6) continue;
    model.quad(to(x0, y0, z0), to(x1, y1, z0), to(x1, y1, z1), to(x0, y0, z1), stuff, { out: to.way((y1 - y0) * turn, -(x1 - x0) * turn) });
  }
  if (top) model.flat(ring.map(([u, v]) => to(u, v, z1)), top);
}

/**
 * A thing turned on a lathe: profile: [[radius, height], …] from its foot to
 * its top, the outside to the right of the way it runs; round the upright
 * line through [u, v]. stuff: what it is made of, or (i, k) => stuff for the
 * piece between profile points i and i + 1 in the k-th cut. cuts: how many
 * flat pieces go round; smooth: light it as the curve it stands for; from,
 * sweep: only part of the way round (radians).
 */
export function lathe(model, to, [u, v], profile, stuff, { cuts = 16, smooth = true, from = 0, sweep = TAU, crease = 0.75 } = {}) {
  const made = typeof stuff === 'function' ? stuff : () => stuff;
  // Which way the surface looks along each piece of the profile, in (outward, up).
  const pieces = [];
  for (let i = 0; i < profile.length - 1; i += 1) {
    const dr = profile[i + 1][0] - profile[i][0];
    const dz = profile[i + 1][1] - profile[i][1];
    const size = Math.hypot(dr, dz) || 1;
    pieces.push([dz / size, -dr / size]);
  }
  // …and at each of its points: between the two pieces that meet there, unless they meet in a crease.
  const looks = (i, piece) => {
    if (!smooth) return pieces[piece];
    const other = i === piece ? piece - 1 : piece + 1;
    if (other < 0 || other >= pieces.length) return pieces[piece];
    const a = pieces[piece];
    const b = pieces[other];
    if (a[0] * b[0] + a[1] * b[1] < Math.cos(crease)) return a;
    const size = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [(a[0] + b[0]) / size, (a[1] + b[1]) / size];
  };
  for (let k = 0; k < cuts; k += 1) {
    const a0 = from + (k / cuts) * sweep;
    const a1 = from + ((k + 1) / cuts) * sweep;
    const between = (a0 + a1) / 2;
    for (let i = 0; i < profile.length - 1; i += 1) {
      const [r0, z0] = profile[i];
      const [r1, z1] = profile[i + 1];
      if (r0 < 1e-6 && r1 < 1e-6) continue;
      const what = made(i, k);
      if (!what) continue;
      const at = (r, angle, z) => to(u + Math.cos(angle) * r, v + Math.sin(angle) * r, z);
      const facing = ([outward, up], angle) => to.way(Math.cos(angle) * outward, Math.sin(angle) * outward, up);
      const low = looks(i, i);
      const high = looks(i + 1, i);
      const round = smooth && cuts > 4;
      const normals = smooth ? [facing(low, round ? a0 : between), facing(low, round ? a1 : between), facing(high, round ? a1 : between), facing(high, round ? a0 : between)] : null;
      model.quad(at(r0, a0, z0), at(r0, a1, z0), at(r1, a1, z1), at(r1, a0, z1), what, { out: facing(pieces[i], between), normals, lines: [true, true, true, true] });
    }
  }
}

/** The profile of a ball (or of part of one: between two angles down from its top), for the lathe. */
export function ballProfile(radius, height, { rings = 12, from = 0, until = Math.PI, squash = 1 } = {}) {
  const profile = [];
  for (let i = rings; i >= 0; i -= 1) {
    const angle = from + ((until - from) * i) / rings;
    profile.push([Math.max(Math.sin(angle), 0) * radius, height + Math.cos(angle) * radius * squash]);
  }
  return profile;
}

/**
 * A beam between two places (each [east, north, up], as a frame gives them):
 * wide across and deep the other way, four-sided. ends: close its two ends.
 */
export function beam(model, a, b, wide, stuff, { deep = wide, ends = false } = {}) {
  const way = minus(b, a);
  if (long(way) < 1e-6) return;
  const along = unit(way);
  const aside = unit(cross(along, Math.abs(along[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
  const over = unit(cross(along, aside));
  // (Nothing goes into the ground: a leg that stands aslant is cut off level at its foot.)
  const corner = (end, s, t) => [end[0] + aside[0] * s * (wide / 2) + over[0] * t * (deep / 2), end[1] + aside[1] * s * (wide / 2) + over[1] * t * (deep / 2), Math.max(end[2] + aside[2] * s * (wide / 2) + over[2] * t * (deep / 2), 0)];
  const sides = [[[1, -1], [1, 1], aside], [[1, 1], [-1, 1], over], [[-1, 1], [-1, -1], aside.map((part) => -part)], [[-1, -1], [1, -1], over.map((part) => -part)]];
  for (const [[s0, t0], [s1, t1], out] of sides) model.quad(corner(a, s0, t0), corner(a, s1, t1), corner(b, s1, t1), corner(b, s0, t0), stuff, { out });
  if (ends) {
    model.quad(corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), corner(a, -1, -1), stuff, { out: along.map((part) => -part) });
    model.quad(corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1), corner(b, -1, -1), stuff, { out: along });
  }
}

/**
 * A roof that sweeps: from its eaves (the rectangle outer: [half along, half
 * across], at z0) up to the rectangle inner, rise higher: a ridge if inner
 * has no depth, a point if it has neither, the foot of the next storey if it
 * has both. power: how hollow its slope is (1: straight; more: steep above
 * and nearly level at the eaves, as a Chinese roof is). lift: how far its
 * corners turn up. under: the stuff of its underside, seen from the street.
 */
export function sweptRoof(model, to, outer, inner, z0, rise, stuff, { power = 1, lift = 0, steps = 1, cols = 1, under = null, wall = inner } = {}) {
  const point = (side, s, t) => {
    const hu = mix(outer[0], inner[0], t);
    const hv = mix(outer[1], inner[1], t);
    const up = z0 + rise * t ** power + lift * (1 - t) ** 2 * Math.abs(s) ** 3;
    if (side === 0) return to(s * hu, -hv, up);
    if (side === 1) return to(hu, s * hv, up);
    if (side === 2) return to(-s * hu, hv, up);
    return to(-hu, -s * hv, up);
  };
  const outs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let side = 0; side < 4; side += 1) {
    for (let j = 0; j < steps; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const s0 = -1 + (2 * i) / cols;
        const s1 = -1 + (2 * (i + 1)) / cols;
        const t0 = j / steps;
        const t1 = (j + 1) / steps;
        model.quad(point(side, s0, t0), point(side, s1, t0), point(side, s1, t1), point(side, s0, t1), stuff, { out: to.way(outs[side][0], outs[side][1], 0.8), fold: lift > 0 || power !== 1 });
      }
    }
  }
  if (under) {
    // From the wall out to the eaves, level, looking down.
    const [wu, wv] = wall;
    const [ou, ov] = outer;
    const down = { out: [0, 0, -1] };
    model.quad(to(-ou, -ov, z0), to(ou, -ov, z0), to(wu, -wv, z0), to(-wu, -wv, z0), under, down);
    model.quad(to(ou, -ov, z0), to(ou, ov, z0), to(wu, wv, z0), to(wu, -wv, z0), under, down);
    model.quad(to(ou, ov, z0), to(-ou, ov, z0), to(-wu, wv, z0), to(wu, wv, z0), under, down);
    model.quad(to(-ou, ov, z0), to(-ou, -ov, z0), to(-wu, -wv, z0), to(-wu, wv, z0), under, down);
  }
}

/**
 * Panes set in a wall: along the side of the rectangle [u0, u1, v0, v1] that
 * is named (south: at v0; east: at u1; north; west), count of them side by
 * side, each row from a height to a height (rows: [[z0, z1], …]), standing
 * a little proud of the wall. share: how much of each bay is pane; margin:
 * how much wall is left at either end. stuff: what they are made of, or
 * (row, bay) => stuff (null for no pane there).
 */
export function panes(model, to, [u0, u1, v0, v1], name, rows, count, stuff, { share = 0.55, margin = 0.8, proud = 0.08 } = {}) {
  const made = typeof stuff === 'function' ? stuff : () => stuff;
  const sides = {
    south: [[u0, v0 - proud], [u1, v0 - proud], [0, -1]],
    east: [[u1 + proud, v0], [u1 + proud, v1], [1, 0]],
    north: [[u1, v1 + proud], [u0, v1 + proud], [0, 1]],
    west: [[u0 - proud, v1], [u0 - proud, v0], [-1, 0]],
  };
  const [a, b, out] = sides[name];
  const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (run <= margin * 2 || count < 1) return;
  const way = [(b[0] - a[0]) / run, (b[1] - a[1]) / run];
  const bay = (run - margin * 2) / count;
  rows.forEach(([z0, z1], row) => {
    for (let i = 0; i < count; i += 1) {
      const what = made(row, i);
      if (!what) continue;
      const from = margin + bay * (i + (1 - share) / 2);
      const until = from + bay * share;
      model.quad(to(a[0] + way[0] * from, a[1] + way[1] * from, z0), to(a[0] + way[0] * until, a[1] + way[1] * until, z0), to(a[0] + way[0] * until, a[1] + way[1] * until, z1), to(a[0] + way[0] * from, a[1] + way[1] * from, z1), what, { out: to.way(out[0], out[1]) });
    }
  });
}

/** A flat round thing standing upright (a screen on a pole, a clock): its middle [east, north, up], which way it looks (radians anticlockwise from east), and bands of stuff across it: [[from, until, stuff], …] in shares of its width (upright bands) or, with level set, of its height. Seen from both sides. */
export function disc(model, [east, north, up], radius, facing, bands, { level = false, sides = 20, thick = 0.25 } = {}) {
  const across = [-Math.sin(facing), Math.cos(facing)];
  const out = [Math.cos(facing), Math.sin(facing)];
  for (const way of [1, -1]) {
    for (const [from, until, stuff] of bands) {
      // The piece of the circle between two parallel lines.
      const points = [];
      const lo = -1 + 2 * from;
      const hi = -1 + 2 * until;
      const add = (x, y) => points.push([east + across[0] * x * radius * way + out[0] * (thick / 2) * way, north + across[1] * x * radius * way + out[1] * (thick / 2) * way, up + y * radius]);
      for (let i = 0; i <= sides; i += 1) {
        const angle = (i / sides) * TAU;
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        const along = level ? y : x;
        if (along < lo - 1e-9 || along > hi + 1e-9) {
          // (Where the circle leaves the band, the band's own edge takes over.)
          const clamped = Math.min(Math.max(along, lo), hi);
          const other = Math.sqrt(Math.max(1 - clamped * clamped, 0)) * Math.sign((level ? x : y) || 1);
          if (level) add(other, clamped);
          else add(clamped, other);
        } else add(x, y);
      }
      // (Corners that fall together are dropped.)
      const ring = points.filter((point, i) => i === 0 || Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1], point[2] - points[i - 1][2]) > 1e-4);
      if (ring.length >= 3) model.flat(ring, stuff, { out: [out[0] * way, out[1] * way, 0] });
    }
  }
}
