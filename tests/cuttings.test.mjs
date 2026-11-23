import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CUTTINGS, PORTAL_DEEP_METERS, drawCuttings, overCutting, sunkAlong } from '../js/cuttings.js';
import { buildNetwork, drawMarks, heightAlong, lightFrom, Mesh } from '../js/life.js';
import { CasterMesh, groundCasters, shadowed } from '../js/shade.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180));
const NORTH = 1 / 111320;
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 3)]);
const NOON = lightFrom({ azimuth: 180, altitude: 50 });
const near = (a, b, by = 0.01) => Math.abs(a - b) <= by;

test('a great road goes down to meet a tunnel, and comes up again within a hundred and fifty metres', () => {
  // A motorway eastwards: 600 m in the open, 120 m of tunnel under a street, 500 m in the open.
  const lines = [line('motorway', [[0, 0], [600, 0]], { oneway: 1 }), line('motorway', [[600, 0], [720, 0]], { oneway: 1, tunnel: true }), line('motorway', [[720, 0], [1220, 0]], { oneway: 1 })];
  const network = buildNetwork(lines, ORIGIN);
  const [before, tunnel, after] = [0, 600, 720].map((x) => network.ways.find((way) => near(way.xy[0], x)));
  assert.ok(tunnel.hidden && !tunnel.sunk);
  assert.deepEqual(before.sunk, [0, PORTAL_DEEP_METERS]);
  assert.deepEqual(after.sunk, [PORTAL_DEEP_METERS, 0]);
  // At the mouth it is 6.5 m down, and still so 15 m out; from there it climbs for 130 m, and is at street level beyond.
  assert.ok(near(heightAlong(before, 600), -6.5) && near(heightAlong(before, 586), -6.5) && near(heightAlong(before, 455), 0) && heightAlong(before, 300) === 0);
  assert.ok(near(heightAlong(before, 520), -3.25, 0.01), `${heightAlong(before, 520)}`);
  assert.ok(near(heightAlong(after, 0), -6.5) && near(heightAlong(after, 145), 0) && heightAlong(after, 400) === 0);
  for (let s = 455; s < 600; s += 5) assert.ok(heightAlong(before, s + 5) <= heightAlong(before, s) + 1e-9, 'down all the way');
  assert.equal(sunkAlong(before, 100), 0);
  // The paint on the road goes down with it.
  const marks = new Mesh();
  drawMarks(marks, network);
  const paint = corners(marks);
  assert.ok(paint.some((corner) => corner[2] < -6) && paint.some((corner) => near(corner[2], 0.16)));
  assert.ok(paint.every((corner) => corner[2] >= -6.5 + 0.16 - 1e-6 && corner[2] <= 0.16 + 1e-6));
  // An avenue does the same at its underpass, both its ways at once...
  const avenue = buildNetwork([line('primary', [[0, 0], [600, 0]]), line('primary', [[600, 0], [720, 0]], { tunnel: true })], ORIGIN);
  const approach = avenue.ways.find((way) => !way.hidden);
  assert.deepEqual(approach.sunk, [0, PORTAL_DEEP_METERS]);
  assert.ok(near(heightAlong(approach, 600), -6.5) && near(heightAlong(approach, 520), -3.25) && heightAlong(approach, 300) === 0);
  // ...but not a back street or a lane that the map has running under something: that is on the ground.
  for (const kind of ['minor', 'service']) {
    const street = buildNetwork([line(kind, [[0, 0], [600, 0]]), line(kind, [[600, 0], [720, 0]], { tunnel: true })], ORIGIN);
    assert.ok(street.ways.every((way) => !way.sunk), kind);
  }
});

