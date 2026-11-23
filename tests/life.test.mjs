import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildNetwork,
  drawBridges,
  drawMarks,
  drawRoofs,
  drawStreet,
  drawTraffic,
  drawTrees,
  drawVehicle,
  faceLight,
  GLASS,
  heightAlong,
  hullOf,
  isPalm,
  lightFrom,
  localTime,
  Mesh,
  metroHeadway,
  pointAlong,
  railEntries,
  seededRandom,
  serviceRuns,
  stayedHere,
  streetDirection,
  streetNear,
  Traffic,
  trafficLevel,
  VEHICLES,
} from '../js/life.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180)); // degrees of longitude in a metre
const NORTH = 1 / 111320;
/** A line through points given in metres east and north of the origin. */
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const near = (a, b, by = 0.01) => Math.abs(a - b) <= by;
/** A place given in metres east and north of the origin, as [lng, lat]. */
const place = ([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH];
const MORNING = Date.parse('2026-11-22T05:00:00Z'); // a Sunday, 08:00 in Riyadh: the rush hour
const NIGHT = Date.parse('2026-11-21T23:00:00Z'); // 02:00 in Riyadh
const isBus = (vehicle) => vehicle.type === 'bus';

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

test('buildNetwork cuts lines where they meet, so every junction can be turned at', () => {
  const lines = [
    line('primary', [[-300, 0], [300, 0]], { oneway: 1 }), // a through road, drawn as one line
    line('minor', [[0, 0.8], [0, 200]]), // a side street that ends on it
    line('secondary', [[100, -200], [100, 200]]), // a road that crosses it
    line('trunk', [[200, -200], [200, 200]], { bridge: true }), // a flyover
    line('minor', [[-100, -200], [-100, 0.6]]), // another side street, from the south
    line('primary', [[-200, -100], [-200, 100]], { tunnel: true }), // an underpass
  ];
  const network = buildNetwork(lines, ORIGIN);
  // The through road falls into four ways and the crossing road into two; the flyover and the underpass pass by.
  assert.deepEqual(
    network.ways.map((way) => `${way.class} ${Math.round(way.xy[0])},${Math.round(way.xy[1])} to ${Math.round(way.xy[way.xy.length - 2])},${Math.round(way.xy[way.xy.length - 1])}`),
    ['primary -300,0 to -100,1', 'primary -100,1 to 0,1', 'primary 0,1 to 100,0', 'primary 100,0 to 300,0', 'minor 0,1 to 0,200', 'secondary 100,-200 to 100,0', 'secondary 100,0 to 100,200', 'trunk 200,-200 to 200,200', 'minor -100,-200 to -100,1', 'primary -200,-100 to -200,100'],
  );
  const meeting = (key) => network.joins.get(key).map((join) => [join.way, join.atStart]);
  assert.deepEqual(meeting('d0,1'), [[1, false], [2, true], [4, true]]);
  assert.deepEqual(meeting('d100,0'), [[2, false], [3, true], [5, false], [6, true]]);
  assert.deepEqual(meeting('d-100,1'), [[0, false], [1, true], [8, false]]);
  assert.equal(network.joins.has('d200,0'), false, 'nothing joins the flyover from below');
  assert.equal(network.joins.has('d-200,0'), false, 'nor the underpass from above');
  assert.ok(near(network.roadKm, 0.6 + 0.2 * 2 + 0.4 * 2 + 0.4 * 2 + 0.2 * 2 + 0.2 * 2, 0.001), String(network.roadKm));
  assert.deepEqual(network.ways[0].ends, ['d-300,0', 'd-100,1']);
  // The pieces keep their names when the network is measured from somewhere else.
  assert.deepEqual(buildNetwork(lines, { lng: 46.66, lat: 24.71 }).ways.map((way) => way.key), network.ways.map((way) => way.key));

  // Two map tiles cut a road at their edge: the two ends lie a step apart and are one junction.
  const tiles = buildNetwork([line('tertiary', [[0, 0], [300, 0]]), line('tertiary', [[300.9, 0.8], [600, 0]]), line('tertiary', [[0, 50], [300, 50]]), line('tertiary', [[304, 50], [600, 50]])], ORIGIN);
  assert.deepEqual(tiles.joins.get('d300,0').map((join) => join.way), [0, 1]);
  assert.equal(tiles.joins.get('d300,50').length, 1, 'four metres apart is a gap');

  // Tracks only branch. Where two tracks cross, each carries on; depot tracks and sidings are left out.
  const rails = buildNetwork(
    [line('transit', [[0, 0], [600, 0]]), line('transit', [[300, 0.6], [600, 100]]), line('transit', [[450, -100], [450, 200]]), line('rail', [[0, -30], [500, -30]], { service: 'yard' })],
    ORIGIN,
  );
  assert.deepEqual(rails.ways.map((way) => `${Math.round(way.xy[0])},${Math.round(way.xy[1])} to ${Math.round(way.xy[way.xy.length - 2])},${Math.round(way.xy[way.xy.length - 1])}`), ['0,0 to 300,1', '300,1 to 600,0', '300,1 to 600,100', '450,-100 to 450,200']);
  assert.equal(rails.joins.get('r300,1').length, 3);
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
  const traffic = new Traffic({ seed: 3, now: () => MORNING });
  traffic.setNetwork(network, [0, 0], ORIGIN);
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
  assert.ok(traffic.vehicles.some((vehicle) => vehicle.type === 'suv') && traffic.vehicles.some((vehicle) => vehicle.type === 'truck'));
  assert.ok(!traffic.vehicles.some(isBus), 'no bus where the map has no bus stop');
  assert.equal(traffic.wantedBuses(), 0);

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
  const staying = traffic.vehicles.filter((vehicle) => !vehicle.leaving).length;
  assert.ok(staying <= 59 * 1.2 + 5 && staying >= 59, String(staying));
  // A big city does not mean thousands of cars to draw.
  assert.equal(new Traffic({ most: 40 }).most, 40);
});

test('vehicles move on, turn onto the next road and pull up where the road ends', () => {
  const network = buildNetwork([line('primary', [[0, 0], [100, 0]], { oneway: 1 }), line('primary', [[100, 0], [100, 400]], { oneway: 1 }), line('minor', [[100, 0], [60, -30]], { oneway: -1 })], ORIGIN);
  const traffic = new Traffic({ seed: 5, most: 0, now: () => MORNING });
  traffic.setNetwork(network, [0, 0], ORIGIN);
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

  // At the far end the road stops. The car pulls up there and fades from the picture.
  car.s = 399;
  traffic.step(0.25);
  assert.ok(car.parked && car.leaving && near(car.s, 400, 1e-9) && traffic.vehicles.includes(car));
  for (let i = 0; i < 3; i += 1) traffic.step(0.25);
  assert.equal(traffic.vehicles.includes(car), false);
});

test('at a junction most drivers go straight on, some turn, and nobody turns back', () => {
  const network = buildNetwork([line('primary', [[-200, 0], [200, 0]], { oneway: 1 }), line('minor', [[0, -200], [0, 200]])], ORIGIN);
  assert.equal(network.ways.length, 4); // the main road west and east of the crossing, the side street south and north of it
  const traffic = new Traffic({ seed: 21, most: 0, now: () => MORNING });
  traffic.setNetwork(network, [0, 0], ORIGIN);
  const choices = (item) => {
    const tally = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i += 1) tally[traffic.next(item, false).way] += 1;
    return tally;
  };
  // Along the main road: nineteen in twenty carry on, the rest turn off left or right.
  const main = choices({ way: 0, forward: true, type: 'car' });
  assert.equal(main[0], 0);
  assert.ok(main[1] > 3700 && main[1] < 3900, String(main));
  assert.ok(main[2] > 50 && main[2] < 160 && main[3] > 50 && main[3] < 160, String(main));
  // Up the side street: most cross, some join the main road the way it runs, none drive against it.
  const side = choices({ way: 2, forward: true, type: 'car' });
  assert.equal(side[0] + side[2], 0);
  assert.ok(side[3] > 3100 && side[3] < 3500 && side[1] > 500, String(side));
  // A train never turns: it takes the track straight ahead or none.
  const rails = buildNetwork([line('transit', [[0, 0], [300, 0]]), line('transit', [[300, 0], [600, 0]]), line('transit', [[300, 0], [600, 300]]), line('transit', [[900, 0], [900, 300]]), line('transit', [[900, 300], [1200, 300]])], ORIGIN);
  const trains = new Traffic({ now: () => MORNING });
  trains.setNetwork(rails, [0, 0], ORIGIN);
  assert.equal(trains.next({ way: 0, forward: true }, true).way, 1);
  assert.equal(trains.next({ way: 3, forward: true }, true), null, 'a right angle is no way on for a train');
});

