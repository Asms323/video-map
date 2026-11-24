import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Model, ModelMesh } from '../js/models.js';
import { ballProfile, beam, block, disc, frame, lathe, panes, prism, sweptRoof, taper } from '../js/solids.js';
import { facesOf } from './model-faces.mjs';

const STONE = { kind: 'plain', colour: '#c0b090' };
const LAMP = { kind: 'lamp', colour: '#806040', light: '#ffcc88', glow: 1 };
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
/** What a solid is made of once built: its triangles. */
const made = (build) => {
  const mesh = new ModelMesh();
  build(new Model(mesh));
  return facesOf(mesh);
};
/** Whether every face of a closed solid looks away from a point inside it. */
const outward = (faces, [x, y, z]) => faces.every((face) => face.normal[0] * (face.corners[0][0] - x) + face.normal[1] * (face.corners[0][1] - y) + face.normal[2] * (face.corners[0][2] - z) > -1e-6);

test('a frame puts a place along, across and up where it should, however it is turned', () => {
  const plain = frame();
  assert.deepEqual(plain(3, 4, 5), [3, 4, 5]);
  // Turned a quarter anticlockwise at [10, 20], lifted 2: its own "along" runs north.
  const turned = frame([10, 20], Math.PI / 2, 2);
  const [east, north, up] = turned(3, 1, 5);
  assert.ok(near(east, 9) && near(north, 23) && near(up, 7));
  const way = turned.way(1, 0, 0);
  assert.ok(near(way[0], 0) && near(way[1], 1) && way[2] === 0);
  // A frame within it is measured in its own way, and turned with it.
  const inner = turned.sub([3, 1], Math.PI / 2, 1);
  const [e2, n2, u2] = inner(1, 0, 0);
  assert.ok(near(e2, 8) && near(n2, 23) && near(u2, 3));
});

test('a block and a taper are closed, and every face looks outward', () => {
  const box = made((model) => block(model, frame(), [-2, 2, -1, 1], 0, 3, STONE));
  assert.equal(box.length, 10); // four walls and a roof, two triangles each
  assert.ok(outward(box, [0, 0, 1.5]));
  assert.ok(box.every((face) => face.kind === 'plain' && face.colour === '#c0b090'));
  // A side may be of other stuff, or left out; so may the roof.
  const open = made((model) => block(model, frame(), [-2, 2, -1, 1], 0, 3, STONE, { top: null, faces: { south: LAMP, north: null } }));
  assert.equal(open.length, 6);
  assert.equal(open.filter((face) => face.kind === 'lamp' && near(face.normal[1], -1)).length, 2);
  // A taper to a point is a pyramid: four leaning sides, no top; its tip where it was put.
  const spire = made((model) => taper(model, frame([5, 5]), [-2, 2, -2, 2], [0, 0, 0, 0], 1, 6, STONE));
  assert.ok(outward(spire, [5, 5, 2]));
  assert.ok(spire.every((face) => face.normal[2] > 0.3 && face.normal[2] < 0.5));
  assert.ok(near(Math.max(...spire.flatMap((face) => face.corners.map((corner) => corner[2]))), 6));
  // A taper to a smaller rectangle has a top.
  assert.ok(made((model) => taper(model, frame(), [-2, 2, -2, 2], [-1, 1, -1, 1], 0, 2, STONE)).some((face) => near(face.normal[2], 1)));
});

test('a prism stands over any outline, whichever way round it is given', () => {
  const ring = [[0, 0], [4, 0], [4, 3], [2, 5], [0, 3]];
  for (const outline of [ring, [...ring].reverse()]) {
    const faces = made((model) => prism(model, frame(), outline, 0, 2, STONE));
    assert.ok(outward(faces, [2, 2, 1]));
    assert.equal(faces.filter((face) => near(face.normal[2], 1)).length, 3); // a lid of five corners
    assert.equal(faces.filter((face) => near(face.normal[2], 0)).length, 10);
  }
});

test('a lathe turns a profile into a round thing, lit as a curve', () => {
  // A ball: every corner on it, every face looking away from its middle.
  const ball = made((model) => lathe(model, frame(), [0, 0], ballProfile(5, 10, { rings: 8 }), STONE, { cuts: 12 }));
  assert.ok(ball.length > 150);
  assert.ok(ball.every((face) => face.corners.every(([x, y, z]) => near(Math.hypot(x, y, z - 10), 5, 1e-4))));
  assert.ok(outward(ball, [0, 0, 10]));
  // (Lit as the ball is: at a corner the light falls as on the ball there, not as on the flat piece.)
  for (const face of ball) {
    face.corners.forEach(([x, y, z], k) => {
      const [nx, ny, nz] = face.normals[k];
      if (Math.hypot(x, y) > 0.5) assert.ok(nx * x + ny * y + nz * (z - 10) > 4.2, `${nx}, ${ny}, ${nz} at ${x}, ${y}, ${z}`);
    });
  }
  // Part of a ball: a dome, from its top down to its middle.
  const dome = ballProfile(5, 0, { rings: 4, until: Math.PI / 2 });
  assert.ok(near(dome[0][0], 5) && near(dome[0][1], 0) && near(dome.at(-1)[0], 0) && near(dome.at(-1)[1], 5));
  // Stuff may be chosen piece by piece, and a piece left out; a part of the way round is an arc.
  const striped = made((model) => lathe(model, frame(), [0, 0], [[2, 0], [2, 1], [2, 2]], (i, k) => (k % 2 ? null : i ? LAMP : STONE), { cuts: 8, smooth: false, sweep: Math.PI }));
  assert.equal(striped.length, 4 * 2 * 2);
  assert.ok(striped.every((face) => face.corners.every(([, y]) => y > -1e-6)));
});

