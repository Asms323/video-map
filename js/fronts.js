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
const WIDER_AT_MOST = 1.125; // a face may be drawn out this much across a house a little wider than it
const BESIDE_FACE_METERS = 2.6; // plain wall this long beside a face is given a window of its own
const NEIGHBOUR_METERS = 17; // from the middle of one house's front to the next one's, about
const MOST_CORNERS = 65535;
/** Of a house's windows that can be lit, so many are on any night. */
const WINDOWS_LIT = 0.5;

/**
 * A number from 0 up to 1 that is a house's own: a different one for each n,
 * the same every time. id: a number, or any name (a name is turned into a
 * number of its own first).
 */
export function chanceOf(id) {
  let seed = Number(id);
  if (!Number.isFinite(seed)) {
    seed = 7;
    for (const letter of String(id)) seed = (seed * 31 + letter.codePointAt(0)) % 1000003;
  }
  return (n) => {
    const value = Math.sin(seed * 12.9898 + n * 78.233 + 0.37) * 43758.5453;
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

/**
 * How far a front's face of a house reaches across and up, in metres at its
 * own size; its box in the picture; and top: where in the picture the top
 * of the house's wall is (the top of the box; under a crest of battlements,
 * the row they stand on: they rise over the wall's top, and are not counted
 * in how tall the face is).
 */
export function faceMeasure(front) {
  const rects = front.house.rects;
  const box = [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))];
  const top = front.house.crest ? front.house.crest.v : box[1];
  return { box, top, wide: (box[2] - box[0]) / front.house.perMetre, tall: (box[3] - top) / front.house.perMetre };
}

/** How wide the pieces of a front's wall are that keep their size, in metres. */
function fixedWide(front) {
  return front.wall.pieces.filter((piece) => piece[2] === 'fixed').reduce((sum, piece) => sum + (piece[1] - piece[0]) / front.wall.perMetre, 0);
}

/**
 * Which front a house is dressed in: one that fits it (its gate into the
 * plot's width, its face on to the house's own without being made much
 * smaller), and of those mostly one made for the house's own style and
 * near its own paint, with chance in it, so that a street is neither all
 * one front nor a patchwork, and a district of new houses does not look
 * like one of old ones.
 *
 * plotWide, faceWide, faceTall: the plot along the street, and the wall of
 * the house the face goes on, in metres. paint: '#rrggbb'. chance: the
 * house's own (see chanceOf). style: the house's (see HOUSE_STYLES in
 * houses.js), if it has one. Returns its place in fronts.
 */
export function frontFor(plotWide, faceWide, faceTall, paint, chance, fronts = KIT.fronts, style = undefined) {
  const colour = typeof paint === 'string' && /^#[0-9a-f]{6}$/i.test(paint) ? [1, 3, 5].map((at) => Number.parseInt(paint.slice(at, at + 2), 16) / 255) : null;
  // How well each fits: how small its face must be made for the house, and whether its gate goes into the plot.
  const fits = fronts.map((front) => {
    const face = faceMeasure(front);
    return Math.min((faceWide * 0.98) / face.wide, Math.max(faceTall - front.wall.height, 1) / face.tall) - (fixedWide(front) > plotWide ? 1 : 0);
  });
  // Of those that fit, each has its share of the houses: a full one if it is made for the house's style, a
  // small one if not; the larger the nearer its own colour is to the house's paint (the paint is laid over
  // whichever front is taken, so this only leans the choice); the smaller the rarer such a house is.
  const shares = fronts.map((front, n) => {
    if (fits[n] < SMALLEST_SCALE) return 0;
    const far = colour ? Math.hypot(colour[0] - front.tone[0], colour[1] - front.tone[1], colour[2] - front.tone[2]) : 0;
    const own = !style || !(front.styles?.length > 0) || front.styles.includes(style) ? 1 : 0.08;
    return own * Math.exp(-far / 0.45) * (1 - (front.rare ?? 0));
  });
  const all = shares.reduce((sum, share) => sum + share, 0);
  // (None fits: the one that fits best.)
  if (!(all > 0)) return fits.indexOf(Math.max(...fits));
  let left = chance(20) * all;
  let last = 0;
  for (let n = 0; n < shares.length; n += 1) {
    if (shares[n] <= 0) continue;
    last = n;
    left -= shares[n];
    if (left < 0) return n;
  }
  return last;
}

/**
 * A house's own outline, where the map has the house whole: its corners in
 * the house's own measure (along its front, back from it), anticlockwise
 * seen from above, no corner twice. null if it has none worth the name.
 */
