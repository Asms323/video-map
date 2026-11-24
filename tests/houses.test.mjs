import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOUSE_STYLES, dressHouses, houseParts, parcelHouses, streetAprons, styleOf } from '../js/houses.js';
import { buildNetwork, Mesh, unitFrom } from '../js/life.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const EAST = 1 / (111320 * Math.cos((24.7 * Math.PI) / 180));
const NORTH = 1 / 111320;
const line = (cls, points, more = {}) => ({ class: cls, oneway: 0, tunnel: false, coordinates: points.map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH]), ...more });
/** A block of houses as the map gives it: a box in metres east and north of the origin, of no recorded height. */
const block = (id, west, south, east, north, more = {}) => ({
  id,
  height: 7.5,
  base: 0,
  known: false,
  kind: undefined,
  use: 'residential',
  polygons: [[[[west, south], [east, south], [east, north], [west, north], [west, south]].map(([x, y]) => [ORIGIN.lng + x * EAST, ORIGIN.lat + y * NORTH])]],
  ...more,
});
const metres = ([lng, lat]) => [(lng - ORIGIN.lng) / EAST, (lat - ORIGIN.lat) / NORTH];
const boxOf = (ring) => {
  const points = ring.map(metres);
  return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
};
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3)]);
const villas = () => ({ kind: 'east', fenced: 0.9 });
// A house street running east, 10.5 m wide: its northern edge lies 5.25 m north of its middle.
const street = () => buildNetwork([line('minor', [[-200, 0], [200, 0]], { width: 10.5 })], ORIGIN);

