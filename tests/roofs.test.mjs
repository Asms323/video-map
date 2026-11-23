import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Mesh } from '../js/life.js';
import { ROOFINGS, ROOF_TINTS, RoofMesh, clipToWindow, parapetShade, roofDecks, roofTone, roofingOf, shadeOnRoof } from '../js/roofs.js';
import { seedOf } from '../js/walls.js';

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
const hex = (text) => [1, 3, 5].map((start) => parseInt(text.slice(start, start + 2), 16));

test('roofDecks cuts each roof along its outline and lays it above the building, in its own colour', () => {
  const mesh = new RoofMesh(6);
  const house = building([20, 30, 60, 80], { id: 1024 * 77 });
  assert.equal(roofDecks(mesh, [house], ORIGIN, { cap: 1.2, lift: 0.3, colourOf: () => [200, 150, 100] }), 1);
  const list = corners(mesh);
  assert.equal(list.length, 6, 'a four-cornered roof is two triangles');
  // Up on the roof: the building's height, the slab the map draws on it, and a little more.
  assert.ok(list.every((corner) => near(corner.z, 9 + 1.2 + 0.3, 1e-5)));
  // And where the building stands, in metres east and north of the scene's origin.
  assert.deepEqual([...new Set(list.map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`))].sort(), ['20.00,30.00', '20.00,80.00', '60.00,30.00', '60.00,80.00']);
  assert.ok(near(areaOf(list), 40 * 50, 0.01));
  // Each corner knows where on its roof it is: metres along the longest wall (here the one that runs north) and across it, from the middle.
  const lays = new Set();
  for (let i = 0; i < mesh.count; i += 1) lays.add(`${Math.round(mesh.lays[i * 2])},${Math.round(mesh.lays[i * 2 + 1])}`);
  assert.deepEqual([...lays].sort(), ['-25,-20', '-25,20', '25,-20', '25,20']);
  // Its colour, and with it the roofing (slabs, on a low building) and the building's own number.
  for (let i = 0; i < mesh.count; i += 1) assert.deepEqual([...mesh.tints.subarray(i * 4, i * 4 + 4)], [200, 150, 100, ROOFINGS.indexOf('slabs') * 64 + seedOf(1024 * 77)]);
  // Measured from another origin, the same roof is somewhere else in the scene, and is measured the same way.
  const elsewhere = new RoofMesh();
  roofDecks(elsewhere, [house], { lng: at(20, 30)[0], lat: at(20, 30)[1] }, { cap: 1.2, lift: 0.3 });
  assert.ok(near(Math.min(...corners(elsewhere).map((corner) => corner.x)), 0, 0.01) && near(Math.min(...corners(elsewhere).map((corner) => corner.y)), 0, 0.01));
  assert.deepEqual([...new Set(Array.from(elsewhere.lays.subarray(0, 12), (value) => Math.abs(Math.round(value))))].sort(), [20, 25]);
  // With no colour told, one of the usual shades, picked by the building's number: the same every time.
  const usual = hex(ROOF_TINTS[seedOf(1024 * 77) % ROOF_TINTS.length]);
  assert.deepEqual([...elsewhere.tints.subarray(0, 3)], usual);
  assert.equal(ROOF_TINTS.length, 7);
});

test('roofDecks leaves a courtyard open', () => {
  const mesh = new RoofMesh();
  const block = building([0, 0, 80, 80]);
  block.polygons[0].push(building([30, 30, 50, 50]).polygons[0][0].slice().reverse());
  assert.equal(roofDecks(mesh, [block], ORIGIN), 1);
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

test('roofDecks gives every building a roof, tall or low, but for stations and what a model stands in for', () => {
  const mesh = new RoofMesh();
  const laid = roofDecks(
    mesh,
    [
      building([20, 30, 60, 80]),
      building([300, 30, 340, 80], { height: 120 }), // a tower
      building([300, 100, 340, 150], { kind: 'station' }), // has a vault
      building([300, 170, 340, 220], { base: 12, height: 20 }), // a part that starts above the ground
      building([400, 30, 440, 80], { replaced: true }), // a landmark's model stands here
      building([400, 100, 440, 150], { replaced: true, roofTop: 6.5 }), // a store in its chain's dress, with a roof of its own
      building([480, 30, 520, 80], { height: 0 }), // nothing to put a roof on
      { ...building([640, 30, 680, 80]), polygons: [[[at(640, 30), at(680, 30), at(640, 30)]]] }, // no outline to speak of
    ],
    ORIGIN,
    { cap: 1.2, lift: 0.3 },
  );
  assert.equal(laid, 4);
  assert.equal(mesh.count, 4 * 6);
  const heights = [...new Set(corners(mesh).map((corner) => corner.z.toFixed(2)))].sort();
  assert.deepEqual(heights, ['10.50', '121.50', '21.50', '6.80'], 'the store\'s roof lies where its own model ends');
  // The mesh is started afresh each time; with no buildings it is empty.
  assert.equal(roofDecks(mesh, [building([20, 30, 60, 80])], ORIGIN), 1);
  assert.equal(mesh.count, 6);
  assert.equal(roofDecks(mesh, [], ORIGIN), 0);
  assert.equal(mesh.count, 0);
});

test('roofingOf: slabs on a house, gravel on a tall building, sheet on a works and on a store', () => {
  assert.equal(roofingOf({ height: 9, use: 'residential' }), 'slabs');
  assert.equal(roofingOf({ height: 9 }), 'slabs');
  assert.equal(roofingOf({ height: 14, use: 'commercial' }), 'slabs');
  assert.equal(roofingOf({ height: 28 }), 'gravel');
  assert.equal(roofingOf({ height: 150, use: 'commercial' }), 'gravel');
  assert.equal(roofingOf({ height: 9, use: 'industrial' }), 'sheet');
  assert.equal(roofingOf({ height: 6.5, replaced: true, roofTop: 6.5 }), 'sheet');
  assert.deepEqual(ROOFINGS, ['slabs', 'gravel', 'sheet']);
});

test('roofTone keeps a roof\'s hue, calmed, and never lets it be very dark', () => {
  // Sand stays sand, grey stays grey, tiles stay warm.
  const sand = roofTone([200, 185, 160]);
  assert.ok(sand[0] > sand[1] && sand[1] > sand[2] && sand[0] >= 200 && sand[0] - sand[2] < 45, String(sand));
  const grey = roofTone([150, 150, 150]);
  assert.ok(grey[0] === grey[1] && grey[1] === grey[2] && grey[0] > 170 && grey[0] < 215, String(grey));
  const tiles = roofTone([170, 110, 90]);
  assert.ok(tiles[0] - tiles[2] > 40 && tiles[0] - tiles[2] < 80 && tiles[0] > tiles[1] && tiles[1] > tiles[2], String(tiles));
  // The lighter the roof in the photo, the lighter it is drawn; black is a middling grey, white stays short of white.
  const dark = roofTone([40, 40, 40]);
  const white = roofTone([250, 250, 250]);
  assert.ok(dark[0] === 128 && white[0] === 232 && grey[0] > dark[0] && grey[0] < white[0], `${dark} ${grey} ${white}`);
  assert.deepEqual(roofTone([0, 0, 0]), [128, 128, 128]);
  for (const colour of [[255, 0, 0], [0, 255, 0], [10, 20, 200], [90, 200, 255]]) {
    const tone = roofTone(colour);
    assert.ok(tone.every((part) => Number.isInteger(part) && part >= 84 && part <= 232), String(tone));
  }
});

test('clipToWindow keeps what of an outline lies inside a window', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const areaOfRing = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => sum + x * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y, 0)) / 2;
  // A window that hangs over one side: the part over the square is kept.
  const part = clipToWindow(square, [[6, -4], [14, -4], [14, 4], [6, 4]]);
  assert.ok(near(areaOfRing(part), 4 * 4, 1e-9), JSON.stringify(part));
  assert.ok(part.every(([x, y]) => x >= 6 - 1e-9 && x <= 10 + 1e-9 && y >= -1e-9 && y <= 4 + 1e-9));
  // The window may run either way round its edge.
  assert.ok(near(areaOfRing(clipToWindow(square, [[6, 4], [14, 4], [14, -4], [6, -4]])), 16, 1e-9));
  // A window all inside is kept whole; one all outside leaves nothing; so does one with no area.
  assert.ok(near(areaOfRing(clipToWindow(square, [[2, 2], [4, 2], [4, 5], [2, 5]])), 6, 1e-9));
  assert.equal(clipToWindow(square, [[20, 20], [30, 20], [30, 30], [20, 30]]), null);
  assert.equal(clipToWindow(square, [[1, 1], [5, 5], [3, 3]]), null);
  // An outline with a dent: only what is inside both.
  const dented = [[0, 0], [10, 0], [10, 10], [6, 10], [6, 4], [4, 4], [4, 10], [0, 10]];
  assert.ok(near(areaOfRing(clipToWindow(dented, [[0, 6], [10, 6], [10, 9], [0, 9]])), 3 * 4 + 3 * 4, 1e-9));
});

test('shadeOnRoof lays a patch of shade where a window lies on a roof', () => {
  const mesh = new Mesh();
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(shadeOnRoof(mesh, square, [[8, 8], [12, 8], [12, 12], [8, 12]], 10.55), true);
  const list = corners(mesh);
  assert.ok(list.length >= 3 && list.length % 3 === 0 && near(areaOf(list), 4, 1e-6));
  assert.ok(list.every((corner) => near(corner.z, 10.55, 1e-5) && corner.x >= 8 - 1e-6 && corner.x <= 10 + 1e-6 && corner.y >= 8 - 1e-6 && corner.y <= 10 + 1e-6));
  // Dark and see-through, as the shadows on the ground are (stored already multiplied by how solid it is).
  assert.deepEqual([...mesh.colours.subarray(0, 4)], [6, 8, 13, 107]);
  // Nothing of the window on the roof: nothing added.
  assert.equal(shadeOnRoof(mesh, square, [[20, 20], [22, 20], [22, 22], [20, 22]], 10.55), false);
  assert.equal(mesh.count, list.length);
});

test('parapetShade lays a strip of shade along the parapets that stand between the sun and the roof', () => {
  const mesh = new Mesh();
  const house = building([0, 0, 20, 10]);
  // The sun in the south-east, 45° up: shadows fall a metre to the north-west for each metre of height.
  const fall = [-Math.SQRT1_2, Math.SQRT1_2];
  const options = { cap: 1.2, lift: 0.3, parapet: 0.6, thick: 0.3 };
  assert.equal(parapetShade(mesh, [house], ORIGIN, fall, options), 2, 'along the south and the east parapet');
  const list = corners(mesh);
  const reach = 0.6 * Math.SQRT1_2; // how far in from a parapet its shade reaches
  assert.ok(list.every((corner) => near(corner.z, 9 + 1.2 + 0.3 + 0.05, 1e-5)), 'just above the roof');
  // On the roof, and nowhere else: from each parapet's inner side, as far in as the parapet is tall and the sun is low.
  for (const corner of list) {
    assert.ok(corner.x >= -1e-4 && corner.x <= 20 + 1e-4 && corner.y >= -1e-4 && corner.y <= 10 + 1e-4, `${corner.x}, ${corner.y}`);
    const fromSouth = corner.y;
    const fromEast = 20 - corner.x;
    assert.ok(fromSouth <= 0.3 + reach + 1e-4 || fromEast <= 0.3 + reach + 1e-4, `${corner.x}, ${corner.y}`);
  }
  // (Away from the corner where the two meet, each strip begins at its parapet's inner side, not under it.)
  assert.ok(list.every((corner) => corner.x > 19 || corner.y >= 0.3 - 1e-4), 'the south strip');
  assert.ok(list.every((corner) => corner.y < 1 || 20 - corner.x >= 0.3 - 1e-4), 'the east strip');
  assert.ok(near(Math.max(...list.map((corner) => 20 - corner.x).filter((far, i) => list[i].y > 1)), 0.3 + reach, 1e-4));
  // Two strips, each as long as its parapet and as wide as the shade reaches, less the tip that would overhang the far end.
  assert.ok(near(areaOf(list), (20 + 10) * reach - reach * reach, 1e-3), `${areaOf(list)}`);
  assert.deepEqual([...mesh.colours.subarray(0, 4)], [6, 8, 13, 107]);

  // With the sun in the north-west instead, it is the other two parapets.
  parapetShade(mesh, [house], ORIGIN, [Math.SQRT1_2, -Math.SQRT1_2], options);
  assert.ok(corners(mesh).every((corner) => corner.y >= 10 - 0.3 - reach - 1e-4 || corner.x <= 0.3 + reach + 1e-4));
  // A courtyard's parapets shade the roof round it too.
  const block = building([0, 0, 80, 80]);
  block.polygons[0].push(building([30, 30, 50, 50]).polygons[0][0].slice().reverse());
  assert.equal(parapetShade(mesh, [block], ORIGIN, fall, options), 4, 'two of the outline, two of the yard');
  assert.ok(corners(mesh).some((corner) => corner.x < 30 && corner.x > 28 && corner.y > 30 && corner.y < 52), 'west of the yard, where its western parapet stands between the sun and the roof');
  // By night, or with the sun overhead, there is no shade; nor on what has no parapet of the app's own.
  assert.equal(parapetShade(mesh, [house], ORIGIN, null, options), 0);
  assert.equal(mesh.count, 0);
  assert.equal(parapetShade(mesh, [house], ORIGIN, [0.01, 0.01], options), 0);
  assert.equal(parapetShade(mesh, [building([0, 0, 20, 10], { replaced: true, roofTop: 6 }), building([30, 0, 50, 10], { kind: 'station' }), building([60, 0, 80, 10], { height: 0 })], ORIGIN, fall, options), 0);
  // A building cut along the edge of its map tile has no parapet along the cut.
  const [east] = at(20, 0);
  const cut = { ...house, within: { west: at(-50, 0)[0], south: at(0, -50)[1], east, north: at(0, 50)[1] } };
  assert.equal(parapetShade(mesh, [cut], ORIGIN, fall, options), 1, 'the south parapet only: the east side is the cut');
});

test('a RoofMesh makes room as it fills', () => {
  const mesh = new RoofMesh(3);
  for (let i = 0; i < 10; i += 1) {
    mesh.room(3);
    mesh.corner(i, 0, 1, i, 0, 10, 20, 30, 64 + i);
    mesh.corner(i, 1, 1, i, 1, 10, 20, 30, 64 + i);
    mesh.corner(i + 1, 0, 1, i + 1, 0, 10, 20, 30, 64 + i);
  }
  assert.equal(mesh.count, 30);
  assert.ok(mesh.positions.length >= 90 && mesh.lays.length >= 60 && mesh.tints.length >= 120);
  assert.deepEqual(Array.from(mesh.positions.subarray(27 * 3, 30 * 3)), [9, 0, 1, 9, 1, 1, 10, 0, 1]);
  assert.deepEqual(Array.from(mesh.lays.subarray(27 * 2, 30 * 2)), [9, 0, 9, 1, 10, 0]);
  assert.deepEqual(Array.from(mesh.tints.subarray(29 * 4, 30 * 4)), [10, 20, 30, 73]);
  mesh.clear();
  assert.equal(mesh.count, 0);
});
