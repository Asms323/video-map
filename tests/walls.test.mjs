import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Mesh } from '../js/life.js';
import { FACADES, PARAPET_METERS, PARAPET_THICK_METERS, WALL_OUT_METERS, WallMesh, clipRing, colourOf, facadeOf, footShade, parapetTops, seedOf, tilePieces, wallTone, wallsOf, wallsOfRing } from '../js/walls.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const SQUEEZE = 111320 * Math.cos((24.7 * Math.PI) / 180);
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
/** [lng, lat] of a place given in metres east and north of the origin. */
const at = (east, north) => [ORIGIN.lng + east / SQUEEZE, ORIGIN.lat + north / 111320];
const ring = (points) => [...points.map(([x, y]) => at(x, y)), at(...points[0])];
const building = (points, more = {}) => ({ id: 21, height: 9, base: 0, polygons: [[ring(points)]], ...more });
const corners = (mesh) =>
  Array.from({ length: mesh.count }, (_, i) => ({
    x: mesh.positions[i * 3],
    y: mesh.positions[i * 3 + 1],
    z: mesh.positions[i * 3 + 2],
    along: mesh.surfaces[i * 4],
    up: mesh.surfaces[i * 4 + 1],
    length: mesh.surfaces[i * 4 + 2],
    height: mesh.surfaces[i * 4 + 3],
    east: mesh.normals[i * 2],
    north: mesh.normals[i * 2 + 1],
    tint: Array.from(mesh.tints.subarray(i * 4, i * 4 + 4)),
  }));

test('wallsOfRing gives each wall its facing, and counts along it rightwards as seen from outside', () => {
  // A house 20 m by 10 m.
  const square = [[0, 0], [20, 0], [20, 10], [0, 10]];
  const walls = wallsOfRing(square);
  assert.equal(walls.length, 4);
  const facing = (wall) => [Math.round(wall.east) + 0, Math.round(wall.north) + 0];
  assert.deepEqual(walls.map(facing), [[0, -1], [1, 0], [0, 1], [-1, 0]], 'south, east, north, west: each faces outwards');
  assert.deepEqual(walls.map((wall) => wall.length), [20, 10, 20, 10]);
  // Standing south of the south wall and facing it, its length runs from west (left)... to east (right).
  assert.deepEqual([walls[0].from, walls[0].to, walls[0].alongFrom, walls[0].alongTo], [[0, 0], [20, 0], 0, 20]);
  // Drawn the other way round, the same walls come out the same: same facing, same end at the same count.
  const back = wallsOfRing(square.slice().reverse());
  assert.equal(back.length, 4);
  const south = back.find((wall) => Math.round(wall.north) === -1);
  assert.deepEqual([south.from, south.to, south.alongFrom, south.alongTo, south.length], [[20, 0], [0, 0], 20, 0, 20]);
  for (const wall of back) {
    // How far along a point is counted goes by the point, not by which way the outline was drawn.
    const same = walls.find((other) => Math.round(other.east) === Math.round(wall.east) && Math.round(other.north) === Math.round(wall.north));
    const alongOf = (one, point) => (near(one.from[0], point[0]) && near(one.from[1], point[1]) ? one.alongFrom : one.alongTo);
    assert.equal(alongOf(wall, same.from), same.alongFrom);
  }
  // A courtyard's walls face into the yard.
  const yard = wallsOfRing([[5, 3], [15, 3], [15, 7], [5, 7]], true);
  assert.deepEqual(yard.map(facing), [[0, 1], [-1, 0], [0, -1], [1, 0]]);
  // Too little to be an outline: no walls.
  assert.deepEqual(wallsOfRing([[0, 0], [5, 0]]), []);
  assert.deepEqual(wallsOfRing([[0, 0], [5, 0], [10, 0]]), [], 'three points in a line enclose nothing');
});

