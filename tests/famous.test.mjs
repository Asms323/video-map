import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FAMOUS, LIBRARY, MAJDOUL, MASMAK, MINISTRY, RAFAL, TV_TOWER, inset, majdoulAnnex, majdoulSquare, majdoulTower, rafalHalf, rafalRim, rafalTower, stepped, tvTower } from '../js/famous.js';
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
  assert.deepEqual(FAMOUS.map((one) => one.id), ['interior-ministry', 'king-fahd-library', 'masmak-fort']);
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
  // (Looked for to the west of it, where nothing else comes and goes with a step of two hundred metres.)
  const west = METERS * Math.cos((ministry.at[1] * Math.PI) / 180);
  const without = landmarkModels(mesh, { lng: ministry.at[0] - 9100 / west, lat: ministry.at[1] });
  assert.equal(landmarkModels(mesh, { lng: ministry.at[0] - 8900 / west, lat: ministry.at[1] }), without + 1);
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

test('the King Fahd National Library: a glass box on columns, wrapped in a veil of sails; skylights and the old dome on its roof', () => {
  const L = LIBRARY;
  const library = famous('king-fahd-library');
  assert.deepEqual([library.name, library.bearing, library.clear], ['King Fahd National Library', 336.4, 66]);
  assert.ok(near(library.height, 26.1, 1e-9));
  // (On King Fahd Road north of Al Faisaliah: at the middle of the outline the buildings data has of it.)
  assert.ok(near(library.at[0], 46.68645, 1e-4) && near(library.at[1], 24.68566, 1e-4));
  const { faces } = built('king-fahd-library');
  const half = (L.across * L.sail) / 2;
  assert.ok(near(half, 71.05, 1e-9));
  // The veil: on each of the four sides, seven rows of whole sails and a row of half ones at the foot,
  // by turns twenty-nine and twenty-eight to a row: 228 a side.
  const veil = faces.filter((face) => face.colour === '#f3f0e7');
  assert.equal(veil.length, 4 * ((4 * 29 + 3 * 28) * 10 + 28 * 2));
  assert.ok(veil.every((face) => face.kind === 'plain' && face.glow > 0.8), 'every sail is lit by night');
  const spots = veil.flatMap((face) => face.corners);
  // It hangs between the two nets: from 71.05 m out, the front one, to 2.4 m behind it; and from 6.5 m up to 26.1 m.
  const out = spots.map(([east, north]) => Math.max(Math.abs(east), Math.abs(north)));
  assert.ok(near(Math.max(...out), half, 1e-3) && near(Math.min(...out), half - L.depth, 1e-3));
  assert.ok(near(Math.min(...spots.map((spot) => spot[2])), L.foot, 1e-3) && near(Math.max(...spots.map((spot) => spot[2])), 26.1, 1e-3));
  // Every sail is fastened by its top and its bottom to the front net, by its two sides to the back one,
  // and its middle hangs between the two: so of the east side's sails, the points furthest out are the highest and lowest of each.
  // (Looked at in the middle of the east side, clear of the sails of the two sides that meet it at its corners.)
  const east = veil.filter((face) => face.corners.every((corner) => corner[0] > half - L.depth - 1e-3 && Math.abs(corner[1]) <= 30));
  const front = east.flatMap((face) => face.corners).filter((corner) => near(corner[0], half, 1e-3));
  const behind = east.flatMap((face) => face.corners).filter((corner) => near(corner[0], half - L.depth, 1e-3));
  const levels = (list) => [...new Set(list.map((corner) => Math.round(((26.1 - corner[2]) / (L.sail / 2)) * 100) / 100))].sort((a, b) => a - b);
  // (Counted in half sails down from the top: tops and bottoms from the very top to one above the foot; sides from one below the top to the foot.)
  assert.deepEqual(levels(front), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(levels(behind), [1, 2, 3, 4, 5, 6, 7, 8]);
  // A sail is drawn in between its corners: it covers 72 of a hundred parts of its square.
  // (The middle sail of the top row: all that lies within its square, which stands on its point.)
  const one = east.filter((face) => face.corners.every((corner) => Math.abs(corner[1]) + Math.abs(corner[2] - (26.1 - L.sail / 2)) <= L.sail / 2 + 1e-3));
  assert.equal(one.length, 10);
  const seen = one.filter((face) => face.normal[0] > 0).reduce((sum, { corners: [a, b, c] }) => sum + Math.abs((b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])) / 2, 0);
  assert.ok(near(seen / (L.sail ** 2 / 2), L.scallop, 0.01), String(seen));

  // Behind the veil: the glass box, four storeys from the ceiling of the ground floor to the roof.
  const glass = faces.filter((face) => face.kind === 'glass' && face.colour === '#27343c');
  assert.equal(glass.length, 8);
  assert.ok(glass.every((face) => near(face.storey, (L.roof - L.foot) / 4, 1e-6) && face.lit > 0.5 && face.corners.every((corner) => near(Math.max(Math.abs(corner[0]), Math.abs(corner[1])), L.glass, 1e-3))));
  // The ground floor stands open: glass further back, with its lamps on, behind fifteen round columns to a side.
  const hall = faces.filter((face) => face.kind === 'glass' && face.colour === '#4b5f69');
  assert.ok(hall.length === 8 && hall.every((face) => face.lit === 1 && face.corners.every((corner) => corner[2] <= L.foot + 1e-3)));
  const columns = faces.filter((face) => face.colour === '#dcdcd8');
  assert.equal(columns.length, 4 * 15 * 6 * 2);
  assert.ok(columns.every((face) => face.corners.every((corner) => corner[2] <= L.foot + 1e-3 && Math.max(Math.abs(corner[0]), Math.abs(corner[1])) > half - L.depth - 0.5)));

  // The roof: forty strips of skylight, ten to a side, each 2.4 m wide, lit by night; the longest 25 m, the shortest 8.9 m.
  const strips = faces.filter((face) => face.kind === 'glass' && face.colour === '#7d8779');
  assert.equal(strips.length, 40 * 2);
  assert.ok(strips.every((face) => face.lit === 1 && face.normal[2] > 0.99 && face.corners.every((corner) => near(corner[2], L.roof + 0.25, 1e-3))));
  const lengths = [];
  for (let n = 0; n < strips.length; n += 2) {
    const spotsOf = [...strips[n].corners, ...strips[n + 1].corners];
    const [wide, deep] = [Math.max(...spotsOf.map((spot) => spot[0])) - Math.min(...spotsOf.map((spot) => spot[0])), Math.max(...spotsOf.map((spot) => spot[1])) - Math.min(...spotsOf.map((spot) => spot[1]))];
    assert.ok(near(Math.min(wide, deep), 2.4, 1e-3));
    lengths.push(Math.round(Math.max(wide, deep) * 10) / 10);
  }
  assert.deepEqual([...new Set(lengths)].sort((a, b) => a - b), [8.9, 18.7, 25]);
  // In its middle the eight-sided court, 53 m across, goes down to the roof of the old library; and in that stands the dome, of glass, as high as the veil.
  const walls = faces.filter((face) => face.kind === 'glass' && face.colour === '#2c3a42');
  assert.equal(walls.length, 16);
  for (const face of walls) {
    assert.ok(face.corners.every((corner) => near(Math.hypot(corner[0], corner[1]), L.well, 1e-3) && corner[2] >= L.wellFloor - 1e-3 && corner[2] <= L.roof + 1e-3));
    const middle = [(face.corners[0][0] + face.corners[1][0] + face.corners[2][0]) / 3, (face.corners[0][1] + face.corners[1][1] + face.corners[2][1]) / 3];
    assert.ok(face.normal[0] * middle[0] + face.normal[1] * middle[1] < 0, 'they look into the court');
  }
  const dome = faces.filter((face) => face.kind === 'glass' && face.colour === '#6c8d94');
  assert.equal(dome.length, 24 * 6 * 2 - 0);
  assert.ok(near(Math.max(...heights(dome)), 26, 0.02) && near(Math.min(...heights(dome)), 20, 1e-3));
  assert.ok(near(Math.max(...dome.flatMap((face) => face.corners.map((corner) => Math.hypot(corner[0], corner[1])))), 8.8, 1e-3));
});

