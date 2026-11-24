import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNetwork, heightAlong, lightFrom, Mesh } from '../js/life.js';
import { drawRoadside, medianPalms } from '../js/roadside.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180));
const NORTH = 1 / 111320;
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 3)]);
const NOON = lightFrom({ azimuth: 180, altitude: 50 });

test('drawRoadside: a concrete barrier down the middle of a great road, and green signs over a motorway', () => {
  // A motorway of two carriageways 24 m apart: eastbound along y = 0, westbound along y = 24.
  const network = buildNetwork([line('motorway', [[0, 0], [2600, 0]], { oneway: 1 }), line('motorway', [[2600, 24], [0, 24]], { oneway: 1 })], ORIGIN);
  const mesh = new Mesh();
  const made = drawRoadside(mesh, network, NOON);
  const width = network.ways[0].width;
  assert.ok(made.barriers > 5000 && made.kerbs === 0, JSON.stringify(made));
  const points = corners(mesh);
  // The barriers: 85 cm high, just beyond the edge of each carriageway on the side of its median (the
  // left of its traffic): north of the eastbound one, south of the westbound.
  // (Concrete is a warm grey; the steel of the gantries' posts a cold one.)
  const low = points.filter((point) => point[2] <= 0.85 + 1e-6 && point[3] >= point[5] && point[3] - point[5] < 30);
  const ys = [...new Set(low.map((point) => Math.round(point[1] * 100) / 100))].sort((a, b) => a - b);
  assert.deepEqual(ys, [width / 2 + 0.2, width / 2 + 0.76, 24 - width / 2 - 0.76, 24 - width / 2 - 0.2].map((y) => Math.round(y * 100) / 100), JSON.stringify(ys));
  assert.ok(Math.abs(Math.max(...low.map((point) => point[2])) - 0.85) < 1e-6);
  // The gantries: two or three to each carriageway of 2.6 km, 7.4 m tall, with boards of green.
  assert.ok(made.gantries >= 4 && made.gantries <= 6, `${made.gantries}`);
  const green = points.filter((point) => point[4] > point[3] * 2 && point[4] > point[5]);
  assert.ok(green.length >= made.gantries * 6 && green.every((point) => point[2] >= 4.5 - 1e-6 && point[2] <= 7.2 + 1e-6));
  assert.ok(Math.abs(Math.max(...points.map((point) => point[2])) - 7.4) < 1e-6);
  // The boards hang over their own carriageway.
  assert.ok(green.every((point) => Math.abs(point[1]) < width / 2 || Math.abs(point[1] - 24) < width / 2));
  // A two-way road has no median: nothing stands along it.
  assert.deepEqual(drawRoadside(mesh, buildNetwork([line('trunk', [[0, 0], [900, 0]])], ORIGIN), NOON), { barriers: 0, gantries: 0, kerbs: 0 });
  assert.equal(mesh.count, 0);
});

test('drawRoadside: the kerb of an avenue\'s median is painted yellow and black by turns', () => {
  const network = buildNetwork([line('primary', [[0, 0], [300, 0]], { oneway: 1 })], ORIGIN);
  const mesh = new Mesh();
  const made = drawRoadside(mesh, network, NOON);
  assert.ok(made.kerbs > 250 && made.barriers === 0 && made.gantries === 0);
  const points = corners(mesh);
  const width = network.ways[0].width;
  // On the left of the traffic, along the edge of the road, a hand high.
  assert.ok(points.every((point) => point[1] >= width / 2 - 1e-6 && point[1] <= width / 2 + 0.29 && point[2] <= 0.2 + 1e-6));
  const yellow = points.filter((point) => point[3] > point[5] + 60);
  const black = points.filter((point) => point[3] < 80);
  assert.ok(yellow.length > 0 && Math.abs(yellow.length - black.length) <= 18, `${yellow.length} yellow, ${black.length} black`);
  // Two metres of each: yellow from 12 to 14 m along, black from 14 to 16.
  assert.ok(yellow.some((point) => Math.abs(point[0] - 12) < 0.01) && yellow.some((point) => Math.abs(point[0] - 14) < 0.01) && !yellow.some((point) => point[0] > 14.01 && point[0] < 15.99));
});

