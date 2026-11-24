// Models that carry a picture: the things of the city that were not built by
// hand but made, each from one photograph, by a generator of 3D models.
//
// A model built by hand (see models.js) is plain faces in plain colours: it
// has the right shape in the right place, and looks like a model. A thing
// like a pagoda has more to it than can be written down face by face: every
// roof tile, every pane of lattice. For such things the app takes a mesh of
// some tens of thousands of triangles with one picture laid over it, which a
// generator (TRELLIS, by Microsoft Research: MIT licence) made from a
// photograph of the real thing. What it could see in the photograph is the
// thing as it is; the sides it could not see are its guess.
//
// Each is a pair of files in models/: name.vmm, the mesh, packed by
// tools/pack-model.mjs; and name.jpg, its picture. Here is the list of them
// (where each stands, how tall, which way it is turned), and the reading of
// the mesh. Nothing here touches the browser: the fetching is done by the
// map, the drawing by the scene.
//
// A mesh is measured east, north and up from the middle of its foot, and is
// one high: it is given its height in metres where it is drawn, so that one
// mesh may stand in several places, at several sizes.

import { GREEK_HOUSES, WORLD_SPOTS, worldPlace } from './boulevard.js';

/**
 * The models, each where it stands: id; file: the name of its mesh in
 * models/ (one may stand in several places); picture: the name of its
 * picture there, where that is not the mesh's own (a piece cut off a model
 * keeps the whole model's picture); at: [lng, lat] of the middle of its foot;
 * height in metres; turn: how far it is turned, in degrees clockwise (its
 * front, the side the photograph showed, looks south at 0); night: how far
 * its picture shows it as its lamps light it by night (1: a photograph
 * taken after dark; 0: one taken by day); day: for a picture taken by night,
 * how it is drawn by day: { gain: how much brighter, plain: how much of the
 * lamps' colour is taken out of it, 0 to 1 }; within: shown only for a view
 * whose middle is no further off than this, in metres; clear: within this
 * many metres of its middle the map's own buildings are taken out for it;
 * shade: a footprint and a height for the shadow it throws (see
 * landmarks.js, which reads both).
 */
// (A whitewashed wall photographed under violet lamps: by day it is drawn brighter, and with half their colour
// taken out; more, and the blue of the domes would go with it.)
const WHITEWASHED = { gain: 1.5, plain: 0.55 };

export const PROPS = [
  // Boulevard World, from the photographs of it by night that the app's owner sent. All within the fairground.
  // The Chinese quarter. The pagoda:
  { id: 'blvd-world-pagoda', name: 'The pagoda, Boulevard World', file: 'pagoda', at: worldPlace(WORLD_SPOTS.pagoda), height: 31, turn: 90, night: 1, within: 4000, clear: 16, shade: { radius: 6.5, height: 25 } },
  // The red hall beside it: two storeys, 22 m long, its shop front to the west.
  { id: 'blvd-world-china-hall', name: 'The red hall, Boulevard World', file: 'hall', at: worldPlace(WORLD_SPOTS.halls.red), height: 17, turn: 90, night: 1, within: 4000, clear: 14, shade: { radius: 8, height: 11 } },
  // The same hall stands for the quarter's two other halls, which no photograph shows whole: the great hall,
  // 26 m long with its front to the south, and the small one north of the red hall.
  { id: 'blvd-world-china-great-hall', name: 'The great hall, Boulevard World', file: 'hall', at: worldPlace(WORLD_SPOTS.halls.great), height: 20, turn: 0, night: 1, within: 4000, clear: 0, shade: { radius: 9, height: 13 } },
  { id: 'blvd-world-china-small-hall', name: 'The small hall, Boulevard World', file: 'hall', at: worldPlace(WORLD_SPOTS.halls.small), height: 10, turn: 90, night: 1, within: 4000, clear: 0, shade: { radius: 5, height: 6.5 } },
  // Egypt: the two gate towers before the temple, each with its king seated at its foot and a bowl of fire on
  // a stand: one model, standing twice. They face the lagoon, a little west of south.
  ...WORLD_SPOTS.pylons.map((at, n) => ({ id: `blvd-world-pylon-${n + 1}`, name: 'A gate tower of Egypt, Boulevard World', file: 'pylon', at: worldPlace(at), height: 12.5, turn: 16, night: 1, within: 4000, clear: 9, shade: { radius: 4.5, height: 11 } })),
  // Greece: the church with its blue dome, 22 m long. It stands twice in the village: at its west front,
  // facing the lagoon, and smaller at its south end, facing south.
  { id: 'blvd-world-church-1', name: 'The church, Greek village, Boulevard World', file: 'church', at: worldPlace(WORLD_SPOTS.churches[0]), height: 14, turn: 90, night: 1, day: WHITEWASHED, within: 4000, clear: 0, shade: { radius: 5, height: 9 } },
  { id: 'blvd-world-church-2', name: 'The chapel, Greek village, Boulevard World', file: 'church', at: worldPlace(WORLD_SPOTS.churches[1]), height: 11, turn: 0, night: 1, day: WHITEWASHED, within: 4000, clear: 0, shade: { radius: 4, height: 7 } },
  // And the village's houses: the low house at the church's side, cut off the same model, standing once
  // for every house (see GREEK_HOUSES in boulevard.js for where, and why that is made up).
  ...GREEK_HOUSES.map((house, n) => ({ id: `blvd-world-greek-house-${n + 1}`, name: 'A house of the Greek village, Boulevard World', file: 'house', picture: 'church', at: worldPlace(house.at), height: house.height, turn: house.turn, night: 1, day: WHITEWASHED, within: 4000, clear: 0, shade: { radius: 3.6, height: Math.round(house.height * 8) / 10 } })),
];

