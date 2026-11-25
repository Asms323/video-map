import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landmarkBeacons, LANDMARKS } from '../js/landmarks.js';
import { LAMP_LIGHT } from '../js/lib.js';
import { buildNetwork, drawRoofs, lightFrom, Mesh, Traffic, VEHICLES } from '../js/life.js';
import { drawBeacons, drawLamps, drawRoofLights, drawTrafficLights, LAMPS, shopSpill, vehicleLights } from '../js/lights.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180)); // degrees of longitude in a metre
const NORTH = 1 / 111320;
/** A line through points given in metres east and north of the origin. */
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const ring = (points) => [...points, points[0]].map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]);
const NOON = lightFrom({ azimuth: 180, altitude: 50 });

/** The corners of a mesh as [x, y, z, red, green, blue, alpha]. */
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 4)]);
/**
 * Where the lamps of a mesh of posts stand: [{ x, y, foot, top }]. (A post
 * is four upright faces of six corners each, one after the other; then come
 * its arm and its head, which lie flat.)
 */
function postsOf(mesh) {
  const upright = [];
  const all = corners(mesh);
  for (let i = 0; i < all.length; i += 6) {
    const face = all.slice(i, i + 6);
    const zs = face.map((corner) => corner[2]);
    if (Math.max(...zs) - Math.min(...zs) < 3) continue;
    upright.push({ x: face.reduce((sum, corner) => sum + corner[0], 0) / 6, y: face.reduce((sum, corner) => sum + corner[1], 0) / 6, foot: Math.min(...zs), top: Math.max(...zs) });
  }
  assert.equal(upright.length % 4, 0, 'a post has four sides');
  const posts = [];
  for (let i = 0; i < upright.length; i += 4) {
    const sides = upright.slice(i, i + 4);
    const post = { x: sides.reduce((sum, side) => sum + side.x, 0) / 4, y: sides.reduce((sum, side) => sum + side.y, 0) / 4, foot: sides[0].foot, top: sides[0].top };
    assert.ok(sides.every((side) => Math.hypot(side.x - post.x, side.y - post.y) < 0.3 && side.foot === post.foot && side.top === post.top), 'the four sides of one post stand together');
    posts.push(post);
  }
  return posts;
}

test('a mesh can hold corners of light, which are added to what lies behind them and cover nothing', () => {
  const mesh = new Mesh();
  mesh.room(2);
  mesh.glow(1, 2, 3, 255, 200, 100, 0.5);
  mesh.glow(4, 5, 6, 255, 200, 100, 2);
  const [half, over] = corners(mesh);
  assert.deepEqual(half, [1, 2, 3, 127, 100, 50, 0]);
  assert.deepEqual(over, [4, 5, 6, 255, 255, 200, 0], 'no brighter than bright');
  // An ordinary corner is as solid as it is told; a corner of light is not solid at all.
  mesh.room(1);
  mesh.corner(0, 0, 0, 255, 200, 100, 0.5);
  assert.equal(corners(mesh)[2][6], 127);
});

