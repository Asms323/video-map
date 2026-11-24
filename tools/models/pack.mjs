// Pack a 3D model for the app: node tools/models/pack.mjs <in.glb> <models/name>
//
// in.glb: a plain GLB of one mesh with texture coordinates and one picture for its colours (what the
// generator gives, cleaned: standing on the ground, its upright middle line at 0; y up, its front towards +z).
// Writes <name>.vmm, the mesh as the app reads it (see js/props.js), and <name>.png, its picture, which is
// then saved again as a JPEG (see the README).
//
// The mesh is turned into the app's own measure: east, north and up, in parts of its own height, its front
// towards the south.
import { readFileSync, writeFileSync } from 'node:fs';

const [source, name] = process.argv.slice(2);
const data = readFileSync(source);
const jsonLength = data.readUInt32LE(12);
const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
const binStart = 20 + jsonLength + 8;
const view = (index) => {
  const one = json.bufferViews[index];
  return data.subarray(binStart + (one.byteOffset ?? 0), binStart + (one.byteOffset ?? 0) + one.byteLength);
};
const read = (index, Type, size) => {
  const one = json.accessors[index];
  const copy = Buffer.from(view(one.bufferView).subarray(one.byteOffset ?? 0, (one.byteOffset ?? 0) + one.count * size * Type.BYTES_PER_ELEMENT));
  return new Type(copy.buffer, copy.byteOffset, one.count * size);
};
const primitive = json.meshes[0].primitives[0];
const from = read(primitive.attributes.POSITION, Float32Array, 3);
const uvs = read(primitive.attributes.TEXCOORD_0, Float32Array, 2);
const kind = json.accessors[primitive.indices].componentType;
const indices = Uint32Array.from(read(primitive.indices, kind === 5125 ? Uint32Array : kind === 5123 ? Uint16Array : Uint8Array, 1));
const corners = from.length / 3;
if (corners > 65535) throw new Error(`${corners} corners: more than the app's meshes hold (65535); simplify it first`);

// East, north, up; in parts of its height.
let tall = 0;
for (let i = 1; i < from.length; i += 3) tall = Math.max(tall, from[i]);
const positions = new Float32Array(from.length);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < corners; i += 1) {
  const place = [from[i * 3] / tall, -from[i * 3 + 2] / tall, from[i * 3 + 1] / tall];
  for (let k = 0; k < 3; k += 1) {
    positions[i * 3 + k] = place[k];
    min[k] = Math.min(min[k], place[k]);
    max[k] = Math.max(max[k], place[k]);
  }
}
// (Turning it over, north for south, turns every triangle inside out: each is given the other way round.)
for (let t = 0; t < indices.length; t += 3) {
  const keep = indices[t + 1];
  indices[t + 1] = indices[t + 2];
  indices[t + 2] = keep;
}

// The file: 'VMM1'; corners; corner numbers; the box it lies in (6 numbers); then every corner's place as
// three whole numbers from 0 to 65535 across that box; its place on the picture as two; and the triangles.
const head = Buffer.alloc(4 + 4 + 4 + 24);
head.write('VMM1', 0, 'latin1');
head.writeUInt32LE(corners, 4);
head.writeUInt32LE(indices.length, 8);
[...min, ...max].forEach((value, k) => head.writeFloatLE(value, 12 + k * 4));
const places = new Uint16Array(corners * 3);
const onPicture = new Uint16Array(corners * 2);
for (let i = 0; i < corners; i += 1) {
  for (let k = 0; k < 3; k += 1) places[i * 3 + k] = Math.round(((positions[i * 3 + k] - min[k]) / Math.max(max[k] - min[k], 1e-9)) * 65535);
  for (let k = 0; k < 2; k += 1) onPicture[i * 2 + k] = Math.round(Math.min(Math.max(uvs[i * 2 + k], 0), 1) * 65535);
}
const pad = (buffer) => (buffer.length % 4 === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - (buffer.length % 4))]));
const bytes = (array) => pad(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
const file = Buffer.concat([head, bytes(places), bytes(onPicture), bytes(Uint16Array.from(indices))]);
writeFileSync(`${name}.vmm`, file);
const image = json.images[0];
writeFileSync(`${name}.png`, view(image.bufferView));
console.log(`${name}.vmm: ${corners} corners, ${indices.length / 3} triangles, ${file.length} bytes; box`, min.map((v) => v.toFixed(3)).join(' '), 'to', max.map((v) => v.toFixed(3)).join(' '), `; ${name}.png: ${image.mimeType}`);