test('styleOf gives each kind of district its own mixture of the four styles of villa, the same every time', () => {
  assert.deepEqual(Object.keys(HOUSE_STYLES), ['plaster', 'stone', 'arched', 'modern']);
  for (const style of Object.values(HOUSE_STYLES)) {
    assert.ok(style.walls.length >= 4 && [...style.walls, style.trim, style.gate, style.tile].every((colour) => /^#[0-9a-f]{6}$/.test(colour)));
  }
  const count = (kind) => {
    const seen = { plaster: 0, stone: 0, arched: 0, modern: 0 };
    for (let i = 0; i < 1000; i += 1) seen[styleOf(kind, (i + 0.5) / 1000)] += 1;
    return seen;
  };
  // The east is tan plaster above all; the new north is modern above all; every style turns up somewhere.
  const east = count('east');
  const north = count('north');
  assert.ok(east.plaster > 500 && east.plaster > east.stone && east.modern < 100, JSON.stringify(east));
  assert.ok(north.modern > 450 && north.modern > north.stone, JSON.stringify(north));
  assert.ok(Object.values(count('villa')).every((share) => share > 100));
  // A kind nobody listed gets the usual mixture, and the same answer every time.
  assert.equal(styleOf('nowhere', 0.1), styleOf('nowhere', 0.1));
  assert.ok(Object.keys(HOUSE_STYLES).includes(styleOf('nowhere', 0.999)));
});

test('houseParts lays a villa out as a main part of two storeys with a lower wing or a room on the roof', () => {
  const shapes = new Set();
  for (let seed = 0; seed < 60; seed += 1) {
    const chance = (n) => unitFrom(`${seed}:${n}`);
    const { parts, court } = houseParts(20, 24, chance);
    const main = parts.find((part) => part.part === 'main');
    assert.ok(main && main.height >= 7.6 && main.height <= 9.2);
    // Every part lies inside the box its plot's building fills.
    for (const part of parts) assert.ok(part.a0 >= -1e-9 && part.a1 <= 20 + 1e-9 && part.b0 >= -1e-9 && part.b1 <= 24 + 1e-9 && part.a1 > part.a0 && part.b1 > part.b0);
    const other = parts.find((part) => part.part !== 'main');
    assert.equal(parts.length, 2);
    if (other.part === 'wing') {
      // A wing is one storey; the court is the ground left open before the house, and no part stands in it.
      assert.ok(other.height >= 3.9 && other.height <= 4.6);
      assert.ok(court && court.a1 - court.a0 > 3 && court.b1 - court.b0 >= 4.5);
      for (const part of parts) assert.ok(part.a1 <= court.a0 + 1e-9 || part.a0 >= court.a1 - 1e-9 || part.b0 >= court.b1 - 1e-9 || part.b1 <= court.b0 + 1e-9);
    } else {
      // A room on the roof stands a storey over the main part, set back from the street.
      assert.equal(other.part, 'room');
      assert.ok(Math.abs(other.height - main.height - 3.1) < 1e-9 && other.b0 > 6 && court === null);
    }
    shapes.add(`${other.part}:${main.b0 > 0 ? 'behind' : 'beside'}`);
  }
  // All three ways of building a villa turn up.
  assert.deepEqual([...shapes].sort(), ['room:beside', 'wing:behind', 'wing:beside']);
  // A house too narrow for parts is one block.
  assert.equal(houseParts(8, 20, () => 0.3).parts.length, 1);
});

test('parcelHouses divides a block of villas into houses along its street, and leaves everything else as it was', () => {
  const network = street();
  // A block 40 m long and 24 m deep, 4 m back from the edge of the street: two plots of about 19 m.
  const row = block(1024, -20, 9.25, 20, 33.25);
  const recorded = block(2048, 60, 9.25, 100, 33.25, { known: true });
  const flats = block(3072, 110, 9.25, 150, 33.25, { height: 15 });
  const model = block(4096, -100, 9.25, -60, 33.25, { replaced: true });
  const shed = block(5120, -150, 9.25, -142, 17.25);
  const made = parcelHouses([row, recorded, flats, model, shed], network, { districtOf: villas });
  assert.deepEqual(made.divided, [1024]);
  assert.equal(made.houses.length, 2);
  // What was not divided is handed on untouched; the divided block is gone, its houses' parts stand in its place.
  for (const kept of [recorded, flats, model, shed]) assert.ok(made.buildings.includes(kept));
  assert.ok(!made.buildings.includes(row));
  const pieces = made.buildings.filter((building) => building.house !== undefined);
  assert.equal(pieces.length, made.houses.reduce((sum, house) => sum + house.pieces.length, 0));
  const ids = new Set(pieces.map((piece) => piece.id));
  assert.equal(ids.size, pieces.length);
  for (const piece of pieces) {
    assert.ok(Number.isFinite(piece.id) && piece.known === false && piece.use === 'residential' && piece.base === 0 && piece.height >= 3.9 && piece.height <= 12.4);
    assert.equal(piece.colour, made.houses[piece.house].paint);
    // Every part stands within the block the map drew.
    const [west, south, east, north] = boxOf(piece.polygons[0][0]);
    assert.ok(west >= -20 - 1e-6 && east <= 20 + 1e-6 && south >= 9.25 - 1e-6 && north <= 33.25 + 1e-6, `${west} ${south} ${east} ${north}`);
  }
  // The two houses: side by side along the street, a gap of a metre or two between them, each fronting south onto it.
  const [first, second] = [...made.houses].sort((a, b) => metres(a.at)[0] - metres(b.at)[0]);
  const spans = [first, second].map((house) => {
    const boxes = house.pieces.map((piece) => boxOf(piece.polygons[0][0]));
    return [Math.min(...boxes.map((b) => b[0])), Math.max(...boxes.map((b) => b[2]))];
  });
  const gap = spans[1][0] - spans[0][1];
  assert.ok(gap >= 1.6 - 1e-6 && gap <= 2.5 + 1e-6, String(gap));
  for (const house of made.houses) {
    assert.ok(Math.abs(house.along[0] - 1) < 1e-6 && Math.abs(house.back[1] - 1) < 1e-6, 'the front runs along the street; back is away from it');
    assert.ok(house.wide > 16 && house.wide < 20 && Math.abs(house.deep - 24) < 1e-6);
    assert.ok(Object.keys(HOUSE_STYLES).includes(house.style) && HOUSE_STYLES[house.style].walls.includes(house.paint));
    // The plot: a yard of 2.4 m in front (the street leaves 4 m), half the gap to the neighbour on the inner side.
    assert.ok(Math.abs(house.plot.toStreet - 4) < 0.01 && Math.abs(house.plot.front - 2.4) < 1e-6, JSON.stringify(house.plot));
    assert.equal(house.rows, 1);
  }
  assert.deepEqual(first.ends, [true, false]);
  assert.deepEqual(second.ends, [false, true]);
  assert.ok(Math.abs(first.plot.right + second.plot.left - gap) < 1e-6);
  // The same block gives the same houses every time.
  assert.deepEqual(parcelHouses([row], network, { districtOf: villas }).houses.map((house) => [house.style, house.paint, house.wide]), made.houses.map((house) => [house.style, house.paint, house.wide]));

  // Left alone: where houses do not stand behind walls of their own; a block that came in two pieces (it lies across
  // the edge of a map tile); one that is told not to be whole; a mosque; and everything, without the streets.
  assert.deepEqual(parcelHouses([row], network, { districtOf: () => ({ kind: 'old', fenced: 0.1 }) }).divided, []);
  assert.deepEqual(parcelHouses([row, { ...row }], network, { districtOf: villas }).divided, []);
  assert.deepEqual(parcelHouses([row], network, { districtOf: villas, whole: () => false }).divided, []);
  assert.deepEqual(parcelHouses([row], network, { districtOf: villas, skip: new Set([1024]) }).divided, []);
  const without = parcelHouses([row], null, { districtOf: villas });
  assert.ok(without.buildings.length === 1 && without.buildings[0] === row && without.houses.length === 0);
  // And a block too far from any street.
  assert.deepEqual(parcelHouses([block(6144, -20, 120, 20, 144)], network, { districtOf: villas }).divided, []);
});

test('parcelHouses makes two rows, back to back, of a block two plots deep', () => {
  const made = parcelHouses([block(7168, -20, 9.25, 20, 59.25)], street(), { districtOf: villas });
  assert.equal(made.houses.length, 4);
  const front = made.houses.filter((house) => house.row === 0);
  const rear = made.houses.filter((house) => house.row === 1);
  assert.ok(front.length === 2 && rear.length === 2 && made.houses.every((house) => house.rows === 2));
  // The back row looks the other way: its front is the block's far side.
  for (const house of rear) assert.ok(Math.abs(house.along[0] + 1) < 1e-6 && Math.abs(house.back[1] + 1) < 1e-6 && Math.abs(metres(house.at)[1] - 59.25) < 1e-3);
  for (const house of front) assert.ok(Math.abs(metres(house.at)[1] - 9.25) < 1e-3 && house.deep < 25);
});

test('dressHouses stands a wall round each plot, with a gate in its front, and tiles its court', () => {
  const made = parcelHouses([block(1024, -20, 9.25, 20, 33.25)], street(), { districtOf: villas });
  const mesh = new Mesh();
  const dressed = dressHouses(mesh, made.houses, ORIGIN);
  assert.equal(dressed.houses, 2);
  assert.equal(dressed.gates, 2);
  // Three sides and a back wall each, less the wall the two share; and the pieces of the front wall round gate and door.
  assert.ok(dressed.walls >= 9, String(dressed.walls));
  assert.ok(mesh.count > 600 && mesh.count % 6 === 0);
  const all = corners(mesh);
  // Everything stands on its plot: from the wall before the houses (a yard and half a wall's thickness out, with
  // a canopy reaching a metre over the street side) to the wall behind; nothing higher than a gate's canopy.
  for (const [x, y, z] of all) {
    assert.ok(x > -20 - 2.4 - 0.4 && x < 20 + 2.4 + 0.4, String(x));
    assert.ok(y > 9.25 - 2.4 - 1.2 && y < 33.25 + 2.4 + 0.4, String(y));
    assert.ok(z >= 0 && z < 4.6, String(z));
  }
  // The front wall stands 2.4 m before the houses, as tall as a plot's wall is.
  const frontWall = all.filter(([, y, z]) => Math.abs(y - (9.25 - 2.4)) < 0.2 && z > 2.5);
  assert.ok(frontWall.length > 20);
  // Nothing without an origin; and the same houses dress the same way.
  assert.equal(dressHouses(new Mesh(), made.houses, null).houses, 0);
  const again = new Mesh();
  dressHouses(again, made.houses, ORIGIN);
  assert.deepEqual(Array.from(again.positions.subarray(0, again.count * 3)), Array.from(mesh.positions.subarray(0, mesh.count * 3)));
});

test('streetAprons lays asphalt from a house street to the foot of the walls along it, and a raised strip there', () => {
  const network = street();
  // Buildings along the north side only, from 11 m out from the middle of the street.
  const built = (x, y) => y > 11 && y < 40 && x > -150 && x < 150;
  const mesh = new Mesh();
  const made = streetAprons(mesh, network, ORIGIN, built);
  assert.equal(made.streets, 1);
  assert.ok(made.stretches > 20, String(made.stretches));
  const all = corners(mesh);
  // All of it on the built side, between the roadway's edge and where the plots' walls stand; none on the open side.
  for (const [x, y, z] of all) {
    assert.ok(y > 5.25 - 0.5 && y < 11 - 2.4 + 0.3, String(y));
    assert.ok(z > 0 && z < 0.2 && Math.abs(x) < 200);
  }
  // The asphalt lies almost flat on the ground and reaches to a yard and a strip short of the buildings; the strip is raised.
  const asphalt = all.filter(([, , z]) => z < 0.1);
  const strip = all.filter(([, , z]) => z >= 0.1);
  assert.ok(asphalt.length > 0 && strip.length > 0);
  assert.ok(Math.abs(Math.max(...asphalt.map((c) => c[1])) - (11 - 2.4 - 1.3)) < 0.4, String(Math.max(...asphalt.map((c) => c[1]))));
  assert.ok(Math.abs(Math.max(...strip.map((c) => c[1])) - (11 - 2.4)) < 0.3);
  // The street's two ends are left as the map draws them.
  assert.ok(Math.min(...all.map((c) => c[0])) >= -200 + 6 - 1e-6 && Math.max(...all.map((c) => c[0])) <= 200 - 6 + 1e-6);
  // Where nothing is built along a street, nothing is laid; nor on a main road, nor without knowing what is built.
  assert.equal(streetAprons(new Mesh(), network, ORIGIN, () => false).stretches, 0);
  assert.equal(streetAprons(new Mesh(), buildNetwork([line('primary', [[-200, 0], [200, 0]], { width: 12 })], ORIGIN), ORIGIN, built).stretches, 0);
  assert.equal(streetAprons(new Mesh(), network, ORIGIN, null).stretches, 0);
});
