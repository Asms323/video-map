import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MOSAIC_MOST_TILES, PHOTO_ROOF_MOST_METERS, PhotoMesh, photoMosaic, photoRoofs, tileRange } from '../js/roofs.js';
import { worldPixel } from '../js/sight.js';

const ZOOM = 17;
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
/** The place [lng, lat] of a pixel of the world-wide picture at ZOOM. */
const placeOf = (px, py) => {
  const size = 256 * 2 ** ZOOM;
  return [(px / size) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / size))) * 180) / Math.PI];
};
/** A photo tile of one colour, or of two: its left half one, its right half the other. */
const tile = (left, right = left) => {
  const data = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) data.set([...(x < 128 ? left : right), 255], (y * 256 + x) * 4);
  }
  return { width: 256, height: 256, data };
};
// A patch of Riyadh: tiles 82530…82532 across and 56246…56247 down.
const X0 = 82530;
const Y0 = 56246;
const RANGE = { x0: X0, y0: Y0, x1: X0 + 2, y1: Y0 + 1 };
const RED = [200, 40, 40];
const SAND = [210, 190, 160];
const GREY = [120, 120, 120];
const tiles = () =>
  new Map([
    [`${X0}/${Y0}`, tile(RED, SAND)],
    [`${X0 + 1}/${Y0}`, tile(GREY)],
    [`${X0 + 2}/${Y0}`, tile(SAND)],
    [`${X0}/${Y0 + 1}`, tile(SAND)],
    [`${X0 + 1}/${Y0 + 1}`, tile(GREY)],
    // (X0 + 2, Y0 + 1) could not be had
  ]);
/** A building whose outline is a box of mosaic pixels: left, top, right, bottom, counted from the mosaic's corner. */
const building = (id, [left, top, right, bottom], more = {}) => {
  const corner = (x, y) => placeOf(X0 * 256 + x, Y0 * 256 + y);
  const ring = [corner(left, bottom), corner(right, bottom), corner(right, top), corner(left, top), corner(left, bottom)];
  return { id, height: 9, base: 0, polygons: [[ring]], ...more };
};
const ORIGIN = (() => {
  const [lng, lat] = placeOf(X0 * 256 + 384, Y0 * 256 + 256);
  return { lng, lat };
})();
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => ({ x: mesh.positions[i * 3], y: mesh.positions[i * 3 + 1], z: mesh.positions[i * 3 + 2], u: mesh.places[i * 2], v: mesh.places[i * 2 + 1] }));
/** The area of a mesh's triangles on the ground, in square metres. */
const areaOf = (list) => {
  let area = 0;
  for (let i = 0; i < list.length; i += 3) area += Math.abs((list[i + 1].x - list[i].x) * (list[i + 2].y - list[i].y) - (list[i + 2].x - list[i].x) * (list[i + 1].y - list[i].y)) / 2;
  return area;
};

test('tileRange names the photo tiles under a box, and keeps to its middle when the box is too large', () => {
  const [west, north] = placeOf(X0 * 256 + 10, Y0 * 256 + 10);
  const [east, south] = placeOf(X0 * 256 + 700, Y0 * 256 + 300);
  assert.deepEqual(tileRange({ west, south, east, north }, ZOOM), RANGE);
  // The same box one zoom level finer lies on twice as many tiles.
  const fine = tileRange({ west, south, east, north }, ZOOM + 1);
  assert.deepEqual(fine, { x0: X0 * 2, y0: Y0 * 2, x1: X0 * 2 + 5, y1: Y0 * 2 + 2 });
  // Twenty tiles across and three down: only the eight in the middle across are kept, and all three down.
  const [farEast] = placeOf(X0 * 256 + 20 * 256 - 10, 0);
  const wide = tileRange({ west, south, east: farEast, north }, ZOOM);
  assert.equal(wide.x1 - wide.x0 + 1, MOSAIC_MOST_TILES);
  assert.deepEqual([wide.x0, wide.x1], [X0 + 6, X0 + 13]);
  assert.deepEqual([wide.y0, wide.y1], [Y0, Y0 + 1]);
  assert.deepEqual(tileRange({ west, south, east: farEast, north }, ZOOM, 2), { x0: X0 + 9, y0: Y0, x1: X0 + 10, y1: Y0 + 1 });
});