test('street lamps stand along the roads by rule: how far apart, how tall and on which side goes by the kind of road', () => {
  const lines = [
    line('minor', [[0, 0], [300, 0]], { width: 7 }), // a residential street, two-way
    line('tertiary', [[0, 200], [300, 200]], { width: 9.5 }), // a wider two-way street
    line('primary', [[0, 400], [400, 400]], { width: 12, oneway: 1 }), // one carriageway of a main road, running east
    line('primary', [[400, 440], [0, 440]], { width: 12, oneway: 1 }), // and the other, running west, 40 m north of it
    line('motorway', [[0, 700], [420, 700]], { width: 14, oneway: -1 }), // drawn eastwards, driven westwards
    line('service', [[0, 850], [200, 850]], { width: 4, service: 'parking_aisle' }), // the lane of a car park
    line('service', [[0, 1000], [200, 1000]], { width: 4, service: 'driveway' }), // a driveway has none
    line('service', [[0, 1100], [200, 1100]], { width: 4 }), // nor has any other service lane
    line('transit', [[0, 1200], [300, 1200]]), // nor a railway
    line('minor', [[0, 1300], [300, 1300]], { width: 7, tunnel: true }), // nor a tunnel
    line('minor', [[0, 1400], [12, 1400]], { width: 7 }), // nor a stub of a street
    line('minor', [[0, 1600], [300, 1600]], { width: 7 }), // a street a mile off
  ];
  const network = buildNetwork(lines, ORIGIN);
  const posts = new Mesh();
  const glow = new Mesh();
  const made = drawLamps(posts, glow, network, NOON);
  const stood = postsOf(posts);
  assert.equal(made.lamps, stood.length);
  const along = (y, reach = 12) => stood.filter((post) => Math.abs(post.y - y) < reach).sort((a, b) => a.x - b.x);

  // The residential street: a lamp every 30 m or so, all down one side (its right), 8 m tall, behind the kerb.
  const minor = along(0);
  assert.equal(minor.length, Math.round((300 - 14) / LAMPS.minor.every));
  assert.ok(minor.every((post) => Math.abs(post.y - -(3.5 + 0.6)) < 0.01), JSON.stringify(minor.map((post) => post.y)));
  assert.ok(minor.every((post) => post.foot === 0 && post.top === 8));
  for (let i = 1; i < minor.length; i += 1) assert.ok(Math.abs(minor[i].x - minor[i - 1].x - 286 / minor.length) < 0.01, 'evenly spaced');
  assert.ok(minor[0].x > 7 && minor.at(-1).x < 293, 'none in the junction at either end');
  // The wider street: by turns on either side.
  const tertiary = along(200);
  assert.equal(tertiary.length, Math.round(286 / LAMPS.tertiary.every));
  assert.deepEqual(tertiary.map((post) => Math.sign(post.y - 200)), tertiary.map((_, i) => (i % 2 === 0 ? -1 : 1)));
  assert.ok(tertiary.every((post) => post.top === 9));
  // The main road's two carriageways: each has its lamps along the median, the left of its traffic, so
  // the two rows stand between the carriageways.
  const eastbound = along(400);
  const westbound = along(440);
  assert.ok(eastbound.length === Math.round(386 / LAMPS.primary.every) && westbound.length === eastbound.length);
  assert.ok(eastbound.every((post) => Math.abs(post.y - (400 + 6.6)) < 0.01) && westbound.every((post) => Math.abs(post.y - (440 - 6.6)) < 0.01));
  assert.ok(eastbound.every((post) => post.top === 11));
  // The motorway, drawn eastwards but driven westwards: the left of its traffic is to the south.
  const motorway = along(700);
  assert.equal(motorway.length, Math.round(406 / LAMPS.motorway.every));
  assert.ok(motorway.every((post) => Math.abs(post.y - (700 - 7.6)) < 0.01 && post.top === 12));
  // The car park's lane: lower lamps, closer together.
  const aisle = along(850);
  assert.equal(aisle.length, Math.round(186 / 28));
  assert.ok(aisle.every((post) => post.top === 7));
  // Nothing along the rest.
  for (const y of [1000, 1100, 1200, 1300, 1400]) assert.equal(along(y).length, 0, `y ${y}`);
  const far = along(1600);
  assert.equal(far.length, minor.length);
  assert.equal(made.ways, 7);

  // The light of each lamp: its head, a point of light at the end of the arm, out over the road; and a pool on the ground under it.
  const light = corners(glow);
  assert.ok(light.every((corner) => corner[6] === 0), 'light covers nothing');
  const pools = light.filter((corner) => Math.abs(corner[2] - 0.24) < 1e-6);
  const heads = light.filter((corner) => corner[2] > 5);
  assert.equal(pools.length + heads.length, light.length);
  assert.equal(heads.length, made.lamps * 18);
  // (A pool near the middle of the view has a bright middle and a soft skirt, 108 corners; one far off is drawn more simply, in 24.)
  assert.equal(pools.length, (made.lamps - far.length) * 108 + far.length * 24);
  // (A pool is brightest in its middle, which lies under the head: 1.6 m out over the road from a post on a residential street.)
  const brightest = Math.max(...pools.filter((corner) => Math.abs(corner[1]) < 20).map((corner) => corner[3]));
  const middles = pools.filter((corner) => Math.abs(corner[1]) < 20 && corner[3] === brightest);
  assert.ok(middles.every((corner) => Math.abs(corner[1] - -(4.1 - 1.6)) < 0.01), JSON.stringify(middles[0]));
  assert.ok(pools.some((corner) => corner[3] === 0), 'and gone at its edge');
  // The side street glows in the amber of sodium lamps, the motorway white.
  const amber = middles[0];
  const white = pools.filter((corner) => Math.abs(corner[1] - 700) < 20).reduce((best, corner) => (corner[3] > best[3] ? corner : best));
  const hex = (text) => [parseInt(text.slice(1, 3), 16), parseInt(text.slice(3, 5), 16), parseInt(text.slice(5, 7), 16)];
  assert.ok(Math.abs(amber[5] / amber[3] - hex(LAMP_LIGHT.side)[2] / hex(LAMP_LIGHT.side)[0]) < 0.03 && Math.abs(white[5] / white[3] - hex(LAMP_LIGHT.big)[2] / hex(LAMP_LIGHT.big)[0]) < 0.03);
  assert.ok(white[5] / white[3] > amber[5] / amber[3] + 0.2, 'more blue in white light');

  // The same lamps every time; and with a limit, the nearest first.
  const again = new Mesh();
  drawLamps(again, new Mesh(), network, NOON);
  assert.deepEqual(again.positions.subarray(0, again.count * 3), posts.positions.subarray(0, posts.count * 3));
  const few = new Mesh();
  assert.equal(drawLamps(few, new Mesh(), network, NOON, { most: 5 }).lamps, 5);
  assert.ok(postsOf(few).every((post) => Math.hypot(post.x, post.y) < 400));
  // By night the posts are drawn the same: the scene darkens them, and shows their light.
  const dark = new Mesh();
  assert.equal(drawLamps(dark, new Mesh(), network, null).lamps, made.lamps);
});

