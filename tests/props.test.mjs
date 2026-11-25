import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BOULEVARD_WORLD, GREEK_HOUSES, WORLD_PARTS, WORLD_SPOTS, worldPlace } from '../js/boulevard.js';
import { FAMOUS } from '../js/famous.js';
import { KAFD_PARTS } from '../js/kafd.js';
import { landmarkShades, replacedByLandmarks } from '../js/landmarks.js';
import { HOUSE_MODELS_MOST, HOUSE_MODEL_MIN_ZOOM, HOUSE_MODEL_REACH_METERS, PROPS, housesNear, propNormals, propsNear, readProp } from '../js/props.js';

const METERS = 111320;
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
const bytesOf = (file) => {
  const data = readFileSync(new URL(`../models/${file}`, import.meta.url));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
};

/**
 * A packed mesh, as tools/models/pack.mjs writes one: corners [[east, north, up, across, down], …] and triangles;
 * and, as a mesh built by hand may have it, how each corner shows by night (see readProp).
 */
function packed(corners, triangles, lamps = null) {
  const min = [0, 1, 2].map((k) => Math.min(...corners.map((corner) => corner[k])));
  const max = [0, 1, 2].map((k) => Math.max(...corners.map((corner) => corner[k])));
  const padded = (length) => length + ((4 - (length % 4)) % 4);
  const lampsAt = 36 + padded(corners.length * 6) + padded(corners.length * 4) + padded(triangles.length * 2);
  const data = new DataView(new ArrayBuffer(lamps ? lampsAt + corners.length : lampsAt - padded(triangles.length * 2) + triangles.length * 2));
  if (lamps) lamps.forEach((lamp, i) => data.setUint8(lampsAt + i, lamp));
  [0x56, 0x4d, 0x4d, 0x31].forEach((byte, i) => data.setUint8(i, byte));
  data.setUint32(4, corners.length, true);
  data.setUint32(8, triangles.length, true);
  [...min, ...max].forEach((value, k) => data.setFloat32(12 + k * 4, value, true));
  corners.forEach((corner, i) => {
    for (let k = 0; k < 3; k += 1) data.setUint16(36 + (i * 3 + k) * 2, Math.round(((corner[k] - min[k]) / (max[k] - min[k] || 1)) * 65535), true);
    for (let k = 0; k < 2; k += 1) data.setUint16(36 + padded(corners.length * 6) + (i * 2 + k) * 2, Math.round(corner[3 + k] * 65535), true);
  });
  triangles.forEach((corner, i) => data.setUint16(36 + padded(corners.length * 6) + padded(corners.length * 4) + i * 2, corner, true));
  return data.buffer;
}

test('a packed mesh is read back with its height, its place on its picture, and the way its surface looks', () => {
  // A pyramid one high on a square foot, its sides given anticlockwise as seen from outside.
  const corners = [[-0.5, -0.5, 0, 0, 1], [0.5, -0.5, 0, 1, 1], [0.5, 0.5, 0, 1, 0], [-0.5, 0.5, 0, 0, 0], [0, 0, 1, 0.5, 0.5]];
  const mesh = readProp(packed(corners, [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]), 20);
  assert.equal(mesh.corners, 5);
  assert.deepEqual(Array.from(mesh.indices), [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
  // Twenty metres tall, ten from its middle line to each side of its foot.
  assert.ok(near(mesh.top, 20) && near(mesh.reach, Math.hypot(10, 10), 0.01));
  assert.ok(near(mesh.positions[12], 0, 0.01) && near(mesh.positions[13], 0, 0.01) && near(mesh.positions[14], 20));
  assert.ok(near(mesh.uvs[8], 0.5, 1e-4) && near(mesh.uvs[9], 0.5, 1e-4) && near(mesh.uvs[2], 1) && near(mesh.uvs[3], 1));
  // At its tip the surface looks straight up; at a corner of its foot, outward and up.
  assert.ok(near(mesh.normals[12], 0, 1e-6) && near(mesh.normals[13], 0, 1e-6) && near(mesh.normals[14], 1, 1e-6));
  assert.ok(mesh.normals[0] < -0.3 && mesh.normals[1] < -0.3 && mesh.normals[2] > 0.3);
  for (let i = 0; i < 5; i += 1) assert.ok(near(Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]), 1, 1e-5));
  // What is not such a file is not read.
  assert.equal(readProp(new ArrayBuffer(10)), null);
  assert.equal(readProp(new Uint8Array(64).buffer), null);
  const cut = packed(corners, [0, 1, 4]);
  assert.equal(readProp(cut.slice(0, cut.byteLength - 4)), null);
  assert.equal(readProp(packed(corners, [0, 1, 9])), null, 'a triangle that names a corner that is not there');
});

