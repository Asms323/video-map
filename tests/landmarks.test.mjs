import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WORLD_PARTS } from '../js/boulevard.js';
import { FAMOUS } from '../js/famous.js';
import { KAFD_PARTS } from '../js/kafd.js';
import { LANDMARKS, STAYED_BRIDGES, landmarkBeacons, landmarkModels, landmarkRoofs, landmarkShades, landmarkSlabs, replacedByLandmarks } from '../js/landmarks.js';
import { ModelMesh, cutMesh } from '../js/models.js';
import { PROPS } from '../js/props.js';
import { RoofMesh, roofDecks, roofingOf } from '../js/roofs.js';
import { facesOf } from './model-faces.mjs';

const METERS = 111320;
/** Metres east and north of a landmark's middle, for a [lng, lat]. */
const from = (landmark, [lng, lat]) => [(lng - landmark.at[0]) * METERS * Math.cos((landmark.at[1] * Math.PI) / 180), (lat - landmark.at[1]) * METERS];
/** Along and across a landmark's long axis. */
const along = (landmark, [east, north]) => {
  const angle = (landmark.bearing * Math.PI) / 180;
  return [east * Math.sin(angle) + north * Math.cos(angle), -east * Math.cos(angle) + north * Math.sin(angle)];
};
const slabsOf = (id) => landmarkSlabs().features.filter((feature) => feature.properties.landmark === id);
const landmark = (id) => LANDMARKS.find((one) => one.id === id);
/** The slabs of a landmark that a level cuts through, with how far each reaches along and across its axis. */
function cut(id, z) {
  const one = landmark(id);
  return slabsOf(id)
    .filter((feature) => feature.properties.b <= z && z < feature.properties.t)
    .map((feature) => {
      const points = feature.geometry.coordinates[0].map((corner) => along(one, from(one, corner)));
      const us = points.map((point) => point[0]);
      const vs = points.map((point) => point[1]);
      return { from: Math.min(...us), to: Math.max(...us), wide: Math.max(...vs) - Math.min(...vs), paint: feature.properties.c, night: feature.properties.n };
    })
    .sort((a, b) => a.from - b.from);
}
const near = (a, b, by) => Math.abs(a - b) <= by;
/** The landmarks that are true models, built with one of them at the middle of the mesh: its triangles (see facesOf). */
function modelOf(id) {
  const one = landmark(id);
  const mesh = new ModelMesh();
  landmarkModels(mesh, { lng: one.at[0], lat: one.at[1] });
  // (Only its own: its neighbours along King Fahd Road stand a street's width off, the rest kilometres.)
  // (A part of Boulevard World says for itself how far it reaches.)
  return facesOf(mesh).filter((face) => face.corners.every(([east, north]) => Math.hypot(east, north) < (one.reach ?? one.clear) + 10));
}

