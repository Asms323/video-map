// The walls of the 3D city, as the app draws them itself.
//
// The map draws a building as a plain block. Over each block the app lays
// walls of its own: the same outline, a hand's breadth further out, running
// up past the roof as a parapet. Every point of such a wall is then worked
// out where it is drawn (see scene.js): which floor and which bay it lies
// in, whether it is glass or wall, how the sun strikes it. What is made here
// is the measure that working-out needs, at every corner of every wall:
// where it is along its wall and how high, how long and tall the wall is,
// which way it faces, and what colour and kind of building it belongs to.
//
// Nothing here touches the browser. Places are [lng, lat]; the scene's own
// measure is metres east and north of an origin.

const METERS_PER_DEGREE = 111320;

// How far outside the map's own block a wall is laid, so that it is the wall that shows.
export const WALL_OUT_METERS = 0.05;
// How far the walls run up past the roof.
export const PARAPET_METERS = 0.6;
// The kinds of front a building can have: its place in this list is what the drawing goes by.
export const FACADES = ['block', 'house', 'tower', 'shops'];
const TOWER_FROM_METERS = 60;
const HOUSE_UP_TO_METERS = 11;
// A wall carries on round a bend gentler than this as the same wall, so that a curved front has its windows too.
const SAME_WALL_COS = Math.cos((16 * Math.PI) / 180);
const PLASTER = [236, 228, 214];

/**
 * Which kind of front a building has: a tower of glass, a house, a block
 * with shops along its foot (what the data calls commercial), or a plain
 * block of flats or offices.
 */
export function facadeOf(building) {
  if (building.height >= TOWER_FROM_METERS) return 'tower';
  if (building.height <= HOUSE_UP_TO_METERS && (building.use === 'residential' || building.use === undefined)) return 'house';
  if (building.use === 'commercial' && building.height >= 6) return 'shops';
  return 'block';
}

/**
 * Cut a ring of [lng, lat] to a box { west, south, east, north }. Returns the
 * ring that is left, closed, or null if nothing is. A corner made by the cut
 * lies exactly on the box's edge.
 */
export function clipRing(ring, box) {
  let points = ring.slice(0, ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0));
  // One edge of the box at a time: what is on the inner side of it is kept.
  const sides = [
    [0, box.west, 1],
    [0, box.east, -1],
    [1, box.south, 1],
    [1, box.north, -1],
  ];
  for (const [axis, limit, sign] of sides) {
    if (points.length < 3) return null;
    const kept = [];
    for (let i = 0; i < points.length; i += 1) {
      const here = points[i];
      const next = points[(i + 1) % points.length];
      const hereIn = (here[axis] - limit) * sign >= 0;
      const nextIn = (next[axis] - limit) * sign >= 0;
      if (hereIn) kept.push(here);
      if (hereIn !== nextIn) {
        const t = (limit - here[axis]) / (next[axis] - here[axis]);
        const crossing = [here[0] + (next[0] - here[0]) * t, here[1] + (next[1] - here[1]) * t];
        crossing[axis] = limit;
        kept.push(crossing);
      }
    }
    points = kept;
  }
  if (points.length < 3) return null;
  points.push(points[0]);
  return points;
}

/**
 * A building that lies across the edge of a map tile comes with both tiles,
 * each copy cut off a little way past the edge: so part of it is there
 * twice. Here every copy is cut to its own tile, and the copies meet edge
 * to edge instead. boxOf(z, x, y): the box of a tile. Returns the buildings,
 * those that were cut with `within` set to the box they were cut to; a
 * building of which nothing is left in its tile is dropped.
 */
export function tilePieces(buildings, boxOf) {
  const out = [];
  for (const building of buildings) {
    if (!building.tile) {
      out.push(building);
      continue;
    }
    const box = boxOf(...building.tile);
    const polygons = [];
    for (const polygon of building.polygons) {
      const outline = clipRing(polygon[0], box);
      if (!outline) continue;
      const rings = [outline];
      for (let r = 1; r < polygon.length; r += 1) {
        const yard = clipRing(polygon[r], box);
        if (yard) rings.push(yard);
      }
      polygons.push(rings);
    }
    if (polygons.length > 0) out.push({ ...building, polygons, within: box });
  }
  return out;
}