test('corners at one place share the way the surface looks there, so the light does not break at a seam of the picture', () => {
  // Two triangles of one flat square that meet along a seam: the corners along it are given twice.
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1]);
  const normals = propNormals(positions, Uint16Array.from([0, 1, 2, 3, 4, 5]));
  for (const [a, b] of [[0, 3], [2, 4]]) for (let k = 0; k < 3; k += 1) assert.ok(near(normals[a * 3 + k], normals[b * 3 + k]));
  // (Between the level face, which looks straight up, and the leaning one, which looks east, south and up.)
  assert.ok(near(normals[0], 1 / Math.sqrt(6), 1e-5) && near(normals[1], -1 / Math.sqrt(6), 1e-5) && near(normals[2], 2 / Math.sqrt(6), 1e-5));
});

test('the models are in models/, each a mesh and its picture, small enough for a phone', () => {
  assert.deepEqual(PROPS.map((one) => one.id), [
    'blvd-world-pagoda', 'blvd-world-china-hall', 'blvd-world-china-great-hall', 'blvd-world-china-small-hall', 'blvd-world-pylon-1', 'blvd-world-pylon-2', 'blvd-world-church-1', 'blvd-world-church-2',
    ...GREEK_HOUSES.map((_, n) => `blvd-world-greek-house-${n + 1}`),
  ]);
  assert.equal(new Set(PROPS.map((one) => one.id)).size, PROPS.length);
  assert.deepEqual([...new Set(PROPS.map((one) => one.file))], ['pagoda', 'hall', 'pylon', 'church', 'house']);
  // (The house is a piece cut off the church's model, and keeps the church's picture.)
  assert.deepEqual([...new Set(PROPS.map((one) => one.picture ?? one.file))], ['pagoda', 'hall', 'pylon', 'church']);
  const house = readProp(bytesOf('house.vmm'));
  assert.ok(house && house.corners > 2000 && house.indices.length / 3 > 3000 && near(house.top, 1, 1e-4) && house.reach < 0.7);
  // (Its roof looks up: the surfaces at its top are turned to the sky.)
  let roofs = 0;
  let turned = 0;
  for (let i = 0; i < house.corners; i += 1) {
    if (house.positions[i * 3 + 2] < 0.9) continue;
    roofs += 1;
    turned += house.normals[i * 3 + 2];
  }
  assert.ok(roofs > 50 && turned / roofs > 0.5, `the house's roof looks ${(turned / roofs).toFixed(2)} up`);
  for (const file of new Set(PROPS.map((one) => one.picture ?? one.file))) {
    // One high as it is packed, standing on the ground; its picture a JPEG.
    const mesh = readProp(bytesOf(`${file}.vmm`));
    assert.ok(mesh && mesh.corners > 4000 && mesh.corners <= 65535, `${file}: ${mesh?.corners} corners`);
    assert.ok(mesh.indices.length / 3 > 6000 && mesh.indices.length / 3 <= 32000, `${file}: ${mesh.indices.length / 3} triangles`);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 2; i < mesh.positions.length; i += 3) {
      low = Math.min(low, mesh.positions[i]);
      high = Math.max(high, mesh.positions[i]);
    }
    assert.ok(near(low, 0, 0.002) && near(high, 1, 1e-4) && near(mesh.top, 1, 1e-4), `${file}: from ${low} to ${high}`);
    assert.ok(mesh.reach > 0.25 && mesh.reach < 1.1, `${file}: reaches ${mesh.reach.toFixed(2)}`);
    // Every triangle is wound anticlockwise seen from outside, so that each surface is known to look outwards
    // and the sun lights the side that is turned to it: the space the mesh encloses, summed that way, is more
    // than nothing. (The first models were packed inside out.)
    let space = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((axis) => mesh.positions[mesh.indices[t + k] * 3 + axis]));
      space += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    assert.ok(space > 0.02, `${file}: encloses ${space.toFixed(3)}`);
    for (let i = 0; i < mesh.uvs.length; i += 1) assert.ok(mesh.uvs[i] >= 0 && mesh.uvs[i] <= 1);
    for (let i = 0; i < mesh.corners; i += 97) assert.ok(near(Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]), 1, 1e-4));
    const picture = new Uint8Array(bytesOf(`${file}.jpg`));
    assert.ok(picture[0] === 0xff && picture[1] === 0xd8 && picture.length < 400000, `${file}.jpg`);
    assert.ok(bytesOf(`${file}.vmm`).byteLength < 600000, `${file}.vmm`);
  }
  for (const one of PROPS) {
    assert.ok(one.name.length > 5 && one.height > 5 && one.height < 60 && one.night === 1 && one.within === 4000 && one.shade.height < one.height, one.id);
    // In the fairground: within 420 m of its mark.
    assert.ok(Math.hypot((one.at[0] - BOULEVARD_WORLD[0]) * METERS * Math.cos((BOULEVARD_WORLD[1] * Math.PI) / 180), (one.at[1] - BOULEVARD_WORLD[1]) * METERS) < 420, one.id);
  }
  // The hall is 1.32 times as long as it is tall, and 0.84 times as deep: the red hall, 17 m tall, is 22 m long.
  const hall = readProp(bytesOf('hall.vmm'), 17);
  let long = 0;
  let deep = 0;
  for (let i = 0; i < hall.positions.length; i += 3) {
    long = Math.max(long, Math.abs(hall.positions[i]));
    deep = Math.max(deep, Math.abs(hall.positions[i + 1]));
  }
  assert.ok(near(long * 2, 22.4, 0.2) && near(deep * 2, 14.2, 0.2), `${long * 2} by ${deep * 2}`);
  // Each is as wide for its height as its photograph showed the thing (and not as the first of them were made,
  // from photographs that reached the generator stretched to a square): how wide and how deep, for a height of 1.
  const footOf = (file) => {
    const { foot } = readProp(bytesOf(`${file}.vmm`));
    return [foot[1] - foot[0], foot[3] - foot[2]];
  };
  for (const [file, wide, deep] of [['pagoda', 0.4, 0.41], ['hall', 1.32, 0.84], ['pylon', 0.53, 0.82], ['church', 1.24, 0.45], ['house', 0.84, 0.87]]) {
    const foot = footOf(file);
    assert.ok(near(foot[0], wide, 0.006) && near(foot[1], deep, 0.006), `${file}: ${foot.map((v) => v.toFixed(3)).join(' by ')}`);
  }
  // The Greek village: fifteen houses of 6.5 to 9.5 m, each turned its own way, all within 30 m of the
  // village's middle, and none where a church stands.
  assert.equal(GREEK_HOUSES.length, 15);
  const village = WORLD_PARTS.find((one) => one.id === 'blvd-world-greece').at;
  for (const one of GREEK_HOUSES) {
    assert.ok(one.height >= 6.4 && one.height <= 9.6 && Number.isInteger(one.turn) && one.turn >= -8 && one.turn < 280, JSON.stringify(one));
    assert.ok(Math.hypot(one.at[0] - village[0], one.at[1] - village[1]) < 30);
    for (const spot of WORLD_SPOTS.churches) assert.ok(Math.hypot(one.at[0] - spot[0], one.at[1] - spot[1]) >= 15, `a house stands in the church at ${spot}`);
  }
  assert.ok(new Set(GREEK_HOUSES.map((one) => Math.round(one.turn / 90))).size >= 3, 'turned three ways at least');
  // And each of them stands where the list of the fairground's spots has it.
  const placed = (id) => PROPS.find((one) => one.id === id).at;
  assert.deepEqual(placed('blvd-world-pagoda'), worldPlace(WORLD_SPOTS.pagoda));
  assert.deepEqual([placed('blvd-world-pylon-1'), placed('blvd-world-pylon-2')], WORLD_SPOTS.pylons.map(worldPlace));
  assert.deepEqual([placed('blvd-world-church-1'), placed('blvd-world-church-2')], WORLD_SPOTS.churches.map(worldPlace));
});

