import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GLASS, Mesh, Traffic, VEHICLES, buildNetwork, drawTraffic, drawVehicle, faceLight, lightFrom, pointAlong, seededRandom, trafficLevel } from '../js/life.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180)); // degrees of longitude in a metre
const NORTH = 1 / 111320;
/** A line through points given in metres east and north of the origin. */
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const near = (a, b, by = 0.01) => Math.abs(a - b) <= by;

test('seededRandom repeats for a seed and stays between 0 and 1', () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const first = Array.from({ length: 200 }, () => a());
  assert.deepEqual(first, Array.from({ length: 200 }, () => b()));
  assert.ok(first.every((value) => value >= 0 && value < 1));
  assert.notDeepEqual(first.slice(0, 5), Array.from({ length: 5 }, seededRandom(8)));
});

test('trafficLevel follows the day where the map is', () => {
  // Riyadh is about three hours ahead of Greenwich by the sun.
  const at = (iso) => trafficLevel(new Date(iso), 46.7);
  assert.ok(near(at('2026-03-20T04:25:00Z'), 1.2, 0.05), 'morning rush');
  assert.ok(near(at('2026-03-20T14:55:00Z'), 1.2, 0.05), 'evening rush');
  assert.ok(at('2026-03-20T01:00:00Z') < 0.35, 'four in the morning');
  assert.ok(at('2026-03-20T08:00:00Z') > 0.8 && at('2026-03-20T08:00:00Z') < 1.0, 'late morning');
  // The same moment is the dead of night six time zones to the west.
  assert.ok(trafficLevel(new Date('2026-03-20T04:25:00Z'), -43.3) < 0.35);
  for (let hour = 0; hour < 24; hour += 1) {
    const level = trafficLevel(new Date(Date.UTC(2026, 2, 20, hour)), 0);
    assert.ok(level >= 0.25 && level <= 1.2, `hour ${hour}: ${level}`);
  }
});

test('buildNetwork turns map lines into ways joined at their ends', () => {
  const network = buildNetwork(
    [
      line('primary', [[0, 0], [200, 0]], { oneway: 1 }),
      line('primary', [[200, 0], [400, 0]], { oneway: 1 }),
      line('minor', [[200, 0], [200, 150]]),
      line('primary', [[400, 0], [700, 0]], { oneway: 1, tunnel: true }),
      line('transit', [[0, 50], [600, 50]]),
      line('path', [[0, 0], [50, 50]]),
      line('primary', [[5, 5]]),
      { class: 'primary' },
    ],
    ORIGIN,
  );
  assert.equal(network.ways.length, 5, 'footpaths and broken lines are left out');
  const [first, second, side, tunnel, rail] = network.ways;
  assert.ok(near(first.length, 200, 0.05) && near(side.length, 150, 0.05));
  assert.deepEqual([first.oneway, side.oneway, first.lanes, side.lanes], [1, 0, 2, 1]);
  assert.equal(tunnel.hidden, true);
  assert.deepEqual([rail.rail, first.rail], [true, false]);
  // One-way roads count once, two-way roads in both directions.
  assert.ok(near(network.roadKm, 0.2 + 0.2 + 0.3 + 0.15 * 2, 0.001), String(network.roadKm));
  assert.ok(near(network.railKm, 0.6, 0.001));
  // Three roads meet at (200, 0); the rail has its own joins.
  assert.deepEqual(network.joins.get('d200,0').map((join) => [join.way, join.atStart]), [[0, false], [1, true], [2, true]]);
  assert.equal(network.joins.get('r0,50').length, 1);
  assert.notEqual(first.key, second.key);
  assert.equal(buildNetwork([line('primary', [[0, 0], [200, 0]], { oneway: 1 })], { lng: 46.6, lat: 24.6 }).ways[0].key, first.key, 'a way keeps its name wherever it is measured from');
});

test('pointAlong finds a place and a direction on a way', () => {
  const [way] = buildNetwork([line('minor', [[0, 0], [100, 0], [100, 50]])], ORIGIN).ways;
  const middle = pointAlong(way, 40);
  assert.ok(near(middle[0], 40, 0.05) && near(middle[1], 0, 0.05) && near(middle[2], 1) && near(middle[3], 0));
  const up = pointAlong(way, 120);
  assert.ok(near(up[0], 100, 0.05) && near(up[1], 20, 0.05) && near(up[2], 0) && near(up[3], 1));
  assert.ok(near(pointAlong(way, -5)[0], 0, 0.05) && near(pointAlong(way, 999)[1], 50, 0.05), 'stays on the way');
});

