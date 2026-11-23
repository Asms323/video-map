// The roofs of the 3D city, modelled.
//
// Nothing of a roof is a photo. Each building gets a roof of its own, cut
// along its outline and laid inside its parapet: in the colour its real roof
// has (read from the satellite photo, which is never shown, or on record, or
// else one of the shades concrete weathers to), covered with slabs, gravel or
// metal sheet by the kind of building. Every point of it is then worked out
// where it is drawn (see scene.js): its joints and its grain, the sun on it
// and the shadow of its neighbours. The parapet round a roof throws a strip
// of shade onto it, which is made here too.
//
// Nothing here touches the browser. Places are [lng, lat]; the scene's own
// measure is metres east and north of an origin.

import earcut from '../vendor/earcut/earcut.js';
import { localRing, seedOf } from './walls.js';

const METERS_PER_DEGREE = 111320;

// What a roof is covered with: its place in this list is what the drawing goes by.
export const ROOFINGS = ['slabs', 'gravel', 'sheet'];
// A roof whose colour nobody could tell gets one of these: concrete, screed and paint, in the shades they weather to.
export const ROOF_TINTS = ['#e4dfd3', '#d9d2c3', '#d6d3cc', '#e8e4da', '#cfc8b8', '#cccac4', '#ddd1bd'];
const TALL_FROM_METERS = 28;
// The shade a parapet throws: about the colour and the strength of the shadows the map lays on the ground,
// and dark enough to be known for shade where it is drawn, so that it is left out where a neighbour's
// shadow already lies (see scene.js).
const SHADE = [16, 20, 32];
const SHADE_STRENGTH = 0.42;

/**
 * What a building's roof is covered with: metal sheet on a works, a shed or
 * a store in its chain's dress; gravel on a tall building; slabs of concrete
 * on everything else. (A building may say for itself, as `roofing`.)
 */
export function roofingOf(building) {
  if (ROOFINGS.includes(building.roofing)) return building.roofing; // it says so itself
  if (building.replaced || building.use === 'industrial' || building.use === 'agricultural' || building.use === 'outbuilding') return 'sheet';
  if (building.height >= TALL_FROM_METERS) return 'gravel';
  return 'slabs';
}

/**
 * The corners of the roofs' triangles: where each is, where on its roof (in
 * metres along the building and across it, from its middle), and its roof's
 * colour and covering.
 */
export class RoofMesh {
  constructor(corners = 4096) {
    this.positions = new Float32Array(corners * 3);
    this.lays = new Float32Array(corners * 2);
    this.tints = new Uint8Array(corners * 4); // red, green, blue; and the covering (× 64) with the building's own number
    this.count = 0;
  }

  clear() {
    this.count = 0;
  }

  room(corners) {
    if (this.count + corners <= this.positions.length / 3) return;
    const size = Math.max((this.count + corners) * 2, 4096);
    const grown = (old, each, Kind) => {
      const next = new Kind(size * each);
      next.set(old.subarray(0, this.count * each));
      return next;
    };
    this.positions = grown(this.positions, 3, Float32Array);
    this.lays = grown(this.lays, 2, Float32Array);
    this.tints = grown(this.tints, 4, Uint8Array);
  }

  corner(x, y, z, along, across, red, green, blue, style) {
    const i = this.count;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.lays[i * 2] = along;
    this.lays[i * 2 + 1] = across;
    this.tints[i * 4] = red;
    this.tints[i * 4 + 1] = green;
    this.tints[i * 4 + 2] = blue;
    this.tints[i * 4 + 3] = style;
    this.count += 1;
  }
}

const tint = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/**
 * Lay a roof on every building.
 *
 * buildings: [{ id, height, base, kind, use, replaced, roofTop, polygons }]
 * as buildingFootprints() gives them, each polygon a list of rings of
 * [lng, lat] (a courtyard is left open).
 * origin: { lng, lat }, the place the scene measures from. cap: how far above
 * a building's height the map's own roof ends, and lift: how far above that
 * the roof is laid, in metres. (A building drawn by other means says where
 * its roof ends itself, as roofTop.) colourOf(building): its roof's colour as
 * [red, green, blue], or null for one of the usual shades.
 *
 * The mesh is filled with every roof's triangles. Returns how many outlines
 * got their roof.
 *
 * Left as they are: stations, which have a vault, and what a model stands in
 * for, unless that model says where its own roof lies.
 */
