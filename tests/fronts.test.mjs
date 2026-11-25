import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { FRONTS_PICTURE, chanceOf, dressInFronts, faceMeasure, frontFor, frontOfHouse, frontageOf, layStrip, outlineOf, roofTintOf, tintOf, trianglesOf } from '../js/fronts.js';
import { KIT } from '../js/kit.js';

const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
const origin = { lng: 46.7, lat: 24.75 };
/** A house as parcelHouses lays one out: its front along the east, its back to the north, a main part and a room on its roof. */
const houseOf = (id, wide, deep, more = {}) => ({
  id,
  at: [origin.lng, origin.lat],
  along: [1, 0],
  back: [0, 1],
  wide,
  deep,
  paint: '#d8c8a8',
  ends: [false, true],
  rows: 1,
  parts: [
    { a0: 0, a1: wide, b0: 0, b1: deep, height: 8.2, part: 'main' },
    { a0: wide * 0.1, a1: wide * 0.58, b0: deep * 0.34, b1: deep * 0.8, height: 11.3, part: 'room' },
  ],
  plot: { front: 2.4, left: 1, right: 2.4, behind: 1.2 },
  ...more,
});

test('a wall is laid as long as the house needs: its gate keeps its size, plain wall fills the rest', () => {
  // A wall measured in a picture at 100 spots to the metre: 2 m of plain wall, a window 1 m wide that may be
  // left out, 1 m of plain wall, a gate 3 m wide.
  const pieces = [[0, 200, 'plain'], [200, 300, 'optional'], [300, 400, 'plain'], [400, 700, 'fixed']];
  // At its own length, 7 m: as it was measured.
  const own = layStrip(pieces, 100, 7);
  assert.deepEqual(own.map((run) => [run.a0, run.a1, run.u0, run.u1, run.kind]), [[0, 2, 0, 200, 'plain'], [2, 3, 200, 300, 'optional'], [3, 4, 300, 400, 'plain'], [4, 7, 400, 700, 'fixed']]);
  // Twice as long: gate and window as wide as they were; the plain wall takes up the rest, each piece laid
  // again in mirror image where its own length ends, so that no seam shows.
  const long = layStrip(pieces, 100, 14);
  assert.ok(near(long.at(-1).a1, 14) && near(long[0].a0, 0));
  for (let i = 1; i < long.length; i += 1) assert.ok(near(long[i].a0, long[i - 1].a1, 1e-9));
  const gate = long.find((run) => run.kind === 'fixed');
  const window = long.find((run) => run.kind === 'optional');
  assert.ok(near(gate.a1 - gate.a0, 3) && near(window.a1 - window.a0, 1) && gate.u0 === 400 && gate.u1 === 700);
  const plain = long.filter((run) => run.kind === 'plain');
  assert.ok(near(plain.reduce((sum, run) => sum + run.a1 - run.a0, 0), 10));
  // (No plain piece is drawn out: a metre of wall is always a hundred spots of the picture.)
  for (const run of plain) assert.ok(near(Math.abs(run.u1 - run.u0) / (run.a1 - run.a0), 100, 1e-6));
  // (The first plain piece, 2 m long, fills 6.67 m: itself, itself in mirror image, itself, and two thirds more.)
  assert.deepEqual(plain.slice(0, 4).map((run) => [Math.round(run.u0), Math.round(run.u1)]), [[0, 200], [200, 0], [0, 200], [200, 133]]);
  // Too short for the window and half a metre of wall beside it: the window is left out.
  const short = layStrip(pieces, 100, 3.8);
  assert.deepEqual(short.map((run) => run.kind), ['plain', 'plain', 'fixed']);
  assert.ok(near(short.at(-1).a1, 3.8) && near(short.at(-1).a1 - short.at(-1).a0, 3));
  // Shorter than the gate itself: the gate, narrower.
  const tight = layStrip(pieces, 100, 2.4);
  assert.deepEqual(tight.map((run) => [run.kind, run.a0, run.a1]), [['fixed', 0, 2.4]]);
  // From the other end: the same wall in mirror image, the gate first.
  const turned = layStrip(pieces, 100, 14, true);
  assert.equal(turned[0].kind, 'fixed');
  assert.ok(turned[0].u0 === 700 && turned[0].u1 === 400 && near(turned[0].a1, 3) && near(turned.at(-1).a1, 14));
});

