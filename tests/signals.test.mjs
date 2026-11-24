import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SIGNALS_KEPT_MS, packSignals, signalPoints, signalQuery, unpackSignals } from '../js/lib.js';
import { Mesh, Traffic, VEHICLES, buildNetwork, pointAlong } from '../js/life.js';
import { LIT, SIGNAL_TIMES, drawSignalLamps, drawSignals, greenSeconds, lampOf, lampPlace, signalState, signalsOf, untilRed } from '../js/signals.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180)); // degrees of longitude in a metre
const NORTH = 1 / 111320;
/** A line through points given in metres east and north of the origin. */
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
const near = (a, b, by = 0.01) => Math.abs(a - b) <= by;
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 4)]);
const signalsFor = (lines, options) => {
  const network = buildNetwork(lines, ORIGIN);
  return { network, signals: signalsOf(network, options) };
};
/** Two roads with traffic both ways, crossing at the origin: a main road east and west, a lesser one north and south. */
const CROSS = [line('primary', [[-600, 0], [600, 0]]), line('secondary', [[0, -600], [0, 600]])];
/** Two roads with a median each: four carriageways, crossing at four corners twenty metres apart. */
const BOX = [
  line('primary', [[-600, -10], [600, -10]], { oneway: 1 }),
  line('primary', [[600, 10], [-600, 10]], { oneway: 1 }),
  line('primary', [[10, -600], [10, 600]], { oneway: 1 }),
  line('primary', [[-10, 600], [-10, -600]], { oneway: 1 }),
];
/** The moment, in seconds, at which an approach's signal has just come to a state that it then keeps for at least so long. */
function momentOf(approach, state, lasting = 0) {
  const { cycle } = approach.junction;
  for (let t = 1000; t < 1000 + cycle * 2; t += 0.25) {
    if (signalState(approach, t) !== state || signalState(approach, t - 0.25) === state) continue;
    if (signalState(approach, t + lasting) === state) return t;
  }
  throw new Error(`never ${state} for ${lasting} s`);
}

