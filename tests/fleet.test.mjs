import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KINDS, MATERIALS, SHAPES, TAXI_GREEN, allowedNow, chooseParked, chooseVehicle, lorriesAllowed, movingShares, paintsOf, serviceLorriesAllowed } from '../js/fleet.js';
import { Mesh, VEHICLES, drawVehicle } from '../js/life.js';
import { vehicleLights } from '../js/lights.js';

const near = (a, b, by) => Math.abs(a - b) <= by;
/** Numbers from 0 to 1, the same every time. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const SUNDAY = 0;
const FRIDAY = 5;
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 4)]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const isWhite = (paint) => paint[0] > 230 && paint[1] > 228 && paint[2] > 215;
const isBlack = (paint) => Math.max(...paint) < 50;
const isGrey = (paint) => !isWhite(paint) && !isBlack(paint) && Math.max(...paint) - Math.min(...paint) < 14;

test('every kind of vehicle has a shape, made of boxes of known stuff, and is as large as such a vehicle is', () => {
  assert.equal(VEHICLES, SHAPES, 'the traffic draws these very shapes');
  for (const kind of Object.keys(KINDS)) assert.ok(Object.hasOwn(SHAPES, kind), kind);
  for (const [kind, shape] of Object.entries(SHAPES)) {
    assert.ok(shape.length >= 1.9 && shape.length <= 20 && shape.width >= 0.7 && shape.width <= 2.9, kind);
    for (const [from, to, share, bottom, top, material, lean, aside = 0] of shape.boxes) {
      assert.ok(from >= 0 && to <= 1 && from < to && share > 0 && share <= 1.05 && bottom >= 0 && top > bottom && top < 4, `${kind}: ${[from, to, share, bottom, top]}`);
      assert.ok(material === 'body' || material === 'cargo' || Object.hasOwn(MATERIALS, material), `${kind}: ${material}`);
      assert.ok(Math.abs(aside) + share <= 1.05, `${kind}: a box off the middle stays within the vehicle`);
      if (lean) assert.equal(lean.length, 3);
    }
    assert.ok(shape.boxes.some((box) => box[5] === 'body'), `${kind} has a body`);
  }
  // A small saloon is shorter than a large one, a hatchback shorter still; a big 4x4 is the highest and widest of the cars;
  // a pick-up the longest of them, with its cab forward and an open bed behind; a motorbike is narrow.
  const high = (kind) => Math.max(...SHAPES[kind].boxes.map((box) => box[4]));
  assert.ok(SHAPES.hatch.length < SHAPES.car.length && SHAPES.car.length < SHAPES.sedan.length && SHAPES.sedan.length < SHAPES.suv.length && SHAPES.suv.length < SHAPES.pickup.length);
  assert.ok(high('suv') > high('crossover') && high('crossover') > high('sedan') && SHAPES.suv.width >= 2 && near(high('suv'), 1.92, 0.05));
  const cab = SHAPES.pickup.boxes.find((box) => box[5] === 'glass');
  const bed = SHAPES.pickup.boxes.find((box) => box[5] === 'dark');
  assert.ok(cab[0] >= 0.38 && bed[1] <= cab[0] && bed[0] < 0.05, 'the bed lies behind the cab, to the tail');
  assert.ok(SHAPES.bike.width < 1 && SHAPES.light.length > 6 && SHAPES.light.length < SHAPES.tanker.length && SHAPES.tanker.length < SHAPES.truck.length);
});

test('the vehicles on the move are Riyadh\'s: saloons first, then SUVs and pick-ups, and six in ten of them white', () => {
  const random = seeded(7);
  const count = 20000;
  const seen = {};
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const vehicle = chooseVehicle(random, { lanes: 3, hour: 10, day: SUNDAY });
    seen[vehicle.type] = (seen[vehicle.type] ?? 0) + 1;
    assert.ok(Object.hasOwn(KINDS, vehicle.type) && vehicle.paint.length === 3 && vehicle.cargo.length === 3);
    const [slow, fast] = KINDS[vehicle.type].pace;
    assert.ok(vehicle.pace >= slow - 1e-9 && vehicle.pace <= fast + 1e-9);
    if (['car', 'sedan', 'hatch', 'crossover'].includes(vehicle.type)) cars.push(vehicle.paint);
    if (vehicle.type === 'taxi') assert.ok(same(vehicle.paint, TAXI_GREEN), 'every taxi in the taxis\' green');
  }
  const share = (...kinds) => kinds.reduce((sum, kind) => sum + (seen[kind] ?? 0), 0) / count;
  assert.ok(share('car', 'sedan', 'taxi') > 0.4 && share('car', 'sedan', 'taxi') < 0.54, `saloons ${share('car', 'sedan', 'taxi')}`);
  assert.ok(share('crossover', 'suv') > 0.25 && share('crossover', 'suv') < 0.36, `SUVs ${share('crossover', 'suv')}`);
  assert.ok(share('pickup') > 0.06 && share('pickup') < 0.11 && share('hatch') > 0.025 && share('hatch') < 0.06 && share('van') > 0.03 && share('van') < 0.065);
  assert.ok(share('taxi') > 0.03 && share('taxi') < 0.055 && share('bike') > 0.02 && share('bike') < 0.045 && share('light') > 0.03 && share('light') < 0.06);
  assert.ok(share('police') > 0.002 && share('police') < 0.01 && share('ambulance') > 0 && share('ambulance') < 0.004 && share('tanker') > 0.008 && share('tanker') < 0.025);
  assert.equal(seen.truck, undefined, 'and by day not one heavy lorry');
  // Their colours: about six in ten white, two in ten silver or grey, one in ten black; the rest beige, blue, red, brown.
  const part = (test) => cars.filter(test).length / cars.length;
  assert.ok(part(isWhite) > 0.57 && part(isWhite) < 0.67, `white ${part(isWhite)}`);
  assert.ok(part(isGrey) > 0.16 && part(isGrey) < 0.24, `silver and grey ${part(isGrey)}`);
  assert.ok(part(isBlack) > 0.07 && part(isBlack) < 0.12, `black ${part(isBlack)}`);
  assert.ok(part((paint) => !isWhite(paint) && !isGrey(paint) && !isBlack(paint)) > 0.05);
  // Working vehicles are whiter still; the big 4x4s are black more often than the saloons are.
  const paints = (kind, n = 4000) => Array.from({ length: n }, (_, i) => paintsOf(kind, (i + 0.5) / n));
  const whiteOf = (kind) => paints(kind).filter(({ paint }) => isWhite(paint)).length / 4000;
  const blackOf = (kind) => paints(kind).filter(({ paint }) => isBlack(paint)).length / 4000;
  assert.ok(whiteOf('pickup') > 0.72 && whiteOf('van') > 0.8 && whiteOf('light') > 0.8 && blackOf('suv') > blackOf('car') * 1.8);
  // A lorry's load is not its cab's colour by rule; a car has one colour.
  assert.ok(paints('car', 50).every(({ paint, cargo }) => paint === cargo));
  assert.ok(Array.from({ length: 50 }, (_, i) => paintsOf('truck', 0.6, (i + 0.5) / 50)).some(({ paint, cargo }) => !same(paint, cargo)));
  // The same numbers always give the same vehicle.
  assert.deepEqual(chooseVehicle(seeded(3), { lanes: 2, hour: 9, day: SUNDAY }), chooseVehicle(seeded(3), { lanes: 2, hour: 9, day: SUNDAY }));
});

test('heavy lorries are kept out of the city by day, as Riyadh keeps them; and the hour sets how many bikes and taxis there are', () => {
  // Working days, Sunday to Thursday: not from six in the morning until nine at night.
  assert.ok(lorriesAllowed(5.9, SUNDAY) && !lorriesAllowed(6, SUNDAY) && !lorriesAllowed(13, 3) && !lorriesAllowed(20.9, 4) && lorriesAllowed(21, 4) && lorriesAllowed(2, 1));
  // The weekend, Friday and Saturday: not from five in the afternoon until nine.
  assert.ok(lorriesAllowed(10, FRIDAY) && lorriesAllowed(16.9, 6) && !lorriesAllowed(17, FRIDAY) && !lorriesAllowed(20.5, 6) && lorriesAllowed(21, FRIDAY));
  // The lorries that serve the city: not in the rush hours of a working day.
  assert.ok(!serviceLorriesAllowed(7, SUNDAY) && serviceLorriesAllowed(10, SUNDAY) && !serviceLorriesAllowed(16, 2) && serviceLorriesAllowed(19, 2) && serviceLorriesAllowed(7, FRIDAY));
  assert.ok(allowedNow('car', 12, SUNDAY) && !allowedNow('truck', 12, SUNDAY) && allowedNow('truck', 23, SUNDAY) && !allowedNow('tanker', 8, SUNDAY) && allowedNow('tanker', 12, SUNDAY));
  // So by day there is no share for them at all; by night a good one on the wide roads, and next to none in a side street.
  assert.equal(movingShares({ lanes: 3, hour: 12, day: SUNDAY }).truck, 0);
  assert.equal(movingShares({ lanes: 3, hour: 7, day: SUNDAY }).tanker, 0);
  const night = movingShares({ lanes: 3, hour: 2, day: 1 });
  assert.ok(night.truck > night.pickup && movingShares({ lanes: 1, hour: 2, day: 1 }).truck < night.truck / 5);
  const random = seeded(11);
  let lorries = 0;
  for (let i = 0; i < 5000; i += 1) if (chooseVehicle(random, { lanes: 3, hour: 2, day: 1 }).type === 'truck') lorries += 1;
  assert.ok(lorries > 5000 * 0.05 && lorries < 5000 * 0.12, `${lorries}`);
  // More motorbikes with orders at lunch and from supper into the night than in mid-morning, and hardly any before breakfast.
  const bikes = (hour) => movingShares({ lanes: 2, hour, day: 1 }).bike;
  assert.ok(bikes(13) > bikes(10) * 1.5 && bikes(21) > bikes(10) * 1.5 && bikes(0.5) > bikes(10) && bikes(5) < bikes(10) * 0.5);
  assert.ok(movingShares({ lanes: 2, hour: 3, day: 1 }).taxi > movingShares({ lanes: 2, hour: 12, day: 1 }).taxi);
  // Light lorries keep to the wider roads.
  assert.ok(movingShares({ lanes: 3 }).light > movingShares({ lanes: 1 }).light * 1.8);
});

test('what stands parked is cars, 4x4s, pick-ups and vans: nothing that does not fit its place, and no lorry or motorbike', () => {
  const seen = {};
  for (let i = 0; i < 2000; i += 1) {
    const parked = chooseParked((i + 0.5) / 2000, ((i * 7919) % 2000) / 2000, 5.4);
    seen[parked.type] = (seen[parked.type] ?? 0) + 1;
    assert.ok(SHAPES[parked.type].length <= 5.4 && parked.paint.length === 3);
  }
  assert.ok(['car', 'sedan', 'hatch', 'crossover', 'suv', 'pickup', 'van', 'taxi'].every((kind) => seen[kind] > 0), JSON.stringify(seen));
  assert.ok(!seen.truck && !seen.light && !seen.tanker && !seen.bike && !seen.police && !seen.ambulance);
  assert.ok(seen.car > seen.suv && seen.suv > seen.van && seen.taxi < 60);
  // In a short place only what is short.
  assert.ok(Array.from({ length: 200 }, (_, i) => chooseParked((i + 0.5) / 200, 0.5, 4.6).type).every((kind) => SHAPES[kind].length <= 4.6));
  assert.deepEqual(chooseParked(0.3, 0.7, 5.4), chooseParked(0.3, 0.7, 5.4));
});

test('a taxi is green with its light on the roof; a patrol car black with white doors, or white with green ones, under red and blue lamps', () => {
  // The patrols of Public Security, two in three; the traffic police.
  const security = paintsOf('police', 0.2);
  const trafficPolice = paintsOf('police', 0.9);
  assert.ok(isBlack(security.paint) && isWhite(security.cargo) && isWhite(trafficPolice.paint) && trafficPolice.cargo[1] > trafficPolice.cargo[0] + 80);
  const ambulance = paintsOf('ambulance', 0.5);
  assert.ok(isWhite(ambulance.paint) && ambulance.cargo[0] > 180 && ambulance.cargo[1] < 80);
  assert.ok(TAXI_GREEN[1] > TAXI_GREEN[0] + 40 && TAXI_GREEN[1] > TAXI_GREEN[2] + 30);

  // Drawn: a patrol car pointing north at (0, 0), without sun. Six boxes of five faces.
  const mesh = new Mesh();
  drawVehicle(mesh, 'police', 0, 0, 0, 1, security.paint, security.cargo, 1, null, null);
  const LAMPS = 4 * 6; // (two ahead, two behind)
  assert.equal(mesh.count, 6 * 30 + LAMPS);
  const all = corners(mesh).slice(0, 6 * 30);
  // (Without a sun every face keeps eight tenths of its colour.)
  const of = (colour) => all.filter((corner) => near(corner[3], colour[0] * 0.8, 1.5) && near(corner[4], colour[1] * 0.8, 1.5) && near(corner[5], colour[2] * 0.8, 1.5));
  const half = SHAPES.police.width / 2;
  // Its white doors stand a little proud of its black sides, along the middle of its length.
  const doors = of(security.cargo);
  assert.ok(doors.length > 0 && Math.max(...doors.map((corner) => Math.abs(corner[0]))) > half && doors.every((corner) => Math.abs(corner[1]) < SHAPES.police.length * 0.21 + 0.01));
  // The lamps on its roof: red on its left (west, as it points north), blue on its right, over its cabin.
  const [red, blue] = [of(MATERIALS.red), of(MATERIALS.blue)];
  assert.ok(red.length === 30 && blue.length === 30 && red.every((corner) => corner[0] < 0 && corner[2] >= 1.45 - 1e-6) && blue.every((corner) => corner[0] > 0 && corner[2] <= 1.57 + 1e-6));
  // A taxi: four boxes, and the light on its roof is yellow, in the middle.
  const cab = new Mesh();
  drawVehicle(cab, 'taxi', 0, 0, 0, 1, TAXI_GREEN, TAXI_GREEN, 1, null, null);
  assert.equal(cab.count, 4 * 30 + LAMPS);
  const sign = corners(cab).slice(3 * 30, 4 * 30);
  assert.ok(sign.every((corner) => corner[3] > 180 && corner[5] < 70 && Math.abs(corner[0]) < 0.4 && corner[2] >= 1.45 - 1e-6 && corner[2] <= 1.6 + 1e-6));

  // A pick-up: the bed behind its cab is dark, and lies open on top of its body.
  const pickup = new Mesh();
  drawVehicle(pickup, 'pickup', 0, 0, 0, 1, [240, 240, 236], [240, 240, 236], 1, null, null);
  const bed = corners(pickup).slice(3 * 30, 4 * 30);
  assert.ok(bed.every((corner) => corner[3] < 60 && corner[1] < 0 && corner[2] > 0.99 && corner[2] < 1.04));
  // A light lorry carries its headlights on the front of its cab and its tail lights on the back of its load, low down.
  const lorry = new Mesh();
  drawVehicle(lorry, 'light', 0, 0, 0, 1, [240, 240, 236], [60, 100, 160], 1, null, null);
  assert.equal(lorry.count, 4 * 30 + LAMPS);
  const lamps = corners(lorry).slice(4 * 30);
  const reach = SHAPES.light.length / 2;
  assert.ok(lamps.slice(0, 12).every((corner) => near(corner[1], reach + 0.015, 1e-4) && corner[3] > 180 && corner[5] > 150 && corner[2] > 0.45 && corner[2] < 0.8), 'pale, on the nose of the cab');
  assert.ok(lamps.slice(12).every((corner) => near(corner[1], -reach - 0.015, 1e-4) && corner[3] > 120 && corner[4] < 40 && corner[2] > 0.8 && corner[2] < 1.15), 'red, at the foot of the load');
  // A motorbike has one lamp ahead and one behind, in its middle; a train's car has none.
  const bike = new Mesh();
  drawVehicle(bike, 'bike', 0, 0, 0, 1, [34, 36, 40], [232, 190, 48], 1, null, null);
  assert.equal(bike.count, 5 * 30 + 2 * 6);
  assert.ok(corners(bike).slice(5 * 30).every((corner) => Math.abs(corner[0]) < 0.1));
  const coach = new Mesh();
  drawVehicle(coach, 'coach', 0, 0, 0, 1, [240, 242, 244], [132, 142, 156], 1, null, null);
  assert.equal(coach.count, 4 * 30);
});

test('by night a motorbike shows one lamp ahead and one behind; a patrol car its red and blue, a taxi its sign', () => {
  const lamps = (kind) => {
    const [glow, points] = [new Mesh(), new Mesh()];
    vehicleLights(glow, kind, 0, 0, 0, 1, 1, 1, 0, points);
    return corners(points);
  };
  assert.equal(lamps('car').length, 4);
  assert.equal(lamps('bike').length, 2);
  assert.ok(lamps('bike').every((corner) => near(corner[0], 0, 1e-6)), 'in the middle of it');
  const patrol = lamps('police');
  assert.equal(patrol.length, 6);
  const [red, blue] = patrol.slice(4);
  assert.ok(red[3] > 200 && red[5] < 60 && red[0] < 0 && blue[5] > 200 && blue[3] < 60 && blue[0] > 0 && near(red[2], 1.6, 1e-6));
  const taxi = lamps('taxi');
  assert.equal(taxi.length, 5);
  assert.ok(taxi[4][3] > 230 && taxi[4][4] > 190 && taxi[4][5] < 80 && near(taxi[4][2], 1.62, 1e-6));
});