export function roofDecks(mesh, buildings, origin, { cap = 0, lift = 0, colourOf = () => null } = {}) {
  mesh.clear();
  let roofs = 0;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  for (const building of buildings) {
    if (building.kind === 'station') continue;
    if (building.replaced && !(building.roofTop > 0)) continue;
    const base = building.base > 0 ? building.base : 0;
    if (!(building.height > base)) continue;
    const z = (building.roofTop > 0 ? building.roofTop : building.height + cap) + lift;
    const seed = seedOf(building.id);
    const [red, green, blue] = colourOf(building) ?? tint(ROOF_TINTS[seed % ROOF_TINTS.length]);
    const style = ROOFINGS.indexOf(roofingOf(building)) * 64 + seed;
    for (const polygon of building.polygons) {
      // Each ring without its closing corner, in the scene's metres.
      const flat = [];
      const holes = [];
      let outline = 0;
      for (let r = 0; r < polygon.length; r += 1) {
        const ring = polygon[r];
        const count = ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
        if (count < 3) {
          if (r === 0) break; // no outline: no roof
          continue;
        }
        if (r > 0) holes.push(flat.length / 2);
        else outline = count;
        for (let i = 0; i < count; i += 1) flat.push((ring[i][0] - origin.lng) * squeeze, (ring[i][1] - origin.lat) * METERS_PER_DEGREE);
      }
      if (flat.length < 6) continue;
      const triangles = earcut(flat, holes, 2);
      if (triangles.length < 3) continue;
      // The way the building runs: along its longest wall. Its roof is measured that way, from the middle of its outline.
      let middleX = 0;
      let middleY = 0;
      let longest = 0;
      let east = 1;
      let north = 0;
      for (let i = 0; i < outline; i += 1) {
        const next = (i + 1) % outline;
        middleX += flat[i * 2] / outline;
        middleY += flat[i * 2 + 1] / outline;
        const dx = flat[next * 2] - flat[i * 2];
        const dy = flat[next * 2 + 1] - flat[i * 2 + 1];
        const length = Math.hypot(dx, dy);
        if (length > longest) {
          longest = length;
          east = dx / length;
          north = dy / length;
        }
      }
      mesh.room(triangles.length);
      for (const index of triangles) {
        const x = flat[index * 2];
        const y = flat[index * 2 + 1];
        mesh.corner(x, y, z, (x - middleX) * east + (y - middleY) * north, (y - middleY) * east - (x - middleX) * north, red, green, blue, style);
      }
      roofs += 1;
    }
  }
  return roofs;
}

/**
 * A colour for a roof as it is drawn, from the colour the satellite photo
 * shows it in: [red, green, blue], each 0 to 255.
 *
 * The photo's colour is that of an old roof under a hard sun, dusty and
 * uneven. The roof keeps its hue, a little calmed, and is as light as a
 * swept roof of that kind would be: a pale one pale, a dark one a middling
 * grey, never black.
 */
export function roofTone([red, green, blue]) {
  const most = Math.max(red, green, blue);
  const least = Math.min(red, green, blue);
  const light = (most + least) / 510;
  // How strong the roof's colour is (what little colour a very dark roof has is not to be trusted), and how much of it is kept.
  const strength = (most - least) / Math.max(most, 48);
  const kept = Math.min(strength * 0.8, 0.34);
  const bright = 128 + 104 * Math.min(Math.max((light - 0.22) / 0.56, 0), 1);
  return [red, green, blue].map((part) => {
    const short = (most - part) / Math.max(most - least, 1); // 0 for the strongest part, 1 for the weakest
    return Math.round(bright * (1 - kept * short));
  });
}

/**
 * What of an outline lies inside a window: both are lists of [x, y] corners
 * in order round their edge, neither repeating its first at the end, and the
 * window has no dents. Returns the corners of what is left, or null if
 * nothing is. (The outline is cut along one edge of the window at a time.)
 */
export function clipToWindow(outline, window) {
  let doubled = 0;
  for (let i = 0; i < window.length; i += 1) {
    const [x0, y0] = window[i];
    const [x1, y1] = window[(i + 1) % window.length];
    doubled += x0 * y1 - x1 * y0;
  }
  if (Math.abs(doubled) < 1e-9) return null;
  const turn = doubled > 0 ? 1 : -1;
  let points = outline;
  for (let i = 0; i < window.length; i += 1) {
    if (points.length < 3) return null;
    const [px, py] = window[i];
    const [qx, qy] = window[(i + 1) % window.length];
    const inside = (point) => ((qx - px) * (point[1] - py) - (qy - py) * (point[0] - px)) * turn;
    const kept = [];
    for (let k = 0; k < points.length; k += 1) {
      const here = points[k];
      const next = points[(k + 1) % points.length];
      const a = inside(here);
      const b = inside(next);
      if (a >= 0) kept.push(here);
      if (a >= 0 !== b >= 0) {
        const t = a / (a - b);
        kept.push([here[0] + (next[0] - here[0]) * t, here[1] + (next[1] - here[1]) * t]);
      }
    }
    points = kept;
  }
  return points.length >= 3 ? points : null;
}