/**
 * A number from 0 to 60 that is a building's own, by its number in the map
 * data: the same every time. (Those numbers are so large that a computer
 * keeps only their first sixteen digits or so, and what is left of them is
 * always a multiple of 1024. Divided by a prime, the remainders are spread
 * evenly all the same.)
 */
export function seedOf(id) {
  return typeof id === 'number' && Number.isFinite(id) ? Math.abs(id) % 61 : 0;
}

/** The corners of the walls: where each is, where on its wall, which way the wall faces, and its building's colour and kind. */
export class WallMesh {
  constructor(corners = 8192) {
    this.positions = new Float32Array(corners * 3);
    this.surfaces = new Float32Array(corners * 4); // along the wall, up the wall, the wall's length, the wall's height: metres
    this.normals = new Float32Array(corners * 2); // the way the wall faces: east, north
    this.tints = new Uint8Array(corners * 4); // red, green, blue; and the kind of front (× 64) with the building's seed
    this.count = 0;
  }

  clear() {
    this.count = 0;
  }

  room(corners) {
    if (this.count + corners <= this.positions.length / 3) return;
    const size = Math.max((this.count + corners) * 2, 8192);
    const grown = (old, each, Kind) => {
      const next = new Kind(size * each);
      next.set(old.subarray(0, this.count * each));
      return next;
    };
    this.positions = grown(this.positions, 3, Float32Array);
    this.surfaces = grown(this.surfaces, 4, Float32Array);
    this.normals = grown(this.normals, 2, Float32Array);
    this.tints = grown(this.tints, 4, Uint8Array);
  }

  /** One corner of a wall: where it is, where on its wall, the wall's size, which way the wall faces there, its colour and kind. */
  corner(x, y, z, along, up, length, height, east, north, red, green, blue, style) {
    const i = this.count;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.surfaces[i * 4] = along;
    this.surfaces[i * 4 + 1] = up;
    this.surfaces[i * 4 + 2] = length;
    this.surfaces[i * 4 + 3] = height;
    this.normals[i * 2] = east;
    this.normals[i * 2 + 1] = north;
    this.tints[i * 4] = red;
    this.tints[i * 4 + 1] = green;
    this.tints[i * 4 + 2] = blue;
    this.tints[i * 4 + 3] = style;
    this.count += 1;
  }
}

/**
 * A ring of [lng, lat] as [x, y] in metres round an origin, without the corner
 * that closes it. within: the box the ring was cut to, if it was: a stretch
 * that runs along an edge of that box is a cut and no wall, and is marked so.
 */
function localRing(ring, origin, squeeze, within = null) {
  const count = ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const point = [(ring[i][0] - origin.lng) * squeeze, (ring[i][1] - origin.lat) * METERS_PER_DEGREE];
    if (within) {
      const [lng, lat] = ring[i];
      const [nextLng, nextLat] = ring[(i + 1) % count];
      point.open = (lng === nextLng && (lng === within.west || lng === within.east)) || (lat === nextLat && (lat === within.south || lat === within.north));
    }
    points.push(point);
  }
  return points;
}

/**
 * The walls of a ring, one stretch at a time: each { from, to, east, north,
 * alongFrom, alongTo, length }, with (east, north) the way the wall faces,
 * outwards; alongFrom and alongTo how far along its wall the stretch begins
 * and ends; and length how long that whole wall is. Distance along a wall is
 * counted rightwards as one stands facing it from outside, whichever way the
 * outline happens to run. A wall carries on round gentle bends and ends at a
 * corner; at such a bend the wall faces half-way between its two stretches
 * (eastFrom, northFrom at the start of a stretch, eastTo, northTo at its
 * end), so that a rounded front is lit as a curve and not as a row of flat
 * faces. A point marked `open` begins a stretch that is no wall (the edge of
 * a map tile, where the building carries on in the next): it is left out.
 * hole: the ring is a courtyard, whose walls face into it.
 */