test('the kit: fronts measured in pictures taken straight on, all in one picture', () => {
  // (Both sides of the picture are powers of two: only such a picture can be smoothed for the distance.)
  assert.deepEqual(KIT.size, [4096, 2048]);
  assert.ok(KIT.fronts.length >= 10);
  assert.equal(new Set(KIT.fronts.map((front) => front.name)).size, KIT.fronts.length);
  const inside = (box) => box[0] >= 0 && box[1] >= 0 && box[2] <= KIT.size[0] && box[3] <= KIT.size[1] && box[2] > box[0] && box[3] > box[1];
  const styles = ['plaster', 'stone', 'arched', 'modern'];
  for (const front of KIT.fronts) {
    // Its wall: between two and three and a half metres tall, with a gate that keeps its size and plain wall to lay.
    assert.ok(front.wall.height >= 2 && front.wall.height <= 3.5 && front.wall.perMetre > 20, front.name);
    assert.ok(near((front.wall.v[1] - front.wall.v[0]) / front.wall.perMetre, front.wall.height, 0.02), front.name);
    const kinds = front.wall.pieces.map((piece) => piece[2]);
    assert.ok(kinds.includes('fixed') && kinds.includes('plain') && kinds.every((kind) => ['fixed', 'plain', 'optional'].includes(kind)), front.name);
    for (const [from, until] of front.wall.pieces) assert.ok(until > from && inside([from, front.wall.v[0], until, front.wall.v[1]]), front.name);
    for (const lamp of front.wall.lamps) assert.ok(inside(lamp) && lamp[1] >= front.wall.v[0] && lamp[3] <= front.wall.v[1], front.name);
    // The face of its house: between five and eight metres of it show over the wall, seven to fourteen wide.
    const face = faceMeasure(front);
    assert.ok(face.tall > 4.5 && face.tall < 8.5 && face.wide > 7 && face.wide < 14.5, `${front.name}: ${face.wide.toFixed(1)} by ${face.tall.toFixed(1)}`);
    for (const rect of front.house.rects) assert.ok(inside(rect), front.name);
    // Its windows (those that can be lit, and those whose shutters are closed) and its lamps lie on that face.
    for (const pane of [...front.house.panes, ...front.house.dark, ...front.house.lamps]) assert.ok(inside(pane) && pane[0] >= face.box[0] - 1 && pane[2] <= face.box[2] + 1 && pane[1] >= face.box[1] - 1 && pane[3] <= face.box[3] + 1, front.name);
    assert.ok(front.house.panes.length + front.house.dark.length >= 2 && inside(front.house.plain) && front.house.plainPerMetre > 5, front.name);
    assert.ok(front.tone.length === 3 && front.tone.every((part) => part > 0.3 && part < 1), front.name);
    // The styles of house it is made for, and how rare such a house is.
    assert.ok(front.styles.length >= 1 && front.styles.every((style) => styles.includes(style)) && front.rare >= 0 && front.rare < 1, front.name);
  }
  // Every style of house has at least three fronts made for it.
  for (const style of styles) assert.ok(KIT.fronts.filter((front) => front.styles.includes(style)).length >= 3, style);
  for (const name of ['floor', 'paving', 'white', 'unit', 'dark']) assert.ok(inside(KIT.stuff[name]), name);
  const picture = new Uint8Array(readFileSync(new URL(`../models/${FRONTS_PICTURE}.jpg`, import.meta.url)));
  assert.ok(picture[0] === 0xff && picture[1] === 0xd8 && picture.length < 1300000);
});

