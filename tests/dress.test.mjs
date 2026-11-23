import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRANDS, PLAIN_FUEL, STATION_GOLD, boxAround, brandOf, localKind, mosqueExtras, mosquesAmong, stationExtras, storeExtras } from '../js/dress.js';

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
  return { west: Math.min(...xs), east: Math.max(...xs), south: Math.min(...ys), north: Math.max(...ys), base: feature.properties.b, top: feature.properties.t, paint: feature.properties.c, kind: feature.properties.kind, night: feature.properties.n, hole: feature.geometry.coordinates[1] ? holeOf(feature) : null };
};
/** The box of the hole cut out of a slab that is a band, in metres. */
const holeOf = (feature) => {
  const points = feature.geometry.coordinates[1].map(metres);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { west: Math.min(...xs), east: Math.max(...xs), south: Math.min(...ys), north: Math.max(...ys) };
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
  const { features, dressed, roofs } = storeExtras(stores, buildings, () => [1, 0], others);
  assert.deepEqual([...dressed].sort(), [1, 3]);
  // Each of the two says where its new roof ends, for the photo of the real roof to be laid on it.
  assert.deepEqual([...roofs].sort(), [[1, 6.5], [3, 10.5]]);
  const of = (kind) => features.filter((feature) => feature.properties.kind === kind).map(span);

  // The restaurant: glass at the ground, its wall, the chain's yellow line and red band round the top, and the roof inside the band.
  const mc = of('store').filter((one) => one.east < 30);
  assert.deepEqual(mc.map((one) => [one.base, one.top, one.paint]), [[0, 3.1, '#7f96a8'], [3.1, 4.5, '#f2efe8'], [4.1, 4.5, '#ffbc0d'], [4.5, 6.4, '#db0007'], [4.5, 6.5, '#e4e1d9']]);
  assert.ok(near(mc[0].west, 0) && near(mc[0].east, 20) && near(mc[0].north, 15), 'on its own outline');
  assert.ok(mc[3].west < -0.2 && mc[3].east > 20.2 && mc[4].west > 0.5, 'the band stands a little proud, the roof lies inside it');
  // (The band is a band and no more: the roof fills its middle exactly, with nothing of the band under
  // it to show through from afar.)
  assert.deepEqual(mc.map((one) => Boolean(one.hole)), [false, false, false, true, false]);
  for (const side of ['west', 'east', 'south', 'north']) assert.ok(near(mc[3].hole[side], mc[4][side], 0.001), side);
  // By night the glass is lit from behind, and the band and the line under it keep their colours: a sign with a light of its own.
  assert.deepEqual(mc.map((one) => one.night), ['#ffe3ad', undefined, '#ffbc0d', '#db0007', undefined]);
  // The supermarket: no glass, a white hall with the green band; the café by its door has a front on the hall's wall.
  const panda = of('store').filter((one) => one.west > 290);
  assert.deepEqual(panda.map((one) => one.paint), ['#f2efe8', '#ffffff', '#6a8038', '#e4e1d9']);
  assert.ok(panda[0].base === 0 && near(panda[2].top, 10.4));
  // Shop fronts: glass, a canopy over it and the band above, on the nearest wall, facing outwards.
  const fronts = of('front');
  assert.equal(fronts.length, 4 * 3, 'the café in the row, the café in the hall, the restaurant among other shops, the bank in the tower: three slabs each');
  const cafe = fronts.filter((one) => one.west > 130 && one.east < 150);
  assert.deepEqual(cafe.map((one) => [one.base, one.top, one.paint]), [[0, 3.1, '#7f96a8'], [3.1, 3.35, '#d4e9e2'], [3.35, 4.85, '#00754a']]);
  assert.deepEqual(cafe.map((one) => one.night), ['#ffe3ad', undefined, '#00754a'], 'lit glass under a lit band');
  assert.ok(cafe.every((one) => one.north <= 0.3 && one.south >= -1.3), 'on the outside of the south wall');
  assert.ok(near(cafe[2].east - cafe[2].west, 9.6), 'a front 9.6 m wide');
  assert.ok(fronts.some((one) => one.paint === '#221bff' && one.west > 600 && one.east < 640), 'the bank at the foot of the tower');
  assert.ok(!fronts.some((one) => one.west > 695), 'nothing on the station');
  // The lone café: a kiosk in its colours.
  const kiosk = of('kiosk');
  assert.deepEqual(kiosk.map((one) => one.paint), ['#7f96a8', '#ef6a00', '#c63663', '#e4e1d9']);
  assert.ok(kiosk.every((one) => one.west > 890 && one.east < 910));
  assert.deepEqual(kiosk.map((one) => [Boolean(one.hole), one.night]), [[false, '#ffe3ad'], [true, '#ef6a00'], [false, '#c63663'], [false, undefined]]);
  assert.ok(near(kiosk[1].hole.west, kiosk[3].west, 0.001) && kiosk[3].base === kiosk[1].base && kiosk[3].top > kiosk[1].top, 'its roof fills the band and stands a little proud of it');

  assert.deepEqual(storeExtras([], buildings), { features: [], dressed: new Set(), roofs: new Map() });
});