test('signals stand where two main roads cross on the level, and nowhere else', () => {
  // A crossroads of two roads: one junction, an approach from each of the four sides.
  const cross = signalsFor(CROSS).signals;
  assert.equal(cross.junctions.length, 1);
  assert.equal(cross.approaches.length, 4);
  assert.deepEqual(cross.approaches.map((approach) => [approach.way, approach.forward]).sort(), [[0, true], [1, false], [2, true], [3, false]]);
  assert.ok(near(cross.junctions[0].x, 0, 0.1) && near(cross.junctions[0].y, 0, 0.1));
  // Two roads with medians cross at four corners: still one junction, with one approach along each carriageway;
  // the short links between the corners are inside it, and have no signal.
  const box = signalsFor(BOX);
  assert.equal(box.signals.junctions.length, 1);
  assert.equal(box.signals.approaches.length, 4);
  assert.ok(box.signals.approaches.every((approach) => box.network.ways[approach.way].length > 500), 'none on a link between the corners');
  const headings = box.signals.approaches.map((approach) => `${Math.round(approach.east)},${Math.round(approach.north)}`).sort();
  assert.deepEqual(headings, ['-1,0', '0,-1', '0,1', '1,0']);
  // The map gives a carriageway in pieces, and one may end between two of the corners: what lies between
  // them is inside the junction all the same, and has no stop line of its own.
  const pieces = signalsFor([line('primary', [[-600, -10], [0, -10]], { oneway: 1 }), line('primary', [[0, -10], [600, -10]], { oneway: 1 }), ...BOX.slice(1)]);
  assert.equal(pieces.network.ways.length, box.network.ways.length + 1);
  assert.equal(pieces.signals.junctions.length, 1);
  assert.equal(pieces.signals.approaches.length, 4);
  assert.ok(pieces.signals.approaches.every((approach) => pieces.network.ways[approach.way].length > 500), 'none between the corners');
  // An opening in a median, where a street comes out across a main road: both carriageways stop for it.
  const opening = signalsFor([line('primary', [[-600, -10], [600, -10]], { oneway: 1 }), line('primary', [[600, 10], [-600, 10]], { oneway: 1 }), line('secondary', [[0, -600], [0, 10]])]).signals;
  assert.equal(opening.junctions.length, 1);
  assert.equal(opening.approaches.length, 3);
  // No signal where a street can only turn into the carriageway it meets (the median is closed); where a slip
  // road joins; where side streets cross, or two collectors; where one road passes over the other; at a roundabout.
  const none = (lines) => assert.equal(signalsFor(lines).signals.junctions.length, 0);
  none([line('primary', [[-600, -10], [600, -10]], { oneway: 1 }), line('primary', [[600, 10], [-600, 10]], { oneway: 1 }), line('secondary', [[0, -600], [0, -10]])]);
  none([line('primary', [[-600, 0], [600, 0]], { oneway: 1 }), line('primary', [[-200, -60], [0, 0]], { oneway: 1 })]);
  none([line('minor', [[-600, 0], [600, 0]]), line('minor', [[0, -600], [0, 600]])]);
  none([line('tertiary', [[-600, 0], [600, 0]]), line('tertiary', [[0, -600], [0, 600]])]);
  none([line('primary', [[-600, 0], [600, 0]], { bridge: true, layer: 1 }), line('secondary', [[0, -600], [0, 600]])]);
  none([line('primary', [[-600, 0], [600, 0]], { tunnel: true }), line('secondary', [[0, -600], [0, 600]])]);
  const ring = [];
  for (let k = 0; k <= 16; k += 1) ring.push([Math.cos((k / 16) * 2 * Math.PI) * 25, Math.sin((k / 16) * 2 * Math.PI) * 25]);
  none([line('secondary', ring, { oneway: 1 }), line('secondary', [[-600, 0], [-25, 0]]), line('secondary', [[25, 0], [600, 0]]), line('secondary', [[0, -600], [0, -25]]), line('secondary', [[0, 25], [0, 600]])]);
  // The roads beside a great road are drawn on the map as its slip roads: where one crosses a street, there is a signal.
  const beside = signalsFor([line('primary', [[-600, 0], [600, 0]], { oneway: 1, ramp: true }), line('secondary', [[0, -600], [0, 600]], { oneway: 1 })]).signals;
  assert.equal(beside.junctions.length, 1);
  assert.equal(beside.approaches.length, 2);
  // A main road and a collector: a signal, unless the map is known to mark none there.
  const collector = [line('secondary', [[-600, 0], [600, 0]]), line('tertiary', [[0, -600], [0, 600]])];
  assert.equal(signalsFor(collector).signals.junctions.length, 1);
  assert.equal(signalsFor(collector).signals.junctions[0].marked, false);
  const everywhere = () => true;
  assert.equal(signalsFor(collector, { marks: { points: [[900, 900]], within: everywhere } }).signals.junctions.length, 0);
  // Where the map marks one, there is one: the mark may stand at the junction or on the road just before it.
  const marked = signalsFor(collector, { marks: { points: [[-14, 2]], within: everywhere } }).signals;
  assert.equal(marked.junctions.length, 1);
  assert.equal(marked.junctions[0].marked, true);
  // Two main roads keep theirs, whatever the map says; and outside what the map is known for, the rule holds.
  assert.equal(signalsFor(CROSS, { marks: { points: [], within: everywhere } }).signals.junctions.length, 1);
  assert.equal(signalsFor(collector, { marks: { points: [[900, 900]], within: () => false } }).signals.junctions.length, 1);
  // A mark where a main road ends on another (nothing crosses there): a signal all the same. One in mid-block: none.
  const tee = [line('primary', [[-600, 0], [600, 0]]), line('secondary', [[0, -600], [0, 0]])];
  assert.equal(signalsFor(tee).signals.junctions.length, 0);
  assert.equal(signalsFor(tee, { marks: { points: [[3, -4]], within: everywhere } }).signals.junctions.length, 1);
  assert.equal(signalsFor(tee, { marks: { points: [[300, 0]], within: everywhere } }).signals.junctions.length, 0);
});