test('medianPalms: a row of palms down the median of an avenue, and nowhere else', () => {
  // An avenue whose carriageways are 20 m apart, middle to middle; and a side street across it at x = 200.
  const lines = [line('primary', [[0, 0], [400, 0]], { oneway: 1 }), line('primary', [[400, 20], [0, 20]], { oneway: 1 }), line('minor', [[200, -60], [200, 80]])];
  const network = buildNetwork(lines, ORIGIN);
  const palms = medianPalms(network);
  assert.ok(palms.length >= 14 && palms.length <= 26, `${palms.length} palms`);
  for (const palm of palms) {
    assert.ok(palm.palm === true && palm.radius > 1.5 && palm.radius < 3.4);
    // Down the middle of the median, and not where the side street runs through it.
    assert.ok(Math.abs(palm.y - 10) < 0.6, `${palm.y}`);
    assert.ok(Math.abs(palm.x - 200) > 4.3, `${palm.x}`);
  }
  // One row, a palm every sixteen metres.
  const xs = palms.map((palm) => palm.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] - xs[i - 1] > 15.5, `${xs[i - 1]} then ${xs[i]}`);
  // No palms beside a carriageway that has no other across from it; none in a median too narrow; none
  // between two roads that run the same way; none along a two-way street.
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]], { oneway: 1 })], ORIGIN)).length, 0);
  const width = network.ways[0].width;
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]], { oneway: 1 }), line('primary', [[400, width + 2], [0, width + 2]], { oneway: 1 })], ORIGIN)).length, 0);
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]], { oneway: 1 }), line('primary', [[0, 20], [400, 20]], { oneway: 1 })], ORIGIN)).length, 0);
  assert.equal(medianPalms(buildNetwork([line('primary', [[0, 0], [400, 0]]), line('primary', [[400, 20], [0, 20]])], ORIGIN)).length, 0);
  // Nor where a building stands.
  assert.equal(medianPalms(network, { built: () => true }).length, 0);
});

test('drawRoadside: a slip road has neither barrier nor kerb, and where an avenue dives under a crossing its kerb goes down with it', () => {
  // A slip road of a motorway, and one of an avenue: one side of nothing.
  const slips = buildNetwork([line('motorway', [[0, 0], [400, 30]], { oneway: 1, ramp: true }), line('primary', [[0, 100], [400, 130]], { oneway: 1, ramp: true })], ORIGIN);
  assert.ok(slips.ways.every((way) => way.ramp && way.lanes === 2 && Math.abs(way.width - 6.8) < 1e-9));
  const mesh = new Mesh();
  assert.deepEqual(drawRoadside(mesh, slips, NOON), { barriers: 0, gantries: 0, kerbs: 0 });
  assert.equal(mesh.count, 0);
  // An avenue's carriageway into its underpass: the kerb of its median follows the road down to the tunnel's mouth.
  const avenue = buildNetwork([line('primary', [[0, 0], [600, 0]], { oneway: 1 }), line('primary', [[600, 0], [720, 0]], { oneway: 1, tunnel: true })], ORIGIN);
  const way = avenue.ways.find((one) => !one.hidden);
  const made = drawRoadside(mesh, avenue, NOON);
  assert.ok(made.kerbs > 500 && made.barriers === 0);
  const points = corners(mesh);
  const feet = points.filter((point) => point[0] > 560 && point[0] < 590);
  assert.ok(feet.length > 0 && feet.every((point) => point[2] < -5.5 && Math.abs(point[2] - heightAlong(way, point[0])) <= 0.2 + 0.3), 'down at the mouth');
  const up = points.filter((point) => point[0] < 400);
  assert.ok(up.length > 0 && up.every((point) => point[2] >= 0 && point[2] <= 0.2 + 1e-6), 'on the street before the dip');
});

