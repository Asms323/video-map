import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Model, ModelMesh, NO_LINE, OWN_NUMBERS, cutMesh } from '../js/models.js';
import { facesOf } from './model-faces.mjs';

const near = (a, b, by = 1e-4) => Math.abs(a - b) <= by;
const areaOf = ([a, b, c]) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
};

test('a facet is one flat triangle that knows which way it looks, where on its face each corner lies and how far it is from each edge', () => {
  const mesh = new ModelMesh(3);
  const model = new Model(mesh);
  // A wall 6 m long and 8 m high, facing south: its corners run anticlockwise seen from the south.
  const glass = { kind: 'glass', colour: '#34504d', storey: 4, bay: 3, light: '#a428f5', glow: 0.8, lit: 0.5, fins: 1, ridge: 1 };
  model.facet([0, 0, 0], [6, 0, 0], [6, 0, 8], glass);
  assert.equal(mesh.count, 3);
  assert.equal(mesh.faces, 1);
  const [face] = facesOf(mesh);
  assert.deepEqual(face.normal.map((n) => Math.round(n) + 0), [0, -1, 0], 'it looks south');
  assert.deepEqual(face.corners, [[0, 0, 0], [6, 0, 0], [6, 0, 8]]);
  // Along the face (east, for a wall that looks south) and up from the ground; the storey and the bay.
  assert.deepEqual(face.along, [0, 6, 6]);
  assert.deepEqual(face.up, [0, 0, 8]);
  assert.equal(face.storey, 4);
  assert.equal(face.bay, 3);
  // How far each corner is from the three edges: nothing from the two it lies on, and from the third as
  // far as the triangle is high over that edge. (From a to b, b to c, c to a.)
  assert.ok(near(face.edges[0][0], 0) && near(face.edges[0][1], 6) && near(face.edges[0][2], 0));
  assert.ok(near(face.edges[1][0], 0) && near(face.edges[1][1], 0) && near(face.edges[1][2], 4.8), JSON.stringify(face.edges[1]));
  assert.ok(near(face.edges[2][0], 8) && near(face.edges[2][1], 0) && near(face.edges[2][2], 0));
  assert.equal(face.kind, 'glass');
  assert.equal(face.colour, '#34504d');
  assert.equal(face.light, '#a428f5');
  assert.ok(near(face.glow, 0.8, 0.003) && near(face.lit, 0.5, 0.003) && face.fins === 1 && face.ridge === 1 && !face.open);

  // The other way round it looks north; unless it is told which way is out.
  model.facet([0, 0, 0], [6, 0, 8], [6, 0, 0], glass);
  model.facet([0, 0, 0], [6, 0, 8], [6, 0, 0], glass, { out: [0.2, -1, 0.1] });
  const [, north, south] = facesOf(mesh);
  assert.deepEqual(north.normal.map((n) => Math.round(n) + 0), [0, 1, 0]);
  assert.deepEqual(south.normal.map((n) => Math.round(n) + 0), [0, -1, 0]);
  assert.deepEqual(south.corners, [[0, 0, 0], [6, 0, 0], [6, 0, 8]], 'its corners are put the other way round');
  assert.equal(mesh.count, 9, 'the mesh made room');
  // No two faces have the same number of their own, one after the other.
  assert.notEqual(north.own, south.own);
  assert.ok([face, north, south].every((one) => one.own >= 0 && one.own < OWN_NUMBERS));

  // An edge along which no line is to be drawn is told apart by being far from every corner.
  mesh.clear();
  model.facet([0, 0, 0], [6, 0, 0], [6, 0, 8], glass, { lines: [true, false, true], out: [0, 1, 0] });
  const [turned] = facesOf(mesh);
  // (Turned round to look north, its corners are a, c, b: the edge from b to c is now the second still.)
  assert.deepEqual(turned.corners, [[0, 0, 0], [6, 0, 8], [6, 0, 0]]);
  assert.ok(turned.edges.every((edges) => edges[1] >= NO_LINE && edges[0] < 100 && edges[2] < 100), JSON.stringify(turned.edges));
  // Three corners in one line make no face.
  model.facet([0, 0, 0], [1, 1, 1], [2, 2, 2], glass);
  assert.equal(mesh.count, 3);

  // Plain stuff and lamps; a face that takes no shadow; bays counted along a given line from a given place.
  mesh.clear();
  model.facet([0, 0, 5], [4, 0, 5], [0, 4, 5], { kind: 'plain', colour: '#3a4858', open: true }, { along: [0, 2], from: [0, 1] });
  model.facet([0, 0, 5], [4, 0, 5], [0, 4, 5], { kind: 'lamp', colour: '#ffffff', light: '#ffe9c8' });
  const [deck, lamp] = facesOf(mesh);
  assert.deepEqual(deck.normal.map((n) => n + 0), [0, 0, 1]);
  assert.ok(deck.kind === 'plain' && deck.open && deck.glow === 0 && deck.lit === 0);
  assert.deepEqual(deck.along, [-1, -1, 3], 'north of a place one metre north');
  assert.ok(lamp.kind === 'lamp' && lamp.glow === 1 && lamp.light === '#ffe9c8');
});

