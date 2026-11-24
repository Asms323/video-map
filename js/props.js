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
// tools/models/pack.mjs; and name.jpg, its picture. Here is the list of them
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
  { id: 'blvd-world-pagoda', name: 'The pagoda, Boulevard World', file: 'pagoda', at: worldPlace(WORLD_SPOTS.pagoda), height: 31, turn: 90, night: 1, within: 4000, clear: 24, shade: { radius: 6.5, height: 25 } },
  // The red hall beside it: two storeys, 22 m long, its shop front to the west.
  { id: 'blvd-world-china-hall', name: 'The red hall, Boulevard World', file: 'hall', at: worldPlace(WORLD_SPOTS.halls.red), height: 17, turn: 90, night: 1, within: 4000, clear: 14, shade: { radius: 8, height: 11 } },
  // The same hall stands for the quarter's two other halls, which no photograph shows whole: the great hall,
  // 26 m long with its front to the south, and the small one north of the red hall.
  { id: 'blvd-world-china-great-hall', name: 'The great hall, Boulevard World', file: 'hall', at: worldPlace(WORLD_SPOTS.halls.great), height: 20, turn: 0, night: 1, within: 4000, clear: 0, shade: { radius: 9, height: 13 } },
  { id: 'blvd-world-china-small-hall', name: 'The small hall, Boulevard World', file: 'hall', at: worldPlace(WORLD_SPOTS.halls.small), height: 10, turn: 90, night: 1, within: 4000, clear: 0, shade: { radius: 5, height: 6.5 } },
  // Egypt: the two gate towers before the temple, each with its king seated at its foot and a bowl of fire on
  // a stand: one model, standing twice. They face the lagoon, a little west of south.
  ...WORLD_SPOTS.pylons.map((at, n) => ({ id: `blvd-world-pylon-${n + 1}`, name: 'A gate tower of Egypt, Boulevard World', file: 'pylon', at: worldPlace(at), height: 12.5, turn: 16, night: 1, within: 4000, clear: 9, shade: { radius: 4.5, height: 11 } })),
  // Greece: the church with its blue dome, 17 m long. It stands twice in the village: at its west front,
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
 * corner), reach: how far it reaches from its middle line, top: its height,
 * foot: its footprint, lamps: null, or for each corner how it shows by night
 * (0: as the rest of it; 255: a lamp, lit every night; any other number: a
 * window, lit on some nights' houses and dark on others, those with the same
 * number together) }, or null if the bytes are not such a file.
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
  // (Its footprint: how far it reaches east and west, south and north of its middle line.)
  const foot = [box[0] * height, box[3] * height, box[1] * height, box[4] * height];
  // A mesh built by hand may say of each corner how it shows by night: a number for each, after the triangles.
  const lampsAt = indicesAt + padded(count * 2);
  const lamps = data.byteLength >= lampsAt + corners ? new Uint8Array(corners) : null;
  if (lamps) for (let i = 0; i < corners; i += 1) lamps[i] = data.getUint8(lampsAt + i);
  // (Such a mesh is made of flat faces that meet at edges, each with corners of its own: every face keeps its own
  // way of looking. A mesh from the generator is one skin: there the corners that meet are lit as one.)
  return { corners, positions, uvs, indices, normals: propNormals(positions, indices, lamps === null), reach, top: box[5] * height, foot, lamps };
}

/**
 * Which way the surface looks at each corner of a mesh: the mean of the
 * faces that meet there, the larger faces counting for more. (Corners that
 * lie at the same place but on different parts of the picture are counted
 * as one, so that the light does not break along the picture's seams;
 * joined false leaves each corner to the faces that name it, for a mesh of
 * flat faces with edges between them.)
 */
