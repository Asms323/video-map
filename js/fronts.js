// Houses dressed as real houses look: each on its own plot, in its own measure,
// no two alike.
//
// The app lays out where each house of a street stands and how large it is
// (houses.js): a plot, and on it a main part with a wing or a room on its
// roof. Drawn in plain colours, that is a model of a house. Here each is
// dressed from a kit of fronts instead: pictures of houses of Riyadh taken
// straight on (see tools/fronts), each measured into the wall to the street
// with its gate, the face of the house over that wall, and a plain piece of
// its plaster or stone.
//
// A front is never stretched over a house. Its gate, its windows and its
// doors keep their true size; the plain stretches between them are laid as
// long as the house's own plot needs, one after another, every other one in
// mirror image so that no seam shows. The face of the house is set on the
// house's own wall at its own size, and plain wall of the same stuff fills
// what is left. So a wide house and a narrow one of the same front are two
// different houses, as they are in a street.
//
// Round the plot go its walls; on every part of the house a parapet with the
// roof's floor behind it; on the roof a stair house, a water tank and
// cooling units, each where this house has them. By night the wall catches
// the street lamps' light, the gate's lamps are lit, and some windows.
//
// Nothing here touches the browser: it turns houses into meshes that the
// scene draws with the kit's picture laid on them (see setProps in scene.js).

import { KIT } from './kit.js';

/** The picture all of it is drawn from: models/fronts.jpg. */
export const FRONTS_PICTURE = 'fronts';

const WALL_THICK = 0.22;
const PARAPET_METERS = 1.1; // a parapet stands so far over the roof's floor
const ROOF_OVER_METERS = 1.4; // and its top so far over what the house is on record as tall
const PROUD = 0.06; // a picture laid on a wall lies this far before it, a window's pane as far again
const SMALLEST_SCALE = 0.66; // a front made smaller than this to fit a house is not that front any more
const MOST_CORNERS = 65535;
/** Of a house's windows that can be lit, so many are on any night. */
const WINDOWS_LIT = 0.5;

/** A number from 0 up to 1 that is a house's own: a different one for each n, the same every time. */
export function chanceOf(id) {
  return (n) => {
    const value = Math.sin(Number(id) * 12.9898 + n * 78.233 + 0.37) * 43758.5453;
    return value - Math.floor(value);
  };
}

/**
 * Lay a strip of pieces along a length: the measured pieces of a wall, as
 * long as this house's own wall is.
 *
 * pieces: [[from, until, kind]] across the picture, in its spots; kind is
 * 'fixed' (a gate, a pier: it keeps its size), 'optional' (a window in the
 * wall: kept if there is room for it, else left out) or 'plain' (plain wall:
 * laid as long as need be). perMetre: spots of the picture to a metre.
 * width: the length to fill, in metres. flip: laid from the other end, in
 * mirror image.
 *
 * Returns the runs, in order from the start: [{ a0, a1: metres along; u0,
 * u1: where in the picture its two ends lie (u1 less than u0 for a piece in
 * mirror image); kind }]. They fill the length exactly. If the pieces that
 * keep their size are longer than the length, all are made narrower alike.
 */
export function layStrip(pieces, perMetre, width, flip = false) {
  const order = flip ? [...pieces].reverse().map(([from, until, kind]) => [until, from, kind]) : pieces;
  const natural = order.map(([from, until, kind]) => ({ from, until, kind, wide: Math.abs(until - from) / perMetre }));
  let needed = natural.filter((piece) => piece.kind === 'fixed').reduce((sum, piece) => sum + piece.wide, 0);
  // The windows in the wall, while there is room for one more and half a metre of plain wall beside it.
  for (const piece of natural) {
    if (piece.kind !== 'optional') continue;
    piece.kept = needed + piece.wide + 0.5 <= width;
    if (piece.kept) needed += piece.wide;
  }
  const kept = natural.filter((piece) => piece.kind !== 'optional' || piece.kept);
  const plain = kept.filter((piece) => piece.kind === 'plain').reduce((sum, piece) => sum + piece.wide, 0);
  // (With no plain piece to take up the rest, or too little room: everything wider or narrower alike.)
  const squeeze = plain > 0 ? Math.min(width / Math.max(needed, 1e-6), 1) : width / Math.max(needed, 1e-6);
  const room = Math.max(width - needed * squeeze, 0);
  const runs = [];
  let at = 0;
  for (const piece of kept) {
    if (piece.kind !== 'plain') {
      runs.push({ a0: at, a1: at + piece.wide * squeeze, u0: piece.from, u1: piece.until, kind: piece.kind });
      at += piece.wide * squeeze;
      continue;
    }
    // Plain wall: the piece again and again, every other time in mirror image, until its share is filled.
    const share = (room * piece.wide) / plain;
    let laid = 0;
    for (let n = 0; laid < share - 1e-6; n += 1) {
      const part = Math.min(piece.wide, share - laid);
      const reach = (piece.until - piece.from) * (part / piece.wide);
      const [u0, u1] = n % 2 === 0 ? [piece.from, piece.from + reach] : [piece.until, piece.until - reach];
      runs.push({ a0: at, a1: at + part, u0, u1, kind: 'plain' });
      at += part;
      laid += part;
    }
  }
  // (Sums of many small lengths: the last run ends where the length does.)
  if (runs.length > 0) runs[runs.length - 1].a1 = width;
  return runs;
}