test('a road climbs away from a tunnel along one slope, through every junction on the way, and a slip road starts from the depth it finds', () => {
  const lines = [
    line('motorway', [[0, 0], [200, 0]], { oneway: 1, tunnel: true }),
    line('motorway', [[200, 0], [260, 0]], { oneway: 1 }),
    line('motorway', [[260, 0], [900, 0]], { oneway: 1 }),
    line('motorway', [[260, 0], [330, -12], [420, -30]], { oneway: 1, ramp: true }),
    line('primary', [[300, -30], [420, -30], [700, -30]], { oneway: 1 }),
  ];
  const network = buildNetwork(lines, ORIGIN);
  const slip = network.ways.find((way) => way.ramp);
  const first = network.ways.find((way) => !way.hidden && !way.ramp && way.class === 'motorway' && near(way.xy[0], 200));
  const second = network.ways.find((way) => !way.ramp && way.class === 'motorway' && near(way.xy[0], 260));
  // Sixty metres out of the tunnel the road is still 4.7 m down: the junction there does not bring it up.
  assert.ok(near(first.sunk[0], 6.5) && near(first.sunk[1], 4.7027, 0.001) && near(second.sunk[0], 4.7027, 0.001) && second.sunk[1] === 0, JSON.stringify([first.sunk, second.sunk]));
  assert.ok(near(heightAlong(first, 60), heightAlong(second, 0), 1e-9) && near(heightAlong(second, 0), -4.7027, 0.001));
  // One slope from the mouth: half-way up 80 m from it, up at 145 m, wherever the junctions fall.
  assert.ok(near(heightAlong(first, 10), -6.5) && near(heightAlong(second, 20), -3.25) && near(heightAlong(second, 85), 0, 1e-6) && heightAlong(second, 400) === 0);
  for (let s = 0; s < 90; s += 5) assert.ok(heightAlong(second, s + 5) >= heightAlong(second, s) - 1e-9, 'up all the way');
  // The slip road leaves 4.7 m down and is on the street by its end; the service road it joins never left it.
  assert.ok(near(slip.sunk[0], 4.7027, 0.001) && slip.sunk[1] === 0 && slip.dips === null);
  assert.ok(near(heightAlong(slip, 0), -4.7027, 0.001) && heightAlong(slip, slip.length) === 0 && heightAlong(slip, slip.length * 0.75) < -0.3);
  assert.ok(network.ways.filter((way) => way.class === 'primary').every((way) => !way.sunk), 'the service road stays up');

  // Two tunnels two hundred metres apart: the road between them comes part of the way up and goes down again.
  const dip = buildNetwork([line('trunk', [[0, 0], [100, 0]], { tunnel: true }), line('trunk', [[100, 0], [300, 0]]), line('trunk', [[300, 0], [400, 0]], { tunnel: true })], ORIGIN);
  const between = dip.ways.find((way) => !way.hidden);
  assert.deepEqual(between.sunk, [6.5, 6.5]);
  assert.ok(near(heightAlong(between, 0), -6.5) && near(heightAlong(between, 200), -6.5) && near(heightAlong(between, 100), heightAlong(between, 0) * 0.2765, 0.01), `${heightAlong(between, 100)}`);
  // And a kilometre apart: all the way up.
  const apart = buildNetwork([line('trunk', [[0, 0], [100, 0]], { tunnel: true }), line('trunk', [[100, 0], [1100, 0]]), line('trunk', [[1100, 0], [1200, 0]], { tunnel: true })], ORIGIN);
  const open = apart.ways.find((way) => !way.hidden);
  assert.ok(near(heightAlong(open, 0), -6.5) && heightAlong(open, 500) === 0 && near(heightAlong(open, 1000), -6.5));
});