test('a model stands where it is put, turned as it is turned', () => {
  const mesh = new ModelMesh();
  // Turned a quarter of a turn clockwise: its own north points east.
  const model = new Model(mesh, { east: 100, north: -50, turn: 90 });
  model.facet([0, 0, 0], [0, 10, 0], [0, 10, 6], { kind: 'plain', colour: '#808080' }, { out: [-1, 0, 0] });
  const [face] = facesOf(mesh);
  for (const [corner, wanted] of face.corners.map((corner, i) => [corner, [[100, -50, 0], [110, -50, 6], [110, -50, 0]][i]])) {
    assert.ok(corner.every((value, k) => near(value, wanted[k], 1e-3)), JSON.stringify(face.corners));
  }
  // What looked west now looks north.
  assert.ok(near(face.normal[0], 0) && near(face.normal[1], 1) && near(face.normal[2], 0), JSON.stringify(face.normal));
  // Its place on its own face is still measured in its own metres.
  assert.deepEqual(face.up, [0, 6, 0]);
});

test('a quad is two triangles; a line runs along the one they share only where the face is folded there', () => {
  const mesh = new ModelMesh();
  const model = new Model(mesh);
  const stuff = { kind: 'glass', colour: '#34504d', storey: 4, bay: 3, ridge: 1 };
  model.quad([0, 0, 0], [10, 0, 0], [10, 0, 20], [0, 0, 20], stuff);
  let [first, second] = facesOf(mesh);
  assert.equal(mesh.count, 6);
  assert.ok(near(areaOf(first.corners) + areaOf(second.corners), 200));
  // The line from a to c is the third edge of the first triangle and the first of the second.
  assert.ok(first.edges.every((edges) => edges[2] >= NO_LINE && edges[0] < 100 && edges[1] < 100));
  assert.ok(second.edges.every((edges) => edges[0] >= NO_LINE && edges[1] < 100 && edges[2] < 100));
  assert.equal(first.own, second.own, 'one face, one number');
  mesh.clear();
  model.quad([0, 0, 0], [10, 0, 0], [10, 3, 20], [0, 0, 20], stuff, { fold: true, lines: [true, false, true, false] });
  [first, second] = facesOf(mesh);
  assert.ok(first.edges.every((edges) => edges[2] < 100 && edges[1] >= NO_LINE));
  assert.ok(second.edges.every((edges) => edges[0] < 100 && edges[2] >= NO_LINE));
  assert.notEqual(first.own, second.own, 'two faces that meet in a fold');
  assert.ok(Math.abs(first.normal[0] - second.normal[0]) + Math.abs(first.normal[1] - second.normal[1]) > 0.05, 'they look different ways');
});