test('a wall carries on round a gentle bend, and is lit there as a curve', () => {
  // A front that bends by 10° half way along, then turns a proper corner.
  const bend = (10 * Math.PI) / 180;
  const front = [[0, 0], [10, 0], [10 + 10 * Math.cos(bend), 10 * Math.sin(bend)], [10 + 10 * Math.cos(bend), 30], [0, 30]];
  const walls = wallsOfRing(front);
  assert.equal(walls.length, 5);
  const [first, second] = walls;
  // One wall of 20 m in two stretches: the windows are set out along the whole of it.
  assert.ok(near(first.length, 20, 1e-9) && near(second.length, 20, 1e-9));
  assert.deepEqual([first.alongFrom, first.alongTo, second.alongFrom], [0, 10, 10]);
  assert.ok(near(second.alongTo, 20, 1e-9));
  // At the bend both stretches face half-way between their two directions; at the wall's two ends each faces its own way.
  assert.ok(near(first.eastTo, second.eastFrom, 1e-12) && near(first.northTo, second.northFrom, 1e-12));
  assert.ok(near(Math.atan2(first.eastTo, -first.northTo), bend / 2, 1e-9), 'half the bend');
  assert.deepEqual([first.eastFrom, first.northFrom], [first.east, first.north]);
  assert.ok(near(second.eastTo, second.east, 1e-12));
  // A tower drawn as a ring of 24 short stretches is one wall all the way round.
  const round = Array.from({ length: 24 }, (_, i) => [10 * Math.cos((i / 24) * 2 * Math.PI), 10 * Math.sin((i / 24) * 2 * Math.PI)]);
  const tower = wallsOfRing(round);
  assert.equal(tower.length, 24);
  assert.ok(tower.every((wall) => near(wall.length, tower[0].length, 1e-9)) && near(tower[0].length, 24 * 2 * 10 * Math.sin(Math.PI / 24), 1e-9));
  // And at every joint it faces straight out from the middle.
  for (const wall of tower) {
    const out = Math.hypot(...wall.from);
    assert.ok(near(wall.eastFrom, wall.from[0] / out, 1e-9) && near(wall.northFrom, wall.from[1] / out, 1e-9));
  }
});

test('clipRing cuts an outline to a box, and tilePieces cuts each copy of a building to its own map tile', () => {
  const box = { west: 0, south: 0, east: 10, north: 10 };
  assert.deepEqual(clipRing([[5, 5], [15, 5], [15, 8], [5, 8], [5, 5]], box), [[5, 5], [10, 5], [10, 8], [5, 8], [5, 5]]);
  assert.deepEqual(clipRing([[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]], box), [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]], 'what is inside is left as it is');
  assert.equal(clipRing([[11, 5], [15, 5], [15, 8], [11, 8], [11, 5]], box), null);
  // A corner of the box inside the outline becomes a corner of what is left.
  const corner = clipRing([[8, 8], [12, 8], [12, 12], [8, 12], [8, 8]], box);
  assert.deepEqual(corner, [[8, 8], [10, 8], [10, 10], [8, 10], [8, 8]]);

  // A building that lies across the edge between two tiles comes with both, each copy reaching a little
  // past the edge. Cut to their own tiles the two copies meet edge to edge.
  const boxes = { 0: box, 1: { west: 10, south: 0, east: 20, north: 10 } };
  const copy = (x, outline) => ({ id: 5, height: 9, base: 0, tile: [14, x, 0], polygons: [[outline]] });
  const pieces = tilePieces(
    [
      copy(0, [[5, 5], [10.4, 5], [10.4, 8], [5, 8], [5, 5]]), // cut off 0.4 past the edge
      copy(1, [[9.6, 5], [15, 5], [15, 8], [9.6, 8], [9.6, 5]]),
      copy(0, [[10.1, 1], [10.3, 1], [10.3, 2], [10.1, 2], [10.1, 1]]), // wholly in the next tile: only its copy there is kept
      { id: 6, height: 9, base: 0, polygons: [[[[1, 1], [2, 1], [2, 2], [1, 1]]]] }, // from no tile: left as it is
    ],
    (z, x) => boxes[x],
  );
  assert.equal(pieces.length, 3);
  assert.deepEqual(pieces[0].polygons[0][0], [[5, 5], [10, 5], [10, 8], [5, 8], [5, 5]]);
  assert.deepEqual(pieces[1].polygons[0][0], [[10, 5], [15, 5], [15, 8], [10, 8], [10, 5]]);
  assert.deepEqual([pieces[0].within, pieces[1].within, pieces[2].within], [boxes[0], boxes[1], undefined]);
  // Where they meet there is no wall: three walls each, and none along the cut.
  const mesh = new WallMesh();
  assert.deepEqual(wallsOf(mesh, pieces.slice(0, 2), { lng: 0, lat: 0 }), { buildings: 2, walls: 6 });
  const squeeze = 111320;
  assert.ok(!corners(mesh).some((corner) => near(corner.east, 1, 1e-6) && near(corner.x / squeeze, 10, 1e-3)), 'no wall facing east along the cut');
  assert.ok(!corners(mesh).some((corner) => near(corner.east, -1, 1e-6) && near(corner.x / squeeze, 10, 1e-3)), 'nor one facing west');
});