test('Traffic fills the roads, drives on the right and obeys one-way streets', () => {
  const network = buildNetwork([line('primary', [[0, 0], [1000, 0]]), line('trunk', [[0, 300], [1000, 300]], { oneway: 1 }), line('secondary', [[0, 600], [1000, 600]], { oneway: -1 })], ORIGIN);
  const traffic = new Traffic({ seed: 3 });
  traffic.setNetwork(network);
  // 1 km two-way primary (30 each way), 1 km one-way trunk (38) and 1 km one-way secondary (20).
  assert.equal(traffic.wanted(), 118);
  assert.equal(traffic.vehicles.length, 118);
  for (const vehicle of traffic.vehicles) {
    const way = network.ways[vehicle.way];
    assert.ok(vehicle.s >= 0 && vehicle.s <= way.length);
    if (way.oneway === 1) assert.equal(vehicle.forward, true);
    if (way.oneway === -1) assert.equal(vehicle.forward, false);
    assert.ok(Object.hasOwn(VEHICLES, vehicle.type));
  }
  assert.ok(traffic.vehicles.some((vehicle) => vehicle.type === 'bus') && traffic.vehicles.some((vehicle) => vehicle.type === 'suv'));

  // On the two-way road, heading east keeps to the south of the middle line, heading west to the north.
  traffic.step(0.4); // long enough for the newcomers to start showing
  let eastbound = 0;
  let westbound = 0;
  traffic.eachVehicle((type, x, y, east) => {
    if (Math.abs(y) > 20) return;
    if (east > 0) {
      eastbound += 1;
      assert.ok(y < 0, `eastbound at y ${y}`);
    } else {
      westbound += 1;
      assert.ok(y > 0, `westbound at y ${y}`);
    }
  });
  assert.ok(eastbound > 10 && westbound > 10);

  // Half as busy: half as many. The rest fade out and are gone within a second or two.
  traffic.level = 0.5;
  assert.equal(traffic.wanted(), 59);
  for (let i = 0; i < 12; i += 1) traffic.step(0.25);
  assert.ok(traffic.vehicles.length <= 59 * 1.2 + 5 && traffic.vehicles.length >= 59, String(traffic.vehicles.length));
  // A big city does not mean thousands of cars to draw.
  assert.equal(new Traffic({ most: 40 }).most, 40);
});

test('vehicles move on, turn onto the next road and leave where the road ends', () => {
  const network = buildNetwork([line('primary', [[0, 0], [100, 0]], { oneway: 1 }), line('primary', [[100, 0], [100, 400]], { oneway: 1 }), line('minor', [[100, 0], [60, -30]], { oneway: -1 })], ORIGIN);
  const traffic = new Traffic({ seed: 5, most: 0 });
  traffic.setNetwork(network);
  const car = { way: 0, forward: true, s: 90, lane: 0, offset: 0, wish: 10, speed: 10, type: 'car', paint: [1, 2, 3], cargo: [1, 2, 3], shown: 1, leaving: false };
  traffic.vehicles = [car];
  traffic.most = 1;
  traffic.level = 0; // nobody else joins
  traffic.step(0.25);
  assert.equal(car.way, 0);
  assert.ok(near(car.s, 92.5, 0.3));
  for (let i = 0; i < 8; i += 1) traffic.step(0.25);
  // Past the corner: on the road north, never up the one-way side street the wrong way.
  assert.equal(car.way, 1);
  assert.ok(car.forward && car.s > 5 && car.s < 20, String(car.s));
  let seen = null;
  traffic.eachVehicle((type, x, y, east, north) => {
    seen = { type, x, y, east, north };
  });
  // (In the left of its two lanes, 1.7 m from the middle of the road.)
  assert.ok(near(seen.x, 100 - 1.7, 0.01) && seen.y > 5 && near(seen.north, 1), JSON.stringify(seen));

  // At the far end the road stops, and so does the car's part in the picture.
  car.s = 399;
  traffic.step(0.25);
  assert.equal(traffic.vehicles.includes(car), false);
});

