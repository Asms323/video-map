import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Mesh, buildNetwork, pointAlong } from '../js/life.js';
import { Walkers, drawWalkers, walkersLevel } from '../js/people.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180)); // degrees of longitude in a metre
const NORTH = 1 / 111320;
/** A line through points given in metres east and north of the origin. */
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const EVENING = Date.parse('2026-11-22T17:00:00Z'); // eight in the evening in Riyadh
const SMALL_HOURS = Date.parse('2026-11-22T00:30:00Z'); // half past three in the morning
const NOON = Date.parse('2026-11-22T09:30:00Z');
const PAVEMENT = { minor: 2.6, tertiary: 3.5, secondary: 3.5, primary: 4.5 };
const walkersOn = (lines, at = EVENING, more = {}) => {
  const network = buildNetwork(lines, ORIGIN);
  const clock = { at };
  const walkers = new Walkers({ seed: 5, now: () => clock.at, ...more });
  walkers.setNetwork(network, ORIGIN);
  return { network, walkers, clock };
};
/** Everybody, as { x, y, east, north, kind, tone, shown, way, side }. */
const everybody = (walkers) => {
  const all = [];
  let i = 0;
  walkers.each((x, y, east, north, kind, tone, shown) => {
    all.push({ x, y, east, north, kind, tone, shown, way: walkers.walkers[i].way, side: walkers.walkers[i].side });
    i += 1;
  });
  return all;
};

test('the pavements are fullest in the evening, thin in the heat of the day and all but empty in the small hours', () => {
  assert.equal(walkersLevel(20), 1);
  assert.ok(walkersLevel(13) < walkersLevel(9) && walkersLevel(9) < walkersLevel(20));
  assert.ok(walkersLevel(3) < 0.1 && walkersLevel(3) > 0);
  assert.equal(walkersLevel(27), walkersLevel(3));
  for (let hour = 0; hour < 24; hour += 0.5) assert.ok(walkersLevel(hour) > 0 && walkersLevel(hour) <= 1);
  // And so are the streets: the same street at three hours of the day.
  const street = [line('secondary', [[-1000, 0], [1000, 0]])];
  const evening = walkersOn(street, EVENING).walkers.walkers.length;
  const noon = walkersOn(street, NOON).walkers.walkers.length;
  const night = walkersOn(street, SMALL_HOURS).walkers.walkers.length;
  assert.equal(evening, 30, 'fifteen to the kilometre, on two kilometres of street');
  assert.ok(noon < evening / 2 && noon > night && night <= 3, `${evening} in the evening, ${noon} at noon, ${night} at night`);
});

test('everybody walks on a pavement: beside the street, not in it; and on a carriageway only on the side away from the median', () => {
  const { network, walkers } = walkersOn([line('secondary', [[-1000, 0], [1000, 0]]), line('minor', [[0, -700], [0, 700]])]);
  const all = everybody(walkers);
  assert.ok(all.length > 30);
  for (const one of all) {
    const way = network.ways[one.way];
    // (The first street runs east and west along y = 0, the second north and south along x = 0.)
    const off = way.class === 'secondary' ? Math.abs(one.y) : Math.abs(one.x);
    assert.ok(off > way.width / 2 && off < way.width / 2 + PAVEMENT[way.class], `${off} m from the middle of a ${way.class} street ${way.width} m wide`);
  }
  assert.ok(all.some((one) => one.y > 0 && network.ways[one.way].class === 'secondary') && all.some((one) => one.y < 0 && network.ways[one.way].class === 'secondary'), 'on both pavements');
  // More of them along the main street than along the side street, for the same length.
  const perMetre = (cls) => all.filter((one) => network.ways[one.way].class === cls).length / network.ways.filter((way) => way.class === cls).reduce((sum, way) => sum + way.length, 0);
  assert.ok(perMetre('secondary') > perMetre('minor') * 1.5);
  // Two carriageways with a median between them: nobody walks along the median.
  const dual = walkersOn([line('primary', [[-1000, -8], [1000, -8]], { oneway: 1 }), line('primary', [[1000, 8], [-1000, 8]], { oneway: 1 })]);
  const both = everybody(dual.walkers);
  assert.ok(both.length > 20);
  assert.ok(both.every((one) => Math.abs(one.y) > 8), 'all on the outer side of their carriageway');
  // Nobody along a motorway, a slip road, a service lane, a road in a tunnel or a track of the metro.
  const none = walkersOn([line('motorway', [[-1000, 0], [1000, 0]]), line('primary', [[-1000, 50], [1000, 50]], { ramp: true }), line('service', [[-1000, 100], [1000, 100]]), line('secondary', [[-1000, 150], [1000, 150]], { tunnel: true }), line('rail', [[-1000, 200], [1000, 200]])]);
  assert.equal(none.walkers.walkers.length, 0);
});