test('each side of a junction has its own green, in turn: green, three flashes, yellow, red', () => {
  const { signals } = signalsFor(CROSS);
  const [junction] = signals.junctions;
  // Four sides, each with its green (the main road's the longer), a yellow of three seconds and two of all at red.
  assert.equal(greenSeconds(2, 3), 28);
  assert.equal(greenSeconds(2, 2), 24);
  assert.ok(greenSeconds(1, 1) === 18 && greenSeconds(6, 4) === 42);
  assert.deepEqual(signals.approaches.map((approach) => approach.green).sort(), [24, 24, 28, 28]);
  assert.equal(junction.cycle, 2 * (28 + 24) + 4 * (SIGNAL_TIMES.yellow + SIGNAL_TIMES.clear));
  assert.equal(new Set(signals.approaches.map((approach) => approach.from)).size, 4, 'no two begin together');
  // Through a whole cycle: never two sides green together; each has its green once, for as long as it should;
  // after it the yellow, and then red until its turn comes round again.
  const seen = new Map(signals.approaches.map((approach) => [approach, { green: 0, flash: 0, yellow: 0, red: 0 }]));
  for (let t = 0; t < junction.cycle; t += 0.25) {
    const going = signals.approaches.filter((approach) => signalState(approach, 5000 + t) !== 'red');
    assert.ok(going.length <= 1, `${going.length} sides going at once`);
    for (const approach of signals.approaches) seen.get(approach)[signalState(approach, 5000 + t)] += 0.25;
  }
  for (const [approach, times] of seen) {
    assert.ok(near(times.green + times.flash, approach.green) && near(times.flash, SIGNAL_TIMES.flash) && near(times.yellow, SIGNAL_TIMES.yellow), JSON.stringify(times));
    assert.ok(near(times.red, junction.cycle - approach.green - SIGNAL_TIMES.yellow));
  }
  // They go round the junction: the next to have green comes from the quarter beside the last.
  const order = [...signals.approaches].sort((a, b) => a.from - b.from).map((approach) => (Math.round((Math.atan2(approach.east, approach.north) * 180) / Math.PI) + 360) % 360);
  assert.deepEqual(order, [90, 180, 270, 0], 'heading east, then south, then west, then north');
  // The lamps: green; then the green three times on and off; yellow; red.
  const approach = signals.approaches[0];
  const start = momentOf(approach, 'green');
  assert.equal(lampOf(approach, start + 1), 2);
  const flashing = start + approach.green - SIGNAL_TIMES.flash;
  assert.deepEqual([0.1, 0.6, 1.1, 1.6, 2.1, 2.6].map((into) => lampOf(approach, flashing + into)), [2, -1, 2, -1, 2, -1]);
  assert.equal(signalState(approach, flashing + 0.6), 'flash');
  assert.equal(lampOf(approach, start + approach.green + 1), 1);
  assert.equal(lampOf(approach, start + approach.green + SIGNAL_TIMES.yellow + 1), 0);
  assert.equal(signals.state, signalState);
  // A junction keeps its time however the streets round it are measured: read again from another spot, it is where it was.
  const moved = signalsOf(buildNetwork(CROSS, { lng: ORIGIN.lng + 0.01, lat: ORIGIN.lat - 0.004 }));
  const same = moved.approaches.find((other) => other.rank === approach.rank && Math.round(other.east) === Math.round(approach.east) && Math.round(other.north) === Math.round(approach.north));
  for (const t of [0, 17.5, 60, 99]) assert.equal(signalState(same, 7000 + t), signalState(approach, 7000 + t));
  // Where roads come in askew, what goes together still comes from one side: no two with a green at once
  // head more than sixty degrees apart (they would cross), and what heads nearly the same way shares its green.
  const turn = (degrees) => [-Math.sin((degrees * Math.PI) / 180) * 600, -Math.cos((degrees * Math.PI) / 180) * 600];
  const askew = signalsFor([...CROSS, line('secondary', [turn(46), [0, 0]], { oneway: 1 }), line('secondary', [turn(134), [0, 0]], { oneway: 1 })]).signals;
  assert.equal(askew.junctions.length, 1);
  const heading = (one) => (Math.round((Math.atan2(one.east, one.north) * 180) / Math.PI) + 360) % 360;
  assert.deepEqual(askew.approaches.map(heading).sort((a, b) => a - b), [0, 46, 90, 134, 180, 270]);
  const apart = (a, b) => Math.min((heading(a) - heading(b) + 360) % 360, (heading(b) - heading(a) + 360) % 360);
  for (const a of askew.approaches) {
    for (const b of askew.approaches) if (a.from === b.from) assert.ok(apart(a, b) <= 60, `${heading(a)} and ${heading(b)} go together`);
  }
  const fromOf = (degrees) => askew.approaches.find((one) => heading(one) === degrees).from;
  assert.notEqual(fromOf(46), fromOf(134), 'these two cross');
  assert.equal(fromOf(0), fromOf(46));
  assert.equal(fromOf(90), fromOf(134));
  assert.equal(new Set(askew.approaches.map((one) => one.from)).size, 4, 'four sides');
  for (let t = 0; t < askew.junctions[0].cycle; t += 0.5) {
    const going = askew.approaches.filter((one) => signalState(one, 300 + t) !== 'red');
    for (const a of going) for (const b of going) assert.ok(apart(a, b) <= 60);
  }
  // Two junctions do not change together.
  const two = signalsFor([line('primary', [[-600, 0], [900, 0]]), line('secondary', [[0, -600], [0, 600]]), line('secondary', [[400, -600], [400, 600]])]).signals;
  assert.equal(two.junctions.length, 2);
  assert.notEqual(Math.round(two.junctions[0].offset), Math.round(two.junctions[1].offset));
});

