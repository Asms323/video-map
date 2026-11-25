import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AIRLINERS, AIRLINER_PARTS, airliner } from '../js/airliner.js';
import { typicalFlights } from '../js/flights.js';
import { Mesh } from '../js/life.js';
import { NEAR_AIRCRAFT_METERS, drawAircraft } from '../js/sky.js';

const near = (a, b, by) => Math.abs(a - b) <= by;
/** The corners of a mesh: [x, y, z, r, g, b, a] (the colour as stored: by the light it gives or is covered by). */
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 4)]);
/** The corners of a model, three to a triangle, with what each triangle is part of. */
const modelCorners = (model) => Array.from({ length: model.parts.length * 3 }, (_, i) => ({ at: [...model.corners.subarray(i * 3, i * 3 + 3)], part: AIRLINER_PARTS[model.parts[Math.floor(i / 3)]] }));
const extent = (points, k) => Math.max(...points.map((p) => p[k])) - Math.min(...points.map((p) => p[k]));

test('the airliners are their true size: an A320 and a wide-body, nose to tail, wing tip to wing tip, wheels to fin tip', () => {
  const narrow = modelCorners(airliner('narrow', { gear: true })).map((c) => c.at);
  assert.ok(near(extent(narrow, 1), 37.6, 0.05), 'as long as an A320');
  assert.ok(near(extent(narrow, 0), 36.9, 0.8), 'as wide across the wings, with their blades');
  assert.ok(near(Math.max(...narrow.map((p) => p[2])), 11.76, 0.3), 'as tall: 11.76 m to the top of the fin');
  assert.ok(near(Math.min(...narrow.map((p) => p[2])), 0, 0.05), 'standing on its wheels');
  const wide = modelCorners(airliner('wide')).map((c) => c.at);
  assert.ok(near(extent(wide, 1), 64, 0.05) && near(extent(wide, 0), 60, 0.1) && near(Math.max(...wide.map((p) => p[2])), 17.3, 0.5));
  // (With its wheels up nothing reaches down to the ground: the engines are lowest, half a metre up.)
  const clean = modelCorners(airliner('narrow')).map((c) => c.at);
  assert.ok(Math.min(...clean.map((p) => p[2])) > 0.3);
  // The same model is made once and kept.
  assert.equal(airliner('narrow', { gear: true }), airliner('narrow', { gear: true }));
  for (const model of [airliner('narrow'), airliner('wide', { gear: true, flaps: 30 })]) assert.ok([...model.corners, ...model.normals].every(Number.isFinite));
});

test('its body faces outwards all round, its wheels and flaps come down when told, and its lamps are where they belong', () => {
  const model = airliner('narrow', { gear: true, flaps: 30 });
  const s = AIRLINERS.narrow;
  let faced = 0;
  for (let i = 0; i < model.parts.length; i += 1) {
    const part = AIRLINER_PARTS[model.parts[i]];
    if (part !== 'body' && part !== 'belly') continue;
    const c = [0, 1, 2].map((k) => (model.corners[i * 9 + k] + model.corners[i * 9 + 3 + k] + model.corners[i * 9 + 6 + k]) / 3);
    if (Math.abs(c[1]) > s.length / 4) continue; // (the even part of the body, where its axis is plain)
    const out = [c[0], 0, c[2] - s.centre];
    const n = model.normals.subarray(i * 3, i * 3 + 3);
    assert.ok(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0, `triangle ${i} faces inwards`);
    faced += 1;
  }
  assert.ok(faced > 40);
  const parts = (m) => new Set(Array.from(m.parts, (p) => AIRLINER_PARTS[p]));
  assert.ok(parts(model).has('tyre') && !parts(airliner('narrow')).has('tyre'), 'wheels only when they are down');
  assert.ok(airliner('narrow', { flaps: 30 }).parts.length > airliner('narrow').parts.length, 'flaps hang from the wings when they are down');
  for (const name of ['cockpit', 'window', 'engine', 'intake', 'fin', 'wing']) assert.ok(parts(model).has(name), name);
  // Its windows, a row down each side; red on the left wing tip, green on the right, white at the tail.
  assert.ok(model.windows.length > 60 && model.windows.filter((w) => w[0] < 0).length === model.windows.length / 2);
  const { left, right, tail, landing } = model.lamps;
  assert.ok(left[0] < -16 && right[0] > 16 && near(tail[1], -18.9, 0.2) && landing.length === 2);
});

const eye = [0, 0, 2400]; // high over the city, looking down on it, as the 3D map does
const origin = { lng: 46.68, lat: 24.71 };
const metres = 111320;
const sun = { azimuth: 180, altitude: 50 };
const plane = { id: 'in1', kind: 'typical', phase: 'landing', lng: 46.68, lat: 24.71 + 1500 / metres, alt: 600, track: 90, speed: 80, climb: -4, bank: 0, wide: false, tail: [22, 110, 84], body: [238, 232, 216] };
const meshes = () => ({ sky: new Mesh(), skyLamps: new Mesh(), near: { body: new Mesh(), glow: new Mesh(), lamps: new Mesh() } });

