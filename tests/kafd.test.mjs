import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KAFD_AT, KAFD_OUTLINES } from '../js/kafd-data.js';
import { KAFD_BUILDINGS, KAFD_PARTS, crystal, kafdPlace, onKafd, thinned } from '../js/kafd.js';
import { LANDMARKS, landmarkBeacons, landmarkModels, landmarkShades, replacedByLandmarks } from '../js/landmarks.js';
import { Model, ModelMesh } from '../js/models.js';
import { facesOf } from './model-faces.mjs';

const METERS = 111320;
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;
const squareMeters = (ring) => ring.reduce((sum, [x0, y0], i) => sum + x0 * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y0, 0) / 2;
const building = (n) => KAFD_BUILDINGS.find((one) => one.n === n);
const part = (n) => KAFD_PARTS.find((one) => one.id === `kafd-${n}`);
/** A part of the district built about its own middle: its triangles. */
const built = (n) => {
  const mesh = new ModelMesh();
  const made = part(n).model(new Model(mesh));
  return { faces: facesOf(mesh), made };
};
const topOf = (faces) => Math.max(...faces.flatMap((face) => face.corners.map((corner) => corner[2])));

test('the district\'s buildings: each an outline of its own, anticlockwise about its middle, with a height', () => {
  assert.ok(near(KAFD_AT[0], 46.64, 1e-9) && near(KAFD_AT[1], 24.7625, 1e-9));
  assert.equal(KAFD_BUILDINGS.length, KAFD_OUTLINES.length);
  assert.equal(KAFD_BUILDINGS.length, 74);
  assert.equal(new Set(KAFD_BUILDINGS.map((one) => one.n)).size, 74, 'each has a number of its own');
  for (const one of KAFD_BUILDINGS) {
    assert.ok(one.ring.length >= 3, String(one.n));
    const area = squareMeters(one.ring);
    assert.ok(area > 250 && area < 10000, `${one.n}: ${area.toFixed(0)} m2, anticlockwise`);
    // (Measured from its own middle: the middle of its corners is no further off than a part of its width.)
    const reach = Math.max(...one.ring.map((corner) => Math.hypot(...corner)));
    const middle = one.ring.reduce((sum, corner) => [sum[0] + corner[0] / one.ring.length, sum[1] + corner[1] / one.ring.length], [0, 0]);
    assert.ok(Math.hypot(...middle) < reach * 0.45, String(one.n));
    assert.ok(one.height >= 10 && one.height <= 304, `${one.n}: ${one.height} m`);
    // The district is a drop-shaped piece of ground inside its ring road, 1.4 km from south to north.
    assert.ok(one.at[0] > -360 && one.at[0] < 470 && one.at[1] > -400 && one.at[1] < 1040, String(one.n));
  }
  // Not quite half of the heights are on record; the rest were read off the photo, to the nearest metre or five.
  assert.equal(KAFD_BUILDINGS.filter((one) => one.known).length, 34);
  assert.deepEqual(KAFD_BUILDINGS.filter((one) => one.height > 180).map((one) => [one.n, Math.round(one.height)]), [[2, 304], [3, 264], [4, 231], [5, 221], [6, 200], [60, 182]]);
  // Neither the PIF Tower nor the metro station is among them: those are landmarks of their own.
  for (const id of ['pif-tower', 'kafd-station']) {
    const own = LANDMARKS.find((one) => one.id === id);
    assert.equal(onKafd(own.at[0], own.at[1]), false, id);
  }
});

test('thinned takes the small corners out of an outline, and leaves a plain one alone', () => {
  const square = [[0, 0], [40, 0], [40, 40], [0, 40]];
  assert.deepEqual(thinned(square, 2.5), square);
  // A kink of a metre in one wall goes; a corner that stands five metres out stays.
  assert.deepEqual(thinned([[0, 0], [20, -1], [40, 0], [40, 40], [0, 40]], 2.5), square);
  assert.equal(thinned([[0, 0], [20, -5], [40, 0], [40, 40], [0, 40]], 2.5).length, 5);
  // Never fewer than four are left, and the outline given is not changed.
  const round = Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * Math.PI * 2) * 20, Math.sin((i / 24) * Math.PI * 2) * 20]);
  const copy = JSON.stringify(round);
  assert.equal(thinned(round, 50).length, 4);
  assert.equal(JSON.stringify(round), copy);
});