export function outlineOf(house) {
  if (!Array.isArray(house.ring) || house.ring.length < 3) return null;
  const ring = [];
  for (const [a, b] of house.ring) {
    const last = ring[ring.length - 1];
    if (!last || Math.hypot(a - last[0], b - last[1]) > 0.05) ring.push([a, b]);
  }
  if (ring.length > 1 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) <= 0.05) ring.pop();
  if (ring.length < 3) return null;
  let twice = 0;
  ring.forEach((corner, n) => {
    const next = ring[(n + 1) % ring.length];
    twice += corner[0] * next[1] - next[0] * corner[1];
  });
  if (Math.abs(twice) < 2) return null;
  return twice < 0 ? ring.reverse() : ring;
}

/** The walls of an outline, in order: each { p, q: its two ends, its left one first as seen from outside; length; out: the way it looks }. */
function wallsOf(ring) {
  return ring.map((p, n) => {
    const q = ring[(n + 1) % ring.length];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-9;
    return { p, q, length, out: [(q[1] - p[1]) / length, -(q[0] - p[0]) / length] };
  });
}

/** An outline drawn in by so much on every side (its corners kept sharp; a very sharp one is cut short). */
function drawnIn(ring, by) {
  const walls = wallsOf(ring);
  return ring.map((corner, n) => {
    const [before, after] = [walls[(n + ring.length - 1) % ring.length].out, walls[n].out];
    const open = 1 + before[0] * after[0] + before[1] * after[1];
    if (open < 0.25) return [corner[0] - after[0] * by, corner[1] - after[1] * by];
    return [corner[0] - ((before[0] + after[0]) * by) / open, corner[1] - ((before[1] + after[1]) * by) / open];
  });
}

/** Whether a place lies inside an outline. */
function within(ring, a, b) {
  let inside = false;
  for (let n = 0, m = ring.length - 1; n < ring.length; m = n, n += 1) {
    const [p, q] = [ring[n], ring[m]];
    if (p[1] > b !== q[1] > b && a < ((q[0] - p[0]) * (b - p[1])) / (q[1] - p[1]) + p[0]) inside = !inside;
  }
  return inside;
}

/** An anticlockwise outline cut into triangles (each three places in the ring), an ear at a time. */
export function trianglesOf(ring) {
  const left = ring.map((_, n) => n);
  const out = [];
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let guard = 0; left.length > 3 && guard < 2000; guard += 1) {
    let cut = false;
    for (let k = 0; k < left.length && !cut; k += 1) {
      const [i0, i1, i2] = [left[(k + left.length - 1) % left.length], left[k], left[(k + 1) % left.length]];
      const [a, b, c] = [ring[i0], ring[i1], ring[i2]];
      const bend = turn(a, b, c);
      // (A corner on a straight stretch is no corner: let go. One that bends inwards is no ear.)
      if (Math.abs(bend) <= 1e-9) {
        left.splice(k, 1);
        cut = true;
      } else if (bend > 0 && !left.some((j) => j !== i0 && j !== i1 && j !== i2 && turn(a, b, ring[j]) >= -1e-9 && turn(b, c, ring[j]) >= -1e-9 && turn(c, a, ring[j]) >= -1e-9)) {
        out.push([i0, i1, i2]);
        left.splice(k, 1);
        cut = true;
      }
    }
    // (An outline that crosses itself has no ear left: what remains is fanned out, as well as may be.)
    if (!cut) break;
  }
  for (let k = 1; k + 1 < left.length; k += 1) out.push([left[0], left[k], left[k + 1]]);
  return out;
}

/**
 * The wall of a house that its front's face goes on: { p: its left end as
 * seen from the street; along: the way it runs from there; length; looks:
 * the way it looks; top: how high the house's wall stands, parapet and all }.
 *
 * Of a house the app has laid out in parts: the main part's wall towards
 * the street. Of one the map has whole (its own outline: see outlineOf):
 * the longest of its walls that are turned to the street (to within some
 * thirty degrees), or failing one, the wall most turned to it for its
 * length; with ring and walls, its outline, and wall: which of them it is.
 * null for a house that has neither parts nor an outline.
 */
