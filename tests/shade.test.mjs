import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CasterMesh, shadowCasters, shadowFall, shadowMapSize, shadowed } from '../js/shade.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const SQUEEZE = 111320 * Math.cos((24.7 * Math.PI) / 180);
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
const at = (east, north) => [ORIGIN.lng + east / SQUEEZE, ORIGIN.lat + north / 111320];
/** A building whose outline is a box in metres: west, south, east, north. */
const box = (west, south, east, north, height, more = {}) => ({ height, base: 0, polygons: [[[at(west, south), at(east, south), at(east, north), at(west, north), at(west, south)]]], ...more });
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]);

test('shadowFall says how far a shadow falls for each metre of height, and which way', () => {
  // Shadows that point north-east, twice as long as what throws them is tall.
  const [east, north] = shadowFall({ bearing: 45, factor: 2 });
  assert.ok(near(east, Math.SQRT2, 1e-12) && near(north, Math.SQRT2, 1e-12));
  assert.deepEqual(shadowFall({ bearing: 0, factor: 1 }), [0, 1]);
  assert.equal(shadowFall(null), null, 'no sun, no shadows');
});

test('shadowCasters keeps the tops of the buildings and the walls that face away from the sun', () => {
  const mesh = new CasterMesh(3);
  const fall = shadowFall({ bearing: 0, factor: 1.5 }); // the sun in the south: shadows fall north
  const made = shadowCasters(mesh, [box(0, 0, 20, 10, 30)], ORIGIN, fall);
  const list = corners(mesh);
  // The top (two triangles) and the north wall (two): the south wall shades only the inside of its own building,
  // and the east and west walls stand edge on to the sun.
  assert.equal(list.length, 12);
  const wall = list.filter(([, , z], i) => i < 6);
  assert.ok(wall.every(([, y]) => near(y, 10, 1e-3)), 'the north wall');
  assert.deepEqual([...new Set(wall.map(([, , z]) => z))].sort((a, b) => a - b), [0, 30]);
  assert.ok(list.slice(6).every(([, , z]) => z === 30), 'the top');
  // The ground the building and its shadow cover: 45 m of shadow to the north, and a little to spare all round.
  assert.ok(near(made.box[0], -2, 1e-3) && near(made.box[1], -2, 1e-3) && near(made.box[2], 22, 1e-3) && near(made.box[3], 10 + 45 + 2, 1e-3), String(made.box));
  assert.equal(made.top, 31);

  // With the sun in the south-west, the two walls on the far side: north and east.
  shadowCasters(mesh, [box(0, 0, 20, 10, 30)], ORIGIN, shadowFall({ bearing: 45, factor: 1 }));
  assert.equal(mesh.count, 18);
  const sides = corners(mesh).slice(0, 12);
  assert.ok(sides.every(([x, y]) => near(y, 10, 1e-3) || near(x, 20, 1e-3)));
  // A courtyard's walls count too: the one on its sunward side throws its shadow into the yard.
  const block = box(0, 0, 30, 30, 12);
  block.polygons[0].push([at(10, 10), at(10, 20), at(20, 20), at(20, 10), at(10, 10)]);
  shadowCasters(mesh, [block], ORIGIN, fall);
  const yardWall = corners(mesh).filter(([x, y, z]) => near(y, 10, 1e-3) && x > 9.9 && x < 20.1);
  assert.ok(yardWall.length >= 6, 'the south side of the yard');
  assert.ok(!corners(mesh).some(([x, y, z]) => z === 12 && x > 11 && x < 19 && y > 11 && y < 19), 'and no roof over the yard');
  // A part that starts above the ground starts its walls there.
  shadowCasters(mesh, [box(0, 0, 10, 10, 20, { base: 12 })], ORIGIN, fall);
  assert.deepEqual([...new Set(corners(mesh).map(([, , z]) => z))].sort((a, b) => a - b), [12, 20]);
  // Nothing to throw a shadow, or no sun: nothing.
  assert.equal(shadowCasters(mesh, [], ORIGIN, fall), null);
  assert.equal(shadowCasters(mesh, [box(0, 0, 10, 10, 20)], ORIGIN, null), null);
  assert.equal(mesh.count, 0);
});

test('a point is in shadow when something higher stands on its ray of sunlight', () => {
  const mesh = new CasterMesh();
  const fall = shadowFall({ bearing: 0, factor: 1 }); // shadows fall north, as long as the building is tall
  // A tower 30 m tall, and 10 m north of it a house 8 m tall.
  shadowCasters(mesh, [box(0, 0, 20, 10, 30), box(0, 20, 20, 30, 8)], ORIGIN, fall);
  const inShade = (x, y, z) => shadowed(mesh, fall, [x, y, z]);
  // On the ground the tower's shadow reaches 30 m north of its north wall.
  assert.equal(inShade(10, 35, 0), true);
  assert.equal(inShade(10, 39.5, 0), true);
  assert.equal(inShade(10, 40.5, 0), false);
  assert.equal(inShade(30, 20, 0), false, 'beside it, in the sun');
  // The house's roof is in the tower's shadow: at 8.5 m up it reaches 21.5 m.
  assert.equal(inShade(10, 25, 8.5), true);
  assert.equal(inShade(10, 31.4, 8.5), true);
  assert.equal(inShade(10, 31.6, 8.5), false);
  // So is the house's south wall, though it faces the sun; the tower's own south wall is in the sun.
  assert.equal(inShade(10, 19.95, 4), true);
  assert.equal(inShade(10, -0.05, 12), false);
  // The tower's roof is in nobody's shadow, least of all its own.
  assert.equal(inShade(10, 5, 30.5), false);
  assert.equal(inShade(10, 5, 31.5), false);
  // Behind the house, on the ground, its own shadow carries on where the tower's ends.
  assert.equal(inShade(10, 37, 0), true);
  // A car in front of the tower, on its sunny side.
  assert.equal(inShade(10, -3, 0.8), false);
  // With the sun lower the shadows are longer.
  const low = shadowFall({ bearing: 0, factor: 3 });
  shadowCasters(mesh, [box(0, 0, 20, 10, 30)], ORIGIN, low);
  assert.equal(shadowed(mesh, low, [10, 95, 0]), true);
  assert.equal(shadowed(mesh, low, [10, 101, 0]), false);
});

test('shadowMapSize asks for a picture fine enough for the ground it covers, within what a device allows', () => {
  assert.equal(shadowMapSize([0, 0, 100, 50]), 256);
  assert.equal(shadowMapSize([0, 0, 400, 300]), 512);
  assert.equal(shadowMapSize([0, 0, 800, 1500]), 2048);
  assert.equal(shadowMapSize([0, 0, 3000, 2000]), 2048, 'no larger than 2048');
  assert.equal(shadowMapSize([0, 0, 3000, 2000], 0.8, 1024), 1024);
  assert.equal(shadowMapSize([0, 0, 1000, 1000], 2), 512, 'coarser if asked');
});