test('King Fahd Road between Aseer Street and Al-Mazar Street is a cutting from end to end, 8 m down, three lanes each way', () => {
  const [cutting] = CUTTINGS;
  assert.ok(cutting.deep === 8 && cutting.lanes === 3 && cutting.line.length >= 10);
  // (Some 5.1 km of road, running north-north-west.)
  let long = 0;
  for (let i = 1; i < cutting.line.length; i += 1) long += Math.hypot((cutting.line[i][0] - cutting.line[i - 1][0]) * 101200, (cutting.line[i][1] - cutting.line[i - 1][1]) * 111320);
  assert.ok(long > 4900 && long < 5700, `${Math.round(long)} m`);
  // Two carriageways along a piece of it, 9 m either side of its line; a slip road off one; and the service road beside.
  const origin = { lng: 46.70303, lat: 24.644 };
  const east = 1 / (111320 * Math.cos((24.644 * Math.PI) / 180));
  const [a, b] = [cutting.line[5], cutting.line[7]].map(([lng, lat]) => [(lng - origin.lng) / east, (lat - origin.lat) * 111320]);
  const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = [(b[0] - a[0]) / run, (b[1] - a[1]) / run];
  const at = (s, across) => [a[0] + along[0] * s + along[1] * across, a[1] + along[1] * s - along[0] * across];
  const here = (cls, points, more) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [origin.lng + x * east, origin.lat + y / 111320]), ...more });
  const lines = [
    here('motorway', [at(0, 9), at(400, 9)], { oneway: 1 }),
    here('motorway', [at(400, 9), at(run, 9)], { oneway: 1 }),
    here('motorway', [at(run, -9), at(600, -9)], { oneway: 1 }),
    here('motorway', [at(600, -9), at(0, -9)], { oneway: 1 }),
    here('motorway', [at(400, 9), at(480, 22), at(560, 40)], { oneway: 1, ramp: true }),
    here('primary', [at(0, 40), at(560, 40), at(run, 40)], { oneway: 1 }),
    // (On the other side the slip road is mapped as a link of the service road, not of the great road.)
    here('primary', [at(600, -9), at(520, -22), at(440, -40)], { oneway: 1, ramp: true }),
    here('primary', [at(run, -40), at(440, -40), at(0, -40)], { oneway: 1 }),
    // A great road that ends beside the cutting but runs across it: it is not in it.
    here('trunk', [at(700, 24), at(700, 320)]),
  ];
  const network = buildNetwork(lines, origin);
  const main = network.ways.filter((way) => way.class === 'motorway' && !way.ramp);
  assert.equal(main.length, 4);
  for (const way of main) {
    assert.deepEqual(way.sunk, [8, 8]);
    assert.equal(way.lanes, 3);
    assert.ok(near(heightAlong(way, 0), -8) && near(heightAlong(way, way.length / 2), -8) && near(heightAlong(way, way.length), -8));
  }
  // The slip road is 8 m down where it leaves and at street level where it meets the service road, which is not down at all.
  const slips = network.ways.filter((way) => way.ramp);
  assert.deepEqual(slips.map((way) => way.class).sort(), ['motorway', 'primary']);
  for (const slip of slips) {
    assert.deepEqual(slip.sunk, [8, 0]);
    // It runs level with the road until it has drawn clear of it (some 10.7 m to one side, 66 m along), and climbs from there.
    assert.ok(slip.lanes === 2 && slip.clear > 55 && slip.clear < 75, `${slip.clear}`);
    assert.ok(near(heightAlong(slip, 0), -8) && near(heightAlong(slip, slip.clear - 1), -8) && heightAlong(slip, slip.length) === 0);
    assert.ok(heightAlong(slip, slip.length * 0.75) < -0.5 && heightAlong(slip, slip.length * 0.75) > -7.5);
  }
  assert.ok(network.ways.filter((way) => way.class === 'primary' && !way.ramp).every((way) => !way.sunk && way.lanes === 2));
  assert.ok(network.ways.filter((way) => way.class === 'trunk').every((way) => !way.sunk), 'the road across stays up');

  // The cutting as it is drawn: one floor for the two carriageways, 8 m down, with a wall on each outer side only.
  const mesh = new Mesh();
  const banks = new Mesh();
  const made = drawCuttings(mesh, banks, network, NOON);
  assert.equal(made.ways, 6);
  assert.ok(made.metres > run * 2 && made.mouths === 0, JSON.stringify(made));
  const across = (point) => (point[0] - a[0]) * along[1] - (point[1] - a[1]) * along[0];
  const far = (point) => (point[0] - a[0]) * along[0] + (point[1] - a[1]) * along[1];
  // (Looked at short of where the slip road leaves, which widens the cutting on its side.)
  const seen = corners(mesh).filter((point) => far(point) < 380);
  const floor = seen.filter((point) => near(point[2], -8, 1e-3) && Math.abs(across(point)) < 20);
  const width = main[0].width;
  // (Each floor reaches from the foot of its own wall, 1.2 m beyond its carriageway, to the middle of the strip between the two, and a little over.)
  assert.ok(near(Math.max(...floor.map(across)), 9 + width / 2 + 1.2, 0.05) && near(Math.min(...floor.map(across)), -9 - width / 2 - 1.2, 0.05), `${Math.min(...floor.map(across))} to ${Math.max(...floor.map(across))}`);
  assert.ok(floor.some((point) => near(across(point), 0.3, 0.01)) && floor.some((point) => near(across(point), -0.3, 0.01)), 'the floors meet in the middle');
  // The walls: up to the street, at the two outer edges and nowhere between the carriageways.
  const tops = seen.filter((point) => point[2] === 0 && Math.abs(across(point)) < 20);
  assert.ok(tops.length > 0 && tops.every((point) => near(Math.abs(across(point)), 9 + width / 2 + 1.2, 0.05)), 'no wall down the middle');
  // The ground beside it: flat at street level, from the top of each outer wall outwards, and never over the cutting itself.
  assert.ok(corners(banks).every((point) => point[2] === 0));
  const ground = corners(banks).filter((point) => far(point) < 380);
  assert.ok(ground.length > 0);
  assert.ok(ground.filter((point) => Math.abs(across(point)) < 30).every((point) => Math.abs(across(point)) >= 9 + width / 2 + 1.2 - 0.05));
  assert.ok(Math.max(...ground.map((point) => Math.abs(across(point)))) > 90);
  // Where a slip road has climbed part of the way, a wall stands from its floor down to the floor of the road it left.
  const faces = [];
  const every = corners(mesh);
  for (let i = 0; i < every.length; i += 6) faces.push(every.slice(i, i + 6));
  const concrete = (face) => face[0][3] > face[0][5];
  const steps = faces.filter((face) => concrete(face) && near(Math.min(...face.map((point) => point[2])), -8, 0.01) && Math.max(...face.map((point) => point[2])) < -0.5);
  assert.ok(steps.length >= 6, `${steps.length} steps`);
  assert.ok(steps.every((face) => face.every((point) => far(point) > 395 && far(point) < 610 && Math.abs(across(point)) > 9 && Math.abs(across(point)) < 40)));
  assert.ok(steps.some((face) => across(face[0]) > 0) && steps.some((face) => across(face[0]) < 0), 'beside both slip roads');
  // Nothing that stands on the ground stands over the cutting: but beside it, on the service road's side, it may.
  const middle = at(200, 0);
  assert.equal(overCutting(network, middle[0], middle[1]), true);
  assert.equal(overCutting(network, ...at(200, 60)), false);
});