test('a driver slows down behind a slower vehicle in the same lane', () => {
  const network = buildNetwork([line('primary', [[0, 0], [2000, 0]], { oneway: 1 })], ORIGIN);
  const traffic = new Traffic({ seed: 9, most: 0, now: () => MORNING });
  traffic.setNetwork(network, [0, 0], ORIGIN);
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

test('the timetable: the hours the metro and the buses run, and how often', () => {
  // Riyadh keeps three hours ahead of Greenwich.
  assert.deepEqual(localTime(new Date('2026-11-22T22:30:00Z'), 46.67), { hour: 1.5, day: 1 });
  assert.deepEqual(localTime(new Date('2026-11-22T12:00:00Z'), -74), { hour: 7, day: 0 });
  const riyadh = (iso) => [serviceRuns('metro', new Date(iso), ORIGIN), serviceRuns('bus', new Date(iso), ORIGIN)];
  assert.deepEqual(riyadh('2026-11-22T02:00:00Z'), [false, true], '05:00 on a Sunday: the first buses, no metro yet');
  assert.deepEqual(riyadh('2026-11-22T02:30:00Z'), [true, true], '05:30: the first trains');
  assert.deepEqual(riyadh('2026-11-22T20:59:00Z'), [true, true], 'a minute to midnight');
  assert.deepEqual(riyadh('2026-11-22T21:00:00Z'), [false, false], 'midnight');
  assert.deepEqual(riyadh('2026-11-22T01:59:00Z'), [false, false], 'a minute to five');
  // On Fridays the Riyadh metro starts at ten. Elsewhere Friday is a day like any other.
  assert.deepEqual(riyadh('2026-11-20T06:00:00Z'), [false, true]);
  assert.deepEqual(riyadh('2026-11-20T07:00:00Z'), [true, true]);
  assert.equal(serviceRuns('metro', new Date('2026-11-20T06:00:00Z'), { lng: 2.35, lat: 48.86 }), true);
  // A train every four minutes in the rush hours, every seven and a half otherwise.
  const every = (iso) => metroHeadway(new Date(iso), ORIGIN);
  assert.deepEqual([every('2026-11-22T05:00:00Z'), every('2026-11-22T09:00:00Z'), every('2026-11-22T14:00:00Z'), every('2026-11-22T18:00:00Z')], [240, 450, 240, 450]);
});

test('buses keep to the streets with stops, run by the clock and pull in at the stops on their side', () => {
  const lines = [
    line('secondary', [[0, 0], [2000, 0]]), // a two-way street
    line('minor', [[1000, 0], [1000, 400]]), // a side street off it
    line('primary', [[0, 600], [2000, 600]], { oneway: 1 }),
    line('secondary', [[2000, 0], [5000, 0]]), // the street carries on for three kilometres without a junction
    line('service', [[500, -100], [520, -100]]),
  ];
  // Two stops facing each other across the street, one by the main road, one in a car park and one in the middle of nowhere.
  const busStops = [[400, -6], [420, 7], [300, 606], [510, -101], [1500, 300]].map(place);
  const network = buildNetwork(lines, ORIGIN, { busStops });
  const [west, east, side, main, far, yard] = network.ways;
  const round = (stops) => stops.map((stop) => [Math.round(stop.at), stop.side]);
  // The stop on the south side is for buses heading east, the one on the north side for buses heading west.
  assert.deepEqual(round(west.stops), [[400, 1], [420, -1]]);
  assert.deepEqual(round(main.stops), [[300, 0]], 'a one-way street has one direction to serve');
  assert.deepEqual([east, side, far, yard].map((way) => way.stops.length), [0, 0, 0, 0]);
  // The street on from a stop is a bus street too, for 1200 m; a turning off it is not.
  assert.deepEqual([west, east, side, main, far, yard].map((way) => way.bus), [true, true, false, true, false, false]);
  assert.ok(near(network.busKm, 2 * 2 + 2, 1e-6), String(network.busKm));

  let clock = MORNING;
  const traffic = new Traffic({ seed: 4, now: () => clock });
  traffic.level = 0; // no cars, so the buses are easy to follow
  traffic.setNetwork(network, [0, 0], ORIGIN);
  // Six kilometres of bus street, a bus every 4.2 km: one bus, and a second for 43% of every ten minutes.
  assert.equal(traffic.wantedBuses(), 2);
  assert.deepEqual(traffic.vehicles.map((vehicle) => vehicle.type), ['bus', 'bus']);
  assert.ok(traffic.vehicles.every((bus) => network.ways[bus.way].bus && bus.lane === (network.ways[bus.way].oneway === 0 ? 0 : 1)), 'on a bus street, in the lane by the kerb');
  clock = MORNING + 300000;
  assert.equal(traffic.wantedBuses(), 1);
  clock = NIGHT;
  assert.equal(traffic.wantedBuses(), 0);
  for (let i = 0; i < 4; i += 1) traffic.step(0.25);
  assert.equal(traffic.vehicles.length, 0, 'the buses go home for the night');

  const run = (bus, until) => {
    const stood = [];
    for (let i = 0; i < 4 * 90 && !until(bus); i += 1) {
      clock += 250;
      traffic.step(0.25);
      if (bus.waiting > 0) stood.push(bus.s);
    }
    return stood;
  };
  const busAt = (way, forward, s) => {
    const bus = Object.assign(traffic.spawnBus(), { way, forward, s, speed: 10, shown: 1 });
    traffic.vehicles = [bus];
    return bus;
  };
  clock = MORNING + 300000; // one bus wanted: the one being watched
  // Heading east it pulls in at the stop on its side, stands a quarter of a minute and drives on.
  let stood = run(busAt(0, true, 300), (bus) => bus.s > 600 || bus.way !== 0);
  assert.ok(stood.length >= 12 * 4 && stood.length <= 21 * 4 + 1, String(stood.length));
  assert.ok(stood.every((s) => near(s, 400, 1.3)), String(stood[0]));
  // Just past it, the stop across the street is not for this bus.
  assert.deepEqual(run(busAt(0, true, 405), (bus) => bus.s > 600 || bus.way !== 0), []);
  // Heading west it is the other way round.
  stood = run(busAt(0, false, 600), (bus) => bus.s < 300);
  assert.ok(stood.length >= 12 * 4 && stood.every((s) => near(s, 420, 1.3)), String(stood[0]));

  // A bus that leaves the bus streets is off its route: 700 m on it is taken off the road, and another sets off on a bus street.
  const lost = busAt(4, true, 10);
  run(lost, () => !traffic.vehicles.includes(lost));
  assert.ok(!traffic.vehicles.includes(lost) && lost.astray > 700 && lost.astray < 720, String(lost.astray));
  assert.ok(traffic.vehicles.length === 1 && network.ways[traffic.vehicles[0].way].bus);

  // With the street on screen, a new bus sets off somewhere out of sight.
  traffic.vehicles = [];
  traffic.view = [-50, -50, 2050, 50];
  clock = MORNING;
  traffic.step(0.25);
  assert.deepEqual(traffic.vehicles.map((bus) => [bus.type, bus.way]), [['bus', 3], ['bus', 3]]);
  assert.deepEqual(traffic.counts(), { vehicles: 2, buses: 2, trains: 0, ways: 6 });
});

test('metro trains leave each end of the line by the clock, keep right and stop at the stations', () => {
  const network = buildNetwork([line('transit', [[0, 0], [3000, 0]])], ORIGIN, { stations: [place([1500, 12])] });
  // The map draws both tracks as one line: trains run each way along it, each to its own right.
  assert.deepEqual(railEntries(network).map((entry) => [entry.way, entry.atStart, entry.offset]), [[0, true, 1.9], [0, false, 1.9]]);
  assert.deepEqual(network.ways[0].stops.map((stop) => [Math.round(stop.at), stop.side]), [[1500, 0]]);

  const watch = (start, seconds) => {
    let clock = start;
    const traffic = new Traffic({ seed: 1, now: () => clock });
    traffic.level = 0;
    traffic.setNetwork(network, [0, 0], ORIGIN);
    const known = new Set();
    const left = { east: [], west: [] }; // when each new train came onto the line
    const stood = new Map(); // train → [quarter seconds at the station, where]
    let most = 0;
    let mostCars = 0;
    for (let i = 0; i < seconds * 4; i += 1) {
      clock += 250;
      traffic.step(0.25);
      most = Math.max(most, traffic.trains.length);
      // Heading east a train keeps south of the line, heading west north of it.
      let cars = 0;
      traffic.eachVehicle((type, x, y, east) => {
        cars += 1;
        assert.equal(type, 'coach');
        assert.ok(near(y, east > 0 ? -1.9 : 1.9, 0.01) && near(Math.abs(east), 1, 1e-6), `${y} ${east}`);
      });
      mostCars = Math.max(mostCars, cars);
      for (const train of traffic.trains) {
        if (!known.has(train)) {
          known.add(train);
          if (train.travelled < 50) (train.forward ? left.east : left.west).push(clock);
        }
        if (train.waiting > 0) stood.set(train, [(stood.get(train)?.[0] ?? 0) + 1, train.s]);
      }
    }
    return { traffic, left, stood, most, mostCars };
  };

  const rush = watch(MORNING, 1500);
  for (const times of [rush.left.east, rush.left.west]) {
    assert.equal(times.length, 6, 'six trains in 25 minutes');
    for (let i = 1; i < times.length; i += 1) assert.equal(times[i] - times[i - 1], 240000, 'four minutes apart');
  }
  // Every train stands 22 seconds with its middle at the station: its front a car and a half beyond.
  assert.ok(rush.stood.size >= 10);
  for (const [train, [quarters, s]] of rush.stood) {
    assert.ok(quarters >= 87 && quarters <= 89, String(quarters));
    assert.ok(near(s, train.forward ? 1500 + 31.5 : 1500 - 31.5, 1.5), String(s));
  }
  // Three cars to a train, and with four minutes between trains never more than two trains each way on 3 km of line.
  assert.ok(rush.most >= 2 && rush.most <= 4, String(rush.most));
  assert.ok(rush.mostCars >= 6 && rush.mostCars <= rush.most * 3, String(rush.mostCars));

  // Whenever the map is opened, an end of the line sends its trains at the same minutes past the hour.
  const later = watch(MORNING + 777000, 600);
  assert.equal((later.left.east[0] - rush.left.east[0]) % 240000, 0);
  assert.equal((later.left.west[0] - rush.left.west[0]) % 240000, 0);
  // Outside the rush hours: every seven and a half minutes.
  const midday = watch(Date.parse('2026-11-22T09:00:00Z'), 1500);
  assert.equal(midday.left.east[1] - midday.left.east[0], 450000);
  // At night and on a Friday morning there is no train to be seen.
  assert.equal(watch(NIGHT, 300).most, 0);
  assert.equal(watch(Date.parse('2026-11-20T05:00:00Z'), 300).most, 0);
});

test('of two tracks side by side a train takes the right-hand one', () => {
  const network = buildNetwork([line('transit', [[0, 0], [2000, 0]]), line('transit', [[0, 4], [2000, 4]]), line('transit', [[900, -300], [900, 300]])], ORIGIN);
  assert.equal(network.ways.length, 3, 'tracks that cross are not cut');
  // East along the southern track, west along the northern one; the line that crosses them is a line of its own.
  assert.deepEqual(railEntries(network).map((entry) => [entry.way, entry.atStart, entry.offset]), [[0, true, 0], [1, false, 0], [2, true, 1.9], [2, false, 1.9]]);
  // Two tunnels 30 m apart are a pair as well.
  const tubes = buildNetwork([line('transit', [[0, 0], [2000, 0]], { tunnel: true }), line('transit', [[0, 30], [2000, 30]], { tunnel: true })], ORIGIN);
  assert.deepEqual(railEntries(tubes).map((entry) => [entry.way, entry.atStart]), [[0, true], [1, false]]);
});

test('a train runs on through a tunnel, where it is only a mark on the ground', () => {
  const network = buildNetwork([line('transit', [[0, 0], [1000, 0]]), line('transit', [[1000, 0], [2000, 0]], { tunnel: true }), line('transit', [[2000, 0], [3000, 0]])], ORIGIN);
  const traffic = new Traffic({ now: () => MORNING });
  traffic.setNetwork(network, [0, 0], ORIGIN);
  // Trains come onto the map at the ends of the line, not at the tunnel mouths.
  assert.deepEqual(traffic.entries.map((entry) => [entry.way, entry.atStart]), [[0, true], [2, false]]);
  const seen = (since) => {
    traffic.trains = [];
    assert.equal(traffic.startTrain(traffic.entries[0], since, MORNING / 1000), true);
    const cars = [];
    traffic.eachVehicle((type, x) => cars.push([type, Math.round(x)]));
    return cars;
  };
  // Twenty seconds in at 22 m/s: in the open. A minute in: under ground. Two minutes in: out the far side.
  assert.deepEqual(seen(20), [['coach', 430], ['coach', 409], ['coach', 388]]);
  assert.deepEqual(seen(60), [['under', 1310], ['under', 1289], ['under', 1268]]);
  assert.deepEqual(seen(47).map(([type]) => type), ['under', 'under', 'coach'], 'the front is in the tunnel, the tail not yet');
  assert.deepEqual(seen(120).map(([type]) => type), ['coach', 'coach', 'coach']);
  assert.equal(traffic.startTrain(traffic.entries[0], 140, MORNING / 1000), false, 'after 3 km it has left the map');
  // Under ground a car is drawn as one flat, see-through patch; above ground as its boxes with a shade.
  seen(60);
  const mesh = new Mesh();
  assert.equal(drawTraffic(mesh, traffic, lightFrom({ azimuth: 180, altitude: 50 }), { bearing: 0, factor: 1 }), 3);
  assert.equal(mesh.count, 3 * 6);
  assert.ok(near(mesh.positions[2], 0.16, 1e-6) && mesh.colours[3] < 110, 'just above the shadows on the street, and see-through');
  seen(20);
  drawTraffic(mesh, traffic, null, null);
  assert.equal(mesh.count, 3 * 4 * 30, 'four boxes to a car: body, windows, roof and the plant on it');
  // A train that is already running where a new one would be is the same train.
  assert.equal(traffic.startTrain(traffic.entries[0], 25, MORNING / 1000), true);
  assert.equal(traffic.trains.length, 1);
});

test('a rebuilt network keeps the vehicles whose streets are still there', () => {
  const lines = [line('primary', [[0, 0], [500, 0]], { oneway: 1 }), line('primary', [[0, 200], [500, 200]], { oneway: 1 }), line('transit', [[0, 400], [900, 400]])];
  let clock = MORNING;
  const traffic = new Traffic({ seed: 13, now: () => clock });
  traffic.setNetwork(buildNetwork(lines, ORIGIN), [0, 0], ORIGIN);
  traffic.trains = [];
  traffic.startTrain(traffic.entries[0], 10, clock / 1000);
  for (let i = 0; i < 40; i += 1) {
    clock += 250;
    traffic.step(0.25);
  }
  const onFirst = traffic.vehicles.filter((vehicle) => vehicle.way === 0 && !vehicle.leaving).map((vehicle) => vehicle.s);
  const train = traffic.trains[0];
  const trail = train.trail.map((point) => [...point]);
  assert.ok(onFirst.length > 5 && trail.length > 3);

  // The view moved 100 m east: the second street is gone, and everything is measured from the new middle.
  const moved = { lng: ORIGIN.lng + 100 * EAST, lat: ORIGIN.lat };
  traffic.setNetwork(buildNetwork([lines[2], lines[0]], moved), [-100, 0], moved);
  assert.ok(traffic.vehicles.every((vehicle) => vehicle.way === 1), 'only the first street carries cars now, under its new number');
  assert.deepEqual(traffic.vehicles.filter((vehicle) => !vehicle.leaving).slice(0, onFirst.length).map((vehicle) => vehicle.s), onFirst, 'and the ones that were on it kept their places');
  assert.ok(traffic.trains.includes(train) && train.way === 0);
  assert.ok(near(train.trail[0][0], trail[0][0] - 100, 1e-9), 'the train keeps its place on the ground');
});

test('the trains keep their rhythm when the map moves along the line', () => {
  const west = line('transit', [[0, 0], [2000, 0]]);
  const middle = line('transit', [[2000, 0], [4000, 0]]);
  const east = line('transit', [[4000, 0], [6000, 0]]);
  let clock = MORNING;
  const traffic = new Traffic({ seed: 2, now: () => clock });
  traffic.level = 0;
  const frontAt = (train) => pointAlong(traffic.network.ways[train.way], train.s)[0];
  const passes = { east: [], west: [] }; // when the front of each train passes the middle of the line
  let closest = Infinity;
  const run = (seconds) => {
    for (let i = 0; i < seconds * 4; i += 1) {
      const before = new Map(traffic.trains.map((train) => [train, frontAt(train)]));
      clock += 250;
      traffic.step(0.25);
      for (const train of traffic.trains) {
        const was = before.get(train);
        const now = frontAt(train);
        if (was !== undefined && train.forward && was < 3000 && now >= 3000) passes.east.push(clock);
        if (was !== undefined && !train.forward && was > 3000 && now <= 3000) passes.west.push(clock);
        for (const other of traffic.trains) {
          if (other !== train && other.forward === train.forward) closest = Math.min(closest, Math.abs(frontAt(other) - now));
        }
      }
    }
  };
  // The map shows the western two thirds of the line, then the eastern two thirds, then all of it, then only the middle.
  for (const shown of [[west, middle], [middle, east], [west, middle, east], [middle], [west, middle, east]]) {
    traffic.setNetwork(buildNetwork(shown, ORIGIN), [0, 0], ORIGIN);
    run(420);
  }
  for (const times of [passes.east, passes.west]) {
    assert.ok(times.length >= 8, String(times.length));
    // (To the quarter second the clock of this test ticks in.)
    for (let i = 1; i < times.length; i += 1) assert.ok(Math.abs(times[i] - times[i - 1] - 240000) <= 250, `train ${i} of ${times.length}: ${times[i] - times[i - 1]}`);
  }
  assert.ok(closest > 4000, `two trains ${closest} m apart on one track`);
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

  // A car at (10, 20) pointing north, with the sun in the south: 3 boxes of 5 faces (its tyres, its body, its
  // cabin), and a shade.
  drawVehicle(mesh, 'car', 10, 20, 0, 1, [200, 100, 50], [200, 100, 50], 1, light, { bearing: 0, factor: 1 });
  assert.equal(mesh.count, 6 + 3 * 5 * 6);
  assert.deepEqual(VEHICLES.car.boxes.map((box) => box[5]), ['tyre', 'body', 'glass']);
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
  assert.ok(near(Math.max(...zs), 1.42, 1e-4) && near(Math.min(...zs), 0.02, 1e-4), 'from the road under its tyres to its roof');
  // The shade lies on the road, north of the car, away from the sun.
  assert.ok(near(mesh.positions[2], 0.06, 1e-6) && mesh.positions[1] > 20 - 2.25);
  assert.deepEqual(Array.from(mesh.colours.subarray(0, 4)), [Math.floor(16 * 0.3), Math.floor(20 * 0.3), Math.floor(32 * 0.3), Math.floor(255 * 0.3)]);
  // Under the car, its tyres: dark. The top of the body (the first face of the second box) is fully lit paint.
  const top = faceLight(light, 0, 0, 1);
  assert.ok(mesh.colours[6 * 4] < 40 && mesh.colours[6 * 4 + 1] < 40, 'tyres');
  const bodyTop = 6 + 30;
  assert.deepEqual(Array.from(mesh.colours.subarray(bodyTop * 4, bodyTop * 4 + 4)), [Math.floor(200 * top), Math.floor(100 * top), Math.floor(50 * top), 255]);
  // Its front is paler than its paint (the headlights), its rear redder (the tail lights).
  const face = (index) => Array.from(mesh.colours.subarray((bodyTop + index * 6) * 4, (bodyTop + index * 6) * 4 + 3));
  const [front, rear, side] = [face(1), face(2), face(3)];
  assert.ok(front[2] / front[0] > side[2] / side[0] * 1.5, `paler ahead: ${front} against ${side}`);
  assert.ok(rear[1] / rear[0] < side[1] / side[0] * 0.9, `redder behind: ${rear} against ${side}`);
  // The cabin: glass all round, under a roof in the body's paint, and drawn in towards the roof.
  const cabin = 6 + 60;
  assert.deepEqual(Array.from(mesh.colours.subarray(cabin * 4, cabin * 4 + 3)), [Math.floor(200 * top), Math.floor(100 * top), Math.floor(50 * top)]);
  const pane = Array.from(mesh.colours.subarray((cabin + 6) * 4, (cabin + 6) * 4 + 3));
  assert.ok(pane[2] > pane[0] && pane[0] < 70, `glass: ${pane}`);
  const cabinAt = (z) => ys.filter((_, i) => i >= 60 && near(zs[i], z, 1e-4));
  const low = cabinAt(0.84);
  const high = cabinAt(1.42);
  assert.ok(Math.max(...high) - Math.min(...high) < (Math.max(...low) - Math.min(...low)) * 0.7, 'a sloping windscreen and rear window');
  assert.ok(Math.max(...low) - Math.max(...high) > Math.min(...high) - Math.min(...low), 'the windscreen slopes more than the rear window');
  assert.ok(GLASS[2] > GLASS[0]);

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
  const traffic = new Traffic({ seed: 17, now: () => MORNING });
  traffic.setNetwork(network, [0, 0], ORIGIN);
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

test('drawTrees stands a trunk and a crown at each place, with its shade', () => {
  const mesh = new Mesh();
  const light = lightFrom({ azimuth: 135, altitude: 45 });
  // Two trees with rounded crowns (a wide crown is never a palm; the small one here happens not to be).
  const small = Array.from({ length: 200 }, (_, i) => ({ x: -40 - i, y: 5, radius: 1.5 })).find((tree) => !isPalm(tree.x, tree.y, tree.radius));
  const trees = [{ x: 10, y: 20, radius: 4 }, small];
  assert.equal(isPalm(10, 20, 4), false);
  // Shade (3 faces), trunk (4) and crown (four bands of seven faces): 35 faces of 6 corners.
  assert.equal(drawTrees(mesh, trees, light, { bearing: 315, factor: 1 }), 2);
  assert.equal(mesh.count, 2 * 35 * 6);
  const first = { x: [], y: [], z: [] };
  for (let i = 18; i < 35 * 6; i += 1) {
    first.x.push(mesh.positions[i * 3]);
    first.y.push(mesh.positions[i * 3 + 1]);
    first.z.push(mesh.positions[i * 3 + 2]);
  }
  assert.ok(near(Math.max(...first.x) - Math.min(...first.x), 8, 1.2), 'the crown is as wide as it was seen to be');
  assert.ok(Math.min(...first.z) === 0 && Math.max(...first.z) > 6 && Math.max(...first.z) < 13, `top at ${Math.max(...first.z)}`);
  // A ball of leaves: narrow underneath, widest about its middle, drawn in again towards a point at the top.
  const crown = first.z.map((z, i) => [z, first.x[i]]).filter(([z]) => z > 3.3);
  const levels = [...new Set(crown.map(([z]) => z.toFixed(3)))].map(Number).sort((a, b) => a - b);
  assert.equal(levels.length, 5, 'four rings and the point');
  const widths = levels.map((level) => {
    const here = crown.filter(([z]) => near(z, level, 1e-3)).map(([, x]) => x);
    return Math.max(...here) - Math.min(...here);
  });
  assert.ok(widths[0] < widths[1] && widths[2] > widths[3] && widths[3] > widths[4] && widths[4] === 0, widths.map((w) => w.toFixed(1)).join(' '));
  assert.ok(widths[0] < 8 * 0.62 && widths[3] < 8 * 0.62, 'under two thirds as wide below and above as about its middle');
  // Its underside is in its own shade: darker than its top.
  const green = (face) => mesh.colours[(18 + 24 + face * 6) * 4 + 1];
  assert.ok(Math.max(green(0), green(3), green(6)) < Math.min(green(21), green(24), green(27)), 'darker underneath');
  // The shade lies on the ground, north-west of the tree, away from the sun.
  assert.ok(near(mesh.positions[2], 0.06, 1e-6) && mesh.positions[0] < 10 && mesh.positions[1] > 20);
  assert.ok(mesh.colours[3] < 100, 'and is see-through');
  // Leaves are green: more green than red or blue.
  const leaf = (18 + 24) * 4;
  assert.ok(mesh.colours[leaf + 1] > mesh.colours[leaf] && mesh.colours[leaf + 1] > mesh.colours[leaf + 2]);

  // The same trees come out the same every time; with no sun there is no shade.
  const again = new Mesh();
  drawTrees(again, trees, light, { bearing: 315, factor: 1 });
  assert.deepEqual(Array.from(again.positions.subarray(0, again.count * 3)), Array.from(mesh.positions.subarray(0, mesh.count * 3)));
  drawTrees(again, trees, null, null);
  assert.equal(again.count, 2 * 32 * 6);
  assert.equal(drawTrees(again, [], light, null), 0);
  assert.equal(again.count, 0);
});

test('a small crown is as likely as not a date palm: a tall bare trunk with a head of drooping fronds', () => {
  // Which trees are palms is settled by where they stand and how wide they are, the same every time.
  const row = Array.from({ length: 400 }, (_, i) => ({ x: i * 7, y: i * 3, radius: 1.8 }));
  const palms = row.filter((tree) => isPalm(tree.x, tree.y, tree.radius));
  assert.ok(palms.length > 400 * 0.45 && palms.length < 400 * 0.75, `${palms.length} of 400`);
  assert.deepEqual(row.map((tree) => isPalm(tree.x, tree.y, tree.radius)), row.map((tree) => isPalm(tree.x, tree.y, tree.radius)));
  const wider = row.filter((tree) => isPalm(tree.x, tree.y, 3));
  assert.ok(wider.length > 400 * 0.12 && wider.length < 400 * 0.4, `${wider.length} of 400 with a crown 6 m wide`);
  assert.ok(row.every((tree) => !isPalm(tree.x, tree.y, 3.5)), 'a wide crown is never a palm');

  const mesh = new Mesh();
  const palm = palms[0];
  drawTrees(mesh, [palm], lightFrom({ azimuth: 135, altitude: 45 }), null);
  // Trunk (4 faces) and seven fronds of two faces each.
  assert.equal(mesh.count, (4 + 14) * 6);
  const z = [];
  const out = [];
  for (let i = 0; i < mesh.count; i += 1) {
    z.push(mesh.positions[i * 3 + 2]);
    out.push(Math.hypot(mesh.positions[i * 3] - palm.x, mesh.positions[i * 3 + 1] - palm.y));
  }
  // Taller than a tree of its width would be, with nothing but the trunk below its head.
  assert.ok(Math.max(...z) > 6 && Math.max(...z) < 9, `${Math.max(...z)}`);
  assert.ok(out.every((far, i) => z[i] > 4.5 || far < 0.5), 'bare below the fronds');
  // The fronds reach out as far as the crown was seen to, and droop at their tips.
  assert.ok(near(Math.max(...out), 1.9, 0.2), `${Math.max(...out)}`);
  const tips = z.filter((_, i) => out[i] > 1.7);
  assert.ok(Math.max(...tips) < Math.max(...z) - 0.9, 'the tips hang below the top of the head');
});

test('cars are parked along residential streets, the same way every time, and every bus stop has a shelter', () => {
  const lines = [
    line('minor', [[0, 0], [300, 0]], { width: 7 }),
    line('primary', [[0, 100], [300, 100]], { oneway: 1, width: 12 }),
    line('minor', [[0, 200], [300, 200]], { tunnel: true, width: 7 }),
    line('service', [[0, 300], [300, 300]], { width: 4 }),
  ];
  // One stop on the south kerb of the main road, one on the north kerb of the residential street.
  const network = buildNetwork(lines, ORIGIN, { busStops: [place([150, 94]), place([200, 5])] });
  assert.deepEqual(network.ways.map((way) => way.width), [7, 12, 7, 4]);
  assert.deepEqual(network.ways[1].stops.map((stop) => [Math.round(stop.at), stop.side, stop.kerb]), [[150, 0, 1]]);
  assert.deepEqual(network.ways[0].stops.map((stop) => [Math.round(stop.at), stop.side, stop.kerb]), [[200, -1, -1]]);

  const mesh = new Mesh();
  const made = drawStreet(mesh, network, null, null);
  // Some 47 places on each kerb of the one open residential street, three in ten taken. None on the main road, in the tunnel or in the yard.
  assert.ok(made.parked >= 15 && made.parked <= 45, String(made.parked));
  assert.equal(made.shelters, 2);
  assert.equal(mesh.count, made.parked * 90 + 2 * 4 * 30, 'a car is three boxes, a shelter four');
  const corner = (i) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
  let north = 0;
  let south = 0;
  for (let i = 0; i < made.parked * 90; i += 1) {
    const [x, y, z] = corner(i);
    // At the kerb: between 1.8 m and 3.9 m from the middle of a 7 m street, clear of its corners, on the ground.
    assert.ok(Math.abs(y) > 1.8 && Math.abs(y) < 3.9 && x > 6 && x < 294 && z > 0.01 && z < 2, `${x}, ${y}, ${z}`);
    if (y > 0) {
      north += 1;
      assert.ok(Math.abs(x - 200) > 14 - 2.7, `nobody parks in the bus stop: ${x}`);
    } else {
      south += 1;
    }
  }
  assert.ok(north > 0 && south > 0 && (north + south) % 90 === 0, 'on both kerbs');
  // The shelters stand behind the kerb at their stops, as tall as a shelter.
  const shelter = { x: [], y: [], z: [] };
  for (let i = made.parked * 90; i < mesh.count; i += 1) {
    const [x, y, z] = corner(i);
    shelter.x.push(x);
    shelter.y.push(y);
    shelter.z.push(z);
  }
  assert.ok(shelter.y.every((y) => (y > 91 && y < 93.5) || (y > 4.2 && y < 6.6)), `${Math.min(...shelter.y)} to ${Math.max(...shelter.y)}`);
  assert.ok(shelter.x.every((x) => Math.abs(x - 150) < 2.5 || Math.abs(x - 200) < 2.5) && near(Math.max(...shelter.z), 2.45, 1e-6) && Math.min(...shelter.z) === 0);

  // The same street is furnished the same way every time, however the network was measured.
  const again = new Mesh();
  drawStreet(again, buildNetwork(lines, ORIGIN, { busStops: [place([150, 94]), place([200, 5])] }), null, null);
  assert.deepEqual(Array.from(again.positions.subarray(0, again.count * 3)), Array.from(mesh.positions.subarray(0, mesh.count * 3)));
  // With the sun out every car has a shade as well; and the cars can be capped.
  drawStreet(again, network, lightFrom({ azimuth: 180, altitude: 50 }), { bearing: 0, factor: 1 });
  assert.equal(again.count, made.parked * 96 + 2 * 4 * 30);
  assert.deepEqual(drawStreet(again, network, null, null, 5), { parked: 5, shelters: 2, bays: 0 });
  assert.deepEqual(drawStreet(again, buildNetwork([], ORIGIN), null, null), { parked: 0, shelters: 0, bays: 0 });
  assert.equal(again.count, 0);
});

test('in a car park cars stand in bays beside the lanes, wherever there is room for a bay', () => {
  const lines = [
    line('service', [[0, 0], [100, 0]], { width: 4, service: 'parking_aisle' }), // a lane of a car park
    line('service', [[0, 40], [100, 40]], { width: 4 }), // a service lane of no particular kind
    line('service', [[0, 80], [100, 80]], { width: 4, service: 'driveway' }), // somebody's drive
    line('primary', [[0, -12], [100, -12]], { width: 12 }), // a main road, close along the south side of the car park
  ];
  const network = buildNetwork(lines, ORIGIN);
  assert.deepEqual(network.ways.map((way) => way.service), ['parking_aisle', null, 'driveway', null]);
  // A building north of the car park's lane, from 60 m along it.
  const built = (x, y) => x >= 60 && x <= 100 && y >= 2 && y <= 30;
  const within = [-10, -50, 110, 120];

  const mesh = new Mesh();
  const made = drawStreet(mesh, network, null, null, 2500, { built, within });
  assert.equal(made.parked, made.bays, 'no kerb here to park at');
  // Bays are 2.7 m wide, from 7 m in to 7 m short of the end: 32 to a side. The car park's lane has them
  // on its north side only, as far as the building (20); the other lane on both sides (64).
  const lineCorners = 20 * 6; // a line between the bays of the car park proper, which are marked
  assert.equal(mesh.count, made.bays * 90 + lineCorners);
  assert.ok(made.bays >= 20 && made.bays <= 45, `six in ten of 20, three in ten of 64: ${made.bays}`);
  const rows = { park: 0, laneSouth: 0, laneNorth: 0, lines: 0 };
  for (let i = 0; i < mesh.count; i += 1) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    assert.ok(!built(x, y), `in the building: ${x}, ${y}`);
    assert.ok(x > 7 - 1.5 && x < 93 + 1.5, `clear of the ends of the lanes: ${x}`);
    if (near(z, 0.16, 1e-6) && y > 2.9 && y < 8.1) {
      rows.lines += 1; // a line of paint on the ground, the depth of a bay
      continue;
    }
    // A car stands across its bay, nose or tail to the lane: its middle 5.5 m from the middle of the lane.
    assert.ok(z > 0.01 && z < 2, `${z}`);
    if (Math.abs(y - 5.5) <= 2.7) rows.park += 1;
    else if (Math.abs(y - 34.5) <= 2.7) rows.laneSouth += 1;
    else if (Math.abs(y - 45.5) <= 2.7) rows.laneNorth += 1;
    else assert.fail(`a car out of its row: ${x}, ${y}`);
  }
  assert.equal(rows.lines, lineCorners);
  assert.ok(rows.park > 0 && rows.laneSouth > 0 && rows.laneNorth > 0, JSON.stringify(rows));
  assert.ok(rows.park / 90 >= 8 && rows.park / 90 <= 17, `about six bays in ten taken: ${rows.park / 90}`);
  // No two cars share a spot: their middles are at least a bay apart.
  const middles = [];
  for (let i = 0; i + 90 <= mesh.count; ) {
    if (near(mesh.positions[i * 3 + 2], 0.16, 1e-6) && near(mesh.positions[(i + 5) * 3 + 2], 0.16, 1e-6)) {
      i += 6;
      continue;
    }
    let x = 0;
    let y = 0;
    for (let k = 30; k < 60; k += 1) {
      x += mesh.positions[(i + k) * 3] / 30;
      y += mesh.positions[(i + k) * 3 + 1] / 30;
    }
    middles.push([x, y]);
    i += 90;
  }
  assert.equal(middles.length, made.bays);
  for (let a = 0; a < middles.length; a += 1) {
    for (let b = a + 1; b < middles.length; b += 1) assert.ok(Math.hypot(middles[a][0] - middles[b][0], middles[a][1] - middles[b][1]) > 2.5);
  }

  // The same car park is filled the same way every time.
  const again = new Mesh();
  assert.deepEqual(drawStreet(again, buildNetwork(lines, ORIGIN), null, null, 2500, { built, within }), made);
  assert.deepEqual(Array.from(again.positions.subarray(0, again.count * 3)), Array.from(mesh.positions.subarray(0, mesh.count * 3)));
  // Only on the ground the buildings are known for; and with no word about buildings at all, not anywhere.
  const part = drawStreet(again, network, null, null, 2500, { built, within: [-10, -50, 50, 120] });
  assert.ok(part.bays > 0 && part.bays < made.bays);
  for (let i = 0; i < again.count; i += 1) assert.ok(again.positions[i * 3] < 50 + 2.7);
  assert.deepEqual(drawStreet(again, network, null, null), { parked: 0, shelters: 0, bays: 0 });
  // Beside a lane that is no car park's, cars stand only where a building is near; a car park is a car park wherever it is.
  // (Here "near" is taken to be within 12 m, to tell the two ends of the lane apart; the app asks about 45 m.)
  const asked = new Set();
  const fromTheBuilding = (x, y) => Math.hypot(Math.max(60 - x, 0, x - 100), Math.max(2 - y, 0, y - 30));
  const few = drawStreet(again, network, null, null, 2500, { built, within, near: (x, y, reach) => asked.add(reach) && fromTheBuilding(x, y) <= 12 });
  assert.deepEqual([...asked], [45]);
  assert.ok(few.bays > 0 && few.bays < made.bays, `${few.bays} of ${made.bays}`);
  let inThePark = 0;
  for (let i = 0; i < again.count; i += 1) {
    const x = again.positions[i * 3];
    const y = again.positions[i * 3 + 1];
    if (Math.abs(y - 5.5) <= 2.7 || (y > 2.9 && y < 8.1)) inThePark += 1;
    else assert.ok(fromTheBuilding(x, y) <= 12 + 3, `a car out in the open: ${x}, ${y}`);
  }
  assert.equal(inThePark, rows.park + lineCorners, 'the car park itself is as full as before');
  // The cars can be capped, and each has its shade when the sun is out.
  assert.equal(drawStreet(again, network, null, null, 7, { built, within }).bays, 7);
  drawStreet(again, network, lightFrom({ azimuth: 180, altitude: 50 }), { bearing: 0, factor: 1 }, 2500, { built, within });
  assert.equal(again.count, made.bays * 96 + lineCorners);
});

test('on a residential street the moving cars keep clear of the parked ones', () => {
  const network = buildNetwork([line('minor', [[0, 0], [1000, 0]], { width: 7 }), line('minor', [[0, 100], [1000, 100]], { oneway: 1, width: 7 })], ORIGIN);
  const traffic = new Traffic({ seed: 8, now: () => MORNING });
  traffic.level = 6; // a busy day, so there is something to see
  traffic.setNetwork(network, [0, 0], ORIGIN);
  traffic.step(0.4);
  let seen = 0;
  traffic.eachVehicle((type, x, y, east) => {
    seen += 1;
    // Two-way: a metre to the right of the middle. One-way: down the middle.
    if (y < 50) assert.ok(near(y, east > 0 ? -1 : 1, 1e-9), `${y}`);
    else assert.ok(near(y, 100, 1e-9), `${y}`);
  });
  assert.ok(seen > 20, String(seen));
});

test('roofs get their furniture: stair head, tank and air conditioners on a house, plant on a large roof, more on a tower', () => {
  const rect = (x, y, width, depth) => [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth], [x, y]];
  const house = { ring: rect(0, 0, 14, 12), top: 9, kind: 'house', seed: 11 };
  const hall = { ring: rect(100, 0, 60, 40), top: 15, kind: 'block', seed: 12 };
  const tower = { ring: rect(300, 0, 40, 40), top: 120, kind: 'tower', seed: 13 };
  const shed = { ring: rect(200, 0, 5, 6), top: 4 }; // too small to bother with
  const mesh = new Mesh();
  assert.equal(drawRoofs(mesh, [house, hall, tower, shed, { ring: [[0, 0], [1, 1]], top: 5 }, { ring: rect(400, 0, 20, 20), top: 0 }], null), 3);
  const corners = { house: 0, hall: 0, tower: 0 };
  const tallest = { house: 0, hall: 0, tower: 0 };
  for (let i = 0; i < mesh.count; i += 1) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    // Everything stands on its roof, well inside its edge.
    const [name, roof] = x < 50 ? ['house', house] : x < 250 ? ['hall', hall] : ['tower', tower];
    const [[west, south], , [east, north]] = roof.ring;
    corners[name] += 1;
    tallest[name] = Math.max(tallest[name], z - roof.top);
    assert.ok(x > west + 0.5 && x < east - 0.5 && y > south + 0.5 && y < north - 0.5 && z >= roof.top - 1e-4, `${name}: ${x}, ${y}, ${z}`);
  }
  // A house: the room at the head of the stairs, as tall as a small room; perhaps a tank, air conditioners, an awning.
  assert.ok(corners.house >= 30 && corners.house % 6 === 0 && near(tallest.house, 2.5, 1e-4), `${corners.house} corners, ${tallest.house} m`);
  // A hall: cooling plant in rows, and the head of its stairs.
  assert.ok(corners.hall >= 3 * 30 && near(tallest.hall, 2.6, 1e-4), `${corners.hall} corners, ${tallest.hall} m`);
  // A tower: the lift's machine room, plant, and a mast on one this tall.
  assert.ok(corners.tower >= 3 * 30 && near(tallest.tower, 11, 1e-4), `${corners.tower} corners, ${tallest.tower} m`);
  // The same building is furnished the same way every time; another building of the same shape, otherwise.
  const again = new Mesh();
  drawRoofs(again, [house, hall, tower], null);
  assert.deepEqual(Array.from(again.positions.subarray(0, again.count * 3)), Array.from(mesh.positions.subarray(0, mesh.count * 3)));
  const other = new Mesh();
  drawRoofs(other, [{ ...house, seed: 5012 }], null);
  drawRoofs(again, [house], null);
  assert.notDeepEqual(Array.from(other.positions.subarray(0, 18)), Array.from(again.positions.subarray(0, 18)));
  // The head of the stairs is in the colour of the building's walls.
  drawRoofs(again, [{ ...house, wall: [200, 100, 50] }], null);
  assert.deepEqual([...again.colours.subarray(0, 4)], [160, 80, 40, 255], 'by night: an even light, eight tenths');
  // Lit by the sun, its faces differ.
  drawRoofs(again, [house], lightFrom({ azimuth: 135, altitude: 45 }));
  const shades = new Set();
  for (let i = 0; i < again.count; i += 6) shades.add(again.colours[i * 4]);
  assert.ok(shades.size >= 3, 'top, sunny side and far side');
  assert.equal(drawRoofs(again, [], null), 0);
  assert.equal(again.count, 0);
});

test('what stands on a roof throws its shade on the roof, and no further', () => {
  const rect = (x, y, width, depth) => [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth], [x, y]];
  const house = { ring: rect(0, 0, 14, 12), top: 9, kind: 'house', seed: 11 };
  const hall = { ring: rect(100, 0, 60, 40), top: 15, kind: 'block', seed: 12 };
  const mesh = new Mesh();
  const shade = new Mesh();
  // The sun low in the south-east: a shadow three metres long for each metre of height, falling north-west.
  const fall = [-2.1, 2.1];
  drawRoofs(mesh, [house, hall], lightFrom({ azimuth: 135, altitude: 20 }), { fall, shade });
  assert.ok(shade.count >= 6 && shade.count % 3 === 0, String(shade.count));
  let area = 0;
  for (let i = 0; i < shade.count; i += 1) {
    const x = shade.positions[i * 3];
    const y = shade.positions[i * 3 + 1];
    const z = shade.positions[i * 3 + 2];
    const roof = x < 50 ? house : hall;
    const [[west, south], , [east, north]] = roof.ring;
    // Just above its own roof, and cut off at the roof's edge however long the shadow.
    assert.ok(near(z, roof.top + 0.05, 1e-4) && x >= west - 1e-4 && x <= east + 1e-4 && y >= south - 1e-4 && y <= north + 1e-4, `${x}, ${y}, ${z}`);
    assert.deepEqual([...shade.colours.subarray(i * 4, i * 4 + 4)], [6, 8, 13, 107]);
    if (i % 3 === 0) {
      const p = (k) => [shade.positions[(i + k) * 3], shade.positions[(i + k) * 3 + 1]];
      area += Math.abs((p(1)[0] - p(0)[0]) * (p(2)[1] - p(0)[1]) - (p(2)[0] - p(0)[0]) * (p(1)[1] - p(0)[1])) / 2;
    }
  }
  assert.ok(area > 20, `more than the things themselves cover: ${area}`);
  // The mesh the shade goes into is added to, not emptied: the parapets' shade may be in it already.
  const before = shade.count;
  drawRoofs(mesh, [house], lightFrom({ azimuth: 135, altitude: 20 }), { fall, shade });
  assert.ok(shade.count > before);
  // By night there is no shade; nor without a mesh to put it in.
  const none = new Mesh();
  drawRoofs(mesh, [house, hall], null, { fall: null, shade: none });
  assert.equal(none.count, 0);
  assert.equal(drawRoofs(mesh, [house, hall], null, { fall }), 2);
});

