import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHOTO_ROOF_MOST_METERS, RoofMesh, photoRoofs } from '../js/roofs.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const SQUEEZE = 111320 * Math.cos((24.7 * Math.PI) / 180);
const near = (a, b, by = 1e-3) => Math.abs(a - b) <= by;
/** [lng, lat] of a place given in metres east and north of the origin. */
const at = (east, north) => [ORIGIN.lng + east / SQUEEZE, ORIGIN.lat + north / 111320];
/** A building whose outline is a box in metres: west, south, east, north. */
const building = ([west, south, east, north], more = {}) => ({
  height: 9,
  base: 0,
  polygons: [[[at(west, south), at(east, south), at(east, north), at(west, north), at(west, south)]]],
  ...more,
});
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => ({ x: mesh.positions[i * 3], y: mesh.positions[i * 3 + 1], z: mesh.positions[i * 3 + 2] }));
/** The area of a mesh's triangles on the ground, in square metres. */
const areaOf = (list) => {
  let area = 0;
  for (let i = 0; i < list.length; i += 3) area += Math.abs((list[i + 1].x - list[i].x) * (list[i + 2].y - list[i].y) - (list[i + 2].x - list[i].x) * (list[i + 1].y - list[i].y)) / 2;
  return area;
};

test('photoRoofs cuts each roof along its outline and lifts it onto the building', () => {
  const mesh = new RoofMesh(6);
  assert.equal(photoRoofs(mesh, [building([20, 30, 60, 80])], ORIGIN, { cap: 1.2, lift: 0.3 }), 1);
  const list = corners(mesh);
  assert.equal(list.length, 6, 'a four-cornered roof is two triangles');
  // Up on the roof: the building's height, the slab the map draws on it, and a little more.
  assert.ok(list.every((corner) => near(corner.z, 9 + 1.2 + 0.3, 1e-5)));
  // And where the building stands, in metres east and north of the scene's origin.
  assert.deepEqual([...new Set(list.map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`))].sort(), ['20.00,30.00', '20.00,80.00', '60.00,30.00', '60.00,80.00']);
  assert.ok(near(areaOf(list), 40 * 50, 0.01));
  // Measured from another origin, the same roof is somewhere else in the scene.
  photoRoofs(mesh, [building([20, 30, 60, 80])], { lng: at(20, 30)[0], lat: at(20, 30)[1] }, { cap: 1.2, lift: 0.3 });
  assert.ok(near(Math.min(...corners(mesh).map((corner) => corner.x)), 0, 0.01) && near(Math.min(...corners(mesh).map((corner) => corner.y)), 0, 0.01));
});

test('photoRoofs leaves a courtyard open', () => {
  const mesh = new RoofMesh();
  const block = building([0, 0, 80, 80]);
  block.polygons[0].push(building([30, 30, 50, 50]).polygons[0][0].slice().reverse());
  assert.equal(photoRoofs(mesh, [block], ORIGIN), 1);
  const list = corners(mesh);
  assert.ok(near(areaOf(list), 80 * 80 - 20 * 20, 0.05), 'the outline less its courtyard');
  // No triangle has its middle in the yard.
  for (let i = 0; i < list.length; i += 3) {
    const x = (list[i].x + list[i + 1].x + list[i + 2].x) / 3;
    const y = (list[i].y + list[i + 1].y + list[i + 2].y) / 3;
    assert.ok(!(x > 30 && x < 50 && y > 30 && y < 50), `${x}, ${y}`);
  }
  assert.ok(list.every((corner) => near(corner.z, 9, 1e-5)), 'with nothing said about the map\'s own roof, at the building\'s height');
});

test('photoRoofs keeps to low buildings, and to roofs nothing else is drawn on', () => {
  const mesh = new RoofMesh();
  const cut = photoRoofs(
    mesh,
    [
      building([20, 30, 60, 80]),
      building([300, 30, 340, 80], { height: PHOTO_ROOF_MOST_METERS + 1 }), // a tower leans in the photo
      building([300, 100, 340, 150], { kind: 'station' }), // has a vault
      building([300, 170, 340, 220], { base: 12, height: 20 }), // a part that starts above the ground
      building([400, 30, 440, 80], { replaced: true }), // a landmark's model stands here
      building([400, 100, 440, 150], { replaced: true, roofTop: 6.5 }), // a store in its chain's dress, with a roof of its own
      building([560, 30, 600, 80], { height: PHOTO_ROOF_MOST_METERS }),
      { ...building([640, 30, 680, 80]), polygons: [[[at(640, 30), at(680, 30), at(640, 30)]]] }, // no outline to speak of
    ],
    ORIGIN,
    { cap: 1.2, lift: 0.3 },
  );
  assert.equal(cut, 3);
  assert.equal(mesh.count, 3 * 6);
  const heights = [...new Set(corners(mesh).map((corner) => corner.z.toFixed(2)))].sort();
  assert.deepEqual(heights, ['10.50', '33.50', '6.80'], 'the store\'s photo lies on its own roof');
  // The mesh is started afresh each time; with no buildings it is empty.
  assert.equal(photoRoofs(mesh, [building([20, 30, 60, 80])], ORIGIN), 1);
  assert.equal(mesh.count, 6);
  assert.equal(photoRoofs(mesh, [], ORIGIN), 0);
  assert.equal(mesh.count, 0);
});

test('a RoofMesh makes room as it fills', () => {
  const mesh = new RoofMesh(3);
  for (let i = 0; i < 10; i += 1) {
    mesh.room(3);
    mesh.corner(i, 0, 1);
    mesh.corner(i, 1, 1);
    mesh.corner(i + 1, 0, 1);
  }
  assert.equal(mesh.count, 30);
  assert.ok(mesh.positions.length >= 90);
  assert.deepEqual(Array.from(mesh.positions.subarray(27 * 3, 30 * 3)), [9, 0, 1, 9, 1, 1, 10, 0, 1]);
  mesh.clear();
  assert.equal(mesh.count, 0);
});