test('inset moves every side of a ring in, or out, by so much', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.deepEqual(inset(square, 1), [[1, 1], [9, 1], [9, 9], [1, 9]]);
  assert.deepEqual(inset(square, -2), [[-2, -2], [12, -2], [12, 12], [-2, 12]]);
  assert.deepEqual(inset(square, 0), square);
  // A ring that is not square: every side is still moved by just so much, measured square to it.
  const ring = MASMAK.corners;
  const moved = inset(ring, 1.5);
  ring.forEach(([u, v], i) => {
    const [nextU, nextV] = ring[(i + 1) % 4];
    const long = Math.hypot(nextU - u, nextV - v);
    for (const [pu, pv] of [moved[i], moved[(i + 1) % 4]]) assert.ok(near(((nextU - u) * (pv - v) - (nextV - v) * (pu - u)) / long, 1.5, 1e-9));
  });
});

test('Masmak Fort: four leaning walls of clay with a round tower at each corner, a gate in the west wall, courts and a square tower within', () => {
  const F = MASMAK;
  const fort = famous('masmak-fort');
  assert.deepEqual([fort.name, fort.bearing, fort.height, fort.clear], ['Masmak Fort', 0, 18, 36]);
  // (In the old town, at the middle of the outline the buildings data has of it.)
  assert.ok(near(fort.at[0], 46.71337, 1e-4) && near(fort.at[1], 24.63122, 1e-4));
  const { faces } = built('masmak-fort');
  const turn = (F.turn * Math.PI) / 180;
  const placed = ([u, v]) => [u * Math.cos(turn) - v * Math.sin(turn), u * Math.sin(turn) + v * Math.cos(turn)];
  const own = ([east, north]) => [east * Math.cos(turn) + north * Math.sin(turn), -east * Math.sin(turn) + north * Math.cos(turn)];
  // Its plan: four walls that are not quite square to one another, 60 m along the north and some 45 m along the others.
  const sides = F.corners.map((corner, i) => Math.hypot(F.corners[(i + 1) % 4][0] - corner[0], F.corners[(i + 1) % 4][1] - corner[1]));
  assert.deepEqual(sides.map((side) => Math.round(side)), [60, 45, 50, 43]);
  // The walls lean back as they rise: at the ground they stand 0.6 m further out than at their top, 9.5 m up.
  const clay = faces.filter((face) => face.colour === '#c8a878');
  const outer = clay.filter((face) => face.glow > 0.7 && near(Math.min(...face.corners.map((corner) => corner[2])), 0, 1e-6) && near(Math.max(...face.corners.map((corner) => corner[2])), F.wall, 1e-6));
  assert.equal(outer.length, 8);
  for (const face of outer) assert.ok(near(face.normal[2], F.batter / Math.hypot(F.batter, F.wall), 1e-3), 'they look a little upwards');
  // Along their tops, small pointed battlements, some hundred and thirty of them; under them three-cornered holes; and wooden spouts.
  const teeth = clay.filter((face) => face.glow > 0.7 && near(Math.max(...face.corners.map((corner) => corner[2])), F.wall + 0.75, 1e-6));
  assert.ok(teeth.length > 110 && teeth.length < 150, String(teeth.length));
  const holes = faces.filter((face) => face.colour === '#4a3826' && face.corners.every((corner) => corner[2] > F.roof - 1 && corner[2] < F.roof));
  assert.ok(holes.length > 60 && holes.length < 90, String(holes.length));
  const wood = faces.filter((face) => face.colour === '#6b4a2b');
  assert.ok(wood.length > 100);

  // The four towers: round, 8.8 m across at the foot and 6.1 m at the top, with a ledge 12 m up; their battlements end in points 18 m up.
  for (const middle of F.towers) {
    const [east, north] = placed(middle);
    const round = faces.filter((face) => face.corners.every((corner) => Math.hypot(corner[0] - east, corner[1] - north) < F.tower[0] + 2));
    const far = (from, to) => Math.max(...round.flatMap((face) => face.corners).filter((corner) => corner[2] >= from && corner[2] <= to).map((corner) => Math.hypot(corner[0] - east, corner[1] - north)));
    assert.ok(near(far(0, 0.01), F.tower[0], 1e-3) && near(far(F.tower[3] - 0.01, F.tower[3] + 0.01), F.tower[1] + 0.22, 1e-3) && near(far(F.tower[5] - 1.61, F.tower[5] - 1.59), F.tower[2], 1e-3));
    assert.ok(near(Math.max(...heights(round)), 18, 1e-3));
    // (Ten battlements, each coming to a point; sixteen holes in two rings.)
    assert.equal(round.flatMap((face) => face.corners).filter((corner) => near(corner[2], 18, 1e-6)).length, 10 * 4);
    assert.equal(round.filter((face) => face.colour === '#4a3826').length, 16);
    // It stands out past the corner of the walls, as a corner tower does.
    const corner = F.corners[F.towers.indexOf(middle)];
    assert.ok(Math.hypot(middle[0], middle[1]) > Math.hypot(corner[0], corner[1]) + 2);
  }
  // Each throws its own shadow, where it stands.
  assert.equal(fort.shades.length, 4);
  fort.shades.forEach((shade, i) => {
    const [east, north] = placed(F.towers[i]);
    assert.ok(near(shade.at[0], east, 1e-9) && near(shade.at[1], north, 1e-9) && shade.height === 17 && shade.radius < F.tower[0]);
  });

  // The gate: palm wood, 2.65 m wide and 3.6 m high, in the west wall; over it the box that stands out of the wall.
  const gate = wood.filter((face) => face.corners.every((corner) => corner[2] <= F.gate[2] + 1e-6) && face.corners.some((corner) => near(corner[2], 0, 1e-6)));
  assert.equal(gate.length, 2);
  const spots = gate.flatMap((face) => face.corners);
  assert.ok(near(Math.max(...spots.map((spot) => spot[2])), 3.6, 1e-6));
  const across = Math.max(...spots.flatMap((a) => spots.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));
  assert.ok(near(across, 2.65, 0.1), String(across));
  assert.ok(spots.every((spot) => own(spot)[0] < -27), 'in the west wall');
  assert.ok(gate.every((face) => own(face.normal)[0] < -0.9), 'and looking west');

  // Within: one roof, 8.2 m up, with six courts cut out of it; each court lies well inside the walls and clear of the others.
  const roof = faces.filter((face) => face.colour === '#d8c09a' && face.normal[2] > 0.99 && face.corners.every((corner) => near(corner[2], F.roof, 1e-6)));
  const acres = roof.reduce((sum, { corners: [a, b, c] }) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, 0);
  const walled = squareMeters(inset(F.corners, 0.5));
  assert.ok(near(acres, walled - F.courts.reduce((sum, [, , long, wide]) => sum + long * wide, 0), 0.5), `${acres} of ${walled}`);
  const inside = (ring, [u, v]) => ring.every(([a, b], i) => (ring[(i + 1) % ring.length][0] - a) * (v - b) - (ring[(i + 1) % ring.length][1] - b) * (u - a) > 0);
  const rooms = inset(F.corners, 2.5);
  F.courts.forEach(([u, v, long, wide], i) => {
    for (const corner of [[u - long / 2, v - wide / 2], [u + long / 2, v - wide / 2], [u + long / 2, v + wide / 2], [u - long / 2, v + wide / 2]]) assert.ok(inside(rooms, corner), `court ${i}`);
    for (const [u2, v2, long2, wide2] of [...F.courts.slice(i + 1), [F.keep[0], F.keep[1], F.keep[2] * 2, F.keep[2] * 2]]) {
      assert.ok(Math.abs(u - u2) > (long + long2) / 2 + 0.5 || Math.abs(v - v2) > (wide + wide2) / 2 + 0.5, `court ${i} is clear of the next`);
    }
  });
  // The square tower stands on that roof and rises to 14.6 m: it takes no shadow from the block the map has for the fort.
  const [keepEast, keepNorth] = placed([F.keep[0], F.keep[1]]);
  const keep = faces.filter((face) => face.corners.every((corner) => Math.hypot(corner[0] - keepEast, corner[1] - keepNorth) < F.keep[2] * 1.5 && corner[2] >= F.roof - 1e-6) && face.colour === '#c8a878');
  assert.ok(keep.length > 40 && keep.every((face) => face.open));
  assert.ok(near(Math.max(...heights(keep)), F.keep[4], 1e-6));
  // By night the clay is floodlit, golden, on every wall that faces the town.
  assert.ok(outer.every((face) => face.light === '#ffe08a'));
});