test('a signal stands at the stop line: a post by the kerb with an arm over the lanes, heads on the arm and on the post', () => {
  const { network, signals } = signalsFor(CROSS);
  // The approach from the west, along the main road: traffic both ways, so its lanes are the right-hand half.
  const approach = signals.approaches.find((one) => one.way === 0 && one.forward);
  const way = network.ways[0];
  assert.ok(near(approach.east, 1) && near(approach.north, 0) && near(approach.left, 0) && near(approach.right, way.width / 2));
  // The line is drawn clear of the road that crosses and of the zebra crossing in front of it.
  assert.ok(near(way.length - approach.stop, way.width / 2 + 1.5 + 3 + 1, 0.01) && near(approach.x, -(way.width / 2 + 5.5), 0.01) && near(approach.y, 0, 0.01));
  const mine = { posts: signals.posts.filter((post) => near(post.east, 1) && near(post.north, 0)), heads: signals.heads.filter((head) => head.approach === approach) };
  // One post, on the right of the traffic (the south side, heading east), just off the road; its arm reaches back over the lanes.
  assert.equal(mine.posts.length, 1);
  const [post] = mine.posts;
  assert.ok(near(post.x, approach.x, 0.01) && post.y < -way.width / 2 && post.y > -way.width / 2 - 1.5 && post.tall > 6.5);
  assert.ok(near(post.arm[0], post.x, 0.01) && post.arm[1] > post.y + 3 && post.arm[1] < 0.5, 'the arm ends over its own half of the road');
  // Two heads: one lying flat on the arm, over the lanes; one upright on the post. Both a little towards the traffic.
  assert.deepEqual(mine.heads.map((head) => head.flat), [true, false]);
  const [flat, upright] = mine.heads;
  assert.ok(flat.z > 6 && flat.y < 0 && flat.y > post.y && flat.x < approach.x && upright.z > 3 && upright.z < 4.5 && near(upright.y, post.y, 0.01));
  // Their lamps look back at the traffic that comes: upright the red is on top, lying flat it is on the driver's left.
  const [red, yellow, green] = [0, 1, 2].map((which) => lampPlace(upright, which));
  assert.ok(red[2] > yellow[2] && yellow[2] > green[2] && red[0] < upright.x && near(red[1], yellow[1], 1e-9));
  const along = [0, 1, 2].map((which) => lampPlace(flat, which));
  assert.ok(along[0][1] > along[1][1] && along[1][1] > along[2][1] && near(along[0][2], along[2][2], 1e-9), 'red to the north: the left of a driver heading east');
  // A wide carriageway has two heads on its arm, and a second post on its median with one more.
  const wide = signalsFor([
    line('primary', [[-600, -10], [600, -10]], { oneway: 1, width: 14, lanes: 4 }),
    line('primary', [[600, 10], [-600, 10]], { oneway: 1 }),
    line('primary', [[10, -600], [10, 600]], { oneway: 1 }),
    line('primary', [[-10, 600], [-10, -600]], { oneway: 1 }),
  ]);
  const broad = wide.signals.approaches.find((one) => wide.network.ways[one.way].width === 14);
  const hung = wide.signals.heads.filter((head) => head.approach === broad);
  assert.ok(near(broad.left, -7) && near(broad.right, 7));
  assert.equal(hung.filter((head) => !head.flat).length, 2, 'one on the kerb post, one on the median');
  assert.ok(hung.filter((head) => head.flat).length >= 1);

  // Drawn: the stop lines, the posts and arms, the heads on their boards, every lamp unlit.
  const mesh = new Mesh();
  const made = drawSignals(mesh, signals, null);
  assert.deepEqual(made, { junctions: 1, approaches: 4, posts: 4, heads: 8 });
  // (A stop line is one face; a post five and its arm five; a head its box of five, its board, and three lenses of six-sided faces.)
  assert.equal(mesh.count, 4 * 6 + 4 * (30 + 30) + 8 * (30 + 6 + 3 * 18));
  const all = corners(mesh);
  const lineOf = all.slice(0, 24).filter((corner) => near(corner[0], approach.x, 0.3));
  assert.ok(lineOf.length === 6 && lineOf.every((corner) => corner[2] < 0.3 && corner[1] <= 0.01 && corner[1] > -way.width / 2 && corner[3] > 200), 'white, across its own lanes only');
  assert.ok(all.slice(24).every((corner) => corner[2] >= 0 && corner[2] < 9), 'nothing below the ground');
  assert.ok(!all.some((corner) => corner[3] > 240 && corner[4] < 80), 'no lamp lit');
  assert.deepEqual(drawSignals(mesh, null), { junctions: 0, approaches: 0, posts: 0, heads: 0 });
  assert.equal(mesh.count, 0);

  // The lamps that are lit: one to a head, in its colour, where its lamp is; and a point of light for each.
  const [lamps, points] = [new Mesh(), new Mesh()];
  const going = momentOf(approach, 'green', 5);
  assert.equal(drawSignalLamps(lamps, points, signals, going + 1), 8);
  assert.equal(lamps.count, 8 * 18);
  assert.equal(points.count, 8);
  const lit = corners(lamps);
  const greens = lit.filter((corner) => corner[4] > 200 && corner[3] < 80);
  const reds = lit.filter((corner) => corner[3] > 200 && corner[4] < 80);
  assert.ok(greens.length === 2 * 18 && reds.length === 6 * 18, 'green for the one side, red for the other three');
  const place = lampPlace(upright, 2);
  assert.ok(greens.some((corner) => Math.hypot(corner[0] - place[0], corner[1] - place[1], corner[2] - place[2]) < 0.05));
  assert.deepEqual(corners(points).map((corner) => corner.slice(3, 6)).filter((colour) => colour[1] > 200).length, 2);
  assert.deepEqual(LIT.map((colour) => colour.indexOf(Math.max(...colour))), [0, 0, 1], 'red, yellow (red and green), green');
  // Between two flashes of the green its heads show nothing.
  const off = going + approach.green - SIGNAL_TIMES.flash + 0.6;
  assert.equal(drawSignalLamps(lamps, points, signals, off), 6);
  // Seen from somewhere, only the heads that look that way show their light: from the west, those of the approach from the west.
  assert.equal(drawSignalLamps(lamps, points, signals, going + 1, { eye: [-400, -5, 120] }), 2);
  assert.ok(corners(lamps).every((corner) => corner[4] > 200), 'its two, green');
  assert.equal(drawSignalLamps(lamps, points, null, going), 0);
  assert.ok(lamps.count === 0 && points.count === 0);
});

