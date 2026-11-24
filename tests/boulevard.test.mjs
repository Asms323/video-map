import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOULEVARD_WORLD, fountainJets, lagoonRings, lagoonSlabs, onLagoon, pyramidSlabs, sphereSlabs, worldMarks } from '../js/boulevard.js';
import { LANDMARKS } from '../js/landmarks.js';

const METERS = 111320;
const squareMeters = (ring) => Math.abs(ring.reduce((sum, [x0, y0], i) => sum + x0 * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y0, 0)) / 2;

test('the lagoon of Boulevard World: its shore as traced from the satellite photo', () => {
  // It lies in Hittin, where the street map has Boulevard World.
  assert.ok(BOULEVARD_WORLD[0] > 46.5966 && BOULEVARD_WORLD[0] < 46.6053 && BOULEVARD_WORLD[1] > 24.7733 && BOULEVARD_WORLD[1] < 24.78);
  const rings = lagoonRings();
  assert.equal(rings.length, 2);
  // The main basin and the arm to its south-east: 8.5 hectares of open water between them (of the 12.19 on record,
  // which counts canals too narrow to trace), all within 360 m of the middle.
  const areas = rings.map(squareMeters);
  assert.ok(areas[0] > 70000 && areas[0] < 80000 && areas[1] > 9000 && areas[1] < 13000, areas.join(' '));
  for (const ring of rings) for (const [east, north] of ring) assert.ok(Math.hypot(east, north) < 360);
  // On the water in the middle of the basin; not on the Sphere's terraces, on the island of houses, or across town.
  const squeeze = Math.cos((BOULEVARD_WORLD[1] * Math.PI) / 180) * METERS;
  const at = (east, north) => [BOULEVARD_WORLD[0] + east / squeeze, BOULEVARD_WORLD[1] + north / METERS];
  assert.ok(onLagoon(...at(0, 0)) && onLagoon(...at(-60, 40)));
  assert.ok(!onLagoon(...worldMarks().sphere.at) && !onLagoon(...at(600, 0)) && !onLagoon(46.67, 24.7));
  // As slabs for the map: water a hand's breadth deep, with a colour of its own by night.
  const slabs = lagoonSlabs();
  assert.ok(slabs.length === 2 && slabs.every((slab) => slab.base === 0 && slab.top === 0.25 && slab.north && /^#[0-9a-f]{6}$/.test(slab.paint) && /^#[0-9a-f]{6}$/.test(slab.night)));
  // The fountain's jets stand in a line across the basin, every one of them on the water.
  const jets = fountainJets();
  assert.equal(jets.length, 24);
  assert.ok(jets.every(([east, north]) => onLagoon(...at(east, north))));
});

test('the Sphere and the pyramids are drafted, and are not shown yet', () => {
  // The Sphere: terraces, and a ball 35 m across standing on them, widest at its middle.
  const sphere = sphereSlabs();
  const ball = sphere.slice(3);
  assert.equal(ball.length, 16);
  assert.ok(Math.abs(Math.max(...sphere.map((slab) => slab.top)) - worldMarks().sphere.height) < 1e-9 && Math.abs(worldMarks().sphere.height - 38.6) < 1e-9);
  const radius = (slab) => Math.max(...slab.outline.map(([east, north]) => Math.hypot(east, north)));
  assert.ok(radius(ball[7]) > 17 && radius(ball[7]) <= 17.5 && radius(ball[0]) < 9 && radius(ball[15]) < 9);
  assert.ok(ball.every((slab) => slab.night && slab.north));
  // The pyramids: two, each a stack of courses narrowing to nothing, the larger 30 m tall.
  const pyramids = pyramidSlabs();
  assert.equal(pyramids.length, 12 + 8);
  assert.ok(Math.abs(Math.max(...pyramids.map((slab) => slab.top)) - 30) < 1e-9);
  assert.equal(worldMarks().pyramids.length, 2);
  // None of this is on the app's list of landmarks until clear photographs of the place have been looked at.
  assert.ok(LANDMARKS.every((one) => !one.id.startsWith('blvd')));
});
