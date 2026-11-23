import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LANDMARKS, STAYED_BRIDGES, landmarkRoofs, landmarkShades, landmarkSlabs, replacedByLandmarks } from '../js/landmarks.js';
import { RoofMesh, roofDecks, roofingOf } from '../js/roofs.js';

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
      return { from: Math.min(...us), to: Math.max(...us), wide: Math.max(...vs) - Math.min(...vs), paint: feature.properties.c };
    })
    .sort((a, b) => a.from - b.from);
}
const near = (a, b, by) => Math.abs(a - b) <= by;

test('every landmark is a stack of slabs standing where the building stands', () => {
  const data = landmarkSlabs();
  assert.equal(data.type, 'FeatureCollection');
  assert.equal(landmarkSlabs(), data, 'made once');
  assert.deepEqual(LANDMARKS.map((one) => one.id), ['kingdom-centre', 'al-faisaliah', 'pif-tower', 'burj-rafal', 'al-majdoul', 'tv-tower', 'water-tower', 'kafd-station']);
  for (const one of LANDMARKS) {
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
      top = Math.max(top, properties.t);
      lowest = Math.min(lowest, properties.b);
      for (const corner of ring) furthest = Math.max(furthest, Math.hypot(...from(one, corner)));
    }
    // It stands on the ground, is as tall as the real one (a mast may top it), and keeps to its plot.
    assert.equal(lowest, 0, one.id);
    assert.ok(top >= one.height && top <= one.height + 25, `${one.id}: ${top} m for ${one.height} m`);
    assert.ok(furthest < ({ 'kingdom-centre': 180, 'kafd-station': 110 }[one.id] ?? 45), `${one.id}: reaches ${furthest.toFixed(0)} m from its middle`);
    assert.ok(one.at[0] > 46.4 && one.at[0] < 46.9 && one.at[1] > 24.5 && one.at[1] < 24.9, 'in Riyadh');
  }
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
  const gapAt = (z) => {
    const legs = cut('kingdom-centre', z);
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
  // PIF Tower: its corners lean in by turns, so it is narrower at the top than at the foot, and its top is off to one side.
  const foot = cut('pif-tower', 2)[0];
  const head = cut('pif-tower', 380)[0];
  assert.ok(head.to - head.from < (foot.to - foot.from) * 0.5 && Math.abs((head.from + head.to) / 2) > 5, JSON.stringify({ foot, head }));
  // Burj Rafal: one oval all the way up, then two horns.
  assert.equal(cut('burj-rafal', 150).length, 1);
  assert.ok(cut('burj-rafal', 300).length >= 2);
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