test('wallsOf lays a wall over each side of a building, up past its roof', () => {
  const mesh = new WallMesh(6);
  const made = wallsOf(mesh, [building([[0, 0], [20, 0], [20, 10], [0, 10]], { use: 'residential' })], ORIGIN, { top: (one) => one.height + 2.1, colourOf: () => [200, 180, 150] });
  assert.deepEqual(made, { buildings: 1, walls: 4 });
  const list = corners(mesh);
  assert.equal(list.length, 4 * 6, 'two triangles to a wall');
  // The south wall: a hand's breadth outside the outline, from the ground to the top asked for.
  const south = list.filter((corner) => near(corner.north, -1));
  assert.equal(south.length, 6);
  assert.ok(south.every((corner) => near(corner.y, -WALL_OUT_METERS, 1e-3)));
  assert.deepEqual([...new Set(south.map((corner) => +corner.z.toFixed(3)))].sort((a, b) => a - b), [0, 11.1]);
  assert.ok(near(Math.min(...south.map((corner) => corner.x)), 0, 1e-3) && near(Math.max(...south.map((corner) => corner.x)), 20, 1e-3));
  // Every corner says where on its wall it is, and how large the wall is.
  for (const corner of south) {
    assert.ok(near(corner.along, corner.x, 1e-3) && near(corner.up, corner.z, 1e-4), 'metres along and up');
    assert.ok(near(corner.length, 20, 1e-3) && near(corner.height, 11.1, 1e-4));
  }
  // Its colour, and its kind with its own number: a low house, number 21.
  assert.deepEqual(south[0].tint, [200, 180, 150, FACADES.indexOf('house') * 64 + 21]);
  assert.ok(PARAPET_METERS > 0.3 && PARAPET_METERS < 1.2);

  // A courtyard has walls too, facing into it; a part that starts above the ground starts there.
  const block = building([[0, 0], [30, 0], [30, 30], [0, 30]]);
  block.polygons[0].push(ring([[10, 10], [10, 20], [20, 20], [20, 10]]));
  assert.deepEqual(wallsOf(mesh, [block, building([[40, 0], [50, 0], [50, 10], [40, 10]], { base: 12, height: 20 })], ORIGIN), { buildings: 2, walls: 12 });
  const yard = corners(mesh).filter((corner) => corner.x > 9 && corner.x < 21 && corner.y > 9 && corner.y < 21);
  assert.equal(yard.length, 4 * 6);
  assert.ok(yard.filter((corner) => near(corner.y, 10 + WALL_OUT_METERS, 1e-3)).every((corner) => near(corner.north, 1)), 'the yard\'s south side is a wall that faces north, into the yard');
  const bridge = corners(mesh).filter((corner) => corner.x > 39);
  assert.deepEqual([...new Set(bridge.map((corner) => +corner.z.toFixed(2)))].sort((a, b) => a - b), [12, 20]);
  assert.ok(bridge.every((corner) => near(corner.height, 8, 1e-4) && corner.up <= 8.0001));
  // Plaster where no colour is given.
  assert.deepEqual(bridge[0].tint.slice(0, 3), [236, 228, 214]);

  // What has a front of its own is left alone: a station, and what a model stands in for.
  assert.deepEqual(wallsOf(mesh, [building([[0, 0], [20, 0], [20, 10], [0, 10]], { kind: 'station' }), building([[0, 0], [20, 0], [20, 10], [0, 10]], { replaced: true })], ORIGIN), { buildings: 0, walls: 0 });
  assert.equal(mesh.count, 0);
});