test('each house is given a front that fits it: mostly one of its own style, leaning to its own paint', () => {
  const chance = chanceOf(5);
  const street = (plotWide, faceWide, paint, style) => {
    const count = {};
    for (let id = 1; id <= 400; id += 1) {
      const name = KIT.fronts[frontFor(plotWide, faceWide, 9.6, paint, chanceOf(id), KIT.fronts, style)].name;
      count[name] = (count[name] ?? 0) + 1;
    }
    return count;
  };
  const share = (count, names) => names.reduce((sum, name) => sum + (count[name] ?? 0), 0) / 400;
  const made = (style) => KIT.fronts.filter((front) => front.styles.includes(style)).map((front) => front.name);
  // Along a street of wide houses in one paint, nearly every front comes up, and none on more than a third
  // of them: no street is all one house.
  const beige = street(15, 12, '#d6c3a2');
  assert.ok(Object.keys(beige).length >= 9 && Object.values(beige).every((count) => count <= 133), JSON.stringify(beige));
  // The paint leans the choice: of white houses, more than half are given one of the light fronts.
  const light = KIT.fronts.filter((front) => (front.tone[0] + front.tone[1] + front.tone[2]) / 3 > 0.84).map((front) => front.name);
  const white = street(16, 14, '#f2f1ee');
  assert.ok(light.length >= 3 && share(white, light) > 0.5 && Object.keys(white).length >= 6, JSON.stringify(white));
  // The style decides most: three in four houses of a style are given a front made for it, yet not all, and
  // more than one such front comes up.
  for (const [style, paint] of [['plaster', '#cfae84'], ['stone', '#e3d6b8'], ['arched', '#e9e0c8'], ['modern', '#d9d4c8']]) {
    const count = street(19, 13, paint, style);
    const own = share(count, made(style));
    assert.ok(own > 0.7 && own < 0.97 && made(style).filter((name) => count[name] > 20).length >= 2, `${style}: ${JSON.stringify(count)}`);
  }
  // A house of the old Najdi look is rare, whatever the style.
  for (const style of ['plaster', 'stone']) assert.ok(share(street(19, 13, '#cfae84', style), ['najdi']) < 0.15, style);
  // A narrow house: never the grand front that would have to be made half its size.
  assert.equal(street(9.5, 7, '#dccdb2').limestone, undefined);
  assert.ok(Object.keys(street(9.5, 7, '#dccdb2')).length >= 3);
  // One that no front fits (lower than any front's own wall and face): still given one, the nearest fit.
  assert.ok(frontFor(3, 2, 4, '#dccdb2', chance) >= 0);
  // And the same house is always given the same.
  assert.equal(frontFor(15, 12, 9.6, '#d6c3a2', chance), frontFor(15, 12, 9.6, '#d6c3a2', chance));
});