test('every building of the district is a landmark of the map, standing on its own outline', () => {
  const [ground, ...parts] = KAFD_PARTS;
  assert.deepEqual([ground.id, ground.height, ground.clear, ground.model], ['kafd', 0, 0, undefined]);
  assert.equal(ground.covers, onKafd);
  // One to each building, but that the World Trade Center's two shafts are one landmark.
  assert.equal(parts.length, 73);
  assert.ok(parts.every((one) => /^kafd-\d+$/.test(one.id) && typeof one.model === 'function' && one.clear === 0));
  assert.equal(part(5), undefined);
  assert.deepEqual([part(2).name, part(46).name], ['KAFD World Trade Center', 'KAFD Grand Mosque']);
  // On the map each stands at its middle, and the towers are built for any view: the rest only for one near them.
  for (const one of parts) {
    const own = LANDMARKS.find((landmark) => landmark.id === one.id);
    assert.deepEqual(own.at, kafdPlace(one.at));
    assert.equal(own.bearing, 0);
    // (The mosque counts as low, for all its minarets.)
    assert.equal(one.within, one.height < 60 || one.id === 'kafd-46' ? 6000 : undefined, one.id);
  }
  assert.equal(parts.filter((one) => !one.within).length, 39);
  const mesh = new ModelMesh();
  // (With them, the towers of the city that are true models: those are built for a view from anywhere.)
  const city = LANDMARKS.filter((one) => one.model && !one.within && !/^kafd-\d/.test(one.id)).length;
  // (And the district's metro station, which is low: it is built for a view near it, as its low buildings are.)
  assert.equal(LANDMARKS.find((one) => one.id === 'kafd-station').within, 6000);
  assert.equal(landmarkModels(mesh, { lng: KAFD_AT[0], lat: KAFD_AT[1] }), city + 73 + 1);
  // (The metro station, with its two rows of lattice right round it, is some twenty-five thousand of them;
  // Al Majdoul Tower, with a fin, a row of lamps and four spines at every floor, some twenty thousand.)
  assert.ok(mesh.count > 15000 && mesh.count < 100000, `${mesh.count} corners`);
  for (let i = 0; i < mesh.count * 3; i += 1) assert.ok(Number.isFinite(mesh.positions[i]));

  // The map's own block under each of them is left out: the one whose middle is the building's, and
  // anything small that stands inside its outline; not the block next door.
  const box = ([east, north], half) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([x, y]) => kafdPlace([east + x * half, north + y * half]));
  const tower = building(3);
  const outlines = [
    { id: 1, ring: [...tower.ring, tower.ring[0]].map(([east, north]) => kafdPlace([tower.at[0] + east, tower.at[1] + north])) },
    { id: 2, ring: box([tower.at[0] + 12, tower.at[1] - 8], 4) }, // a part of it, recorded apart
    { id: 3, ring: box([tower.at[0] + 70, tower.at[1] - 60], 10) }, // across the street
    { id: 4, ring: box([-600, 300], 10) }, // outside the district
  ];
  assert.deepEqual([...replacedByLandmarks(outlines)].sort(), [1, 2]);
  for (const one of KAFD_BUILDINGS) assert.ok(onKafd(...kafdPlace(one.at)), String(one.n));

  // A building whose height the map does not know throws its shadow from a round of its own size.
  const unknown = KAFD_BUILDINGS.filter((one) => !one.known && one.height >= 20);
  assert.equal(parts.filter((one) => one.shade).length, unknown.length);
  for (const one of unknown) {
    const { shade } = part(one.n);
    assert.equal(shade.height, one.height);
    assert.ok(near(Math.PI * shade.radius ** 2, squareMeters(one.ring) * 0.85 ** 2, 1), String(one.n));
  }
  assert.ok(parts.filter((one) => building(Number(one.id.slice(5))).known).every((one) => !one.shade));
  assert.ok(landmarkShades().some((shade) => shade.height === 115), 'the glass tower by the ring road, 115 m by the photo');
});