/** How far a front's face of a house reaches across and up, in metres at its own size; and its box in the picture. */
export function faceMeasure(front) {
  const rects = front.house.rects;
  const box = [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))];
  return { box, wide: (box[2] - box[0]) / front.house.perMetre, tall: (box[3] - box[1]) / front.house.perMetre };
}

/** How wide the pieces of a front's wall are that keep their size, in metres. */
function fixedWide(front) {
  return front.wall.pieces.filter((piece) => piece[2] === 'fixed').reduce((sum, piece) => sum + (piece[1] - piece[0]) / front.wall.perMetre, 0);
}

/**
 * Which front a house is dressed in: one that fits it (its gate into the
 * plot's width, its face on to the house's own without being made much
 * smaller), and of those the one nearest the house's own paint, with a
 * little chance in it, so that a street is neither all one front nor a
 * patchwork.
 *
 * plotWide, faceWide, faceTall: the plot along the street, and the wall of
 * the house the face goes on, in metres. paint: '#rrggbb'. chance: the
 * house's own (see chanceOf). Returns its place in fronts.
 */
export function frontFor(plotWide, faceWide, faceTall, paint, chance, fronts = KIT.fronts) {
  const colour = typeof paint === 'string' && /^#[0-9a-f]{6}$/i.test(paint) ? [1, 3, 5].map((at) => Number.parseInt(paint.slice(at, at + 2), 16) / 255) : null;
  let best = 0;
  let least = Infinity;
  fronts.forEach((front, n) => {
    const face = faceMeasure(front);
    const fits = Math.min((faceWide * 0.98) / face.wide, Math.max(faceTall - front.wall.height, 1) / face.tall);
    // (One that must be made much smaller, or whose gate is wider than the plot, is the last to be taken.)
    const misfit = (fits < SMALLEST_SCALE ? 2 + (SMALLEST_SCALE - fits) : 0) + (fixedWide(front) > plotWide ? 2 : 0);
    const far = colour ? Math.hypot(colour[0] - front.tone[0], colour[1] - front.tone[1], colour[2] - front.tone[2]) : 0;
    // (Its own paint is laid over whichever it is given, so the colour only leans the choice: chance has the most say.)
    const score = misfit + 0.6 * far + 0.5 * chance(20 + n);
    if (score < least) {
      least = score;
      best = n;
    }
  });
  return best;
}

/** Meshes being filled: corners in the scene's metres, each with its place on the picture, its tint and how it shows by night. */
class Meshes {
  constructor() {
    this.done = [];
    this.open();
  }

  open() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.tints = [];
    this.indices = [];
  }

  close() {
    if (this.indices.length === 0) return;
    this.done.push({
      corners: this.positions.length / 3,
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: Float32Array.from(this.uvs),
      tints: Uint8Array.from(this.tints),
      indices: Uint16Array.from(this.indices),
    });
    this.open();
  }
}

/**
 * Dress houses, each from the kit: meshes the scene can draw whole, every
 * corner already in its place (see setProps in scene.js; the picture is
 * models/fronts.jpg).
 *
 * houses: as parcelHouses gives them (houses.js), each with its parts.
 * origin: { lng, lat }, what the scene is measured from. kit: the kit (see
 * kit.js).
 *
 * Returns [{ corners, positions, normals, uvs, tints, indices }], each of no
 * more corners than a mesh may have. A corner's tint is four numbers: the
 * three it is coloured by, halved; and how it shows by night: up to 127,
 * how much of the street lamps' light falls on it; from 128, a lamp or a lit
 * window, and how brightly it glows.
 */