test('hullOf finds the outline without dents round a set of points', () => {
  const hull = hullOf([[0, 0], [4, 0], [4, 3], [0, 3], [2, 1], [1, 2], [3, 3], [4, 0]]);
  assert.deepEqual(hull, [[0, 0], [4, 0], [4, 3], [0, 3]], 'anticlockwise from the lowest of the leftmost; what lies inside or along an edge is left out');
  // A box and the same box moved: six corners.
  const moved = hullOf([[0, 0], [2, 0], [2, 1], [0, 1], [3, 2], [5, 2], [5, 3], [3, 3]]);
  assert.equal(moved.length, 6);
  assert.deepEqual(hullOf([[1, 1], [2, 2]]), [[1, 1], [2, 2]]);
});

test('a bridge carries its road over the ground, with a ramp at either end, and the traffic goes up with it', () => {
  const lines = [
    line('primary', [[0, 0], [300, 0]], { oneway: 1, width: 12 }),
    line('primary', [[300, 0], [700, 0]], { oneway: 1, bridge: true, layer: 1, width: 12 }), // a flyover
    line('primary', [[700, 0], [1000, 0]], { oneway: 1, width: 12 }),
    line('minor', [[500, -100], [500, 100]], { width: 7 }), // the street it crosses, underneath
    line('trunk', [[300, 50], [500, 50]], { oneway: 1, bridge: true, layer: 2, width: 14 }), // a higher bridge, in two stretches
    line('trunk', [[500, 50], [700, 50]], { oneway: 1, bridge: true, layer: 2, width: 14 }),
    line('transit', [[0, 200], [400, 200]], { bridge: true }), // a metro viaduct
    line('minor', [[0, 300], [400, 300]], { bridge: true, width: 7 }), // a small bridge with a bus stop marked beside it
  ];
  const network = buildNetwork(lines, ORIGIN, { busStops: [place([200, 304])] });
  // Nothing on the ground is joined to what passes over it.
  assert.equal(network.ways.length, 8);
  const [before, flyover, after, under, highA, highB, viaduct, small] = network.ways;
  assert.deepEqual([before.deck, flyover.deck, after.deck, under.deck, highA.deck, viaduct.deck], [0, 6.5, 0, 0, 12, 8.5]);
  // A bridge comes down to the ground where the road carries on at ground level, and stays up where it carries on as a bridge.
  assert.deepEqual([flyover.rise, highA.rise, highB.rise, before.rise], [[0, 0], [0, 12], [12, 0], null]);
  assert.equal(heightAlong(before, 150), 0);
  assert.equal(heightAlong(flyover, 0), 0);
  assert.ok(near(heightAlong(flyover, 45), 3.25, 1e-9), 'half way up the 90 m ramp');
  assert.equal(heightAlong(flyover, 90), 6.5);
  assert.equal(heightAlong(flyover, 200), 6.5);
  assert.ok(near(heightAlong(flyover, 400 - 45), 3.25, 1e-9) && heightAlong(flyover, 400) === 0);
  assert.equal(heightAlong(highA, 200), 12);
  assert.equal(heightAlong(highB, 0), 12);
  assert.equal(heightAlong(viaduct, 200), 8.5);
  for (let s = 0; s <= 400; s += 10) assert.ok(heightAlong(flyover, s) >= 0 && heightAlong(flyover, s) <= 6.5);
  // No bus stops on a bridge, and nobody parks on one.
  assert.equal(small.stops.length, 0);
  const street = new Mesh();
  assert.deepEqual(drawStreet(street, buildNetwork([lines[7]], ORIGIN), null, null), { parked: 0, shelters: 0, bays: 0 });

  // A car on the flyover is drawn up on its deck; one on the street below, on the ground.
  const traffic = new Traffic({ seed: 2, most: 0, now: () => MORNING });
  traffic.setNetwork(network, [0, 0], ORIGIN);
  const car = (way, s) => ({ way, forward: true, s, lane: 0, offset: 0, wish: 10, speed: 10, type: 'car', paint: [1, 2, 3], cargo: [1, 2, 3], shown: 1, leaving: false });
  traffic.vehicles = [car(1, 200), car(3, 100), car(1, 45)];
  const lifts = [];
  traffic.eachVehicle((type, x, y, east, north, paint, cargo, shown, lift) => lifts.push(lift));
  assert.deepEqual(lifts.map((lift) => Math.round(lift * 100) / 100), [6.5, 0, 3.25]);
  const mesh = new Mesh();
  drawVehicle(mesh, 'car', 0, 0, 1, 0, [200, 100, 50], [0, 0, 0], 1, null, { bearing: 0, factor: 1 }, 1, 6.5);
  const heights = [];
  for (let i = 0; i < mesh.count; i += 1) heights.push(mesh.positions[i * 3 + 2]);
  assert.ok(near(Math.min(...heights), 6.52, 1e-4) && near(Math.max(...heights), 6.5 + 1.42, 1e-4), 'the car and its shade lie on the deck');
  // A train on the viaduct rides on it too.
  traffic.trains = [];
  traffic.startTrain(traffic.entries.find((entry) => entry.way === 6 && entry.atStart), 10, MORNING / 1000);
  const coaches = [];
  traffic.eachVehicle((type, x, y, east, north, paint, cargo, shown, lift) => type === 'coach' && coaches.push(lift));
  assert.ok(coaches.length === 3 && coaches.every((lift) => lift > 7.5 && lift <= 8.5), String(coaches));
});

