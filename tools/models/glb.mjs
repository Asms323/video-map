// Reading and writing the plain GLB files the generator gives: one mesh of triangles with texture
// coordinates, and one picture for its colours.
import { readFileSync, writeFileSync } from 'node:fs';

/** Read a GLB: { positions: Float32Array, uvs: Float32Array, indices: Uint32Array, image: Buffer, mime } */
export function readGlb(path) {
  const data = readFileSync(path);
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const view = (index) => {
    const one = json.bufferViews[index];
    return data.subarray(binStart + (one.byteOffset ?? 0), binStart + (one.byteOffset ?? 0) + one.byteLength);
  };
  const accessor = (index, Type, size) => {
    const one = json.accessors[index];
    const bytes = view(one.bufferView);
    const from = one.byteOffset ?? 0;
    const copy = Buffer.from(bytes.subarray(from, from + one.count * size * Type.BYTES_PER_ELEMENT));
    return new Type(copy.buffer, copy.byteOffset, one.count * size);
  };
  const primitive = json.meshes[0].primitives[0];
  const positions = accessor(primitive.attributes.POSITION, Float32Array, 3);
  const uvs = accessor(primitive.attributes.TEXCOORD_0, Float32Array, 2);
  const kind = json.accessors[primitive.indices].componentType;
  const raw = accessor(primitive.indices, kind === 5125 ? Uint32Array : kind === 5123 ? Uint16Array : Uint8Array, 1);
  const image = json.images?.[0];
  return { positions, uvs, indices: Uint32Array.from(raw), image: image ? Buffer.from(view(image.bufferView)) : null, mime: image?.mimeType ?? null };
}

/** Write one back, the same way. */
export function writeGlb(path, { positions, uvs, indices, image, mime }) {
  const pad = (buffer) => (buffer.length % 4 === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - (buffer.length % 4))]));
  const parts = [Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength), Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength), Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength), image].map(pad);
  let offset = 0;
  const views = parts.map((part) => {
    const one = { buffer: 0, byteOffset: offset, byteLength: part.length };
    offset += part.length;
    return one;
  });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  const json = {
    asset: { version: '2.0', generator: 'glb.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 1, TEXCOORD_0: 2 }, indices: 0, mode: 4, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 1, metallicFactor: 0 }, doubleSided: true }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: mime }],
    accessors: [
      { bufferView: 0, componentType: 5125, count: indices.length, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const bin = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(text.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([head, jsonHead, text, binHead, bin]));
}

/** The pieces a mesh falls into (corners at the same place count as one): for each triangle, the number of its piece; and each piece's size and box. */
export function pieces({ positions, indices }) {
  const count = positions.length / 3;
  const key = new Map();
  const welded = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    const name = `${Math.round(positions[i * 3] * 20000)},${Math.round(positions[i * 3 + 1] * 20000)},${Math.round(positions[i * 3 + 2] * 20000)}`;
    let at = key.get(name);
    if (at === undefined) {
      at = key.size;
      key.set(name, at);
    }
    welded[i] = at;
  }
  const parent = Uint32Array.from({ length: key.size }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(welded[indices[t]]);
    const b = find(welded[indices[t + 1]]);
    const c = find(welded[indices[t + 2]]);
    parent[b] = a;
    parent[c] = a;
  }
  const names = new Map();
  const of = new Uint32Array(indices.length / 3);
  const list = [];
  for (let t = 0; t < indices.length; t += 3) {
    const root = find(welded[indices[t]]);
    let n = names.get(root);
    if (n === undefined) {
      n = list.length;
      names.set(root, n);
      list.push({ triangles: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], area: 0 });
    }
    of[t / 3] = n;
    const piece = list[n];
    piece.triangles += 1;
    const p = [0, 1, 2].map((k) => [positions[indices[t + k] * 3], positions[indices[t + k] * 3 + 1], positions[indices[t + k] * 3 + 2]]);
    for (const corner of p) {
      for (let k = 0; k < 3; k += 1) {
        piece.min[k] = Math.min(piece.min[k], corner[k]);
        piece.max[k] = Math.max(piece.max[k], corner[k]);
      }
    }
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    piece.area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return { of, list };
}

/** A mesh with only the triangles that keep(triangle number) says to keep; corners no longer used are dropped. */
export function keepTriangles(mesh, keep) {
  const { positions, uvs, indices } = mesh;
  const renumber = new Int32Array(positions.length / 3).fill(-1);
  const outIndices = [];
  const outPositions = [];
  const outUvs = [];
  for (let t = 0; t < indices.length; t += 3) {
    if (!keep(t / 3)) continue;
    for (let k = 0; k < 3; k += 1) {
      const i = indices[t + k];
      if (renumber[i] < 0) {
        renumber[i] = outPositions.length / 3;
        outPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        outUvs.push(uvs[i * 2], uvs[i * 2 + 1]);
      }
      outIndices.push(renumber[i]);
    }
  }
  return { ...mesh, positions: Float32Array.from(outPositions), uvs: Float32Array.from(outUvs), indices: Uint32Array.from(outIndices) };
}