test('a crystal: glass is folded along slanting lines and cut off aslant, a pierced skin stands straight', () => {
  const square = { n: 1, at: [0, 0], height: 120, known: true, ring: [[-20, -20], [20, -20], [20, 20], [-20, 20]] };
  const mesh = new ModelMesh();
  const made = crystal(new Model(mesh), square, { skin: 'dark', high: 0, drop: 12 });
  const faces = facesOf(mesh);
  // Two tiers of folds (one to some 55 m): four walls of two triangles each to a tier, and the roof.
  // (The lowest of them are cut where the hall at the building's foot ends.)
  const walls = faces.filter((face) => face.kind === 'glass' && Math.abs(face.normal[2]) < 0.5 && face.lit < 0.99);
  assert.ok(walls.length >= 16, String(walls.length));
  // It stands on the ground, and its roof rises to the north: 120 m there, 12 m lower to the south.
  assert.equal(Math.min(...faces.flatMap((face) => face.corners.map((corner) => corner[2]))), 0);
  assert.ok(near(topOf(faces), 120, 1e-3));
  const roof = faces.filter((face) => face.kind === 'plain' && face.normal[2] > 0.9);
  assert.ok(roof.length >= 2 && roof.every((face) => face.open));
  const rim = roof.flatMap((face) => face.corners);
  assert.ok(rim.every(([, north, up]) => near(up, 120 - 12 * (1 - (north + 20) / 40), 1e-3)), JSON.stringify(rim));
  // Half-way up the corners stand by turns out and in, by a twenty-fifth: so no wall of a tier is flat,
  // and each is folded along the line from the corner that stands out below to the one that stands out above.
  const waist = faces.flatMap((face) => face.corners).filter((corner) => near(corner[2], 54, 1e-3)).map(([east, north]) => Math.hypot(east, north) / Math.hypot(20, 20));
  assert.ok(waist.some((by) => near(by, 1.04, 1e-3)) && waist.some((by) => near(by, 0.96, 1e-3)) && waist.every((by) => near(by, 1.04, 1e-3) || near(by, 0.96, 1e-3)));
  // The folds and the corners are lined, in broad bands of metal, but not the levels between two tiers:
  // the folds run on across them. (So one edge of every triangle that spans a whole tier has no line.)
  assert.ok(walls.every((face) => face.ridge === 1 && face.bold && face.louvres));
  const spanning = walls.filter((face) => [0, 54, 108].some((z) => face.corners.some((corner) => near(corner[2], z, 1e-3))) && face.corners.some((corner) => near(corner[2], 54, 1e-3) || near(corner[2], 108, 1e-3)) && Math.min(...face.corners.map((corner) => corner[2])) >= 9 - 1e-3);
  assert.ok(spanning.length >= 8 && spanning.every((face) => [0, 1, 2].filter((e) => face.edges.every((corner) => corner[e] >= 1000)).length === 1), String(spanning.length));
  // At its foot a hall of clear glass with the lamps on, two storeys.
  const hall = faces.filter((face) => face.kind === 'glass' && face.lit > 0.99);
  assert.ok(hall.length >= 8 && hall.every((face) => Math.max(...face.corners.map((corner) => corner[2])) <= 9 + 1e-3));
  // A red lamp on its highest corner; and, its roof being more than 45 m from corner to corner, one on the corner across from it.
  assert.equal(made.beacons.length, 2);
  assert.ok(made.beacons[0][1] > 15 && near(made.beacons[0][2], 120.6, 1e-3) && made.beacons[1][1] < -15 && near(made.beacons[1][2], 108.6, 1e-3));

  // Stone with windows in rows: straight walls, a flat roof at its height, nothing folded. (And, under 28 m, no hall.)
  mesh.clear();
  crystal(new Model(mesh), { ...square, height: 24 }, { skin: 'stone' });
  const stone = facesOf(mesh);
  const skin = stone.filter((face) => face.kind === 'pierced');
  assert.equal(skin.length, 8);
  assert.ok(skin.every((face) => near(face.normal[2], 0, 1e-6) && face.floors === 1 && near(face.fins, 0.35, 0.01) && face.bay === 3 && face.storey === 4));
  assert.ok(stone.filter((face) => face.kind === 'plain').every((face) => face.corners.every((corner) => near(corner[2], 24, 1e-3))));
  // A crown of facets up to a point, and a mast on it up to the height told.
  mesh.clear();
  const crowned = crystal(new Model(mesh), { ...square, height: 100 }, { skin: 'dark', top: 'peak', rise: 15, spire: 20 });
  const crown = facesOf(mesh);
  assert.ok(near(topOf(crown), 100, 1e-3));
  const facets = crown.filter((face) => face.kind === 'glass' && face.open);
  assert.equal(facets.length, 4);
  assert.ok(facets.every((face) => face.corners.some((corner) => near(Math.hypot(corner[0], corner[1]), 0, 1e-6) && near(corner[2], 80, 1e-3)) && face.normal[2] > 0.3));
  assert.deepEqual(crowned.beacons, [[0, 0, 100.6]]);
});