test('houses dressed from the kit: each on its own plot, in its own measure, no two alike', () => {
  const houses = [houseOf(101, 12, 14), houseOf(102, 17, 15, { at: [origin.lng + 0.0004, origin.lat] }), houseOf(103, 9.5, 12, { at: [origin.lng + 0.0008, origin.lat], plot: { front: 0, left: 0.5, right: 0.5, behind: 1 } })];
  const meshes = dressInFronts(houses, origin);
  assert.equal(meshes.length, 1);
  const mesh = meshes[0];
  assert.ok(mesh.corners > 600 && mesh.corners < 4000 && mesh.indices.length === (mesh.corners / 4) * 6, `${mesh.corners} corners`);
  assert.ok(mesh.positions.length === mesh.corners * 3 && mesh.normals.length === mesh.corners * 3 && mesh.uvs.length === mesh.corners * 2 && mesh.tints.length === mesh.corners * 4);
  for (const value of mesh.positions) assert.ok(Number.isFinite(value));
  for (const value of mesh.uvs) assert.ok(value >= 0 && value <= 1);
  for (const corner of mesh.indices) assert.ok(corner < mesh.corners);
  for (let i = 0; i < mesh.corners; i += 1) {
    assert.ok(near(Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]), 1, 1e-5));
    assert.ok(mesh.positions[i * 3 + 2] >= 0 && mesh.positions[i * 3 + 2] < 14.5);
  }
  // The first house alone: nothing of it outside its plot (1 m to its left, 2.4 m to its right and before it,
  // 1.2 m behind), and its parapet at its own height: 8.2 m and a parapet's 1.4 m more.
  const [one] = dressInFronts([houses[0]], origin);
  let [e0, e1, n0, n1] = [Infinity, -Infinity, Infinity, -Infinity];
  const heights = new Set();
  for (let i = 0; i < one.corners; i += 1) {
    e0 = Math.min(e0, one.positions[i * 3]);
    e1 = Math.max(e1, one.positions[i * 3]);
    n0 = Math.min(n0, one.positions[i * 3 + 1]);
    n1 = Math.max(n1, one.positions[i * 3 + 1]);
    heights.add(Math.round(one.positions[i * 3 + 2] * 100) / 100);
  }
  assert.ok(near(e0, -1, 0.01) && near(e1, 14.4, 0.01) && near(n0, -2.4 - 0.12, 0.13) && near(n1, 15.2, 0.01), [e0, e1, n0, n1].join(' '));
  assert.ok(heights.has(9.6) && heights.has(8.5) && heights.has(0));
  // Its wall to the street looks to the street, and everything is wound anticlockwise seen from outside: the
  // way each face looks, worked out from its corners, is the way it was told to look.
  for (let t = 0; t < one.indices.length; t += 6) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((axis) => one.positions[one.indices[t + k] * 3 + axis]));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const size = Math.hypot(...cross);
    if (size < 1e-9) continue;
    const told = [0, 1, 2].map((axis) => one.normals[one.indices[t] * 3 + axis]);
    assert.ok((cross[0] * told[0] + cross[1] * told[1] + cross[2] * told[2]) / size > 0.999);
  }
  // By night: every corner either catches the street lamps' light (most where it faces the street) or is a
  // lamp or a lit window; over a street of houses some windows are lit and some are not.
  const street = Array.from({ length: 40 }, (_, n) => houseOf(200 + n, 11 + (n % 5), 13 + (n % 3), { at: [origin.lng + n * 0.0002, origin.lat] }));
  const lit = dressInFronts(street, origin).reduce((sum, each) => {
    let count = 0;
    for (let i = 3; i < each.tints.length; i += 4) if (each.tints[i] >= 128) count += 1;
    return sum + count;
  }, 0);
  assert.ok(lit > 200 && lit < 4000, `${lit} lit corners`);
  // No two alike: a house 12 m wide and one 17 m wide are not one house made wider. The gate of each keeps
  // its true size, so the wider plot has more plain wall, not a wider gate.
  const frontOf = (house) => KIT.fronts[frontFor(house.wide + house.plot.left + house.plot.right, house.wide, 9.6, house.paint, chanceOf(house.id))];
  const gateOf = (house) => layStrip(frontOf(house).wall.pieces, frontOf(house).wall.perMetre, house.wide + house.plot.left + house.plot.right).filter((run) => run.kind === 'fixed').reduce((sum, run) => sum + run.a1 - run.a0, 0);
  const wider = houseOf(101, 17, 14);
  assert.equal(frontOf(houses[0]).name, frontOf(wider).name);
  assert.ok(near(gateOf(houses[0]), gateOf(wider), 1e-6));
  // A house with no parts of its own (one the map has whole) is left as it is.
  assert.deepEqual(dressInFronts([{ ...houses[0], parts: null }], origin), []);
});

