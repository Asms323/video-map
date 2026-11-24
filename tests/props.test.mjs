import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BOULEVARD_WORLD } from '../js/boulevard.js';
import { landmarkShades, replacedByLandmarks } from '../js/landmarks.js';
import { PROPS, propNormals, propsNear, readProp } from '../js/props.js';

const METERS = 111320;
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
const bytesOf = (file) => {
  const data = readFileSync(new URL(`../models/${file}`, import.meta.url));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
};

/** A packed mesh, as tools/pack-model.mjs writes one: corners [[east, north, up, across, down], …] and triangles. */
function packed(corners, triangles) {
  const min = [0, 1, 2].map((k) => Math.min(...corners.map((corner) => corner[k])));
  const max = [0, 1, 2].map((k) => Math.max(...corners.map((corner) => corner[k])));
  const padded = (length) => length + ((4 - (length % 4)) % 4);
  const data = new DataView(new ArrayBuffer(36 + padded(corners.length * 6) + padded(corners.length * 4) + triangles.length * 2));
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
  // On the ground, 31 m tall, its eaves reaching some dozen metres from its middle line.
  let low = Infinity;
  let high = -Infinity;
  for (let i = 2; i < mesh.positions.length; i += 3) {
    low = Math.min(low, mesh.positions[i]);
    high = Math.max(high, mesh.positions[i]);
  }
  assert.ok(near(low, 0, 0.01) && near(high, 31, 0.01) && near(mesh.top, 31, 0.01));
  assert.ok(mesh.reach > 8 && mesh.reach < 16, `reaches ${mesh.reach.toFixed(1)} m`);
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
  const shade = landmarkShades().find((one) => one.height === 25);
  assert.ok(shade && shade.polygons[0][0].every(([lng, lat]) => Math.hypot((lng - prop.at[0]) * squeeze, (lat - prop.at[1]) * METERS) < 6.6));
});