test('drawFootbridges: a roofed walkway six metres over the road, on piers that keep off the carriageway, with a tower at each end', async () => {
  const { drawFootbridges } = await import('../js/roadside.js');
  // A motorway of two carriageways along y = 0 and y = 24, and a footbridge across both from y = -30 to y = 54,
  // which the map has in two lengths (it crosses the edge of a tile at y = 12).
  const network = buildNetwork([line('motorway', [[0, 0], [600, 0]], { oneway: 1 }), line('motorway', [[600, 24], [0, 24]], { oneway: 1 })], ORIGIN);
  const walk = (points) => ({ coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]) });
  const walks = [walk([[300, -30], [300, 12]]), walk([[300, 12], [300, 54]])];
  const mesh = new Mesh();
  const made = drawFootbridges(mesh, walks, network, ORIGIN, NOON);
  assert.equal(made.bridges, 2);
  assert.ok(Math.abs(made.metres - 84) < 0.01 && made.towers === 2 && made.piers >= 2, JSON.stringify(made));
  const points = corners(mesh);
  // The walkway: 3.4 m wide, its floor 5.9 m up, a roof 2.75 m over the floor (standing out 30 cm each side).
  const walkway = points.filter((point) => point[1] > -29 && point[1] < 53);
  const floor = walkway.filter((point) => Math.abs(point[2] - 5.9) < 1e-3);
  assert.ok(floor.length > 0 && floor.every((point) => Math.abs(point[0] - 300) <= 1.7 + 1e-3));
  assert.ok(Math.abs(Math.max(...walkway.map((point) => point[2])) - (5.9 + 2.75 + 0.16)) < 1e-3);
  assert.ok(walkway.filter((point) => point[2] > 8.6).every((point) => Math.abs(point[0] - 300) <= 2 + 1e-3));
  // Nothing of it comes lower than 5.35 m over a carriageway: no pier stands in one.
  const width = network.ways[0].width;
  const low = points.filter((point) => point[2] < 5.9 - 0.55 - 1e-3);
  assert.ok(low.length > 0 && low.every((point) => Math.abs(point[1]) > width / 2 + 0.8 && Math.abs(point[1] - 24) > width / 2 + 0.8), 'clear of both carriageways');
  // The piers stand on the ground: in the median, and beside the road.
  const feet = points.filter((point) => point[2] === 0 && point[1] > -29 && point[1] < 53);
  assert.ok(feet.length > 0 && feet.some((point) => point[1] > width / 2 && point[1] < 24 - width / 2), 'one in the median');
  // A tower at each end of the whole bridge, and none where its two lengths meet: beyond the end, taller than the roof.
  const towers = points.filter((point) => point[2] > 5.9 + 2.75 + 0.3);
  assert.ok(towers.length > 0 && towers.every((point) => point[1] <= -29.7 + 1e-3 || point[1] >= 53.7 - 1e-3));
  assert.ok(towers.some((point) => point[1] < -33) && towers.some((point) => point[1] > 57) && towers.every((point) => Math.abs(point[0] - 300) <= 2.7 + 1e-3));
  // The glazing is see-through; the rest is solid.
  const solid = Array.from({ length: mesh.count }, (_, i) => mesh.colours[i * 4 + 3]);
  assert.deepEqual([...new Set(solid)].sort((a, b) => a - b), [127, 255]);
  // No footbridges: nothing.
  assert.deepEqual(drawFootbridges(mesh, [], network, ORIGIN, NOON), { bridges: 0, metres: 0, towers: 0, piers: 0 });
  assert.equal(mesh.count, 0);
});

