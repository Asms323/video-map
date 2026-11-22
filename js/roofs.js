// The real roofs of the 3D city. The satellite photo that lies on the ground
// is shown on the buildings too: each roof is cut along its building's
// outline and lifted to the top of the walls, and every point of it shows
// the ground straight beneath it (see scene.js for how). So a roof shows what
// is really on it, as sharp as the ground beside the building.
//
// Nothing here touches the browser. Places are [lng, lat]; the scene's own
// measure is metres east and north of an origin.

import earcut from '../vendor/earcut/earcut.js';

const METERS_PER_DEGREE = 111320;

// A roof is only as well placed in the photo as the building is low: the
// photo is taken a little from the side, and a tall building leans in it.
export const PHOTO_ROOF_MOST_METERS = 32;

/** The triangles of the roofs: three numbers to a corner, its place in the scene's metres. */
export class RoofMesh {
  constructor(corners = 4096) {
    this.positions = new Float32Array(corners * 3);
    this.count = 0;
  }

  clear() {
    this.count = 0;
  }

  room(corners) {
    if (this.count + corners <= this.positions.length / 3) return;
    const positions = new Float32Array(Math.max((this.count + corners) * 2, 4096) * 3);
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
 * Cut the roofs of buildings into triangles.
 *
 * buildings: [{ height, base, kind, replaced, roofTop, polygons }] as
 * buildingFootprints() gives them, each polygon a list of rings of [lng, lat]
 * (a courtyard is left open).
 * origin: { lng, lat }, the place the scene measures from. cap: how far above
 * a building's height the map's own roof ends, and lift: how far above that
 * the photo is laid, in metres. (A building drawn by other means says where
 * its roof ends itself, as roofTop.)
 *
 * The mesh is filled with every roof's triangles. Returns how many outlines
 * got their roof.
 *
 * Left as they are: buildings taller than PHOTO_ROOF_MOST_METERS, those with a
 * roof of their own (stations, and what a model stands in for), and parts
 * that start above the ground.
 */
export function photoRoofs(mesh, buildings, origin, { cap = 0, lift = 0 } = {}) {
  mesh.clear();
  let roofs = 0;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  for (const building of buildings) {
    if (building.kind === 'station' || building.base > 0 || !(building.height <= PHOTO_ROOF_MOST_METERS)) continue;
    if (building.replaced && !(building.roofTop > 0)) continue;
    const z = (building.roofTop > 0 ? building.roofTop : building.height + cap) + lift;
    for (const polygon of building.polygons) {
      // Each ring without its closing corner, in the scene's metres.
      const flat = [];
      const holes = [];
      for (let r = 0; r < polygon.length; r += 1) {
        const ring = polygon[r];
        const count = ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
        if (count < 3) {
          if (r === 0) break; // no outline: no roof
          continue;
        }
        if (r > 0) holes.push(flat.length / 2);
        for (let i = 0; i < count; i += 1) flat.push((ring[i][0] - origin.lng) * squeeze, (ring[i][1] - origin.lat) * METERS_PER_DEGREE);
      }
      if (flat.length < 6) continue;
      const triangles = earcut(flat, holes, 2);
      if (triangles.length < 3) continue;
      mesh.room(triangles.length);
      for (const index of triangles) mesh.corner(flat[index * 2], flat[index * 2 + 1], z);
      roofs += 1;
    }
  }
  return roofs;
}