/** The traffic of a network with its signals, with no vehicles but those put on it by hand, and a clock to set. */
function quietTraffic(lines) {
  const network = buildNetwork(lines, ORIGIN);
  const signals = signalsOf(network);
  const clock = { at: 0 };
  const traffic = new Traffic({ seed: 4, most: 0, now: () => clock.at * 1000 });
  traffic.setNetwork(network, [0, 0], ORIGIN);
  traffic.setSignals(signals);
  traffic.fill = () => {}; // (nobody is added, and nobody is sent away for being one too many)
  const run = (seconds) => {
    for (let t = 0; t < seconds; t += 0.1) {
      clock.at += 0.1;
      traffic.step(0.1);
    }
  };
  const car = (way, s, more = {}) => {
    const vehicle = { way, forward: true, s, lane: 0, offset: 0, wish: 14, speed: 14, type: 'car', paint: [1, 2, 3], cargo: [1, 2, 3], shown: 1, leaving: false, ...more };
    traffic.vehicles.push(vehicle);
    return vehicle;
  };
  return { network, signals, traffic, clock, run, car };
}
/** How far a vehicle's nose is short of the stop line of its approach. */
const shortOf = (vehicle, approach) => approach.stop - vehicle.s - VEHICLES[vehicle.type].length / 2;

test('the traffic stops at a red light, queues behind whoever has stopped, and goes when it is green', () => {
  const { signals, clock, run, car } = quietTraffic(CROSS);
  const approach = signals.byWay.get(0 * 2 + 1); // from the west, heading east
  clock.at = momentOf(approach, 'red', 60);
  // Five cars in one lane, coming up to the red light, all meaning to drive straight on.
  const cars = [450, 425, 400, 375, 350].map((s) => car(0, s, { onward: { way: 1, atStart: true } }));
  run(45);
  assert.ok(cars.every((one) => one.speed === 0 && one.way === 0), 'all stand');
  const first = shortOf(cars[0], approach);
  assert.ok(first >= 0 && first < 1, `the first with its nose at the line: ${first}`);
  // Each two metres or so behind the one in front: none in another.
  for (let i = 1; i < cars.length; i += 1) {
    const gap = cars[i - 1].s - cars[i].s - VEHICLES.car.length;
    assert.ok(gap > 1.5 && gap < 3.2, `gap ${gap}`);
  }
  // They stay as long as it is red.
  run(10);
  assert.ok(cars.every((one) => one.speed === 0));
  // Green: one after the other they set off, and are through.
  clock.at = momentOf(approach, 'green', 20);
  run(4);
  assert.ok(cars[0].speed > 3 && cars[4].speed < cars[0].speed, 'the first is away before the last');
  run(16);
  assert.ok(cars.every((one) => one.way !== 0), 'all five through the junction on one green');
});