test('a driver slows down behind a slower vehicle in the same lane', () => {
  const network = buildNetwork([line('primary', [[0, 0], [2000, 0]], { oneway: 1 })], ORIGIN);
  const traffic = new Traffic({ seed: 9, most: 0 });
  traffic.setNetwork(network);
  const make = (s, speed, lane) => ({ way: 0, forward: true, s, lane, offset: 0, wish: speed, speed, type: 'car', paint: [0, 0, 0], cargo: [0, 0, 0], shown: 1, leaving: false });
  const slow = make(60, 4, 0);
  const fast = make(40, 16, 0);
  const free = make(40, 16, 1); // the next lane is clear
  traffic.vehicles = [slow, fast, free];
  traffic.level = 0;
  for (let i = 0; i < 24; i += 1) traffic.step(0.25);
  assert.ok(fast.speed < 6, `follower at ${fast.speed}`);
  assert.ok(fast.s < slow.s, 'never through the one in front');
  assert.ok(free.speed > 15 && free.s > slow.s);
});

test('trains run along the track, their cars following the same curve', () => {
  const network = buildNetwork([line('transit', [[0, 0], [400, 0]]), line('transit', [[400, 0], [400, 500]]), line('transit', [[400, 500], [400, 900]], { tunnel: true })], ORIGIN);
  const traffic = new Traffic({ seed: 11 });
  traffic.setNetwork(network);
  assert.equal(traffic.wantedTrains(), 1);
  assert.equal(traffic.trains.length, 1);
  const train = traffic.trains[0];
  // Put it at the start, heading for the corner.
  Object.assign(train, { way: 0, forward: true, s: 0, speed: 20, wait: 0, cars: 4, trail: [], travelled: 0 });
  for (let i = 0; i < 100; i += 1) traffic.step(0.25); // 25 s, 500 m
  const cars = [];
  traffic.eachVehicle((type, x, y, east, north) => cars.push({ type, x, y, east, north }));
  assert.equal(cars.length, 4);
  assert.ok(cars.every((car) => car.type === 'coach'));
  // The front is round the corner heading north; the tail is 21 m apart behind it on the same track.
  assert.ok(near(cars[0].x, 400, 0.5) && cars[0].y > 60 && near(cars[0].north, 1, 0.05), JSON.stringify(cars[0]));
  for (let i = 1; i < cars.length; i += 1) {
    assert.ok(near(Math.hypot(cars[i].x - cars[i - 1].x, cars[i].y - cars[i - 1].y), 21, 1.5), `car ${i}`);
  }
  // It does not follow the track underground: it fades out at the tunnel mouth.
  for (let i = 0; i < 120; i += 1) traffic.step(0.25);
  assert.ok(!traffic.trains.includes(train), 'the train has left the picture');
  assert.equal(traffic.trains.length, 1, 'and another has set off');
  assert.equal(new Traffic().wantedTrains(), 0);
});

test('a rebuilt network keeps the vehicles whose streets are still there', () => {
  const lines = [line('primary', [[0, 0], [500, 0]], { oneway: 1 }), line('primary', [[0, 200], [500, 200]], { oneway: 1 }), line('transit', [[0, 400], [900, 400]])];
  const traffic = new Traffic({ seed: 13 });
  traffic.setNetwork(buildNetwork(lines, ORIGIN));
  for (let i = 0; i < 40; i += 1) traffic.step(0.25);
  const onFirst = traffic.vehicles.filter((vehicle) => vehicle.way === 0).map((vehicle) => vehicle.s);
  const trail = traffic.trains[0].trail.map((point) => [...point]);
  assert.ok(onFirst.length > 5 && trail.length > 3);

  // The view moved 100 m east: the second street is gone, and everything is measured from the new middle.
  const moved = { lng: ORIGIN.lng + 100 * EAST, lat: ORIGIN.lat };
  traffic.setNetwork(buildNetwork([lines[2], lines[0]], moved), [-100, 0]);
  assert.ok(traffic.vehicles.every((vehicle) => vehicle.way === 1), 'only the first street carries cars now, under its new number');
  assert.deepEqual(traffic.vehicles.slice(0, onFirst.length).map((vehicle) => vehicle.s), onFirst, 'and the ones that were on it kept their places');
  assert.ok(near(traffic.trains[0].trail[0][0], trail[0][0] - 100, 1e-9), 'the train keeps its place on the ground');
});