test('Al Majdoul Tower: a square that turns a quarter turn clockwise as it rises, a white fin at every floor, a slanting screen round its helipad', () => {
  const T = MAJDOUL;
  const storey = T.deck / T.floors;
  assert.ok(near(storey, 3.963, 1e-3));
  // Its square at the ground; turned an eighth half-way up, a quarter at its roof: clockwise, seen from above (its north-eastern corner goes round by the east to the south-east).
  assert.deepEqual(majdoulSquare(0), [[18.8, 18.8], [-18.8, 18.8], [-18.8, -18.8], [18.8, -18.8]]);
  const half = majdoulSquare(T.deck / 2);
  assert.ok(near(half[0][0], 18.8 * Math.SQRT2, 1e-9) && near(half[0][1], 0, 1e-9));
  const roof = majdoulSquare(T.deck);
  assert.ok(near(roof[0][0], 18.8, 1e-9) && near(roof[0][1], -18.8, 1e-9));
  assert.deepEqual(majdoulSquare(999), roof, 'it turns no further above its roof');
  // (It does not narrow: every corner is 26.6 m from the middle at any height.)
  for (const z of [0, 50, 133, 214]) assert.ok(majdoulSquare(z).every((corner) => near(Math.hypot(...corner), 18.8 * Math.SQRT2, 1e-9)));

  const mesh = new ModelMesh();
  const made = majdoulTower(new Model(mesh));
  const faces = facesOf(mesh);
  // Four twisted walls of glass, a floor at a time: fifty-four floors, the lowest two a lobby with its lamps on.
  const glass = faces.filter((face) => face.kind === 'glass' && face.colour === '#5d7d94');
  const lobby = faces.filter((face) => face.kind === 'glass' && face.colour === '#7c98a8');
  assert.deepEqual([glass.length, lobby.length], [52 * 8, 2 * 8]);
  assert.ok(lobby.every((face) => face.lit === 1 && Math.max(...face.corners.map((corner) => corner[2])) <= 2 * storey + 1e-3));
  // (A twisted wall leans out at one end and in at the other: by as much as eight degrees, its corners going round 0.77 m with every floor.)
  assert.ok(glass.every((face) => near(face.storey, storey, 1e-3) && Math.abs(face.normal[2]) < 0.15), 'upright, but for their twist');
  assert.ok(glass.some((face) => face.normal[2] > 0.1) && glass.some((face) => face.normal[2] < -0.1));
  // A fin at the top of every floor: white, 0.8 m out of the glass, with an upper side, an underside and an edge.
  const white = faces.filter((face) => face.colour === '#f1f2f1');
  for (const floor of [1, 27, 54]) {
    const fin = white.filter((face) => face.corners.every((corner) => Math.abs(corner[2] - floor * storey) <= 0.121));
    assert.equal(fin.length, 24, `floor ${floor}`);
    assert.ok(near(Math.max(...fin.flatMap((face) => face.corners.map((corner) => Math.hypot(corner[0], corner[1])))), (18.8 + T.fin) * Math.SQRT2, 1e-3));
    assert.equal(fin.filter((face) => face.normal[2] > 0.99).length, 8);
    assert.equal(fin.filter((face) => face.normal[2] < -0.99).length, 8);
    // (It has turned with the tower: its corners are the tower's at that height, further out.)
    const corners = majdoulSquare(floor * storey, 18.8 + T.fin);
    assert.ok(corners.every(([east, north]) => fin.some((face) => face.corners.some((corner) => near(corner[0], east, 1e-3) && near(corner[1], north, 1e-3)))));
  }
  // The screen round the roof: its top one slanting plane, 244 m at the north-western corner and 217.5 m across the roof from it.
  const screen = faces.filter((face) => face.colour === '#7d9bb0');
  assert.equal(screen.length, 8);
  const rim = screen.flatMap((face) => face.corners).filter((corner) => corner[2] > T.deck + 1);
  for (const [east, north, up] of rim) assert.ok(near(up, T.low + (T.top - T.low) * ((north - east) / 37.6 + 1) / 2, 1e-3));
  assert.ok(rim.some((corner) => near(corner[0], -18.8, 1e-3) && near(corner[1], 18.8, 1e-3) && near(corner[2], 244, 1e-3)));
  assert.ok(rim.some((corner) => near(corner[0], 18.8, 1e-3) && near(corner[1], -18.8, 1e-3) && near(corner[2], 217.5, 1e-3)));
  assert.ok(screen.every((face) => face.glow > 0.4), 'lit by night');
  // Inside it, the roof and the helipad: a blue round of 12 m in a white ring.
  const pad = faces.filter((face) => face.colour === '#2f7fd2');
  assert.ok(pad.length === 26 && pad.every((face) => face.open && face.normal[2] > 0.99 && face.corners.every((corner) => near(corner[2], T.deck + 0.4, 1e-3) && Math.hypot(corner[0], corner[1]) <= T.helipad + 1e-3)));
  // A rod on the high corner, and the red lamp on it.
  assert.ok(near(Math.max(...heights(faces)), 247, 1e-3));
  assert.deepEqual(made.beacons.map((lamp) => lamp.map((part) => Math.round(part * 10) / 10)), [[-18.2, 18.2, 247.6]]);
  // At its foot the canopy: glass on ribs, from the tower's glass out to 38 m at most, 11 m high at the tower and 8 m at its edge, on six columns; lit from below by night.
  const canopy = faces.filter((face) => face.colour === '#a9bcc6');
  assert.equal(canopy.length, 12 * 2 * 4);
  const spots = canopy.flatMap((face) => face.corners);
  assert.ok(near(Math.max(...spots.map((spot) => Math.hypot(spot[0], spot[1]))), 38, 1e-3) && spots.every((spot) => spot[2] >= 8 - 1e-3 && spot[2] <= 11 + 1e-3));
  // (Outside the tower's glass as it stands at the canopy's own height, where it has turned four degrees.)
  const outside = ([east, north, up]) => {
    const angle = ((T.turn * Math.PI) / 180) * (up / T.deck);
    return Math.max(Math.abs(east * Math.cos(angle) - north * Math.sin(angle)), Math.abs(east * Math.sin(angle) + north * Math.cos(angle))) > 18.8 + 0.5;
  };
  assert.ok(spots.every(outside), 'outside the tower');
  assert.ok(spots.every((spot) => spot[0] < 7 && spot[1] < 4), 'on its western and southern sides');
  assert.ok(canopy.filter((face) => face.normal[2] < 0).every((face) => face.glow > 0.4));
  // The low wing on the other side: one slab of two storeys, clear of the tower.
  const [wing, ...more] = majdoulAnnex();
  assert.equal(more.length, 0);
  assert.deepEqual([wing.base, wing.top, wing.roof, wing.north, wing.outline.length], [0, 9, true, true, 13]);
  assert.ok(squareMeters(wing.outline) > 1500, 'anticlockwise');
  const turn = (20.5 * Math.PI) / 180;
  for (const [east, north] of wing.outline) {
    const own = [east * Math.cos(turn) - north * Math.sin(turn), east * Math.sin(turn) + north * Math.cos(turn)];
    assert.ok(Math.max(Math.abs(own[0]), Math.abs(own[1])) > 18.8 && own[0] > 0 && own[1] > 0, JSON.stringify(own));
  }
});