test('a yellow light stops whoever can still stop; the wary stop when the green flashes; a red light is not run from a standstill', () => {
  const { signals, clock, run, car } = quietTraffic(CROSS);
  const approach = signals.byWay.get(0 * 2 + 1);
  // Yellow comes up: a car five metres from the line goes through; one a hundred metres back stops.
  clock.at = momentOf(approach, 'yellow') - 0.05;
  const close = car(0, approach.stop - 5 - VEHICLES.car.length / 2);
  const far = car(0, approach.stop - 100, { lane: 1, offset: 3.4 });
  run(12);
  assert.notEqual(close.way, 0, 'too near to stop: through on the yellow');
  assert.ok(far.way === 0 && far.speed === 0 && shortOf(far, approach) >= 0 && shortOf(far, approach) < 1);
  // The green flashes: most drive on, one in eight stops. (Which a driver is, is his own: told here by his speed.)
  const again = quietTraffic(CROSS);
  const side = again.signals.byWay.get(0 * 2 + 1);
  again.clock.at = momentOf(side, 'flash') - 0.05;
  const wishOf = (wary) => {
    for (let wish = 14; wish < 15; wish += 0.0137) if (((wish * 997) % 1 < 0.12) === wary) return wish;
    throw new Error('no such driver');
  };
  const bold = again.car(0, side.stop - 60, { wish: wishOf(false) });
  const wary = again.car(0, side.stop - 60, { wish: wishOf(true), lane: 1, offset: 3.4 });
  again.run(14);
  assert.notEqual(bold.way, 0, 'the one drove on, and was too near to stop when the yellow came');
  assert.ok(wary.way === 0 && wary.speed === 0 && shortOf(wary, side) >= 0 && shortOf(wary, side) < 1, 'the other stopped at the line');
});

test('at a red light a vehicle may turn right from the lane by the kerb, once it has stood; nobody else moves', () => {
  const { network, signals, clock, run, car } = quietTraffic(BOX);
  // The carriageway heading east, up to the first corner of the junction; and, round that corner to the right,
  // the carriageway heading south, from the corner on.
  const starts = (way, x, y) => near(way.xy[0], x, 0.5) && near(way.xy[1], y, 0.5);
  const ends = (way, x, y) => near(way.xy[way.xy.length - 2], x, 0.5) && near(way.xy[way.xy.length - 1], y, 0.5);
  const east = network.ways.findIndex((way) => starts(way, -600, -10) && ends(way, -10, -10));
  const south = network.ways.findIndex((way) => starts(way, -10, -10) && ends(way, -10, -600));
  const on = network.ways.findIndex((way) => starts(way, -10, -10) && ends(way, 10, -10));
  assert.ok(east >= 0 && south >= 0 && on >= 0);
  const approach = signals.byWay.get(east * 2 + 1);
  clock.at = momentOf(approach, 'red', 70);
  const kerbLane = network.ways[east].lanes - 1;
  assert.equal(kerbLane, 1);
  const turning = car(east, 470, { lane: kerbLane, onward: { way: south, atStart: true } });
  const inner = car(east, 470, { lane: 0, onward: { way: south, atStart: true } });
  const straight = car(east, 430, { lane: kerbLane, onward: { way: on, atStart: true } });
  let slowest = Infinity;
  for (let t = 0; t < 40 && turning.way === east; t += 0.1) {
    run(0.1);
    if (turning.way === east && Math.abs(shortOf(turning, approach)) < 2) slowest = Math.min(slowest, turning.speed);
  }
  assert.ok(slowest < 0.3, `it stood at the line first: ${slowest}`);
  assert.equal(turning.way, south, 'and then turned right, on the red');
  run(10);
  // The one in the inner lane waits for the green, though it means to turn right too; so does the one going straight on.
  assert.ok(inner.way === east && inner.speed === 0 && straight.way === east && straight.speed === 0);
  assert.equal(signalState(approach, clock.at), 'red');
});

test('a queue reaches back over the end of a way: those on the way before stop behind it', () => {
  // A side street joins the main road forty metres before the junction: the last stretch of the approach is short.
  // (The road that crosses runs one way, to the north: nobody coming from the west can turn right into it.)
  const lines = [line('primary', [[-600, 0], [600, 0]]), line('secondary', [[0, -600], [0, 600]], { oneway: 1 }), line('minor', [[-40, -200], [-40, 0]])];
  const { network, signals, clock, run, car } = quietTraffic(lines);
  const last = network.ways.findIndex((way) => way.class === 'primary' && near(way.length, 40, 0.5));
  const before = network.ways.findIndex((way) => way.class === 'primary' && near(way.length, 560, 0.5));
  const approach = signals.byWay.get(last * 2 + 1);
  assert.ok(approach && last >= 0 && before >= 0);
  clock.at = momentOf(approach, 'red', 55);
  // Eight cars: more than the short stretch holds.
  const cars = [500, 475, 450, 425, 400, 375, 350, 325].map((s) => car(before, s, { onward: { way: last, atStart: true } }));
  run(50);
  assert.equal(signalState(approach, clock.at), 'red');
  assert.ok(cars.every((one) => one.speed === 0), 'all stand');
  const held = cars.filter((one) => one.way === last).length;
  assert.ok(held >= 2 && held <= 5, `${held} on the last stretch`);
  // Measured along the road, from one stretch on into the next: each a couple of metres behind the one in front.
  const along = (one) => (one.way === last ? 560 + one.s : one.s);
  for (let i = 1; i < cars.length; i += 1) {
    const gap = along(cars[i - 1]) - along(cars[i]) - VEHICLES.car.length;
    assert.ok(gap > 1.2 && gap < 4, `gap ${gap} between the ${i}th and the next`);
  }
});

