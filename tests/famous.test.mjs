import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FAMOUS, KAFD_STATION, KAPSARC, LIBRARY, MAJDOUL, MASMAK, MINISTRY, MURABBA, NATIONAL_MUSEUM, RAFAL, TURKI_MOSQUE, TV_TOWER, WATER_TOWER, inset, kafdStation, kapsarcEaves, kapsarcRise, kapsarcShades, majdoulAnnex, majdoulSquare, majdoulTower, murabbaShades, museumHalls, museumShades, museumWall, rafalHalf, rafalRim, rafalTower, stationOutline, stationRing, stationShades, stepped, turkiShades, tvTower, waterTower } from '../js/famous.js';
import { KAPSARC_CELLS, KAPSARC_FOCUS } from '../js/kapsarc-data.js';
import { LANDMARKS, ghostsOfLandmarks, landmarkBeacons, landmarkModels, landmarkShades, replacedByLandmarks } from '../js/landmarks.js';
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
  assert.deepEqual(FAMOUS.map((one) => one.id), ['interior-ministry', 'king-fahd-library', 'masmak-fort', 'imam-turki-mosque', 'murabba-palace', 'national-museum', 'kapsarc']);
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

test('Al Majdoul Tower: a square that turns 2.5 degrees a floor, clockwise as it rises; white fins lit at their foot, stopping at dark spines; a flat roof with a drum and a helipad', () => {
  const T = MAJDOUL;
  const storey = T.deck / T.floors;
  assert.ok(near(storey, 3.963, 1e-3));
  // Its roof's square is the satellite photo's, its sides running east and north in the model's own frame;
  // lower down it stands turned anticlockwise, 2.5 degrees a floor: 135 at the ground. (So, going up, it
  // turns clockwise, seen from above.)
  assert.deepEqual(majdoulSquare(T.deck), [[18.8, 18.8], [-18.8, 18.8], [-18.8, -18.8], [18.8, -18.8]]);
  assert.deepEqual(majdoulSquare(999), majdoulSquare(T.deck), 'it turns no further above its roof');
  const angleOf = (z) => (Math.atan2(majdoulSquare(z)[0][1], majdoulSquare(z)[0][0]) * 180) / Math.PI;
  assert.ok(near(angleOf(T.deck), 45, 1e-9) && near(angleOf(T.deck / 2), 45 + 67.5, 1e-9) && near(angleOf(0), 180, 1e-9));
  for (const floor of [0, 20, 53]) assert.ok(near(angleOf(floor * storey) - angleOf((floor + 1) * storey), 2.5, 1e-9), `floor ${floor}`);
  // (It does not narrow: every corner is 26.6 m from the middle at any height.)
  for (const z of [0, 50, 133, 214]) assert.ok(majdoulSquare(z).every((corner) => near(Math.hypot(...corner), 18.8 * Math.SQRT2, 1e-9)));

  const mesh = new ModelMesh();
  const made = majdoulTower(new Model(mesh));
  const faces = facesOf(mesh);
  // Four twisted walls of glass, a floor at a time: fifty-four floors. The lowest two are a lobby with its
  // lamps on; three bands of two floors are plant behind louvres (over the lobby, half way up, at the top);
  // two floors high up have warm lamps, all on; the rest is blue glass, a quarter of its floors lit by night.
  const glass = faces.filter((face) => face.kind === 'glass' && face.colour === '#5288c0');
  const lobby = faces.filter((face) => face.kind === 'glass' && face.colour === '#7c98a8');
  const plant = faces.filter((face) => face.kind === 'glass' && face.colour === '#5a554c');
  assert.deepEqual([glass.length, lobby.length, plant.length], [46 * 8, 2 * 8, 6 * 8]);
  assert.ok(lobby.every((face) => face.lit === 1 && Math.max(...face.corners.map((corner) => corner[2])) <= 2 * storey + 1e-3));
  assert.ok(plant.every((face) => face.louvres && face.lit < 0.05));
  const floorOf = (face) => Math.round(Math.min(...face.corners.map((corner) => corner[2])) / storey);
  assert.deepEqual([...new Set(plant.map(floorOf))].sort((x, y) => x - y), [2, 3, 25, 26, 52, 53]);
  const warm = glass.filter((face) => face.light === '#ffc277');
  assert.ok(warm.length === 16 && warm.every((face) => face.lit === 1 && [39, 40].includes(floorOf(face))));
  assert.ok(glass.filter((face) => face.light !== '#ffc277').every((face) => near(face.lit, 0.25, 0.01) && face.light === '#7fb2e6'), 'washed in cool blue by night');
  // (The light falls on a twisted wall as on the sheet it is part of: upright, looking the way the wall looks
  // at its foot and at its top, which differ by the 2.5 degrees of a floor.)
  assert.ok(glass.every((face) => near(face.storey, storey, 1e-3) && face.normals.every((normal) => Math.abs(normal[2]) < 1e-6)));
  const lean = (face) => (Math.acos(Math.min(1, face.normals[0][0] * face.normals[2][0] + face.normals[0][1] * face.normals[2][1])) * 180) / Math.PI;
  assert.ok(glass.some((face) => near(lean(face), 2.5, 0.01)));

  // At the top of every floor, along each wall from spine to spine, a fin 1.3 m out of the glass: white on
  // top, warm grey underneath, its face 1.15 m deep, the foot of it a line of cool light by night and the rest
  // of it washed by that light.
  const fins = faces.filter((face) => ['#f1f2f1', '#d9d2c4', '#f4f6f6'].includes(face.colour) && face.corners.every((corner) => corner[2] < T.deck + 1));
  const lamps = fins.filter((face) => face.colour === '#f4f6f6' && face.glow === 1);
  assert.ok(lamps.length === T.floors * 8 && lamps.every((face) => face.light === '#a8cff5'));
  for (const floor of [1, 27, 54]) {
    const high = floor * storey;
    const fin = fins.filter((face) => face.corners.every((corner) => corner[2] <= high + 0.25 + 1e-3 && corner[2] >= high + 0.25 - T.edge - 1e-3));
    assert.equal(fin.length, 32, `floor ${floor}`);
    assert.equal(fin.filter((face) => face.normal[2] > 0.99).length, 8);
    assert.equal(fin.filter((face) => face.normal[2] < -0.99).length, 8);
    // (Its corners are the tower's at that height, along the walls and further out: they stop short of the
    // corners, at the spines.)
    const square = majdoulSquare(high);
    const way = [(square[1][0] - square[0][0]) / 37.6, (square[1][1] - square[0][1]) / 37.6];
    const start = [square[0][0] + way[0] * T.spine[0] + way[1] * T.fin, square[0][1] + way[1] * T.spine[0] - way[0] * T.fin];
    assert.ok(fin.some((face) => face.corners.some((corner) => near(corner[0], start[0], 1e-3) && near(corner[1], start[1], 1e-3))), `floor ${floor}`);
    assert.ok(fin.every((face) => face.corners.every((corner) => Math.hypot(corner[0], corner[1]) < (18.8 + T.fin) * Math.SQRT2 - 0.1)));
  }
  // Up each corner a spine of silver, which stands out past the fins and turns with the tower from the ground
  // to the top of the railing: its two sides and its front, a floor at a time; no lamp on it, so by night it
  // is dark.
  const spines = faces.filter((face) => face.colour === '#c4c7c7');
  assert.equal(spines.length, 4 * (T.floors + 1) * 3 * 2 + 4 * 2);
  assert.ok(spines.every((face) => face.glow === 0));
  const reachOf = (z) => Math.max(...spines.filter((face) => face.corners.every((corner) => Math.abs(corner[2] - z) < storey + 1e-3)).flatMap((face) => face.corners.map((corner) => Math.hypot(corner[0], corner[1]))));
  assert.ok(near(reachOf(100), Math.hypot(18.8 - T.spine[0], 18.8 + T.spine[1]), 1e-3) && reachOf(100) > Math.hypot(18.8 - T.spine[0], 18.8 + T.fin));
  assert.ok(near(Math.max(...heights(spines)), T.deck + 0.25 + T.rail, 1e-3) && near(Math.min(...heights(spines)), 0, 1e-9));
  // By night, rows of the lamps in the ceilings show through the glass, under the fins of most office floors.
  const ceiling = faces.filter((face) => face.kind === 'lamp');
  assert.ok(ceiling.length > 1000 && ceiling.every((face) => face.light === '#f2f7ff' && face.glow === 1));
  // The roof is flat, with a railing round it on the last fin. On it a drum of glass, lit by night, and on the
  // drum the helipad, 222 m up: blue, in a white ring, overhanging the drum, its rim a ring of light by night.
  const roof = faces.filter((face) => face.colour === '#cfd0cc');
  assert.ok(roof.length === 2 && roof.every((face) => face.open && face.corners.every((corner) => near(corner[2], T.deck + 0.25, 1e-9))));
  const rail = faces.filter((face) => face.colour === '#8f9599');
  assert.ok(rail.length > 200 && near(Math.max(...heights(rail)), T.deck + 0.25 + T.rail + 0.04, 0.01));
  const drum = faces.filter((face) => face.colour === '#6f8f8c');
  assert.ok(drum.length === 48 && drum.every((face) => face.kind === 'glass' && face.corners.every((corner) => near(Math.hypot(corner[0], corner[1]), T.drum[0], 1e-6))));
  const pad = faces.filter((face) => face.colour === '#2f7fd2');
  assert.ok(pad.length === 26 && pad.every((face) => face.open && face.normal[2] > 0.99 && face.corners.every((corner) => near(corner[2], 222.15, 1e-3))));
  const halo = faces.filter((face) => face.colour === '#eef6fa');
  assert.ok(halo.length === 56 && halo.every((face) => face.glow === 1 && face.corners.every((corner) => Math.hypot(corner[0], corner[1]) > T.drum[0] + 2.9)));
  // On two corners of the roof, the masts of the cradle that cleans the glass, each with its arm and the red
  // lamp on it; nothing stands higher than the helipad.
  assert.deepEqual(made.beacons.map((lamp) => lamp.map((part) => Math.round(part * 100) / 100)), [[16.82, 16.82, 220.25], [-16.82, -16.82, 220.25]]);
  assert.ok(near(Math.max(...heights(faces)), 222.15, 1e-3));
  assert.ok(!faces.some((face) => face.colour === '#7d9bb0'), 'no screen round the roof');
  // At its foot the canopy: glass on ribs, from the tower's glass out to 38 m at most, 11 m high at the tower and 8 m at its edge, on six columns; lit from below by night.
  const canopy = faces.filter((face) => face.colour === '#a9bcc6');
  assert.equal(canopy.length, 12 * 2 * 4);
  const spots = canopy.flatMap((face) => face.corners);
  assert.ok(near(Math.max(...spots.map((spot) => Math.hypot(spot[0], spot[1]))), 38, 1e-3) && spots.every((spot) => spot[2] >= 8 - 1e-3 && spot[2] <= 11 + 1e-3));
  // (Outside the tower's glass as it stands at the canopy's own height.)
  const outside = ([east, north, up]) => {
    // (The tower's square at that height stands turned anticlockwise from its roof's: turn it back.)
    const angle = ((T.turn * Math.PI) / 180) * (1 - up / T.deck);
    return Math.max(Math.abs(east * Math.cos(angle) + north * Math.sin(angle)), Math.abs(-east * Math.sin(angle) + north * Math.cos(angle))) > 18.8 + 0.5;
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

test('the Riyadh Water Tower: a stem that opens into a wide bowl, in thirty-two stripes; a terrace, a round storey and a cone of a roof on top', () => {
  const T = WATER_TOWER;
  const mesh = new ModelMesh();
  const made = waterTower(new Model(mesh));
  const faces = facesOf(mesh);
  const out = (corner) => Math.hypot(corner[0], corner[1]);
  // Its outline: a stem of 10.9 m to 34.9 m; a tight turn; a straight slope out to a rim 52 m across at 52.1 m; the rim's top, a little in, at 53.4 m.
  assert.deepEqual(T.profile[0], [5.45, 0]);
  assert.deepEqual(T.profile.at(-2), [26, 52.1]);
  assert.deepEqual(T.profile.at(-1), [25, 53.4]);
  for (let i = 1; i < T.profile.length; i += 1) assert.ok(T.profile[i][1] > T.profile[i - 1][1] && (T.profile[i][0] >= T.profile[i - 1][0] || i === T.profile.length - 1), 'it only ever opens as it rises, but for its rim');
  // (The slope is straight from 38.5 m to the rim: the point between lies on the line.)
  const [[r0, z0], [r1, z1], [r2, z2]] = [T.profile[5], T.profile[6], T.profile[7]];
  assert.ok(near((r1 - r0) / (z1 - z0), (r2 - r0) / (z2 - z0), 0.01));
  // Thirty-two stripes round it, tan and another by turns, from the ground to the rim: the other is cream on the stem, white at the turn, blue on the bowl.
  const striped = faces.filter((face) => ['#86733f', '#efe2b4', '#f1f3f1', '#c4d9ec', '#4d86c4'].includes(face.colour) && face.corners.every((corner) => corner[2] <= 53.4 + 1e-3) && Math.abs(face.normal[2]) < 0.95);
  const stripeOf = (face) => {
    const middle = [0, 1].map((k) => (face.corners[0][k] + face.corners[1][k] + face.corners[2][k]) / 3);
    return Math.floor((((Math.atan2(middle[1], middle[0]) / (Math.PI * 2)) % 1) + 1) % 1 * 32 + 1e-6);
  };
  const colourAt = (stripe, from, to) => [...new Set(striped.filter((face) => stripeOf(face) === stripe && face.corners.every((corner) => corner[2] >= from - 1e-3 && corner[2] <= to + 1e-3)).map((face) => face.colour))];
  for (let stripe = 0; stripe < 32; stripe += 1) {
    if (stripe % 2 === 0) {
      assert.deepEqual(colourAt(stripe, 0, 53.4), ['#86733f'], `stripe ${stripe}: tan all the way`);
    } else {
      assert.deepEqual(colourAt(stripe, 0, 31), ['#efe2b4'], `stripe ${stripe}: cream on the stem`);
      assert.deepEqual(colourAt(stripe, 31, 38.5), ['#f1f3f1'], 'white at the turn');
      assert.deepEqual(colourAt(stripe, 40.5, 53.4), ['#4d86c4'], 'blue on the bowl');
    }
  }
  assert.ok(striped.every((face) => face.kind === 'plain' && face.glow > 0.4), 'floodlit by night');
  // (The bowl's underside looks down and out; the stem's wall stands upright.)
  assert.ok(striped.filter((face) => face.corners.every((corner) => corner[2] >= 40.5 - 1e-3 && corner[2] <= 52.1 + 1e-3)).every((face) => face.normal[2] < -0.5));
  assert.ok(striped.filter((face) => face.corners.every((corner) => corner[2] <= 31 + 1e-3)).every((face) => near(face.normal[2], 0, 1e-6) && face.corners.every((corner) => near(out(corner), 5.45, 1e-3))));
  // On top: the terrace, from the rim in to the round storey; a railing of thirty-two posts and a rail.
  const terrace = faces.filter((face) => face.colour === '#d5dadb');
  assert.ok(terrace.length > 30 && terrace.every((face) => face.normal[2] > 0.99 && face.corners.every((corner) => near(corner[2], 53.4, 1e-3) && out(corner) <= 25 + 1e-3 && out(corner) >= 15.5 * Math.cos(Math.PI / 32) - 1e-3)));
  const rail = faces.filter((face) => face.colour === '#f4f5f3' && face.corners.every((corner) => corner[2] <= 54.61));
  assert.equal(rail.length, 32 * 8 + 32 * 2);
  assert.ok(rail.every((face) => face.corners.every((corner) => Math.abs(out(corner) - 24.7) < 0.1 && corner[2] >= 53.4 - 1e-3)));
  // The round storey: glass with its lamps on, a cream post at every fourth piece; from the terrace to the eaves, 3 m.
  const storey = faces.filter((face) => face.corners.every((corner) => near(out(corner), 15.5, 1e-3) && corner[2] >= 53.4 - 1e-3 && corner[2] <= 56.4 + 1e-3));
  assert.equal(storey.length, 64 * 2);
  assert.equal(storey.filter((face) => face.kind === 'glass' && face.lit === 1).length, 48 * 2);
  assert.equal(storey.filter((face) => face.colour === '#efe2b4').length, 16 * 2);
  // Its roof: a low cone that stands out 2 m past the storey, to a point at 61 m; and the mast, to 67.5 m, with the red lamp.
  const roof = faces.filter((face) => face.colour === '#a9a48e');
  assert.ok(roof.length >= 32 && near(Math.max(...roof.flatMap((face) => face.corners.map(out))), 17.5, 1e-3));
  const cone = roof.filter((face) => face.normal[2] > 0.5);
  assert.ok(cone.length === 32 && cone.every((face) => face.corners.some((corner) => near(corner[2], 61, 1e-3) && out(corner) < 1e-6)));
  assert.ok(near(Math.max(...heights(faces)), 67.5, 1e-3) && Math.min(...heights(faces)) === 0);
  assert.deepEqual(made.beacons, [[0, 0, 68.1]]);
  assert.ok(near(Math.max(...faces.flatMap((face) => face.corners.map(out))), 26, 1e-3), 'nothing reaches past its rim');
});

test('the Grand Mosque of Riyadh: a low hall under eighty-four roof towers, a covered court, gatehouses on the square, and a minaret of 50 m', () => {
  const G = TURKI_MOSQUE;
  const { faces, made } = built('imam-turki-mosque');
  const mosque = famous('imam-turki-mosque');
  const flatArea = (some) => some.reduce((sum, { corners: [a, b, c] }) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, 0);
  const inRect = ([west, east, south, north], [x, y], by = 1e-3) => x >= west - by && x <= east + by && y >= south - by && y <= north + by;
  // The hall: 104.3 m along its qibla wall and 65.5 m deep; 11 m to the top of its walls, its roof a little under that.
  const [hallWest, hallEast, hallSouth, hallNorth] = G.hall;
  assert.ok(near(hallNorth - hallSouth, 104.3, 1e-9) && near(hallEast - hallWest, 65.5, 1e-9) && G.wall === 11 && G.roof < G.wall);
  // On its roof, eighty-four little towers: seven across by twelve along, one every 8.5 m, all well inside its walls; each lit from within by night.
  const L = G.lanterns;
  assert.deepEqual(L.count, [7, 12]);
  const lanterns = faces.filter((face) => face.colour === '#dcc9a6' && face.kind === 'pierced');
  assert.equal(lanterns.length, 84 * 4 * 2);
  assert.ok(lanterns.every((face) => face.open && face.lit > 0.8 && face.corners.every((corner) => inRect([hallWest + 2, hallEast - 0.3, hallSouth + 2, hallNorth - 2], corner) && corner[2] >= G.roof - 1e-3 && corner[2] <= L.top + 1e-3)));
  const middles = new Set(lanterns.map((face) => face.corners.reduce((sum, corner) => sum + corner[0], 0) / 3).map((east) => Math.round((east - L.first[0]) / L.step[0])));
  assert.deepEqual([...middles].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
  // The qibla wall: thirteen square piers, one between every two rows of towers and one at either end, a little higher than the wall.
  const piers = faces.filter((face) => face.corners.every((corner) => corner[0] <= hallWest + 0.3 + 1e-3) && face.corners.some((corner) => near(corner[2], G.piers.top, 1e-3)) && face.normal[2] > 0.99);
  assert.equal(piers.length, 13 * 2);
  assert.ok(near(Math.min(...faces.flatMap((face) => face.corners.map((corner) => corner[0]))), hallWest - G.piers.proud, 1e-3), 'nothing stands further west than the piers');
  // The court: three bays by nine, of 8.2 m; a walk behind round columns on every side: twenty-four of them.
  const [courtWest, courtEast, courtSouth, courtNorth] = G.court;
  assert.ok(near((courtEast - courtWest) / G.bay, 3, 1e-9) && near((courtNorth - courtSouth) / G.bay, 9, 1e-9));
  const pillars = faces.filter((face) => face.colour === '#eadbc0');
  // (A column: eight sides to its shaft, a square foot, a head that steps out: thirty-four triangles.)
  assert.equal(pillars.length % 34, 0);
  const columnsIn = (box) => pillars.filter((face) => face.corners.every((corner) => inRect(box, corner))).length / 34;
  assert.equal(columnsIn([courtWest - 1, courtEast + 1, courtSouth - 1, courtNorth + 1]), 24);
  // Over the court, a roof of white beams along and across, 11 m up; cloth in seven of its nine rows of squares, and the two southern rows open to the sky.
  const cloth = faces.filter((face) => face.colour === '#a4a8a4');
  assert.ok(near(flatArea(cloth), (courtEast - courtWest) * 7 * G.bay, 1e-2) && cloth.every((face) => face.normal[2] > 0.99 && face.corners.every((corner) => corner[1] >= courtNorth - 7 * G.bay - 1e-3)));
  assert.equal(G.cover.rows - G.cover.open, 7);
  const beams = faces.filter((face) => face.colour === '#f3f3ee' && face.corners.every((corner) => inRect([courtWest - 0.3, courtEast + 0.3, courtSouth - 0.3, courtNorth + 0.3], corner)));
  assert.equal(beams.length, (4 + 10) * 8);
  assert.ok(beams.every((face) => face.corners.every((corner) => Math.abs(corner[2] - G.cover.top) <= 0.25 + 1e-3)));
  // Over its two open rows there is nothing but the beams: no cloth, no roof.
  const openRows = [courtWest + 0.6, courtEast - 0.6, courtSouth + 0.6, courtNorth - 7 * G.bay - 0.6];
  const over = faces.filter((face) => face.normal[2] > 0.99 && face.colour !== '#f3f3ee' && face.corners.every((corner) => corner[2] > 5) && inRect(openRows, face.corners.reduce((sum, corner) => [sum[0] + corner[0] / 3, sum[1] + corner[1] / 3], [0, 0])));
  assert.equal(over.length, 0);
  // Towards the square: six blocks in a row, the third of them the great gate: it stands further out and higher, and its doorway ends in a point 10 m up.
  assert.equal(G.blocks.length, 6);
  G.blocks.forEach(([south, north], index) => {
    if (index > 0) assert.ok(G.blocks[index - 1][0] - north > 6, 'a forecourt between every two of them');
    assert.ok(north > south);
  });
  const [gateSouth, gateNorth, gateTop] = G.blocks[G.gate.block];
  assert.ok(gateTop > G.blocks[0][2] && G.gate.out > G.front[1] && near((gateSouth + gateNorth) / 2, (hallSouth + hallNorth) / 2, 2.5), 'the great gate lies on the line through the middle of the hall');
  const doorway = faces.filter((face) => face.colour === '#3a2d22' && face.corners.every((corner) => near(corner[0], G.gate.out + 0.06, 1e-3)));
  assert.equal(doorway.length, 3);
  assert.ok(near(Math.max(...heights(doorway)), G.gate.door[2], 1e-3) && Math.min(...heights(doorway)) === 0 && G.gate.door[2] === 10);
  assert.ok(near(Math.max(...doorway.flatMap((face) => face.corners.map((corner) => corner[1]))) - Math.min(...doorway.flatMap((face) => face.corners.map((corner) => corner[1]))), G.gate.door[0], 1e-3));
  // (Two columns at the mouth of each of the five forecourts.)
  assert.equal(columnsIn([G.front[0], G.front[1], G.blocks[5][1], G.blocks[0][0]]), 10);
  // The minaret: at the north-east corner; 8.4 m square at its foot, 7.4 m under its crown; the floor of the crown at 46.6 m; four horns, to 50 m.
  const M = G.minaret;
  assert.ok(M.at[0] > courtEast && M.at[1] > courtNorth && M.at[0] + M.foot < G.front[0] && M.at[1] + M.foot < hallNorth);
  const tan = faces.filter((face) => face.colour === '#c79f70');
  assert.ok(tan.every((face) => face.corners.every((corner) => Math.max(Math.abs(corner[0] - M.at[0]), Math.abs(corner[1] - M.at[1])) <= M.foot + 0.13 && face.glow > 0.75)));
  assert.ok(near(Math.max(...heights(tan)), 50, 1e-3) && Math.min(...heights(tan)) === 0);
  const tips = new Set(tan.flatMap((face) => face.corners.filter((corner) => near(corner[2], M.horns, 1e-3)).map((corner) => `${Math.round((corner[0] - M.at[0]) * 10)},${Math.round((corner[1] - M.at[1]) * 10)}`)));
  assert.deepEqual([...tips].sort(), ['-34,-34', '-34,34', '34,-34', '34,34']);
  const widthAt = (height) => Math.max(...tan.filter((face) => face.corners.some((corner) => near(corner[2], height, 1e-3))).flatMap((face) => face.corners.filter((corner) => near(corner[2], height, 1e-3)).map((corner) => Math.abs(corner[0] - M.at[0])))) * 2;
  assert.ok(near(widthAt(0), 8.4, 1e-3) && near(widthAt(M.crown), 7.4, 1e-3));
  // (Five slits and two small openings in each of its four faces.)
  const marks = faces.filter((face) => face.colour === '#3a2d22' && face.corners.every((corner) => Math.max(Math.abs(corner[0] - M.at[0]), Math.abs(corner[1] - M.at[1])) <= M.foot + 0.1 && corner[2] > 14));
  assert.equal(marks.length, 4 * (5 * 2 + 2));
  // The colonnade along the palace's square: twenty-one columns; and the long one that crosses the great square: twenty-one pairs of taller ones, 9 m.
  assert.equal(columnsIn([G.portico[0], G.portico[1], G.portico[2], G.portico[3]]), 21);
  const A = G.arcade;
  assert.equal(columnsIn([A.rows[0] - 1.3, A.rows[1] + 1.3, A.from + A.step * A.bays - 1.3, A.from + 1.3]), 42);
  assert.equal(pillars.length / 34, 24 + 10 + 21 + 42);
  assert.ok(near(Math.abs(A.step * A.bays), 109, 1e-9));
  // The two bridges to the palace: a storey from 5.2 m to 10.2 m, on piers; nothing of it lower but those piers.
  for (const [west, east, far] of G.bridges) {
    const box = [west, east, far, G.portico[2]];
    const storey = faces.filter((face) => face.kind === 'pierced' && face.corners.every((corner) => inRect(box, corner) && corner[2] >= G.deck[0] - 1e-3));
    assert.equal(storey.length, 4 * 2);
    const under = faces.filter((face) => face.corners.every((corner) => inRect([west, east, far + 1.3, G.portico[2] - 1.3], corner) && corner[2] < G.deck[0] - 1e-3) && face.corners.some((corner) => corner[2] > 0.2));
    assert.equal(under.length, 0, 'one may walk through under it, between the piers at its ends');
  }
  // The square is paved, with a star laid in it; and everything is of stone, lit golden by night.
  const paving = faces.filter((face) => face.colour === '#dedbd3' && face.corners.every((corner) => near(corner[2], 0.04, 1e-6)));
  assert.ok(near(flatArea(paving), squareMeters(G.square), 1e-2));
  assert.ok(faces.filter((face) => face.colour === '#e3d0af' && face.glow > 0.5).length > 300);
  assert.deepEqual(made, {});
  assert.equal(mosque.height, 50);

  // Its shadows: eighteen outlines, each part's own. The covered part of the court lies under one, its open rows under none; the minaret's is 50 m; a bridge's begins at its underside.
  const shades = turkiShades();
  assert.equal(shades.length, 18);
  const within = (ring, [x, y]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      if ((ring[i][1] > y) !== (ring[j][1] > y) && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
    }
    return inside;
  };
  const over2 = (spot) => shades.filter((shade) => within(shade.ring, spot));
  assert.deepEqual(over2([24, 10]).map((shade) => shade.height), [G.parapet]);
  assert.deepEqual(over2([24, courtSouth + 5]), []);
  assert.deepEqual(over2([0, 0]).map((shade) => shade.height), [G.wall]);
  assert.deepEqual(over2(M.at).map((shade) => shade.height).sort((a, b) => a - b), [G.parapet, 50]);
  assert.deepEqual(over2([-48, -80]).map((shade) => [shade.base, shade.height]), [[5.2, 10.2]]);
  assert.ok(shades.every((shade) => shade.height > (shade.base ?? 0) && Math.abs(squareMeters(shade.ring)) > 40));
  // On the map they are turned with the mosque: the hall's north-western corner lies 111 m from the mosque's middle, to the north-west.
  const squeeze = METERS * Math.cos((mosque.at[1] * Math.PI) / 180);
  const flat = ([lng, lat]) => [(lng - mosque.at[0]) * squeeze, (lat - mosque.at[1]) * METERS];
  const thrown = landmarkShades().filter((shade) => shade.polygons[0][0].every((corner) => Math.hypot(...flat(corner)) < 175));
  assert.equal(thrown.length, 18);
  const hall = thrown.find((shade) => shade.height === G.wall && shade.polygons[0][0].length === 5);
  const corner = flat(hall.polygons[0][0][3]);
  const turn = (mosque.bearing * Math.PI) / 180;
  assert.ok(near(corner[0], hallWest * Math.cos(turn) + hallNorth * Math.sin(turn), 0.01) && near(corner[1], hallNorth * Math.cos(turn) - hallWest * Math.sin(turn), 0.01));
  assert.ok(corner[0] < -70 && corner[1] > 15, 'north-west of the middle: the qibla wall looks west-south-west, towards Makkah');
  assert.ok(Math.abs(((mosque.bearing + 270) % 360) - 244) < 3, 'the wall looks along 244 degrees, give or take: the way to Makkah from Riyadh');

  // The buildings data has the mosque, its houses and the wing as one block; the bridges and the colonnade in the square as blocks on the ground; and a bed of trees as a building. They go altogether; the palace stays.
  const placed = (points) => [...points, points[0]].map(([east, north]) => [mosque.at[0] + (east * Math.cos(turn) + north * Math.sin(turn)) / squeeze, mosque.at[1] + (north * Math.cos(turn) - east * Math.sin(turn)) / METERS]);
  const outlines = [
    { id: 1, ring: placed([[-60.8, 70.7], [-52.2, 90.6], [56, 49.8], [124.1, 27.4], [126, 12.6], [67.6, 12.1], [66.7, 33.7], [59.5, 33.6], [63.2, -60], [-56.5, -61.4], [-62, -60.4], [-62, 52]]) },
    { id: 2, ring: placed([[-40.7, -81.1], [-39.8, -105.1], [-55.6, -105.3], [-56.5, -61.4], [-41.1, -61]]) },
    { id: 3, ring: placed([[44.7, -102.9], [44.8, -59.5], [56.1, -59.7], [56.8, -102.9]]) },
    { id: 4, ring: placed([[86, -3.6], [75.3, -3.2], [75, -17.5], [70.9, -17.2], [70.6, -25], [66.5, -24.8], [67.3, 5], [86.4, 4.7]]) },
    { id: 5, ring: placed([[79, -36.4], [77.4, -18.7], [84.9, -18.1], [86, -27.1], [82.9, -27.3], [84.1, -39.5], [78.3, -40.3], [77.8, -36.4]]) },
    { id: 6, ring: placed([[74.4, -43.2], [77.2, -53.6], [78.1, -44.4], [86.1, -45.3], [87.2, -34.4], [97, -35.5], [98.5, -41.1], [98, -43.2], [95.1, -44.2], [96.7, -51], [96.7, -53.5], [87.9, -55.2], [89, -58.1], [86.8, -58.9], [85.4, -74], [75.7, -76.5], [86.7, -77.6], [77.7, -79.8], [77.7, -82.3], [86.5, -80.5], [84.2, -103.6], [65.3, -101.6], [71.1, -42.7]]) },
    { id: 7, ring: placed([[99, 7], [113.9, 5.1], [112.9, -1.6], [100, 0.4], [99.9, -3.7], [97.7, -3.2]]) },
    { id: 8, ring: placed([[-55.6, -105.3], [63.6, -102.5], [63.1, -125.9], [18.3, -175.3], [-6.1, -221.4], [-95.7, -181.1], [-61.2, -105.6]]) }, // the palace
    { id: 9, ring: placed([[111.8, 72.6], [104.3, 79.4], [117.2, 94.8], [128.5, 85.6], [121.8, 78.1], [118.8, 80.8]]) }, // a house across the street
  ];
  assert.deepEqual([...ghostsOfLandmarks(outlines)].sort(), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(mosque.ghosts.length, 7);
  assert.deepEqual([...replacedByLandmarks(outlines)], []);
});

test('Murabba Palace: two storeys of clay round a court, windows in white surrounds, bands of zig-zag, and white battlements', () => {
  const P = MURABBA;
  const { faces, made } = built('murabba-palace');
  const palace = famous('murabba-palace');
  const [halfWide, halfLong] = P.half;
  const [courtWest, courtEast, courtSouth, courtNorth] = P.court;
  // 35.6 m by 47 m: the 1,680 m2 that are published, to within a hundredth; the court inside it, off its middle; two floors.
  assert.ok(near(halfWide * 2, 35.6, 1e-9) && near(halfLong * 2, 47, 1e-9) && Math.abs(halfWide * 2 * halfLong * 2 - 1680) < 17);
  assert.ok(courtWest > -halfWide + 6 && courtEast < halfWide - 6 && courtSouth > -halfLong + 6 && courtNorth < halfLong - 6);
  assert.ok(P.floor > 4 && P.floor < P.roof / 2 + 0.5 && P.roof < P.wall);
  assert.ok(near(Math.max(...heights(faces)), P.wall + P.battlement[1], 1e-3) && Math.min(...heights(faces)) === 0);
  assert.equal(palace.height, P.wall + P.battlement[1]);
  // Its four walls are of clay, lit by night, and stand on the outline; the footing of stone stands out a little further and is the widest thing about it.
  const clay = faces.filter((face) => face.colour === '#b68a63');
  assert.equal(clay.length, 4 * 2);
  assert.ok(clay.every((face) => face.glow > 0.5 && Math.abs(face.normal[2]) < 1e-6 && face.corners.every((corner) => near(Math.abs(corner[0]), halfWide, 1e-3) || near(Math.abs(corner[1]), halfLong, 1e-3))));
  assert.ok(near(Math.max(...faces.flatMap((face) => face.corners.map((corner) => Math.abs(corner[0])))), halfWide + 0.12, 1e-3));
  // Along the top: a white pointed battlement every 0.9 m, a hundred and eighty-four of them, each with an outer and an inner face.
  const points = faces.filter((face) => face.colour === '#f1ece1' && face.corners.some((corner) => near(corner[2], P.wall + P.battlement[1], 1e-3)));
  assert.equal(points.length, 184 * 2);
  assert.ok(near(35.6 / 40, 0.89, 1e-9) && near(47 / 52, 0.9, 0.01));
  // Two bands of zig-zag round it: two hundred and twenty teeth each, pointing down.
  const relief = faces.filter((face) => face.colour === '#d0aa84');
  assert.equal(relief.length, 220 * 2);
  for (const height of P.bands) assert.equal(relief.filter((face) => face.corners.filter((corner) => near(corner[2], height, 1e-3)).length === 2 && face.corners.some((corner) => near(corner[2], height - 0.34, 1e-3))).length, 220);
  // Windows with round heads on the upper floor of three walls: thirty-three of them, each a pane of wood in a white surround; none in the west wall, which has small square ones on both floors.
  const panes = faces.filter((face) => face.colour === '#6a4a2c' && face.corners.every((corner) => corner[2] > P.floor));
  assert.equal(panes.length, 33 * 5);
  assert.ok(panes.every((face) => face.corners.every((corner) => corner[0] > -halfWide + 0.5 || Math.abs(corner[1]) > halfLong - 0.5)), 'none on the west wall');
  const small = faces.filter((face) => face.colour === '#2e241b' && face.corners.every((corner) => Math.max(Math.abs(corner[0]) - halfWide, Math.abs(corner[1]) - halfLong) > 0));
  // (South: ten places, the two middle ones taken by the door; east thirteen; north ten; west nine below and nine above.)
  assert.equal(small.length, (8 + 13 + 10 + 9 + 9) * 2);
  // The great door: of wood, in the middle of the south wall, 2.4 m wide and 3.3 m high.
  const door = faces.filter((face) => face.colour === '#6a4a2c' && face.corners.some((corner) => corner[2] === 0));
  assert.ok(door.length === 2 && door.every((face) => face.corners.every((corner) => corner[1] < -halfLong && Math.abs(corner[0]) <= P.door[0] / 2 + 1e-3 && corner[2] <= P.door[1] + 1e-3)));
  // The court: a gallery on both floors behind white columns, twenty-six to a floor; a door to every bay of each; and a screen of lattice along the upper one.
  const posts = faces.filter((face) => face.colour === '#f1ece1' && face.corners.every((corner) => corner[0] > courtWest - 1 && corner[0] < courtEast + 1 && corner[1] > courtSouth - 1 && corner[1] < courtNorth + 1 && corner[2] < P.roof));
  assert.equal(posts.length, 26 * 2 * (12 + 8));
  const doors = faces.filter((face) => face.colour === '#2e241b' && face.corners.every((corner) => Math.abs(corner[0]) < halfWide - 3 && Math.abs(corner[1]) < halfLong - 3));
  assert.equal(doors.length, 2 * (P.bays[0] + P.bays[1]) * 2 * 2);
  const lattice = faces.filter((face) => face.kind === 'pierced');
  assert.ok(lattice.length === 8 && lattice.every((face) => face.corners.every((corner) => corner[2] >= P.floor - 1e-3 && corner[2] <= P.floor + 0.95 + 1e-3)));
  assert.deepEqual(made, {});

  // Its shadows are thrown by its four wings; the court between them throws none.
  const shades = murabbaShades();
  assert.equal(shades.length, 4);
  const inside = ({ ring }, [x, y]) => x > ring[0][0] && x < ring[1][0] && y > ring[0][1] && y < ring[2][1];
  assert.equal(shades.filter((shade) => inside(shade, [(courtWest + courtEast) / 2, (courtSouth + courtNorth) / 2])).length, 0);
  for (const spot of [[0, halfLong - 2], [0, -halfLong + 2], [-halfWide + 2, 0], [halfWide - 2, 0], [-halfWide + 1, halfLong - 1], [halfWide - 1, -halfLong + 1]]) assert.equal(shades.filter((shade) => inside(shade, spot)).length, 1);
  assert.ok(shades.every((shade) => shade.height === P.wall));
  assert.ok(near(shades.reduce((sum, shade) => sum + squareMeters(shade.ring), 0), 35.6 * 47 - (courtEast - courtWest) * (courtNorth - courtSouth), 1e-6));
  // The buildings data has the palace as one block, court and all: it goes; the houses west of it stay.
  const squeeze = METERS * Math.cos((palace.at[1] * Math.PI) / 180);
  const placed = (points) => [...points, points[0]].map(([east, north]) => [palace.at[0] + east / squeeze, palace.at[1] + north / METERS]);
  // (Its outline as the data has it, in metres east and north of the palace's middle.)
  const own = [[-20.35, 21.2], [2.45, 25], [14.95, 25.5], [20.35, -21.2], [-14.95, -25.5]];
  const outlines = [{ id: 1, ring: placed(own) }, { id: 2, ring: placed([[-76.2, -46.2], [-87.6, 8.7], [-116.9, 2.7], [-125.6, 43.4], [-67, 55.9], [-31.2, 58.1], [-25.2, 31.5], [-22, -27.2], [-27.4, -50.5], [-62.7, -58.1]]) }];
  assert.deepEqual([...ghostsOfLandmarks(outlines)], [1]);
  // And the model stands on that outline: turned 6.6 degrees west of north, its corners within half a metre of the data's.
  const turn = (palace.bearing * Math.PI) / 180;
  const corners = [[-halfWide, halfLong], [halfWide, halfLong], [halfWide, -halfLong], [-halfWide, -halfLong]].map(([east, north]) => [east * Math.cos(turn) + north * Math.sin(turn), north * Math.cos(turn) - east * Math.sin(turn)]);
  [[-20.35, 21.2], [14.95, 25.5], [20.35, -21.2], [-14.95, -25.5]].forEach((corner, index) => assert.ok(Math.hypot(corner[0] - corners[index][0], corner[1] - corners[index][1]) < 0.5, `corner ${index}`));
});

test('the KAFD metro station: a white shell in two rows of eyes filled with lattice, lids over them, arches at its foot, a rolling roof', () => {
  const S = KAFD_STATION;
  const station = LANDMARKS.find((one) => one.id === 'kafd-station');
  assert.ok(station.model === kafdStation && station.bearing === 155.8 && station.within === 6000);
  const [halfWide, halfLong] = S.half;
  // Its outline: 210.4 m long and 39.6 m wide, its corners rounded: some 8,250 m2, as the buildings data has it (8,150 are published).
  assert.ok(near(halfLong * 2, 210.4, 1e-9) && near(halfWide * 2, 39.6, 1e-9));
  const ring = stationRing();
  assert.equal(ring.length, 60);
  assert.ok(Math.abs(squareMeters(ring) - 8250) < 60 && squareMeters(ring) > 0, String(squareMeters(ring)));
  const { round } = stationOutline(0);
  assert.ok(near(round, 4 * (halfWide - S.corner) + 4 * (halfLong - S.corner) + 2 * Math.PI * S.corner, 1e-9));
  // (It is measured from the middle of its north end, round by the west: its own west is the side on King Fahd Road.)
  const start = stationOutline(0);
  assert.ok(near(start.at[0], 0, 1e-9) && near(start.at[1], halfLong, 1e-9) && near(start.out[1], 1, 1e-9));
  const west = stationOutline(halfWide - S.corner + (Math.PI / 2) * S.corner + halfLong - S.corner);
  assert.ok(near(west.at[0], -halfWide, 1e-9) && near(west.at[1], 0, 1e-9) && near(west.out[0], -1, 1e-9));
  const outside = ([east, north]) => Math.hypot(Math.max(Math.abs(east) - (halfWide - S.corner), 0), Math.max(Math.abs(north) - (halfLong - S.corner), 0)) - S.corner;
  for (let k = 0; k < 97; k += 1) {
    const { at, out } = stationOutline((k / 97) * round);
    assert.ok(Math.abs(outside(at)) < 1e-6 || (Math.abs(at[0]) < halfWide - S.corner + 1e-9 && near(Math.abs(at[1]), halfLong, 1e-9)) || (Math.abs(at[1]) < halfLong - S.corner + 1e-9 && near(Math.abs(at[0]), halfWide, 1e-9)));
    assert.ok(near(Math.hypot(...out), 1, 1e-9) && out[0] * at[0] + out[1] * at[1] > 0, 'it looks outwards');
  }

  const mesh = new ModelMesh();
  const made = kafdStation(new Model(mesh));
  const faces = facesOf(mesh);
  assert.deepEqual(made, {});
  // It stands on the ground; the roof rolls along its middle up to 28.4 m; the glass on it lies on top.
  assert.equal(Math.min(...heights(faces)), 0);
  const top = Math.max(...heights(faces));
  assert.ok(top > S.ridge[0] + S.ridge[1] - 0.05 && top <= S.ridge[0] + S.ridge[1] + 0.08 && station.height === S.ridge[0] + S.ridge[1], String(top));
  // Nothing stands out of its outline but the lids over the eyes, by a metre and a half at most (and the foot,
  // which swells out under the lower eyes, by less).
  const proud = Math.max(...faces.flatMap((face) => face.corners.map(outside)));
  assert.ok(proud > S.hood - 0.05 && proud <= S.hood + 1e-4, String(proud));
  // Two rows of eyes, filled with lattice, set back in the shell and lit from within by night: the lower between 9 and 16.6 m, the upper between 18.3 and 24.1 m.
  const lattice = faces.filter((face) => face.kind === 'pierced');
  // (Its openings stand on their points, and every one of them is cut: deep cells, whose walls show inside each.)
  assert.ok(lattice.length > 600 && lattice.every((face) => face.open && face.lit > 0.85 && face.floors === 0 && near(face.fins, 0.84, 0.01) && face.louvres && face.light === '#ffe3be'));
  const [[lowerAt, lowerHalf], [upperAt, upperHalf]] = S.rows;
  const lower = lattice.filter((face) => face.corners.every((corner) => corner[2] < 17));
  const upper = lattice.filter((face) => face.corners.every((corner) => corner[2] > 18));
  assert.equal(lower.length + upper.length, lattice.length);
  assert.ok(lower.every((face) => face.corners.every((corner) => corner[2] >= lowerAt - lowerHalf - 1e-6 && corner[2] <= lowerAt + lowerHalf + 1e-6)));
  assert.ok(upper.every((face) => face.corners.every((corner) => corner[2] >= upperAt - upperHalf - 1e-6 && corner[2] <= upperAt + upperHalf + 1e-6)));
  // (Set back in the shell: never standing out of its outline, and most of it 1.2 m in; less towards the points of an eye.)
  assert.ok(lattice.every((face) => face.corners.every((corner) => outside(corner) <= 1e-4)), 'set back in the shell');
  assert.ok(lattice.filter((face) => face.corners.every((corner) => outside(corner) < -0.3)).length > lattice.length * 0.7);
  // Twenty eyes in each row, right round it: each 24 m long; the upper ones over the middles of the ends and over the gaps of the lower.
  const eye = round / S.eyes;
  assert.ok(near(eye, 24.14, 0.01));
  const tallest = (row, at) => {
    // (How tall the lattice of a row is near a place round the building.)
    const there = row.filter((face) => face.along.every((along) => Math.abs(along - at) < 2.1));
    return there.length ? Math.max(...heights(there)) - Math.min(...heights(there)) : 0;
  };
  for (let k = 1; k < S.eyes; k += 1) {
    assert.ok(tallest(upper, k * eye) > upperHalf * 1.8 && tallest(upper, (k + 0.5) * eye) < upperHalf * 0.8, `upper eye ${k}`);
    assert.ok(tallest(lower, (k + 0.5) * eye) > lowerHalf * 1.8 && tallest(lower, k * eye) < lowerHalf * 0.8, `lower eye ${k}`);
  }
  // At either end the trains run in through a dark mouth in the shell, a floor up.
  const mouths = faces.filter((face) => face.colour === '#20262b');
  assert.ok(mouths.length > 10 && mouths.every((face) => face.corners.every((corner) => Math.abs(corner[0]) < 7 && Math.abs(corner[1]) > halfLong - 3 && corner[2] >= S.mouth[1] - 1e-6 && corner[2] <= S.mouth[2] + 1e-6)));
  assert.ok(mouths.some((face) => face.corners.some((corner) => corner[1] > 0)) && mouths.some((face) => face.corners.some((corner) => corner[1] < 0)), 'at both ends');
  // At its foot, under every lower eye, an arch of glass: twenty of them, four of those great doorways 7.6 m high; the rest 5.5 m.
  const glass = faces.filter((face) => face.kind === 'glass');
  assert.ok(glass.every((face) => face.lit === 1 && face.corners.every((corner) => corner[2] <= S.door[1] + 1e-6)));
  const arches = new Map();
  for (const face of glass) {
    const which = Math.floor(face.along.reduce((sum, along) => sum + along, 0) / 3 / eye);
    arches.set(which, Math.max(arches.get(which) ?? 0, ...heights([face])));
  }
  assert.equal(arches.size, 20);
  assert.deepEqual([...arches].filter(([, top]) => top > 6).map(([which]) => which).sort((a, b) => a - b), S.doors);
  assert.ok([...arches].every(([which, top]) => near(top, S.doors.includes(which) ? S.door[1] : S.arch[1], 0.3)));
  // The shell is white concrete, washed in warm white light by night; the roof is white too, and takes no shadow of the block that throws the station's own.
  const white = faces.filter((face) => face.colour === '#f3f2ed' && face.kind === 'plain');
  assert.ok(white.length > 2000 && white.every((face) => face.light === '#ffe3be' && face.glow > 0.25));
  // (Its foot is in six lifts of panels, their joints swooping with the eyes over them.)
  assert.equal(S.lifts, 6);
  const roof = faces.filter((face) => face.colour === '#f1f0ea');
  assert.ok(roof.length > 1000 && roof.every((face) => face.open && face.normal[2] > 0));
  // Two fields of glass along the middle of the roof, set with panes that stand on their points.
  const panes = faces.filter((face) => face.colour === '#3b464e');
  assert.ok(panes.length > 200 && panes.every((face) => face.kind === 'lamp' && face.corners.every((corner) => Math.abs(corner[0]) <= 6.5 && corner[2] > S.ridge[0] - S.ridge[1])));
  for (const [from, to] of S.skylights) assert.ok(panes.some((face) => face.corners.every((corner) => corner[1] > from && corner[1] < to)));

  // Its shadow: its outline up to 23.5 m, and the middle of its roof up to 27 m.
  assert.deepEqual(stationShades().map((shade) => [shade.height, shade.ring.length]), [[23.5, 60], [27, 4]]);
  assert.deepEqual(station.shades, stationShades());
  // The buildings data has it as a block of 12 m, which goes altogether.
  const squeeze = METERS * Math.cos((station.at[1] * Math.PI) / 180);
  const turn = (station.bearing * Math.PI) / 180;
  const placed = (points) => [...points, points[0]].map(([east, north]) => [station.at[0] + (east * Math.cos(turn) + north * Math.sin(turn)) / squeeze, station.at[1] + (north * Math.cos(turn) - east * Math.sin(turn)) / METERS]);
  const data = placed([[17.1, -105.1], [-20.5, -104.2], [-19, 18.2], [-20.6, 103.3], [-15.5, 105.2], [19.8, 103], [19.7, 27.5], [20.6, 5.8], [18.8, -105.2]]);
  assert.deepEqual([...ghostsOfLandmarks([{ id: 1, ring: data }, { id: 2, ring: placed([[60, 0], [80, 0], [80, 20], [60, 20]]) }])], [1]);
});

test('the National Museum: a long wall of stone that curves like a dune and rises to a point, the halls behind it, a round hall, a glass front under a canopy', () => {
  const N = NATIONAL_MUSEUM;
  const museum = famous('national-museum');
  const { faces, made } = built('national-museum');
  assert.deepEqual(made, {});
  // The wall: some 170 m from its north end to its point; its foot runs through every point the buildings data gives for it.
  const wall = museumWall();
  const length = wall.reduce((sum, { at }, i) => sum + (i ? Math.hypot(at[0] - wall[i - 1].at[0], at[1] - wall[i - 1].at[1]) : 0), 0);
  assert.ok(length > 160 && length < 180, String(length));
  for (const point of N.wall) assert.ok(wall.some(({ at }) => near(at[0], point[0], 1e-6) && near(at[1], point[1], 1e-6)), String(point));
  // It curves one way only: the building is always on its east side, and it bends towards the building as it runs south.
  assert.ok(wall.every(({ inward }) => inward[0] > 0.5 && near(Math.hypot(...inward), 1, 1e-9)));
  for (let i = 1; i < wall.length; i += 1) assert.ok(wall[i].at[1] < wall[i - 1].at[1], 'it runs from north to south');
  // 15 m high along most of it; from 30 m south of the middle it climbs, faster and faster, to its point, 28 m.
  assert.ok(wall.filter(({ at }) => at[1] > N.rise).every(({ height }) => height === N.high));
  const climb = wall.filter(({ at }) => at[1] <= N.rise);
  climb.forEach(({ height }, i) => i && assert.ok(height > climb[i - 1].height));
  assert.equal(climb.at(-1).height, N.point);
  assert.ok(near(Math.max(...heights(faces)), N.point, 1e-3) && Math.min(...heights(faces)) === 0 && museum.height === N.point);
  // Its outer face leans back, 0.08 m for every metre: at its point the top stands 2.24 m in from its foot.
  const stone = faces.filter((face) => face.colour === '#d6a06b' && face.kind === 'plain');
  assert.ok(stone.every((face) => face.glow > 0.5 && face.light === '#ffc983'), 'floodlit, golden');
  const outer = stone.filter((face) => face.normal[2] > 0.05 && face.normal[2] < 0.1);
  assert.equal(outer.length, (wall.length - 1) * 2);
  assert.ok(outer.every((face) => face.normal[0] < -0.8 && near(face.normal[2], N.lean / Math.hypot(1, N.lean), 2e-3)));
  // The halls behind it: their outline runs up the inner foot of the wall and round by the east; 17,400 m2 of them.
  const halls = museumHalls();
  const area = squareMeters(halls);
  assert.ok(area > 17000 && area < 17800, String(area));
  assert.ok(halls.some((corner) => near(corner[1], N.front, 1e-9) && corner[0] < -30), 'where the wall meets the glass front');
  // Their roof, 14 m up, open to the sky over the two gardens and cut round the round hall.
  const roof = faces.filter((face) => face.colour === '#d8c29d' && face.corners.every((corner) => near(corner[2], N.roof, 1e-3)));
  const inside = (box, [east, north]) => east > box[0] && east < box[1] && north > box[2] && north < box[3];
  const middle = (face) => [0, 1].map((k) => (face.corners[0][k] + face.corners[1][k] + face.corners[2][k]) / 3);
  assert.ok(roof.length > 50 && roof.every((face) => face.open && N.courts.every((court) => !inside(court, middle(face)))));
  const [drumEast, drumNorth, drumRadius, drumHeight] = N.drum;
  assert.ok(roof.every((face) => Math.hypot(middle(face)[0] - drumEast, middle(face)[1] - drumNorth) > drumRadius - 0.5));
  // Their walls: tall bays of windows, one every 4.5 m.
  const bays = faces.filter((face) => face.kind === 'pierced');
  assert.ok(bays.length === 20 * 2 && bays.every((face) => face.storey === 14 && face.bay === 4.5 && face.floors === 1));
  // The round hall stands 4.5 m over the roofs, 36 m across.
  const drum = stone.filter((face) => face.corners.every((corner) => near(Math.hypot(corner[0] - drumEast, corner[1] - drumNorth), drumRadius, 1e-3)));
  assert.ok(drum.length === 48 * 2 && near(Math.max(...heights(drum)), drumHeight, 1e-3) && drumHeight - N.roof === 4.5);
  // The glass front, two storeys, lit within; over it the canopy, 8 m deep, its underside of warm wood and lit; before it the square.
  const glass = faces.filter((face) => face.kind === 'glass');
  assert.ok(glass.length === 2 && glass.every((face) => face.lit === 1 && face.corners.every((corner) => near(corner[1], N.front, 1e-6) && corner[2] <= N.canopy[3] + 1e-6)));
  const under = faces.filter((face) => face.colour === '#b5703c');
  assert.ok(under.length === 2 && under.every((face) => face.normal[2] < -0.99 && face.glow > 0.5 && face.corners.every((corner) => near(corner[2], N.canopy[3], 1e-6))));
  assert.ok(near(N.front - N.canopy[2], 8, 1e-9));
  const square = faces.filter((face) => face.colour === '#cfa86a');
  assert.ok(near(square.reduce((sum, { corners: [a, b, c] }) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, 0), 24 * 38, 1e-3));
  // The wall's point stands free beside the doors: its inner face comes down to the ground there.
  assert.ok(stone.some((face) => face.normal[0] > 0.5 && face.corners.some((corner) => corner[2] === 0 && corner[1] < N.front)));
  assert.ok(stone.filter((face) => face.normal[0] > 0.5 && face.corners.every((corner) => corner[1] > N.front + 3)).every((face) => face.corners.every((corner) => corner[2] >= N.roof - 1e-6)));

  // Its shadows: the halls, the round hall, and the free end of the wall.
  assert.deepEqual(museumShades().map((shade) => shade.height), [N.roof, drumHeight, (N.high + N.point) / 2]);
  assert.deepEqual(museum.shades, museumShades());
  // The buildings data's two outlines for it go altogether.
  const squeeze = METERS * Math.cos((museum.at[1] * Math.PI) / 180);
  const placed = (points) => [...points, points[0]].map(([east, north]) => [museum.at[0] + east / squeeze, museum.at[1] + north / METERS]);
  const data = [
    placed([[-46.7, 31.2], [-51.5, 45.3], [-57.5, 59.9], [-65.7, 74.6], [-81.4, 100.1], [-76, 104.4], [-55.9, 71.9], [53.2, 100.6], [63.5, 46.9], [70, 48.5], [73.3, 35], [62.4, 32.8], [61.9, 38.2], [10.3, 25.7], [19.6, -8.5], [65.7, 0.2], [73.3, -28], [71.7, -28], [80.3, -63.8], [82.5, -63.3], [89.6, -91.5], [47.2, -99.6], [-6, -99.6], [-11.4, -44.3], [-32.5, -47.5], [-33.1, -62.2], [-36.9, -62.2], [-36.3, -35.1], [-38.5, -10.6], [-42.9, 17.6]]),
    placed([[72.2, -30.2], [80.3, -63.8], [82.5, -63.3], [89.6, -91.5], [-0.5, -108.9], [6, -176.7], [104.8, -152.8], [110.7, -180], [13, -205.5], [13, -209.8], [4.4, -210.4], [-11.4, -44.3], [-32.5, -47.5], [-33.1, -62.2], [-36.9, -62.2], [-36.3, -35.1], [-36.9, -30.2]]),
    placed([[-130, 0], [-110, 0], [-110, 20], [-130, 20]]), // a house in the park west of it
  ];
  assert.deepEqual([...ghostsOfLandmarks(data.map((ring, id) => ({ id, ring })))].sort(), [0, 1]);
});

test('KAPSARC: a honeycomb of cells traced from the photo, each with its courtyard; low at the middle, rising to the edge', () => {
  const K = KAPSARC;
  const one = famous('kapsarc');
  const inside = (ring, [x, y]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      if ((ring[i][1] > y) !== (ring[j][1] > y) && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit;
    }
    return hit;
  };
  const middle = (ring) => ring.reduce((sum, [x, y]) => [sum[0] + x / ring.length, sum[1] + y / ring.length], [0, 0]);
  // Eighty-five cells, three in four with a courtyard; each anticlockwise, none inside another; 44,000 m2 of roofs in all.
  assert.equal(KAPSARC_CELLS.length, 85);
  assert.equal(KAPSARC_CELLS.filter((cell) => cell.court).length, 75);
  for (const { ring, court } of KAPSARC_CELLS) {
    assert.ok(ring.length >= 3 && squareMeters(ring) > 25, JSON.stringify(ring));
    if (court) assert.ok(squareMeters(court) > 1.5 && court.every((corner) => inside(ring, corner)), 'a courtyard lies within its cell');
  }
  // (No corner of one cell lies inside another, but by the 0.1 m the outlines are rounded to: they meet along seams, and do not overlap.)
  const edgeDistance = (ring, [x, y]) => Math.min(...ring.map(([ax, ay], k) => {
    const [bx, by] = ring[(k + 1) % ring.length];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  }));
  KAPSARC_CELLS.forEach(({ ring }, i) => KAPSARC_CELLS.forEach((other, j) => i !== j && ring.forEach((corner) => assert.ok(!inside(other.ring, corner) || edgeDistance(other.ring, corner) < 0.2, `a corner of cell ${i} in cell ${j}`))));
  const roofs = KAPSARC_CELLS.reduce((sum, { ring }) => sum + squareMeters(ring), 0);
  assert.ok(roofs > 42000 && roofs < 47000, String(roofs));
  // They fan out from the middle: the cells near it are small, those at the edge large.
  const byReach = KAPSARC_CELLS.map(({ ring }) => [Math.hypot(middle(ring)[0] - KAPSARC_FOCUS[0], middle(ring)[1] - KAPSARC_FOCUS[1]), squareMeters(ring)]);
  const mean = (list) => list.reduce((sum, [, area]) => sum + area, 0) / list.length;
  assert.ok(mean(byReach.filter(([reach]) => reach < 40)) * 4 < mean(byReach.filter(([reach]) => reach > 90)));
  // The eaves rise from 7 m at the middle to 19 m at the edge, and never fall as one goes out.
  const eaves = KAPSARC_CELLS.map(({ ring }) => kapsarcEaves(ring));
  assert.ok(Math.min(...eaves) >= K.low && Math.max(...eaves) <= K.high && Math.max(...eaves) - Math.min(...eaves) > 10);
  const order = byReach.map(([reach], i) => [reach, eaves[i]]).sort((a, b) => a[0] - b[0]);
  order.forEach(([, height], i) => i && assert.ok(height >= order[i - 1][1] - 1e-9));
  // A roof rises to the rim of its courtyard: 2.2 m at most, less on a narrow one.
  for (const cell of KAPSARC_CELLS) assert.ok(kapsarcRise(cell) >= 0.3 && kapsarcRise(cell) <= K.rise);
  assert.ok(KAPSARC_CELLS.filter((cell) => kapsarcRise(cell) === K.rise).length > 30);

  const { faces, made } = built('kapsarc');
  assert.deepEqual(made, {});
  assert.equal(Math.min(...heights(faces)), 0);
  assert.ok(Math.max(...heights(faces)) <= K.high + K.rise + 1e-3 && one.height === K.high + K.rise);
  // Walls of pale panels with bands of glass, lit by night; white roofs that take no shadow of the blocks that throw the cells' own.
  const walls = faces.filter((face) => face.kind === 'pierced');
  assert.ok(walls.length > 800 && walls.every((face) => near(face.storey, K.storey, 1e-5) && near(face.fins, 0.72, 0.01) && face.lit > 0.5));
  const roof = faces.filter((face) => face.colour === '#f1efe9');
  // (All of it faces up, but for a few slivers where a courtyard's corner comes close to its cell's edge.)
  assert.ok(roof.length > 900 && roof.every((face) => face.open && face.normal[2] > 0) && roof.filter((face) => face.normal[2] < 0.5).length <= 5);
  // Each courtyard: glass walls down to a floor that gives light by night, 2.6 m under its rim.
  const floors = faces.filter((face) => face.kind === 'lamp');
  assert.ok(floors.length >= 75 && floors.every((face) => face.glow > 0.5 && near(face.normal[2], 1, 1e-6)));
  assert.ok(faces.filter((face) => face.kind === 'glass').every((face) => face.lit === 1 && face.open));
  // Every cell throws its own shadow, from its outline to its eaves; the data's single block for the campus goes.
  const shades = kapsarcShades();
  assert.equal(shades.length, 85);
  shades.forEach((shade, i) => assert.ok(shade.ring === KAPSARC_CELLS[i].ring && shade.height === eaves[i]));
  assert.ok(one.within === 5000 && one.bearing === 0);
  const squeeze = METERS * Math.cos((one.at[1] * Math.PI) / 180);
  const placed = (points) => [...points, points[0]].map(([east, north]) => [one.at[0] + east / squeeze, one.at[1] + north / METERS]);
  const block = placed([[-150, -120], [-60, -150], [60, -140], [130, -60], [140, 60], [80, 130], [-40, 140], [-110, 80]]);
  // (A block whose middle is the data's: 30 m west and 2 m south of the landmark's mark.)
  const shifted = block.map(([lng, lat]) => [lng + (-29.7 - (-150 - 60 + 60 + 130 + 140 + 80 - 40 - 110) / 8) / squeeze, lat + (-1.8 - (-120 - 150 - 140 - 60 + 60 + 130 + 140 + 80) / 8) / METERS]);
  assert.deepEqual([...ghostsOfLandmarks([{ id: 1, ring: shifted }])], [1]);
});
