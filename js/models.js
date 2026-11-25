// The famous buildings of the city, as true models.
//
// Most buildings are drawn as what the map knows of them: an outline pulled
// up to a height, with walls and a roof laid over it. A building the whole
// city is known by is more than that: its faces lean, fold and meet in
// points. Such a one is built here out of flat triangles, each with the way
// it faces, so that the light falls on every face as it does on the real
// one. Every point of a face is then worked out where it is drawn (see
// scene.js): the storey it lies in, glass or the edge of a floor, the sky
// that shows in the glass, the lamps that are on behind it by night.
//
// What is made here is the measure that working-out needs, at every corner
// of every triangle: where it is, which way its face looks, how far along
// its face and how high it lies, how far it is from each edge of its face,
// and what its face is made of.
//
// Nothing here touches the browser. A model is measured in metres: east,
// north and up from the middle of its footprint on the ground.

import earcut from '../vendor/earcut/earcut.js';

/** What a face can be made of: its place in this list is what the drawing goes by. */
export const STUFFS = ['plain', 'glass', 'lamp', 'pierced'];
/** A face has a number of its own, from 0 to this, so that no two faces of glass look quite alike. */
export const OWN_NUMBERS = 32;
/** What is added to the distance from an edge along which no line is drawn. */
export const NO_LINE = 10000;

/** Corners of triangles, each with all that the drawing needs to know about its face. */
export class ModelMesh {
  constructor(corners = 2048) {
    this.positions = new Float32Array(corners * 3);
    // Which way its face looks there; and how much of a mirror the face is (0 to 1).
    this.normals = new Float32Array(corners * 4);
    // Along its face and up from the ground, in metres; the height of a storey and the width of a bay.
    this.surfaces = new Float32Array(corners * 4);
    // How far it is to each edge of its face, in metres; and how plainly the edges of its floors show (0 to 1).
    this.edges = new Float32Array(corners * 4);
    // The colour of its face; and what the face is made of (x 32) with the face's own number.
    this.tints = new Uint8Array(corners * 4);
    // The colour of the light the face gives by night, and how strong.
    this.lights = new Uint8Array(corners * 4);
    // The share of its rooms that are lit by night; how much of a net of fins lies over it (for a pierced
    // skin: how much of it is cut away); how bright the lines along its edges; and (x 85) 1 if it takes no
    // shadow, 2 if its light changes colour, 3 if both.
    this.more = new Uint8Array(corners * 4);
    this.count = 0;
    this.faces = 0;
  }

  clear() {
    this.count = 0;
    this.faces = 0;
  }

  room(corners) {
    if (this.count + corners <= this.positions.length / 3) return;
    const most = Math.max((this.count + corners) * 2, 2048);
    for (const [name, size] of PARTS) {
      const grown = new this[name].constructor(most * size);
      grown.set(this[name].subarray(0, this.count * size));
      this[name] = grown;
    }
  }

  /**
   * Take in all of another mesh, moved so far east and north: a model that was built about its own middle,
   * put where it stands. (Its faces keep the numbers they have.)
   */
  add(other, east = 0, north = 0) {
    this.room(other.count);
    for (const [name, size] of PARTS) this[name].set(other[name].subarray(0, other.count * size), this.count * size);
    for (let n = this.count; n < this.count + other.count; n += 1) {
      this.positions[n * 3] += east;
      this.positions[n * 3 + 1] += north;
    }
    this.count += other.count;
    this.faces += other.faces;
  }
}

/** What a mesh holds for each corner, and how many numbers of each. */
const PARTS = [['positions', 3], ['normals', 4], ['surfaces', 4], ['edges', 4], ['tints', 4], ['lights', 4], ['more', 4]];

const byte = (part) => Math.round(Math.min(Math.max(part, 0), 1) * 255);