test('no lamp post stands in a building or on another road; on a bridge they stand on the parapet', () => {
  const lines = [
    line('minor', [[0, 0], [300, 0]], { width: 7 }),
    // Two carriageways so close that there is no median to stand in: the lamps go to the outer kerbs.
    line('primary', [[0, 400], [400, 400]], { width: 12, oneway: 1 }),
    line('primary', [[400, 412], [0, 412]], { width: 12, oneway: 1 }),
    // A flyover.
    line('secondary', [[0, 800], [600, 800]], { width: 9.5, oneway: 1, bridge: true, layer: 1 }),
  ];
  const network = buildNetwork(lines, ORIGIN);
  // A building stands along the south side of the residential street, from 100 m to 200 m.
  const built = (x, y) => x > 100 && x < 200 && y > -20 && y < -3.6;
  const posts = new Mesh();
  const glow = new Mesh();
  drawLamps(posts, glow, network, NOON, { built });
  const stood = postsOf(posts);
  const along = (y, reach = 12) => stood.filter((post) => Math.abs(post.y - y) < reach).sort((a, b) => a.x - b.x);
  // Where the building is, the lamps stand across the street; elsewhere on its usual side.
  const minor = along(0);
  assert.equal(minor.length, 10);
  for (const post of minor) assert.equal(Math.sign(post.y), post.x > 100 && post.x < 200 ? 1 : -1, `at ${post.x.toFixed(0)}`);
  assert.ok(minor.some((post) => post.y > 0) && minor.some((post) => post.y < 0));
  // The crowded main road: no post between the carriageways, where each would stand on the other's asphalt.
  assert.ok(along(400).every((post) => post.y < 394) && along(412).every((post) => post.y > 418));
  assert.equal(along(400).length + along(412).length, 20);
  // The flyover: posts on the parapet at the deck's edge, from the parapet's top up; and their light on the deck, not on the ground.
  const deck = along(800);
  assert.ok(deck.length >= 15);
  const high = deck.filter((post) => post.x > 150 && post.x < 450);
  assert.ok(high.every((post) => Math.abs(post.foot - (6.5 + 0.9)) < 0.01 && Math.abs(post.top - (6.5 + 10)) < 0.01), JSON.stringify(high[0]));
  assert.ok(deck.every((post) => Math.abs(Math.abs(post.y - 800) - (4.75 + 0.52)) < 0.01));
  const onDeck = corners(glow).filter((corner) => Math.abs(corner[1] - 800) < 12 && corner[0] > 150 && corner[0] < 450 && corner[2] < 10);
  assert.ok(onDeck.length > 0 && onDeck.every((corner) => Math.abs(corner[2] - 6.62) < 0.01), 'the pool lies on the deck');
  assert.ok(onDeck.every((corner) => Math.abs(corner[1] - 800) <= 4.75 + 0.3 + 0.01), 'and nowhere beyond its edges');
});