test('every wall is given anticlockwise as seen from outside, whichever way its outline runs', () => {
  const square = [[0, 0], [20, 0], [20, 10], [0, 10]];
  const yard = [[8, 3], [12, 3], [12, 7], [8, 7]];
  const block = { id: 21, height: 9, base: 0, polygons: [[ring(square), ring(yard)]] };
  for (const one of [building(square), building(square.slice().reverse()), block, { ...block, polygons: [[ring(square.slice().reverse()), ring(yard.slice().reverse())]] }]) {
    const mesh = new WallMesh();
    wallsOf(mesh, [one], ORIGIN);
    const list = corners(mesh);
    for (let i = 0; i < list.length; i += 3) {
      const [a, b, c] = [list[i], list[i + 1], list[i + 2]];
      // The way the triangle faces, by the order of its corners: the same way its wall faces.
      const facing = [(b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y), (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)];
      assert.ok(facing[0] * a.east + facing[1] * a.north > 0, `${JSON.stringify(a)}`);
    }
  }
});

test('parapetTops gives each parapet a coping and an inner side', () => {
  const mesh = new Mesh();
  const house = building([[0, 0], [20, 0], [20, 10], [0, 10]]);
  const made = parapetTops(mesh, [house], ORIGIN, { top: () => 11.1, roof: () => 10.5, colourOf: () => [200, 100, 50], lit: (east, north, up) => (up > 0 ? 1 : north > 0 ? 0.9 : 0.6) });
  assert.equal(made, 4, 'one stretch to each wall');
  assert.equal(mesh.count, 4 * 12, 'a top and an inner side each');
  assert.equal(PARAPET_THICK_METERS, 0.3);
  const list = Array.from({ length: mesh.count }, (_, i) => ({ x: mesh.positions[i * 3], y: mesh.positions[i * 3 + 1], z: mesh.positions[i * 3 + 2], red: mesh.colours[i * 4] }));
  // The south wall's coping: level with the top of the wall, from its outer face to a parapet's thickness in.
  const coping = list.slice(0, 6);
  assert.ok(coping.every((corner) => near(corner.z, 11.1, 1e-5) && corner.y >= -WALL_OUT_METERS - 1e-5 && corner.y <= PARAPET_THICK_METERS + 1e-5));
  assert.ok(near(Math.min(...coping.map((corner) => corner.y)), -WALL_OUT_METERS, 1e-5) && near(Math.max(...coping.map((corner) => corner.y)), PARAPET_THICK_METERS, 1e-5));
  // Paler than the wall under it, lit from above.
  assert.equal(coping[0].red, 208);
  // Its inner side: upright, a parapet's thickness in, from the roof to the coping, looking north across the roof.
  const inner = list.slice(6, 12);
  assert.ok(inner.every((corner) => near(corner.y, PARAPET_THICK_METERS, 1e-5) && corner.z >= 10.5 - 1e-5 && corner.z <= 11.1 + 1e-5));
  assert.ok(near(Math.min(...inner.map((corner) => corner.z)), 10.5, 1e-5) && near(Math.max(...inner.map((corner) => corner.z)), 11.1, 1e-5));
  assert.equal(inner[0].red, Math.floor(200 * 0.9 * 0.94));
  // The north wall's inner side looks south: darker, by this light.
  assert.ok(list.slice(30, 36).every((corner) => near(corner.y, 10 - PARAPET_THICK_METERS, 1e-5) && corner.red === Math.floor(200 * 0.6 * 0.94)));
  // None where there is no parapet of the app's own, and none along the cut of a map tile.
  assert.equal(parapetTops(mesh, [building([[0, 0], [20, 0], [20, 10], [0, 10]], { replaced: true }), building([[30, 0], [50, 0], [50, 10], [30, 10]], { kind: 'station' })], ORIGIN, { top: () => 11.1, roof: () => 10.5 }), 0);
  assert.equal(mesh.count, 0);
  const [east] = at(20, 0);
  const cut = { ...house, within: { west: at(-50, 0)[0], south: at(0, -50)[1], east, north: at(0, 50)[1] } };
  assert.equal(parapetTops(mesh, [cut], ORIGIN, { top: () => 11.1, roof: () => 10.5 }), 3);
});