const HEAD_BYTES = 36;

/**
 * Read a packed mesh (the bytes of a .vmm file): one high, unless given a
 * height. Returns { corners, positions: Float32Array (east, north, up),
 * uvs: Float32Array (across and down its picture, 0 to 1), indices:
 * Uint16Array, normals: Float32Array (which way the surface looks at each
 * corner), reach: how far it reaches from its middle line, top: its height },
 * or null if the bytes are not such a file.
 */
export function readProp(bytes, height = 1) {
  const data = bytes instanceof ArrayBuffer ? new DataView(bytes) : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.byteLength < HEAD_BYTES || data.getUint32(0, true) !== 0x314d4d56) return null; // 'VMM1'
  const corners = data.getUint32(4, true);
  const count = data.getUint32(8, true);
  const box = Array.from({ length: 6 }, (_, k) => data.getFloat32(12 + k * 4, true));
  const padded = (length) => length + ((4 - (length % 4)) % 4);
  const placesAt = HEAD_BYTES;
  const picturesAt = placesAt + padded(corners * 6);
  const indicesAt = picturesAt + padded(corners * 4);
  if (corners < 3 || corners > 65535 || count % 3 !== 0 || data.byteLength < indicesAt + count * 2) return null;
  const positions = new Float32Array(corners * 3);
  const uvs = new Float32Array(corners * 2);
  let reach = 0;
  for (let i = 0; i < corners; i += 1) {
    for (let k = 0; k < 3; k += 1) positions[i * 3 + k] = (box[k] + (data.getUint16(placesAt + (i * 3 + k) * 2, true) / 65535) * (box[3 + k] - box[k])) * height;
    for (let k = 0; k < 2; k += 1) uvs[i * 2 + k] = data.getUint16(picturesAt + (i * 2 + k) * 2, true) / 65535;
    reach = Math.max(reach, Math.hypot(positions[i * 3], positions[i * 3 + 1]));
  }
  const indices = new Uint16Array(count);
  for (let i = 0; i < count; i += 1) {
    indices[i] = data.getUint16(indicesAt + i * 2, true);
    if (indices[i] >= corners) return null;
  }
  return { corners, positions, uvs, indices, normals: propNormals(positions, indices), reach, top: box[5] * height };
}

/**
 * Which way the surface looks at each corner of a mesh: the mean of the
 * faces that meet there, the larger faces counting for more. (Corners that
 * lie at the same place but on different parts of the picture are counted
 * as one, so that the light does not break along the picture's seams.)
 */
export function propNormals(positions, indices) {
  const corners = positions.length / 3;
  const normals = new Float32Array(corners * 3);
  // Corners at one place share one sum.
  const sums = new Map();
  const sumOf = new Array(corners);
  for (let i = 0; i < corners; i += 1) {
    const key = `${Math.round(positions[i * 3] * 500)},${Math.round(positions[i * 3 + 1] * 500)},${Math.round(positions[i * 3 + 2] * 500)}`;
    let sum = sums.get(key);
    if (!sum) {
      sum = [0, 0, 0];
      sums.set(key, sum);
    }
    sumOf[i] = sum;
  }
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    // (Twice the face's area long: so the larger face counts for more.)
    const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const corner of [indices[t], indices[t + 1], indices[t + 2]]) {
      const sum = sumOf[corner];
      sum[0] += face[0];
      sum[1] += face[1];
      sum[2] += face[2];
    }
  }
  for (let i = 0; i < corners; i += 1) {
    const sum = sumOf[i];
    const size = Math.hypot(sum[0], sum[1], sum[2]);
    normals[i * 3] = size > 0 ? sum[0] / size : 0;
    normals[i * 3 + 1] = size > 0 ? sum[1] / size : 0;
    normals[i * 3 + 2] = size > 0 ? sum[2] / size : 1;
  }
  return normals;
}

/**
 * Which of the models stand near a place: those whose foot is within their
 * own distance (within) of origin ({ lng, lat }), each with where its foot
 * stands in metres east and north of it. Returns [{ prop, east, north }].
 */
export function propsNear(origin, props = PROPS) {
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * 111320;
  const near = [];
  for (const prop of props) {
    const east = (prop.at[0] - origin.lng) * squeeze;
    const north = (prop.at[1] - origin.lat) * 111320;
    if (prop.within && Math.hypot(east, north) > prop.within) continue;
    near.push({ prop, east, north });
  }
  return near;
}