test('by night everything that moves has its lights on: white ahead, red behind, and the windows of buses and trains lit', () => {
  const glow = new Mesh();
  // A car at the origin, pointing east.
  vehicleLights(glow, 'car', 0, 0, 1, 0);
  const car = corners(glow);
  assert.ok(car.every((corner) => corner[6] === 0));
  const red = car.filter((corner) => corner[3] > 4 * Math.max(corner[4], 1) && corner[3] > 100);
  const white = car.filter((corner) => corner[4] > 150 && corner[5] > 150);
  assert.ok(red.length > 0 && white.length > 0);
  assert.ok(red.every((corner) => corner[0] < -2.2), 'red at the back');
  assert.ok(white.every((corner) => corner[0] > 2.2), 'white at the front');
  // Two lamps each end, either side of the middle.
  assert.ok(red.some((corner) => corner[1] > 0.4) && red.some((corner) => corner[1] < -0.4) && white.some((corner) => corner[1] > 0.4) && white.some((corner) => corner[1] < -0.4));
  // The beam lies on the road ahead: from the bumper forward, wider and fainter as it goes, and gone 10 m out.
  const beam = car.filter((corner) => Math.abs(corner[2] - 0.26) < 1e-6);
  assert.equal(beam.length, 6);
  const far = beam.filter((corner) => corner[0] > 12);
  const near = beam.filter((corner) => corner[0] < 3);
  assert.ok(far.length === 3 && near.length === 3 && far.every((corner) => corner[3] === 0) && near.every((corner) => corner[3] > 30));
  assert.ok(Math.max(...far.map((corner) => Math.abs(corner[1]))) > Math.max(...near.map((corner) => Math.abs(corner[1]))) + 1);
  assert.ok(Math.max(...beam.map((corner) => corner[0])) < 2.25 + 10.01);

  // Pointing north, on a bridge, half faded in, drawn half as large again.
  glow.clear();
  vehicleLights(glow, 'suv', 100, 50, 0, 1, 0.5, 1.5, 6.5);
  const suv = corners(glow);
  assert.ok(suv.every((corner) => corner[2] > 6.5 && corner[2] < 9));
  assert.ok(suv.filter((corner) => corner[4] > 100).every((corner) => corner[1] > 50 + 3), 'white ahead, to the north');
  assert.ok(Math.max(...suv.map((corner) => corner[3])) <= 128, 'half as bright');

  // A bus has its lamps and its lit windows; a train's car has only the windows.
  glow.clear();
  vehicleLights(glow, 'bus', 0, 0, 1, 0);
  const bus = corners(glow);
  const windows = (list, shape) => list.filter((corner) => Math.abs(Math.abs(corner[1]) - (shape.width / 2) * shape.boxes[1][2] - 0.05) < 1e-6);
  assert.equal(windows(bus, VEHICLES.bus).length, 12);
  assert.ok(windows(bus, VEHICLES.bus).every((corner) => corner[2] >= 1.3 - 1e-6 && corner[2] <= 2.5 + 1e-6));
  assert.ok(bus.length > 12 + 6);
  glow.clear();
  vehicleLights(glow, 'coach', 0, 0, 1, 0);
  assert.equal(glow.count, 12);
  // Nothing for what is not there, or not yet shown.
  glow.clear();
  vehicleLights(glow, 'car', 0, 0, 1, 0, 0);
  vehicleLights(glow, 'tram', 0, 0, 1, 0);
  assert.equal(glow.count, 0);
});

test('drawTrafficLights lights every vehicle the traffic shows', () => {
  const network = buildNetwork([line('primary', [[-800, 0], [800, 0]], { width: 12 }), line('minor', [[0, -500], [0, 500]], { width: 7 })], ORIGIN);
  let now = Date.parse('2026-11-22T17:30:00Z');
  const traffic = new Traffic({ seed: 5, now: () => now });
  traffic.level = 1;
  traffic.setNetwork(network, [0, 0], ORIGIN);
  for (let i = 0; i < 40; i += 1) {
    now += 500;
    traffic.step(0.5);
  }
  let shown = 0;
  traffic.eachVehicle(() => {
    shown += 1;
  });
  assert.ok(shown > 5, `${shown} vehicles`);
  const glow = new Mesh();
  glow.room(3);
  glow.glow(0, 0, 0, 1, 1, 1, 1); // what was there before goes
  assert.equal(drawTrafficLights(glow, traffic), shown);
  assert.ok(glow.count >= shown * 60 && glow.count % 6 === 0, `${glow.count} corners for ${shown}`);
  assert.ok(corners(glow).every((corner) => corner[6] === 0));
});

