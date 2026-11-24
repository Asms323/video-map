import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { FRONTS_PICTURE, chanceOf, dressInFronts, faceMeasure, frontFor, layStrip } from '../js/fronts.js';
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
  assert.deepEqual(KIT.size, [2048, 2048]);
  assert.ok(KIT.fronts.length >= 4);
  assert.equal(new Set(KIT.fronts.map((front) => front.name)).size, KIT.fronts.length);
  const inside = (box) => box[0] >= 0 && box[1] >= 0 && box[2] <= KIT.size[0] && box[3] <= KIT.size[1] && box[2] > box[0] && box[3] > box[1];
  for (const front of KIT.fronts) {
    // Its wall: between two and three and a half metres tall, with a gate that keeps its size and plain wall to lay.
    assert.ok(front.wall.height >= 2 && front.wall.height <= 3.5 && front.wall.perMetre > 20, front.name);
    assert.ok(near((front.wall.v[1] - front.wall.v[0]) / front.wall.perMetre, front.wall.height, 0.02), front.name);
    const kinds = front.wall.pieces.map((piece) => piece[2]);
    assert.ok(kinds.includes('fixed') && kinds.includes('plain') && kinds.every((kind) => ['fixed', 'plain', 'optional'].includes(kind)), front.name);
    for (const [from, until] of front.wall.pieces) assert.ok(until > from && inside([from, front.wall.v[0], until, front.wall.v[1]]), front.name);
    for (const lamp of front.wall.lamps) assert.ok(inside(lamp), front.name);
    // The face of its house: between five and eight metres of it show over the wall, seven to fourteen wide.
    const face = faceMeasure(front);
    assert.ok(face.tall > 4.5 && face.tall < 8.5 && face.wide > 7 && face.wide < 14.5, `${front.name}: ${face.wide.toFixed(1)} by ${face.tall.toFixed(1)}`);
    for (const rect of front.house.rects) assert.ok(inside(rect), front.name);
    for (const pane of front.house.panes) assert.ok(inside(pane) && pane[0] >= face.box[0] - 1 && pane[2] <= face.box[2] + 1, front.name);
    assert.ok(front.house.panes.length >= 3 && inside(front.house.plain) && front.house.plainPerMetre > 5, front.name);
    assert.ok(front.tone.length === 3 && front.tone.every((part) => part > 0.3 && part < 1), front.name);
  }
  for (const name of ['floor', 'paving', 'white', 'unit', 'dark']) assert.ok(inside(KIT.stuff[name]), name);
  const picture = new Uint8Array(readFileSync(new URL(`../models/${FRONTS_PICTURE}.jpg`, import.meta.url)));
  assert.ok(picture[0] === 0xff && picture[1] === 0xd8 && picture.length < 700000);
});

test('each house is given a front that fits it, near its own paint', () => {
  const chance = chanceOf(5);
  const named = (plotWide, faceWide, paint, id = 5) => KIT.fronts[frontFor(plotWide, faceWide, 9.6, paint, chanceOf(id))].name;
  const street = (plotWide, faceWide, paint) => {
    const count = {};
    for (let id = 1; id <= 200; id += 1) count[named(plotWide, faceWide, paint, id)] = (count[named(plotWide, faceWide, paint, id)] ?? 0) + 1;
    return count;
  };
  // Along a street of houses in one paint, every front comes up: no street is all one house.
  const beige = street(15, 12, '#d6c3a2');
  assert.ok(Object.keys(beige).length >= 4 && Object.values(beige).every((count) => count >= 12 && count <= 120), JSON.stringify(beige));
  // The paint leans the choice: of white houses, most are given the white front.
  const white = street(16, 14, '#f2f1ee');
  assert.ok(white.white > 90 && Object.keys(white).length >= 2, JSON.stringify(white));
  // A narrow house: never the grand front that would have to be made half its size.
  assert.equal(street(9.5, 7, '#dccdb2').limestone, undefined);
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