test('drawBridges builds a deck with parapets and piers under every bridge', () => {
  const network = buildNetwork(
    [line('primary', [[0, 0], [300, 0]], { width: 12 }), line('primary', [[300, 0], [700, 0]], { bridge: true, layer: 1, width: 12 }), line('primary', [[700, 0], [1000, 0]], { width: 12 }), line('transit', [[0, 200], [400, 200]], { bridge: true }), line('minor', [[0, 400], [300, 400]], { bridge: true, tunnel: true })],
    ORIGIN,
  );
  const mesh = new Mesh();
  assert.equal(drawBridges(mesh, network, lightFrom({ azimuth: 135, altitude: 50 })), 2);
  const road = { x: [], y: [], z: [] };
  const rail = { x: [], y: [], z: [] };
  for (let i = 0; i < mesh.count; i += 1) {
    const [x, y, z] = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
    const part = y > 100 ? rail : road;
    part.x.push(x);
    part.y.push(y);
    part.z.push(z);
  }
  // The road deck: as long as the bridge, a little wider than the road, up to the top of its parapet.
  assert.ok(near(Math.min(...road.x), 300, 0.01) && near(Math.max(...road.x), 700, 0.01));
  assert.ok(near(Math.max(...road.y), 6.7, 0.01) && near(Math.min(...road.y), -6.7, 0.01), `${Math.min(...road.y)} to ${Math.max(...road.y)}`);
  assert.ok(near(Math.max(...road.z), 6.5 + 0.9, 1e-4) && Math.min(...road.z) === 0, 'from the foot of its piers to the top of its parapet');
  // The viaduct: narrower, and higher.
  assert.ok(near(Math.max(...rail.y), 202.7, 0.01) && near(Math.max(...rail.z), 8.5 + 0.9, 1e-4));
  // At its two ends the deck's flank comes down to the ground with the ramp. Between them only the piers
  // touch the ground, and they stand only where the deck is well clear of it: none in the first 50 m of a ramp.
  const piers = [];
  for (let i = 0; i < mesh.count; i += 1) {
    const x = mesh.positions[i * 3];
    if (mesh.positions[i * 3 + 2] === 0 && mesh.positions[i * 3 + 1] < 100 && x > 335 && x < 665) piers.push(x);
  }
  assert.ok(piers.length >= 8 * 8 && piers.every((x) => x > 350 && x < 650), `${piers.length} corners from ${Math.min(...piers)} to ${Math.max(...piers)}`);
  // A network with no bridge leaves the mesh empty.
  assert.equal(drawBridges(mesh, buildNetwork([line('primary', [[0, 0], [300, 0]])], ORIGIN), null), 0);
  assert.equal(mesh.count, 0);
});