test('light falls from shop windows onto the pavement, along the walls of buildings with shops at their foot', () => {
  const block = (x, y, more) => ({ id: 1024 * (x + 7), height: 12, base: 0, use: 'commercial', polygons: [[ring([[x, y], [x + 30, y], [x + 30, y + 20], [x, y + 20]])]], ...more });
  const buildings = [
    block(0, 0), // shops along its foot
    block(100, 0, { use: 'residential' }), // flats
    block(200, 0, { height: 5 }), // too low for shops under flats
    block(300, 0, { replaced: true }), // a landmark's model stands here
    block(400, 0, { kind: 'station' }),
    block(500, 0, { base: 6 }), // starts above the ground
    block(600, 0, { height: 80 }), // a tower
  ];
  const glow = new Mesh();
  glow.room(3);
  for (let i = 0; i < 3; i += 1) glow.glow(-999, -999, 0, 1, 1, 1, 1); // what is in the mesh already stays
  const strips = shopSpill(glow, buildings, ORIGIN);
  assert.equal(strips, 4, 'the four walls of the one building with shops');
  assert.equal(glow.count, 3 + 4 * 6);
  const light = corners(glow).slice(3);
  assert.ok(light.every((corner) => corner[6] === 0 && Math.abs(corner[2] - 0.24) < 1e-6));
  // Brightest at the wall, gone 5 m out; nothing of it inside the building.
  const atWall = light.filter((corner) => corner[3] > 0);
  const out = light.filter((corner) => corner[3] === 0);
  const inside = (x, y) => x > 0.01 && x < 29.99 && y > 0.01 && y < 19.99;
  assert.ok(atWall.length === 12 && out.length === 12);
  assert.ok(atWall.every((corner) => Math.min(Math.abs(corner[0]), Math.abs(corner[0] - 30)) < 0.01 || Math.min(Math.abs(corner[1]), Math.abs(corner[1] - 20)) < 0.01));
  assert.ok(out.every((corner) => !inside(corner[0], corner[1]) && (corner[0] < -4.9 || corner[0] > 34.9 || corner[1] < -4.9 || corner[1] > 24.9)), JSON.stringify(out[0]));
  assert.ok(atWall[0][3] > atWall[0][5], 'a warm light');
});

test('a red lamp stands on the mast of every tall tower, and on top of the tall landmarks', () => {
  // drawRoofs puts a mast on a tower of 90 m or more, and says where its top is.
  const square = (x, size) => [[x, 0], [x + size, 0], [x + size, size], [x, size], [x, 0]];
  const roofs = [
    { ring: square(0, 30), top: 120, kind: 'tower', seed: 3 },
    { ring: square(100, 30), top: 70, kind: 'tower', seed: 4 }, // not tall enough for a mast
    { ring: square(200, 16), top: 9, kind: 'house', seed: 5 },
  ];
  const beacons = [];
  drawRoofs(new Mesh(), roofs, NOON, { beacons });
  assert.equal(beacons.length, 1);
  const [x, y, z] = beacons[0];
  assert.ok(x > 0 && x < 30 && y > 0 && y < 30 && Math.abs(z - (120 + 11.3)) < 1e-9, JSON.stringify(beacons[0]));
  // (Without a list to add to, nothing changes.)
  assert.doesNotThrow(() => drawRoofs(new Mesh(), roofs, NOON));

  const glow = new Mesh();
  assert.equal(drawBeacons(glow, beacons), 1);
  const light = corners(glow);
  assert.equal(light.length, 18);
  assert.ok(light.every((corner) => corner[6] === 0 && Math.abs(corner[2] - z) < 1e-4));
  const middle = light.find((corner) => corner[3] === 255);
  assert.ok(middle && middle[4] < 80 && middle[5] < 80 && Math.abs(middle[0] - x) < 1e-4, 'red, brightest in the middle');
  assert.equal(drawBeacons(glow, []), 0);

  // The landmarks: one on each of the highest points of every tall one. Kingdom Centre has two, its two points.
  const tops = landmarkBeacons();
  // (Each landmark's own: along King Fahd Road they stand a street's width apart.)
  const near = (landmark) => tops.filter(([lng, lat]) => Math.hypot((lng - landmark.at[0]) * 101100, (lat - landmark.at[1]) * 111320) < landmark.clear + 12);
  for (const landmark of LANDMARKS) {
    if (/^kafd-\d/.test(landmark.id)) continue; // the financial district's buildings stand close together: see kafd.test.mjs
    const own = near(landmark);
    if (landmark.height < 60) assert.equal(own.length, 0, landmark.id);
    else assert.ok(own.length >= 1 && own.every(([, , height]) => height >= landmark.height - (landmark.model ? 5 : 0) && height <= landmark.height + 26), `${landmark.id}: ${JSON.stringify(own)}`);
  }
  // (The PIF Tower has three: one on the rim of its crown over each apex, the rim being lower to the south-west.)
  assert.equal(near(LANDMARKS.find((one) => one.id === 'pif-tower')).length, 3);
  assert.equal(near(LANDMARKS.find((one) => one.id === 'kingdom-centre')).length, 2);
  assert.equal(near(LANDMARKS.find((one) => one.id === 'burj-rafal')).length, 2, 'a mast on each horn');
  assert.equal(near(LANDMARKS.find((one) => one.id === 'tv-tower')).length, 1);
  assert.equal(near(LANDMARKS.find((one) => one.id === 'hamad-tower')).length, 1, 'on the point of the sail');
  assert.equal(near(LANDMARKS.find((one) => one.id === 'al-anoud-tower')).length, 2, 'on each of its two masts');
});