export function wallsOfRing(points, hole = false) {
  const count = points.length;
  if (count < 3) return [];
  let doubled = 0;
  for (let i = 0; i < count; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % count];
    doubled += x0 * y1 - x1 * y0;
  }
  if (Math.abs(doubled) < 1e-6) return [];
  // Round an outline that runs anticlockwise the outside is on the right of each stretch; a courtyard is the other way about.
  const side = doubled > 0 !== hole ? 1 : -1;
  const edges = [];
  for (let i = 0; i < count; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % count];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.05) continue;
    edges.push({ from, to, length, dx: dx / length, dy: dy / length, east: (dy / length) * side, north: (-dx / length) * side, along: 0, wall: 0, open: Boolean(from.open) });
  }
  if (edges.length < 3) return [];
  // Where a new wall begins: at each stretch that turns a corner from the one before it, or follows a cut.
  const corner = edges.map((edge, i) => {
    const before = edges[(i + edges.length - 1) % edges.length];
    return edge.open || before.open || edge.dx * before.dx + edge.dy * before.dy < SAME_WALL_COS;
  });
  const start = Math.max(corner.indexOf(true), 0); // an outline with no corner at all (a round tower) is one wall
  let first = 0;
  let run = 0;
  const close = (end) => {
    for (let k = first; k < end; k += 1) ordered[k].wall = run;
  };
  const ordered = [];
  for (let step = 0; step < edges.length; step += 1) {
    const i = (start + step) % edges.length;
    if (step > 0 && corner[i]) {
      close(ordered.length);
      first = ordered.length;
      run = 0;
    }
    edges[i].along = run;
    run += edges[i].length;
    ordered.push(edges[i]);
  }
  close(ordered.length);
  // Which way the wall faces at each end of a stretch: at a bend within a wall, half-way between the two stretches that meet there.
  const joined = (a, b) => {
    const east = a.east + b.east;
    const north = a.north + b.north;
    const size = Math.hypot(east, north) || 1;
    return [east / size, north / size];
  };
  const out = [];
  ordered.forEach((edge, k) => {
    if (edge.open) return;
    const before = ordered[(k + ordered.length - 1) % ordered.length];
    const after = ordered[(k + 1) % ordered.length];
    const index = (start + k) % edges.length;
    const [eastFrom, northFrom] = corner[index] ? [edge.east, edge.north] : joined(before, edge);
    const [eastTo, northTo] = corner[(index + 1) % edges.length] ? [edge.east, edge.north] : joined(edge, after);
    // (Rightwards as seen from outside is the way (-north, east) of the wall's facing: with the outline, or against it.)
    const withIt = side > 0;
    const alongFrom = withIt ? edge.along : edge.wall - edge.along;
    out.push({ from: edge.from, to: edge.to, east: edge.east, north: edge.north, eastFrom, northFrom, eastTo, northTo, alongFrom, alongTo: withIt ? alongFrom + edge.length : alongFrom - edge.length, length: edge.wall });
  });
  return out;
}

/**
 * Lay the walls of buildings over the blocks the map draws.
 *
 * buildings: [{ id, height, base, kind, use, replaced, polygons }] as
 * buildingFootprints() gives them. origin: { lng, lat }, the place the scene
 * measures from. top(building): how high its walls are to reach, parapet and
 * all, in metres above the ground. colourOf(building): its walls' colour as
 * [red, green, blue], or null for plaster.
 *
 * Left alone: what a model stands in for, and stations, which have fronts of
 * their own. Returns { buildings, walls }: how many got walls, and how many
 * stretches of wall there are.
 */
export function wallsOf(mesh, buildings, origin, { top = (building) => building.height, colourOf = () => null } = {}) {
  mesh.clear();
  let dressed = 0;
  let walls = 0;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  for (const building of buildings) {
    if (building.replaced || building.kind === 'station') continue;
    const base = building.base > 0 ? building.base : 0;
    const height = top(building) - base;
    if (!(height > 1)) continue;
    const [red, green, blue] = colourOf(building) ?? PLASTER;
    const style = FACADES.indexOf(facadeOf(building)) * 64 + seedOf(building.id);
    let any = false;
    for (const polygon of building.polygons) {
      for (let r = 0; r < polygon.length; r += 1) {
        for (const wall of wallsOfRing(localRing(polygon[r], origin, squeeze, building.within), r > 0)) {
          const x0 = wall.from[0] + wall.east * WALL_OUT_METERS;
          const y0 = wall.from[1] + wall.north * WALL_OUT_METERS;
          const x1 = wall.to[0] + wall.east * WALL_OUT_METERS;
          const y1 = wall.to[1] + wall.north * WALL_OUT_METERS;
          mesh.room(6);
          const first = (z, up) => mesh.corner(x0, y0, z, wall.alongFrom, up, wall.length, height, wall.eastFrom, wall.northFrom, red, green, blue, style);
          const second = (z, up) => mesh.corner(x1, y1, z, wall.alongTo, up, wall.length, height, wall.eastTo, wall.northTo, red, green, blue, style);
          first(base, 0);
          second(base, 0);
          second(base + height, height);
          first(base, 0);
          second(base + height, height);
          first(base + height, height);
          walls += 1;
          any = true;
        }
      }
    }
    if (any) dressed += 1;
  }
  return { buildings: dressed, walls };
}