test('Burj Rafal: a long tower of glass with bowed sides, a hollow between two horns, each with its mast; on a podium of stone', () => {
  const T = RAFAL;
  // Its plan: 58 m long; 30 m wide in the middle and 17 m at its two flat ends.
  assert.deepEqual([rafalHalf(0), rafalHalf(29), rafalHalf(-29)], [15, 8.5, 8.5]);
  assert.ok(rafalHalf(14.5) > 13 && rafalHalf(14.5) < 14);
  // The screen round its roof: 5 m over the roof in the middle of the tower, 22 m at its ends.
  assert.deepEqual([rafalRim(0), rafalRim(29), rafalRim(-29)], [281, 298, 298]);
  assert.ok(rafalRim(14.5) > 281 && rafalRim(14.5) < 289.5, 'a hollow, steeper towards the ends');

  const mesh = new ModelMesh();
  const made = rafalTower(new Model(mesh));
  const faces = facesOf(mesh);
  // The glass: sixty-eight floors between the podium's height and the roof, right round; silvered.
  const glass = faces.filter((face) => face.kind === 'glass' && face.colour === '#7f9db3');
  assert.equal(glass.length, (12 * 2 + 2) * 2);
  assert.ok(glass.every((face) => near(face.storey, 276 / 68, 1e-3) && near(face.mirror, 0.7, 0.01) && face.corners.every((corner) => corner[2] >= T.podium - 1e-3 && corner[2] <= T.deck + 1e-3)));
  // (Its long sides are lit as the curves they are: the light does not fall alike on the two ends of a piece.)
  const bowed = glass.filter((face) => Math.abs(face.normal[0]) > 0.9);
  assert.equal(bowed.length, 48);
  assert.ok(bowed.some((face) => Math.hypot(face.normals[0][1] - face.normals[1][1], face.normals[1][1] - face.normals[2][1]) > 0.01));
  for (const face of bowed) for (const [east, north] of face.corners) assert.ok(near(Math.abs(east), rafalHalf(north), 1e-3));
  // The screen: the same glass on past the roof, up to its own top; lit by night; dark glass on its inner side.
  const screen = faces.filter((face) => face.colour === '#93afc2');
  assert.equal(screen.length, 52);
  for (const face of screen) {
    assert.ok(face.glow > 0.5 && face.lit === 0);
    for (const [, north, up] of face.corners) assert.ok(near(up, T.deck, 1e-3) || near(up, Math.abs(north) > 28.99 ? T.horns : rafalRim(north), 1e-3));
  }
  assert.equal(faces.filter((face) => face.colour === '#34424d' && face.open).length, 52);
  // At its foot, to the podium's height: stone piers with tall openings between them.
  const piers = faces.filter((face) => face.kind === 'pierced' && face.colour === '#ddd0b0');
  assert.ok(piers.length === 52 && piers.every((face) => near(face.storey, T.podium, 1e-4) && face.corners.every((corner) => corner[2] <= T.podium + 1e-3)));
  // A mast on each horn, to 308 m, with its red lamp.
  assert.ok(near(Math.max(...heights(faces)), 308, 1e-3));
  assert.deepEqual(made.beacons, [[0, 28.4, 308.6], [0, -28.4, 308.6]]);

  // The podium: six storeys of pale stone with windows, on the outline the buildings data has, east and north of the tower.
  const podium = faces.filter((face) => face.kind === 'pierced' && face.colour === '#d8c7a2');
  assert.equal(podium.length, T.base.length * 2);
  assert.ok(podium.every((face) => near(face.storey, T.podium / 6, 1e-6) && face.glow > 0.3));
  assert.ok(squareMeters(T.base) > 4900 && squareMeters(T.base) < 5200, 'anticlockwise, and half a hectare');
  const turn = (83 * Math.PI) / 180;
  const onMap = ([east, north]) => [east * Math.cos(turn) + north * Math.sin(turn), north * Math.cos(turn) - east * Math.sin(turn)];
  const spots = podium.flatMap((face) => face.corners).map(onMap);
  assert.ok(near(Math.max(...spots.map((spot) => spot[0])), 88, 0.01) && near(Math.max(...spots.map((spot) => spot[1])), 84.1, 0.01), 'where the data has it');
  // Under its top a row of three-cornered openings, right round: some eighty of them.
  const openings = faces.filter((face) => face.colour === '#4b3d2c');
  assert.ok(openings.length > 70 && openings.length < 100, String(openings.length));
  assert.ok(openings.every((face) => face.corners.every((corner) => corner[2] >= T.podium - 2.91 && corner[2] <= T.podium - 1.49)));
  // On its roof: the tennis court, blue in green, 36 m by 18 m; five slatted shades; the round white tent.
  const court = faces.filter((face) => face.colour === '#3f7d5a');
  const acres = court.reduce((sum, { corners: [a, b, c] }) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, 0);
  assert.ok(near(acres, 36 * 18, 0.01) && court.every((face) => face.normal[2] > 0.99));
  const middle = onMap(court.flatMap((face) => face.corners).reduce((sum, corner) => [sum[0] + corner[0] / 6, sum[1] + corner[1] / 6], [0, 0]));
  assert.ok(near(middle[0], 63, 0.5) && near(middle[1], 45, 0.5), JSON.stringify(middle));
  assert.equal(faces.filter((face) => face.colour === '#3b5fa8').length, 2);
  assert.equal(faces.filter((face) => face.colour === '#6f553f').length, 5 * 2);
  const tent = faces.filter((face) => face.colour === '#f4f2ea');
  assert.ok(tent.length === 16 * 2 * 2 && near(Math.max(...heights(tent)), T.podium + 6.4, 1e-3));
  // Before the door: the round fountain, 33 m south of the tower's middle, with its water lit by night; and the canopy between it and the tower.
  const water = faces.filter((face) => face.colour === '#3f8f86');
  assert.ok(water.length === 22 && water.every((face) => face.glow > 0.4));
  const pool = onMap(water.flatMap((face) => face.corners).reduce((best, corner) => [Math.min(best[0], corner[0]), Math.max(best[1], corner[0]), Math.min(best[2], corner[1]), Math.max(best[3], corner[1])], [9e9, -9e9, 9e9, -9e9]).reduce((pair, value, i, all) => (i === 3 ? [(all[0] + all[1]) / 2, (all[2] + all[3]) / 2] : pair), [0, 0]));
  assert.ok(near(pool[0], 0, 0.1) && near(pool[1], -33, 0.1), JSON.stringify(pool));
});

