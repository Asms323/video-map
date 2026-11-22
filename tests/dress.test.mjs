import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRANDS, STATION_GOLD, boxAround, brandOf, stationExtras, storeExtras } from '../js/dress.js';

const ORIGIN = [46.67, 24.7];
const SQUEEZE = 111320 * Math.cos((24.7 * Math.PI) / 180);
/** [lng, lat] of a place given in metres east and north of the origin. */
const at = (east, north) => [ORIGIN[0] + east / SQUEEZE, ORIGIN[1] + north / 111320];
const metres = ([lng, lat]) => [(lng - ORIGIN[0]) * SQUEEZE, (lat - ORIGIN[1]) * 111320];
const rect = (east, north, width, depth) => [at(east, north), at(east + width, north), at(east + width, north + depth), at(east, north + depth), at(east, north)];
const near = (a, b, by = 0.05) => Math.abs(a - b) <= by;
/** The box a slab covers on the ground, in metres, with its bottom and top. */
const span = (feature) => {
  const points = feature.geometry.coordinates[0].map(metres);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { west: Math.min(...xs), east: Math.max(...xs), south: Math.min(...ys), north: Math.max(...ys), base: feature.properties.b, top: feature.properties.t, paint: feature.properties.c, kind: feature.properties.kind };
};
const building = (id, east, north, width, depth, height = 6) => ({ id, height, base: 0, known: false, polygons: [[rect(east, north, width, depth)]] });
const store = (name, kind, east, north) => ({ at: at(east, north), brand: brandOf({ name, class: kind }) });

test('boxAround fits the smallest box round an outline, long side first', () => {
  // A hall 120 m by 20 m, turned 30° from east.
  const turn = Math.PI / 6;
  const corner = (along, across) => [100 + along * Math.cos(turn) - across * Math.sin(turn), 50 + along * Math.sin(turn) + across * Math.cos(turn)];
  const box = boxAround([corner(-60, -10), corner(60, -10), corner(60, 10), corner(-60, 10), corner(-60, -10)]);
  assert.ok(near(box.x, 100) && near(box.y, 50) && near(box.halfLength, 60) && near(box.halfWidth, 10));
  assert.ok(near(Math.abs(box.east), Math.cos(turn), 1e-9) && near(Math.abs(box.north), Math.sin(turn), 1e-9));
  // Whichever wall the outline starts with.
  const upright = boxAround([[0, 0], [10, 0], [10, 40], [0, 40], [0, 0]]);
  assert.ok(near(upright.halfLength, 20) && near(upright.halfWidth, 5) && near(Math.abs(upright.north), 1));
  assert.equal(boxAround([[0, 0], [0, 0]]), null);
});

test('a station in the middle of a road is joined to its entrances by covered footbridges', () => {
  const station = rect(0, -9, 120, 18); // 120 m along the road, in its middle
  const entrances = [
    at(60, 40), // beside the road, level with the station
    at(160, 35), // beside the road, 40 m past the station's east end
    at(160, -38), // and across from it
    at(30, 9.5), // a door in the station's own wall
    at(400, 0), // far along the road: a station of its own, under the ground
    at(60, 300), // far to the side
  ];
  const features = stationExtras([station], entrances, () => [0, 1]);
  const kinds = {};
  for (const feature of features) kinds[feature.properties.kind] = (kinds[feature.properties.kind] ?? 0) + 1;
  // Three entrances are bridged (each with its stair tower), two get a pavilion with its sign, the door gets nothing.
  assert.equal(kinds.stairs, 3 * 2);
  assert.equal(kinds.pavilion, 2 * 2);
  assert.equal(kinds.sign, 2 * 2);
  const decks = features.filter((feature) => feature.properties.kind === 'walkway' && feature.properties.b === 5.6).map(span);
  assert.equal(decks.length, 4, 'one square across from the station, two across the road past its end, and one walkway along the middle joining those to it');
  for (const deck of decks) assert.ok(deck.top === 8.6 && deck.paint === STATION_GOLD, 'clear of the traffic, and in the metro\'s gold');
  // Level with the station: straight out from its long side to the entrance.
  assert.ok(decks.some((deck) => near(deck.west, 58.2) && near(deck.east, 61.8) && near(deck.south, 8.5) && near(deck.north, 40)), JSON.stringify(decks));
  // Past its end: across the road to the middle on both sides, and one shared walkway along the middle to the station.
  assert.ok(decks.some((deck) => near(deck.west, 158.2) && near(deck.south, 0) && near(deck.north, 35)));
  assert.ok(decks.some((deck) => near(deck.west, 158.2) && near(deck.south, -38) && near(deck.north, 0)));
  assert.ok(decks.some((deck) => near(deck.west, 119.5) && near(deck.east, 161.8) && near(deck.south, -1.8) && near(deck.north, 1.8)));
  // A long span stands on piers; every span has a roof.
  assert.ok(features.some((feature) => feature.properties.kind === 'walkway' && feature.properties.b === 0 && feature.properties.t === 5.6));
  assert.equal(features.filter((feature) => feature.properties.kind === 'walkway' && feature.properties.b === 8.6).length, 4);
  // The pavilion of an underground station: a glass box under a wide roof, turned the way the street runs.
  const pavilion = features.filter((feature) => feature.properties.kind === 'pavilion').map(span).filter((one) => one.west > 380);
  assert.equal(pavilion.length, 2);
  assert.ok(near(pavilion[0].north - pavilion[0].south, 6.8) && near(pavilion[0].east - pavilion[0].west, 4.2) && pavilion[0].top === 3.3, JSON.stringify(pavilion[0]));
  assert.ok(pavilion[1].base === 3.3 && pavilion[1].north - pavilion[1].south > pavilion[0].north - pavilion[0].south, 'the roof reaches past the glass');
  // No stations: every entrance is a pavilion. Nothing at all: nothing.
  assert.equal(stationExtras([], entrances).filter((feature) => feature.properties.kind === 'pavilion').length, entrances.length * 2);
  assert.deepEqual(stationExtras([], []), []);
});