/**
 * The shade that gathers on the ground at the foot of a wall: a strip along
 * every wall that stands on the ground, darkest at the wall and gone a
 * little way out. mesh: a Mesh of coloured corners (see life.js). Returns
 * the number of strips.
 */
export function footShade(mesh, buildings, origin, { reach = 1.5, strength = 0.34, up = 0.07 } = {}) {
  mesh.clear();
  let strips = 0;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  for (const building of buildings) {
    if (building.base > 0) continue;
    for (const polygon of building.polygons) {
      for (let r = 0; r < polygon.length; r += 1) {
        for (const wall of wallsOfRing(localRing(polygon[r], origin, squeeze, building.within), r > 0)) {
          const [x0, y0] = wall.from;
          const [x1, y1] = wall.to;
          const ox = wall.east * reach;
          const oy = wall.north * reach;
          mesh.room(6);
          mesh.corner(x0, y0, up, 14, 18, 28, strength);
          mesh.corner(x1, y1, up, 14, 18, 28, strength);
          mesh.corner(x1 + ox, y1 + oy, up, 14, 18, 28, 0);
          mesh.corner(x0, y0, up, 14, 18, 28, strength);
          mesh.corner(x1 + ox, y1 + oy, up, 14, 18, 28, 0);
          mesh.corner(x0 + ox, y0 + oy, up, 14, 18, 28, 0);
          strips += 1;
        }
      }
    }
  }
  return strips;
}

/**
 * A colour for a building's walls, worked out from the colour of its roof
 * in the satellite photo: [red, green, blue], each 0 to 255.
 *
 * What colour a wall is, no source says. But a building is seldom far in
 * colour from its roof's edge and its neighbours: a sand-coloured roof
 * mostly sits on a sand-coloured house, a grey one on a grey block, red
 * tiles on warm walls. So the wall takes the roof's hue, much calmed; is as
 * light as a wall in the sun is, the lighter for a light roof; and has a
 * good part of plaster mixed in.
 */
export function wallTone([red, green, blue]) {
  const most = Math.max(red, green, blue);
  const least = Math.min(red, green, blue);
  const light = (most + least) / 510;
  // How strong the roof's colour is (what little colour a very dark roof has is not to be trusted), and how strong the wall's is to be.
  const strength = (most - least) / Math.max(most, 48);
  const kept = Math.min(strength * 0.75, 0.24);
  // The strongest part of the colour as bright as a wall is; the others below it, in step.
  const bright = 176 + 68 * Math.min(Math.max((light - 0.25) / 0.5, 0), 1);
  return [red, green, blue].map((part, i) => {
    const short = (most - part) / Math.max(most - least, 1); // 0 for the strongest part, 1 for the weakest
    return Math.round(bright * (1 - kept * short) * 0.72 + PLASTER[i] * (bright / 244) * 0.28);
  });
}

const NAMED = { white: '#ffffff', black: '#222222', grey: '#9a9a9a', gray: '#9a9a9a', silver: '#c0c0c0', beige: '#e8dcc0', brown: '#8b6b4a', red: '#b5493a', yellow: '#e6cf7a', orange: '#d98e4a', green: '#6f9a6a', blue: '#6a8fbf', tan: '#d2b48c', cream: '#f3ead2', sand: '#dcc9a0', pink: '#e5b9b0' };

/** A colour written the way map data writes them ("#e8dcc0", "#eee", "beige") as [red, green, blue], or null if it cannot be read. */
export function colourOf(text) {
  let value = String(text ?? '').trim().toLowerCase();
  if (Object.hasOwn(NAMED, value)) value = NAMED[value];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) return short.slice(1).map((part) => parseInt(part + part, 16));
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(value);
  return long ? long.slice(1).map((part) => parseInt(part, 16)) : null;
}