export function dressInFronts(houses, origin, kit = KIT) {
  const meshes = new Meshes();
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * 111320;
  const [sizeU, sizeV] = kit.size;
  for (const house of houses) {
    if (!house.parts) continue;
    if (meshes.positions.length / 3 > MOST_CORNERS - 6000) meshes.close();
    dressOne(meshes, house, [(house.at[0] - origin.lng) * squeeze, (house.at[1] - origin.lat) * 111320], kit, sizeU, sizeV);
  }
  meshes.close();
  return meshes.done;
}

/** One house, into the meshes: see dressInFronts. at: its front left corner, in the scene's metres. */
function dressOne(meshes, house, at, kit, sizeU, sizeV) {
  const chance = chanceOf(house.id);
  const [ax, ay] = house.along;
  const [bx, by] = house.back;
  const plot = house.plot ?? { front: 0, left: 0, right: 0, behind: 0 };
  const [A0, A1, B0, B1] = [-plot.left, house.wide + plot.right, -plot.front, house.deep + plot.behind];
  // The part the front's face goes on: the main part's wall towards the street.
  const main = house.parts.find((part) => part.part === 'main') ?? house.parts[0];
  const mainTop = main.height + ROOF_OVER_METERS;
  const front = kit.fronts[frontFor(A1 - A0, main.a1 - main.a0, mainTop, house.paint, chance, kit.fronts)];
  const flip = chance(7) < 0.5;
  const walled = plot.front >= 0.8;
  const wallTall = front.wall.height;
  // Its own paint over the front's: but never so far from the front's own that its picture is washed out.
  const paint = typeof house.paint === 'string' && /^#[0-9a-f]{6}$/i.test(house.paint) ? [1, 3, 5].map((k) => Number.parseInt(house.paint.slice(k, k + 2), 16) / 255) : front.tone;
  const tint = paint.map((part, k) => Math.round(Math.min(Math.max(Math.min(Math.max(part / Math.max(front.tone[k], 0.05), 0.78), 1.3) / 2, 0), 1) * 255));
  const plainTint = [128, 128, 128];

  /** A flat face of four corners (along, back, up), told which way it looks; where each lies on the picture; its tint; how it shows by night (0: by the lamps' light). */
  const face = (corners, looks, across, tinted = tint, lamp = 0) => {
    const [p, q, r] = corners;
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    let normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const size = Math.hypot(...normal) || 1;
    normal = normal.map((part) => part / size);
    let order = [0, 1, 2, 3];
    if (normal[0] * looks[0] + normal[1] * looks[1] + normal[2] * looks[2] < 0) {
      order = [3, 2, 1, 0];
      normal = normal.map((part) => -part);
    }
    // By night: a lamp or a lit window glows; everything else catches the street lamps' light by how squarely
    // it is turned to the street, and what looks up catches the less of it.
    let night = lamp;
    if (lamp === 0) {
      const toStreet = -normal[1];
      const share = (toStreet >= 0 ? 0.3 + 0.7 * toStreet : 0.3 + 0.18 * toStreet) * (1 - 0.5 * Math.max(normal[2], 0));
      night = Math.round(Math.min(Math.max(share, 0), 1) * 127);
    }
    const first = meshes.positions.length / 3;
    for (const k of order) {
      const [a, b, z] = corners[k];
      meshes.positions.push(at[0] + ax * a + bx * b, at[1] + ay * a + by * b, z);
      meshes.normals.push(ax * normal[0] + bx * normal[1], ay * normal[0] + by * normal[1], normal[2]);
      meshes.uvs.push(across[k][0] / sizeU, across[k][1] / sizeV);
      meshes.tints.push(tinted[0], tinted[1], tinted[2], night);
    }
    meshes.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  /** An upright face from one place on the ground to another, between two heights, a box of the picture on it (its left at the first place). */
  const upright = (a0, b0, a1, b1, z0, z1, looks, box, tinted = tint, lamp = 0) => {
    face(
      [
        [a0, b0, z0],
        [a1, b1, z0],
        [a1, b1, z1],
        [a0, b0, z1],
      ],
      looks,
      [
        [box[0], box[3]],
        [box[2], box[3]],
        [box[2], box[1]],
        [box[0], box[1]],
      ],
      tinted,
      lamp,
    );
  };
  const level = (a0, b0, a1, b1, z, box, tinted = tint, looks = [0, 0, 1]) => {
    face(
      [
        [a0, b0, z],
        [a1, b0, z],
        [a1, b1, z],
        [a0, b1, z],
      ],
      looks,
      [
        [box[0], box[3]],
        [box[2], box[3]],
        [box[2], box[1]],
        [box[0], box[1]],
      ],
      tinted,
    );
  };
  // Plain wall of the front's own stuff: its plain piece, laid again and again both ways, every other time in
  // mirror image. (coarse: on walls that are seen less, each piece twice the size: fewer of them.)
  const plainBox = front.house.plain;
  const plainWall = (a0, b0, a1, b1, z0, z1, looks, coarse = 1) => {
    const perMetre = front.house.plainPerMetre / coarse;
    const length = Math.hypot(a1 - a0, b1 - b0);
    if (length < 0.02 || z1 - z0 < 0.02) return;
    const across = layStrip([[plainBox[0], plainBox[2], 'plain']], perMetre, length);
    const up = layStrip([[plainBox[3], plainBox[1], 'plain']], perMetre, z1 - z0);
    for (const run of across) {
      for (const rise of up) {
        const [s0, s1] = [run.a0 / length, run.a1 / length];
        upright(a0 + (a1 - a0) * s0, b0 + (b1 - b0) * s0, a0 + (a1 - a0) * s1, b0 + (b1 - b0) * s1, z0 + rise.a0, z0 + rise.a1, looks, [run.u0, rise.u1, run.u1, rise.u0]);
      }
    }
  };
  const middleOf = (box) => [(box[0] + box[2]) / 2 - 2, (box[1] + box[3]) / 2 - 2, (box[0] + box[2]) / 2 + 2, (box[1] + box[3]) / 2 + 2];
  const coping = middleOf(plainBox);
  const S = [0, -1, 0];
  const N = [0, 1, 0];
  const E = [1, 0, 0];
  const W = [-1, 0, 0];
  const T = WALL_THICK;

  // The wall's strip of the front, along a length at the street side of something: gate, windows and plain wall.
  const wallStrip = (a0, a1, b, z0) => {
    const runs = layStrip(front.wall.pieces, front.wall.perMetre, a1 - a0, flip);
    const [v0, v1] = front.wall.v;
    for (const run of runs) upright(a0 + run.a0, b, a0 + run.a1, b, z0, z0 + wallTall, S, [run.u0, v0, run.u1, v1]);
    // Its lamps: where the piece each is on came to lie.
    for (const lamp of front.wall.lamps) {
      const middle = (lamp[0] + lamp[2]) / 2;
      const run = runs.find((one) => one.kind !== 'plain' && middle >= Math.min(one.u0, one.u1) && middle <= Math.max(one.u0, one.u1));
      if (!run) continue;
      const where = (u) => a0 + run.a0 + ((u - run.u0) / (run.u1 - run.u0)) * (run.a1 - run.a0);
      const high = (v) => z0 + ((v1 - v) / (v1 - v0)) * wallTall;
      const [l0, l1] = [where(lamp[0]), where(lamp[2])].sort((p, q) => p - q);
      upright(l0, b - PROUD, l1, b - PROUD, high(lamp[3]), high(lamp[1]), S, flip ? [lamp[2], lamp[1], lamp[0], lamp[3]] : lamp, plainTint, 255);
    }
  };

  // Round the plot: the wall to the street, with the front's gate in it; the walls to the neighbours (their
  // outer side only where no neighbour's wall stands back to back with them); the yard's paving.
  const sideTall = Math.min(wallTall, 3);
  if (walled) {
    wallStrip(A0, A1, B0, 0);
    level(A0, B0, A1, B0 + T, wallTall, coping);
    plainWall(A1, B0 + T, A0, B0 + T, 0, wallTall, N, 2);
  }
  if (plot.left >= 0.6) {
    if (house.ends?.[0]) plainWall(A0, B1, A0, B0, 0, sideTall, W, 2);
    plainWall(A0 + T, B0, A0 + T, B1, 0, sideTall, E, 2);
    level(A0, B0, A0 + T, B1, sideTall, coping);
  }
  if (plot.right >= 0.6) {
    if (house.ends?.[1]) plainWall(A1, B0, A1, B1, 0, sideTall, E, 2);
    plainWall(A1 - T, B1, A1 - T, B0, 0, sideTall, W, 2);
    level(A1 - T, B0, A1, B1, sideTall, coping);
  }
  if (plot.behind >= 0.6) {
    if (house.rows !== 2) plainWall(A1, B1, A0, B1, 0, sideTall, N, 2);
    plainWall(A0, B1 - T, A1, B1 - T, 0, sideTall, S, 2);
    level(A0, B1 - T, A1, B1, sideTall, coping);
  }
  if (plot.front + plot.left + plot.right + plot.behind > 0.5) level(A0, B0, A1, B1, 0.05, kit.stuff.paving, plainTint);

  // The parts of the house: walls of the front's plain stuff, a parapet with the roof's floor behind it.
  const room = house.parts.find((part) => part.part === 'room');
  for (const part of house.parts) {
    const isRoom = part.part === 'room';
    const foot = isRoom ? main.height + ROOF_OVER_METERS - PARAPET_METERS : 0;
    const top = part.height + (isRoom ? 0.3 : ROOF_OVER_METERS);
    const { a0, a1, b0, b1 } = part;
    // (A wall that stands against another part of the house is not seen: left out.)
    const against = (side) =>
      house.parts.some((other) => {
        if (other === part || other.part === 'room' || other.height < part.height - 0.5) return false;
        if (side === 'front') return Math.abs(other.b1 - b0) < 0.05 && other.a0 <= a0 + 0.05 && other.a1 >= a1 - 0.05;
        if (side === 'back') return Math.abs(other.b0 - b1) < 0.05 && other.a0 <= a0 + 0.05 && other.a1 >= a1 - 0.05;
        if (side === 'left') return Math.abs(other.a1 - a0) < 0.05 && other.b0 <= b0 + 0.05 && other.b1 >= b1 - 0.05;
        return Math.abs(other.a0 - a1) < 0.05 && other.b0 <= b0 + 0.05 && other.b1 >= b1 - 0.05;
      });
    if (!against('front')) plainWall(a0, b0, a1, b0, foot, top, S, part === main ? 1 : 2);
    if (!against('back')) plainWall(a1, b1, a0, b1, foot, top, N, 2);
    if (!against('left')) plainWall(a0, b1, a0, b0, foot, top, W, 2);
    if (!against('right')) plainWall(a1, b0, a1, b1, foot, top, E, 2);
    if (isRoom) {
      level(a0, b0, a1, b1, top, coping);
      continue;
    }
    const floor = top - PARAPET_METERS;
    level(a0, b0, a1, b0 + T, top, coping);
    level(a0, b1 - T, a1, b1, top, coping);
    level(a0, b0 + T, a0 + T, b1 - T, top, coping);
    level(a1 - T, b0 + T, a1, b1 - T, top, coping);
    upright(a1 - T, b0 + T, a0 + T, b0 + T, floor, top, N, coping);
    upright(a0 + T, b1 - T, a1 - T, b1 - T, floor, top, S, coping);
    upright(a0 + T, b0 + T, a0 + T, b1 - T, floor, top, E, coping);
    upright(a1 - T, b1 - T, a1 - T, b0 + T, floor, top, W, coping);
    level(a0 + T, b0 + T, a1 - T, b1 - T, floor, kit.stuff.floor, plainTint);
  }

  // The face of the house, on the main part's wall towards the street: the front's own, at the size that
  // brings its foot to the top of the street wall and its top to the house's own, or smaller if the house is
  // narrower than it; where there is no street wall, the wall's strip with its gate is the foot of the house.
  const measure = faceMeasure(front);
  const faceWide = main.a1 - main.a0;
  if (!walled) wallStrip(main.a0, main.a1, main.b0 - PROUD, 0);
  const scale = Math.min(Math.max((mainTop - wallTall) / measure.tall, SMALLEST_SCALE), 1.3, (faceWide * 0.98) / measure.wide);
  const left = main.a0 + (faceWide - measure.wide * scale) * (0.25 + 0.5 * chance(8));
  const perMetre = front.house.perMetre / scale;
  // (flip: the face in mirror image about its own middle.)
  const along = (u) => {
    const a = left + (u - measure.box[0]) / perMetre;
    return flip ? 2 * left + measure.wide * scale - a : a;
  };
  const high = (v) => mainTop - (v - measure.box[1]) / perMetre;
  const laid = (box, proud, tinted, lamp) => {
    const [l, r] = flip ? [along(box[2]), along(box[0])] : [along(box[0]), along(box[2])];
    const z0 = Math.max(high(box[3]), 0);
    if (high(box[1]) - z0 < 0.02) return;
    // (A piece that would reach under the ground is cut off there.)
    const foot = box[1] + (box[3] - box[1]) * ((high(box[1]) - z0) / (high(box[1]) - high(box[3])));
    upright(l, main.b0 - proud, r, main.b0 - proud, z0, high(box[1]), S, flip ? [box[2], box[1], box[0], foot] : [box[0], box[1], box[2], foot], tinted, lamp);
  };
  for (const rect of front.house.rects) laid(rect, PROUD, tint, 0);
  // Its windows: each a pane of its own before the face, lit on some houses by night and dark on others.
  front.house.panes.forEach((pane, n) => laid(pane, PROUD * 2, tint, chance(40 + n) < WINDOWS_LIT ? 230 : 0));

  // Windows in the other walls of the house: one of the front's own windows, at its own size, every few metres
  // along the upper floor of every wall that stands free (and along the wing's one floor), some of them left
  // out; lit on some houses by night.
  const windows = front.house.panes;
  if (windows.length > 0) {
    const sticker = (a0, b0, a1, b1, looks, low, tall, key) => {
      const length = Math.hypot(a1 - a0, b1 - b0);
      const count = Math.floor(length / 3.6);
      for (let n = 0; n < count; n += 1) {
        if (chance(60 + key * 9 + n) < 0.22) continue;
        const pane = windows[Math.floor(chance(70 + key * 9 + n) * windows.length)];
        // (With a margin of the wall round it, as the picture has it: its frame, its sill, its arch.)
        const box = [pane[0] - 5, pane[1] - 5, pane[2] + 5, pane[3] + 5];
        const wide = (box[2] - box[0]) / front.house.perMetre;
        const high = Math.min((box[3] - box[1]) / front.house.perMetre, tall - 0.5);
        const middle = ((n + 0.5) / count) * length;
        const [s0, s1] = [(middle - wide / 2) / length, (middle + wide / 2) / length];
        const out = [looks[0] * PROUD, looks[1] * PROUD];
        const z0 = low + (tall - high) * 0.5;
        upright(a0 + (a1 - a0) * s0 + out[0], b0 + (b1 - b0) * s0 + out[1], a0 + (a1 - a0) * s1 + out[0], b0 + (b1 - b0) * s1 + out[1], z0, z0 + high, looks, box, tint, chance(80 + key * 9 + n) < WINDOWS_LIT * 0.7 ? 230 : 0);
      }
    };
    house.parts.forEach((part, k) => {
      if (part.part === 'room') return;
      const { a0, a1, b0, b1 } = part;
      // (The upper floor of a part of two storeys; the one floor of a low one.)
      const [low, tall] = part.height > 6 ? [part.height * 0.52, part.height * 0.42] : [0.9, part.height - 1.2];
      const free = (side) => !house.parts.some((other) => other !== part && other.part !== 'room' && (side === 'back' ? Math.abs(other.b0 - b1) < 0.05 : side === 'left' ? Math.abs(other.a1 - a0) < 0.05 : side === 'right' ? Math.abs(other.a0 - a1) < 0.05 : Math.abs(other.b1 - b0) < 0.05));
      if (free('back')) sticker(a1, b1, a0, b1, N, low, tall, k * 4);
      if (free('left')) sticker(a0, b1, a0, b0, W, low, tall, k * 4 + 1);
      if (free('right')) sticker(a1, b0, a1, b1, E, low, tall, k * 4 + 2);
      // (The street side of a part that does not carry the front's own face.)
      if (part !== main && free('front')) sticker(a0, b0, a1, b0, S, low, tall, k * 4 + 3);
    });
  }

  // On the roof: a stair house where the house has no room up there, a water tank on whichever it has, and
  // cooling units by the parapet.
  const roofFloor = mainTop - PARAPET_METERS;
  const inner = [main.a0 + T + 0.4, main.a1 - T - 0.4, main.b0 + T + 0.4, main.b1 - T - 0.4];
  const stuffBox = (a0, b0, a1, b1, z0, z1, sides, top, tinted) => {
    upright(a0, b0, a1, b0, z0, z1, S, sides, tinted);
    upright(a1, b0, a1, b1, z0, z1, E, sides, tinted);
    upright(a1, b1, a0, b1, z0, z1, N, sides, tinted);
    upright(a0, b1, a0, b0, z0, z1, W, sides, tinted);
    level(a0, b0, a1, b1, z1, top, tinted);
  };
  let tankOn = null;
  if (room) tankOn = [(room.a0 + room.a1) / 2, (room.b0 + room.b1) / 2, room.height + 0.3];
  else if (inner[1] - inner[0] > 4.5 && inner[3] - inner[2] > 5.5) {
    const wide = Math.min(3.2 + 1.2 * chance(9), inner[1] - inner[0] - 1);
    const deep = Math.min(3.6 + 1.4 * chance(10), (inner[3] - inner[2]) * 0.6);
    const a0 = inner[0] + (inner[1] - inner[0] - wide) * chance(11);
    const b0 = inner[2] + (inner[3] - inner[2] - deep) * (0.45 + 0.55 * chance(12));
    stuffBox(a0, b0, a0 + wide, b0 + deep, roofFloor, roofFloor + 2.9, coping, coping, tint);
    upright(a0 + wide * 0.35, b0 - 0.04, a0 + wide * 0.35 + 0.9, b0 - 0.04, roofFloor + 0.05, roofFloor + 2.1, S, kit.stuff.dark, plainTint);
    tankOn = [a0 + wide / 2, b0 + deep / 2, roofFloor + 2.9];
  }
  if (tankOn) {
    const [ta, tb, tz] = tankOn;
    const radius = 0.6 + 0.15 * chance(13);
    const ring = Array.from({ length: 8 }, (_, k) => [ta + radius * Math.cos((k * Math.PI) / 4), tb + radius * Math.sin((k * Math.PI) / 4)]);
    const white = kit.stuff.white;
    for (let k = 0; k < 8; k += 1) {
      const [p, q] = [ring[k], ring[(k + 1) % 8]];
      upright(p[0], p[1], q[0], q[1], tz, tz + 1.25, [(p[0] + q[0]) / 2 - ta, (p[1] + q[1]) / 2 - tb, 0], white, plainTint);
    }
    const centre = middleOf(white);
    for (let k = 1; k < 7; k += 2) {
      face(
        [
          [ring[0][0], ring[0][1], tz + 1.25],
          [ring[k][0], ring[k][1], tz + 1.25],
          [ring[k + 1][0], ring[k + 1][1], tz + 1.25],
          [ring[(k + 2) % 8][0], ring[(k + 2) % 8][1], tz + 1.25],
        ],
        [0, 0, 1],
        [
          [centre[0], centre[1]],
          [centre[2], centre[1]],
          [centre[2], centre[3]],
          [centre[0], centre[3]],
        ],
        plainTint,
      );
    }
  }
  const units = 1 + Math.floor(chance(14) * 3);
  for (let n = 0; n < units && inner[1] - inner[0] > 3; n += 1) {
    const a0 = inner[0] + (inner[1] - inner[0] - 1) * chance(15 + n);
    const b0 = chance(18 + n) < 0.5 ? inner[2] - 0.2 : inner[3] - 0.25;
    const z0 = roofFloor;
    upright(a0, b0, a0 + 0.95, b0, z0, z0 + 0.7, S, kit.stuff.unit, plainTint);
    upright(a0 + 0.95, b0, a0 + 0.95, b0 + 0.36, z0, z0 + 0.7, E, kit.stuff.white, plainTint);
    upright(a0 + 0.95, b0 + 0.36, a0, b0 + 0.36, z0, z0 + 0.7, N, kit.stuff.white, plainTint);
    upright(a0, b0 + 0.36, a0, b0, z0, z0 + 0.7, W, kit.stuff.white, plainTint);
    level(a0, b0, a0 + 0.95, b0 + 0.36, z0 + 0.7, kit.stuff.white, plainTint);
  }
}