/**
 * Add a patch of shade to a mesh of coloured corners (see Mesh in life.js):
 * what of a window lies on a roof, at a height. Returns whether anything was added.
 */
export function shadeOnRoof(mesh, outline, window, z, strength = SHADE_STRENGTH) {
  const patch = clipToWindow(outline, window);
  if (!patch) return false;
  const flat = patch.flat();
  const triangles = earcut(flat, null, 2);
  if (triangles.length < 3) return false;
  mesh.room(triangles.length);
  for (const index of triangles) mesh.corner(flat[index * 2], flat[index * 2 + 1], z, SHADE[0], SHADE[1], SHADE[2], strength);
  return true;
}

/**
 * The shade the parapets throw on their own roofs: along every stretch of
 * parapet that stands between the sun and the roof, a strip as wide as the
 * parapet is tall and the sun is low.
 *
 * mesh: a Mesh of coloured corners (see life.js). buildings: as for
 * roofDecks(), those that were cut to their map tile with `within` set (the
 * cut is no parapet). fall: how far a shadow falls for each metre of height,
 * [east, north], as shadowFall() gives it, or null by night. cap, lift: as
 * for roofDecks(). parapet: how far the walls stand above the roof, and
 * thick: how thick they are (the shade begins at their inner side). up: how
 * far above the roof the shade is laid, to show on it.
 *
 * Returns the number of strips.
 */
export function parapetShade(mesh, buildings, origin, fall, { cap = 0, lift = 0, parapet = 0.6, thick = 0, up = 0.05 } = {}) {
  mesh.clear();
  if (!fall) return 0;
  const shiftX = fall[0] * parapet;
  const shiftY = fall[1] * parapet;
  if (Math.hypot(shiftX, shiftY) < 0.08) return 0; // the sun all but overhead: no shade to speak of
  let strips = 0;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  for (const building of buildings) {
    if (building.replaced || building.kind === 'station') continue; // no parapet of the app's own there
    const base = building.base > 0 ? building.base : 0;
    if (!(building.height > base)) continue;
    const z = building.height + cap + lift + up;
    for (const polygon of building.polygons) {
      const rings = polygon.map((ring) => localRing(ring, origin, squeeze, building.within));
      const outline = rings[0];
      if (!outline || outline.length < 3) continue;
      rings.forEach((ring, r) => {
        const count = ring.length;
        if (count < 3) return;
        let doubled = 0;
        for (let i = 0; i < count; i += 1) {
          const [x0, y0] = ring[i];
          const [x1, y1] = ring[(i + 1) % count];
          doubled += x0 * y1 - x1 * y0;
        }
        // (Round an outline that runs anticlockwise the roof is on the left of each stretch; round a courtyard it is the other way about.)
        const side = doubled > 0 !== r > 0 ? 1 : -1;
        for (let i = 0; i < count; i += 1) {
          const from = ring[i];
          const to = ring[(i + 1) % count];
          if (from.open) continue;
          const dx = to[0] - from[0];
          const dy = to[1] - from[1];
          const length = Math.hypot(dx, dy);
          if (length < 0.3) continue;
          // How far in from this stretch the shade reaches: nothing where the parapet's shadow falls outwards.
          const reach = ((dx * shiftY - dy * shiftX) * side) / length;
          if (reach < 0.06) continue;
          // (From the parapet's inner side: the way into the roof is to the left of the stretch, or to the right.)
          const inX = ((-dy * side) / length) * thick;
          const inY = ((dx * side) / length) * thick;
          const a = [from[0] + inX, from[1] + inY];
          const b = [to[0] + inX, to[1] + inY];
          if (shadeOnRoof(mesh, outline, [a, b, [b[0] + shiftX, b[1] + shiftY], [a[0] + shiftX, a[1] + shiftY]], z)) strips += 1;
        }
      });
    }
  }
  return strips;
}