test('medianPalms: down the wide median of a great road the palms stand closer, two rows deep; a narrow one has none', () => {
  // King Fahd Road through Al Olaya: two carriageways with 12 m of median between them.
  const width = buildNetwork([line('motorway', [[0, 0], [10, 0]], { oneway: 1 })], ORIGIN).ways[0].width;
  const apart = width + 12;
  const network = buildNetwork([line('motorway', [[0, 0], [900, 0]], { oneway: 1 }), line('motorway', [[900, apart], [0, apart]], { oneway: 1 })], ORIGIN);
  const palms = medianPalms(network);
  assert.ok(palms.length > 150 && palms.every((palm) => palm.palm), `${palms.length}`);
  // Two rows, a fifth of the median's width either side of its middle: 2.4 m; nine metres from one palm to the next.
  const rows = [...new Set(palms.map((palm) => Math.round((palm.y - apart / 2) * 10) / 10))].sort((a, b) => a - b);
  assert.deepEqual(rows, [-2.4, 2.4]);
  const first = palms.filter((palm) => palm.y < apart / 2).map((palm) => palm.x).sort((a, b) => a - b);
  for (let i = 1; i < first.length; i += 1) assert.ok(Math.abs(first[i] - first[i - 1] - 9) < 0.01);
  // A ring road's carriageways stand close together with a barrier between: no room, no palms.
  const tight = buildNetwork([line('motorway', [[0, 0], [900, 0]], { oneway: 1 }), line('motorway', [[900, width + 2], [0, width + 2]], { oneway: 1 })], ORIGIN);
  assert.equal(medianPalms(tight).length, 0);
});