test('the pagoda of Boulevard World: a mesh made from a photograph, and its picture', () => {
  const pagoda = PROPS.find((one) => one.id === 'blvd-world-pagoda');
  assert.ok(pagoda && pagoda.file === 'pagoda' && pagoda.height === 31 && pagoda.night === 1 && pagoda.within === 4000);
  // It stands in the Chinese quarter, south of the lagoon.
  const east = (pagoda.at[0] - BOULEVARD_WORLD[0]) * METERS * Math.cos((BOULEVARD_WORLD[1] * Math.PI) / 180);
  const north = (pagoda.at[1] - BOULEVARD_WORLD[1]) * METERS;
  assert.ok(near(east, 57.5, 0.01) && near(north, -238, 0.01));
  const mesh = readProp(bytesOf('pagoda.vmm'), pagoda.height);
  assert.ok(mesh.corners > 10000 && mesh.corners <= 65535, `${mesh.corners} corners`);
  assert.ok(mesh.indices.length / 3 > 15000 && mesh.indices.length / 3 < 40000, `${mesh.indices.length / 3} triangles`);
  // On the ground, 31 m tall and slender: its eaves reach some eight metres from its middle line.
  let low = Infinity;
  let high = -Infinity;
  for (let i = 2; i < mesh.positions.length; i += 3) {
    low = Math.min(low, mesh.positions[i]);
    high = Math.max(high, mesh.positions[i]);
  }
  assert.ok(near(low, 0, 0.01) && near(high, 31, 0.01) && near(mesh.top, 31, 0.01));
  assert.ok(mesh.reach > 6 && mesh.reach < 9, `reaches ${mesh.reach.toFixed(1)} m`);
  for (let i = 0; i < mesh.uvs.length; i += 1) assert.ok(mesh.uvs[i] >= 0 && mesh.uvs[i] <= 1);
  for (let i = 0; i < mesh.corners; i += 97) assert.ok(near(Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]), 1, 1e-4));
  // Its picture is a JPEG, small enough for a phone.
  const picture = new Uint8Array(bytesOf('pagoda.jpg'));
  assert.ok(picture[0] === 0xff && picture[1] === 0xd8 && picture.length < 400000);
  assert.ok(bytesOf('pagoda.vmm').byteLength < 500000);
});

