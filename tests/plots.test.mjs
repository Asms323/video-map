import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNetwork, lightFrom, Mesh } from '../js/life.js';
import { plotWalls } from '../js/plots.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180));
const NORTH = 1 / 111320;
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const house = (id, west, south, east, north, more = {}) => ({ id, height: 7, base: 0, use: 'residential', polygons: [[[[west, south], [east, south], [east, north], [west, north], [west, south]].map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH])]], ...more });
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 3)]);
const NOON = lightFrom({ azimuth: 180, altitude: 50 });
const all = () => ({ fenced: 1, fence: '#e2d4b6' });

test('plotWalls stands a wall round a house, a setback out from it, with a gate towards the street', () => {
  // A street along y = 0, and a house 12 by 14 m standing 8 m back from its edge.
  const network = buildNetwork([line('minor', [[-80, 0], [80, 0]])], ORIGIN);
  const mesh = new Mesh();
  const made = plotWalls(mesh, [house(61 * 3 + 5, -6, 11.5, 6, 25.5)], network, ORIGIN, NOON, { fencedAt: all });
  assert.deepEqual(made, { houses: 1, walled: 1, sides: 4, gates: 1 });
  const points = corners(mesh);
  // The wall runs 2.2 m out from the house on every side (and is 22 cm thick).
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  assert.ok(Math.abs(Math.min(...xs) + 8.31) < 0.02 && Math.abs(Math.max(...xs) - 8.31) < 0.02, `${Math.min(...xs)} to ${Math.max(...xs)}`);
  assert.ok(Math.abs(Math.min(...ys) - 9.19) < 0.02 && Math.abs(Math.max(...ys) - 27.81) < 0.02, `${Math.min(...ys)} to ${Math.max(...ys)}`);
  // Taller than a man; and it stands on the ground.
  const tall = Math.max(...points.map((point) => point[2]));
  assert.ok(tall >= 2.4 && tall <= 3 && Math.min(...points.map((point) => point[2])) === 0);
  // The gate: sheet metal painted brown, 3.6 m wide, in the side towards the street, a little lower than the wall.
  const gate = points.filter((point) => point[3] < 110 && point[3] > point[5] + 10);
  assert.ok(gate.length >= 12 && gate.every((point) => point[1] < 9.5 && point[2] <= tall - 0.25 + 1e-6), 'the gate is in the wall along the street');
  const gateXs = gate.map((point) => point[0]);
  assert.ok(Math.abs(Math.max(...gateXs) - Math.min(...gateXs) - 3.6) < 0.01);
  // The same wall every time.
  const again = new Mesh();
  plotWalls(again, [house(61 * 3 + 5, -6, 11.5, 6, 25.5)], network, ORIGIN, NOON, { fencedAt: all });
  assert.deepEqual(Array.from(again.positions.subarray(0, again.count * 3)), Array.from(mesh.positions.subarray(0, mesh.count * 3)));
});

test('a wall keeps off the pavement and out of the neighbour\'s house; and not every building has one', () => {
  const network = buildNetwork([line('minor', [[-80, 0], [80, 0]])], ORIGIN);
  const mesh = new Mesh();
  // A house only 5 m from the middle of the street (1.5 m from its edge): the wall cannot stand between them.
  let made = plotWalls(mesh, [house(8, -6, 5, 6, 19)], network, ORIGIN, NOON, { fencedAt: all });
  assert.equal(made.walled, 1);
  assert.equal(made.sides, 3, 'no wall on the side of the street');
  // The walls at its sides end flush with its front: none of them runs on towards the street.
  assert.ok(corners(mesh).every((point) => point[1] >= 5 - 1e-6), `${Math.min(...corners(mesh).map((point) => point[1]))}`);
  // A neighbour's house in the way: the wall is pulled in, or left out on that side.
  const built = (x, y) => x > 7 && x < 20 && y > 10 && y < 30;
  made = plotWalls(mesh, [house(8, -6, 12, 6, 26)], network, ORIGIN, NOON, { fencedAt: all, built });
  assert.ok(made.sides >= 3 && corners(mesh).every((point) => !built(point[0], point[1])));
  // A district where no house is walled; a tower; a shed; a building far from the middle of the scene.
  assert.equal(plotWalls(mesh, [house(8, -6, 12, 6, 26)], network, ORIGIN, NOON, { fencedAt: () => ({ fenced: 0, fence: '#ffffff' }) }).walled, 0);
  assert.equal(plotWalls(mesh, [house(8, -6, 12, 6, 26, { height: 30 })], network, ORIGIN, NOON, { fencedAt: all }).houses, 0);
  assert.equal(plotWalls(mesh, [house(8, -3, 12, 3, 18)], network, ORIGIN, NOON, { fencedAt: all }).houses, 0);
  assert.equal(plotWalls(mesh, [house(8, 1500, 12, 1512, 26)], network, ORIGIN, NOON, { fencedAt: all }).houses, 0);
  assert.equal(mesh.count, 0);
  // Half the houses of a district that walls half of them.
  const row = Array.from({ length: 122 }, (_, i) => house(i, -700 + i * 11, 40, -700 + i * 11 + 9, 52));
  made = plotWalls(mesh, row, null, ORIGIN, NOON, { fencedAt: () => ({ fenced: 0.5, fence: '#e2d4b6' }) });
  assert.ok(made.houses === 122 && made.walled > 45 && made.walled < 77, JSON.stringify(made));
});