test('every landmark is a stack of slabs, or a true model, standing where the building stands', () => {
  const data = landmarkSlabs();
  assert.equal(data.type, 'FeatureCollection');
  assert.equal(landmarkSlabs(), data, 'made once');
  // (After the buildings of the city come the parts of Boulevard World, each a landmark too: see boulevard.test.mjs.)
  // (And after those the financial district, every building of it a landmark as well: see kafd.test.mjs.
  // And last the famous buildings that are not towers: see famous.test.mjs.)
  const world = [...WORLD_PARTS.map((one) => one.id), ...KAFD_PARTS.map((one) => one.id), ...FAMOUS.map((one) => one.id)];
  assert.deepEqual(LANDMARKS.map((one) => one.id), ['kingdom-centre', 'al-faisaliah', 'hamad-tower', 'al-anoud-tower', 'al-anoud-tower-2', 'islamic-affairs', 'olaya-tower', 'olaya-tower-2', 'pif-tower', 'burj-rafal', 'al-majdoul', 'tv-tower', 'water-tower', 'kafd-station', ...world]);
  assert.deepEqual(LANDMARKS.filter((one) => one.model).map((one) => one.id), ['kingdom-centre', 'al-faisaliah', 'hamad-tower', 'al-anoud-tower', 'al-anoud-tower-2', 'islamic-affairs', 'olaya-tower', 'olaya-tower-2', 'pif-tower', ...world.filter((id) => id !== 'kafd')]);
  for (const one of LANDMARKS) {
    assert.ok(one.at[0] > 46.4 && one.at[0] < 46.9 && one.at[1] > 24.5 && one.at[1] < 24.9, 'in Riyadh');
    if (world.includes(one.id)) continue;
    if (one.model) {
      // A model: no slabs, but for a podium it may stand on. It stands on the ground, is as tall as the
      // real one, and keeps to its plot.
      assert.ok(slabsOf(one.id).every((feature) => feature.properties.t <= 20), one.id);
      const faces = modelOf(one.id);
      // (The plainest of them, a block of glass with a crown on it, is some thirty triangles.)
      assert.ok(faces.length > 25, `${one.id}: ${faces.length} triangles`);
      const corners = faces.flatMap((face) => face.corners);
      assert.equal(Math.min(...corners.map((corner) => corner[2])), 0, one.id);
      const top = Math.max(...corners.map((corner) => corner[2]));
      assert.ok(top >= one.height - 0.01 && top <= one.height + 25, `${one.id}: ${top} m for ${one.height} m`);
      assert.ok(Math.max(...corners.map(([east, north]) => Math.hypot(east, north))) < 48, one.id);
      // Every triangle is a real one, knows which way it looks, and is made of something.
      for (const face of faces) {
        assert.ok(near(Math.hypot(...face.normal), 1, 1e-4));
        assert.ok(['plain', 'glass', 'lamp'].includes(face.kind) && /^#[0-9a-f]{6}$/.test(face.colour));
        if (face.kind === 'glass') assert.ok(face.storey > 3 && face.storey < 7 && face.bay > 1 && face.bay < 5, JSON.stringify([face.storey, face.bay]));
      }
      continue;
    }
    const slabs = slabsOf(one.id);
    assert.ok(slabs.length > 15, `${one.id}: ${slabs.length} slabs`);
    let top = 0;
    let lowest = Infinity;
    let furthest = 0;
    for (const { properties, geometry } of slabs) {
      const ring = geometry.coordinates[0];
      assert.equal(geometry.type, 'Polygon');
      assert.ok(ring.length >= 4 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1], 'a closed outline');
      assert.ok(properties.t > properties.b && properties.b >= 0, `${one.id}: from ${properties.b} to ${properties.t}`);
      assert.match(properties.c, /^#[0-9a-f]{6}$/);
      if (properties.n !== undefined) assert.match(properties.n, /^#[0-9a-f]{6}$/);
      top = Math.max(top, properties.t);
      lowest = Math.min(lowest, properties.b);
      for (const corner of ring) furthest = Math.max(furthest, Math.hypot(...from(one, corner)));
    }
    // It stands on the ground, is as tall as the real one (a mast may top it), and keeps to its plot.
    assert.equal(lowest, 0, one.id);
    assert.ok(top >= one.height && top <= one.height + 25, `${one.id}: ${top} m for ${one.height} m`);
    assert.ok(furthest < ({ 'kingdom-centre': 180, 'kafd-station': 110 }[one.id] ?? 45), `${one.id}: reaches ${furthest.toFixed(0)} m from its middle`);
  }
  // A mesh may hold every model at once, each at its own place; built again, it holds them once.
  // (With them come the towers of the financial district, which are built for any view: the rest of it is not, from 7 km off.
  // And those of the famous buildings that stand near enough: the Ministry of Interior, 4 km off, and the library, 2 km.)
  const towers = KAFD_PARTS.filter((one) => one.model && !one.within).length;
  const famous = FAMOUS.map((one) => ({ one, east: (one.at[0] - 46.67) * METERS * Math.cos((24.7 * Math.PI) / 180), north: (one.at[1] - 24.7) * METERS })).filter(({ one, east, north }) => !one.within || Math.hypot(east, north) < one.within);
  assert.ok(famous.length >= 2);
  const mesh = new ModelMesh();
  assert.equal(landmarkModels(mesh, { lng: 46.67, lat: 24.7 }), 9 + towers + famous.length);
  const corners = mesh.count;
  assert.equal(landmarkModels(mesh, { lng: 46.67, lat: 24.7 }), 9 + towers + famous.length);
  assert.equal(mesh.count, corners);
  // (The PIF Tower stands 2.9 km west and 7.1 km north of there; Kingdom Centre 0.4 km east and 1.3 km north; Hamad Tower 1.3 km east and 0.9 km south.)
  for (const corner of facesOf(mesh).flatMap((face) => face.corners)) {
    // (And the two Al Anoud Towers across the road from that one, and Al Faisaliah a little south and east of it.)
    const spots = [[-2880, 7090], [446, 1263], [1297, -883], [1169, -913], [1518, -1091], [1244, -767], [1242, -317]];
    // (…the ministry's tower north of Hamad Tower, and the Olaya Towers beyond Tahlia Street. The district's towers stand round the PIF Tower, within 800 m of it.)
    // (And each famous building where it stands: the ministry 2.6 km east and 3.3 km south, a hundred metres from its middle to its corners.)
    assert.ok(spots.some(([east, north]) => Math.hypot(corner[0] - east, corner[1] - north) < 75) || Math.hypot(corner[0] + 2880, corner[1] - 7090) < 800 || famous.some(({ one, east, north }) => Math.hypot(corner[0] - east, corner[1] - north) < one.reach), JSON.stringify(corner));
  }
  assert.ok(JSON.stringify(data).length < 700000, 'small enough to hand to the map in one piece');
});

test('Kingdom Centre: an almond in plan, of mirror glass, parted at the top by its parabola and joined by the sky bridge', () => {
  const one = landmark('kingdom-centre');
  // Every corner as it lies along the tower (u) and across it (v).
  const faces = modelOf('kingdom-centre').map((face) => ({ ...face, places: face.corners.map(([east, north, up]) => [...along(one, [east, north]), up]) }));
  const glass = faces.filter((face) => face.colour === '#8ea4b7');
  assert.ok(glass.length > 300 && glass.every((face) => face.kind === 'glass' && near(face.mirror, 0.8, 1e-6) && face.floors < 0.3 && face.ridge === 0 && face.own === 9), 'one seamless skin of mirror glass');
  // An almond: 77.5 m from point to point, 40 m across, each face an arc; every corner of the skin lies on one.
  const radius = (38.75 ** 2 + 20 ** 2) / 40;
  for (const face of glass) {
    for (const [u, v] of face.places) assert.ok(near(Math.hypot(u, Math.abs(v) + radius - 20), radius, 0.02), `${u}, ${v}`);
  }
  const us = glass.flatMap((face) => face.places.map((place) => place[0]));
  const vs = glass.flatMap((face) => face.places.map((place) => place[1]));
  assert.ok(near(Math.max(...us), 38.75, 0.01) && near(Math.min(...us), -38.75, 0.01) && near(Math.max(...vs), 20, 0.01) && near(Math.min(...vs), -20, 0.01));
  // The light falls on it as on a curve: at each corner the skin looks straight out from its arc, level.
  for (const face of glass) {
    face.normals.forEach((normal, k) => {
      const [u, v] = face.places[k];
      const [nu, nv] = along(one, [normal[0], normal[1]]);
      // (At the two points of the almond a corner belongs to both faces: the face is told by which way it looks.)
      const out = [u / radius, (Math.sign(Math.abs(v) > 0.01 ? v : nv) * Math.sqrt(radius ** 2 - u ** 2)) / radius];
      assert.ok(near(normal[2], 0, 1e-6) && near(nu, out[0], 0.02) && near(nv, out[1], 0.02), JSON.stringify([u, v, nu, nv, out]));
    });
  }
  // Up to 205 m the whole almond; above that an opening right through it, a parabola with its point
  // down, 56 m wide where the bridge's floor crosses it at 290.4 m: half as wide a quarter of the way up.
  const reachAt = (z) => {
    // How near the middle the skin comes at a height: half the width of the opening there.
    let nearest = Infinity;
    for (const face of glass) {
      const heights = face.places.map((place) => place[2]);
      if (Math.min(...heights) > z || Math.max(...heights) < z) continue;
      for (let k = 0; k < 3; k += 1) {
        const [a, b] = [face.places[k], face.places[(k + 1) % 3]];
        if (a[2] > z === b[2] > z) continue;
        const part = (z - a[2]) / (b[2] - a[2]);
        nearest = Math.min(nearest, Math.abs(a[0] + (b[0] - a[0]) * part));
      }
    }
    return nearest;
  };
  assert.ok(reachAt(100) < 2.2 && reachAt(204) < 2.2, 'no opening below 205 m');
  const quarter = 205 + (290.4 - 205) / 4;
  assert.ok(near(reachAt(quarter), 14, 0.6), `${reachAt(quarter)} m`);
  assert.ok(near(reachAt(289), 28 * Math.sqrt((289 - 205) / 85.4), 0.5) && near(reachAt(296), 28, 0.01));
  assert.ok(near(Math.max(...glass.flatMap((face) => face.places.map((place) => place[2]))), 302.3, 1e-3));
  // The inside of the opening and a band along its edge on both faces are lit by night, in colours that change.
  const inside = faces.filter((face) => face.colour === '#c4ced6');
  const band = faces.filter((face) => face.kind === 'lamp');
  assert.ok(inside.length > 50 && inside.every((face) => face.kind === 'plain' && face.changing && face.glow > 0.7));
  assert.ok(band.length === 14 * 2 * 2 * 2 && band.every((face) => face.changing && face.glow === 1 && face.places.every(([, , up]) => up >= 205 - 1e-3 && up <= 290.4 + 1e-3)));
  // (The band lies just outside the skin, and hugs the parabola: its inner edge is on the opening's.)
  for (const face of band) {
    for (const [u, v, up] of face.places) {
      const open = 28 * Math.sqrt(Math.max((up - 205) / 85.4, 0));
      assert.ok(Math.abs(u) > open && Math.abs(u) < open + 2.9 && Math.hypot(u, Math.abs(v) + radius - 20) > radius + 0.2, JSON.stringify([u, v, up]));
    }
  }
  // The sky bridge: a corridor 11 m wide from leg to leg, its floor at 290.4 m in the middle, with
  // windows down both sides that are lit all night.
  const bridge = faces.filter((face) => face.colour === '#93a8ba');
  assert.ok(bridge.length === 32 && bridge.every((face) => face.kind === 'glass' && face.lit === 1 && face.changing));
  const along0 = bridge.flatMap((face) => face.places.map((place) => place[0]));
  assert.ok(near(Math.min(...along0), -29, 0.01) && near(Math.max(...along0), 29, 0.01));
  assert.ok(bridge.every((face) => face.places.every(([, v, up]) => near(Math.abs(v), 5.5, 0.01) && up >= 290.4 - 1.75 && up <= 302.3 + 1e-3)));
  assert.ok(near(Math.max(...bridge.flatMap((face) => face.places.filter(([u]) => Math.abs(u) < 4).map((place) => place[2])).filter((up) => up < 295)), 290.4, 0.15));
  // A red lamp on the top of each leg.
  const lamps = landmarkBeacons().filter(([lng, lat]) => Math.abs(lng - one.at[0]) < 0.001 && Math.abs(lat - one.at[1]) < 0.001);
  assert.equal(lamps.length, 2);
  for (const lamp of lamps) {
    const [u, v] = along(one, from(one, lamp));
    assert.ok(near(Math.abs(u), 34.75, 0.2) && near(v, 0, 0.2) && near(lamp[2], 302.9, 0.01), JSON.stringify([u, v, lamp[2]]));
  }
  // It stands on its podium, which is still a slab: the shopping centre's roof is laid like any other.
  const podium = slabsOf('kingdom-centre');
  assert.equal(podium.length, 1);
  assert.ok(podium[0].properties.b === 0 && podium[0].properties.t === 16 && podium[0].properties.c === '#e3ddd2' && podium[0].properties.n === '#4a3f2e');
});

test('by night the landmarks are lit, each in its own way', () => {
  const nights = (id) => new Map(slabsOf(id).map((feature) => [feature.properties.c, feature.properties.n]));
  const bright = (hex) => Math.max(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  // Every landmark has something that shows by night, and every night colour belongs to a slab that is there.
  for (const one of LANDMARKS) {
    if (one.id === 'kafd' || /^kafd-\d/.test(one.id)) continue; // the financial district's own buildings: see kafd.test.mjs
    if (one.model) {
      // (A model: faces that give light of their own, or have rooms with their lamps on.)
      assert.ok(modelOf(one.id).filter((face) => face.glow > 0 || face.lit > 0).length > 10, one.id);
      continue;
    }
    const lit = slabsOf(one.id).filter((feature) => feature.properties.n);
    assert.ok(lit.length > 10, `${one.id}: ${lit.length} lit slabs`);
    const paints = new Set(slabsOf(one.id).map((feature) => feature.properties.c));
    for (const paint of Object.keys(one.nights ?? {})) assert.ok(paints.has(paint), `${one.id}: no slab is painted ${paint}`);
  }
  // Al Faisaliah's golden globe is lit in every room; of the offices under its sunshades, some.
  const faisaliah = modelOf('al-faisaliah');
  assert.ok(faisaliah.filter((face) => face.colour === '#c8922e').every((face) => face.lit === 1) && faisaliah.filter((face) => face.colour === '#3f5266').every((face) => near(face.lit, 0.3, 0.01)));
  // The TV tower's lantern is lit like a lamp, and the KAFD station shines through its shell.
  assert.ok(bright(nights('tv-tower').get('#3f566c')) === 255);
  assert.ok(bright(nights('kafd-station').get('#8fa7b8')) === 255 && bright(nights('kafd-station').get('#e6d9bb')) > 230);
});

test('Al Faisaliah: a square that rises to a point in one arc between four corner beams, banded floor by floor, with its golden globe near the top', () => {
  const one = landmark('al-faisaliah');
  assert.ok(one.height === 267 && one.clear === 30 && near(one.at[0], 46.68501, 1e-5) && near(one.at[1], 24.6902, 1e-5));
  const angle = (one.bearing * Math.PI) / 180;
  const own = ([east, north, up]) => [east * Math.cos(angle) - north * Math.sin(angle), east * Math.sin(angle) + north * Math.cos(angle), up];
  const faces = modelOf('al-faisaliah').map((face) => ({ ...face, places: face.corners.map(own), looks: face.normals.map(own) }));
  const halfAt = (z) => 20.6 * (1 - (z / 267) ** 2.8);
  const lean = (z) => (20.6 * 2.8 * z ** 1.8) / 267 ** 2.8;
  // 41 m a side at the ground, 24 m at its top floor, nothing at 267 m: one arc.
  assert.ok(near(halfAt(0) * 2, 41.2, 0.01) && near(halfAt(195) * 2, 24.1, 0.1) && halfAt(267) === 0);
  // Every storey of its 44 on each of its four faces: a band of pale sunshades, and a strip of dark glass above it.
  const shades = faces.filter((face) => face.colour === '#e4e7e9');
  const glass = faces.filter((face) => face.colour === '#3f5266');
  assert.deepEqual([shades.length, glass.length], [44 * 4 * 2, 44 * 4 * 2]);
  assert.ok(shades.every((face) => face.kind === 'plain') && glass.every((face) => face.kind === 'glass' && face.own === 3 && near(face.storey, 195 / 44, 1e-4)));
  for (const face of [...shades, ...glass]) {
    face.places.forEach(([x, y, z], k) => {
      // On the arc, and no higher than the top floor; and the light falls on it as on a curve.
      assert.ok(near(Math.max(Math.abs(x), Math.abs(y)), halfAt(z), 0.02) && z <= 195.01, `${x}, ${y}, ${z}`);
      const [nx, ny, nz] = face.looks[k];
      assert.ok(near(nz / Math.hypot(nx, ny), lean(z), 0.01), `${nz / Math.hypot(nx, ny)} at ${z}`);
    });
  }
  const storey = 195 / 44;
  assert.ok(shades.every((face) => near((Math.max(...face.places.map((p) => p[2])) - Math.min(...face.places.map((p) => p[2]))) / storey, 0.66, 0.01)));
  // The four corner beams: from the ground to the lantern, each a little proud of the faces; and three ties round the tower.
  const beams = faces.filter((face) => face.colour === '#eef0f0');
  assert.ok(beams.every((face) => face.kind === 'plain' && face.light === '#eaf2ff' && near(face.glow, 0.5, 0.01)));
  const ties = beams.filter((face) => face.places.every(([x, y, z]) => near(Math.max(Math.abs(x), Math.abs(y)), halfAt(z) + 0.7, 0.02)));
  assert.equal(ties.length, 3 * 4 * 2);
  assert.deepEqual([...new Set(ties.map((face) => Math.round(face.places.reduce((sum, p) => sum + p[2], 0) / 3 / 4) * 4))].sort((a, b) => a - b), [44, 88, 132]);
  const tubes = beams.filter((face) => !ties.includes(face));
  assert.equal(tubes.length, 4 * 34 * 4 * 2);
  assert.ok(near(Math.min(...tubes.flatMap((face) => face.places.map((p) => p[2]))), 0, 0.001) && near(Math.max(...tubes.flatMap((face) => face.places.map((p) => p[2]))), 240, 0.01));
  for (const face of tubes) for (const [x, y, z] of face.places) assert.ok(Math.abs(Math.abs(x) - (halfAt(z) + 0.3)) <= 1.31 && Math.abs(Math.abs(y) - (halfAt(z) + 0.3)) <= 1.31, 'at the four corners');
  // Above the top floor: the roof over it, the observation deck at 200 m, and the globe, with nothing else between the beams.
  const deck = faces.filter((face) => face.colour === '#d5dadd');
  assert.ok(deck.length === 4 && deck.every((face) => face.places.every((p) => near(p[2], 200, 0.001))) && deck.some((face) => face.normal[2] > 0.99) && deck.some((face) => face.normal[2] < -0.99));
  const gold = faces.filter((face) => face.colour === '#c8922e');
  // (A ball of eight rings of sixteen pieces; at its two poles the pieces are triangles.)
  assert.equal(gold.length, 8 * 16 * 2 - 32);
  assert.ok(gold.every((face) => face.kind === 'glass' && face.lit === 1 && face.own === 7 && face.places.every(([x, y, z]) => near(Math.hypot(x, y, z - 217), 12, 0.01))), 'a globe 24 m across, its middle 217 m up');
  gold.forEach((face) => face.looks.forEach((looks, k) => assert.ok(near(Math.hypot(...looks.map((part, i) => part - (face.places[k][i] - (i === 2 ? 217 : 0)) / 12)), 0, 0.01), 'it looks straight out all round')));
  // (It fits: where it is widest, the beams stand further from the middle of the tower than it reaches.)
  assert.ok((halfAt(217) + 0.3) * Math.SQRT2 > 12);
  const between = faces.filter((face) => face.places.every((p) => p[2] > 201 && p[2] < 239) && !gold.includes(face) && !tubes.includes(face));
  assert.equal(between.length, 0);
  // The lantern: the last 27 m, closed in and lit, to the point at 267 m with its red lamp.
  const lantern = faces.filter((face) => face.colour === '#eef0ef');
  assert.ok(lantern.length >= 4 * 6 * 2 - 4 && lantern.every((face) => near(face.glow, 0.85, 0.01) && face.places.every((p) => p[2] >= 240 - 0.001)));
  assert.ok(near(Math.max(...faces.flatMap((face) => face.places.map((p) => p[2]))), 267, 0.001));
  const lamp = landmarkBeacons().filter((beacon) => Math.hypot(...from(one, beacon)) < 30);
  assert.ok(lamp.length === 1 && near(lamp[0][2], 267.6, 0.01) && Math.hypot(...from(one, lamp[0])) < 0.1);
});

test('Al Majdoul turns a quarter of a turn on its way up', () => {
  const one = landmark('al-majdoul');
  const facing = (z) => {
    // Which way the longest wall of the slab at this level runs, in degrees.
    const feature = slabsOf('al-majdoul').find(({ properties }) => properties.b <= z && z < properties.t);
    const ring = feature.geometry.coordinates[0].map((corner) => from(one, corner));
    let longest = 0;
    let angle = 0;
    for (let i = 1; i < ring.length; i += 1) {
      const wall = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
      if (wall > longest) {
        longest = wall;
        angle = (Math.atan2(ring[i][1] - ring[i - 1][1], ring[i][0] - ring[i - 1][0]) * 180) / Math.PI;
      }
    }
    return ((angle % 90) + 90) % 90; // a square looks the same every quarter turn
  };
  const turned = (a, b) => (((facing(b) - facing(a)) % 90) + 90) % 90;
  assert.ok(near(turned(1, 104), 40, 4), `${turned(1, 104)}° by half way`);
  assert.ok(near(turned(1, 205), 79, 5), `${turned(1, 205)}° near the top`);
  // Burj Rafal: one oval all the way up, then two horns.
  assert.equal(cut('burj-rafal', 150).length, 1);
  assert.ok(cut('burj-rafal', 300).length >= 2);
});

test('PIF Tower: a crystal of six sides in six tiers that does not taper, folded along diagonals, cleft at its apexes, under a notched crown', () => {
  const one = landmark('pif-tower');
  assert.equal(one.height, 385);
  const faces = modelOf('pif-tower');
  const foot = 10; // the lowest level at which its corners change places
  const tier = (369 - foot) / 6;
  const storey = tier / 14;
  const levels = [0, 1, 2, 3, 4, 5, 6].map((level) => foot + level * tier);
  const body = '#2f4649';
  const dark = '#1e2b2c';
  // The skin between the hall at its foot and the crown: glass, and the dark walls of the clefts.
  const skin = faces.filter((face) => face.corners.every((corner) => corner[2] >= foot - 1e-3 && corner[2] <= 369 + 1e-3) && (face.colour === body || face.colour === dark) && Math.abs(face.normal[2]) < 0.5);
  const glass = skin.filter((face) => face.colour === body);
  const clefts = skin.filter((face) => face.colour === dark);
  assert.ok(glass.every((face) => face.kind === 'glass') && clefts.every((face) => face.kind === 'plain'));
  // Every triangle spans one tier, from one level to the next: none is cut across by a level, and its
  // corners lie on levels (but for the two bands of bright floors, where a face is cut once more).
  const wholeOf = new Map();
  for (const face of glass) {
    const heights = face.corners.map((corner) => corner[2]);
    const t = Math.floor(((Math.min(...heights) + Math.max(...heights)) / 2 - foot) / tier);
    assert.ok(Math.min(...heights) >= levels[t] - 1e-3 && Math.max(...heights) <= levels[t + 1] + 1e-3, `tier ${t}`);
    const key = `${t}|${face.normal.map((n) => n.toFixed(4)).join(',')}`;
    wholeOf.set(key, (wholeOf.get(key) ?? 0) + 1);
  }
  // Six tiers; in each, six sides of two flat triangles each: twelve ways of looking, no two alike.
  for (let t = 0; t < 6; t += 1) assert.equal([...wholeOf.keys()].filter((key) => key.startsWith(`${t}|`)).length, 12, `tier ${t}`);

  /** The outline at a height: the pieces of line where a level plane cuts the skin, and what they enclose. */
  const outlineAt = (z, of = skin) => {
    const mesh = new ModelMesh();
    const pieces = [];
    for (const face of of) {
      const crossings = [];
      for (let k = 0; k < 3; k += 1) {
        const here = face.corners[k];
        const next = face.corners[(k + 1) % 3];
        if (here[2] > z === next[2] > z) continue;
        const part = (z - here[2]) / (next[2] - here[2]);
        crossings.push([here[0] + (next[0] - here[0]) * part, here[1] + (next[1] - here[1]) * part]);
      }
      if (crossings.length === 2) pieces.push({ ends: crossings, face });
    }
    void mesh;
    // (Seen from its middle the outline never doubles back, so the pieces make a fan of triangles round it.)
    const area = pieces.reduce((sum, { ends: [a, b] }) => sum + Math.abs(a[0] * b[1] - a[1] * b[0]) / 2, 0);
    const reach = (degrees) => {
      // How far out the outline is in a direction (degrees clockwise from north).
      const way = [Math.sin((degrees * Math.PI) / 180), Math.cos((degrees * Math.PI) / 180)];
      let far = 0;
      for (const { ends: [a, b] } of pieces) {
        const d = [b[0] - a[0], b[1] - a[1]];
        const across = way[0] * d[1] - way[1] * d[0];
        if (Math.abs(across) < 1e-9) continue;
        const t = (a[0] * d[1] - a[1] * d[0]) / across;
        const s = (a[0] * way[1] - a[1] * way[0]) / across;
        if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) far = Math.max(far, t);
      }
      return far;
    };
    return { pieces, area, reach, length: pieces.reduce((sum, { ends: [a, b] }) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0) };
  };

  // It does not taper: every floor from the hall to the crown has some 2,550 square metres, as published,
  // give or take a twelfth (least where it draws in under its crown).
  const areas = [15, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340, 365].map((z) => outlineAt(z).area);
  assert.ok(Math.min(...areas) > 2340 && Math.max(...areas) < 2700, areas.map(Math.round).join(' '));
  assert.equal(Math.min(...areas), areas.at(-1));
  // Its corners: three apexes (40.7, 160.7 and 280.7 degrees round from north) and three pleats between.
  const apexes = [40.7, 160.7, 280.7];
  const pleats = [100.7, 220.7, 340.7];
  // It breathes: at the odd levels the apexes stand out and the pleats in; at the even ones the other way.
  for (const level of [1, 2, 3, 4, 5]) {
    const here = outlineAt(levels[level] + (level % 2 === 0 ? 0.3 : -0.3));
    // (An apex is measured a hair round from its point, on the side away from its cleft.)
    for (const degrees of apexes) assert.ok(near(here.reach(degrees + 0.2), 33 * (level % 2 === 1 ? 1.08 : 0.92), 0.25), `apex at level ${level}: ${here.reach(degrees + 0.2).toFixed(2)}`);
    for (const degrees of pleats) assert.ok(near(here.reach(degrees), 29.8 * (level % 2 === 1 ? 0.96 : 1.04), 0.25), `pleat at level ${level}: ${here.reach(degrees).toFixed(2)}`);
  }
  // Its six sides are as good as equal where the corners stand half-way between in and out: some 31 m.
  const half = outlineAt(levels[2] + tier / 2);
  const cornersHalf = [...apexes, ...pleats].sort((a, b) => a - b).map((degrees) => [Math.sin((degrees * Math.PI) / 180) * half.reach(degrees + 0.05), Math.cos((degrees * Math.PI) / 180) * half.reach(degrees + 0.05)]);
  for (let i = 0; i < 6; i += 1) {
    const next = cornersHalf[(i + 1) % 6];
    assert.ok(near(Math.hypot(next[0] - cornersHalf[i][0], next[1] - cornersHalf[i][1]), 31.5, 0.8), `side ${i}`);
  }

  // The folds. Between two levels a side is two flat triangles that meet along the line from the corner
  // standing out below to the one standing out above: so along that line they look different ways, and
  // the tower is a ridge there, not a hollow. (Take the side from the eastern pleat to the cleft of the
  // southern apex, in the tier from level 2, where the pleats stand out, to level 3.)
  const sideAt = (z, degrees) => outlineAt(z).pieces.filter(({ ends: [a, b], face }) => {
    const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const round = ((Math.atan2(middle[0], middle[1]) * 180) / Math.PI + 360) % 360;
    return face.colour === body && round > degrees[0] && round < degrees[1];
  });
  const low = sideAt(levels[2] + 6, [101, 152]);
  const high = sideAt(levels[3] - 6, [101, 152]);
  assert.equal(new Set(low.map(({ face }) => face.normal.join())).size, 2, 'two triangles to the side');
  // Low down, most of the side belongs to the triangle that stands on the lower level; high up, to the other.
  const share = (pieces) => {
    const byFace = new Map();
    for (const { ends: [a, b], face } of pieces) byFace.set(face.normal.join(), (byFace.get(face.normal.join()) ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    return byFace;
  };
  const [lower] = [...share(low).entries()].sort((a, b) => b[1] - a[1])[0];
  const [upper] = [...share(high).entries()].sort((a, b) => b[1] - a[1])[0];
  assert.notEqual(lower, upper);
  assert.ok(share(low).get(lower) > (share(low).get(upper) ?? 0) * 4 && share(high).get(upper) > (share(high).get(lower) ?? 0) * 4);
  // A ridge: each of the two looks a little away from the other.
  const [n1, n2] = [lower, upper].map((key) => key.split(',').map(Number));
  const across = [n1[1] * n2[2] - n1[2] * n2[1], n1[2] * n2[0] - n1[0] * n2[2], n1[0] * n2[1] - n1[1] * n2[0]];
  assert.ok(Math.hypot(...across) > 0.03, 'they are not in one plane');
  // Every glass face of the skin looks outwards; and every line of it is drawn: the folds, the levels, the corners.
  for (const face of glass) {
    const middle = [0, 1].map((k) => (face.corners[0][k] + face.corners[1][k] + face.corners[2][k]) / 3);
    assert.ok(face.normal[0] * middle[0] + face.normal[1] * middle[1] > 0, 'outwards');
    assert.ok(face.ridge === 1 && face.fins > 0.5);
  }

  // The clefts: beside each apex, on the side towards the pleat before it, a recess with dark walls, from
  // the ground to the roof. Its far edge stands still while the apex goes in and out, so it is wide where
  // the apex stands out and narrow where it stands in.
  for (const z of [15, 100, 200, 300, 368]) {
    const cut = outlineAt(z).pieces.filter(({ face }) => face.colour === dark);
    assert.ok(cut.length >= 6, `${cut.length} pieces of cleft at ${z} m`);
    for (const degrees of apexes) {
      const here = cut.filter(({ ends: [a] }) => Math.abs((((Math.atan2(a[0], a[1]) * 180) / Math.PI - degrees + 540) % 360) - 180) < 15);
      assert.ok(here.length >= 2, `the cleft beside the apex at ${degrees}`);
      // It is cut into the tower: its walls lie inside the line from the apex to the next pleat round.
      assert.ok(here.every(({ ends }) => ends.every(([east, north]) => Math.hypot(east, north) < 33 * 1.085)));
    }
  }
  const cleftWide = (z) => outlineAt(z).pieces.filter(({ face, ends: [a] }) => face.colour === dark && Math.abs((((Math.atan2(a[0], a[1]) * 180) / Math.PI - 40.7 + 540) % 360) - 180) < 15).reduce((sum, { ends: [a, b] }) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
  assert.ok(cleftWide(levels[3] - 1) > cleftWide(levels[2] + 1) + 2, `${cleftWide(levels[3] - 1).toFixed(1)} m against ${cleftWide(levels[2] + 1).toFixed(1)} m`);
  assert.ok(clefts.every((face) => face.ridge === 0 && face.glow === 0), 'no line, no light');

  // The crown: a screen of glass round the roof, from 369 m to a rim that is highest (385 m) over the
  // north-eastern apex and some four metres lower across the roof from it.
  const crown = faces.filter((face) => face.corners.some((corner) => corner[2] > 369.5));
  const rim = crown.flatMap((face) => face.corners).filter((corner) => corner[2] > 375);
  assert.ok(near(Math.max(...rim.map((corner) => corner[2])), 385, 0.01) && near(Math.min(...rim.map((corner) => corner[2])), 380.6, 0.5), `${Math.min(...rim.map((corner) => corner[2]))}`);
  // It has an outer side and an inner one, back to back.
  const outer = crown.filter((face) => !face.open);
  const inner = crown.filter((face) => face.open);
  assert.equal(outer.length, inner.length);
  // Where each cleft comes up there is a notch in it, wider at the rim than at the roof: less of the
  // outline is left standing the higher the cut.
  const standing = (z) => outlineAt(z, outer.filter((face) => face.colour === body)).length;
  assert.ok(standing(371) < outlineAt(365).length - 3 * 6, `${standing(371).toFixed(1)} of ${outlineAt(365).length.toFixed(1)} m`);
  assert.ok(standing(379.5) < standing(371) - 3 * 2.5, `${standing(379.5).toFixed(1)} against ${standing(371).toFixed(1)}`);
  // The back wall of each cleft runs up to the rim at the apex and down to nothing at its far end.
  const backs = outer.filter((face) => face.colour === dark);
  assert.equal(backs.length, 3);
  for (const back of backs) assert.equal(back.corners.filter((corner) => corner[2] > 375).length, 1);
  // The roof inside the crown lies flat at 369 m, looks up and takes no shadow from the block the map has for the tower.
  const roof = faces.filter((face) => face.normal[2] > 0.99 && face.corners.every((corner) => near(corner[2], 369, 1e-3)));
  assert.ok(roof.length >= 10 && roof.every((face) => face.open && face.kind === 'plain'));
  const flat = (corners) => Math.abs((corners[1][0] - corners[0][0]) * (corners[2][1] - corners[0][1]) - (corners[2][0] - corners[0][0]) * (corners[1][1] - corners[0][1])) / 2;
  assert.ok(near(roof.reduce((sum, face) => sum + flat(face.corners), 0), outlineAt(368.9).area, 30));

  // At its foot: a glass hall, lit from within, and over it a canopy that reaches out past the tower.
  const hall = faces.filter((face) => face.colour === '#5f7f8d');
  assert.ok(hall.length === 12 && hall.every((face) => face.kind === 'glass' && face.lit === 1 && face.corners.every((corner) => corner[2] <= 11)));
  const canopy = faces.filter((face) => face.colour === '#cfd5d8' && face.normal[2] > 0.99);
  const reachOf = (some) => Math.max(...some.flatMap((face) => face.corners).map(([east, north]) => Math.hypot(east, north)));
  assert.ok(canopy.every((face) => face.corners.every((corner) => near(corner[2], 12.6, 1e-3))));
  const footReach = Math.max(...skin.flatMap((face) => face.corners).filter((corner) => corner[2] < foot + 1).map(([east, north]) => Math.hypot(east, north)));
  assert.ok(reachOf(canopy) > reachOf(hall) + 3 && reachOf(hall) > footReach + 3 && reachOf(canopy) < 45, JSON.stringify([footReach, reachOf(hall), reachOf(canopy)]));
  const under = faces.filter((face) => face.normal[2] < -0.99);
  assert.ok(under.length >= 4 && under.every((face) => face.glow > 0.5 && face.light === '#ffe9c8'), 'its underside is lit by the lamps of the hall');

  // By night: a line of violet light along the edge of every floor, strongest on the crown and the tier
  // under it; offices with their lamps on in every tier but the top one; and two bands of floors that are
  // lit from end to end.
  assert.ok(glass.every((face) => face.light === '#a428f5' && near(face.storey, storey, 1e-3) && face.bay === 3));
  const tierOf = (face) => Math.floor((face.corners.reduce((sum, corner) => sum + corner[2], 0) / 3 - foot) / tier);
  assert.ok(glass.filter((face) => tierOf(face) === 5).every((face) => face.glow === 1 && face.lit === 0));
  assert.ok(glass.filter((face) => tierOf(face) < 5).every((face) => near(face.glow, 0.8, 0.003) && face.lit > 0.25));
  assert.ok(outer.filter((face) => face.colour === body).every((face) => face.glow === 1 && face.lit === 0));
  const bright = glass.filter((face) => face.lit === 1);
  assert.ok(bright.length > 20 && bright.every((face) => tierOf(face) === 4));
  const bands = [[foot + 57 * storey, foot + 58 * storey], [foot + 65 * storey, foot + 68 * storey]];
  for (const face of bright) {
    const heights = face.corners.map((corner) => corner[2]);
    assert.ok(bands.some(([from, to]) => Math.min(...heights) >= from - 1e-3 && Math.max(...heights) <= to + 1e-3));
  }
  // (Right round the tower: the bright floors are an unbroken ring but for the clefts.)
  assert.ok(outlineAt(foot + 66.5 * storey, bright).length > outlineAt(foot + 66.5 * storey, glass).length - 0.01);
  // And the red lamps: one on the rim over each apex.
  const lamps = landmarkBeacons().filter((lamp) => Math.hypot(...from(one, lamp)) < 40);
  assert.equal(lamps.length, 3);
  assert.ok(near(Math.max(...lamps.map((lamp) => lamp[2])), 385.6, 0.01) && Math.min(...lamps.map((lamp) => lamp[2])) > 381);
  for (const lamp of lamps) {
    const [east, north] = from(one, lamp);
    assert.ok(near(Math.hypot(east, north), 33 * 0.985, 0.2) && apexes.some((degrees) => near(((Math.atan2(east, north) * 180) / Math.PI + 360) % 360, degrees, 0.5)));
  }
});

test('Hamad Tower: a sail of blue glass that narrows to a point along a curve, beside a block of 25 floors, both in a white frame of beams and crossed braces', () => {
  const one = landmark('hamad-tower');
  // Beside King Fahd Road, next to Al Faisaliah; its long side along the road.
  assert.ok(near(one.at[1], 24.69207, 0.0002) && near(one.at[0], 46.68283, 0.0002) && one.bearing === 342 && one.height === 163 && one.clear === 40);
  // Every corner in the tower's own measure: east (away from the road), north (along it), up.
  const angle = (one.bearing * Math.PI) / 180;
  const own = ([east, north, up]) => [east * Math.cos(angle) - north * Math.sin(angle), east * Math.sin(angle) + north * Math.cos(angle), up];
  const turn = ([east, north, up]) => own([east, north, up]);
  const faces = modelOf('hamad-tower').map((face) => ({ ...face, places: face.corners.map(own), looks: turn(face.normal) }));
  const share = (z) => 1 - (z / 163) ** 2.9;
  const west = (z) => 12.5 - 28 * share(z);
  const north = (z) => 1 + 39 * share(z);

  const glass = faces.filter((face) => face.colour === '#2a548a');
  assert.ok(glass.length > 150 && glass.every((face) => face.kind === 'glass' && face.own === 5 && near(face.mirror, 0.5, 1e-6) && near(face.storey, 98 / 24, 1e-4)), 'one skin of blue glass, a storey 4.08 m');
  // The sail's southern face: upright, from its curved back to its upright edge, up to the point 163 m over that edge.
  const southern = glass.filter((face) => face.looks[1] < -0.99 && face.places.every((place) => near(place[1], 1, 0.01)));
  assert.ok(southern.length >= 20);
  for (const face of southern) for (const [x, , z] of face.places) assert.ok(near(x, 12.5, 0.01) || near(x, west(z), 0.02), `${x} at ${z}`);
  const tip = southern.flatMap((face) => face.places).reduce((best, place) => (place[2] > best[2] ? place : best));
  assert.ok(near(tip[0], 12.5, 0.01) && near(tip[1], 1, 0.01) && near(tip[2], 163, 0.01), `${tip}`);
  // As wide, at four heights, as it measures in the photograph of it taken along the road (within a metre).
  for (const [z, wide] of [[96, 22], [126, 14.6], [142.3, 8.8], [150.5, 5.9]]) assert.ok(near(12.5 - west(z), wide, 1), `${z} m: ${12.5 - west(z)}`);
  // Its eastern face is a sail too: it narrows the same way, along the road.
  const eastern = glass.filter((face) => face.looks[0] > 0.99 && face.places.every((place) => near(place[0], 12.5, 0.01)));
  assert.ok(eastern.length >= 20);
  for (const face of eastern) for (const [, y, z] of face.places) assert.ok(near(y, 1, 0.01) || near(y, north(z), 0.02), `${y} at ${z}`);
  // The back: over the road in grey metal, leaning in further the higher it is; the light falls on it as on a curve.
  const back = faces.filter((face) => face.colour === '#b3b8bc');
  // (Forty floors of it, each a strip of two triangles; the last comes to the point, and is one.)
  assert.ok(back.length === 79 && back.every((face) => face.kind === 'plain'), `${back.length}`);
  for (const face of back) {
    face.places.forEach(([x, y, z], k) => {
      assert.ok(near(x, west(z), 0.02) && y >= 1 - 0.01 && y <= north(z) + 0.02);
      const looks = turn(face.normals[k]);
      const slope = (28 * 2.9 * z ** 1.9) / 163 ** 2.9;
      assert.ok(looks[0] < 0 && near(looks[2] / -looks[0], slope, 0.01) && near(looks[1], 0, 1e-6), `${looks} at ${z}`);
    });
  }
  // (At its point the back leans 26 degrees from upright.)
  assert.ok(near((Math.atan((28 * 2.9) / 163) * 180) / Math.PI, 26.5, 0.2));
  // A slit of window to each floor, two along the back, as far up as the back is nine metres long.
  const slits = faces.filter((face) => face.colour === '#1d2a38');
  assert.equal(slits.length, 37 * 2 * 2);
  assert.ok(slits.every((face) => face.looks[0] < -0.85 && face.places.every(([x, y, z]) => x < west(z) + 0.5 && y > 1 && y < north(z))));
  // The northern side of the back is glass, and leans in the same way.
  const northern = glass.filter((face) => face.looks[1] > 0.8 && face.places.some((place) => place[1] > 1.01));
  assert.ok(northern.length === 79 && northern.every((face) => face.places.every(([x, y, z]) => near(y, north(z), 0.02) && x >= west(z) - 0.02 && x <= 12.51)));

  // The block: 28 m by 41.4 m, 98 m to its roof: six tiers of four floors.
  const walls = glass.filter((face) => !southern.includes(face) && !eastern.includes(face) && !northern.includes(face));
  const corners = walls.flatMap((face) => face.places);
  assert.ok(near(Math.min(...corners.map((c) => c[0])), -10.5, 0.01) && near(Math.max(...corners.map((c) => c[0])), 17.5, 0.01));
  assert.ok(near(Math.min(...corners.map((c) => c[1])), -41, 0.01) && near(Math.max(...corners.map((c) => c[1])), 0.4, 0.01) && near(Math.max(...corners.map((c) => c[2])), 98, 0.01));
  const roof = faces.filter((face) => face.colour === '#aab2b9');
  assert.ok(roof.length === 2 && roof.every((face) => face.open && face.looks[2] > 0.99 && face.places.every((place) => near(place[2], 98, 0.01))));
  // The frame: white, standing 35 cm proud of the glass, lit a little by night.
  const frame = faces.filter((face) => face.colour === '#e4e7e8');
  assert.ok(frame.length > 300 && frame.every((face) => face.kind === 'plain' && face.light === '#dfe9ff' && near(face.glow, 0.3, 0.01)));
  // On the block's southern face: a beam between each tier and the next and one round the roof, and a cross of two braces in each of the six tiers.
  const front = frame.filter((face) => face.looks[1] < -0.99 && face.places.every((place) => near(place[1], -41.35, 0.01)));
  const spans = (face) => [Math.max(...face.places.map((p) => p[0])) - Math.min(...face.places.map((p) => p[0])), Math.max(...face.places.map((p) => p[2])) - Math.min(...face.places.map((p) => p[2]))];
  const braces = front.filter((face) => spans(face)[0] > 27 && spans(face)[1] > 15 && spans(face)[1] < 18);
  const beams = front.filter((face) => spans(face)[0] > 27 && spans(face)[1] < 1);
  const posts = front.filter((face) => spans(face)[0] < 1.2 && spans(face)[1] > 97);
  assert.deepEqual([braces.length, beams.length, posts.length], [6 * 2 * 2, 6 * 2, 2 * 2]);
  // On the sail's southern face: eight braced tiers (to 130.7 m), one beam more, and then glass to the point.
  const sailFrame = frame.filter((face) => face.looks[1] < -0.99 && face.places.every((place) => near(place[1], 0.65, 0.01)));
  const crossed = sailFrame.filter((face) => spans(face)[1] > 15 && spans(face)[1] < 18 && spans(face)[0] > 6);
  assert.equal(crossed.length, 8 * 2 * 2);
  assert.ok(crossed.every((face) => Math.max(...face.places.map((p) => p[2])) <= (98 / 6) * 8 + 0.5));
  const level = sailFrame.filter((face) => spans(face)[1] < 1 && spans(face)[0] > 6);
  assert.equal(level.length, 8 * 2);

  // It stands on one podium, as long as its two parts together; and a red lamp burns on its point.
  const podium = slabsOf('hamad-tower');
  assert.equal(podium.length, 1);
  const outline = podium[0].geometry.coordinates[0].map((corner) => along(one, from(one, corner)));
  assert.ok(podium[0].properties.t === 9 && near(Math.max(...outline.map((c) => c[0])) - Math.min(...outline.map((c) => c[0])), 87, 0.1) && near(Math.max(...outline.map((c) => c[1])) - Math.min(...outline.map((c) => c[1])), 61, 0.1));
  const lamp = landmarkBeacons().filter((beacon) => Math.hypot(...from(one, beacon)) < 60);
  assert.ok(lamp.length === 1 && near(lamp[0][2], 163.6, 0.01));
  const [lampEast, lampNorth] = own([...from(one, lamp[0]), 0]);
  assert.ok(near(lampEast, 12.5, 0.05) && near(lampNorth, 1, 0.05));
  // The map's own blocks for it (its two parts, and the outline round both) make way for the model; the hotel to the south of it does not.
  const rect = (id, [east, north], halfLong, halfWide) => {
    const ring = [[-halfWide, -halfLong], [halfWide, -halfLong], [halfWide, halfLong], [-halfWide, halfLong], [-halfWide, -halfLong]].map(([x, y]) => {
      const e = east + x * Math.cos(angle) + y * Math.sin(angle);
      const n = north + y * Math.cos(angle) - x * Math.sin(angle);
      return [one.at[0] + e / (METERS * Math.cos((one.at[1] * Math.PI) / 180)), one.at[1] + n / METERS];
    });
    return { id, ring };
  };
  const gone = replacedByLandmarks([rect('sail', [-7.6, 17.25], 21, 16.5), rect('block', [7.6, -17.25], 22.5, 16.5), rect('both', [-4.5, -3.9], 43.5, 30.5), rect('hotel', [55, -110], 20, 15)]);
  assert.deepEqual([...gone].sort(), ['block', 'both', 'sail']);
});

test('the Al Anoud Towers: two fins of sand-coloured stone end-on to the road, each with a bowed front of dark glass that curves back to a peak, and a pair of masts', () => {
  const hamad = landmark('hamad-tower');
  const [first, second] = [landmark('al-anoud-tower'), landmark('al-anoud-tower-2')];
  // Side by side on the far side of King Fahd Road from Hamad Tower: some 140 m west of it, 57 m apart along the road.
  for (const one of [first, second]) {
    const [east, north] = from(hamad, one.at);
    assert.ok(east < -110 && east > -160 && Math.abs(north) < 60 && one.bearing === 334 && one.clear === 30, `${east}, ${north}`);
  }
  const [apartAlong, apartAcross] = along(first, from(first, second.at));
  assert.ok(near(apartAlong, -55, 6) && Math.abs(apartAcross) < 8, `${apartAlong}, ${apartAcross}`);
  assert.deepEqual([first.height, second.height], [121, 106]);
  for (const [one, peak, masts] of [[first, 100, [22.5, 17]], [second, 92, [15, 11]]]) {
    const angle = (one.bearing * Math.PI) / 180;
    // Its own measure: east towards the road, north along it, up.
    const own = ([east, north, up]) => [east * Math.cos(angle) - north * Math.sin(angle), east * Math.sin(angle) + north * Math.cos(angle), up];
    const faces = modelOf(one.id).map((face) => ({ ...face, places: face.corners.map(own), looks: own(face.normal) }));
    // The side walls: stone, 30 m from back to front, standing 18 m apart; lit a little by night.
    const stone = faces.filter((face) => face.colour === '#cbbd98');
    assert.ok(stone.length > 20 && stone.every((face) => face.kind === 'plain' && face.light === '#ffe2b0' && near(face.glow, 0.22, 0.01)));
    const sides = stone.filter((face) => Math.abs(face.looks[1]) > 0.99);
    assert.ok(sides.every((face) => face.places.every((place) => near(Math.abs(place[1]), 9, 0.01) && place[0] >= -15.01 && place[0] <= 15.01)));
    assert.ok(sides.some((face) => face.looks[1] > 0) && sides.some((face) => face.looks[1] < 0));
    // The wall's outline: upright at the front for six tenths of its height, then curving back 8.6 m to the peak; the roof falls to the rear.
    const outline = sides.flatMap((face) => face.places);
    const frontAt = (z) => Math.max(...outline.filter((place) => near(place[2], z, 0.01)).map((place) => place[0]));
    assert.ok(near(frontAt(0), 15, 0.01) && near(frontAt(0.6 * peak), 15, 0.01) && near(frontAt(0.826 * peak), 12.4, 0.01) && near(frontAt(peak), 6.4, 0.01));
    assert.ok(near(Math.max(...outline.map((place) => place[2])), peak, 0.01));
    const rear = peak - 0.67 * 21.4;
    assert.ok(near(Math.max(...outline.filter((place) => near(place[0], -15, 0.01)).map((place) => place[2])), rear, 0.01));
    // In each wall, two slots of glass crossed with white braces: three crosses to a slot.
    const glass = faces.filter((face) => face.colour === '#1f2f47');
    assert.ok(glass.every((face) => face.kind === 'glass' && face.own === 11));
    const slots = glass.filter((face) => Math.abs(face.looks[1]) > 0.99);
    assert.equal(slots.length, 2 * 2 * 2);
    assert.ok(slots.every((face) => face.places.every((place) => near(Math.abs(place[1]), 8.6, 0.01) && place[0] > 1.9 && place[0] < 8.7 && place[2] >= 0.12 * peak - 0.01 && place[2] <= 0.857 * peak + 0.01)));
    const braces = faces.filter((face) => face.colour === '#eceeed' && Math.abs(face.looks[1]) > 0.99 && face.places.every((place) => place[2] < peak - 1));
    assert.equal(braces.length, 2 * 2 * (3 * 2 + 2) * 2);
    // The front: glass from wall to wall, standing 2.5 m further out in its middle than at its edges, up to the peak.
    const frontGlass = glass.filter((face) => face.looks[0] > 0.5);
    assert.equal(frontGlass.length, 7 * 4 * 2);
    const bowed = frontGlass.flatMap((face) => face.places).filter((place) => near(place[2], 0.4 * peak, 0.01));
    assert.ok(near(Math.max(...bowed.map((place) => place[0])), 17.5, 0.01) && near(Math.min(...bowed.map((place) => place[0])), 15, 0.01));
    assert.ok(bowed.every((place) => near(place[0], 15 + 2.5 * (1 - (place[1] / 9) ** 2), 0.01)));
    // The masts: a pair on the peak, leaning back 15 degrees; a red lamp on the tip of each.
    const lamps = landmarkBeacons().filter((beacon) => Math.hypot(...from(one, beacon)) < 20).map((beacon) => own([...from(one, beacon), beacon[2]]));
    assert.equal(lamps.length, 2);
    lamps.sort((a, b) => b[2] - a[2]);
    lamps.forEach((lamp, i) => {
      const long = masts[i];
      assert.ok(near(lamp[2], peak - 0.3 + long * Math.cos((15 * Math.PI) / 180) + 0.5, 0.05) && near(lamp[0], 6 - long * Math.sin((15 * Math.PI) / 180), 0.05) && near(Math.abs(lamp[1]), 3.2, 0.05), `${lamp}`);
    });
    assert.ok(near(lamps[0][2], one.height, 1));
    // One podium under it, two storeys.
    const podium = slabsOf(one.id);
    assert.ok(podium.length === 1 && podium[0].properties.t === 11);
  }
});

test('further up King Fahd Road: the ministry\'s white towers with their pyramid, and the two Olaya Towers of dark glass', () => {
  const hamad = landmark('hamad-tower');
  const turnOf = (one) => {
    const angle = (one.bearing * Math.PI) / 180;
    return ([east, north, up]) => [east * Math.cos(angle) - north * Math.sin(angle), east * Math.sin(angle) + north * Math.cos(angle), up];
  };
  // The ministry: 115 m north of Hamad Tower on the same side of the road.
  const ministry = landmark('islamic-affairs');
  const [east, north] = from(hamad, ministry.at);
  assert.ok(near(north, 116, 8) && Math.abs(east) < 70 && ministry.height === 153);
  const own = turnOf(ministry);
  const faces = modelOf('islamic-affairs').map((face) => ({ ...face, places: face.corners.map(own) }));
  // Two towers end to end, 98 m and 112 m, each 28 m by 29 m, striped upright: stone and window by turns.
  const stone = faces.filter((face) => face.colour === '#e9e8e3');
  const windows = faces.filter((face) => face.colour === '#2b3a4c' && face.kind === 'glass');
  assert.ok(stone.length >= 120 && windows.length >= 120 && stone.every((face) => face.kind === 'plain'));
  const topOf = (list, southern) => Math.max(...list.filter((face) => face.places.every((p) => (p[1] < 0) === southern)).flatMap((face) => face.places.map((p) => p[2])));
  assert.deepEqual([topOf(stone, true), topOf(stone, false)], [98, 112]);
  assert.ok(stone.every((face) => face.places.every(([x, y]) => Math.abs(x) <= 14.01 && Math.abs(y) <= 31.01 && Math.abs(y) >= 1.99)));
  // (Each stripe of stone is 2.1 m wide or so, each window 1.4 m.)
  const wide = (face) => Math.max(...face.places.map((p) => Math.hypot(p[0], p[1]))) > 0 && Math.max(Math.max(...face.places.map((p) => p[0])) - Math.min(...face.places.map((p) => p[0])), Math.max(...face.places.map((p) => p[1])) - Math.min(...face.places.map((p) => p[1])));
  assert.ok(stone.every((face) => near(wide(face), 2.1, 0.15)) && windows.filter((face) => face.places.every((p) => Math.abs(p[1]) > 2.01 || Math.abs(p[0]) > 13.9)).every((face) => near(wide(face), 1.4, 0.15) || near(wide(face), 4, 0.01)));
  // The pyramid of blue glass on the northern tower: 20 m square at its foot, 16 m high; and the mast to 153 m.
  const blue = faces.filter((face) => face.colour === '#3f79ad');
  const pyramid = blue.filter((face) => face.places.some((p) => near(p[2], 128, 0.01)));
  assert.ok(pyramid.length === 4 && pyramid.every((face) => face.places.every(([x, y, z]) => (near(z, 112, 0.01) && near(Math.abs(x), 10, 0.01) && near(Math.abs(y - 16.5), 10, 0.01)) || (near(z, 128, 0.01) && near(x, 0, 0.01) && near(y, 16.5, 0.01)))));
  assert.ok(near(Math.max(...faces.flatMap((face) => face.places.map((p) => p[2]))), 153, 0.01));
  // The skylight on the southern tower slants up to the north.
  const sky = blue.filter((face) => !pyramid.includes(face));
  assert.ok(sky.length === 2 && near(Math.min(...sky.flatMap((face) => face.places.map((p) => p[2]))), 98.4, 0.01) && near(Math.max(...sky.flatMap((face) => face.places.map((p) => p[2]))), 104.5, 0.01));

  // The Olaya Towers: just north of Tahlia Street, 600 m up the road from Hamad Tower; 203.4 m and 166.3 m.
  const [tall, short] = [landmark('olaya-tower'), landmark('olaya-tower-2')];
  assert.ok(near(from(hamad, tall.at)[1], 598, 10) && near(from(hamad, short.at)[1], 535, 10) && near(Math.hypot(...from(tall, short.at)), 64, 3));
  for (const [one, roof, top] of [[tall, 190, 203.4], [short, 154, 166.3]]) {
    const mine = turnOf(one);
    const parts = modelOf(one.id).map((face) => ({ ...face, places: face.corners.map(mine) }));
    const glass = parts.filter((face) => face.colour === '#22364f');
    assert.ok(glass.length === 8 && glass.every((face) => face.kind === 'glass' && face.own === 13 && near(face.mirror, 0.55, 1e-6)));
    const corners = glass.flatMap((face) => face.places);
    assert.ok(near(Math.max(...corners.map((p) => p[0])), 22, 0.01) && near(Math.max(...corners.map((p) => p[1])), 16, 0.01) && near(Math.max(...corners.map((p) => p[2])), roof, 0.01) && Math.min(...corners.map((p) => p[2])) === 0);
    // The crown: narrower, lit by night in light that changes colour.
    const crown = parts.filter((face) => face.colour === '#c3ccd4');
    assert.ok(crown.length === 8 && crown.every((face) => face.changing && near(face.glow, 0.75, 0.01) && face.places.every(([x, y, z]) => Math.abs(x) <= 17.01 && Math.abs(y) <= 11.51 && z >= roof - 0.01 && z <= top + 0.01)));
    assert.ok(near(Math.max(...parts.flatMap((face) => face.places.map((p) => p[2]))), top, 0.01));
    assert.ok(slabsOf(one.id).length === 1 && slabsOf(one.id)[0].properties.t === 13);
  }
});

test('replacedByLandmarks picks the tower\'s own outline, not the block it stands in', () => {
  const kingdom = landmark('kingdom-centre');
  const squeeze = METERS * Math.cos((kingdom.at[1] * Math.PI) / 180);
  const box = (east, north, halfEast, halfNorth) => {
    const corner = (x, y) => [kingdom.at[0] + (east + x) / squeeze, kingdom.at[1] + (north + y) / METERS];
    return [corner(-halfEast, -halfNorth), corner(halfEast, -halfNorth), corner(halfEast, halfNorth), corner(-halfEast, halfNorth), corner(-halfEast, -halfNorth)];
  };
  const outlines = [
    { id: 1, ring: box(0, 0, 38, 22) }, // the tower's outline
    { id: 2, ring: box(0, 0, 150, 140) }, // the whole centre it stands in
    { id: 3, ring: box(34, 16, 9, 2) }, // one of the two points of its top, recorded as a part
    { id: 4, ring: box(120, 0, 15, 15) }, // a building next door
    { id: undefined, ring: box(0, 0, 10, 10) },
    { id: 5, ring: box(0, 0, 10, 10).slice(0, 3) },
  ];
  assert.deepEqual([...replacedByLandmarks(outlines)].sort(), [1, 3]);
  assert.equal(replacedByLandmarks([]).size, 0);
  // The TV tower stands on open ground: nothing is cleared for it. It and the water tower bring their own shadow.
  assert.equal(landmark('tv-tower').clear, 0);
  const shades = landmarkShades();
  // (Between those two and the bridge's masts come the shades of Boulevard World: nine, three of them the pyramids';
  // and those of the models there that carry a picture: the pagoda, three halls, two gate towers, two churches,
  // and the houses of the Greek village.)
  // (And after Boulevard World's, those of the financial district's buildings whose height the map does not know,
  // and those of the famous buildings that are not towers.)
  const district = KAFD_PARTS.filter((one) => one.shade).length + FAMOUS.filter((one) => one.shade).length;
  assert.equal(shades.length, 4 + 9 + district + PROPS.length);
  assert.deepEqual(shades.slice(0, 2).map((shade) => [shade.height, shade.base, shade.polygons.length, shade.polygons[0][0].length]), [[150, 0, 1, 13], [58, 0, 1, 13]]);
  assert.deepEqual(shades.slice(2, 11).map((shade) => Math.round(shade.height)), [34, 100, 7, 13, 15, 22, 10, 12, 28]);
  // So do the two masts of the Wadi Laban Bridge, which stand 405 m apart along its deck.
  const bridge = STAYED_BRIDGES[0];
  assert.deepEqual([bridge.id, bridge.masts, bridge.masts[1] - bridge.masts[0]], ['wadi-laban', [-202.5, 202.5], 405]);
  assert.deepEqual(shades.slice(11 + district, 19 + district).map((shade) => shade.height), [25, 11, 13, 6.5, 11, 11, 9, 7]);
  const masts = shades.slice(-2).map((shade) => {
    const ring = shade.polygons[0][0];
    const middle = [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2];
    return { height: shade.height, at: along(bridge, from(bridge, middle)) };
  });
  assert.deepEqual(masts.map((mast) => mast.height), [96, 96]);
  assert.ok(near(masts[0].at[0], -202.5, 0.05) && near(masts[1].at[0], 202.5, 0.05) && near(masts[0].at[1], 0, 0.05) && near(masts[1].at[1], 0, 0.05), JSON.stringify(masts));
});

test('the KAFD station: a long white shell with rippling sides under a rolling roof', () => {
  // 210 m long and some 40 m wide in the middle, narrower towards its rounded ends.
  const middle = cut('kafd-station', 10)[0];
  assert.ok(near(middle.to - middle.from, 210, 0.5) && middle.wide > 40 && middle.wide < 46, JSON.stringify(middle));
  // Its sides are not straight: the outline at one level differs from the one above it.
  const outline = (z) => slabsOf('kafd-station').find(({ properties }) => properties.b <= z && z < properties.t).geometry.coordinates[0];
  assert.notDeepEqual(outline(6), outline(9));
  // The roof rolls: higher up it is left standing in separate waves, fewer and smaller the higher the level.
  const waves = [26, 29, 32].map((z) => cut('kafd-station', z));
  assert.ok(waves[0].length >= 1 && waves[1].length >= 2 && waves[2].length >= 1, waves.map((level) => level.length).join(' '));
  const covered = (level) => level.reduce((sum, slab) => sum + slab.to - slab.from, 0);
  assert.ok(covered(waves[0]) > covered(waves[1]) && covered(waves[1]) > covered(waves[2]), waves.map(covered).join(' '));
  assert.equal(cut('kafd-station', 2)[0].paint, '#8fa7b8', 'glass at the ground');
});

test('the flat roofs among the landmarks\' models are laid like any other roof', () => {
  const roofs = landmarkRoofs();
  assert.ok(roofs.length >= 1, String(roofs.length));
  for (const roof of roofs) {
    // Each says where it lies, in what colour, and that it is laid with slabs: not sheet, as a store's roof would be.
    assert.ok(roof.replaced && roof.roofTop > 0 && roof.roofTop === roof.height && roof.base === 0);
    assert.match(roof.roofColour, /^#[0-9a-f]{6}$/i);
    assert.equal(roofingOf(roof), 'slabs');
    assert.ok(roof.polygons.length === 1 && roof.polygons[0][0].length >= 4);
  }
  // The wings of the mall at the foot of Kingdom Centre are among them, low and wide.
  const centre = LANDMARKS.find((one) => one.id === 'kingdom-centre');
  const near = roofs.filter((roof) => Math.hypot(...from(centre, roof.polygons[0][0][0])) < 250);
  assert.ok(near.length >= 1 && near.every((roof) => roof.roofTop < 40), JSON.stringify(near.map((roof) => roof.roofTop)));
  // The roof layer takes them as they are.
  const mesh = new RoofMesh();
  assert.equal(roofDecks(mesh, roofs, { lng: centre.at[0], lat: centre.at[1] }, { lift: 0.3 }), roofs.length);
  assert.ok(mesh.count >= roofs.length * 3);
});