test('the models that carry a picture are shown near them only; each has its clearing and its shadow', () => {
  const here = propsNear({ lng: BOULEVARD_WORLD[0], lat: BOULEVARD_WORLD[1] });
  assert.equal(here.length, PROPS.length);
  const pagoda = here.find((one) => one.prop.id === 'blvd-world-pagoda');
  assert.ok(near(pagoda.east, 57.5, 0.01) && near(pagoda.north, -238, 0.01));
  assert.equal(propsNear({ lng: 46.72, lat: 24.64 }).length, 0);
  // The map's own block at its foot makes way for it; one across the fairground does not.
  const prop = pagoda.prop;
  const squeeze = METERS * Math.cos((prop.at[1] * Math.PI) / 180);
  const box = (east, north, half) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([x, y]) => [prop.at[0] + (east + x * half) / squeeze, prop.at[1] + (north + y * half) / METERS]);
  assert.deepEqual([...replacedByLandmarks([{ id: 1, ring: box(3, -2, 8) }, { id: 2, ring: box(200, 300, 8) }])], [1]);
  // Its shadow: a footprint 13 m across, 25 m tall, where it stands.
  assert.equal(landmarkShades().length, 9 + 9 + KAFD_PARTS.filter((one) => one.shade).length + FAMOUS.reduce((sum, one) => sum + (one.shade ? 1 : 0) + (one.shades?.length ?? 0), 0) + PROPS.length);
  const shade = landmarkShades().find((one) => one.height === 25 && one.polygons[0][0].every(([lng, lat]) => Math.hypot((lng - prop.at[0]) * squeeze, (lat - prop.at[1]) * METERS) < 6.6));
  assert.ok(shade);
});