test('a house keeps its own chance, whatever it is called by', () => {
  // By a number, by that number written out, or by a name: always a number from 0 up to 1, the same every time.
  assert.equal(chanceOf(5)(20), chanceOf('5')(20));
  for (const id of [5, 86166713698699, 'w1234', 'tile/12/7:3']) {
    const value = chanceOf(id)(20);
    assert.ok(value >= 0 && value < 1 && value === chanceOf(id)(20) && value !== chanceOf(id)(21), String(id));
  }
  assert.notEqual(chanceOf('w1234')(20), chanceOf('w1235')(20));
});

test('a house\'s own paint is laid over its front without turning its colour', () => {
  // No paint, or the front's own colour as paint: the picture as it is.
  assert.deepEqual(tintOf(undefined, [0.8, 0.7, 0.6]), [128, 128, 128]);
  assert.deepEqual(tintOf('#cccccc', [0.8, 0.8, 0.8]), [128, 128, 128]);
  // A tan paint over a nearly white front: darker, the blue of it most and the red of it least (a tan), and
  // each part by the same share of what the paint asked for: held back alike, not each on its own (which made
  // it pink). No part is made darker than 0.78 of itself.
  const tone = [0.957, 0.923, 0.886];
  const [red, green, blue] = tintOf('#cfae84', tone);
  assert.ok(red > green && green > blue && blue >= Math.round(0.39 * 255) && red < 128, [red, green, blue].join(' '));
  const asked = [0xcf, 0xae, 0x84].map((part, n) => part / 255 / tone[n] - 1);
  const given = [red, green, blue].map((part) => (part / 255) * 2 - 1);
  assert.ok(near(given[0] / asked[0], given[2] / asked[2], 0.03) && near(given[1] / asked[1], given[2] / asked[2], 0.03) && near(given[2], -0.22, 0.005));
  // A lighter paint over a darker front: lighter, by no more than 1.3.
  assert.ok(tintOf('#ffffff', [0.5, 0.5, 0.5]).every((part) => part === Math.round(0.65 * 255)));
});

test('along a street, neighbours are not given the same front', () => {
  // Forty houses of one style side by side along a street, each some sixteen to nineteen metres from the
  // next: with the draws of neighbours set as far apart as can be, hardly ever the same front twice running.
  // (Whether the map has them as one block or each as a building of its own makes no difference.)
  const east = 1 / (111320 * Math.cos((25 * Math.PI) / 180));
  for (const style of ['modern', 'stone', 'plaster']) {
    let at = 0;
    const row = Array.from({ length: 40 }, (_, n) => {
      at += 16 + (n % 4);
      return houseOf(500 + n, 14, 13, { at: [origin.lng + at * east, origin.lat], style, paint: '#d9d4c8' });
    });
    const names = row.map((house) => KIT.fronts[frontOfHouse(house)].name);
    let twins = 0;
    for (let n = 1; n < names.length; n += 1) if (names[n] === names[n - 1]) twins += 1;
    assert.ok(twins <= 3 && new Set(names).size >= 3, `${style}: ${twins} twins: ${names.join(' ')}`);
    // The same street every time; the other side of it has its own run of fronts.
    assert.deepEqual(row.map((house) => frontOfHouse(house)), row.map((house) => frontOfHouse({ ...house })));
    const across = row.map((house) => KIT.fronts[frontOfHouse({ ...house, at: [house.at[0], house.at[1] + 40 / 111320] })].name);
    assert.notDeepEqual(across, names);
  }
});

