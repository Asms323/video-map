// The real roofs of the 3D city. The satellite photo that lies on the ground
// is laid on the buildings too: each roof is cut out of the photo along the
// building's outline and lifted to the top of its walls, so a roof shows what
// is really on it.
//
// Nothing here touches the browser. Places are [lng, lat]; the scene's own
// measure is metres east and north of an origin.

import earcut from '../vendor/earcut/earcut.js';
import { worldPixel } from './sight.js';

const TILE_PIXELS = 256;
const METERS_PER_DEGREE = 111320;

// A roof is only as well placed in the photo as the building is low: the
// photo is taken a little from the side, and a tall building leans in it.
export const PHOTO_ROOF_MOST_METERS = 32;
// The picture the roofs are cut from is at most this many photo tiles across.
export const MOSAIC_MOST_TILES = 8;

/** Triangles with a place in a picture at each corner, for the scene to draw. */
export class PhotoMesh {
  constructor(corners = 4096) {
    this.positions = new Float32Array(corners * 3);
    this.places = new Float32Array(corners * 2);
    this.count = 0;
  }

  clear() {
    this.count = 0;
  }

  room(corners) {
    if (this.count + corners <= this.positions.length / 3) return;
    const size = Math.max((this.count + corners) * 2, 4096);
    const positions = new Float32Array(size * 3);
    positions.set(this.positions.subarray(0, this.count * 3));
    const places = new Float32Array(size * 2);
    places.set(this.places.subarray(0, this.count * 2));
    this.positions = positions;
    this.places = places;
  }

  corner(x, y, z, u, v) {
    const p = this.count * 3;
    const t = this.count * 2;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.places[t] = u;
    this.places[t + 1] = v;
    this.count += 1;
  }
}

/**
 * The photo tiles that cover a box { west, south, east, north } at a zoom
 * level, as a range of tile numbers { x0, y0, x1, y1 } (inclusive). Where the
 * box is larger than `most` tiles across, the range keeps to its middle.
 */
export function tileRange(box, zoom, most = MOSAIC_MOST_TILES) {
  const [left, top] = worldPixel(box.west, box.north, zoom);
  const [right, bottom] = worldPixel(box.east, box.south, zoom);
  const trim = (low, high) => {
    let first = Math.floor(low / TILE_PIXELS);
    let last = Math.floor(high / TILE_PIXELS);
    while (last - first + 1 > most) {
      // Give up the tile that reaches furthest from the middle.
      const middle = (low + high) / 2 / TILE_PIXELS;
      if (middle - first > last + 1 - middle) first += 1;
      else last -= 1;
    }
    return [first, last];
  };
  const [x0, x1] = trim(left, right);
  const [y0, y1] = trim(top, bottom);
  return { x0, y0, x1, y1 };
}

/**
 * Photo tiles laid edge to edge as one square picture, its side a power of
 * two (which is what lets it be drawn smoothly from afar).
 *
 * tiles: Map of "x/y" → { width, height, data } (red, green, blue, alpha).
 * Returns { zoom, size, left, top, right, bottom, data, missing }: where the
 * picture's corners fall in the world-wide picture of that zoom level, its
 * pixels, and the "x/y" of the tiles that could not be had (left clear).
 */
export function photoMosaic(tiles, zoom, range) {
  const columns = range.x1 - range.x0 + 1;
  const rows = range.y1 - range.y0 + 1;
  let size = TILE_PIXELS;
  while (size < Math.max(columns, rows) * TILE_PIXELS) size *= 2;
  const data = new Uint8Array(size * size * 4);
  const missing = new Set();
  for (let ty = range.y0; ty <= range.y1; ty += 1) {
    for (let tx = range.x0; tx <= range.x1; tx += 1) {
      const key = `${tx}/${ty}`;
      const tile = tiles.get(key);
      if (!tile || tile.width !== TILE_PIXELS || tile.height !== TILE_PIXELS) {
        missing.add(key);
        continue;
      }
      const across = (tx - range.x0) * TILE_PIXELS;
      const down = (ty - range.y0) * TILE_PIXELS;
      for (let row = 0; row < TILE_PIXELS; row += 1) {
        const from = row * TILE_PIXELS * 4;
        data.set(tile.data.subarray(from, from + TILE_PIXELS * 4), ((down + row) * size + across) * 4);
      }
    }
  }
  return {
    zoom,
    size,
    left: range.x0 * TILE_PIXELS,
    top: range.y0 * TILE_PIXELS,
    right: (range.x1 + 1) * TILE_PIXELS,
    bottom: (range.y1 + 1) * TILE_PIXELS,
    data,
    missing,
  };
}

/**
 * Cut the roofs of buildings out of a photo mosaic.
 *
 * buildings: [{ id, height, base, kind, replaced, roofTop, polygons }] as
 * buildingFootprints() gives them, each polygon a list of rings of [lng, lat].
 * origin: { lng, lat }, the place the scene measures from. cap: how far above
 * a building's height the map's own roof ends, and lift: how far above that
 * the photo is laid, in metres. (A building drawn by other means says where
 * its roof ends itself, as roofTop.)
 *
 * The mesh is filled with every roof's triangles. Returns how many outlines
 * got their roof. Only where the mosaic lies is used, not its pixels: one
 * that has handed its pixels to the map serves as well.
 *
 * Left as they are: buildings taller than PHOTO_ROOF_MOST_METERS, those with a
 * roof of their own (stations, and what a model stands in for), parts that
 * start above the ground, and outlines the mosaic does not wholly cover.
 */
export function photoRoofs(mesh, buildings, mosaic, origin, { cap = 0, lift = 0 } = {}) {
  mesh.clear();
  let roofs = 0;
  if (!mosaic) return roofs;
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  const { size } = mosaic;
  for (const building of buildings) {
    if (building.kind === 'station' || building.base > 0 || !(building.height <= PHOTO_ROOF_MOST_METERS)) continue;
    if (building.replaced && !(building.roofTop > 0)) continue;
    const z = (building.roofTop > 0 ? building.roofTop : building.height + cap) + lift;
    for (const polygon of building.polygons) {
      // Each ring without its closing corner, as places in the mosaic (pixels) and in the scene (metres).
      const flat = [];
      const holes = [];
      const places = [];
      let covered = true;
      for (let r = 0; r < polygon.length && covered; r += 1) {
        const ring = polygon[r];
        const count = ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
        if (count < 3) {
          if (r === 0) covered = false;
          continue;
        }
        if (r > 0) holes.push(flat.length / 2);
        for (let i = 0; i < count; i += 1) {
          const [lng, lat] = ring[i];
          const [px, py] = worldPixel(lng, lat, mosaic.zoom);
          if (px < mosaic.left || px > mosaic.right || py < mosaic.top || py > mosaic.bottom || mosaic.missing.has(`${Math.floor(px / TILE_PIXELS)}/${Math.floor(py / TILE_PIXELS)}`)) {
            covered = false;
            break;
          }
          flat.push(px - mosaic.left, py - mosaic.top);
          places.push([(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]);
        }
      }
      if (!covered || flat.length < 6) continue;
      const triangles = earcut(flat, holes, 2);
      if (triangles.length < 3) continue;
      mesh.room(triangles.length);
      for (const index of triangles) mesh.corner(places[index][0], places[index][1], z, flat[index * 2] / size, flat[index * 2 + 1] / size);
      roofs += 1;
    }
  }
  return roofs;
}