test('with signals nobody appears in the middle of a queue, and the traffic of a whole junction keeps apart', () => {
  const network = buildNetwork(BOX, ORIGIN);
  const signals = signalsOf(network);
  const clock = { at: Date.parse('2026-11-22T09:30:00Z') / 1000 };
  const traffic = new Traffic({ seed: 11, now: () => clock.at * 1000 });
  traffic.level = 0.9;
  traffic.setNetwork(network, [0, 0], ORIGIN);
  traffic.setSignals(signals);
  assert.ok(traffic.vehicles.length > 100);
  let standing = 0;
  let jumped = 0;
  const before = new Map();
  for (let step = 0; step < 2400; step += 1) {
    clock.at += 0.1;
    before.clear();
    for (const vehicle of traffic.vehicles) before.set(vehicle, { way: vehicle.way, forward: vehicle.forward, s: vehicle.s, speed: vehicle.speed });
    traffic.step(0.1);
    // Nobody who stood at a red light drives over the line while it is red (but for those turning right).
    for (const vehicle of traffic.vehicles) {
      const was = before.get(vehicle);
      if (!was || was.speed > 0.05) continue;
      const approach = signals.byWay.get(was.way * 2 + (was.forward ? 1 : 0));
      if (!approach || signalState(approach, clock.at) !== 'red' || vehicle.stoodAt === approach) continue;
      const nose = (was.forward ? approach.stop - was.s : was.s - approach.stop) - VEHICLES[vehicle.type].length / 2;
      const now = vehicle.way === was.way ? (vehicle.forward ? approach.stop - vehicle.s : vehicle.s - approach.stop) - VEHICLES[vehicle.type].length / 2 : -99;
      if (nose >= 0 && now < -0.5) jumped += 1;
    }
    if (step % 10 !== 0) continue;
    // Of those that stand in one lane, no two are in each other.
    const lanes = new Map();
    for (const vehicle of traffic.vehicles) {
      if (vehicle.speed > 0.05 || vehicle.parked || vehicle.shown < 1) continue;
      const key = `${vehicle.way}|${vehicle.forward}|${vehicle.lane}`;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(vehicle);
    }
    for (const list of lanes.values()) {
      list.sort((a, b) => a.s - b.s);
      standing += list.length;
      for (let i = 1; i < list.length; i += 1) {
        const gap = list[i].s - list[i - 1].s - (VEHICLES[list[i].type].length + VEHICLES[list[i - 1].type].length) / 2;
        assert.ok(gap > 0.5, `two standing ${gap} m apart at step ${step}`);
      }
    }
  }
  assert.equal(jumped, 0);
  assert.ok(standing > 2000, `queues were seen: ${standing}`);
  // Without signals hardly anybody stands: the same streets, the same traffic, counted the same way.
  const free = new Traffic({ seed: 11, now: () => clock.at * 1000 });
  free.level = 0.9;
  free.setNetwork(network, [0, 0], ORIGIN);
  let standingFree = 0;
  for (let step = 0; step < 2400; step += 1) {
    clock.at += 0.1;
    free.step(0.1);
    if (step % 10 === 0) standingFree += free.vehicles.filter((vehicle) => vehicle.speed <= 0.05 && !vehicle.parked && vehicle.shown === 1).length;
  }
  assert.ok(standingFree < standing / 5, `without signals ${standingFree} stood, with them ${standing}`);
});