test('where a cutting runs into a tunnel there is the tunnel\'s mouth: dark, right across the road', () => {
  const lines = [line('trunk', [[0, 0], [400, 0]], { oneway: 1 }), line('trunk', [[400, 0], [520, 0]], { oneway: 1, tunnel: true })];
  const network = buildNetwork(lines, ORIGIN);
  const mesh = new Mesh();
  const banks = new Mesh();
  const made = drawCuttings(mesh, banks, network, NOON);
  assert.deepEqual([made.ways, made.mouths], [1, 1]);
  const way = network.ways.find((one) => !one.hidden);
  const dark = corners(mesh).filter((point) => point[3] < 40 && point[4] < 40 && point[5] < 45);
  assert.equal(dark.length, 6);
  // Across the whole cutting, from the road up to just under the street, a hand's breadth inside the cutting's end.
  assert.ok(dark.every((point) => near(point[0], 399.7, 0.01) && Math.abs(point[1]) <= way.width / 2 + 1.2 + 1e-6 && point[2] >= -6.5 - 1e-6 && point[2] <= -0.9 + 1e-6));
  // A lone carriageway has a wall on both sides, and ground beside both.
  const tops = corners(mesh).filter((point) => point[2] === 0 && point[0] < 399);
  assert.ok(tops.some((point) => point[1] > 0) && tops.some((point) => point[1] < 0));
  assert.ok(corners(banks).some((point) => point[1] > 50) && corners(banks).some((point) => point[1] < -50));
  // And over the tunnel, the ground it runs under: as wide as the cutting, as far as the tunnel is long (95 m at the most).
  const lid = corners(banks).filter((point) => point[0] > 400.5);
  assert.ok(lid.length > 0 && lid.every((point) => point[2] === 0 && Math.abs(point[1]) <= way.width / 2 + 1.2 + 1e-6 && point[0] <= 495 + 1e-6) && lid.some((point) => near(point[0], 495)));
  // Nothing is drawn where the road is at street level.
  assert.ok(corners(mesh).every((point) => point[0] > 250));
  // A network with no great road below the ground: nothing at all.
  assert.deepEqual(drawCuttings(mesh, banks, buildNetwork([line('motorway', [[0, 0], [900, 0]], { oneway: 1 })], ORIGIN), NOON), { ways: 0, metres: 0, mouths: 0 });
  assert.ok(mesh.count === 0 && banks.count === 0);
});