export function propNormals(positions, indices, joined = true) {
  const corners = positions.length / 3;
  const normals = new Float32Array(corners * 3);
  // Corners at one place share one sum (unless each face is to keep its own: joined false).
  const sums = new Map();
  const sumOf = new Array(corners);
  for (let i = 0; i < corners; i += 1) {
    const key = joined ? `${Math.round(positions[i * 3] * 500)},${Math.round(positions[i * 3 + 1] * 500)},${Math.round(positions[i * 3 + 2] * 500)}` : i;
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

// ── Ordinary houses ───────────────────────────────────────────────────────
//
// A landmark's model stands once, where the landmark is. A house's model
// stands for every house of its sort: the app has laid out where each house
// of a street stands and how large it is (see houses.js), and near the eye
// each is drawn as one of a few models of real houses of the city, fitted to
// its own measure and turned to its own street. Further off a house stays the
// plain block it was: there it is too small for the difference to show.

/**
 * The models that houses are drawn as: { file, picture (if not its own),
 * night: 0 to 1, day (see PROPS), tone: [red, green, blue] from 0 to 1, the
 * colour of its own walls (a house painted otherwise is tinted from it),
 * plot: true for a model that has the house's wall and gate to the street
 * as well (it is fitted to the house's whole plot from the street back, and
 * the app builds no wall or gate of its own there); roof: how far up the
 * model the edge of its main roof is, where more stands on that roof (a
 * stair house, a water tank): the house's own height is given to that
 * edge, and what stands on the roof rises over it }.
 *
 * The first: a new villa of two storeys behind its street wall, built by
 * measure from photographs the app's owner sent, with the photographs
 * themselves laid on it (see tools/models/built/villa.py).
 */
export const HOUSE_MODELS = [{ file: 'villa', night: 0, tone: [0.674, 0.571, 0.488], plot: true, roof: 0.757 }];

/** A house is drawn as a model when it stands no further than this from the middle of the view… */
export const HOUSE_MODEL_REACH_METERS = 280;
/** …and the map is drawn at least this large; and never more of them at once than this. */
export const HOUSE_MODEL_MIN_ZOOM = 17;
export const HOUSE_MODELS_MOST = 320;
const BATCH_MOST_CORNERS = 65535;
/** Of a house's windows that can be lit, so many are on any night. */
const WINDOWS_LIT = 0.55;

/** Which of so many models a house is drawn as: always the same for the same house. */
export function houseModelOf(id, count) {
  if (!(count > 0)) return -1;
  const value = Math.sin(Number(id) * 12.9898 + 4.1414) * 43758.5453;
  return Math.min(Math.floor((value - Math.floor(value)) * count), count - 1);
}

/**
 * Which houses are drawn as models: of those laid out with a box of their
 * own (see parcelHouses in houses.js), the nearest to a place, no further
 * than the reach and no more than the most.
 *
 * houses: as parcelHouses gives them. centre: [lng, lat]. Returns them
 * nearest first.
 */
export function housesNear(houses, centre, { reach = HOUSE_MODEL_REACH_METERS, most = HOUSE_MODELS_MOST } = {}) {
  const squeeze = Math.max(Math.cos((centre[1] * Math.PI) / 180), 0.01) * 111320;
  const near = [];
  for (const house of houses) {
    if (!house.parts) continue; // one left as the map has it: no box to fit a model to
    const east = (house.at[0] - centre[0]) * squeeze + house.along[0] * (house.wide / 2) + house.back[0] * (house.deep / 2);
    const north = (house.at[1] - centre[1]) * 111320 + house.along[1] * (house.wide / 2) + house.back[1] * (house.deep / 2);
    const far = Math.hypot(east, north);
    if (far <= reach) near.push([far, house]);
  }
  near.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
  return near.slice(0, most).map(([, house]) => house);
}

/**
 * Stand one mesh many times, each time fitted to a box on the ground, as
 * meshes the scene can draw whole (see setProps in scene.js): every corner
 * already in its place.
 *
 * mesh: as readProp gives it, one high. places: [{ at: [east, north] of the
 * box's middle, in the scene's metres; along: the way the box's width runs,
 * [east, north], one long; back: the way from its front to its back; wide,
 * deep, height in metres; tint: [red, green, blue], what its picture's
 * colours are multiplied by (1 leaves them; no more than 2); mirror: true
 * to stand it as its mirror image, left for right }]. The mesh's front, the
 * side its photograph showed, comes to stand at the box's front.
 *
 * Returns [{ corners, positions, normals, uvs, tints, indices }], each of no
 * more corners than a mesh may have. A corner's tint is four numbers: the
 * three it is coloured by, halved; and how it shows by night: up to 127,
 * how much of the street lamps' light falls on it (most on what faces the
 * street); from 128, a lamp or a lit window, and how brightly it glows.
 */
export function standMany(mesh, places) {
  const batches = [];
  const each = Math.max(Math.floor(BATCH_MOST_CORNERS / mesh.corners), 1);
  const [x0, x1, y0, y1] = mesh.foot;
  const [middleX, middleY] = [(x0 + x1) / 2, (y0 + y1) / 2];
  for (let start = 0; start < places.length; start += each) {
    const some = places.slice(start, start + each);
    const corners = some.length * mesh.corners;
    const batch = { corners, positions: new Float32Array(corners * 3), normals: new Float32Array(corners * 3), uvs: new Float32Array(corners * 2), tints: new Uint8Array(corners * 4), indices: new Uint16Array(some.length * mesh.indices.length) };
    some.forEach((place, n) => {
      const first = n * mesh.corners;
      const sx = place.wide / Math.max(x1 - x0, 1e-6);
      const sy = place.deep / Math.max(y1 - y0, 1e-6);
      const sz = place.height / Math.max(mesh.top, 1e-6);
      const [ax, ay] = place.along;
      const [bx, by] = place.back;
      const tint = place.tint ?? [1, 1, 1];
      const bytes = tint.map((part) => Math.round(Math.min(Math.max(part / 2, 0), 1) * 255));
      // (Which of this house's windows are lit tonight: its own choice, the same every night.)
      const chance = (group) => {
        const value = Math.sin(place.at[0] * 12.9898 + place.at[1] * 78.233 + group * 37.719) * 43758.5453;
        return value - Math.floor(value);
      };
      // (Every other house is its neighbour's mirror image, left for right, as houses built in pairs are.)
      const flip = place.mirror ? -1 : 1;
      for (let i = 0; i < mesh.corners; i += 1) {
        const u = (mesh.positions[i * 3] - middleX) * sx * flip;
        const v = (mesh.positions[i * 3 + 1] - middleY) * sy;
        const at = (first + i) * 3;
        batch.positions[at] = place.at[0] + ax * u + bx * v;
        batch.positions[at + 1] = place.at[1] + ay * u + by * v;
        batch.positions[at + 2] = mesh.positions[i * 3 + 2] * sz;
        // (A surface stretched one way looks less that way: which way it looks is squeezed as its place is stretched.)
        const nu = (mesh.normals[i * 3] / sx) * flip;
        const nv = mesh.normals[i * 3 + 1] / sy;
        const nx = ax * nu + bx * nv;
        const ny = ay * nu + by * nv;
        const nz = mesh.normals[i * 3 + 2] / sz;
        const size = Math.hypot(nx, ny, nz) || 1;
        batch.normals[at] = nx / size;
        batch.normals[at + 1] = ny / size;
        batch.normals[at + 2] = nz / size;
        batch.uvs[(first + i) * 2] = mesh.uvs[i * 2];
        batch.uvs[(first + i) * 2 + 1] = mesh.uvs[i * 2 + 1];
        // By night (see the scene): a lamp or a lit window glows; everything else catches the light of the street
        // lamps, by how squarely it is turned to the street, and what looks up catches the less of it.
        const lamp = mesh.lamps ? mesh.lamps[i] : 0;
        let night;
        if (lamp === 255 || (lamp > 0 && chance(lamp) < WINDOWS_LIT)) night = lamp === 255 ? 255 : 230;
        else {
          const toStreet = -(bx * (nx / size) + by * (ny / size));
          const share = (toStreet >= 0 ? 0.3 + 0.7 * toStreet : 0.3 + 0.18 * toStreet) * (1 - 0.5 * Math.max(nz / size, 0));
          night = Math.round(Math.min(Math.max(share, 0), 1) * 127);
        }
        batch.tints.set([bytes[0], bytes[1], bytes[2], night], (first + i) * 4);
      }
      // (A mirror image's triangles are named the other way round, so that they stay wound anticlockwise from outside.)
      const from = n * mesh.indices.length;
      for (let i = 0; i < mesh.indices.length; i += 1) batch.indices[from + i] = first + mesh.indices[place.mirror && i % 3 !== 0 ? i + (i % 3 === 1 ? 1 : -1) : i];
    });
    batches.push(batch);
  }
  return batches;
}

/**
 * Where a house's model stands and how large: the box the house was laid
 * out in (see parcelHouses), from the scene's origin. Its height is that of
 * its tallest part, and a parapet's height more.
 *
 * house: as parcelHouses gives it. origin: { lng, lat }. tone: the colour
 * of the model's own walls, [red, green, blue] from 0 to 1, or null to leave
 * its colours as they are. plot: true for a model that has the house's wall
 * to the street as well: its box is then the house's plot, from the line of
 * the wall at the street back to the back of the house, and from the middle
 * of the gap to one neighbour to the middle of the gap to the other. roof:
 * how far up the model the edge of its main roof is (1: its very top): the
 * house's main part, with its parapet, is as tall as that.
 */
export function housePlace(house, origin, tone = null, plot = false, roof = 1) {
  const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * 111320;
  // (In the house's own measure: along its front from its left corner, and back from its front.)
  const [a0, a1] = plot ? [-house.plot.left, house.wide + house.plot.right] : [0, house.wide];
  const [b0, b1] = plot ? [-house.plot.front, house.deep] : [0, house.deep];
  const east = (house.at[0] - origin.lng) * squeeze + house.along[0] * ((a0 + a1) / 2) + house.back[0] * ((b0 + b1) / 2);
  const north = (house.at[1] - origin.lat) * 111320 + house.along[1] * ((a0 + a1) / 2) + house.back[1] * ((b0 + b1) / 2);
  // (A model with a room of its own on its roof: the house's main part is measured, not what the app would have put on it.)
  const mains = roof < 1 ? house.parts.filter((part) => part.part === 'main') : [];
  const tallest = Math.max(...(mains.length > 0 ? mains : house.parts).map((part) => part.height));
  let tint = null;
  if (tone && typeof house.paint === 'string') {
    // The house's own paint over the model's: but never so far from the model's that its picture is washed out.
    const paint = [1, 3, 5].map((at) => Number.parseInt(house.paint.slice(at, at + 2), 16) / 255);
    tint = paint.map((part, k) => Math.min(Math.max(part / Math.max(tone[k], 0.05), 0.7), 1.45));
  }
  // (Houses stand in pairs, each the mirror image of the other: every other one along its street.)
  return { at: [east, north], along: house.along, back: house.back, wide: a1 - a0, deep: b1 - b0, height: (tallest + 1.4) / Math.min(Math.max(roof, 0.2), 1), tint, mirror: Math.abs(Math.round(Number(house.id))) % 2 === 1 };
}