test('a bridge hung from cables gets its masts and its fans of cables, and no piers', () => {
  // A motorway bridge running east, 800 m long, as two carriageways 20 m apart.
  const carriageways = [
    line('motorway', [[-600, -10], [-400, -10]], { oneway: 1 }),
    line('motorway', [[-400, -10], [400, -10]], { oneway: 1, bridge: true, layer: 1 }),
    line('motorway', [[400, -10], [600, -10]], { oneway: 1 }),
    line('motorway', [[600, 10], [400, 10]], { oneway: 1 }),
    line('motorway', [[400, 10], [-400, 10]], { oneway: 1, bridge: true, layer: 1 }),
    line('motorway', [[-400, 10], [-600, 10]], { oneway: 1 }),
  ];
  const network = buildNetwork(carriageways, ORIGIN);
  const bridge = { id: 'test', at: place([0, 0]), bearing: 90, masts: [-200, 200], mast: 96, cables: 22, reach: { bank: 168, span: 196 }, between: 10 };
  const [frame] = stayedHere(network, [bridge]);
  assert.ok(near(frame.x, 0, 0.01) && near(frame.y, 0, 0.01) && near(frame.east, 1, 1e-9) && near(frame.north, 0, 1e-9));
  assert.deepEqual([frame.from, frame.to], [-368, 368]);

  const plain = new Mesh();
  assert.equal(drawBridges(plain, network, lightFrom({ azimuth: 135, altitude: 50 })), 2);
  const mesh = new Mesh();
  assert.equal(drawBridges(mesh, network, lightFrom({ azimuth: 135, altitude: 50 }), [bridge]), 2);
  const corners = (from) => Array.from({ length: from.count }, (_, i) => [from.positions[i * 3], from.positions[i * 3 + 1], from.positions[i * 3 + 2]]);
  const all = corners(mesh);
  // The masts stand on the deck's centre line, 96 m above the deck.
  const high = all.filter(([, , z]) => z > 60);
  assert.ok(near(Math.max(...high.map(([, , z]) => z)), 6.5 + 96, 1e-3), `${Math.max(...high.map(([, , z]) => z))}`);
  assert.ok(high.every(([x, y]) => Math.abs(y) < 2 && (Math.abs(x + 200) < 196 || Math.abs(x - 200) < 196)), 'nothing but masts and cables up there');
  const heads = all.filter(([, , z]) => near(z, 102.5, 1e-3));
  assert.deepEqual([...new Set(heads.map(([x]) => Math.round(x / 10) * 10))].sort((a, b) => a - b), [-200, 200]);
  // Every cable comes down to the middle of the deck (which near the banks is already on its way down to the
  // ground): the farthest 168 m out towards a bank, 196 m towards the middle of the bridge.
  const ends = all.filter(([x, y, z]) => Math.abs(y) < 0.3 && z < 7.4 && Math.abs(Math.abs(x) - 200) > 13 && z !== 6.8);
  const anchors = ends.map(([x]) => x);
  assert.ok(near(Math.min(...anchors), -368, 0.01) && near(Math.max(...anchors), 368, 0.01), `${Math.min(...anchors)} to ${Math.max(...anchors)}`);
  assert.ok(anchors.some((x) => near(x, -4, 0.01)) && anchors.some((x) => near(x, 4, 0.01)), 'the two inner fans all but meet in the middle of the main span');
  assert.ok(ends.filter(([x]) => Math.abs(x) < 300).every(([, , z]) => near(z, 6.5 + 0.6, 0.29)), 'on the level deck a cable ends just above it');
  // 2 masts × 2 fans × 22 cables, each two crossed ribbons along the deck's centre line.
  assert.equal(all.filter(([, y]) => Math.abs(y) < 0.3).length, 2 * 2 * 22 * 12);
  // On the ground under the hung spans stand only the two broad piers under the masts; a plain bridge has one every 30 m.
  const grounded = (from) => corners(from).filter(([x, , z]) => z === 0 && Math.abs(x) < 340).map(([x]) => Math.round(x));
  assert.ok(grounded(plain).length > 20 * 8);
  assert.deepEqual([...new Set(grounded(mesh).map((x) => Math.sign(x) * 200))].sort((a, b) => a - b), [-200, 200]);
  assert.ok(grounded(mesh).every((x) => Math.abs(Math.abs(x) - 200) <= 3), JSON.stringify([...new Set(grounded(mesh))]));

  // A bridge whose deck is not on the map here, or that is far away, is left alone.
  assert.equal(stayedHere(network, [{ ...bridge, at: place([0, 300]) }]).length, 0);
  assert.equal(stayedHere(network, [{ ...bridge, at: place([20000, 0]) }]).length, 0);
  assert.equal(stayedHere(buildNetwork([line('motorway', [[-600, -10], [600, -10]], { oneway: 1 })], ORIGIN), [bridge]).length, 0);
  assert.equal(stayedHere(null, [bridge]).length, 0);
});