test('a vehicle is drawn as lit boxes with a shade beside it', () => {
  const mesh = new Mesh(8);
  const light = lightFrom({ azimuth: 180, altitude: 50 });
  assert.ok(near(light.north, -Math.cos((50 * Math.PI) / 180), 1e-9) && near(light.up, Math.sin((50 * Math.PI) / 180), 1e-9) && near(light.east, 0, 1e-9));
  assert.equal(lightFrom({ azimuth: 0, altitude: -10 }), null);
  assert.ok(lightFrom({ azimuth: 90, altitude: 5 }).up > 0.57, 'a low sun still lights from 35° up, like the buildings');
  assert.ok(near(faceLight(light, 0, -1, 0), 0.65 + 0.35 * -light.north, 1e-9));
  assert.equal(faceLight(light, 0, 1, 0), 0.65, 'a face turned away keeps 65%');
  assert.equal(faceLight(null, 0, 0, 1), 0.8, 'even light at night');

  // A car at (10, 20) pointing north, with the sun in the south: 3 boxes of 5 faces, and a shade.
  drawVehicle(mesh, 'car', 10, 20, 0, 1, [200, 100, 50], [200, 100, 50], 1, light, { bearing: 0, factor: 1 });
  assert.equal(mesh.count, 6 + 3 * 5 * 6);
  const xs = [];
  const ys = [];
  const zs = [];
  for (let i = 6; i < mesh.count; i += 1) {
    xs.push(mesh.positions[i * 3]);
    ys.push(mesh.positions[i * 3 + 1]);
    zs.push(mesh.positions[i * 3 + 2]);
  }
  assert.ok(near(Math.min(...xs), 10 - 0.9, 1e-4) && near(Math.max(...xs), 10 + 0.9, 1e-4), 'as wide as a car');
  assert.ok(near(Math.min(...ys), 20 - 2.25, 1e-4) && near(Math.max(...ys), 20 + 2.25, 1e-4), 'as long as a car, along the way it points');
  assert.ok(near(Math.max(...zs), 1.46, 1e-4) && near(Math.min(...zs), 0.25, 1e-4));
  // The shade lies on the road, north of the car, away from the sun.
  assert.ok(near(mesh.positions[2], 0.06, 1e-6) && mesh.positions[1] > 20 - 2.25);
  assert.deepEqual(Array.from(mesh.colours.subarray(0, 4)), [Math.floor(16 * 0.3), Math.floor(20 * 0.3), Math.floor(32 * 0.3), Math.floor(255 * 0.3)]);
  // The roof of the body (first face after the shade) is fully lit paint; glass is glass.
  const top = faceLight(light, 0, 0, 1);
  assert.deepEqual(Array.from(mesh.colours.subarray(24, 28)), [Math.floor(200 * top), Math.floor(100 * top), Math.floor(50 * top), 255]);
  const glassTop = 6 + 30;
  assert.deepEqual(Array.from(mesh.colours.subarray(glassTop * 4, glassTop * 4 + 3)), GLASS.map((value) => Math.floor(value * top)));

  // Half shown: half as solid. Larger than life: larger. No sun: no shade.
  const faint = new Mesh();
  drawVehicle(faint, 'bus', 0, 0, 1, 0, [100, 100, 100], [0, 0, 0], 0.5, null, null, 1.5);
  assert.equal(faint.count, 3 * 5 * 6);
  assert.equal(faint.colours[3], 127);
  let longest = 0;
  for (let i = 0; i < faint.count; i += 1) longest = Math.max(longest, Math.abs(faint.positions[i * 3]));
  assert.ok(near(longest, (12 * 1.5) / 2, 1e-4));
});

test('drawTraffic draws every vehicle that can be seen, and none in a tunnel', () => {
  const network = buildNetwork([line('primary', [[0, 0], [1000, 0]], { oneway: 1 }), line('primary', [[0, 100], [1000, 100]], { oneway: 1, tunnel: true })], ORIGIN);
  const traffic = new Traffic({ seed: 17 });
  traffic.setNetwork(network);
  traffic.step(0.25);
  traffic.step(0.25);
  const mesh = new Mesh();
  const drawn = drawTraffic(mesh, traffic, null, null);
  const above = traffic.vehicles.filter((vehicle) => vehicle.way === 0).length;
  assert.equal(drawn, above);
  assert.ok(above > 10 && traffic.vehicles.length > above, 'the tunnel carries traffic too, out of sight');
  assert.equal(mesh.count, above * 90);
  for (let i = 0; i < mesh.count; i += 1) assert.ok(Math.abs(mesh.positions[i * 3 + 1]) < 20, 'only the open road is drawn');
  assert.deepEqual(traffic.counts(), { vehicles: traffic.vehicles.length, buses: traffic.vehicles.filter((v) => v.type === 'bus').length, trains: 0, ways: 2 });
  // Drawing again starts from an empty mesh.
  assert.equal(drawTraffic(mesh, new Traffic(), null, null), 0);
  assert.equal(mesh.count, 0);
});