test('what a front has besides its windows: lamps, closed shutters, battlements, a face drawn out a little', () => {
  const only = (name) => ({ ...KIT, fronts: KIT.fronts.filter((front) => front.name === name) });
  const night = (mesh) => {
    const count = { lamps: 0, lit: 0 };
    for (let i = 3; i < mesh.tints.length; i += 4) {
      if (mesh.tints[i] === 255) count.lamps += 1;
      else if (mesh.tints[i] >= 128) count.lit += 1;
    }
    return count;
  };
  // The Najdi front: its windows are closed shutters, never lit, though they are set in the other walls too;
  // its wall's lamps are lit, the one on a plain piece of wall every time that piece is laid; and its
  // battlements stand over the top of every wall of the house, all the way round.
  const najdi = KIT.fronts.find((front) => front.name === 'najdi');
  assert.ok(najdi.house.panes.length === 0 && najdi.house.dark.length >= 2 && najdi.house.crest && najdi.house.crest.rects.length >= 1);
  const [castle] = dressInFronts([houseOf(1, 26, 13)], origin, only('najdi'));
  assert.ok(night(castle).lit === 0 && night(castle).lamps >= 4 * 4, JSON.stringify(night(castle)));
  let [front, back, left, right] = [0, 0, 0, 0];
  for (let i = 0; i < castle.corners; i += 1) {
    const [east, north, up] = [castle.positions[i * 3], castle.positions[i * 3 + 1], castle.positions[i * 3 + 2]];
    if (up <= 9.6 + 0.05 || up > 10.4) continue;
    if (Math.abs(north) < 0.1) front += 1;
    if (near(north, 13, 0.01)) back += 1;
    if (near(east, 0, 0.01)) left += 1;
    if (near(east, 26, 0.01)) right += 1;
  }
  assert.ok(front > 8 && back > 40 && left > 20 && right > 20, [front, back, left, right].join(' '));
  // A front without battlements: nothing of the house's walls stands over their top.
  const [flat] = dressInFronts([houseOf(1, 26, 13)], origin, only('older'));
  for (let i = 0; i < flat.corners; i += 1) {
    const [east, north, up] = [flat.positions[i * 3], flat.positions[i * 3 + 1], flat.positions[i * 3 + 2]];
    if (Math.abs(north) < 0.1 || near(north, 13, 0.01) || near(east, 0, 0.01) || near(east, 26, 0.01)) assert.ok(up <= 9.6 + 1e-6, `${east} ${north} ${up}`);
  }
  // The limestone-and-white front has two lamps on its face and none on its wall: lit on every house.
  const stone = KIT.fronts.find((each) => each.name === 'stone');
  assert.ok(stone.wall.lamps.length === 0 && stone.house.lamps.length === 2);
  assert.equal(night(dressInFronts([houseOf(1, 14, 13)], origin, only('stone'))[0]).lamps, 2 * 4);
  // A house a little wider than a face: the face is drawn out to cover its wall. One much wider: the face
  // keeps its size, and what is left beside it is given windows.
  const spanOf = (wide) => {
    const [mesh] = dressInFronts([houseOf(1, wide, 13)], origin, only('stone'));
    let [from, until, beside] = [Infinity, -Infinity, 0];
    for (let i = 0; i < mesh.corners; i += 1) {
      const [east, north, up] = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
      if (!near(north, -0.06, 1e-4) || up < 3.5) continue;
      from = Math.min(from, east);
      until = Math.max(until, east);
    }
    return until - from;
  };
  const face = faceMeasure(stone);
  const own = face.wide * ((9.6 - stone.wall.height) / face.tall);
  assert.ok(near(spanOf(own * 1.08), own * 1.08 * 0.98, 0.02), `${spanOf(own * 1.08)} of ${own * 1.08}`);
  assert.ok(spanOf(own * 1.6) > own * 1.2 && spanOf(own * 1.6) < own * 1.6, `${spanOf(own * 1.6)} beside ${own}`);
});