test('photoMosaic lays the tiles edge to edge as one square picture', () => {
  const mosaic = photoMosaic(tiles(), ZOOM, RANGE);
  // Three tiles across: the next power of two is 1024.
  assert.equal(mosaic.size, 1024);
  assert.equal(mosaic.data.length, 1024 * 1024 * 4);
  assert.deepEqual([mosaic.left, mosaic.top, mosaic.right, mosaic.bottom], [X0 * 256, Y0 * 256, (X0 + 3) * 256, (Y0 + 2) * 256]);
  const at = (x, y) => Array.from(mosaic.data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4));
  assert.deepEqual(at(0, 0), [...RED, 255]);
  assert.deepEqual(at(127, 255), [...RED, 255]);
  assert.deepEqual(at(128, 0), [...SAND, 255]);
  assert.deepEqual(at(256, 100), [...GREY, 255]);
  assert.deepEqual(at(600, 10), [...SAND, 255]);
  assert.deepEqual(at(300, 300), [...GREY, 255]);
  // The tile that could not be had is left clear and named; so is everything past the tiles.
  assert.deepEqual([...mosaic.missing], [`${X0 + 2}/${Y0 + 1}`]);
  assert.deepEqual(at(600, 300), [0, 0, 0, 0]);
  assert.deepEqual(at(900, 900), [0, 0, 0, 0]);
  // A tile of another size is not trusted either.
  const odd = tiles();
  odd.set(`${X0}/${Y0}`, { width: 512, height: 512, data: new Uint8Array(512 * 512 * 4) });
  assert.ok(photoMosaic(odd, ZOOM, RANGE).missing.has(`${X0}/${Y0}`));
  // One tile on its own makes a picture of its own size.
  assert.equal(photoMosaic(tiles(), ZOOM, { x0: X0, y0: Y0, x1: X0, y1: Y0 }).size, 256);
});

test('photoRoofs cuts each roof out of the picture along the outline and lifts it onto the building', () => {
  const mosaic = photoMosaic(tiles(), ZOOM, RANGE);
  const mesh = new PhotoMesh(6);
  const house = building(1, [20, 30, 60, 80]); // on the red half of the first tile
  assert.equal(photoRoofs(mesh, [house], mosaic, ORIGIN, { cap: 1.2, lift: 0.3 }), 1);
  const list = corners(mesh);
  assert.equal(list.length, 6, 'a four-cornered roof is two triangles');
  // Up on the roof: the building's height, the slab the map draws on it, and a little more.
  assert.ok(list.every((corner) => near(corner.z, 9 + 1.2 + 0.3)));
  // Each corner shows the place in the picture that lies under it.
  assert.deepEqual([...new Set(list.map((corner) => `${(corner.u * 1024).toFixed(2)},${(corner.v * 1024).toFixed(2)}`))].sort(), ['20.00,30.00', '20.00,80.00', '60.00,30.00', '60.00,80.00']);
  // And stands where the building does: about 1.09 m to the pixel here, north upwards.
  const perPixel = (40075016.686 * Math.cos((ORIGIN.lat * Math.PI) / 180)) / (256 * 2 ** ZOOM);
  const west = Math.min(...list.map((corner) => corner.x));
  const north = Math.max(...list.map((corner) => corner.y));
  assert.ok(near(west, (20 - 384) * perPixel, 0.5) && near(north, (256 - 30) * perPixel, 0.5), `${west}, ${north}`);
  assert.ok(near(areaOf(list), 40 * 50 * perPixel * perPixel, 6), `${areaOf(list)} m²`);
});