test('drawMarks paints the lanes of the main roads, and a crossing where a street meets a larger one', () => {
  const lines = [
    line('primary', [[0, 0], [300, 0]], { width: 12 }), // a main road with traffic both ways: two lanes each
    line('primary', [[300, 0], [600, 0]], { width: 12 }),
    line('minor', [[300, 0], [300, 200]], { width: 7 }), // a side street off it
    line('trunk', [[0, 400], [400, 400]], { oneway: 1, width: 14 }), // one carriageway of three lanes
    line('minor', [[0, 600], [300, 600]], { width: 7 }), // side streets have no lines
    line('minor', [[150, 600], [150, 800]], { width: 7 }), // nor a crossing where they meet each other
    line('primary', [[0, 900], [300, 900]], { width: 12, tunnel: true }),
    line('primary', [[0, 1000], [300, 1000]], { width: 12, bridge: true, layer: 1 }),
    line('transit', [[0, 1100], [300, 1100]]),
  ];
  const network = buildNetwork(lines, ORIGIN);
  const mesh = new Mesh();
  const made = drawMarks(mesh, network);
  assert.deepEqual(made, { lines: 3, crossings: 1 });
  const corners = Array.from({ length: mesh.count }, (_, i) => ({ x: mesh.positions[i * 3], y: mesh.positions[i * 3 + 1], z: mesh.positions[i * 3 + 2], paint: Array.from(mesh.colours.subarray(i * 4, i * 4 + 4)) }));
  assert.ok(corners.every((corner) => near(corner.z, 0.16, 1e-6)), 'flat on the road, just clear of the shadows');
  assert.ok(corners.every((corner) => corner.y < 700), 'nothing in the tunnel, on the bridge or on the track');
  assert.ok(!corners.some((corner) => corner.y > 500), 'and nothing on the side streets among themselves');

  // The main road: a yellow line down its middle, a line along each edge, and a broken line between the two lanes each way.
  const main = corners.filter((corner) => corner.y < 10 && corner.y > -10 && corner.x < 280);
  const yellow = main.filter((corner) => corner.paint[0] > corner.paint[2] + 80);
  assert.ok(yellow.length > 0 && yellow.every((corner) => Math.abs(corner.y) <= 0.1), 'the middle line');
  const offsets = [...new Set(main.filter((corner) => corner.paint[0] <= corner.paint[2] + 80).map((corner) => Math.round(Math.abs(corner.y) * 10) / 10))].sort((a, b) => a - b);
  // Between lanes at 3.4 m from the middle (7 cm either side of it), and the edges just inside the 12 m the road is drawn at.
  assert.deepEqual(offsets, [3.3, 3.5, 5.6, 5.7], JSON.stringify(offsets));
  // Lines keep 8 m clear of the ends of a stretch, where the junctions are.
  assert.ok(near(Math.min(...main.map((corner) => corner.x)), 8, 0.01), `${Math.min(...main.map((corner) => corner.x))}`);
  // The broken line: 3 m of paint every 9 m.
  const dashes = main.filter((corner) => near(Math.abs(corner.y), 3.4, 0.11) && corner.y > 0).map((corner) => corner.x);
  assert.ok(dashes.includes(8) && dashes.includes(11) && !dashes.some((x) => x > 11.01 && x < 16.99) && dashes.includes(17));

  // The carriageway of three lanes: two broken lines, 1.7 m either side of its middle, and no yellow.
  const trunk = corners.filter((corner) => corner.y > 390 && corner.y < 410);
  assert.ok(!trunk.some((corner) => corner.paint[0] > corner.paint[2] + 80));
  const lanes = [...new Set(trunk.map((corner) => Math.round((corner.y - 400) * 10) / 10))].sort((a, b) => a - b);
  assert.deepEqual(lanes, [-5.4, -5.3, -1.8, -1.6, 1.6, 1.8, 5.3, 5.4], JSON.stringify(lanes));

  // The crossing: over the mouth of the side street, just outside the main road, stripes 3 m long across its 7 m.
  const zebra = corners.filter((corner) => corner.x > 290 && corner.x < 310 && corner.y > 7 && corner.y < 50);
  assert.ok(zebra.length >= 6 * 6, `${zebra.length} corners`);
  assert.ok(near(Math.min(...zebra.map((corner) => corner.y)), 7.5, 0.01) && near(Math.max(...zebra.map((corner) => corner.y)), 10.5, 0.01));
  assert.ok(Math.min(...zebra.map((corner) => corner.x)) >= 296.9 && Math.max(...zebra.map((corner) => corner.x)) <= 303.1);
  // The main road itself is not crossed at a side street.
  assert.ok(!corners.some((corner) => Math.abs(corner.y) > 0.6 && Math.abs(corner.y) < 3 && corner.x > 280 && corner.x < 320), 'no stripes between its lines');

  // Where two main roads cross, all four arms are.
  const cross = buildNetwork([line('primary', [[0, 0], [200, 0]], { width: 12 }), line('primary', [[200, 0], [400, 0]], { width: 12 }), line('secondary', [[200, -200], [200, 0]], { width: 12 }), line('secondary', [[200, 0], [200, 200]], { width: 12 })], ORIGIN);
  assert.equal(drawMarks(mesh, cross).crossings, 4);
  // A network with no streets leaves the mesh empty.
  assert.deepEqual(drawMarks(mesh, buildNetwork([line('transit', [[0, 0], [300, 0]])], ORIGIN)), { lines: 0, crossings: 0 });
  assert.equal(mesh.count, 0);
});