test('the skins of the district: dark and blue glass, pale panels with diamond windows, stone', () => {
  const skinOf = (n) => {
    const walls = built(n).faces.filter((face) => Math.abs(face.normal[2]) < 0.6 && face.lit < 0.99 && Math.max(...face.corners.map((corner) => corner[2])) > 12);
    return walls.sort((a, b) => walls.filter((face) => face.colour === b.colour).length - walls.filter((face) => face.colour === a.colour).length)[0];
  };
  // Dark blue-grey glass under louvres, its folds broad bands of metal; blue glass that mirrors the sky;
  // glass nearly white.
  assert.deepEqual([skinOf(7).kind, skinOf(7).colour, skinOf(7).ridge, skinOf(7).louvres, skinOf(7).bold], ['glass', '#26343f', 1, true, true]);
  assert.ok(near(skinOf(7).fins, 0, 0.01));
  assert.ok(skinOf(12).kind === 'glass' && near(skinOf(12).mirror, 0.7, 0.01));
  assert.ok(skinOf(6).kind === 'glass' && near(skinOf(6).mirror, 0.8, 0.01));
  // White panels with diamond windows (floors: 0 says diamonds); a mesh, wide open; stone, upright windows; bands right round.
  assert.deepEqual([skinOf(75).kind, skinOf(75).colour, skinOf(75).floors], ['pierced', '#ece9e1', 0]);
  assert.ok(near(skinOf(75).fins, 0.45, 0.01) && near(skinOf(38).fins, 0.95, 0.01) && skinOf(38).floors === 0);
  assert.deepEqual([skinOf(13).kind, skinOf(13).colour, skinOf(13).floors], ['pierced', '#cdbb9b', 1]);
  assert.ok(near(skinOf(15).fins, 0.7, 0.01) && skinOf(15).floors === 1);
  // Silver studs: the bank tower with the spire. Copper fins over dark glass: the low blocks by the station.
  assert.ok(built(4).faces.filter((face) => face.kind === 'studs').every((face) => face.colour === '#a9b8c3'));
  assert.ok(built(4).faces.filter((face) => face.kind === 'studs').length >= 8);
  assert.deepEqual([skinOf(25).kind, skinOf(25).colour, skinOf(25).ribs], ['glass', '#a0613f', true]);
  // Every building is as tall as told, stands on the ground, and keeps to its outline (a fold stands a little out).
  for (const one of KAFD_PARTS.slice(1)) {
    const n = Number(one.id.slice(5));
    const faces = built(n).faces;
    assert.ok(faces.length >= 10, `${one.id}: ${faces.length} triangles`);
    const corners = faces.flatMap((face) => face.corners);
    assert.equal(Math.min(...corners.map((corner) => corner[2])), 0, one.id);
    assert.ok(near(Math.max(...corners.map((corner) => corner[2])), one.height, n === 90 ? 2.1 : 0.11), `${one.id}: ${Math.max(...corners.map((corner) => corner[2]))} m for ${one.height} m`);
    const reach = Math.max(...building(n).ring.map((corner) => Math.hypot(...corner)));
    // (The crown and the roof of the bank tower reach out past its walls.)
    assert.ok(Math.max(...corners.map(([east, north]) => Math.hypot(east, north))) < (n === 2 ? 75 : n === 46 ? reach + 30 : n === 4 ? reach * 1.2 + 4 : reach * 1.08 + 3), one.id);
    for (const face of faces) {
      assert.ok(near(Math.hypot(...face.normal), 1, 1e-4), one.id);
      assert.ok(['plain', 'glass', 'pierced', 'studs'].includes(face.kind) && /^#[0-9a-f]{6}$/.test(face.colour), one.id);
      if (face.kind !== 'plain') assert.ok(face.storey >= 2 && face.storey < 7 && face.bay >= 1.5 && face.bay <= 5.5, `${one.id}: ${face.storey} by ${face.bay}`);
    }
    // Something of each shows by night.
    assert.ok(faces.some((face) => face.glow > 0 || face.lit > 0), one.id);
  }
});

test('the World Trade Center: two shafts in a lace of white panels, 304 m and 221 m, with a seam of ribbed glass between', () => {
  const { faces, made } = built(2);
  assert.ok(near(topOf(faces), 304, 0.01));
  // The taller shaft stands at the landmark's middle; the shorter some thirty metres south of it.
  const [tall, short] = [building(2), building(5)];
  const off = [short.at[0] - tall.at[0], short.at[1] - tall.at[1]];
  assert.ok(near(Math.hypot(...off), 32.8, 0.5) && off[1] < -30);
  // (White panels pierced with diamonds: floors 0 says diamonds.)
  const pale = faces.filter((face) => face.colour === '#efece5' && Math.abs(face.normal[2]) < 0.5);
  assert.ok(pale.length > 60 && pale.every((face) => face.kind === 'pierced' && face.floors === 0 && near(face.fins, 0.38, 0.01)), String(pale.length));
  // (The taller shaft's walls reach 12 m south of its middle at most; the shorter one's begin beyond that.)
  const highest = (shaft) => Math.max(...shaft.flatMap((face) => face.corners.map((corner) => corner[2])));
  const [north, south] = [pale.filter((face) => face.corners.every((corner) => corner[1] > -13.5)), pale.filter((face) => face.corners.every((corner) => corner[1] < -13.5))];
  assert.equal(north.length + south.length, pale.length);
  assert.ok(near(highest(north), 304, 0.01) && near(highest(south), 221.1, 0.01), `${highest(north)} ${highest(south)}`);
  // The seam: dark glass behind upright fins, lit in every room, from the ground to the shorter shaft's shoulder.
  const seam = faces.filter((face) => face.colour === '#4c545b');
  assert.equal(seam.length, 4);
  assert.ok(seam.every((face) => face.kind === 'glass' && face.ribs && face.lit === 1 && near(face.glow, 0.5, 0.003)));
  assert.ok(near(Math.max(...seam.flatMap((face) => face.corners.map((corner) => corner[2]))), 221.1 * 0.86, 0.01));
  assert.ok(seam.flatMap((face) => face.corners).every(([, north]) => north < -3 && north > -22), 'between the two');
  // A red lamp on the top of each (and one on the far corner of the shorter one's long roof).
  assert.equal(made.beacons.length, 3);
  assert.deepEqual(made.beacons.map((lamp) => Math.round(lamp[2] * 10) / 10).sort((a, b) => b - a).slice(0, 2), [304.6, 221.7]);
});

test('the Grand Mosque: petals of pale stone under a roof of facets, and two minarets of 60 m', () => {
  const { faces } = built(46);
  assert.ok(faces.every((face) => face.kind === 'plain'), 'stone, with hardly a window');
  // The hall itself: some 20 m, in facets that lean.
  const hall = faces.filter((face) => face.colour !== '#e6dcc6');
  assert.ok(near(topOf(hall), 20, 0.01));
  assert.equal(building(46).height, 20);
  assert.ok(hall.filter((face) => Math.abs(face.normal[2]) > 0.05 && Math.abs(face.normal[2]) < 0.95).length > 30, 'few of its faces stand upright or lie flat');
  // The minarets: square, slender, drawing in to a point at 60 m; they stand apart from the hall, north-east of it.
  const shafts = faces.filter((face) => !hall.includes(face));
  assert.equal(shafts.length, 2 * 3 * 4 * 2);
  assert.ok(near(topOf(shafts), 60, 0.01));
  for (const [east, north] of [[34, 25], [50, 17]]) {
    const own = shafts.filter((face) => face.corners.every((corner) => Math.hypot(corner[0] - east, corner[1] - north) < 3));
    assert.equal(own.length, 24);
    assert.ok(near(topOf(own), 60, 0.01));
    const width = (from, to) => Math.max(...own.flatMap((face) => face.corners).filter((corner) => corner[2] >= from && corner[2] <= to).map((corner) => Math.hypot(corner[0] - east, corner[1] - north)));
    assert.ok(width(0, 1) > width(40, 50) && width(40, 50) > width(59, 61));
    // (Outside the hall: no corner of its outline is within eight metres.)
    assert.ok(building(46).ring.every((corner) => Math.hypot(corner[0] - east, corner[1] - north) > 8));
  }
  assert.equal(part(46).height, 60);
  assert.ok(shafts.every((face) => face.glow > 0.5), 'lit from the foot by night');
});

test('a red lamp stands on the top of every tower of the district', () => {
  const tops = landmarkBeacons();
  assert.equal(landmarkBeacons(), tops, 'worked out once: every model is built to ask it');
  for (const one of KAFD_PARTS.slice(1)) {
    const n = Number(one.id.slice(5));
    const own = LANDMARKS.find((landmark) => landmark.id === one.id);
    const squeeze = Math.cos((own.at[1] * Math.PI) / 180) * METERS;
    const reach = Math.max(...building(n).ring.map((corner) => Math.hypot(...corner)));
    const made = built(n).made.beacons;
    if (one.height < 60 || n === 46) continue;
    assert.ok(made.length >= 1 && made.length <= 3, one.id);
    // (Each is on the map where its model put it.)
    for (const [east, north, up] of made) {
      assert.ok(Math.hypot(east, north) < (n === 2 ? 60 : reach) && up > one.height * 0.6 && up <= one.height + 0.61, `${one.id}: ${[east, north, up]}`);
      assert.ok(tops.some(([lng, lat, height]) => near((lng - own.at[0]) * squeeze, east, 0.01) && near((lat - own.at[1]) * METERS, north, 0.01) && near(height, up, 1e-6)), one.id);
    }
    assert.ok(made.some((lamp) => near(lamp[2], one.height + 0.6, 0.01)), `${one.id}: one on its very top`);
  }
});

test('inKafd says what lies inside the district\'s ring road: a footbridge there is a skywalk', async () => {
  const { inKafd } = await import('../js/kafd.js');
  // Every building of the district, the PIF Tower and the metro station; not the car park across King Fahd Road, nor Al Aqiq to the west.
  for (const one of KAFD_BUILDINGS) assert.ok(inKafd(...kafdPlace(one.at)), String(one.n));
  for (const id of ['pif-tower', 'kafd-station']) assert.ok(inKafd(...LANDMARKS.find((one) => one.id === id).at), id);
  assert.equal(inKafd(...kafdPlace([700, 300])), false);
  assert.equal(inKafd(...kafdPlace([-600, 0])), false);
  assert.equal(inKafd(...kafdPlace([0, -600])), false);
  assert.equal(inKafd(46.6744, 24.7113), false, 'Kingdom Centre');
});