test('photoRoofs leaves a courtyard open', () => {
  const mosaic = photoMosaic(tiles(), ZOOM, RANGE);
  const mesh = new PhotoMesh();
  const block = building(2, [88, 100, 168, 180]);
  const yard = building(0, [118, 130, 138, 150]).polygons[0][0].slice().reverse();
  block.polygons[0].push(yard);
  assert.equal(photoRoofs(mesh, [block], mosaic, ORIGIN, { cap: 1.2, lift: 0.3 }), 1);
  const perPixel = (40075016.686 * Math.cos((ORIGIN.lat * Math.PI) / 180)) / (256 * 2 ** ZOOM);
  const list = corners(mesh);
  assert.ok(near(areaOf(list), (80 * 80 - 20 * 20) * perPixel * perPixel, 10), 'the outline less its courtyard');
  // No triangle has its middle in the yard.
  for (let i = 0; i < list.length; i += 3) {
    const u = ((list[i].u + list[i + 1].u + list[i + 2].u) / 3) * 1024;
    const v = ((list[i].v + list[i + 1].v + list[i + 2].v) / 3) * 1024;
    assert.ok(!(u > 118 && u < 138 && v > 130 && v < 150), `${u}, ${v}`);
  }
});

test('photoRoofs keeps to low buildings the picture wholly covers, and to roofs nothing else is drawn on', () => {
  const mosaic = photoMosaic(tiles(), ZOOM, RANGE);
  const mesh = new PhotoMesh();
  const cut = photoRoofs(
    mesh,
    [
      building(1, [20, 30, 60, 80]),
      building(2, [300, 30, 340, 80], { height: PHOTO_ROOF_MOST_METERS + 1 }), // a tower leans in the photo
      building(3, [300, 100, 340, 150], { kind: 'station' }), // has a vault
      building(4, [300, 170, 340, 220], { base: 12, height: 20 }), // a part that starts above the ground
      building(5, [400, 30, 440, 80], { replaced: true }), // a landmark's model stands here
      building(6, [400, 100, 440, 150], { replaced: true, roofTop: 6.5 }), // a store in its chain's dress, with a roof of its own
      building(7, [500, 200, 560, 290]), // reaches onto the tile that is missing
      building(8, [-20, 30, 10, 80]), // reaches past the picture's edge
      building(9, [560, 30, 600, 80], { height: PHOTO_ROOF_MOST_METERS }),
      { ...building(10, [640, 30, 680, 80]), id: undefined }, // a building the map gives no number: a roof like any other
    ],
    mosaic,
    ORIGIN,
    { cap: 1.2, lift: 0.3 },
  );
  assert.equal(cut, 4);
  const heights = [...new Set(corners(mesh).map((corner) => corner.z.toFixed(2)))].sort();
  assert.deepEqual(heights, ['10.50', '33.50', '6.80'], 'the store\'s photo lies on its own roof');
  assert.equal(mesh.count, 4 * 6);

  // A picture already handed to the map has let go of its pixels: the roofs are cut all the same.
  assert.equal(photoRoofs(mesh, [building(1, [20, 30, 60, 80])], { ...mosaic, data: null }, ORIGIN, { cap: 1.2, lift: 0.3 }), 1);
  assert.equal(mesh.count, 6, 'the mesh is started afresh each time');
  // Without a picture there is nothing to cut.
  assert.equal(photoRoofs(mesh, [building(1, [20, 30, 60, 80])], null, ORIGIN), 0);
  assert.equal(mesh.count, 0);
});

test('a PhotoMesh makes room as it fills', () => {
  const mesh = new PhotoMesh(3);
  for (let i = 0; i < 10; i += 1) {
    mesh.room(3);
    mesh.corner(i, 0, 1, 0.1, 0.2);
    mesh.corner(i, 1, 1, 0.3, 0.4);
    mesh.corner(i + 1, 0, 1, 0.5, 0.6);
  }
  assert.equal(mesh.count, 30);
  assert.ok(mesh.positions.length >= 90 && mesh.places.length >= 60);
  assert.deepEqual(Array.from(mesh.positions.subarray(27 * 3, 30 * 3)), [9, 0, 1, 9, 1, 1, 10, 0, 1]);
  assert.ok(near(mesh.places[59], 0.6, 1e-6));
  mesh.clear();
  assert.equal(mesh.count, 0);
});
