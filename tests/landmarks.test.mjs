import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LANDMARKS, STAYED_BRIDGES, landmarkBeacons, landmarkModels, landmarkRoofs, landmarkShades, landmarkSlabs, replacedByLandmarks } from '../js/landmarks.js';
import { ModelMesh, cutMesh } from '../js/models.js';
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
  // (Only its own: the others stand kilometres off.)
  return facesOf(mesh).filter((face) => face.corners.every(([east, north]) => Math.hypot(east, north) < 400));
}

test('every landmark is a stack of slabs, or a true model, standing where the building stands', () => {
  const data = landmarkSlabs();
  assert.equal(data.type, 'FeatureCollection');
  assert.equal(landmarkSlabs(), data, 'made once');
  assert.deepEqual(LANDMARKS.map((one) => one.id), ['kingdom-centre', 'al-faisaliah', 'pif-tower', 'burj-rafal', 'al-majdoul', 'tv-tower', 'water-tower', 'kafd-station']);
  assert.deepEqual(LANDMARKS.filter((one) => one.model).map((one) => one.id), ['pif-tower']);
  for (const one of LANDMARKS) {
    assert.ok(one.at[0] > 46.4 && one.at[0] < 46.9 && one.at[1] > 24.5 && one.at[1] < 24.9, 'in Riyadh');
    if (one.model) {
      // A model: no slabs. It stands on the ground, is as tall as the real one, and keeps to its plot.
      assert.equal(slabsOf(one.id).length, 0, one.id);
      assert.equal(one.build, undefined);
      const faces = modelOf(one.id);
      assert.ok(faces.length > 100, `${one.id}: ${faces.length} triangles`);
      const corners = faces.flatMap((face) => face.corners);
      assert.equal(Math.min(...corners.map((corner) => corner[2])), 0, one.id);
      const top = Math.max(...corners.map((corner) => corner[2]));
      assert.ok(top >= one.height - 0.01 && top <= one.height + 25, `${one.id}: ${top} m for ${one.height} m`);
      assert.ok(Math.max(...corners.map(([east, north]) => Math.hypot(east, north))) < 45, one.id);
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
  const mesh = new ModelMesh();
  assert.equal(landmarkModels(mesh, { lng: 46.67, lat: 24.7 }), 1);
  const corners = mesh.count;
  assert.equal(landmarkModels(mesh, { lng: 46.67, lat: 24.7 }), 1);
  assert.equal(mesh.count, corners);
  // (The PIF Tower stands 2.9 km west and 7.1 km north of there.)
  const middle = [0, 1].map((k) => facesOf(mesh).flatMap((face) => face.corners).reduce((sum, corner, _, all) => sum + corner[k] / all.length, 0));
  assert.ok(near(middle[0], -2880, 25) && near(middle[1], 7090, 25), JSON.stringify(middle));
  assert.ok(JSON.stringify(data).length < 700000, 'small enough to hand to the map in one piece');
});

test('Kingdom Centre: a lens in plan, parted at the top by its arch and joined by the sky bridge', () => {
  // Below the arch one slab at every level, 79 m long and 44 m wide, in the tower's own silver-blue.
  for (const z of [20, 100, 180]) {
    const [tower] = cut('kingdom-centre', z);
    assert.equal(cut('kingdom-centre', z).length, 1);
    assert.ok(near(tower.to - tower.from, 79.2, 0.5) && near(tower.wide, 44.4, 0.6), JSON.stringify(tower));
  }
  // (At the ground the podium is there too: the shopping centre, four storeys.)
  assert.deepEqual(cut('kingdom-centre', 8).map((slab) => slab.paint).sort(), ['#a7bccd', '#e3ddd2']);
  assert.equal(cut('kingdom-centre', 17).length, 1);
  // Above it two legs, and the gap between them widens with height the way a parabola does.
  // (Along the edge of the gap each leg carries the band of light that shows the arch by night.)
  const glass = (slab) => slab.paint === '#a7bccd' || slab.paint === '#b8cad8';
  const gapAt = (z) => {
    const legs = cut('kingdom-centre', z).filter(glass);
    assert.equal(legs.length, 2, `two legs at ${z} m`);
    assert.ok(near(legs[0].from, -39.6, 0.5) && near(legs[1].to, 39.6, 0.5), 'the legs keep the tower\'s outer line');
    return legs[1].from - legs[0].to;
  };
  const gaps = [200, 230, 260, 285].map(gapAt);
  assert.ok(gaps[0] > 15 && gaps[0] < gaps[1] && gaps[1] < gaps[2] && gaps[2] < gaps[3] && gaps[3] > 55 && gaps[3] < 66, String(gaps));
  assert.ok(gaps[1] - gaps[0] > gaps[3] - gaps[2], 'it opens fast at the foot of the arch and slowly at the top');
  // The sky bridge spans the gap just under the top.
  const top = cut('kingdom-centre', 295);
  assert.equal(top.length, 3);
  assert.ok(top[1].to - top[1].from > gapAt(289) && top[1].wide < 14, JSON.stringify(top[1]));
  assert.equal(cut('kingdom-centre', 300.5).length, 2, 'the two points stand a little above it');
  // The arch's light: a thin band on each face of each leg where it meets the gap, a pale trim by day,
  // and by night brighter than anything else on the tower but the bridge.
  for (const z of [200, 230, 260, 285]) {
    const all = cut('kingdom-centre', z);
    const legs = all.filter(glass);
    const bands = all.filter((slab) => !glass(slab));
    assert.equal(bands.length, 4, `a band on each face of each leg at ${z} m`);
    for (const band of bands) {
      assert.ok(band.to - band.from <= 2.01 && band.wide <= 1.81 && band.night === '#9fe9ff', JSON.stringify(band));
      assert.ok(Math.min(...legs.map((leg) => Math.min(Math.abs(leg.to - band.to), Math.abs(leg.from - band.from)))) < 1.5, 'at the inner edge of a leg');
    }
    for (const leg of legs) assert.ok(/^#[12][0-9a-f]{5}$/.test(leg.night), `the glass is dark by night: ${leg.night}`);
  }
  assert.equal(top[1].night, '#eef8ff', 'the bridge is lit');
});

test('by night the landmarks are lit, each in its own way', () => {
  const nights = (id) => new Map(slabsOf(id).map((feature) => [feature.properties.c, feature.properties.n]));
  const bright = (hex) => Math.max(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  // Every landmark has something that shows by night, and every night colour belongs to a slab that is there.
  for (const one of LANDMARKS) {
    if (one.model) {
      // (A model: faces that give light of their own, or have rooms with their lamps on.)
      assert.ok(modelOf(one.id).filter((face) => face.glow > 0 || face.lit > 0).length > 50, one.id);
      continue;
    }
    const lit = slabsOf(one.id).filter((feature) => feature.properties.n);
    assert.ok(lit.length > 10, `${one.id}: ${lit.length} lit slabs`);
    const paints = new Set(slabsOf(one.id).map((feature) => feature.properties.c));
    for (const paint of Object.keys(one.nights ?? {})) assert.ok(paints.has(paint), `${one.id}: no slab is painted ${paint}`);
  }
  // Al Faisaliah's golden ball glows; the glass under its sunshades is dark.
  const faisaliah = nights('al-faisaliah');
  assert.ok(bright(faisaliah.get('#d9a23c')) === 255 && bright(faisaliah.get('#56677a')) < 70);
  // The TV tower's lantern is lit like a lamp, and the KAFD station shines through its shell.
  assert.ok(bright(nights('tv-tower').get('#3f566c')) === 255);
  assert.ok(bright(nights('kafd-station').get('#8fa7b8')) === 255 && bright(nights('kafd-station').get('#e6d9bb')) > 230);
});

test('Al Faisaliah: a square that narrows to a point, with its golden globe near the top', () => {
  const widthAt = (z) => cut('al-faisaliah', z).reduce((widest, slab) => Math.max(widest, slab.to - slab.from), 0);
  const widths = [1, 50, 100, 150].map(widthAt);
  assert.ok(near(widths[0], 41.2, 0.6) && widths[1] < widths[0] && widths[2] < widths[1] && widths[3] < widths[2] && widths[3] > 16, String(widths));
  // The floors are banded: pale sunshades and dark glass by turns.
  const paints = new Set([1, 3.5, 5.4, 7.9].flatMap((z) => cut('al-faisaliah', z).map((slab) => slab.paint)));
  assert.deepEqual([...paints].sort(), ['#56677a', '#e4e7e9']);
  // Above the last floor only the four corner beams, and the globe between them.
  const open = cut('al-faisaliah', 201);
  const gold = open.filter((slab) => slab.paint === '#d9a23c' || slab.paint === '#e7b955');
  assert.equal(gold.length, 1);
  assert.ok(near(gold[0].to - gold[0].from, 14.8, 0.4) && near((gold[0].from + gold[0].to) / 2, 0, 0.2), 'a ball 15 m across at its widest, in the middle');
  assert.equal(open.length - gold.length, 4, 'four beams');
  assert.ok(widthAt(193.5) < 8 && widthAt(207) < 14, 'the ball draws in above and below');
  assert.ok(widthAt(262) < 6 && widthAt(270) <= 1, 'and the spire closes it');
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
  const lamps = landmarkBeacons().filter(([lng, lat]) => Math.abs(lng - one.at[0]) < 0.001 && Math.abs(lat - one.at[1]) < 0.001);
  assert.equal(lamps.length, 3);
  assert.ok(near(Math.max(...lamps.map((lamp) => lamp[2])), 385.6, 0.01) && Math.min(...lamps.map((lamp) => lamp[2])) > 381);
  for (const lamp of lamps) {
    const [east, north] = from(one, lamp);
    assert.ok(near(Math.hypot(east, north), 33 * 0.985, 0.2) && apexes.some((degrees) => near(((Math.atan2(east, north) * 180) / Math.PI + 360) % 360, degrees, 0.5)));
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
  assert.equal(shades.length, 4);
  assert.deepEqual(shades.slice(0, 2).map((shade) => [shade.height, shade.base, shade.polygons.length, shade.polygons[0][0].length]), [[150, 0, 1, 13], [58, 0, 1, 13]]);
  // So do the two masts of the Wadi Laban Bridge, which stand 405 m apart along its deck.
  const bridge = STAYED_BRIDGES[0];
  assert.deepEqual([bridge.id, bridge.masts, bridge.masts[1] - bridge.masts[0]], ['wadi-laban', [-202.5, 202.5], 405]);
  const masts = shades.slice(2).map((shade) => {
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
