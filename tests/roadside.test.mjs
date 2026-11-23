import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNetwork, lightFrom, Mesh } from '../js/life.js';
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