test('the ground beside one cutting ends at the next: it does not lie over a cutting that runs alongside', () => {
  // Two roads sixty metres apart, each going down into a tunnel of its own.
  const lines = [
    line('trunk', [[0, 0], [400, 0]], { oneway: 1 }),
    line('trunk', [[400, 0], [520, 0]], { oneway: 1, tunnel: true }),
    line('trunk', [[0, 60], [400, 60]], { oneway: 1 }),
    line('trunk', [[400, 60], [520, 60]], { oneway: 1, tunnel: true }),
  ];
  const network = buildNetwork(lines, ORIGIN);
  const mesh = new Mesh();
  const banks = new Mesh();
  const made = drawCuttings(mesh, banks, network, NOON);
  assert.ok(made.ways === 2 && made.mouths === 2 && made.metres > 285 && made.metres < 300, JSON.stringify(made));
  const half = network.ways[0].width / 2 + 1.2;
  // Each has both its walls (they are too far apart to be one cutting)...
  for (const middle of [0, 60]) {
    const tops = corners(mesh).filter((point) => point[2] === 0 && point[0] > 300 && point[0] < 399 && Math.abs(point[1] - middle) < 10);
    assert.ok(tops.some((point) => near(point[1], middle + half, 0.01)) && tops.some((point) => near(point[1], middle - half, 0.01)));
  }
  // ...and where both are well down, no ground is laid over either: the ground between them ends at each wall.
  const ground = corners(banks).filter((point) => point[0] > 300 && point[0] < 399.9);
  assert.ok(ground.length > 0);
  for (const point of ground) assert.ok(!(Math.abs(point[1]) < half - 0.01) && !(Math.abs(point[1] - 60) < half - 0.01), `${point[1]}`);
  assert.ok(ground.some((point) => point[1] > half + 30 && point[1] < 60 - half) && ground.some((point) => point[1] < -90) && ground.some((point) => point[1] > 150));
});