test('a fuel station is a canopy over its pumps, in the chain\'s colours, with its sign on a post', () => {
  const buildings = [building(1, 0, 0, 24, 12, 5), building(2, 200, 0, 90, 70, 8)];
  const stores = [store('ALdrees', 'fuel', 12, 6), store('SASCO', 'fuel', 500, 500), store('Petromin', 'fuel', 240, 30)];
  const { features, dressed } = storeExtras(stores, buildings, () => [0, 1]);
  // The outline at the first station is its canopy: it is taken off the ground and put on posts. The hall is far too large to be one.
  assert.deepEqual([...dressed], [1]);
  const canopy = features.filter((feature) => feature.properties.kind === 'canopy').map(span);
  const first = canopy.filter((one) => one.east < 40);
  assert.deepEqual(first.slice(0, 3).map((one) => [one.base, one.top, one.paint]), [[5, 5.9, '#00a5e5'], [5.9, 6.15, '#001b66'], [5, 6.25, '#f1f1ee']]);
  assert.equal(first.length, 3 + 4, 'the roof in three parts, on four posts');
  // (The band and the stripe over it run round the edge; the canopy itself fills the middle. By night band and stripe are lit, the canopy's top is not.)
  assert.deepEqual(first.slice(0, 3).map((one) => [Boolean(one.hole), one.night]), [[true, '#00a5e5'], [true, '#001b66'], [false, undefined]]);
  for (const side of ['west', 'east', 'south', 'north']) assert.ok(near(first[0].hole[side], first[2][side], 0.001) && near(first[1].hole[side], first[2][side], 0.001), side);
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

test('a shop inside a building has its front on the wall towards the street', () => {
  // A deep building between a street to its south and a lane to its west. The café is nearer the west wall,
  // but the street it is entered from is the one to the south.
  const buildings = [building(1, 0, 0, 40, 30, 9), building(9, 600, 0, 30, 30, 9)];
  const stores = [store('Starbucks', 'cafe', 4, 12)];
  const others = [at(20, 20), at(30, 10), at(35, 25)];
  const nearest = storeExtras(stores, buildings, () => [1, 0], others).features.map(span);
  assert.ok(nearest.every((one) => one.kind === 'front' && one.east <= 0.3 && one.west >= -1.3), 'with nothing known about the street: on the nearest wall, the west one');
  const south = storeExtras(stores, buildings, () => [1, 0], others, { street: () => at(4, -8) }).features.map(span);
  assert.equal(south.length, 3);
  assert.ok(south.every((one) => one.kind === 'front' && one.north <= 0.3 && one.south >= -1.3), JSON.stringify(south));
  assert.ok(near((south[2].west + south[2].east) / 2, 4, 0.01), 'straight out from the café');
  // Too deep inside for a front on the street at all: 22 m and more.
  assert.equal(storeExtras([store('Starbucks', 'cafe', 20, 26)], buildings, () => [1, 0], others, { street: () => at(20, -8) }).features.length, 0);
});

test('the shops of no chain get a small front each, and a fuel station of no chain a plain canopy', () => {
  assert.deepEqual(['restaurant', 'fast_food', 'cafe', 'bakery', 'grocery', 'bank', 'pharmacy', 'shop', 'clothing_store', 'office', 'lodging', 'school', undefined].map((kind) => localKind({ class: kind })), ['food', 'food', 'cafe', 'cafe', 'market', 'bank', 'pharmacy', 'shop', 'shop', null, null, null, null]);
  assert.equal(localKind(null), null);
  const buildings = [
    building(1, 0, 0, 60, 20, 9), // a row of shops along a street to its south
    building(2, 100, 0, 20, 15, 6), // a restaurant of a chain, with a building to itself
    { ...building(3, 200, 0, 60, 20, 9), kind: 'station' },
  ];
  const locals = [
    { at: at(8, 4), kind: 'food' },
    { at: at(20, 4), kind: 'pharmacy' },
    { at: at(22, 5), kind: 'shop' }, // right beside the pharmacy: no room for a front of its own
    { at: at(45, 3), kind: 'bank' },
    { at: at(30, -4), kind: 'cafe' }, // marked on the pavement in front
    { at: at(110, 5), kind: 'shop' }, // inside the chain's own building: left to the chain
    { at: at(220, 5), kind: 'shop' }, // inside a metro station
    { at: at(400, 400), kind: 'food' }, // no building near
  ];
  const street = ([lng, lat]) => [lng, at(0, -8)[1]]; // the street runs along the south side
  const made = storeExtras([store("McDonald's", 'fast_food', 110, 7)], buildings, () => [1, 0], [], { street, locals });
  assert.deepEqual([...made.dressed], [2]);
  const fronts = made.features.filter((feature) => feature.properties.kind === 'local').map(span);
  assert.equal(fronts.length, 4 * 3, 'four shops with a front: glass, awning, sign');
  assert.ok(fronts.every((one) => one.north <= 0.3 && one.south >= -1.1 && one.west >= -0.1 && one.east <= 60.1), 'all on the south wall of the row');
  // The restaurant at 8 m along: glass to 2.9 m, a terracotta awning over the pavement, and its sign above.
  const first = fronts.filter((one) => one.west < 12 && one.east > 4);
  assert.deepEqual(first.map((one) => [one.base, one.top]), [[0, 2.9], [2.9, 3.12], [3.12, 4.05]]);
  assert.equal(first[0].paint, '#7f96a8');
  assert.equal(first[1].paint, '#a8482f');
  assert.match(first[2].paint, /^#[0-9a-f]{6}$/);
  assert.ok(near(first[2].east - first[2].west, 6.2), 'a front 6.2 m wide');
  assert.ok(first[1].south < first[2].south - 0.3, 'the awning reaches out further than the sign');
  // What a shop sells shows in its awning; its sign is its own, and the same every time.
  assert.deepEqual([...new Set(fronts.filter((one) => one.base === 2.9).map((one) => one.paint))].sort(), ['#2f4f7a', '#2f9a68', '#6e4b3a', '#a8482f']);
  const again = storeExtras([], buildings, () => [1, 0], [], { street, locals });
  assert.deepEqual(again.features.filter((feature) => feature.properties.kind === 'local' && feature.properties.b === 3.12).map((feature) => feature.properties.c).slice(0, 1), [first[2].paint]);

  // A fuel station of no chain: the outline on the map is its canopy, white with a red edge.
  assert.deepEqual([PLAIN_FUEL.kind, PLAIN_FUEL.band, PLAIN_FUEL.accent], ['fuel', '#ecebe6', '#c4483b']);
  const fuel = storeExtras([{ at: at(510, 8), brand: PLAIN_FUEL }], [building(5, 500, 0, 24, 14, 6)], () => [1, 0]);
  assert.deepEqual([...fuel.dressed], [5]);
  const canopy = fuel.features.filter((feature) => feature.properties.kind === 'canopy').map(span);
  assert.ok(canopy.some((one) => one.paint === '#ecebe6') && canopy.some((one) => one.paint === '#c4483b'));
  assert.ok(fuel.features.some((feature) => feature.properties.kind === 'pump'));
});

test('mosquesAmong tells the mosques from the houses round them', () => {
  const buildings = [
    { ...building(1, 0, 0, 30, 24, 8), kind: 'mosque', use: 'religious' }, // called a mosque by the data
    { ...building(2, 100, 0, 30, 24, 8), use: 'religious' }, // religious, with a place of prayer marked at its door
    { ...building(3, 200, 0, 30, 24, 8), use: 'religious' }, // religious, but nothing says of which faith
    building(4, 300, 0, 30, 24, 8), // of no stated use, with a place of prayer inside it
    building(5, 400, 0, 30, 24, 8), // of no stated use, with one marked on the street outside: a neighbour's
    { ...building(6, 500, 0, 30, 24, 8), use: 'commercial' }, // a prayer room in a shopping centre
    building(7, 600, 0, 300, 200, 20), // far too large to be a mosque
    { ...building(8, 1000, 0, 30, 24, 8), kind: 'mosque', replaced: true }, // a landmark stands in for it
    building(9, 1100, 0, 5, 5, 4), // a hut
  ];
  const prayers = [at(115, -8), at(315, 12), at(415, -6), at(515, 12), at(700, 100), at(1102, 2)];
  const found = mosquesAmong(buildings, prayers);
  assert.deepEqual(found.map((mosque) => mosque.id).sort((a, b) => a - b), [1, 2, 4]);
  assert.deepEqual(found.find((mosque) => mosque.id === 2).height, 8);
  assert.equal(found.find((mosque) => mosque.id === 4).ring.length, 5);
  // With no places of prayer on the map, only what the data itself calls a mosque.
  assert.deepEqual(mosquesAmong(buildings, []).map((mosque) => mosque.id), [1]);
  assert.deepEqual(mosquesAmong([], prayers), []);
});

test('a mosque gets a dome on its roof and a minaret at a corner; a large one a minaret at either end', () => {
  const small = { id: 1, ring: rect(0, 0, 30, 24), height: 8 };
  const { features, shades } = mosqueExtras([small], 1.2);
  const dome = features.filter((feature) => feature.properties.kind === 'dome').map(span);
  const minaret = features.filter((feature) => feature.properties.kind === 'minaret').map(span);
  // The dome: in the middle of the roof, on a low drum, narrowing as it rises, with a gilt finial.
  assert.equal(dome.length, 8);
  assert.ok(dome.every((one) => near((one.west + one.east) / 2, 15, 0.6) && near((one.south + one.north) / 2, 12, 0.6)), 'in the middle');
  assert.equal(dome[0].base, 8 + 1.2);
  const widths = dome.slice(1, 7).map((one) => one.east - one.west);
  assert.ok(widths.every((width, i) => i === 0 || width < widths[i - 1]), widths.join(' '));
  assert.ok(near(widths[0], 2 * 12 * 0.42, 0.5), 'sized to the building');
  assert.equal(dome[7].paint, '#c8a64b');
  assert.ok(dome[7].top > dome[6].top && dome[7].east - dome[7].west < 0.6);
  // The minaret: from the ground, inside a corner of the building, well above its roof; a balcony below the top.
  assert.equal(minaret.length, 9, 'foot, shaft, balcony, upper shaft, four rings of cap, finial');
  assert.equal(minaret[0].base, 0);
  const top = Math.max(...minaret.map((one) => one.top));
  assert.ok(top > 20 + 1.3 && top < 41, `${top}`);
  const middle = [(minaret[0].west + minaret[0].east) / 2, (minaret[0].south + minaret[0].north) / 2];
  assert.ok(near(Math.abs(middle[0] - 15), 15 - 1.9, 0.05) && near(Math.abs(middle[1] - 12), 12 - 1.9, 0.05), `${middle}`);
  const balcony = minaret[2];
  assert.ok(balcony.east - balcony.west > minaret[1].east - minaret[1].west && balcony.top < top - 5, 'a balcony wider than the shaft');
  // By night a mosque is lit: the green lamps of the minaret's balcony and cap, its shaft and the dome in white light, the finials gilt.
  const lit = (list) => list.map((one) => one.night);
  assert.deepEqual(lit(minaret), [undefined, '#b0a488', '#62f08e', '#b0a488', '#62f08e', '#62f08e', '#62f08e', '#62f08e', '#ffd873']);
  assert.deepEqual(lit(dome), ['#85775c', '#b9b29c', '#b9b29c', '#b9b29c', '#b9b29c', '#b9b29c', '#b9b29c', '#ffd873']);
  // It throws a shadow of its own.
  assert.equal(shades.length, 1);
  assert.ok(near(shades[0].height, top - 1.4, 0.01) && shades[0].base === 0 && shades[0].polygons[0][0].length === 5);

  // A large mosque: a larger dome, and a minaret at either end of one side, taller.
  const large = mosqueExtras([{ id: 2, ring: rect(0, 0, 70, 40), height: 12 }], 1.2);
  assert.equal(large.shades.length, 2);
  assert.ok(large.shades[0].height > shades[0].height);
  const feet = large.features.filter((feature) => feature.properties.kind === 'minaret' && feature.properties.b === 0).map(span);
  assert.ok(near(Math.abs((feet[0].west + feet[0].east) / 2 - (feet[1].west + feet[1].east) / 2), 70 - 3.8, 0.1), 'one at either end');
  assert.ok(near((feet[0].south + feet[0].north) / 2, (feet[1].south + feet[1].north) / 2, 0.05), 'on the same side');
  // The same mosque comes out the same every time; a sliver of a building gets nothing.
  assert.deepEqual(mosqueExtras([small], 1.2), { features, shades });
  assert.deepEqual(mosqueExtras([{ id: 3, ring: rect(0, 0, 30, 5), height: 8 }], 1.2), { features: [], shades: [] });
  assert.deepEqual(mosqueExtras([], 1.2), { features: [], shades: [] });
});

test('a shop\'s own building keeps its usual height, whatever a shadow in the photo suggested', () => {
  // The photo's shadows said 31 m; the usual height for such a building is 6 m.
  const raised = [{ ...building(1, 0, 0, 20, 15, 31), usual: 6 }];
  const made = storeExtras([store("McDonald's", 'fast_food', 10, 7)], raised, () => [1, 0]);
  assert.deepEqual([...made.dressed], [1]);
  assert.deepEqual([...made.roofs], [[1, 6.5]]);
  assert.ok(made.features.every((feature) => feature.properties.t <= 6.5));
  // A building that is on record as 31 m tall is a tower with a branch at its foot: a front on its wall, no more.
  const tower = storeExtras([store("McDonald's", 'fast_food', 10, 7)], [building(1, 0, 0, 20, 15, 31)], () => [1, 0]);
  assert.equal(tower.dressed.size, 0);
  assert.ok(tower.features.every((feature) => feature.properties.kind === 'front'));
});

test('by night the metro shows its lights: glass lit from behind, the gold screens from within; concrete stays dark', () => {
  const features = stationExtras([rect(0, 0, 120, 20)], [at(60, 70), at(400, 400)]);
  const by = (paint) => features.filter((feature) => feature.properties.c === paint);
  assert.ok(by(STATION_GOLD).length >= 3 && by(STATION_GOLD).every((feature) => feature.properties.n === '#e2b45c'));
  assert.ok(by('#9db4c6').length >= 2 && by('#9db4c6').every((feature) => feature.properties.n === '#ffe7b8'));
  for (const paint of ['#d9dcde', '#d6d1c6', '#22324d']) assert.ok(by(paint).every((feature) => feature.properties.n === undefined), paint);
  assert.ok(features.every((feature) => feature.geometry.coordinates.length === 1), 'none of them is a band');
});