export function frontageOf(house) {
  if (house.parts) {
    const main = house.parts.find((part) => part.part === 'main') ?? house.parts[0];
    return { p: [main.a0, main.b0], along: [1, 0], length: main.a1 - main.a0, looks: [0, -1, 0], top: main.height + ROOF_OVER_METERS };
  }
  const ring = outlineOf(house);
  if (!ring) return null;
  const walls = wallsOf(ring);
  let wall = 0;
  let most = -Infinity;
  walls.forEach((one, n) => {
    const toStreet = -one.out[1];
    const worth = toStreet > 0.85 ? 1000 + one.length : toStreet * one.length;
    if (worth > most) [most, wall] = [worth, n];
  });
  const { p, q, length, out } = walls[wall];
  return { p, along: [(q[0] - p[0]) / length, (q[1] - p[1]) / length], length, looks: [out[0], out[1], 0], top: (house.height ?? 8.2) + ROOF_OVER_METERS, ring, walls, wall };
}

/**
 * Which front one house is dressed in: its place in the kit's fronts. By
 * chance, but not the house's own alone: by where it stands along its
 * street, so that the draws of two neighbours lie as far apart as can be
 * (by the golden section, for houses some seventeen metres from one to the
 * next), and two houses side by side are seldom given the same front. Each
 * side of each street has its own run of draws.
 */
export function frontOfHouse(house, kit = KIT, frontage = frontageOf(house)) {
  const chance = chanceOf(house.id);
  const plot = house.plot ?? { front: 0, left: 0, right: 0, behind: 0 };
  // Where the middle of its front lies, in metres along its street and across it. (East is measured as at a
  // whole degree of latitude: the same for every house of a street.)
  const squeeze = Math.cos((Math.round(house.at[1]) * Math.PI) / 180) * 111320;
  const middle = [house.at[0] * squeeze + (house.along[0] * house.wide) / 2, house.at[1] * 111320 + (house.along[1] * house.wide) / 2];
  const far = middle[0] * house.along[0] + middle[1] * house.along[1];
  const side = Math.round((middle[0] * house.back[0] + middle[1] * house.back[1]) / 25);
  const run = (far / NEIGHBOUR_METERS) * 0.6180339887 + chanceOf(side)(20);
  const drawn = Number.isFinite(run) ? run - Math.floor(run) : chance(20);
  return frontFor(house.wide + plot.left + plot.right, frontage.length, frontage.top, house.paint, (n) => (n === 20 ? drawn : chance(n)), kit.fronts, house.style);
}

/**
 * What a front's picture is coloured by to bring it towards a house's own
 * paint: three numbers, each half of what the picture's colour is multiplied
 * by, as a byte (128: left as it is).
 *
 * The paint is laid over the front, but never so far from the front's own
 * colour that its picture is washed out or burnt: no part is made darker
 * than 0.78 of itself or lighter than 1.3. Where the paint asks for more,
 * all three parts are held back alike, so that the colour still leans the
 * way of the paint (held back each on its own, a tan paint over a white
 * front came out pink).
 */
