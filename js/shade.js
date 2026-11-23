// The shadows that buildings throw on each other: on walls, on roofs, on the
// cars and trees in the street. (The shadows on the ground are worked out as
// outlines and drawn by the map: see buildingShadows in lib.js.)
//
// How it is done. Light from the sun comes in straight parallel rays. Follow
// the ray through any point down to the ground: the place it lands says
// which ray it is, and a point is in shadow when something else on the same
// ray stands higher than it does. So the buildings are drawn once into a
// picture of the ground in which every part of a building is put where its
// ray lands, and the picture keeps, for each spot of ground, the height of
// the highest thing on that ray. To learn whether a point of a wall or a
// roof is in the sun, the picture is asked how high the highest thing on
// its ray is (see scene.js).
//
// What is made here is the buildings as that picture needs them: their tops,
// and the walls that face away from the sun. Nothing here touches the
// browser. Places are [lng, lat]; the scene's own measure is metres east and
// north of an origin.

import earcut from '../vendor/earcut/earcut.js';

const METERS_PER_DEGREE = 111320;

/** Corners of triangles: three numbers each, a place in the scene's metres. */
export class CasterMesh {
  constructor(corners = 8192) {
    this.positions = new Float32Array(corners * 3);
    this.count = 0;
  }

  clear() {
    this.count = 0;
  }

  room(corners) {
    if (this.count + corners <= this.positions.length / 3) return;
    const positions = new Float32Array(Math.max((this.count + corners) * 2, 8192) * 3);
    positions.set(this.positions.subarray(0, this.count * 3));
    this.positions = positions;
  }

  corner(x, y, z) {
    const p = this.count * 3;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.count += 1;
  }
}

/**
 * How far, and which way, a shadow falls for each metre of height:
 * [east, north] in metres. reach: what shadowReach() gives, or null.
 */
export function shadowFall(reach) {
  if (!reach) return null;
  const direction = (reach.bearing * Math.PI) / 180;
  return [Math.sin(direction) * reach.factor, Math.cos(direction) * reach.factor];
}

/**
 * Fill a mesh with what throws the shadows: for every building its top, and
 * those of its walls that face away from the sun. (A wall that faces the sun
 * shades nothing but the inside of its own building.)
 *
 * buildings: [{ height, base, polygons }], each polygon a list of rings of
 * [lng, lat]. origin: { lng, lat }. fall: what shadowFall() gives.
 *
 * Returns { box: [west, south, east, north], top }: the ground the shadows
 * and the buildings cover between them, in the scene's metres, and the
 * height of the tallest; or null when there is nothing to throw a shadow.
 */
export function shadowCasters(mesh, buildings, origin, fall) {
  mesh.clear();
  if (!fall) return null;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let top = 0;
  for (const building of buildings) {
    const base = building.base > 0 ? building.base : 0;
    const height = building.height;
    if (!(height > base)) continue;
    for (const polygon of building.polygons) {
      const flat = [];
      const holes = [];
      for (let r = 0; r < polygon.length; r += 1) {
        const ring = polygon[r];
        const count = ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
        if (count < 3) {
          if (r === 0) break;
          continue;
        }
        if (r > 0) holes.push(flat.length / 2);
        const start = flat.length / 2;
        for (let i = 0; i < count; i += 1) flat.push((ring[i][0] - origin.lng) * squeeze, (ring[i][1] - origin.lat) * METERS_PER_DEGREE);
        // Which way round the ring runs, to tell the outside of each wall from the inside.
        let doubled = 0;
        for (let i = 0; i < count; i += 1) {
          const a = (start + i) * 2;
          const b = (start + ((i + 1) % count)) * 2;
          doubled += flat[a] * flat[b + 1] - flat[b] * flat[a + 1];
        }
        const side = doubled > 0 !== r > 0 ? 1 : -1;
        for (let i = 0; i < count; i += 1) {
          const a = (start + i) * 2;
          const b = (start + ((i + 1) % count)) * 2;
          const dx = flat[b] - flat[a];
          const dy = flat[b + 1] - flat[a + 1];
          // The wall looks outwards along (dy, -dx) × side: kept if that is the way the shadows fall.
          if ((dy * fall[0] - dx * fall[1]) * side <= 0) continue;
          mesh.room(6);
          mesh.corner(flat[a], flat[a + 1], base);
          mesh.corner(flat[b], flat[b + 1], base);
          mesh.corner(flat[b], flat[b + 1], height);
          mesh.corner(flat[a], flat[a + 1], base);
          mesh.corner(flat[b], flat[b + 1], height);
          mesh.corner(flat[a], flat[a + 1], height);
        }
      }
      if (flat.length < 6) continue;
      const triangles = earcut(flat, holes, 2);
      mesh.room(triangles.length);
      for (const index of triangles) mesh.corner(flat[index * 2], flat[index * 2 + 1], height);
      // The ground this building and its shadow cover.
      for (let i = 0; i < flat.length; i += 2) {
        for (const z of [base, height]) {
          const x = flat[i] + z * fall[0];
          const y = flat[i + 1] + z * fall[1];
          if (x < west) west = x;
          if (x > east) east = x;
          if (y < south) south = y;
          if (y > north) north = y;
        }
        if (flat[i] < west) west = flat[i];
        if (flat[i] > east) east = flat[i];
        if (flat[i + 1] < south) south = flat[i + 1];
        if (flat[i + 1] > north) north = flat[i + 1];
      }
      if (height > top) top = height;
    }
  }
  if (mesh.count === 0) return null;
  return { box: [west - 2, south - 2, east + 2, north + 2], top: top + 1 };
}

/**
 * How many spots a side the picture of the shadows needs: enough for a spot
 * to be about `fine` metres of ground, as a power of two, within what the
 * device allows.
 */
export function shadowMapSize(box, fine = 0.8, most = 2048, least = 256) {
  const wide = Math.max(box[2] - box[0], box[3] - box[1]);
  let size = least;
  while (size < most && size < wide / fine) size *= 2;
  return Math.min(size, most);
}

/**
 * The same working-out as the picture does, for anyone who wants to know
 * without drawing: whether a point of the scene is in shadow.
 * casters: a CasterMesh as shadowCasters() fills it. Slow: for tests.
 */
export function shadowed(casters, fall, [x, y, z], margin = 0.01) {
  const gx = x + z * fall[0];
  const gy = y + z * fall[1];
  const p = casters.positions;
  for (let i = 0; i < casters.count; i += 3) {
    // Each corner where its ray lands; then how high the triangle is over this point's ray.
    const a = [p[i * 3] + p[i * 3 + 2] * fall[0], p[i * 3 + 1] + p[i * 3 + 2] * fall[1], p[i * 3 + 2]];
    const b = [p[i * 3 + 3] + p[i * 3 + 5] * fall[0], p[i * 3 + 4] + p[i * 3 + 5] * fall[1], p[i * 3 + 5]];
    const c = [p[i * 3 + 6] + p[i * 3 + 8] * fall[0], p[i * 3 + 7] + p[i * 3 + 8] * fall[1], p[i * 3 + 8]];
    const whole = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(whole) < 1e-9) continue;
    const u = ((b[0] - gx) * (c[1] - gy) - (c[0] - gx) * (b[1] - gy)) / whole;
    const v = ((c[0] - gx) * (a[1] - gy) - (a[0] - gx) * (c[1] - gy)) / whole;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    if (u * a[2] + v * b[2] + w * c[2] > z + margin) return true;
  }
  return false;
}