test('the Riyadh TV Tower: a shaft of concrete on four fins, a lantern of glass and gold cut in facets, and a mast to 170 m', () => {
  const T = TV_TOWER;
  const mesh = new ModelMesh();
  const made = tvTower(new Model(mesh));
  const faces = facesOf(mesh);
  const far = (list) => Math.max(...list.flatMap((face) => face.corners.map((corner) => Math.hypot(corner[0], corner[1]))));
  const at = (list, from, to) => list.flatMap((face) => face.corners).filter((corner) => corner[2] >= from && corner[2] <= to);
  // The shaft: eight-sided (a square with its corners cut off), 11.2 m wide at the ground and 7 m at 116 m; a line up each of its edges.
  const concrete = faces.filter((face) => face.colour === '#d9c9a9');
  const shaft = concrete.filter((face) => Math.abs(face.normal[2]) < 0.05 && face.corners.every((corner) => corner[2] <= T.collar[0] + 3 + 1e-3) && far([face]) < 8.5);
  assert.equal(shaft.length, 4 * 8 * 2);
  const width = (up) => Math.max(...at(shaft, up - 1e-3, up + 1e-3).map((corner) => Math.max(Math.abs(corner[0]), Math.abs(corner[1])))) * 2;
  assert.ok(near(width(0), 11.2, 1e-3) && near(width(55), 2 * (5.6 - 2.1 * (55 / 116)), 1e-3) && width(86) > width(117) && near(width(117), 7, 1e-3));
  assert.ok(shaft.every((face) => near(face.ridge, 0.45, 0.01) && face.glow > 0.3), 'ribbed by day, floodlit by night');
  // Four fins brace its foot: each reaches 13 m from the middle at the ground and leans in to the shaft 24 m up.
  const fins = concrete.filter((face) => far([face]) > 12.9 && face.corners.every((corner) => corner[2] <= 24 + 1e-3));
  assert.equal(fins.length, 4 * 4);
  assert.ok(near(far(fins), Math.hypot(13, 1.3), 1e-3));
  for (const [east, north] of [[13, 0], [0, 13], [-13, 0], [0, -13]]) assert.ok(fins.some((face) => face.corners.some((corner) => near(Math.hypot(corner[0] - east, corner[1] - north), 1.3, 1e-3) && corner[2] === 0)));
  // The lantern. Its belt: eight sides to the four winds and between, 25.6 m from side to side, from 125 m to 131 m; glass lit in every room, banded with gold.
  const glass = faces.filter((face) => face.kind === 'glass');
  assert.ok(glass.every((face) => face.colour === '#3f566c' && face.lit === 1 && face.glow > 0.8));
  const belt = glass.filter((face) => Math.abs(face.normal[2]) < 1e-6);
  assert.ok(belt.length >= 8 * 2 && belt.every((face) => face.corners.every((corner) => corner[2] >= 125 - 1e-3 && corner[2] <= 131 + 1e-3)));
  const looks = [...new Set(belt.map((face) => Math.round((Math.atan2(face.normal[1], face.normal[0]) * 180) / Math.PI / 45)))].length;
  assert.equal(looks >= 8, true, 'eight ways');
  assert.ok(belt.some((face) => near(face.normal[0], 1, 1e-6)) && belt.some((face) => near(face.normal[1], 1, 1e-6)), 'a side to the east and one to the north');
  const side = belt.filter((face) => near(face.normal[0], 1, 1e-6)).flatMap((face) => face.corners);
  assert.ok(side.every((corner) => near(corner[0], 12.8, 1e-3)));
  const bands = faces.filter((face) => face.colour === '#bfa770' && Math.abs(face.normal[2]) < 1e-6 && face.corners.every((corner) => corner[2] >= 125 - 1e-3 && corner[2] <= 131 + 1e-3));
  assert.ok(bands.length >= 8 * 3 * 2 && bands.every((face) => face.glow > 0.8), 'three bands of gold on each side');
  // Its underside: sixteen three-cornered facets of gold from the shaft out to the belt, looking down; its upper side: sixteen of glass up to the roof, looking up.
  const under = faces.filter((face) => face.colour === '#bfa770' && face.normal[2] < -0.3);
  const over = glass.filter((face) => face.normal[2] > 0.3);
  assert.deepEqual([under.length, over.length], [16, 16]);
  assert.ok(under.every((face) => face.corners.every((corner) => corner[2] === 114 || corner[2] === 125)) && over.every((face) => face.corners.every((corner) => corner[2] === 131 || corner[2] === 139.5)));
  // (Three-cornered: each has two corners on one ring and one on the other, by turns.)
  assert.equal(over.filter((face) => face.corners.filter((corner) => corner[2] === 131).length === 2).length, 8);
  assert.equal(over.filter((face) => face.corners.filter((corner) => corner[2] === 131).length === 1).length, 8);
  // The roof: 12 m from side to side, behind a low rim; it takes no shadow.
  const roof = faces.filter((face) => face.colour === '#b9ad94');
  assert.ok(roof.length === 6 && roof.every((face) => face.open && face.normal[2] > 0.99 && face.corners.every((corner) => corner[2] === 139.5)));
  assert.ok(near(far(roof) * Math.cos(Math.PI / 8), 6, 1e-3));
  // Over it the shaft again, 5.2 m wide, to 150 m; and the mast, thinner from 160 m, to 170 m, with the red lamp on its tip.
  const drum = concrete.filter((face) => face.corners.every((corner) => corner[2] >= 139.5 - 1e-3));
  assert.ok(drum.length === 16 && near(Math.max(...drum.flatMap((face) => face.corners.map((corner) => Math.abs(corner[0])))), 2.6, 1e-3) && near(Math.max(...heights(drum)), 150, 1e-3));
  const mast = faces.filter((face) => face.colour === '#d5d7d8');
  assert.ok(near(Math.max(...heights(mast)), 170, 1e-3) && near(Math.min(...heights(mast)), 150, 1e-3));
  // (Half as thick over 160 m as under it.)
  assert.ok(near(far(mast.filter((face) => face.corners.some((corner) => corner[2] > 165))), 0.35 * Math.SQRT2, 1e-3) && near(far(mast.filter((face) => face.corners.some((corner) => corner[2] < 155))), 0.7 * Math.SQRT2, 1e-3));
  assert.deepEqual(made.beacons, [[0, 0, 170.6]]);
  assert.ok(near(Math.max(...heights(faces)), 170, 1e-3) && Math.min(...heights(faces)) === 0);
});
