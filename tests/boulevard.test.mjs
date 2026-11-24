import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOULEVARD_WORLD, WORLD_PARTS, fountainJets, inFairground, lagoonRings, onLagoon, worldPlace } from '../js/boulevard.js';
import { LANDMARKS, landmarkModels, replacedByLandmarks } from '../js/landmarks.js';
import { Model, ModelMesh } from '../js/models.js';
import { facesOf } from './model-faces.mjs';

const METERS = 111320;
const squareMeters = (ring) => Math.abs(ring.reduce((sum, [x0, y0], i) => sum + x0 * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y0, 0)) / 2;
const squeeze = Math.cos((BOULEVARD_WORLD[1] * Math.PI) / 180) * METERS;
const at = (east, north) => [BOULEVARD_WORLD[0] + east / squeeze, BOULEVARD_WORLD[1] + north / METERS];
const part = (id) => WORLD_PARTS.find((one) => one.id === id);
/** A part built about its own middle: its triangles. */
const built = (id) => {
  const mesh = new ModelMesh();
  const made = part(id).model(new Model(mesh));
  return { faces: facesOf(mesh), made };
};
const near = (a, b, by) => Math.abs(a - b) <= by;

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
  // On the water in the middle of the basin; not where the Sphere stands, across the fairground, or across town.
  assert.ok(onLagoon(...at(0, 0)) && onLagoon(...at(-60, 40)));
  assert.ok(!onLagoon(...worldPlace(part('blvd-world-sphere').at)) && !onLagoon(...at(600, 0)) && !onLagoon(46.67, 24.7));
  assert.deepEqual(worldPlace([0, 0]), BOULEVARD_WORLD);
  // The fairground's own ground: the lagoon and every part built on it lie within; the city round it does not.
  assert.ok(inFairground(...at(0, 0)) && inFairground(...at(-59, -259)) && WORLD_PARTS.filter((one) => one.id !== 'blvd-world-wheel').every((one) => inFairground(...worldPlace(one.at))));
  assert.ok(!inFairground(...at(600, 0)) && !inFairground(...at(0, 500)) && !inFairground(46.67, 24.7));
  // The fountain's jets stand in a line across the basin, every one of them on the water.
  const jets = fountainJets();
  assert.equal(jets.length, 24);
  assert.ok(jets.every(([east, north]) => onLagoon(...at(east, north))));
});