test('facadeOf tells towers, houses, blocks with shops and plain blocks apart', () => {
  assert.deepEqual(FACADES, ['block', 'house', 'tower', 'shops']);
  assert.equal(facadeOf({ height: 7.5, use: 'residential' }), 'house');
  assert.equal(facadeOf({ height: 7.5 }), 'house', 'a low building of no stated use');
  assert.equal(facadeOf({ height: 15, use: 'residential' }), 'block');
  assert.equal(facadeOf({ height: 9, use: 'commercial' }), 'shops');
  assert.equal(facadeOf({ height: 4, use: 'commercial' }), 'block', 'a kiosk has no shop floor under an upper floor');
  assert.equal(facadeOf({ height: 9, use: 'education' }), 'block');
  assert.equal(facadeOf({ height: 60, use: 'commercial' }), 'tower');
  assert.equal(facadeOf({ height: 200 }), 'tower');
  // A building's own number: the same every time, from 0 to 60.
  assert.equal(seedOf(21), 21);
  assert.equal(seedOf(61 + 5), 5);
  assert.equal(seedOf(-66), 5);
  assert.equal(seedOf(undefined), 0);
  assert.equal(seedOf('x'), 0);
  // The numbers the map data gives buildings are too large to be kept exactly: all that is left of them
  // is multiples of 1024. They are spread over all 61 just the same.
  const real = Array.from({ length: 2000 }, (_, i) => seedOf(5162080572935761000 + i * 1024 * 37));
  assert.ok(real.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 60));
  assert.equal(new Set(real).size, 61);
});

test('footShade lays a strip of shade along the foot of every wall that stands on the ground', () => {
  const mesh = new Mesh();
  const strips = footShade(mesh, [building([[0, 0], [20, 0], [20, 10], [0, 10]]), building([[40, 0], [50, 0], [50, 10], [40, 10]], { base: 12, height: 20 })], ORIGIN, { reach: 1.5, strength: 0.34, up: 0.07 });
  assert.equal(strips, 4, 'nothing under a part that starts above the ground');
  assert.equal(mesh.count, 4 * 6);
  const list = Array.from({ length: mesh.count }, (_, i) => ({ x: mesh.positions[i * 3], y: mesh.positions[i * 3 + 1], z: mesh.positions[i * 3 + 2], alpha: mesh.colours[i * 4 + 3] }));
  assert.ok(list.every((corner) => near(corner.z, 0.07, 1e-6)));
  // Darkest at the wall, gone 1.5 m out.
  const south = list.filter((corner) => corner.y <= 0.001 && corner.x > -0.1 && corner.x < 20.1);
  assert.ok(south.filter((corner) => near(corner.y, 0, 1e-3)).every((corner) => corner.alpha === Math.floor(255 * 0.34)));
  assert.ok(south.filter((corner) => near(corner.y, -1.5, 1e-3)).every((corner) => corner.alpha === 0));
  assert.ok(near(Math.min(...list.map((corner) => corner.y)), -1.5, 1e-3) && near(Math.max(...list.map((corner) => corner.x)), 21.5, 1e-3));
});

test('wallTone works a wall colour out of the colour of the roof', () => {
  for (const roof of [[200, 195, 185], [120, 110, 100], [180, 120, 90], [90, 110, 150], [250, 250, 250], [0, 0, 0], [30, 90, 40]]) {
    const [red, green, blue] = wallTone(roof);
    for (const part of [red, green, blue]) assert.ok(Number.isInteger(part) && part >= 140 && part <= 245, `${roof} → ${[red, green, blue]}: a wall in daylight, never dark, never glaring`);
  }
  // The roof's own tint, calmed: a reddish roof gives a warm wall, a bluish one a cool wall.
  const warm = wallTone([180, 120, 90]);
  const cool = wallTone([90, 110, 150]);
  assert.ok(warm[0] > warm[2] + 20 && cool[2] > cool[0] + 10, `${warm} / ${cool}`);
  // A light roof gives a lighter wall than a dark one, and a grey roof a grey wall.
  assert.ok(wallTone([230, 225, 215])[0] > wallTone([110, 105, 100])[0] + 25);
  const grey = wallTone([150, 150, 150]);
  assert.ok(Math.max(...grey) - Math.min(...grey) <= 8, String(grey));
});

test('colourOf reads a colour as map data writes them', () => {
  assert.deepEqual(colourOf('#e8dcc0'), [232, 220, 192]);
  assert.deepEqual(colourOf('#E8DCC0'), [232, 220, 192]);
  assert.deepEqual(colourOf('#eee'), [238, 238, 238]);
  assert.deepEqual(colourOf(' beige '), [232, 220, 192]);
  assert.deepEqual(colourOf('white'), [255, 255, 255]);
  for (const other of ['nonsense', '#12', '#1234567', 'rgb(1,2,3)', '', null, undefined, 'toString']) assert.equal(colourOf(other), null, String(other));
});
