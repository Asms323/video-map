import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNetwork, heightAlong, lightFrom, Mesh } from '../js/life.js';
import { drawRoadside, medianPalms } from '../js/roadside.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180));
const NORTH = 1 / 111320;
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 3)]);
const NOON = lightFrom({ azimuth: 180, altitude: 50 });

test('drawRoadside: a concrete barrier down the middle of a great road, and green signs over a motorway', () => {
  // A motorway of two carriageways 24 m apart: eastbound along y = 0, westbound along y = 24.
  const network = buildNetwork([line('motorway', [[0, 0], [2600, 0]], { oneway: 1 }), line('motorway', [[2600, 24], [0, 24]], { oneway: 1 })], ORIGIN);
  const mesh = new Mesh();
  const made = drawRoadside(mesh, network, NOON);
  const width = network.ways[0].width;
  assert.ok(made.barriers > 5000 && made.kerbs === 0, JSON.stringify(made));
  const points = corners(mesh);
  // The barriers: 85 cm high, just beyond the edge of each carriageway on the side of its median (the
  // left of its traffic): north of the eastbound one, south of the westbound.
  // (Concrete is a warm grey; the steel of the gantries' posts a cold one.)
  const low = points.filter((point) => point[2] <= 0.85 + 1e-6 && point[3] >= point[5] && point[3] - point[5] < 30);
  const ys = [...new Set(low.map((point) => Math.round(point[1] * 100) / 100))].sort((a, b) => a - b);
  assert.deepEqual(ys, [width / 2 + 0.2, width / 2 + 0.76, 24 - width / 2 - 0.76, 24 - width / 2 - 0.2].map((y) => Math.round(y * 100) / 100), JSON.stringify(ys));
  assert.ok(Math.abs(Math.max(...low.map((point) => point[2])) - 0.85) < 1e-6);
  // The gantries: two or three to each carriageway of 2.6 km, 7.4 m tall, with boards of green.
  assert.ok(made.gantries >= 4 && made.gantries <= 6, `${made.gantries}`);
  const green = points.filter((point) => point[4] > point[3] * 2 && point[4] > point[5]);
  assert.ok(green.length >= made.gantries * 6 && green.every((point) => point[2] >= 4.5 - 1e-6 && point[2] <= 7.2 + 1e-6));
  assert.ok(Math.abs(Math.max(...points.map((point) => point[2])) - 7.4) < 1e-6);
  // The boards hang over their own carriageway.
  assert.ok(green.every((point) => Math.abs(point[1]) < width / 2 || Math.abs(point[1] - 24) < width / 2));
  // A two-way road has no median: nothing stands along it.
  assert.deepEqual(drawRoadside(mesh, buildNetwork([line('trunk', [[0, 0], [900, 0]])], ORIGIN), NOON), { barriers: 0, gantries: 0, kerbs: 0 });
  assert.equal(mesh.count, 0);
});

test('drawRoadside: the kerb of an avenue\'s median is painted yellow and black by turns', () => {
  const network = buildNetwork([line('primary', [[0, 0], [300, 0]], { oneway: 1 })], ORIGIN);
  const mesh = new Mesh();
  const made = drawRoadside(mesh, network, NOON);
  assert.ok(made.kerbs > 250 && made.barriers === 0 && made.gantries === 0);
  const points = corners(mesh);
  const width = network.ways[0].width;
  // On the left of the traffic, along the edge of the road, a hand high.
  assert.ok(points.every((point) => point[1] >= width / 2 - 1e-6 && point[1] <= width / 2 + 0.29 && point[2] <= 0.2 + 1e-6));
  const yellow = points.filter((point) => point[3] > point[5] + 60);
  const black = points.filter((point) => point[3] < 80);
  assert.ok(yellow.length > 0 && Math.abs(yellow.length - black.length) <= 18, `${yellow.length} yellow, ${black.length} black`);
  // Two metres of each: yellow from 12 to 14 m along, black from 14 to 16.
  assert.ok(yellow.some((point) => Math.abs(point[0] - 12) < 0.01) && yellow.some((point) => Math.abs(point[0] - 14) < 0.01) && !yellow.some((point) => point[0] > 14.01 && point[0] < 15.99));
});

test('medianPalms: a row of palms down the median of an avenue, and nowhere else', () => {
  // An avenue whose carriageways are 20 m apart, middle to middle; and a side street across it at x = 200.
  const lines = [line('primary', [[0, 0], [400, 0]], { oneway: 1 }), line('primary', [[400, 20], [0, 20]], { oneway: 1 }), line('minor', [[200, -60], [200, 80]])];
  const network = buildNetwork(lines, ORIGIN);
  const palms = medianPalms(network);
  assert.ok(palms.length >= 14 && palms.length <= 26, `${palms.length} palms`);
  for (const palm of palms) {
    assert.ok(palm.palm === true && palm.radius > 1.5 && palm.radius < 3.4);
    // Down the middle of the median, and not where the side street runs through it.
    assert.ok(Math.abs(palm.y - 10) < 0.6, `${palm.y}`);
    assert.ok(Math.abs(palm.x - 200) > 4.3, `${palm.x}`);
  }
  // One row, a palm every sixteen metres.
  const xs = palms.map((palm) => palm.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] - xs[i - 1] > 15.5, `${xs[i - 1]} then ${xs[i]}`);
  // No palms beside a carriageway that has no other across from it; none in a median too narrow; none
  // between two roads that run the same way; none along a two-way street.
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]], { oneway: 1 })], ORIGIN)).length, 0);
  const width = network.ways[0].width;
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]], { oneway: 1 }), line('primary', [[400, width + 2], [0, width + 2]], { oneway: 1 })], ORIGIN)).length, 0);
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]], { oneway: 1 }), line('primary', [[0, 20], [400, 20]], { oneway: 1 })], ORIGIN)).length, 0);
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]]), line('primary', [[400, 20], [0, 20]])], ORIGIN)).length, 0);
  // Nor where a building stands.
  assert.equal(medianPalms(network, { built: () => true }).length, 0);
});