test('an aircraft near the eye is drawn whole and true, wherever the eye is: from above it is as large as it is', () => {
  const m = meshes();
  const shown = [];
  assert.equal(drawAircraft(m.sky, m.skyLamps, { eye, origin, planes: [plane], sun, near: m.near, shown }), 1);
  assert.equal(m.sky.count, 0, 'not in the sky');
  const body = corners(m.near.body).filter((c) => c[2] > 100); // (its faint shadow, down on the ground, aside)
  assert.ok(body.length === airliner('narrow', { gear: true, flaps: 30 }).parts.length * 3, 'the whole airliner: coming in at 600 m, its wheels and flaps down');
  assert.ok(corners(m.near.body).some((c) => c[2] < 0.3 && c[6] > 0 && c[6] < 50), 'and its shadow, faint from so high');
  // Where it is, nose to the east; life size, seen from above (the eye is higher than it).
  assert.ok(near(extent(body, 0), 37.6, 0.6) && near(extent(body, 1), 36.9, 1));
  assert.ok(near(Math.min(...body.map((c) => c[2])), 600 - 1500 ** 2 / (2 * 7.4e6) + 0.5, 1));
  assert.ok(shown.length === 1 && shown[0].id === 'in1' && shown[0].far < 2500);
  // Lit by the sun from the south: its south side (its right, flying east) brighter than its north side.
  const side = (sign) => body.filter((c) => sign * (c[1] - 1500) > 1.5 && near(c[2], 604, 1.5));
  const tone = (list) => list.reduce((sum, c) => sum + c[3] + c[4] + c[5], 0) / list.length;
  assert.ok(tone(side(-1)) > tone(side(1)), 'the side towards the sun is the lighter');
  // By day: no lamps, no lit windows; low under the sun, its shadow on the ground, laid away from the sun.
  assert.equal(m.near.lamps.count + m.near.glow.count, 0);
  drawAircraft(m.sky, m.skyLamps, { eye, origin, planes: [{ ...plane, alt: 120 }], sun, near: m.near });
  const shadow = corners(m.near.body).filter((c) => c[2] < 0.3);
  assert.ok(shadow.length > 0 && shadow.every((c) => c[3] === 0 && c[6] > 0 && c[6] < 120), 'dark and see-through');
  const north = shadow.reduce((sum, c) => sum + c[1], 0) / shadow.length - 1500;
  assert.ok(near(north, (120 + 3.9) / Math.tan((50 * Math.PI) / 180), 15), `north of it, as far as the sun's height lays it (${north})`);
  // A turn to the right: the right wing down.
  drawAircraft(m.sky, m.skyLamps, { eye, origin, planes: [{ ...plane, bank: 25 }], sun, near: m.near });
  const tips = corners(m.near.body).filter((c) => Math.abs(c[1] - 1500) > 16 && c[2] > 100);
  const [rightTip, leftTip] = [tips.filter((c) => c[1] < 1500), tips.filter((c) => c[1] > 1500)].map((list) => Math.min(...list.map((c) => c[2])));
  assert.ok(rightTip < leftTip - 10, 'banked');
});

test('by night a near aircraft shows its lamps and its lit windows; one far off is drawn in the sky as before', () => {
  const m = meshes();
  drawAircraft(m.sky, m.skyLamps, { eye, origin, planes: [plane], night: 1, sun: null, near: m.near, seconds: 0.3 });
  const lamps = corners(m.near.lamps);
  assert.ok(lamps.some((c) => c[3] === 255 && c[4] === 60) && lamps.some((c) => c[3] === 70 && c[4] === 255), 'red and green');
  assert.ok(lamps.some((c) => c[3] === 255 && c[4] === 248), 'its landing lamps, coming in below three kilometres');
  assert.ok(m.near.glow.count >= airliner('narrow').windows.length * 6, 'the cabin lit');
  // Further off than the near ones: in the sky, larger than life; and not at all where the sky is not drawn.
  const away = { ...plane, lat: 24.71 + (NEAR_AIRCRAFT_METERS + 5000) / metres, alt: 3000 };
  drawAircraft(m.sky, m.skyLamps, { eye: [0, 0, 100], origin, planes: [away], sun, near: m.near });
  assert.ok(m.sky.count > 0 && m.near.body.count === 0);
  assert.equal(drawAircraft(m.sky, m.skyLamps, { eye: [0, 0, 100], origin, planes: [away], sun, near: m.near, far: false }), 0);
});

test("the airport's usual flights bank into their turns, and fly level otherwise", () => {
  let turning = 0;
  for (let t = 0; t < 1800; t += 3) {
    for (const p of typicalFlights(Date.UTC(2026, 10, 25, 14) / 1000 + t, { windFrom: 330 })) {
      assert.ok(Number.isFinite(p.bank) && Math.abs(p.bank) <= 30);
      if (p.phase === 'cruise') assert.equal(p.bank, 0);
      if (Math.abs(p.bank) > 5) turning += 1;
    }
  }
  assert.ok(turning > 20, `some turn (${turning})`);
});