test('drawSigns: a speed limit on the right of each way a main road is driven, a stop sign where a side street comes out, and hoardings where there is room', async () => {
  const { drawSigns } = await import('../js/roadside.js');
  const everything = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 4)]);
  const isRed = (corner) => corner[3] > 110 && corner[4] < 45 && corner[5] < 45;
  // A main road east and west, two kilometres of it, and a side street that comes out into it from the south.
  const network = buildNetwork([line('primary', [[-1000, 0], [1000, 0]]), line('minor', [[200, -300], [200, 0]])], ORIGIN);
  const main = network.ways.find((way) => way.class === 'primary');
  const side = network.ways.find((way) => way.class === 'minor');
  const mesh = new Mesh();
  const lights = new Mesh();
  const made = drawSigns(mesh, lights, network, NOON);
  // The limits: several each way; those for the traffic heading east on the south side, facing west, and the other way about.
  assert.ok(made.limits >= 6 && made.limits <= 12, JSON.stringify(made));
  assert.equal(made.stops, 1);
  assert.equal(made.hoardings, 0, 'no hoarding where nobody has said what is built on');
  assert.equal(lights.count, 0);
  // (A sign: its post of four sides; a back and a front of eight sides; and on a limit its white and two figures, on a stop sign its word.)
  assert.equal(mesh.count, made.limits * (24 + 18 + 18 + 18 + 12) + made.stops * (24 + 18 + 18 + 6));
  const all = everything(mesh);
  const out = main.width / 2 + 0.8;
  const posts = all.filter((corner) => corner[2] === 0);
  assert.ok(posts.every((corner) => Math.abs(Math.abs(corner[1]) - out) < 0.1 || (Math.abs(corner[0] - 200) < side.width / 2 + 1 && corner[1] < 0)), 'every post stands just off the edge of its road');
  assert.ok(posts.some((corner) => corner[1] > 0) && posts.some((corner) => corner[1] < -out + 0.1 && Math.abs(corner[0] - 200) > 20), 'on both sides of the main road');
  // Nothing higher than a sign on its post, nothing under the ground.
  assert.ok(all.every((corner) => corner[2] >= 0 && corner[2] < 2.8));
  // The red of a limit beside the eastbound lanes is seen from the west: it stands out west of its post.
  const southRed = all.filter((corner) => isRed(corner) && corner[1] < 0 && Math.abs(corner[0] - 200) > 20);
  const southPosts = posts.filter((corner) => corner[1] < 0 && Math.abs(corner[0] - 200) > 20).map((corner) => corner[0]);
  assert.ok(southRed.length > 0 && southRed.every((corner) => southPosts.some((x) => corner[0] < x && x - corner[0] < 0.2)), 'faces the traffic that comes');
  // The stop sign: at the end of the side street, on the right of whoever drives out of it (the east side), a little before the edge of the main road.
  const stopRed = all.filter((corner) => isRed(corner) && Math.abs(corner[0] - 200) < 20 && corner[1] < -main.width / 2);
  assert.equal(stopRed.length, 18);
  assert.ok(stopRed.every((corner) => corner[0] > 200 && corner[1] < -main.width / 2 - 2 && corner[1] > -main.width / 2 - 3 && corner[2] > 1.9));
  // Neither on a slip road nor in a tunnel; and no stop sign where two side streets meet.
  const none = drawSigns(new Mesh(), null, buildNetwork([line('primary', [[-1000, 0], [1000, 0]], { ramp: true }), line('secondary', [[-1000, 60], [1000, 60]], { tunnel: true }), line('minor', [[0, 200], [300, 200]]), line('minor', [[150, 200], [150, 500]])], ORIGIN), NOON);
  assert.deepEqual(none, { limits: 0, stops: 0, hoardings: 0 });

  // Hoardings: beside a great road, every half kilometre or so, each on its post with a board across the way the road runs.
  const open = new Mesh();
  const glow = new Mesh();
  const free = drawSigns(open, glow, buildNetwork([line('trunk', [[-1500, 0], [1500, 0]], { oneway: 1 })], ORIGIN), NOON, { built: () => false });
  assert.ok(free.hoardings >= 4 && free.hoardings <= 7, JSON.stringify(free));
  const boards = everything(open).filter((corner) => corner[2] > 10);
  assert.ok(boards.length > 0 && boards.every((corner) => corner[2] <= 14.5 + 1e-6 && corner[1] < 0), 'on the right of its traffic, the board ten to fourteen metres up');
  const trunk = buildNetwork([line('trunk', [[-1500, 0], [1500, 0]], { oneway: 1 })], ORIGIN).ways[0];
  const reach = boards.map((corner) => -corner[1]);
  assert.ok(Math.min(...reach) > trunk.width / 2 + 0.5 && Math.max(...reach) < trunk.width / 2 + 11.5, 'clear of the carriageway');
  // (By night each is lit: both its faces, in its own colours.)
  assert.equal(glow.count, free.hoardings * 2 * 3 * 6);
  // None where a building stands, and none where another road runs alongside.
  assert.equal(drawSigns(new Mesh(), new Mesh(), buildNetwork([line('trunk', [[-1500, 0], [1500, 0]], { oneway: 1 })], ORIGIN), NOON, { built: () => true }).hoardings, 0);
  const beside = buildNetwork([line('trunk', [[-1500, 0], [1500, 0]], { oneway: 1 }), line('service', [[-1500, -13], [1500, -13]])], ORIGIN);
  assert.equal(drawSigns(new Mesh(), new Mesh(), beside, NOON, { built: () => false }).hoardings, 0);
  // Where a building is in the way at one spot, room is looked for a little further along the road.
  const blocked = (x) => Math.abs(((x % 540) + 540) % 540 - 270) > 200; // built on, but for a gap of some 130 m in every 540
  const shifted = drawSigns(new Mesh(), new Mesh(), buildNetwork([line('trunk', [[-1500, 0], [1500, 0]], { oneway: 1 })], ORIGIN), NOON, { built: (x) => blocked(x) });
  assert.ok(shifted.hoardings >= 1 && shifted.hoardings <= free.hoardings, JSON.stringify(shifted));
  // What stands along a road stands where it stood when the streets are read again with others among
  // them: its place goes by the road itself, not by where the road comes in the list.
  const highest = (mesh) => everything(mesh).filter((corner) => corner[2] > 14.4).map((corner) => `${Math.round(corner[0])},${Math.round(corner[1])}`).sort();
  const again = new Mesh();
  drawSigns(again, new Mesh(), buildNetwork([line('minor', [[-1500, 900], [1500, 900]]), line('minor', [[-1500, 1000], [1500, 1000]]), line('trunk', [[-1500, 0], [1500, 0]], { oneway: 1 })], ORIGIN), NOON, { built: () => false });
  assert.deepEqual(highest(again), highest(open));
  // And what is on them is no more than a few flat colours.
  const tones = new Set(everything(open).filter((corner) => corner[2] > 10.6 && corner[2] < 14.2).map((corner) => `${corner[3] >> 4},${corner[4] >> 4},${corner[5] >> 4}`));
  assert.ok(tones.size >= 3 && tones.size < 60);
});