test('streetNear finds the place on the nearest street', () => {
  const network = buildNetwork([line('primary', [[0, 0], [300, 0]]), line('minor', [[100, 50], [100, 300]]), line('transit', [[0, 10], [300, 10]])], ORIGIN);
  const found = streetNear(network, 150, 12);
  assert.ok(near(found.x, 150) && near(found.y, 0) && near(found.distance, 12) && near(Math.abs(found.east), 1) && near(found.north, 0), JSON.stringify(found));
  const side = streetNear(network, 104, 200);
  assert.ok(near(side.x, 100) && near(side.y, 200) && near(side.distance, 4));
  assert.equal(streetNear(network, 600, 600), null);
  assert.equal(streetNear(network, 150, 100, 20), null, 'nothing within reach');
});

test('streetDirection says which way the nearest street runs', () => {
  const network = buildNetwork([line('primary', [[0, 0], [300, 0]]), line('minor', [[100, 50], [100, 300]]), line('transit', [[0, 10], [300, 10]]), line('minor', [[0, -40], [300, -40]], { tunnel: true })], ORIGIN);
  assert.deepEqual(streetDirection(network, 150, 12).map((value) => Math.round(Math.abs(value))), [1, 0], 'the main road, not the track beside it');
  assert.deepEqual(streetDirection(network, 104, 200).map((value) => Math.round(Math.abs(value))), [0, 1]);
  assert.deepEqual(streetDirection(network, 150, -30).map((value) => Math.round(Math.abs(value))), [1, 0], 'not the tunnel underneath');
  assert.equal(streetDirection(network, 600, 600), null);
  assert.equal(streetDirection(network, 150, 100, 20), null, 'nothing within reach');
});