test('drawRoadside: a slip road has neither barrier nor kerb, and where an avenue dives under a crossing its kerb goes down with it', () => {
  // A slip road of a motorway, and one of an avenue: one side of nothing.
  const slips = buildNetwork([line('motorway', [[0, 0], [400, 30]], { oneway: 1, ramp: true }), line('primary', [[0, 100], [400, 130]], { oneway: 1, ramp: true })], ORIGIN);
  assert.ok(slips.ways.every((way) => way.ramp && way.lanes === 2 && Math.abs(way.width - 6.8) < 1e-9));
  const mesh = new Mesh();
  assert.deepEqual(drawRoadside(mesh, slips, NOON), { barriers: 0, gantries: 0, kerbs: 0 });
  assert.equal(mesh.count, 0);
  // An avenue's carriageway into its underpass: the kerb of its median follows the road down to the tunnel's mouth.
  const avenue = buildNetwork([line('primary', [[0, 0], [600, 0]], { oneway: 1 }), line('primary', [[600, 0], [720, 0]], { oneway: 1, tunnel: true })], ORIGIN);
  const way = avenue.ways.find((one) => !one.hidden);
  const made = drawRoadside(mesh, avenue, NOON);
  assert.ok(made.kerbs > 500 && made.barriers === 0);
  const points = corners(mesh);
  const feet = points.filter((point) => point[0] > 560 && point[0] < 590);
  assert.ok(feet.length > 0 && feet.every((point) => point[2] < -5.5 && Math.abs(point[2] - heightAlong(way, point[0])) <= 0.2 + 0.3), 'down at the mouth');
  const up = points.filter((point) => point[0] < 400);
  assert.ok(up.length > 0 && up.every((point) => point[2] >= 0 && point[2] <= 0.2 + 1e-6), 'on the street before the dip');
});

test('drawFootbridges: a roofed walkway six metres over the road, on piers that keep off the carriageway, with a tower at each end', async () => {
  const { drawFootbridges } = await import('../js/roadside.js');
  // A motorway of two carriageways along y = 0 and y = 24, and a footbridge across both from y = -30 to y = 54,
  // which the map has in two lengths (it crosses the edge of a tile at y = 12).
  const network = buildNetwork([line('motorway', [[0, 0], [600, 0]], { oneway: 1 }), line('motorway', [[600, 24], [0, 24]], { oneway: 1 })], ORIGIN);
  const walk = (points) => ({ coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]) });
  const walks = [walk([[300, -30], [300, 12]]), walk([[300, 12], [300, 54]])];
  const mesh = new Mesh();
  const made = drawFootbridges(mesh, walks, network, ORIGIN, NOON);
  assert.equal(made.bridges, 2);
  assert.ok(Math.abs(made.metres - 84) < 0.01 && made.towers === 2 && made.piers >= 2, JSON.stringify(made));
  const points = corners(mesh);
  // The walkway: 3.4 m wide, its floor 5.9 m up, a roof 2.75 m over the floor (standing out 30 cm each side).
  const walkway = points.filter((point) => point[1] > -29 && point[1] < 53);
  const floor = walkway.filter((point) => Math.abs(point[2] - 5.9) < 1e-3);
  assert.ok(floor.length > 0 && floor.every((point) => Math.abs(point[0] - 300) <= 1.7 + 1e-3));
  assert.ok(Math.abs(Math.max(...walkway.map((point) => point[2])) - (5.9 + 2.75 + 0.16)) < 1e-3);
  assert.ok(walkway.filter((point) => point[2] > 8.6).every((point) => Math.abs(point[0] - 300) <= 2 + 1e-3));
  // Nothing of it comes lower than 5.35 m over a carriageway: no pier stands in one.
  const width = network.ways[0].width;
  const low = points.filter((point) => point[2] < 5.9 - 0.55 - 1e-3);
  assert.ok(low.length > 0 && low.every((point) => Math.abs(point[1]) > width / 2 + 0.8 && Math.abs(point[1] - 24) > width / 2 + 0.8), 'clear of both carriageways');
  // The piers stand on the ground: in the median, and beside the road.
  const feet = points.filter((point) => point[2] === 0 && point[1] > -29 && point[1] < 53);
  assert.ok(feet.length > 0 && feet.some((point) => point[1] > width / 2 && point[1] < 24 - width / 2), 'one in the median');
  // A tower at each end of the whole bridge, and none where its two lengths meet: beyond the end, taller than the roof.
  const towers = points.filter((point) => point[2] > 5.9 + 2.75 + 0.3);
  assert.ok(towers.length > 0 && towers.every((point) => point[1] <= -29.7 + 1e-3 || point[1] >= 53.7 - 1e-3));
  assert.ok(towers.some((point) => point[1] < -33) && towers.some((point) => point[1] > 57) && towers.every((point) => Math.abs(point[0] - 300) <= 2.7 + 1e-3));
  // The glazing is see-through; the rest is solid.
  const solid = Array.from({ length: mesh.count }, (_, i) => mesh.colours[i * 4 + 3]);
  assert.deepEqual([...new Set(solid)].sort((a, b) => a - b), [127, 255]);
  // No footbridges: nothing.
  assert.deepEqual(drawFootbridges(mesh, [], network, ORIGIN, NOON), { bridges: 0, metres: 0, towers: 0, piers: 0 });
  assert.equal(mesh.count, 0);
});
