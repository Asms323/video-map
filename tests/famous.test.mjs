import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FAMOUS, MINISTRY, stepped } from '../js/famous.js';
import { LANDMARKS, landmarkBeacons, landmarkModels, landmarkShades, replacedByLandmarks } from '../js/landmarks.js';
import { Model, ModelMesh } from '../js/models.js';
import { facesOf } from './model-faces.mjs';

const METERS = 111320;
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
const squareMeters = (ring) => ring.reduce((sum, [x0, y0], i) => sum + x0 * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y0, 0) / 2;
const famous = (id) => FAMOUS.find((one) => one.id === id);
/** A famous building built about its own middle, not turned: its triangles. */
const built = (id) => {
  const mesh = new ModelMesh();
  const made = famous(id).model(new Model(mesh));
  return { faces: facesOf(mesh), made, mesh };
};
const heights = (faces) => faces.flatMap((face) => face.corners.map((corner) => corner[2]));
/** Which way a triangle itself looks, whatever the light is told: [east, north, up], one long. */
const lookOf = ({ corners: [a, b, c] }) => {
  const [u, v] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
  const way = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const size = Math.hypot(...way) || 1;
  return way.map((part) => part / size);
};

test('the famous buildings are landmarks of the map: each where it stands, with its clearing and its shadow', () => {
  assert.deepEqual(FAMOUS.map((one) => one.id), ['interior-ministry']);
  for (const one of FAMOUS) {
    assert.equal(LANDMARKS.find((landmark) => landmark.id === one.id), one);
    assert.ok(one.at[0] > 46.4 && one.at[0] < 46.9 && one.at[1] > 24.5 && one.at[1] < 24.9, 'in Riyadh');
    assert.ok(typeof one.model === 'function' && one.height > 5 && one.clear >= 0 && one.reach > 0 && one.name.length > 3);
    const { faces } = built(one.id);
    assert.ok(faces.length > 500, `${one.id}: ${faces.length} triangles: built with its details`);
    // It stands on the ground, is as tall as told (a lamp on top may stand over that) and keeps within its reach.
    assert.equal(Math.min(...heights(faces)), 0, one.id);
    assert.ok(Math.max(...heights(faces)) >= one.height - 0.2 && Math.max(...heights(faces)) <= one.height + 0.5, `${one.id}: ${Math.max(...heights(faces))} m for ${one.height} m`);
    assert.ok(Math.max(...faces.flatMap((face) => face.corners.map(([east, north]) => Math.hypot(east, north)))) < one.reach, one.id);
    for (const face of faces) {
      assert.ok(near(Math.hypot(...face.normal), 1, 1e-4), one.id);
      assert.ok(['plain', 'glass', 'lamp', 'pierced'].includes(face.kind) && /^#[0-9a-f]{6}$/.test(face.colour), one.id);
    }
    assert.ok(faces.filter((face) => face.glow > 0 || face.lit > 0).length > 50, `${one.id}: lit by night`);
  }
  // The ministry is built for a view within nine kilometres of it, and not from further off.
  const ministry = famous('interior-ministry');
  const mesh = new ModelMesh();
  // (Looked for to the south of it, where nothing else comes and goes with a step of two hundred metres.)
  const without = landmarkModels(mesh, { lng: ministry.at[0], lat: ministry.at[1] - 9100 / METERS });
  assert.equal(landmarkModels(mesh, { lng: ministry.at[0], lat: ministry.at[1] - 8900 / METERS }), without + 1);
  // The map's own block at its middle makes way for it (the map has only a round one, where the dome is); the buildings across its garden do not.
  const squeeze = METERS * Math.cos((ministry.at[1] * Math.PI) / 180);
  const round = (east, north, radius) => Array.from({ length: 13 }, (_, i) => [ministry.at[0] + (east + Math.cos((i / 12) * Math.PI * 2) * radius) / squeeze, ministry.at[1] + (north + Math.sin((i / 12) * Math.PI * 2) * radius) / METERS]);
  assert.deepEqual([...replacedByLandmarks([{ id: 1, ring: round(-22, 16, 23.6) }, { id: 2, ring: round(-70, 120, 30) }, { id: 3, ring: round(150, 0, 12) }])], [1]);
  // Its shadow is that of its widest floor; and it has no red lamp of the kind the towers carry (it is under 60 m: its own is part of it).
  const shade = landmarkShades().find((one) => one.height === 33);
  assert.ok(shade && shade.polygons[0][0].every(([lng, lat]) => near(Math.hypot((lng - ministry.at[0]) * squeeze, (lat - ministry.at[1]) * METERS), 78, 0.5)));
  assert.equal(landmarkBeacons().filter(([lng, lat]) => Math.hypot((lng - ministry.at[0]) * squeeze, (lat - ministry.at[1]) * METERS) < 100).length, 0);
});

test('stepped: a square whose corners are cut back in steps', () => {
  // No steps: the square itself, anticlockwise.
  assert.deepEqual(stepped(10), [[10, 10], [-10, 10], [-10, -10], [10, -10]]);
  // One step of 3 m: each corner is a notch of 3 by 3, so twelve corners; and it has lost 4 x 9 m2.
  const one = stepped(10, 1, 3);
  assert.equal(one.length, 12);
  assert.deepEqual(one.slice(0, 3), [[10, 7], [7, 7], [7, 10]]);
  assert.ok(near(squareMeters(one), 400 - 36, 1e-9));
  // Three steps: a stair of three at every corner, twenty-eight corners in all; every side of it runs east or north; and it is the same turned a quarter.
  const three = stepped(82.2, 3);
  assert.equal(three.length, 28);
  three.forEach((corner, i) => {
    const next = three[(i + 1) % 28];
    assert.ok(near(corner[0], next[0], 1e-9) || near(corner[1], next[1], 1e-9));
  });
  const turned = three.map(([east, north]) => [-north, east]);
  for (const corner of turned) assert.ok(three.some((other) => near(other[0], corner[0], 1e-9) && near(other[1], corner[1], 1e-9)));
  assert.ok(squareMeters(three) > 0, 'anticlockwise');
  // (Its outermost corners stand 82.2 m out along the sides and 9.07 m x 3 short of the square's own corner.)
  assert.ok(near(three[0][0], 82.2) && near(three[0][1], 82.2 - 3 * 9.07, 1e-9));
});

test('the Ministry of Interior: an upside-down pyramid of five floors, each a leaning band of stone over a band of glass', () => {
  const M = MINISTRY;
  const ministry = famous('interior-ministry');
  assert.deepEqual([ministry.name, ministry.bearing, ministry.height], ['Ministry of Interior', 45, 56.2]);
  // (On King Fahd Road at Al Olaya, where the satellite photo has its dome.)
  assert.ok(near(ministry.at[0], 46.6959, 3e-4) && near(ministry.at[1], 24.6702, 3e-4));
  const { faces } = built('interior-ministry');
  // The glass of the five floors: dark, in narrow bays, each band 2.4 m high and each floor's 5.2 m further out than the one below.
  const glass = faces.filter((face) => face.kind === 'glass' && face.colour === '#1f1c19' && Math.max(...face.corners.map((corner) => corner[2])) <= M.tip);
  for (let floor = 0; floor < 5; floor += 1) {
    const sill = M.foot + floor * M.storey;
    const band = glass.filter((face) => face.corners.every((corner) => corner[2] >= sill - 1e-3 && corner[2] <= sill + M.window + 1e-3));
    assert.equal(band.length, 28 * 2, `floor ${floor}`);
    assert.ok(band.every((face) => near(face.normal[2], 0, 1e-6) && face.bay === 1.5), 'upright');
    const out = Math.max(...band.flatMap((face) => face.corners.map(([east, north]) => Math.max(Math.abs(east), Math.abs(north)))));
    assert.ok(near(out, M.narrow + floor * M.widening - M.recess, 1e-3), `floor ${floor}: ${out}`);
  }
  assert.equal(glass.length, 5 * 56);
  assert.ok(near(M.foot + 5 * M.storey, M.tip, 1e-9));
  // The bands of stone lean outwards as they rise (they look down), from the head of one floor's glass to the sill of the next;
  // the light falls on them as on a wall, and the shadow of the floors above is not counted against them.
  const bands = faces.filter((face) => face.colour === '#d8cbae' && face.open);
  assert.equal(bands.length, 5 * 56);
  // (5.2 m + 1 m out for 2.4 m up: they look down more than out.)
  assert.ok(bands.every((face) => near(lookOf(face)[2], -6.2 / Math.hypot(6.2, 2.4), 1e-3)));
  for (const face of bands) {
    assert.ok(face.kind === 'plain' && face.glow > 0.4 && near(face.ridge, 0.8, 0.01), 'floodlit, with a line of lamps');
    assert.ok(face.normals.every((looks) => near(looks[2], -0.3 / Math.hypot(1, 0.3), 1e-3)), 'lit as a wall');
    const [low, high] = [Math.min(...face.corners.map((corner) => corner[2])), Math.max(...face.corners.map((corner) => corner[2]))];
    assert.ok(near(high - low, M.storey - M.window, 1e-3));
  }
  // The widest edge: 82.2 m from the middle along each side, 33.6 m up; nothing below it stands further out.
  const below = faces.filter((face) => face.corners.every((corner) => corner[2] <= M.tip + 1e-3));
  const widest = Math.max(...below.flatMap((face) => face.corners.map(([east, north]) => Math.max(Math.abs(east), Math.abs(north)))));
  assert.ok(near(widest, 82.2, 0.01) || widest > 82.2, String(widest)); // (the pavilions stand a little further out)
  const tips = bands.flatMap((face) => face.corners).filter((corner) => near(corner[2], M.tip, 1e-3));
  assert.ok(near(Math.max(...tips.map(([east, north]) => Math.max(Math.abs(east), Math.abs(north)))), 82.2, 1e-3));
  // Its corners are cut back in three steps on every floor: no corner of a floor stands out past 82.2 + 82.2 - 27.2 along the two sides together.
  assert.ok(tips.every(([east, north]) => Math.abs(east) + Math.abs(north) <= 82.2 * 2 - 3 * 9.07 + 1e-3));
  // Under the pyramid: a hall of glass with its lamps on, among twenty-four columns, on a podium of stone with windows.
  const hall = faces.filter((face) => face.kind === 'glass' && face.colour === '#3a332b');
  assert.ok(hall.length === 8 && hall.every((face) => face.lit > 0.8 && face.corners.every((corner) => corner[2] >= M.podium - 1e-3 && corner[2] <= M.foot + 1e-3)));
  const columns = faces.filter((face) => face.colour === '#e2d7bf');
  assert.equal(columns.length, 24 * 8);
  assert.ok(faces.some((face) => face.kind === 'pierced' && face.corners.every((corner) => corner[2] <= M.podium + 1e-3)));
  // The underside of the pyramid looks down, and is lit from below.
  const under = faces.filter((face) => face.normal[2] < -0.99 && face.corners.every((corner) => near(corner[2], M.foot, 1e-3)));
  assert.ok(under.length > 10 && under.every((face) => face.glow > 0.3));
});

test('the Ministry of Interior: its roof in steps, a glazed lantern with sixteen skylights, and the dome with its ring of windows', () => {
  const M = MINISTRY;
  const { faces } = built('interior-ministry');
  const flatAt = (up) => faces.filter((face) => face.normal[2] > 0.99 && face.corners.every((corner) => near(corner[2], up, 1e-3)));
  const acres = (list) => list.reduce((sum, face) => {
    const [a, b, c] = face.corners;
    return sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }, 0);
  // The white roof slopes up from the widest edge to the terrace: 5.8 m in and 4.2 m up.
  const skirt = faces.filter((face) => face.colour === '#efe9da' && face.normal[2] > 0.3 && face.normal[2] < 0.95);
  assert.equal(skirt.length, 56);
  assert.ok(skirt.every((face) => face.corners.every((corner) => near(corner[2], M.tip, 1e-3) || near(corner[2], M.terrace, 1e-3))));
  assert.ok(near(skirt[0].normal[2], 5.8 / Math.hypot(5.8, 4.2), 0.02));
  // The terrace is a ring between 76.4 and 69.3 m; the top storey stands back on it, glass under a band of stone, 3.8 m high.
  assert.ok(near(acres(flatAt(M.terrace)), squareMeters(stepped(M.terraceHalf, 3)) - squareMeters(stepped(M.upperHalf, 3)), 1));
  const upper = faces.filter((face) => near(face.normal[2], 0, 1e-6) && face.corners.every((corner) => corner[2] >= M.terrace - 1e-3 && corner[2] <= M.roof + 0.11) && face.corners.some((corner) => Math.max(Math.abs(corner[0]), Math.abs(corner[1])) > 60));
  assert.ok(upper.some((face) => face.kind === 'glass') && upper.some((face) => face.kind === 'plain' && face.colour === '#d8cbae'));
  // The lantern: slanting glass from 55 m out at the roof to 48.6 m at its top, 2 m higher; its corners in two steps.
  const [lanternFoot, lanternTop, lanternUp] = M.lantern;
  const slant = faces.filter((face) => face.kind === 'glass' && face.colour === '#77858c' && face.corners.every((corner) => near(corner[2], M.roof, 1e-3) || near(corner[2], lanternUp, 1e-3)));
  assert.equal(slant.length, 20 * 2);
  assert.ok(slant.every((face) => face.normal[2] > 0.5 && face.lit > 0.5));
  assert.ok(near(Math.max(...slant.flatMap((face) => face.corners.map(([east, north]) => Math.max(Math.abs(east), Math.abs(north))))), lanternFoot, 1e-3));
  assert.ok(near(Math.max(...slant.flatMap((face) => face.corners.filter((corner) => near(corner[2], lanternUp, 1e-3)).map(([east, north]) => Math.max(Math.abs(east), Math.abs(north))))), lanternTop, 1e-3));
  // Sixteen round skylights on it: three along each side, 36.4 m out, and one at each corner.
  const bubbles = faces.filter((face) => face.kind === 'glass' && face.colour === '#4f6672');
  const tops = bubbles.flatMap((face) => face.corners).filter((corner) => near(corner[2], lanternUp + 1.5, 1e-3));
  const places = [...new Set(tops.map(([east, north]) => `${Math.round(east * 10) / 10},${Math.round(north * 10) / 10}`))];
  assert.equal(places.length, 16);
  assert.equal(places.filter((place) => place.split(',').some((part) => near(Math.abs(Number(part)), 36.4, 0.05))).length, 12);
  assert.equal(places.filter((place) => place.split(',').every((part) => near(Math.abs(Number(part)), 27.6, 0.05))).length, 4);
  // The dome: a cap of a ball, 43.5 m across at its foot and 11.6 m high; smooth; lit by night.
  const dome = faces.filter((face) => face.colour === '#e3d5b3');
  assert.equal(dome.length, 40 * 9 * 2);
  const rise = M.domeTop - M.court;
  const ball = (M.domeRadius ** 2 + rise ** 2) / (2 * rise);
  assert.ok(near(rise, 11.6, 1e-9) && near(ball, 26.19, 0.01));
  for (const face of dome) {
    for (const [east, north, up] of face.corners) assert.ok(near(Math.hypot(east, north, up - (M.domeTop - ball)), ball, 1e-3));
    assert.ok(face.glow > 0.7 && face.normals.some((looks, k) => Math.hypot(looks[0] - face.normals[(k + 1) % 3][0], looks[1] - face.normals[(k + 1) % 3][1]) > 1e-3), 'lit as a curve');
  }
  assert.ok(near(Math.max(...dome.flatMap((face) => face.corners.map(([east, north]) => Math.hypot(east, north)))), M.domeRadius, 1e-3));
  assert.ok(near(Math.min(...heights(dome)), M.court, 1e-3));
  // Its ring of thirty-two round windows, 18.25 m from its axis, lying on it: lamps by night.
  const eyes = faces.filter((face) => face.kind === 'lamp' && face.colour === '#3b3832');
  assert.equal(eyes.length, 32 * 6);
  for (const face of eyes) {
    const middle = [0, 1, 2].map((k) => (face.corners[0][k] + face.corners[1][k] + face.corners[2][k]) / 3);
    assert.ok(near(Math.hypot(middle[0], middle[1]), M.eyesOut, 1));
    assert.ok(near(Math.hypot(middle[0], middle[1], middle[2] - (M.domeTop - ball)), ball + 0.12, 0.05) && face.glow > 0.8);
  }
  // The cap on top, 56.2 m up, and a red lamp on it.
  const lamp = faces.filter((face) => face.kind === 'lamp' && face.colour === '#a02a22');
  assert.ok(lamp.length >= 6 && lamp.every((face) => face.light === '#ff3a2c' && face.corners.every((corner) => corner[2] >= M.top - 0.11 && Math.hypot(corner[0], corner[1]) < 0.3)));
  // Two pavilions at its foot, with nine little domes of glass and three.
  const little = faces.filter((face) => face.kind === 'glass' && face.colour === '#5a7480');
  const points = [...new Set(little.flatMap((face) => face.corners).filter((corner) => near(corner[2], 7.5, 1e-3)).map(([east, north]) => `${Math.round(east * 10) / 10},${Math.round(north * 10) / 10}`))];
  assert.equal(points.length, 12);
});