test('a station gets a vaulted roof in place of roof furniture', () => {
  const hall = [[0, 0], [120, 0], [120, 20], [0, 20], [0, 0]];
  const mesh = new Mesh();
  assert.equal(drawRoofs(mesh, [{ ring: hall, top: 13, vault: true }], lightFrom({ azimuth: 180, altitude: 50 })), 1);
  const x = [];
  const y = [];
  const z = [];
  for (let i = 0; i < mesh.count; i += 1) {
    x.push(mesh.positions[i * 3]);
    y.push(mesh.positions[i * 3 + 1]);
    z.push(mesh.positions[i * 3 + 2]);
  }
  // The length of the hall and a little over, from its eaves up to the ridge along its middle.
  assert.ok(near(Math.min(...x), -1.2, 1e-4) && near(Math.max(...x), 121.2, 1e-4) && near(Math.min(...y), -1.2, 1e-4) && near(Math.max(...y), 21.2, 1e-4));
  assert.ok(near(Math.min(...z), 13, 1e-4) && near(Math.max(...z), 13 + 11.2 * 0.36, 1e-3), `${Math.max(...z)}`);
  const ridge = y[z.indexOf(Math.max(...z))];
  assert.ok(near(ridge, 10, 1e-3), 'the ridge runs down the middle');
  assert.equal(mesh.count, 8 * 3 * 6, 'eight strips, each with its piece of the two ends');
});