test('nobody drives through a red light, and nobody is put on the streets in the middle of a junction', () => {
  const TRUNK = [line('trunk', [[-900, 0], [900, 0]]), line('primary', [[0, -900], [0, 900]])];
  for (const [lines, seed] of [[BOX, 2], [TRUNK, 1]]) {
    const network = buildNetwork(lines, ORIGIN);
    const signals = signalsOf(network);
    const clock = { at: 1000 };
    const traffic = new Traffic({ seed, most: 140, now: () => clock.at * 1000 });
    // The signals are given with the streets: those who are put on them at once are put there with regard to them.
    traffic.setNetwork(network, [0, 0], ORIGIN, signals);
    assert.equal(traffic.signals, signals);
    assert.ok(traffic.vehicles.length > 100);
    const noseTo = (vehicle, approach, s = vehicle.s) => (vehicle.forward ? approach.stop - s : s - approach.stop) - VEHICLES[vehicle.type].length / 2;
    const known = new Set();
    const before = new Map();
    const over = { green: 0, flash: 0, yellow: 0, red: 0, turning: 0 };
    let fastest = 0;
    for (let step = 0; step < 8 * 60 * 10; step += 1) {
      before.clear();
      for (const vehicle of traffic.vehicles) before.set(vehicle, { way: vehicle.way, forward: vehicle.forward, s: vehicle.s });
      clock.at += 0.1;
      traffic.step(0.1);
      for (const vehicle of traffic.vehicles) {
        const approach = signals.byWay.get(vehicle.way * 2 + (vehicle.forward ? 1 : 0));
        const was = before.get(vehicle);
        if (!was && !known.has(vehicle)) {
          // A newcomer: clear of every junction, and with its nose short of the stop line of its road.
          const spot = pointAlong(network.ways[vehicle.way], vehicle.s);
          for (const junction of signals.junctions) assert.ok(Math.hypot(spot[0] - junction.x, spot[1] - junction.y) >= junction.reach, 'put down inside a junction');
          if (approach && (vehicle.forward ? vehicle.s < approach.stop : vehicle.s > approach.stop)) assert.ok(noseTo(vehicle, approach) > 0, 'put down with its nose over the line');
        }
        known.add(vehicle);
        if (!was || !approach || was.way !== vehicle.way || was.forward !== vehicle.forward) continue;
        // Its nose comes over the line: what does the signal show?
        if (!(noseTo(vehicle, approach, was.s) > 0 && noseTo(vehicle, approach) <= 0)) continue;
        fastest = Math.max(fastest, vehicle.speed);
        const state = signalState(approach, clock.at);
        if (state === 'red' && vehicle.stoodAt === approach) over.turning += 1;
        else over[state] += 1;
      }
    }
    assert.equal(over.red, 0, JSON.stringify(over));
    assert.ok(over.green > 200 && over.yellow > 5 && over.flash > 5, JSON.stringify(over));
    assert.ok(fastest > 15, 'and it was no crawl');
  }
  // Until the red: counted down through the green and the yellow, nothing while it is red.
  const { signals } = signalsFor(CROSS);
  const approach = signals.approaches[0];
  const start = momentOf(approach, 'green');
  assert.ok(near(signals.untilRed(approach, start + 1), approach.green + SIGNAL_TIMES.yellow - 1, 0.26));
  assert.ok(near(untilRed(approach, start + approach.green + 1), SIGNAL_TIMES.yellow - 1, 0.26));
  assert.equal(untilRed(approach, start + approach.green + SIGNAL_TIMES.yellow + 1), 0);
  assert.ok(signals.junctions[0].reach > 10 && signals.junctions[0].reach < 20);
});

test('the map is asked where the signals of the whole city are, with nothing of where you are', () => {
  // One question, the same every time: Riyadh's own bounds, and no place of anybody's.
  assert.equal(signalQuery(), '[out:json][timeout:25];node["highway"="traffic_signals"](24.3,46.25,25.15,47.15);out skel qt;');
  assert.equal(signalQuery.length, 0);
  // The answer: its nodes, to the metre; nothing that is not a node, has no place, or lies outside the city.
  const answer = { elements: [{ type: 'node', id: 1, lat: 24.7000004, lon: 46.6800049 }, { type: 'way', id: 2 }, { type: 'node', id: 3, lat: 'x', lon: 46.7 }, null, { type: 'node', id: 4, lat: 24.71, lon: 46.69 }, { type: 'node', id: 5, lat: 21.4, lon: 39.8 }] };
  assert.deepEqual(signalPoints(answer), [[46.68, 24.7], [46.69, 24.71]]);
  assert.deepEqual(signalPoints(null), []);
  assert.deepEqual(signalPoints({ elements: 'none' }), []);

  // Kept on the phone and read back the same; and anything else that may be found under the name is not taken for it.
  const now = Date.UTC(2026, 10, 22);
  const kept = JSON.parse(JSON.stringify(packSignals(signalPoints(answer), now)));
  assert.deepEqual(kept, { at: now, places: [46.68, 24.7, 46.69, 24.71] });
  assert.deepEqual(unpackSignals(kept, now + 1000), { at: now, points: [[46.68, 24.7], [46.69, 24.71]] });
  assert.deepEqual(unpackSignals(packSignals([], now), now), { at: now, points: [] });
  assert.equal(unpackSignals(null, now), null);
  assert.equal(unpackSignals('signals', now), null);
  assert.equal(unpackSignals({ at: now, places: [46.68, 24.7, 46.69] }, now), null); // cut short
  assert.equal(unpackSignals({ at: now, places: [46.68, 'x'] }, now), null);
  assert.equal(unpackSignals({ at: now, places: [39.8, 21.4] }, now), null); // not in Riyadh
  assert.equal(unpackSignals({ at: now + 60000, places: [] }, now), null); // from a time yet to come
  assert.equal(unpackSignals({ places: [] }, now), null);
  assert.equal(SIGNALS_KEPT_MS, 7 * 24 * 3600 * 1000);
});