test('a house the map has whole is dressed on its own outline', () => {
  // A house shaped like an L: 16 m along the street, 14 m deep, a yard cut out of its back right corner.
  const ell = [[0, 0], [16, 0], [16, 8], [9, 8], [9, 14], [0, 14]];
  const whole = (more = {}) => ({ ...houseOf(301, 16, 14), parts: null, ring: ell, height: 8.2, ...more });
  // Its outline: anticlockwise, whichever way round the map gave it, no corner twice.
  assert.deepEqual(outlineOf(whole()), ell);
  assert.deepEqual(outlineOf(whole({ ring: [...ell].reverse().concat([[0, 14]]) })), ell);
  assert.equal(outlineOf(whole({ ring: [[0, 0], [1, 0]] })), null);
  // The wall its face goes on: the one on the street, the whole 16 m of it, as tall as the house and its parapet.
  const frontage = frontageOf(whole());
  assert.ok(frontage.wall === 0 && near(frontage.length, 16) && near(frontage.top, 9.6) && frontage.looks[1] === -1 && frontage.along[0] === 1);
  // (Of an outline that is turned a little from its street, still the wall that looks most to the street.)
  const turned = ell.map(([a, b]) => [a * Math.cos(0.2) - b * Math.sin(0.2), a * Math.sin(0.2) + b * Math.cos(0.2)]);
  assert.equal(frontageOf(whole({ ring: turned })).wall, 0);
  // Cut into triangles, an outline keeps its area: here 16 by 8 and 9 by 6. A corner on a straight side is no corner.
  const areaOf = (ring) => trianglesOf(ring).reduce((sum, [i, j, k]) => sum + ((ring[j][0] - ring[i][0]) * (ring[k][1] - ring[i][1]) - (ring[j][1] - ring[i][1]) * (ring[k][0] - ring[i][0])) / 2, 0);
  assert.ok(near(areaOf(ell), 16 * 8 + 9 * 6));
  assert.ok(near(areaOf([[0, 0], [8, 0], [16, 0], [16, 8], [9, 8], [9, 14], [0, 14]]), 16 * 8 + 9 * 6));

  const [mesh] = dressInFronts([whole()], origin);
  assert.ok(mesh.corners > 300 && mesh.corners < 4000 && mesh.indices.length === (mesh.corners / 4) * 6, `${mesh.corners} corners`);
  for (const value of mesh.positions) assert.ok(Number.isFinite(value));
  for (const value of mesh.uvs) assert.ok(value >= 0 && value <= 1);
  // Nothing of it outside its plot; nothing of the house itself in the yard that is cut out of it (over the
  // height of the plot's walls); its parapet at its own height, the roof's floor a parapet lower.
  const inYard = (east, north) => east > 9.3 && east < 15.9 && north > 8.3 && north < 13.9;
  let roof = 0;
  const heights = new Set();
  for (let i = 0; i < mesh.corners; i += 1) {
    const [east, north, up] = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
    assert.ok(east > -1.01 && east < 18.41 && north > -2.6 && north < 15.21 && up >= 0 && up < 14, `${east} ${north} ${up}`);
    if (up > 3.1) assert.ok(!inYard(east, north), `${east} ${north} ${up}`);
    heights.add(Math.round(up * 100) / 100);
  }
  assert.ok(heights.has(9.6) && heights.has(8.5) && heights.has(0));
  // The roof's floor fills the outline inside its parapet: 0.22 m in from every wall.
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((axis) => mesh.positions[mesh.indices[t + k] * 3 + axis]));
    if (near(a[2], 8.5, 1e-4) && near(b[2], 8.5, 1e-4) && near(c[2], 8.5, 1e-4)) roof += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  const floor = (16 - 0.44) * (8 - 0.44) + (9 - 0.44) * 6;
  assert.ok(near(roof, floor, 0.05), `${roof} of ${floor}`);
  // Everything is wound anticlockwise seen from outside: the way each face looks is the way it was told to.
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((axis) => mesh.positions[mesh.indices[t + k] * 3 + axis]));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const size = Math.hypot(...cross);
    if (size < 1e-9) continue;
    const told = [0, 1, 2].map((axis) => mesh.normals[mesh.indices[t] * 3 + axis]);
    assert.ok((cross[0] * told[0] + cross[1] * told[1] + cross[2] * told[2]) / size > 0.999);
  }
  // Its face is on its wall to the street (a hand's breadth before it), and nowhere else.
  let faced = 0;
  for (let i = 0; i < mesh.corners; i += 1) if (near(mesh.positions[i * 3 + 1], -0.06, 1e-4) && mesh.positions[i * 3 + 2] > 3.5) faced += 1;
  assert.ok(faced >= 8, String(faced));
  // The same house every time; and a house with neither parts nor an outline is left as it is.
  assert.deepEqual(dressInFronts([whole()], origin)[0].positions, mesh.positions);
  assert.deepEqual(dressInFronts([whole({ ring: null })], origin), []);
});