test('what stands at Boulevard World: seventeen things, each a true model on its own ground', () => {
  assert.deepEqual(WORLD_PARTS.map((one) => one.id), [
    'blvd-world-lagoon', 'blvd-world-sphere', 'blvd-world-flyer', 'blvd-world-egypt', 'blvd-world-rock', 'blvd-world-entrance', 'blvd-world-china', 'blvd-world-greece', 'blvd-world-bridge',
    'blvd-world-venice', 'blvd-world-paris', 'blvd-world-wheel', 'blvd-world-mexico', 'blvd-world-india', 'blvd-world-kuwait', 'blvd-world-japan', 'blvd-world-pier',
  ]);
  let triangles = 0;
  for (const one of WORLD_PARTS) {
    assert.ok(one.name.length > 5 && typeof one.model === 'function' && one.build === undefined, one.id);
    // Within the fairground: no further than 420 m from its mark.
    assert.ok(Math.hypot(...one.at) < 420, one.id);
    const { faces } = built(one.id);
    triangles += faces.length;
    assert.ok(faces.length > 100, `${one.id}: ${faces.length} triangles`);
    const corners = faces.flatMap((face) => face.corners);
    // It stands on the ground and nothing of it goes under; it is as tall as it says, and keeps within its reach.
    const lowest = Math.min(...corners.map((corner) => corner[2]));
    const top = Math.max(...corners.map((corner) => corner[2]));
    assert.ok(lowest >= 0 && lowest < 0.2, `${one.id}: from ${lowest}`);
    assert.ok(top >= one.height - 0.6 && top <= one.height + 12, `${one.id}: ${top.toFixed(1)} m for ${one.height} m`);
    const furthest = Math.max(...corners.map(([east, north]) => Math.hypot(east, north)));
    assert.ok(furthest <= one.reach + 18 && furthest > one.reach * 0.5, `${one.id}: reaches ${furthest.toFixed(0)} m of ${one.reach}`);
    // Every triangle is a real one, knows which way it looks, and is made of something.
    for (const face of faces) {
      assert.ok(near(Math.hypot(...face.normal), 1, 1e-3), one.id);
      assert.ok(['plain', 'glass', 'lamp'].includes(face.kind) && /^#[0-9a-f]{6}$/.test(face.colour), one.id);
    }
    // By night it shows: a good part of it gives light, or has light trained on it.
    const lit = faces.filter((face) => face.glow > 0.1).length;
    assert.ok(lit > faces.length * 0.3, `${one.id}: ${lit} of ${faces.length} lit`);
  }
  // Light enough for a phone: some forty thousand triangles in all.
  assert.ok(triangles > 30000 && triangles < 60000, `${triangles} triangles`);
});

test('the lagoon is water in a parapet lit blue, with a walk round it', () => {
  const { faces, made } = built('blvd-world-lagoon');
  // The water: glass lying flat, a hand above the ground, and all of it within the traced shore.
  const water = faces.filter((face) => face.kind === 'glass');
  assert.ok(water.length > 300 && water.every((face) => near(face.normal[2], 1, 1e-6) && face.corners.every((corner) => near(corner[2], 0.12, 1e-6))));
  const area = water.reduce((sum, face) => {
    const [a, b, c] = face.corners;
    return sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }, 0);
  assert.ok(near(area, lagoonRings().reduce((sum, ring) => sum + squareMeters(ring), 0), 5), `${area} square metres of water`);
  // The parapet: upright faces a metre tall along the shore, lit blue-violet on the side of the water.
  const parapet = faces.filter((face) => face.kind === 'plain' && face.light === '#4a5cff' && face.glow > 0.9 && Math.abs(face.normal[2]) < 1e-6);
  assert.ok(parapet.length > 700, `${parapet.length} faces of parapet`);
  assert.ok(parapet.every((face) => face.corners.every((corner) => corner[2] <= 1.05 + 1e-6)));
  // Lamps along the walk, and masts of blue floodlights 19 m tall.
  assert.ok(made.lamps > 80 && made.lamps < 160, `${made.lamps} lamps`);
  assert.ok(faces.some((face) => face.kind === 'lamp' && face.light === '#3f7dff' && face.corners.some((corner) => corner[2] > 18)));
  // What stands in the water on the map is taken out for it.
  const lagoon = LANDMARKS.find((one) => one.id === 'blvd-world-lagoon');
  assert.equal(lagoon.covers, onLagoon);
  const box = (east, north, half) => [at(east - half, north - half), at(east + half, north - half), at(east + half, north + half), at(east - half, north + half), at(east - half, north - half)];
  assert.deepEqual([...replacedByLandmarks([{ id: 7, ring: box(0, 0, 12) }, { id: 8, ring: box(600, 0, 12) }])], [7]);
});

test('the Sphere is a ball of screens 35 m through; the pyramids are three, in lit courses', () => {
  const sphere = built('blvd-world-sphere').faces;
  // The ball: lamps, every one 17.5 m from a point 22 m above the ground, in many colours.
  const ball = sphere.filter((face) => face.kind === 'lamp' && face.corners.every(([east, north, up]) => near(Math.hypot(east, north, up - 22), 17.5, 0.02)));
  assert.ok(ball.length > 1500, `${ball.length} panes`);
  assert.ok(new Set(ball.map((face) => face.light)).size >= 8);
  assert.ok(near(Math.max(...ball.flatMap((face) => face.corners.map((corner) => corner[2]))), 39.5, 0.01));
  // (It is lit as a ball is, not as a thing of flat panes.)
  assert.ok(ball.some((face) => face.normals.some((normal) => Math.hypot(normal[0] - face.normals[0][0], normal[1] - face.normals[0][1], normal[2] - face.normals[0][2]) > 0.05)));

  const egypt = built('blvd-world-egypt').faces;
  // The courses' risers: upright, sandstone, lit warm from their foot. The tops of the three pyramids.
  const risers = egypt.filter((face) => face.colour === '#dcc48c' && face.light === '#ffbf5e' && Math.abs(face.normal[2]) < 1e-6);
  assert.ok(risers.length > 400, `${risers.length} risers`);
  const tips = egypt.filter((face) => face.colour === '#efe2bd').flatMap((face) => face.corners).filter((corner) => corner[2] > 12);
  const tops = [...new Set(tips.map((corner) => Math.round(corner[2] * 10) / 10))].sort((a, b) => a - b);
  assert.deepEqual(tops.filter((top) => [12.5, 23.1, 27.7].includes(top)), [12.5, 23.1, 27.7]);
  assert.equal(part('blvd-world-egypt').shades.length, 3);
});

test('the parts of Boulevard World are landmarks of the map, built only for a view near them', () => {
  const parts = LANDMARKS.filter((one) => one.id.startsWith('blvd-world-'));
  assert.equal(parts.length, WORLD_PARTS.length);
  for (const one of parts) {
    const from = part(one.id);
    assert.deepEqual(one.at, worldPlace(from.at));
    assert.ok(one.bearing === 0 && one.within === 4000 && one.model === from.model && one.height === from.height && one.clear === from.clear);
  }
  // From the middle of the fairground: all of them, with the towers of the city. From across town: the towers alone.
  const mesh = new ModelMesh();
  assert.equal(landmarkModels(mesh, { lng: BOULEVARD_WORLD[0], lat: BOULEVARD_WORLD[1] }), 9 + WORLD_PARTS.length);
  const here = mesh.count;
  assert.equal(landmarkModels(mesh, { lng: 46.72, lat: 24.64 }), 9);
  assert.ok(mesh.count < here / 3);
  // Each stands where it should: the Sphere's ball over its own middle, 190 m north of the fairground's mark.
  landmarkModels(mesh, { lng: BOULEVARD_WORLD[0], lat: BOULEVARD_WORLD[1] });
  const ball = facesOf(mesh).filter((face) => face.kind === 'lamp' && face.corners.every(([east, north, up]) => near(Math.hypot(east - 40.5, north - 190.5, up - 22), 17.5, 0.05)));
  assert.ok(ball.length > 1500);
});