export function tintOf(paint, tone) {
  if (!(typeof paint === 'string' && /^#[0-9a-f]{6}$/i.test(paint))) return [128, 128, 128];
  const asked = [1, 3, 5].map((k, n) => Number.parseInt(paint.slice(k, k + 2), 16) / 255 / Math.max(tone[n], 0.05) - 1);
  const held = Math.min(1, ...asked.map((by) => (by < -0.22 ? -0.22 / by : by > 0.3 ? 0.3 / by : 1)));
  return asked.map((by) => Math.round(((1 + by * held) / 2) * 255));
}

/**
 * What the roofs' floor is coloured by to bring it to a house's own roof
 * colour: three numbers as tintOf gives them. colour: [red, green, blue] up
 * to 255, or nothing if the roof's colour is not known; floorTone: the
 * colour of the kit's floor. A roof is never made darker than 0.55 of the
 * kit's floor or lighter than 1.25 of it.
 */
export function roofTintOf(colour, floorTone = [0.8, 0.8, 0.8]) {
  if (!Array.isArray(colour) || colour.length < 3 || !colour.every((part) => Number.isFinite(part))) return [128, 128, 128];
  return colour.slice(0, 3).map((part, n) => Math.round((Math.min(Math.max(part / 255 / Math.max(floorTone[n], 0.05), 0.55), 1.25) / 2) * 255));
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
 * houses: as parcelHouses gives them (houses.js): each with its parts, if
 * the app has laid it out, or with its own outline (ring) and height, if
 * the map has the house whole. origin: { lng, lat }, what the scene is
 * measured from. kit: the kit (see kit.js).
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
    const frontage = frontageOf(house);
    if (!frontage) continue;
    if (meshes.positions.length / 3 > MOST_CORNERS - 8000) meshes.close();
    dressOne(meshes, house, [(house.at[0] - origin.lng) * squeeze, (house.at[1] - origin.lat) * 111320], kit, sizeU, sizeV, frontage);
  }
  meshes.close();
  return meshes.done;
}

/** One house, into the meshes: see dressInFronts. at: its front left corner, in the scene's metres. frontage: the wall its face goes on (see frontageOf). */
function dressOne(meshes, house, at, kit, sizeU, sizeV, frontage) {
  const chance = chanceOf(house.id);
  const [ax, ay] = house.along;
  const [bx, by] = house.back;
  const plot = house.plot ?? { front: 0, left: 0, right: 0, behind: 0 };
  const [A0, A1, B0, B1] = [-plot.left, house.wide + plot.right, -plot.front, house.deep + plot.behind];
  // The part the front's face goes on: the main part's wall towards the street (of a house the map has whole:
  // the wall of its outline that is turned to the street).
  const main = house.parts ? (house.parts.find((part) => part.part === 'main') ?? house.parts[0]) : null;
  const mainTop = frontage.top;
  const front = kit.fronts[frontOfHouse(house, kit, frontage)];
  const flip = chance(7) < 0.5;
  const walled = plot.front >= 0.8;
  const wallTall = front.wall.height;
  const tint = tintOf(house.paint, front.tone);
  const plainTint = [128, 128, 128];
  // The roof's floor: in the house's own roof colour, where that is known (as the photograph from above shows
  // it: see map.js), else as the kit has it.
  const roofTint = roofTintOf(house.roof, kit.floorTone);

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
  /** The four corners of a box of the picture, for a face whose corners go round from its lower left. */
  const cornersOf = (box) => [
    [box[0], box[3]],
    [box[2], box[3]],
    [box[2], box[1]],
    [box[0], box[1]],
  ];
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
      cornersOf(box),
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
      cornersOf(box),
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
  /** A place on the wall the face goes on: so far along it from its left end, and so far out before it. */
  const onFront = (far, out = 0) => [frontage.p[0] + frontage.along[0] * far + frontage.looks[0] * out, frontage.p[1] + frontage.along[1] * far + frontage.looks[1] * out];

  // The wall's strip of the front, along a length that looks one way: gate, windows and plain wall. from: its
  // left end as seen from where it looks; run: the way it runs from there.
  const wallStrip = (from, run, length, looks, z0) => {
    const runs = layStrip(front.wall.pieces, front.wall.perMetre, length, flip);
    const [v0, v1] = front.wall.v;
    const spot = (far, out = 0) => [from[0] + run[0] * far + looks[0] * out, from[1] + run[1] * far + looks[1] * out];
    for (const one of runs) {
      const [l, r] = [spot(one.a0), spot(one.a1)];
      upright(l[0], l[1], r[0], r[1], z0, z0 + wallTall, looks, [one.u0, v0, one.u1, v1]);
    }
    // Its lamps: wherever the piece each is on came to lie (a lamp on a plain piece, every time that piece is
    // laid with the lamp whole on it).
    const high = (v) => z0 + ((v1 - v) / (v1 - v0)) * wallTall;
    for (const lamp of front.wall.lamps) {
      for (const one of runs) {
        if (lamp[0] < Math.min(one.u0, one.u1) || lamp[2] > Math.max(one.u0, one.u1)) continue;
        const where = (u) => one.a0 + ((u - one.u0) / (one.u1 - one.u0)) * (one.a1 - one.a0);
        const [l0, l1] = [where(lamp[0]), where(lamp[2])].sort((p, q) => p - q);
        const [l, r] = [spot(l0, PROUD), spot(l1, PROUD)];
        // (On a piece laid in mirror image, the lamp in mirror image too.)
        upright(l[0], l[1], r[0], r[1], high(lamp[3]), high(lamp[1]), looks, one.u1 < one.u0 ? [lamp[2], lamp[1], lamp[0], lamp[3]] : lamp, plainTint, 255);
      }
    }
  };

  // Round the plot: the wall to the street, with the front's gate in it; the walls to the neighbours (their
  // outer side only where no neighbour's wall stands back to back with them); the yard's paving.
  const sideTall = Math.min(wallTall, 3);
  if (walled) {
    wallStrip([A0, B0], [1, 0], A1 - A0, S, 0);
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

  // The face of the house, on its wall towards the street: the front's own, at the size that brings its foot
  // to the top of the street wall and its top to the house's own, or smaller if the house is narrower than it.
  // (It is laid further down, when the walls stand.)
  const measure = faceMeasure(front);
  const faceWide = frontage.length;
  const scale = Math.min(Math.max((mainTop - wallTall) / measure.tall, SMALLEST_SCALE), 1.3, (faceWide * 0.98) / measure.wide);
  // (A house only a little wider than the face: the face is drawn out across it, by no more than an eighth.)
  const drawnOut = (faceWide * 0.98) / (measure.wide * scale);
  const across = drawnOut <= WIDER_AT_MOST ? Math.max(drawnOut, 1) : 1;
  const faceSpan = measure.wide * scale * across;
  // (Where along its wall the face begins.)
  const faceFrom = (faceWide - faceSpan) * (0.25 + 0.5 * chance(8));
  const perMetre = front.house.perMetre / scale;
  // A crest of battlements, on a front that has one: its merlons one after another along the top of a wall, as
  // large as the face's own (which stand where the face is).
  const crest = front.house.crest;
  const merlons = (a0, b0, a1, b1, z, looks) => {
    const length = Math.hypot(a1 - a0, b1 - b0);
    const every = crest.every / perMetre;
    const count = Math.floor(length / every);
    const [first] = crest.rects;
    const lead = (length - count * every) / 2 + (every - (first[2] - first[0]) / perMetre) / 2;
    for (let n = 0; n < count; n += 1) {
      for (const rect of crest.rects) {
        const [s0, s1] = [(lead + n * every + (rect[0] - first[0]) / perMetre) / length, (lead + n * every + (rect[2] - first[0]) / perMetre) / length];
        upright(a0 + (a1 - a0) * s0, b0 + (b1 - b0) * s0, a0 + (a1 - a0) * s1, b0 + (b1 - b0) * s1, z + (crest.v - rect[3]) / perMetre, z + (crest.v - rect[1]) / perMetre, looks, rect);
      }
    }
  };
  /** The same along the wall the face goes on, on either side of the face. */
  const merlonsBeside = (z) => {
    const [l0, l1, r0, r1] = [onFront(0), onFront(faceFrom), onFront(faceFrom + faceSpan), onFront(faceWide)];
    if (faceFrom > 0.5) merlons(l0[0], l0[1], l1[0], l1[1], z, frontage.looks);
    if (faceWide - (faceFrom + faceSpan) > 0.5) merlons(r0[0], r0[1], r1[0], r1[1], z, frontage.looks);
  };

  // Windows in the walls that do not carry the face: one of the front's own windows, at its own size, every
  // few metres along the upper floor of a wall (and along the one floor of a low part), some of them left out;
  // lit on some houses by night (but never one whose shutters are closed in the picture).
  const windows = [...front.house.panes.map((pane) => [pane, true]), ...(front.house.dark ?? []).map((pane) => [pane, false])];
  const sticker = (a0, b0, a1, b1, looks, low, tall, key, atLeast = 0) => {
    if (windows.length === 0) return;
    const length = Math.hypot(a1 - a0, b1 - b0);
    const count = Math.max(Math.floor(length / 3.6), atLeast);
    for (let n = 0; n < count; n += 1) {
      if (chance(60 + key * 9 + n) < 0.22) continue;
      const [pane, lights] = windows[Math.floor(chance(70 + key * 9 + n) * windows.length)];
      // (With a margin of the wall round it, as the picture has it: its frame, its sill, its arch.)
      const box = [pane[0] - 5, pane[1] - 5, pane[2] + 5, pane[3] + 5];
      const wide = (box[2] - box[0]) / front.house.perMetre;
      const high = Math.min((box[3] - box[1]) / front.house.perMetre, tall - 0.5);
      const middle = ((n + 0.5) / count) * length;
      const [s0, s1] = [(middle - wide / 2) / length, (middle + wide / 2) / length];
      const out = [looks[0] * PROUD, looks[1] * PROUD];
      const z0 = low + (tall - high) * 0.5;
      upright(a0 + (a1 - a0) * s0 + out[0], b0 + (b1 - b0) * s0 + out[1], a0 + (a1 - a0) * s1 + out[0], b0 + (b1 - b0) * s1 + out[1], z0, z0 + high, looks, box, tint, lights && chance(80 + key * 9 + n) < WINDOWS_LIT * 0.7 ? 230 : 0);
    }
  };
  /** Windows on what is left of the face's own wall on either side of the face, if that is more than a strip. */
  const stickersBeside = (low, tall, keys) => {
    const [l0, l1, r0, r1] = [onFront(0), onFront(faceFrom), onFront(faceFrom + faceSpan), onFront(faceWide)];
    if (faceFrom >= BESIDE_FACE_METERS) sticker(l0[0], l0[1], l1[0], l1[1], frontage.looks, low, tall, keys[0], 1);
    if (faceWide - (faceFrom + faceSpan) >= BESIDE_FACE_METERS) sticker(r0[0], r0[1], r1[0], r1[1], frontage.looks, low, tall, keys[1], 1);
  };
  /** The upper floor of a part of two storeys, or the one floor of a low one: from how high, and how tall. */
  const floorOf = (height) => (height > 6 ? [height * 0.52, height * 0.42] : [0.9, height - 1.2]);

  // On the roof: a stair house, a water tank, cooling units. (Where each stands is each kind of house's own.)
  const roofFloor = mainTop - PARAPET_METERS;
  const stuffBox = (a0, b0, a1, b1, z0, z1, sides, top, tinted) => {
    upright(a0, b0, a1, b0, z0, z1, S, sides, tinted);
    upright(a1, b0, a1, b1, z0, z1, E, sides, tinted);
    upright(a1, b1, a0, b1, z0, z1, N, sides, tinted);
    upright(a0, b1, a0, b0, z0, z1, W, sides, tinted);
    level(a0, b0, a1, b1, z1, top, tinted);
  };
  const stairHouse = (a0, b0, wide, deep) => {
    stuffBox(a0, b0, a0 + wide, b0 + deep, roofFloor, roofFloor + 2.9, coping, coping, tint);
    upright(a0 + wide * 0.35, b0 - 0.04, a0 + wide * 0.35 + 0.9, b0 - 0.04, roofFloor + 0.05, roofFloor + 2.1, S, kit.stuff.dark, plainTint);
    return [a0 + wide / 2, b0 + deep / 2, roofFloor + 2.9];
  };
  const tank = ([ta, tb, tz]) => {
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
  };
  /** A cooling unit: a box from a corner, so far the way it runs and so far the way it is deep; its grille on the side it is deep towards. */
  const unit = (corner, run, deepWay, z0) => {
    const [wide, deep, tall] = [0.95, 0.36, 0.7];
    const c0 = corner;
    const c1 = [c0[0] + run[0] * wide, c0[1] + run[1] * wide];
    const c2 = [c1[0] + deepWay[0] * deep, c1[1] + deepWay[1] * deep];
    const c3 = [c0[0] + deepWay[0] * deep, c0[1] + deepWay[1] * deep];
    upright(c1[0], c1[1], c0[0], c0[1], z0, z0 + tall, [-deepWay[0], -deepWay[1], 0], kit.stuff.white, plainTint);
    upright(c3[0], c3[1], c2[0], c2[1], z0, z0 + tall, [deepWay[0], deepWay[1], 0], kit.stuff.unit, plainTint);
    upright(c2[0], c2[1], c1[0], c1[1], z0, z0 + tall, [run[0], run[1], 0], kit.stuff.white, plainTint);
    upright(c0[0], c0[1], c3[0], c3[1], z0, z0 + tall, [-run[0], -run[1], 0], kit.stuff.white, plainTint);
    face([[...c0, z0 + tall], [...c1, z0 + tall], [...c2, z0 + tall], [...c3, z0 + tall]], [0, 0, 1], cornersOf(kit.stuff.white), plainTint);
  };

  if (house.parts) {
    // A house the app has laid out. Its parts: walls of the front's plain stuff, a parapet with the roof's
    // floor behind it.
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
      level(a0 + T, b0 + T, a1 - T, b1 - T, floor, kit.stuff.floor, roofTint);
      if (crest) {
        // (On the main part's wall to the street, only beside the face: the face brings its own.)
        if (!against('front') && part !== main) merlons(a0, b0, a1, b0, top, S);
        if (part === main) merlonsBeside(top);
        if (!against('back')) merlons(a1, b1, a0, b1, top, N);
        if (!against('left')) merlons(a0, b1, a0, b0, top, W);
        if (!against('right')) merlons(a1, b0, a1, b1, top, E);
      }
    }
    // Windows in every wall that stands free (the street side of a part that does not carry the front's own
    // face; and of the one that does, what is left of its wall on either side of the face).
    house.parts.forEach((part, k) => {
      if (part.part === 'room') return;
      const { a0, a1, b0, b1 } = part;
      const [low, tall] = floorOf(part.height);
      const free = (side) => !house.parts.some((other) => other !== part && other.part !== 'room' && (side === 'back' ? Math.abs(other.b0 - b1) < 0.05 : side === 'left' ? Math.abs(other.a1 - a0) < 0.05 : side === 'right' ? Math.abs(other.a0 - a1) < 0.05 : Math.abs(other.b1 - b0) < 0.05));
      if (free('back')) sticker(a1, b1, a0, b1, N, low, tall, k * 4);
      if (free('left')) sticker(a0, b1, a0, b0, W, low, tall, k * 4 + 1);
      if (free('right')) sticker(a1, b0, a1, b1, E, low, tall, k * 4 + 2);
      if (part !== main && free('front')) sticker(a0, b0, a1, b0, S, low, tall, k * 4 + 3);
      if (part === main) stickersBeside(low, tall, [k * 4 + 3, k * 4 + 12]);
    });
    // On the roof: a stair house where the house has no room up there, a water tank on whichever it has, and
    // cooling units by the parapet.
    const inner = [main.a0 + T + 0.4, main.a1 - T - 0.4, main.b0 + T + 0.4, main.b1 - T - 0.4];
    let tankOn = null;
    if (room) tankOn = [(room.a0 + room.a1) / 2, (room.b0 + room.b1) / 2, room.height + 0.3];
    else if (inner[1] - inner[0] > 4.5 && inner[3] - inner[2] > 5.5) {
      const wide = Math.min(3.2 + 1.2 * chance(9), inner[1] - inner[0] - 1);
      const deep = Math.min(3.6 + 1.4 * chance(10), (inner[3] - inner[2]) * 0.6);
      tankOn = stairHouse(inner[0] + (inner[1] - inner[0] - wide) * chance(11), inner[2] + (inner[3] - inner[2] - deep) * (0.45 + 0.55 * chance(12)), wide, deep);
    }
    if (tankOn) tank(tankOn);
    const units = 1 + Math.floor(chance(14) * 3);
    for (let n = 0; n < units && inner[1] - inner[0] > 3; n += 1) {
      const a0 = inner[0] + (inner[1] - inner[0] - 1) * chance(15 + n);
      const b0 = chance(18 + n) < 0.5 ? inner[2] - 0.2 : inner[3] - 0.25;
      unit([a0, b0 + 0.36], [1, 0], [0, -1], roofFloor);
    }
  } else {
    // A house the map has whole: its own outline, as it stands. A wall of the front's plain stuff along every
    // side of it, as tall as the house; on top a parapet all round, with the roof's floor behind it.
    const { ring, walls } = frontage;
    const inner = drawnIn(ring, T);
    const [low, tall] = floorOf(mainTop - ROOF_OVER_METERS);
    walls.forEach((wall, n) => {
      const looks = [wall.out[0], wall.out[1], 0];
      plainWall(wall.p[0], wall.p[1], wall.q[0], wall.q[1], 0, mainTop, looks, n === frontage.wall ? 1 : 2);
      const [p1, q1] = [inner[n], inner[(n + 1) % inner.length]];
      face([[...wall.p, mainTop], [...wall.q, mainTop], [...q1, mainTop], [...p1, mainTop]], [0, 0, 1], cornersOf(coping));
      upright(q1[0], q1[1], p1[0], p1[1], roofFloor, mainTop, [-wall.out[0], -wall.out[1], 0], coping);
      if (n === frontage.wall) {
        stickersBeside(low, tall, [40, 41]);
        if (crest) merlonsBeside(mainTop);
      } else {
        sticker(wall.p[0], wall.p[1], wall.q[0], wall.q[1], looks, low, tall, n);
        if (crest) merlons(wall.p[0], wall.p[1], wall.q[0], wall.q[1], mainTop, looks);
      }
    });
    // The roof's floor: the outline inside its parapet, the floor's stuff drawn once across the whole of it.
    const [a0, a1, b0, b1] = [Math.min(...inner.map((c) => c[0])), Math.max(...inner.map((c) => c[0])), Math.min(...inner.map((c) => c[1])), Math.max(...inner.map((c) => c[1]))];
    const floorBox = kit.stuff.floor;
    const onFloor = ([a, b]) => [floorBox[0] + ((a - a0) / Math.max(a1 - a0, 1e-6)) * (floorBox[2] - floorBox[0]), floorBox[3] - ((b - b0) / Math.max(b1 - b0, 1e-6)) * (floorBox[3] - floorBox[1])];
    for (const [i, j, k] of trianglesOf(inner)) {
      face([[...inner[i], roofFloor], [...inner[j], roofFloor], [...inner[k], roofFloor], [...inner[k], roofFloor]], [0, 0, 1], [onFloor(inner[i]), onFloor(inner[j]), onFloor(inner[k]), onFloor(inner[k])], roofTint);
    }
    // On the roof: a stair house where there is room for one clear of the parapet, with the water tank on it
    // (or the tank alone, in the middle); cooling units along the parapets.
    const clear = drawnIn(ring, T + 0.4);
    const holds = (c0, d0, c1, d1) => [[c0, d0], [c1, d0], [c1, d1], [c0, d1], [(c0 + c1) / 2, d0], [(c0 + c1) / 2, d1], [c0, (d0 + d1) / 2], [c1, (d0 + d1) / 2]].every(([a, b]) => within(clear, a, b)) && !clear.some(([a, b]) => a > c0 && a < c1 && b > d0 && b < d1);
    const [wide, deep] = [3.2 + 1.2 * chance(9), 3.6 + 1.4 * chance(10)];
    let tankOn = null;
    for (let n = 0; n < 14 && !tankOn && a1 - a0 > wide + 1 && b1 - b0 > deep + 1; n += 1) {
      const c0 = a0 + (a1 - a0 - wide) * chance(100 + n * 2);
      const d0 = b0 + (b1 - b0 - deep) * (0.3 + 0.7 * chance(101 + n * 2));
      if (holds(c0, d0, c0 + wide, d0 + deep)) tankOn = stairHouse(c0, d0, wide, deep);
    }
    const middle = [ring.reduce((sum, c) => sum + c[0], 0) / ring.length, ring.reduce((sum, c) => sum + c[1], 0) / ring.length];
    if (!tankOn && holds(middle[0] - 0.9, middle[1] - 0.9, middle[0] + 0.9, middle[1] + 0.9)) tankOn = [middle[0], middle[1], roofFloor];
    if (tankOn) tank(tankOn);
    const units = 1 + Math.floor(chance(14) * 3);
    for (let n = 0; n < units; n += 1) {
      const wall = walls[Math.floor(chance(15 + n) * walls.length)];
      if (wall.length < 4) continue;
      const run = [(wall.q[0] - wall.p[0]) / wall.length, (wall.q[1] - wall.p[1]) / wall.length];
      const far = 1.2 + (wall.length - 3.4) * chance(18 + n);
      unit([wall.p[0] + run[0] * far - wall.out[0] * (T + 0.2), wall.p[1] + run[1] * far - wall.out[1] * (T + 0.2)], run, [-wall.out[0], -wall.out[1]], roofFloor);
    }
  }

  // The face is laid now. Where there is no street wall, the wall's strip with its gate is the foot of the house.
  if (!walled) wallStrip(onFront(0, PROUD), frontage.along, faceWide, frontage.looks, 0);
  // (flip: the face in mirror image about its own middle.)
  const along = (u) => {
    const far = faceFrom + ((u - measure.box[0]) / perMetre) * across;
    return flip ? 2 * faceFrom + faceSpan - far : far;
  };
  const high = (v) => mainTop - (v - measure.top) / perMetre;
  const laid = (box, proud, tinted, lamp) => {
    const [l, r] = flip ? [along(box[2]), along(box[0])] : [along(box[0]), along(box[2])];
    const z0 = Math.max(high(box[3]), 0);
    if (high(box[1]) - z0 < 0.02) return;
    // (A piece that would reach under the ground is cut off there.)
    const foot = box[1] + (box[3] - box[1]) * ((high(box[1]) - z0) / (high(box[1]) - high(box[3])));
    const [from, until] = [onFront(l, proud), onFront(r, proud)];
    upright(from[0], from[1], until[0], until[1], z0, high(box[1]), frontage.looks, flip ? [box[2], box[1], box[0], foot] : [box[0], box[1], box[2], foot], tinted, lamp);
  };
  for (const rect of front.house.rects) laid(rect, PROUD, tint, 0);
  // Its windows: each a pane of its own before the face, lit on some houses by night and dark on others. And
  // the lamps on its face, lit on all.
  front.house.panes.forEach((pane, n) => laid(pane, PROUD * 2, tint, chance(40 + n) < WINDOWS_LIT ? 230 : 0));
  for (const lamp of front.house.lamps ?? []) laid(lamp, PROUD * 2, plainTint, 255);
}