test('they walk at a walking pace, go on along the street that leads straight on, and turn back where none does', () => {
  // One street in two pieces, end to end, and nothing else.
  const { network, walkers, clock } = walkersOn([line('secondary', [[-300, 0], [0, 0]]), line('secondary', [[0, 0], [300, 0]])]);
  walkers.fill = () => {}; // (nobody is added, and nobody leaves)
  const before = everybody(walkers);
  assert.ok(before.length >= 6);
  for (let t = 0; t < 10; t += 0.1) {
    clock.at += 100;
    walkers.step(0.1);
  }
  const after = everybody(walkers);
  after.forEach((one, i) => {
    const moved = Math.hypot(one.x - before[i].x, one.y - before[i].y);
    assert.ok(moved > 9.5 && moved < 15.5 || moved < 15.5 && Math.abs(Math.abs(one.x) - 300) < 16 || Math.abs(one.x) < 16, `${moved} m in ten seconds`);
    assert.equal(Math.sign(one.y), Math.sign(before[i].y), 'on the same pavement still');
  });
  // Half an hour on: everybody is still on the street, on a pavement, between its two ends. Some have
  // been to an end and turned back, and some have crossed from one piece to the other.
  const sides = walkers.walkers.map((one) => Math.sign(everybody(walkers)[walkers.walkers.indexOf(one)].y));
  let crossed = 0;
  const waysAt = walkers.walkers.map((one) => one.way);
  for (let t = 0; t < 1800; t += 0.25) {
    clock.at += 250;
    walkers.step(0.25);
    walkers.walkers.forEach((one, i) => {
      if (one.way !== waysAt[i]) {
        crossed += 1;
        waysAt[i] = one.way;
      }
    });
  }
  const later = everybody(walkers);
  later.forEach((one, i) => {
    assert.ok(one.x >= -300.5 && one.x <= 300.5 && Math.abs(one.y) > network.ways[one.way].width / 2);
    assert.equal(Math.sign(one.y), sides[i], 'nobody has crossed the street');
  });
  assert.ok(crossed > later.length, `they went from one piece of the street to the other ${crossed} times`);
  // (The way they face is the way they walk.)
  const one = walkers.walkers[0];
  const spot = pointAlong(network.ways[one.way], one.s);
  assert.ok(Math.abs(later[0].east - spot[2] * (one.forward ? 1 : -1)) < 1e-9 && Math.abs(later[0].north - spot[3] * (one.forward ? 1 : -1)) < 1e-9);
});

test('who is drawn: those near the eye, each a body and a head with their shade; in thobe, abaya, or shirt and trousers', () => {
  const { walkers } = walkersOn([line('secondary', [[-1000, 0], [1000, 0]])]);
  for (const one of walkers.walkers) one.shown = 1;
  const all = everybody(walkers);
  const kinds = new Set(all.map((one) => one.kind));
  assert.deepEqual([...kinds].sort(), ['abaya', 'shirt', 'thobe']);
  const mesh = new Mesh();
  const light = { east: 0.3, north: -0.4, up: 0.87 };
  const reach = { bearing: 30, factor: 1.2 };
  // From high over the middle of the street: only those within reach of the eye.
  const near = { eye: [0, 0, 60], within: 200 };
  const drawn = drawWalkers(mesh, walkers, light, reach, near);
  const inReach = all.filter((one) => Math.hypot(one.x, one.y, 60) < 200);
  assert.equal(drawn, inReach.length);
  assert.ok(drawn > 0 && drawn < all.length);
  // (A box is five faces of six corners; a shade one face. Shirt and trousers are a box more.)
  assert.equal(mesh.count, inReach.reduce((sum, one) => sum + 6 + (one.kind === 'shirt' ? 90 : 60), 0));
  // Nobody is taller than a person, or under the ground.
  for (let i = 0; i < mesh.count; i += 1) assert.ok(mesh.positions[i * 3 + 2] >= 0 && mesh.positions[i * 3 + 2] < 1.8);
  // By night they throw no shade; and with nobody near, or no eye, nothing is drawn.
  assert.equal(drawWalkers(mesh, walkers, null, null, near), drawn);
  assert.equal(mesh.count, inReach.reduce((sum, one) => sum + (one.kind === 'shirt' ? 90 : 60), 0));
  assert.equal(drawWalkers(mesh, walkers, light, reach, { eye: [0, 5000, 60], within: 200 }), 0);
  assert.equal(mesh.count, 0);
  assert.equal(drawWalkers(mesh, walkers, light, reach, null), 0);
});

test('when the streets are read afresh, whoever is on a street that is still there walks on', () => {
  const lines = [line('secondary', [[-1000, 0], [1000, 0]]), line('minor', [[0, -700], [0, 700]])];
  const { walkers } = walkersOn(lines);
  const before = everybody(walkers).map((one) => [Math.round(one.x), Math.round(one.y)]);
  // The same streets again, measured from the same spot: everybody is where they were.
  walkers.setNetwork(buildNetwork(lines, ORIGIN), ORIGIN);
  assert.deepEqual(everybody(walkers).map((one) => [Math.round(one.x), Math.round(one.y)]), before);
  // Without the side street: those who were on it are gone, and others have set out on the main street.
  walkers.setNetwork(buildNetwork([lines[0]], ORIGIN), ORIGIN);
  const left = everybody(walkers);
  assert.ok(left.length > 0 && left.every((one) => Math.abs(one.y) < 12));
  // Never more than the most there may be.
  const few = walkersOn([line('primary', [[-5000, 0], [5000, 0]])], EVENING, { most: 40 });
  assert.equal(few.walkers.walkers.length, 40);
});