test('in a cutting the sun reaches the road only where the ground beside it lets it, and by night the lamps light its floor and walls', () => {
  // A road eastwards into a tunnel: 6.5 m down at the mouth, its walls 6.3 m either side of its middle.
  const lines = [line('trunk', [[0, 0], [400, 0]], { oneway: 1 }), line('trunk', [[400, 0], [520, 0]], { oneway: 1, tunnel: true })];
  const network = buildNetwork(lines, ORIGIN);
  const mesh = new Mesh();
  const banks = new Mesh();
  const glow = new Mesh();
  drawCuttings(mesh, banks, network, NOON, glow);
  // The ground beside the cutting, and over the tunnel, is among what throws the shadows: flat, at the level of the street.
  const casters = new CasterMesh();
  assert.equal(groundCasters(casters, banks), banks.count);
  assert.ok(casters.count === banks.count && casters.count > 0);
  for (let i = 0; i < casters.count; i += 1) assert.equal(casters.positions[i * 3 + 2], 0);
  assert.equal(groundCasters(casters, new Mesh()), 0);
  // The sun in the south, half-way up the sky: a shadow falls a metre north for every metre of height.
  const fall = [0, 1];
  // Down on the road (at 386 m it is 6.5 m deep): in the shade beside the wall the sun comes over, in the sun in the middle and beyond.
  assert.equal(shadowed(casters, fall, [386, -5, -6.5], 0.6), true);
  assert.equal(shadowed(casters, fall, [386, -1, -6.5], 0.6), true);
  assert.equal(shadowed(casters, fall, [386, 1.5, -6.5], 0.6), false);
  assert.equal(shadowed(casters, fall, [386, 5, -6.5], 0.6), false);
  // Where the road is only half-way down, the shadow reaches half as far.
  assert.equal(shadowed(casters, fall, [320, -4, -3.25], 0.6), true);
  assert.equal(shadowed(casters, fall, [320, -2, -3.25], 0.6), false);
  // Nothing that stands on the ground is shaded by it: a car on the street above, the paint on a road beside.
  assert.equal(shadowed(casters, fall, [386, -30, 0.16], 0.6), false);
  assert.equal(shadowed(casters, fall, [386, 30, 1.2], 0.6), false);
  assert.equal(shadowed(casters, fall, [450, 0, 0.16], 0.6), false);

  // The lamps' light: on the floor, just clear of it, as strong as the map lays it on a street; fainter on the walls.
  const lights = Array.from({ length: glow.count }, (_, i) => [...glow.positions.subarray(i * 3, i * 3 + 3), ...glow.colours.subarray(i * 4, i * 4 + 4)]);
  assert.ok(lights.length > 0 && lights.length % 6 === 0);
  const strengths = new Set(lights.map((corner) => corner[6]));
  assert.deepEqual([...strengths].sort((a, b) => a - b), [Math.floor(255 * 0.17), Math.floor(255 * 0.3)]);
  const onFloor = lights.filter((corner) => corner[6] === Math.floor(255 * 0.3));
  // (A great road's lamps are the pale white ones: #ffe6c4, here already weakened to three tenths.)
  assert.ok(onFloor.every((corner) => corner[3] === Math.floor(255 * 0.3) && corner[4] === Math.floor(230 * 0.3) && corner[5] === Math.floor(196 * 0.3)));
  assert.ok(onFloor.some((corner) => near(corner[2], -6.45)) && onFloor.every((corner) => corner[2] <= 0.05 + 1e-6 && corner[2] >= -6.45 - 1e-6));
  const onWalls = lights.filter((corner) => corner[6] === Math.floor(255 * 0.17));
  assert.ok(onWalls.some((corner) => corner[2] === 0) && onWalls.every((corner) => near(Math.abs(corner[1]), network.ways.find((way) => !way.hidden).width / 2 + 1.2 - 0.05, 0.01)));
  // An avenue's are amber.
  const avenue = buildNetwork([line('primary', [[0, 0], [400, 0]], { oneway: 1 }), line('primary', [[400, 0], [520, 0]], { oneway: 1, tunnel: true })], ORIGIN);
  drawCuttings(mesh, banks, avenue, NOON, glow);
  const amber = Array.from({ length: glow.count }, (_, i) => [...glow.colours.subarray(i * 4, i * 4 + 4)]).filter((colour) => colour[3] === Math.floor(255 * 0.3));
  assert.ok(amber.length > 0 && amber.every((colour) => colour[0] === Math.floor(255 * 0.3) && colour[1] === Math.floor(194 * 0.3) && colour[2] === Math.floor(124 * 0.3)));
  // Without a mesh for it, no light is laid (and nothing breaks).
  assert.equal(drawCuttings(mesh, banks, avenue, NOON).ways, 1);
});