test('brandOf knows a chain by its name, in Latin or Arabic letters', () => {
  const id = (properties) => brandOf(properties)?.id ?? null;
  assert.equal(id({ name: "McDonald's", class: 'fast_food' }), 'mcdonalds');
  assert.equal(id({ name: 'ماكدونالدز', class: 'fast_food' }), 'mcdonalds');
  assert.equal(id({ name: 'كودو', 'name:latin': 'Kudu', class: 'fast_food' }), 'kudu');
  assert.equal(id({ name: 'Starbucks Reserve', class: 'cafe' }), 'starbucks');
  assert.equal(id({ name: 'Hyper Panda', 'name:nonlatin': 'هايبر بنده', class: 'grocery' }), 'panda');
  assert.equal(id({ name: 'مصرف الراجحي', class: 'bank' }), 'alrajhi');
  assert.equal(id({ name: 'ALdrees', class: 'fuel' }), 'aldrees');
  // A name is only taken for the chain where the kind of place fits.
  assert.equal(id({ name: 'Panda Express', class: 'restaurant' }), null);
  assert.equal(id({ name: 'مصرف الراجحي', class: 'atm' }), null);
  assert.equal(id({ name: 'Subway', class: 'railway' }), null);
  assert.equal(id({ name: 'STC Gate 3', class: 'gate' }), null);
  assert.equal(id({ name: 'Extra Mile', class: 'shop' }), null, 'a short name has to be the whole name');
  assert.equal(id({ name: 'eXtra', class: 'shop' }), 'extra');
  assert.equal(id({ name: 'Al Jazeera Restaurant', class: 'restaurant' }), null);
  assert.equal(id({}), null);
  assert.equal(id(undefined), null);
  // Every chain has what a shop front needs, and no two share an id or a name.
  const ids = new Set();
  const names = new Set();
  for (const brand of BRANDS) {
    assert.match(brand.band, /^#[0-9a-f]{6}$/, brand.id);
    if (brand.accent) assert.match(brand.accent, /^#[0-9a-f]{6}$/, brand.id);
    assert.ok(['food', 'cafe', 'market', 'fuel', 'bank', 'shop'].includes(brand.kind), brand.id);
    assert.ok(!ids.has(brand.id), brand.id);
    ids.add(brand.id);
    for (const name of brand.names) {
      assert.ok(name === name.toLowerCase() && !/[\s'’.-]/.test(name) && name.length >= 3, `${brand.id}: ${name}`);
      assert.ok(!names.has(name), name);
      names.add(name);
    }
  }
});

test('a branch with a building to itself is dressed all round; one in a larger building gets a shop front', () => {
  const buildings = [
    building(1, 0, 0, 20, 15, 6), // a restaurant of its own
    building(2, 100, 0, 80, 60, 9), // a row of shops, with one café of a chain in it
    building(3, 300, 0, 110, 90, 10), // a supermarket hall, with a café by the door
    building(4, 500, 0, 30, 20, 6), // one chain's restaurant, but the map shows three other shops in it
    building(5, 600, 0, 40, 30, 80), // a tower with a bank on its ground floor
    { ...building(6, 700, 0, 20, 15), kind: 'station' },
  ];
  const stores = [
    store("McDonald's", 'fast_food', 10, 7), // inside 1
    store('Starbucks', 'cafe', 140, -2), // just outside the south wall of 2
    store('Hyper Panda', 'grocery', 350, 45), // inside 3
    store('Starbucks', 'cafe', 320, 3), // inside 3, near its south wall
    store('Kudu', 'fast_food', 515, 10), // inside 4
    store('مصرف الراجحي', 'bank', 620, 2), // inside 5
    store('Dunkin', 'cafe', 900, 900), // no building anywhere near: a kiosk
    store('KFC', 'fast_food', 710, 7), // "inside" a metro station: left alone
  ];
  const others = [at(505, 5), at(520, 15), at(525, 5), at(150, 30), at(160, 40), at(340, 80)];
  const { features, dressed } = storeExtras(stores, buildings, () => [1, 0], others);
  assert.deepEqual([...dressed].sort(), [1, 3]);
  const of = (kind) => features.filter((feature) => feature.properties.kind === kind).map(span);

  // The restaurant: glass at the ground, its wall, the chain's yellow line and red band round the top, and the roof inside the band.
  const mc = of('store').filter((one) => one.east < 30);
  assert.deepEqual(mc.map((one) => [one.base, one.top, one.paint]), [[0, 3.1, '#7f96a8'], [3.1, 4.5, '#f2efe8'], [4.1, 4.5, '#ffbc0d'], [4.5, 6.4, '#db0007'], [6.4, 6.5, '#e4e1d9']]);
  assert.ok(near(mc[0].west, 0) && near(mc[0].east, 20) && near(mc[0].north, 15), 'on its own outline');
  assert.ok(mc[3].west < -0.2 && mc[3].east > 20.2 && mc[4].west > 0.5, 'the band stands a little proud, the roof lies inside it');
  // The supermarket: no glass, a white hall with the green band; the café by its door has a front on the hall's wall.
  const panda = of('store').filter((one) => one.west > 290);
  assert.deepEqual(panda.map((one) => one.paint), ['#f2efe8', '#ffffff', '#6a8038', '#e4e1d9']);
  assert.ok(panda[0].base === 0 && near(panda[2].top, 10.4));
  // Shop fronts: glass, a canopy over it and the band above, on the nearest wall, facing outwards.
  const fronts = of('front');
  assert.equal(fronts.length, 4 * 3, 'the café in the row, the café in the hall, the restaurant among other shops, the bank in the tower: three slabs each');
  const cafe = fronts.filter((one) => one.west > 130 && one.east < 150);
  assert.deepEqual(cafe.map((one) => [one.base, one.top, one.paint]), [[0, 3.1, '#7f96a8'], [3.1, 3.35, '#d4e9e2'], [3.35, 4.85, '#00754a']]);
  assert.ok(cafe.every((one) => one.north <= 0.3 && one.south >= -1.3), 'on the outside of the south wall');
  assert.ok(near(cafe[2].east - cafe[2].west, 9.6), 'a front 9.6 m wide');
  assert.ok(fronts.some((one) => one.paint === '#221bff' && one.west > 600 && one.east < 640), 'the bank at the foot of the tower');
  assert.ok(!fronts.some((one) => one.west > 695), 'nothing on the station');
  // The lone café: a kiosk in its colours.
  const kiosk = of('kiosk');
  assert.deepEqual(kiosk.map((one) => one.paint), ['#7f96a8', '#ef6a00', '#c63663', '#e4e1d9']);
  assert.ok(kiosk.every((one) => one.west > 890 && one.east < 910));

  assert.deepEqual(storeExtras([], buildings), { features: [], dressed: new Set() });
});

test('a fuel station is a canopy over its pumps, in the chain\'s colours, with its sign on a post', () => {
  const buildings = [building(1, 0, 0, 24, 12, 5), building(2, 200, 0, 90, 70, 8)];
  const stores = [store('ALdrees', 'fuel', 12, 6), store('SASCO', 'fuel', 500, 500), store('Petromin', 'fuel', 240, 30)];
  const { features, dressed } = storeExtras(stores, buildings, () => [0, 1]);
  // The outline at the first station is its canopy: it is taken off the ground and put on posts. The hall is far too large to be one.
  assert.deepEqual([...dressed], [1]);
  const canopy = features.filter((feature) => feature.properties.kind === 'canopy').map(span);
  const first = canopy.filter((one) => one.east < 40);
  assert.deepEqual(first.slice(0, 3).map((one) => [one.base, one.top, one.paint]), [[5, 5.9, '#00a5e5'], [5.9, 6.15, '#001b66'], [6.15, 6.25, '#f1f1ee']]);
  assert.equal(first.length, 3 + 4, 'the roof in three layers, on four posts');
  assert.ok(first.slice(3).every((post) => post.base === 0 && post.top === 5 && post.east - post.west < 1));
  // Pumps stand under it, and the sign beside it.
  const pumps = features.filter((feature) => feature.properties.kind === 'pump').map(span).filter((one) => one.east < 40);
  assert.ok(pumps.length >= 6 && pumps.every((one) => one.west >= 0 && one.east <= 24 && one.south >= 0 && one.north <= 12 && one.top <= 1.75));
  const sign = features.filter((feature) => feature.properties.kind === 'pylon').map(span).filter((one) => one.west < 60);
  assert.deepEqual(sign.map((one) => [one.base, one.top]), [[0, 5.6], [5.6, 8.2], [8.2, 8.7]]);
  // The second has no building on the map: a canopy of the usual size is put up, along the street.
  const second = canopy.filter((one) => one.west > 400);
  assert.equal(second.length, 7);
  assert.ok(near(second[0].north - second[0].south, 20.8, 0.2) && near(second[0].east - second[0].west, 11.4, 0.2), JSON.stringify(second[0]));
  assert.equal(canopy.filter((one) => one.west > 190 && one.east < 300).length, 0, 'nothing is done to the hall');
});