test('a beam joins two places, and never goes into the ground', () => {
  const faces = made((model) => beam(model, [0, 0, 2], [10, 0, 2], 1, STONE, { ends: true }));
  assert.equal(faces.length, 12);
  assert.ok(outward(faces, [5, 0, 2]));
  const corners = faces.flatMap((face) => face.corners);
  assert.ok(near(Math.min(...corners.map((c) => c[2])), 1.5) && near(Math.max(...corners.map((c) => c[2])), 2.5));
  // A leg standing aslant on the ground is cut off level at its foot.
  const leg = made((model) => beam(model, [0, 0, 0], [4, 0, 10], 1, STONE));
  assert.equal(Math.min(...leg.flatMap((face) => face.corners.map((corner) => corner[2]))), 0);
  // No beam between a place and itself.
  assert.equal(made((model) => beam(model, [1, 1, 1], [1, 1, 1], 1, STONE)).length, 0);
});

test('a swept roof comes down to its eaves and turns up at its corners', () => {
  const faces = made((model) => sweptRoof(model, frame(), [8, 6], [3, 0.3], 5, 4, STONE, { power: 1.7, lift: 1.5, steps: 4, cols: 6, under: LAMP, wall: [6, 4] }));
  const corners = faces.filter((face) => face.kind === 'plain').flatMap((face) => face.corners);
  // From the eaves at 5 m to the ridge at 9; the corners of the eaves 1.5 m higher than their middles.
  assert.ok(near(Math.max(...corners.map((c) => c[2])), 9));
  const eaves = corners.filter(([x, y]) => near(Math.max(Math.abs(x) / 8, Math.abs(y) / 6), 1, 1e-6));
  assert.ok(near(Math.min(...eaves.map((c) => c[2])), 5) && near(Math.max(...eaves.map((c) => c[2])), 6.5));
  // Hollow: half way in it has risen much less than half way up.
  assert.ok(faces.filter((face) => face.kind === 'plain').every((face) => face.normal[2] > 0));
  // Its underside looks down, from the wall out to the eaves.
  const under = faces.filter((face) => face.kind === 'lamp');
  assert.ok(under.length === 8 && under.every((face) => near(face.normal[2], -1) && face.corners.every((corner) => near(corner[2], 5))));
});

test('panes are set in a wall, a little proud of it; a disc stands upright and shows both ways', () => {
  const rect = [-5, 5, -3, 3];
  const south = made((model) => panes(model, frame(), rect, 'south', [[1, 3], [4, 6]], 4, LAMP));
  assert.equal(south.length, 2 * 4 * 2);
  assert.ok(south.every((face) => near(face.normal[1], -1) && face.corners.every(([x, y, z]) => near(y, -3.08) && Math.abs(x) <= 4.2 + 1e-6 && z >= 1 && z <= 6)));
  // Each side looks its own way; stuff may be chosen pane by pane.
  for (const [side, normal] of [['east', [1, 0]], ['north', [0, 1]], ['west', [-1, 0]]]) {
    const faces = made((model) => panes(model, frame(), rect, side, [[1, 3]], 3, (row, bay) => (bay === 1 ? null : LAMP)));
    assert.equal(faces.length, 4);
    assert.ok(faces.every((face) => near(face.normal[0], normal[0]) && near(face.normal[1], normal[1])));
  }
  // A wall too short for its margins has none.
  assert.equal(made((model) => panes(model, frame(), [-0.5, 0.5, -3, 3], 'south', [[1, 3]], 2, LAMP)).length, 0);
  // A disc of three upright bands, 2 m in radius, 10 m up, looking east: seen from east and from west.
  const bands = [[0, 1 / 3, LAMP], [1 / 3, 2 / 3, STONE], [2 / 3, 1, LAMP]];
  const faces = made((model) => disc(model, [0, 0, 10], 2, 0, bands));
  assert.ok(faces.some((face) => near(face.normal[0], 1)) && faces.some((face) => near(face.normal[0], -1)));
  assert.ok(faces.every((face) => face.corners.every(([x, y, z]) => Math.abs(x) < 0.2 && Math.hypot(y, z - 10) <= 2 + 1e-6)));
  const area = faces.filter((face) => face.normal[0] > 0).reduce((sum, face) => {
    const [a, b, c] = face.corners;
    return sum + Math.abs((b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])) / 2;
  }, 0);
  assert.ok(area > Math.PI * 4 * 0.95 && area <= Math.PI * 4, `${area}`);
});