test('a roof is drawn in its own colour, where that is known', () => {
  // Not known: the kit's floor as it is. Known: brought to it, but never made black or burnt out.
  assert.deepEqual(roofTintOf(null, KIT.floorTone), [128, 128, 128]);
  assert.deepEqual(roofTintOf([210, 205, 201], [210 / 255, 205 / 255, 201 / 255]), [128, 128, 128]);
  const beige = roofTintOf([214, 196, 160], KIT.floorTone);
  assert.ok(beige[0] > beige[1] && beige[1] > beige[2] && beige[2] > 80);
  assert.deepEqual(roofTintOf([10, 10, 10], [0.8, 0.8, 0.8]), [70, 70, 70]);
  assert.deepEqual(roofTintOf([255, 255, 255], [0.5, 0.5, 0.5]), [159, 159, 159]);
  assert.ok(KIT.floorTone.length === 3 && KIT.floorTone.every((part) => part > 0.5 && part < 1));
  // On a house: the corners of its roof's floor carry that colour, and only they.
  const plain = dressInFronts([houseOf(1, 14, 13)], origin)[0];
  const tinted = dressInFronts([houseOf(1, 14, 13, { roof: [214, 196, 160] })], origin)[0];
  let changed = 0;
  for (let i = 0; i < plain.corners; i += 1) {
    const same = [0, 1, 2].every((k) => plain.tints[i * 4 + k] === tinted.tints[i * 4 + k]);
    if (same) continue;
    changed += 1;
    assert.ok(near(plain.positions[i * 3 + 2], 8.5, 1e-4));
    assert.deepEqual([...tinted.tints.subarray(i * 4, i * 4 + 3)], beige);
  }
  assert.equal(changed, 4);
  // A house is built once and kept: asked for again it comes out the same; from another origin, or with
  // another roof colour, it is built again.
  const house = houseOf(77, 14, 13);
  const first = dressInFronts([house], origin)[0];
  assert.deepEqual(dressInFronts([house], origin)[0], first);
  const moved = dressInFronts([house], { lng: origin.lng + 0.001, lat: origin.lat })[0];
  assert.ok(near(moved.positions[0] - first.positions[0], -0.001 * 111320 * Math.cos((origin.lat * Math.PI) / 180), 0.01));
  house.roof = [214, 196, 160];
  assert.notDeepEqual(dressInFronts([house], origin)[0].tints, first.tints);
  // Many houses: in as many meshes as their corners need, none of more corners than a mesh may have, every
  // face four corners and two triangles.
  const many = dressInFronts(Array.from({ length: 300 }, (_, n) => houseOf(1000 + n, 14, 13, { at: [origin.lng + n * 0.0002, origin.lat] })), origin);
  assert.ok(many.length >= 2);
  for (const mesh of many) {
    assert.ok(mesh.corners <= 65535 && mesh.corners % 4 === 0 && mesh.indices.length === (mesh.corners / 4) * 6);
    assert.ok(mesh.positions.length === mesh.corners * 3 && mesh.tints.length === mesh.corners * 4 && mesh.uvs.length === mesh.corners * 2);
    assert.deepEqual([...mesh.indices.subarray(6, 12)], [4, 5, 6, 4, 6, 7]);
  }
});