test('a mesh built by hand may say which of its corners are lamps and windows, and keeps its edges', () => {
  // A wall two wide and one high facing south, in two halves: the left half plain, the right half a window;
  // and over it a small lamp. (Each face has corners of its own.)
  const wall = (x0, x1, z0, z1) => [[x0, 0, z0, 0, 1], [x1, 0, z0, 1, 1], [x1, 0, z1, 1, 0], [x0, 0, z1, 0, 0]];
  const corners = [...wall(-1, 0, 0, 1), ...wall(0, 1, 0, 1), ...wall(-0.1, 0.1, 1, 1.2), [0, 1, 0, 0, 0]];
  const triangles = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11];
  const mesh = readProp(packed(corners, triangles, [0, 0, 0, 0, 7, 7, 7, 7, 255, 255, 255, 255, 0]));
  assert.deepEqual(Array.from(mesh.lamps), [0, 0, 0, 0, 7, 7, 7, 7, 255, 255, 255, 255, 0]);
  // Such a mesh is of flat faces: every corner of the wall looks squarely south, whatever meets it there.
  for (let i = 0; i < 12; i += 1) assert.ok(near(mesh.normals[i * 3 + 1], -1, 1e-6));
  // (A mesh packed without such a list has none.)
  assert.equal(readProp(packed(corners, triangles)).lamps, null);
});

test('the houses that are dressed are the nearest to the middle of the view', () => {
  assert.ok(HOUSE_MODEL_REACH_METERS === 280 && HOUSE_MODEL_MIN_ZOOM === 17 && HOUSE_MODELS_MOST === 320);
  // Houses along a street running east, one every 20 m, each 12 m wide and 14 deep with two parts.
  const origin = { lng: 46.7, lat: 24.75 };
  const squeeze = METERS * Math.cos((origin.lat * Math.PI) / 180);
  const houses = Array.from({ length: 40 }, (_, n) => ({
    id: 1000 + n,
    at: [origin.lng + (n * 20 - 6) / squeeze, origin.lat + 10 / METERS],
    along: [1, 0],
    back: [0, 1],
    wide: 12,
    deep: 14,
    paint: '#d8c8a8',
    parts: n === 3 ? null : [{ height: 8.2 }, { height: 4.4 }],
  }));
  const picked = housesNear(houses, [origin.lng, origin.lat]);
  // Within 280 m: the first fifteen (the middle of the fifteenth is 280.5 m off), but for the one that has no box of its own.
  assert.deepEqual(picked.map((house) => house.id), [1000, 1001, 1002, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013]);
  assert.deepEqual(housesNear(houses, [origin.lng, origin.lat], { most: 3 }).map((house) => house.id), [1000, 1001, 1002]);
  assert.equal(housesNear(houses, [origin.lng, origin.lat + 0.01]).length, 0);
});