/** [red, green, blue] from 0 to 255, of a colour written as #rrggbb. */
function rgbOf(colour) {
  const value = Number.parseInt(String(colour ?? '#000000').slice(1), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const long = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * Cut a flat shape (its corners in order, each [east, north, up]) in two at a
 * height. Returns [what lies below, what lies above]; either may be empty.
 */
function cutAt(shape, height) {
  const below = [];
  const above = [];
  for (let i = 0; i < shape.length; i += 1) {
    const here = shape[i];
    const next = shape[(i + 1) % shape.length];
    const hereUp = here[2] > height;
    if (hereUp) above.push(here);
    else below.push(here);
    if (hereUp !== next[2] > height) {
      const t = (height - here[2]) / (next[2] - here[2]);
      const crossing = [here[0] + (next[0] - here[0]) * t, here[1] + (next[1] - here[1]) * t, height];
      below.push(crossing);
      above.push(crossing);
    }
  }
  return [below.length >= 3 ? below : [], above.length >= 3 ? above : []];
}

/**
 * One building in the making. Its faces are given in its own metres (east,
 * north and up from its middle) and go into a mesh that may hold several
 * buildings, each at its own place.
 */
export class Model {
  /**
   * mesh: where the triangles go. east, north: where the model's middle
   * stands, in the mesh's metres. turn: how far the model is turned,
   * clockwise in degrees: its own north then points that way.
   */
  constructor(mesh, { east = 0, north = 0, turn = 0 } = {}) {
    this.mesh = mesh;
    this.east = east;
    this.north = north;
    const angle = (turn * Math.PI) / 180;
    this.cos = Math.cos(angle);
    this.sin = Math.sin(angle);
  }

  /** A direction of the model's, as it lies in the mesh: turned with the model. */
  turned([east, north, up]) {
    return [east * this.cos + north * this.sin, north * this.cos - east * this.sin, up];
  }

  /**
   * One flat triangle. a, b, c: its corners, each [east, north, up].
   *
   * stuff: what it is made of:
   *   { kind: 'plain' | 'glass' | 'lamp' | 'pierced', colour: '#rrggbb',
   *     storey, bay: for glass, the height of a storey and the width of a bay, in metres,
   *     light: '#rrggbb', glow: the light it gives by night and how strong (0 to 1): for glass a line of
   *       it along the edge of every floor; for a lamp, all of it; for plain stuff, lamps shining on it,
   *     lit: for glass, the share of its floors whose rooms are lit by night (1: every room of every floor),
   *       and for a pierced skin the share of its windows,
   *     fins: for glass, how much of a net of slanting fins lies over it (0 to 1),
   *     floors: for glass, how plainly the edge of each floor shows (0 to 1; 1 unless told),
   *     mirror: for glass, how much of a mirror it is (0: dark glass that shows a little of the sky;
   *       1: silvered, and little but the sky),
   *     changing: true for a light that changes colour slowly, all night (its own colour is then not used),
   *     ridge: how bright the lines along its edges are (0 to 1),
   *     open: true for a face that takes no shadow: one that lies inside the block the map has for the
   *       building, whose shadow would otherwise always fall on it (a roof behind its parapets) }
   * A pierced skin is stone, or panels, with windows cut in it: colour is the skin's, and
   *     storey, bay: how tall and how wide one window with the skin round it is,
   *     diamonds: true for windows that stand on their points, in a net that slants (each as wide as a
   *       bay and as tall as a storey); without it they stand upright, in rows,
   *     holes: how much of the skin is cut away (0 to 1). Of diamonds: few and small, of many sizes, up to
   *       every one of them and wide open, which leaves a mesh. Of upright windows: from narrow ones up
   *       to bands of glass that run right round between bands of skin (from 0.64).
   *
   * out: a direction the face looks towards rather than away from; it
   * settles which of its two sides is the outside. Without it the outside is
   * the side from which a, b, c run anticlockwise.
   * normals: for a face that is a piece of a curved surface, which way that
   * surface looks at each of a, b and c; the light then falls on it as on
   * the curve, not as on a flat piece. (Not with bands.)
   * lines: along which of its edges a line is drawn: [a to b, b to c, c to a].
   * along, from: the level direction [east, north] its bays are counted in,
   * and the place they are counted from. Without them, bays are counted
   * along the face from the model's middle.
   * bands: [{ from, to, stuff }]: between these heights it is of other stuff.
   * own: the face's own number; without it, each face gets the next.
   */
  facet(a, b, c, stuff, { out = null, lines = [true, true, true], along = null, from = [0, 0], bands = null, own = null, normals = null } = {}) {
    let corners = [a, b, c];
    let edged = lines;
    let curved = normals;
    let normal = cross(minus(b, a), minus(c, a));
    const size = long(normal);
    if (!(size > 1e-9)) return; // no face at all: its corners lie in a line
    normal = [normal[0] / size, normal[1] / size, normal[2] / size];
    if (out && dot(normal, out) < 0) {
      corners = [a, c, b];
      edged = [lines[2], lines[1], lines[0]];
      normal = [-normal[0], -normal[1], -normal[2]];
      if (normals) curved = [normals[0], normals[2], normals[1]];
    }
    const [p, q, r] = corners;
    // The way into the face from each of its edges, lying in the face: the distance of a point from an
    // edge is measured along it.
    const inward = (from0, to0, third) => {
      let way = cross(normal, minus(to0, from0));
      const length = long(way);
      way = [way[0] / length, way[1] / length, way[2] / length];
      return dot(minus(third, from0), way) < 0 ? [-way[0], -way[1], -way[2]] : way;
    };
    const ways = [inward(p, q, r), inward(q, r, p), inward(r, p, q)];
    const starts = [p, q, r];
    // Which way is "along": level, and lying in the face (or, for a face that lies flat, east).
    let level = along ? [along[0], along[1]] : [-normal[1], normal[0]];
    const levelLength = Math.hypot(level[0], level[1]);
    level = levelLength > 1e-6 ? [level[0] / levelLength, level[1] / levelLength] : [1, 0];

    const mesh = this.mesh;
    const number = (own ?? mesh.faces * 7 + 3) % OWN_NUMBERS;
    mesh.faces += 1;
    const turnedNormal = this.turned(normal);
    // (Which way a curved surface looks at each corner, each made one long and turned with the model.)
    const turnedCurved = curved && !bands ? curved.map((way) => this.turned(way.map((part) => part / long(way)))) : null;
    const put = (shape, made) => {
      const kind = Math.max(STUFFS.indexOf(made.kind ?? 'plain'), 0);
      const pierced = made.kind === 'pierced';
      const colour = rgbOf(made.colour);
      const light = rgbOf(made.light ?? '#000000');
      const glow = byte(made.light ? made.glow ?? 1 : 0);
      // (A shape with more than three corners is laid as a fan of triangles from its first.)
      mesh.room((shape.length - 2) * 3);
      for (let i = 1; i < shape.length - 1; i += 1) {
        for (const [k, corner] of [[0, shape[0]], [i, shape[i]], [i + 1, shape[i + 1]]]) {
          const n = mesh.count;
          const [east, north, up] = this.turned(corner);
          mesh.positions[n * 3] = this.east + east;
          mesh.positions[n * 3 + 1] = this.north + north;
          mesh.positions[n * 3 + 2] = up;
          mesh.normals.set(turnedCurved ? turnedCurved[k] : turnedNormal, n * 4);
          mesh.normals[n * 4 + 3] = Math.min(Math.max(made.mirror ?? 0, 0), 1);
          mesh.surfaces[n * 4] = (corner[0] - from[0]) * level[0] + (corner[1] - from[1]) * level[1];
          mesh.surfaces[n * 4 + 1] = corner[2];
          mesh.surfaces[n * 4 + 2] = made.storey ?? 0;
          mesh.surfaces[n * 4 + 3] = made.bay ?? 0;
          for (let e = 0; e < 3; e += 1) mesh.edges[n * 4 + e] = Math.max(dot(minus(corner, starts[e]), ways[e]), 0) + (edged[e] ? 0 : NO_LINE);
          // (For a pierced skin: 0 if its windows are diamonds, 1 if they stand upright.)
          mesh.edges[n * 4 + 3] = pierced ? (made.diamonds ? 0 : 1) : Math.min(Math.max(made.floors ?? 1, 0), 1);
          mesh.tints.set([colour[0], colour[1], colour[2], kind * OWN_NUMBERS + number], n * 4);
          mesh.lights.set([light[0], light[1], light[2], glow], n * 4);
          mesh.more.set([byte(made.lit ?? 0), byte(pierced ? made.holes ?? 0.4 : made.fins ?? 0), byte(made.ridge ?? 0), ((made.open ? 1 : 0) + (made.changing ? 2 : 0)) * 85], n * 4);
          mesh.count += 1;
        }
      }
    };

    if (!bands || bands.length === 0) {
      put([p, q, r], stuff);
      return;
    }
    // Cut it at the foot and at the top of every band; each piece is of the stuff of the band it lies in.
    let pieces = [[p, q, r]];
    for (const height of [...new Set(bands.flatMap((band) => [band.from, band.to]))].sort((x, y) => x - y)) {
      pieces = pieces.flatMap((piece) => cutAt(piece, height).filter((part) => part.length >= 3));
    }
    for (const piece of pieces) {
      const middle = piece.reduce((sum, corner) => sum + corner[2], 0) / piece.length;
      const band = bands.find((one) => middle > one.from && middle < one.to);
      put(piece, band ? band.stuff : stuff);
    }
  }

  /**
   * A face with four corners, a to d in order round it, as two triangles
   * that meet along the line from a to c. Lines are drawn round its outline
   * (lines: [a to b, b to c, c to d, d to a]), and along the line from a to c
   * only if fold is set: when the four corners do not lie in one plane, that
   * is where the face is folded. normals: for a piece of a curved surface,
   * which way the surface looks at each of the four corners.
   */
  quad(a, b, c, d, stuff, { lines = [true, true, true, true], fold = false, normals = null, ...rest } = {}) {
    const own = rest.own ?? this.mesh.faces * 7 + 3;
    this.facet(a, b, c, stuff, { ...rest, own: fold ? rest.own ?? null : own, lines: [lines[0], lines[1], fold], normals: normals && [normals[0], normals[1], normals[2]] });
    this.facet(a, c, d, stuff, { ...rest, own: fold ? rest.own ?? null : own, lines: [fold, lines[2], lines[3]], normals: normals && [normals[0], normals[2], normals[3]] });
  }

  /**
   * A flat shape of any outline: a roof, a floor, a canopy. points: its
   * corners in order, each [east, north, up], all in one plane; holes: more
   * such outlines, cut out of it. A line is drawn along its outline only.
   */
  flat(points, stuff, { out = [0, 0, 1], holes = [], ...rest } = {}) {
    // Laid out flat for cutting into triangles: seen from above, or from the side if it stands upright.
    const normal = cross(minus(points[1], points[0]), minus(points[2], points[0]));
    const [i, j] = Math.abs(normal[2]) >= Math.abs(normal[0]) && Math.abs(normal[2]) >= Math.abs(normal[1]) ? [0, 1] : Math.abs(normal[0]) >= Math.abs(normal[1]) ? [1, 2] : [0, 2];
    const all = [points, ...holes];
    const flatPoints = all.flat().flatMap((point) => [point[i], point[j]]);
    const starts = [];
    let at = 0;
    for (const ring of all) {
      if (at > 0) starts.push(at);
      at += ring.length;
    }
    const corners = all.flat();
    // (Which ring a corner belongs to, and its place in it: an edge of a triangle is an edge of the
    // shape when it joins two neighbours on one ring.)
    const ringOf = [];
    all.forEach((ring, index) => ring.forEach((_, place) => ringOf.push([index, place, ring.length])));
    const neighbours = (m, n) => ringOf[m][0] === ringOf[n][0] && (Math.abs(ringOf[m][1] - ringOf[n][1]) === 1 || Math.abs(ringOf[m][1] - ringOf[n][1]) === ringOf[m][2] - 1);
    const triangles = earcut(flatPoints, starts, 2);
    const own = rest.own ?? this.mesh.faces * 7 + 3;
    for (let t = 0; t < triangles.length; t += 3) {
      const [m, n, o] = [triangles[t], triangles[t + 1], triangles[t + 2]];
      this.facet(corners[m], corners[n], corners[o], stuff, { ...rest, out, own, lines: [neighbours(m, n), neighbours(n, o), neighbours(o, m)] });
    }
  }
}

/**
 * Where a level plane cuts a mesh: the pieces of line, each [[east, north],
 * [east, north]], in the mesh's own metres. only(corner index): which
 * triangles to cut; without it, all. (Used to measure a model: its outline at
 * a height, and from that how wide it is there and how much floor it has.)
 */
export function cutMesh(mesh, height, only = null) {
  const lines = [];
  for (let n = 0; n < mesh.count; n += 3) {
    if (only && !only(n)) continue;
    const corners = [0, 1, 2].map((k) => [mesh.positions[(n + k) * 3], mesh.positions[(n + k) * 3 + 1], mesh.positions[(n + k) * 3 + 2]]);
    const crossings = [];
    for (let k = 0; k < 3; k += 1) {
      const here = corners[k];
      const next = corners[(k + 1) % 3];
      if (here[2] > height === next[2] > height) continue;
      const t = (height - here[2]) / (next[2] - here[2]);
      crossings.push([here[0] + (next[0] - here[0]) * t, here[1] + (next[1] - here[1]) * t]);
    }
    if (crossings.length === 2) lines.push(crossings);
  }
  return lines;
}