test('a flat shape of any outline is cut into triangles, with a line along its outline only', () => {
  const mesh = new ModelMesh();
  const model = new Model(mesh);
  // An L, 10 by 10 with a 6 by 6 corner missing, 30 m up; and a hole 1 m square in it.
  const outline = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]].map(([x, y]) => [x, y, 30]);
  const hole = [[1, 1], [2, 1], [2, 2], [1, 2]].map(([x, y]) => [x, y, 30]);
  model.flat(outline, { kind: 'plain', colour: '#cfd5d8', ridge: 1 }, { holes: [hole] });
  const faces = facesOf(mesh);
  assert.ok(near(faces.reduce((sum, face) => sum + areaOf(face.corners), 0), 64 - 1, 1e-3));
  assert.ok(faces.every((face) => face.normal[2] === 1 && face.corners.every((corner) => corner[2] === 30)), 'it looks up');
  assert.equal(new Set(faces.map((face) => face.own)).size, 1);
  // Every edge that carries a line lies on the outline or round the hole.
  const onOutline = (a, b) => [outline, hole].some((ring) => ring.some((from, i) => {
    const to = ring[(i + 1) % ring.length];
    const d = [to[0] - from[0], to[1] - from[1]];
    const off = (p) => Math.abs((p[0] - from[0]) * d[1] - (p[1] - from[1]) * d[0]) / Math.hypot(...d);
    return off(a) < 1e-6 && off(b) < 1e-6;
  }));
  let lined = 0;
  for (const face of faces) {
    for (let e = 0; e < 3; e += 1) {
      const drawn = face.edges.every((edges) => edges[e] < NO_LINE);
      assert.equal(drawn, onOutline(face.corners[e], face.corners[(e + 1) % 3]), JSON.stringify([face.corners[e], face.corners[(e + 1) % 3]]));
      if (drawn) lined += 1;
    }
  }
  assert.equal(lined, 10);
  // Turned over, it looks down.
  mesh.clear();
  model.flat(outline, { kind: 'plain', colour: '#cfd5d8' }, { out: [0, 0, -1] });
  assert.ok(facesOf(mesh).every((face) => face.normal[2] === -1));
});

test('between given heights a face can be of other stuff: it is cut there, and nothing else about it changes', () => {
  const mesh = new ModelMesh();
  const model = new Model(mesh);
  const glass = { kind: 'glass', colour: '#34504d', storey: 4, bay: 3, lit: 0.5, ridge: 1 };
  const bright = { ...glass, lit: 1 };
  const corners = [[0, 0, 0], [12, 0, 0], [8, 2, 60]];
  model.facet(...corners, glass, { bands: [{ from: 20, to: 28, stuff: bright }, { from: 40, to: 44, stuff: bright }] });
  const faces = facesOf(mesh);
  assert.equal(mesh.faces, 1, 'still one face');
  assert.ok(faces.length > 5);
  assert.ok(near(faces.reduce((sum, face) => sum + areaOf(face.corners), 0), areaOf(corners), 1e-3), 'nothing lost, nothing twice');
  for (const face of faces) {
    const heights = face.corners.map((corner) => corner[2]);
    const middle = (Math.min(...heights) + Math.max(...heights)) / 2;
    const inBand = (middle > 20 && middle < 28) || (middle > 40 && middle < 44);
    assert.equal(face.lit, inBand ? 1 : near(face.lit, 0.5, 0.003) ? face.lit : -1, `at ${middle} m`);
    // No piece crosses the foot or the top of a band.
    for (const cut of [20, 28, 40, 44]) assert.ok(Math.max(...heights) <= cut + 1e-4 || Math.min(...heights) >= cut - 1e-4);
    // Same face: same way of looking, same number.
    assert.deepEqual(face.normal, faces[0].normal);
    assert.equal(face.own, faces[0].own);
    // A corner on an edge of the whole face is still nothing from that edge; a corner made by a cut inside
    // it is as far from the edges as it really is.
    face.corners.forEach((corner, k) => {
      const offBase = corner[2] === 0 ? 0 : null;
      if (offBase === 0) assert.ok(near(face.edges[k][0], 0, 1e-3));
      assert.ok(face.edges[k].every((far) => far >= -1e-6 && far < 100));
    });
  }
  // The cuts are level lines, so the lines of the floors run on across them.
  assert.ok(faces.every((face) => face.corners.every((corner, k) => corner[2] === face.up[k])));
});

test('cutMesh: where a level plane cuts a model', () => {
  const mesh = new ModelMesh();
  const model = new Model(mesh, { east: 5, north: 5 });
  // A box 10 m square and 20 m high.
  const square = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
  square.forEach((from, i) => {
    const to = square[(i + 1) % 4];
    model.quad([...from, 0], [...to, 0], [...to, 20], [...from, 20], { kind: 'plain', colour: '#808080' });
  });
  const pieces = cutMesh(mesh, 10);
  assert.equal(pieces.length, 8, 'two triangles to a wall');
  assert.ok(near(pieces.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0), 40, 1e-3));
  assert.ok(pieces.flat().every(([x, y]) => x >= -1e-6 && x <= 10 + 1e-6 && y >= -1e-6 && y <= 10 + 1e-6));
  assert.equal(cutMesh(mesh, 25).length, 0);
  assert.equal(cutMesh(mesh, 10, (corner) => corner < 6).length, 2, 'only the first wall');
});