test('a lamp is left on up on three roofs in ten, by the door at the head of the stairs, and under every awning', () => {
  const square = (x, size) => [[x, 0], [x + size, 0], [x + size, size], [x, size], [x, 0]];
  // A street of houses, each with a number of its own.
  const roofs = Array.from({ length: 200 }, (_, i) => ({ ring: square(i * 30, 18), top: 8, kind: 'house', seed: i * 7919 + 13 }));
  const lamps = [];
  const mesh = new Mesh();
  drawRoofs(mesh, roofs, NOON, { lamps });
  assert.ok(lamps.length > 200 * 0.25 && lamps.length < 200 * 0.6, `${lamps.length} lamps on 200 roofs`);
  for (const [x, y, z] of lamps) {
    const i = Math.floor(x / 30);
    assert.ok(x > i * 30 && x < i * 30 + 18 && y > 0 && y < 18, `on its roof: ${x.toFixed(1)}, ${y.toFixed(1)}`);
    assert.ok(Math.abs(z - 8.12) < 1e-9, 'just above the roof');
  }
  // Which roofs: by the building's own number, the same every time; and nothing else about the roofs changes for it.
  const again = [];
  const plain = new Mesh();
  drawRoofs(plain, roofs, NOON, { lamps: again });
  assert.deepEqual(again, lamps);
  const without = new Mesh();
  drawRoofs(without, roofs, NOON);
  assert.equal(without.count, mesh.count);
  assert.deepEqual(without.positions.subarray(0, without.count * 3), mesh.positions.subarray(0, mesh.count * 3));
  // No lamp on a tower's roof (it has its red one) or on a great hall's.
  const others = [];
  drawRoofs(new Mesh(), [{ ring: square(0, 30), top: 120, kind: 'tower', seed: 3 }, { ring: square(100, 60), top: 9, kind: 'store', seed: 3 }], NOON, { lamps: others });
  assert.equal(others.length, 0);

  // Each is a soft patch of warm light on its roof.
  const glow = new Mesh();
  glow.room(3);
  glow.glow(0, 0, 0, 1, 1, 1, 1); // what was there before goes
  assert.equal(drawRoofLights(glow, lamps), lamps.length);
  assert.equal(glow.count, lamps.length * 24);
  const light = corners(glow);
  assert.ok(light.every((corner) => corner[6] === 0 && Math.abs(corner[2] - 8.12) < 1e-4));
  const middle = light[0];
  assert.ok(middle[3] > middle[5] + 30 && middle[3] > 80 && middle[3] < 140, `warm, and no stronger than a street lamp's pool: ${middle.slice(3, 6)}`);
  assert.ok(Math.max(...light.slice(0, 24).map((corner) => Math.hypot(corner[0] - middle[0], corner[1] - middle[1]))) < 3.21);
  assert.equal(drawRoofLights(glow, []), 0);
  assert.equal(glow.count, 0);
});
