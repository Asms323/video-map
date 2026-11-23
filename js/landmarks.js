// Riyadh's landmarks, modelled by hand.
//
// The map data knows a tower only as an outline and a height, so on its own it
// draws Kingdom Centre as a plain block. The handful of buildings that make
// the skyline are rebuilt here from photographs: each one as a stack of thin
// slabs, the way a model maker stacks sheets of card. A slab is an outline
// with a bottom and a top; stacking outlines that shrink, turn or part gives
// a taper, a twist or an arch.
//
// Where each one stands, which way it is turned and how large its footprint
// is comes from the buildings data (Overture Maps, release 2026-11-18). Its
// height is the published one. The shape between is read off photographs.
//
// Nothing here touches the browser. Measurements are in metres.

const TAU = Math.PI * 2;
const METERS_PER_DEGREE = 111320;

// ── Outlines ──────────────────────────────────────────────────────────────
// An outline is a list of [u, v] corners: u along the building's long axis,
// v to the left of it.

/** A circle of radius r as an outline of n corners, the first one turned by `turn` radians. */
const circle = (r, n = 20, turn = 0) => Array.from({ length: n }, (_, i) => [Math.cos(turn + (i / n) * TAU) * r, Math.sin(turn + (i / n) * TAU) * r]);
/** An ellipse with half-axes a (along) and b (across). */
const oval = (a, b, n = 28) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU) * a, Math.sin((i / n) * TAU) * b]);
/** A rectangle, by its half-sizes and its middle. */
const block = (halfU, halfV, atU = 0, atV = 0) => [[atU - halfU, atV - halfV], [atU + halfU, atV - halfV], [atU + halfU, atV + halfV], [atU - halfU, atV + halfV]];
/** A square with its corners cut off, by its half-size and the size of the cut. */
const cutSquare = (half, cut) => [[half - cut, -half], [half, -half + cut], [half, half - cut], [half - cut, half], [-half + cut, half], [-half, half - cut], [-half, -half + cut], [-half + cut, -half]];
const turned = (outline, degrees) => {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return outline.map(([u, v]) => [u * cos - v * sin, u * sin + v * cos]);
};
const grown = (outline, by, byV = by) => outline.map(([u, v]) => [u * by, v * byV]);
const moved = (outline, du, dv) => outline.map(([u, v]) => [u + du, v + dv]);

/**
 * Stack slabs from one height to another. outlineAt(z) gives the outline for
 * a slab from the height of its middle; paints are used in turn, one per slab.
 */
function stack(slabs, from, to, step, outlineAt, paints, more = {}) {
  let index = 0;
  for (let base = from; base < to - 1e-6; base += step) {
    const top = Math.min(base + step, to);
    const outline = outlineAt((base + top) / 2, index);
    if (outline && outline.length >= 3) slabs.push({ outline, base, top, paint: paints[index % paints.length], ...more });
    index += 1;
  }
}

/** A ball, as discs. */
function ball(slabs, u, v, z, radius, step, paints) {
  stack(slabs, z - radius, z + radius, step, (at) => moved(circle(Math.sqrt(Math.max(radius * radius - (at - z) ** 2, 0.04)), 16), u, v), paints);
}

// ── The towers ────────────────────────────────────────────────────────────

/**
 * Kingdom Centre, 302 m. In plan a lens: two arcs that meet in a point at
 * either end. The top third is cut away in a parabola, point down, which
 * leaves two legs that thin out as they rise, joined at the very top by the
 * sky bridge. Silver-blue glass all over.
 */
function kingdomCentre() {
  const slabs = [];
  const halfLength = 39.6;
  const halfWidth = 22.2;
  const height = 302;
  const archFoot = 186; // where the opening starts
  const bridge = [291, 299];
  const openAtTop = 31.5; // half the width of the opening where the bridge spans it
  const radius = (halfLength ** 2 + halfWidth ** 2) / (2 * halfWidth);
  const thick = (u) => Math.sqrt(Math.max(radius ** 2 - u ** 2, 0)) - (radius - halfWidth);
  // The part of the lens between two places along its length.
  const lens = (from, to, steps = 10) => {
    const near = [];
    const far = [];
    for (let i = 0; i <= steps; i += 1) {
      const u = from + ((to - from) * i) / steps;
      const t = thick(u);
      if (t < 0.05) {
        near.push([u, 0]); // the pointed end: one corner, not two
        continue;
      }
      near.push([u, -t]);
      far.push([u, t]);
    }
    return [...near, ...far.reverse()];
  };
  const glass = ['#a7bccd', '#b8cad8'];
  stack(slabs, 0, archFoot, 4, () => lens(-halfLength, halfLength, 16), glass);
  const opening = (z) => openAtTop * Math.sqrt(Math.min(Math.max((z - archFoot) / (bridge[0] - archFoot), 0), 1));
  for (const side of [1, -1]) {
    stack(slabs, archFoot, height, 4, (z) => {
      const inner = Math.min(opening(z), halfLength - 2.5);
      return side === 1 ? lens(inner, halfLength, 6) : lens(-halfLength, -inner, 6);
    }, glass);
  }
  // The sky bridge: a slim span from leg to leg, not the full depth of the tower.
  slabs.push({ outline: block(openAtTop + 2, 5.5), base: bridge[0], top: bridge[1], paint: '#cdd8e1' });
  // The podium that the tower rises from: the shopping centre and the hotel's wings, four storeys.
  // (Low and wide: its roof is laid and furnished like any other building's.)
  slabs.push({ outline: KINGDOM_PODIUM, base: 0, top: 16, paint: '#e3ddd2', north: true, roof: true });
  return slabs;
}

// The outline of the Kingdom Centre complex, in metres east and north of the tower's middle.
const KINGDOM_PODIUM = [
  [62.8, 125.5], [92.1, 64.8], [97, 63.7], [106.2, 83.8], [121.4, 69.7], [129, 52.3], [129.5, 34.9], [110, 37.7], [107.3, 30.6], [136, -26.4], [141.5, -84.4], [127.4, -71.9],
  [111.6, -79], [23.2, -12.3], [8, -22], [-4.5, -25.8], [-11.5, -135.9], [-25.6, -141.9], [-26.7, -163.1], [-35.4, -153.8], [-52.2, -150.6], [-75, -133.2], [-84.7, -103.9],
  [-89.1, -99.1], [-93.4, -104.5], [-117.3, -75.7], [-131.9, -45.9], [-140.6, -1.9], [-134.1, -1.9], [-133.6, 7.3], [-148.2, 25.2], [-153.1, 47.4], [-146.6, 68.6], [-140.1, 77.8],
  [-140.1, 84.3], [-125.4, 72.4], [-109.7, 78.3], [-21.3, 12.2], [-2.3, 22.5], [3.7, 23.5], [10.2, 138], [23.8, 145.1], [24.8, 164.6],
];

/**
 * Al Faisaliah Tower, 267 m. A square that narrows to a point, held by four
 * corner beams that bow slightly outwards. Thirty office floors show as bands
 * of pale sunshades over dark glass. Above them the beams run on in the open,
 * with the golden glass globe caught between them, and close in a spire.
 */
function faisaliah() {
  const slabs = [];
  const half = 20.6;
  const height = 267;
  const floorsEnd = 176;
  const halfAt = (z) => half * (1 - (z / height) ** 1.3);
  const square = (z, more = 0) => block(halfAt(z) + more, halfAt(z) + more);
  // Each floor: a deep band of sunshades and a strip of glass in its shadow.
  for (let base = 0; base < floorsEnd; base += 4.4) {
    slabs.push({ outline: square(base + 1.5), base, top: base + 3, paint: '#e4e7e9' });
    slabs.push({ outline: square(base + 3.7, -0.5), base: base + 3, top: Math.min(base + 4.4, floorsEnd), paint: '#56677a' });
  }
  // Where the beams are tied together, a heavier band right round.
  for (const z of [44, 88, 132]) slabs.push({ outline: square(z, 0.7), base: z - 1.2, top: z + 1.2, paint: '#f5f5f3' });
  slabs.push({ outline: square(floorsEnd, 0.4), base: floorsEnd, top: floorsEnd + 3, paint: '#f1f2f1' });
  // The four beams in the open, from the last floor to the foot of the spire.
  const spireFoot = 244;
  for (let base = floorsEnd + 3; base < spireFoot; base += 5) {
    const at = halfAt(base + 2.5);
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) slabs.push({ outline: block(1.1, 1.1, su * at, sv * at), base, top: Math.min(base + 5, spireFoot), paint: '#eceeed' });
  }
  ball(slabs, 0, 0, 201, 7.4, 1.6, ['#d9a23c', '#e7b955']);
  // The lantern and the spire.
  stack(slabs, spireFoot, height, 3, (z) => square(z, 0.9), ['#eef0ef', '#dfe3e4']);
  slabs.push({ outline: block(0.5, 0.5), base: height, top: height + 9, paint: '#d9dcdd' });
  return slabs;
}

/**
 * The PIF Tower in the King Abdullah Financial District, 385 m: a dark glass
 * crystal. Its sides are large flat facets that lean in by turns, so the plan
 * changes all the way up, and the top is cut at a slant.
 */
function pifTower() {
  const slabs = [];
  const height = 385;
  // Its outline at the ground, in metres east and north of its middle.
  const foot = [[-26.2, -4], [-28.4, 4.2], [0.9, 30.2], [22.6, 29.6], [28, -1.8], [9.6, -28.4], [-21.3, -22.4]];
  const paints = ['#3d5b58', '#456662', '#3d5b58', '#456662', '#6a8a85'];
  stack(slabs, 0, height, 5, (z) => {
    const up = z / height;
    // Alternate corners lean in more than their neighbours, and all of them a little further near the top.
    const crown = Math.max((up - 0.84) / 0.16, 0);
    return foot.map(([east, north], i) => {
      const lean = 1 - up * (i % 2 === 0 ? 0.5 : 0.16);
      // The slant of the top: everything draws towards the north-east corner.
      const pull = crown * crown * 0.75;
      return [east * lean * (1 - pull) + 14 * pull, north * lean * (1 - pull) + 16 * pull];
    });
  }, paints, { north: true });
  return slabs;
}

/**
 * Burj Rafal, 308 m: a slim tower, oval in plan, in pale blue glass. Its top
 * is notched in the middle, which leaves a rounded horn at either end, each
 * carrying a mast.
 */
function burjRafal() {
  const slabs = [];
  const a = 29.1;
  const b = 18.4;
  const height = 308;
  const shoulder = 284;
  const glass = ['#84b4c9', '#96c2d4'];
  stack(slabs, 0, shoulder, 4, () => oval(a, b, 28), glass);
  // The horns: what is left of the oval beyond a gap that widens to the top.
  const edge = (u) => b * Math.sqrt(Math.max(1 - (u / a) ** 2, 0));
  const horn = (inner, side) => {
    const near = [];
    const far = [];
    for (let i = 0; i <= 5; i += 1) {
      const u = inner + ((a - inner) * i) / 5;
      if (i === 5) near.push([side * u, 0]);
      else {
        near.push([side * u, -edge(u)]);
        far.push([side * u, edge(u)]);
      }
    }
    return [...near, ...far.reverse()];
  };
  for (const side of [1, -1]) {
    stack(slabs, shoulder, height, 4, (z) => horn(4 + ((z - shoulder) / (height - shoulder)) * 17, side), glass);
    slabs.push({ outline: block(0.7, 0.7, side * 24, 0), base: height, top: height + 22, paint: '#dfe5e8' });
  }
  return slabs;
}

/**
 * Al Majdoul Tower, 232 m: a square tower that turns a quarter of a turn on
 * its way up. Every floor is a white band of louvres over dark glass, and
 * the roof slopes up to a point at one corner.
 */
function majdoul() {
  const slabs = [];
  const half = 19.2;
  const height = 232;
  const shoulder = 208;
  const turn = (z) => (z / height) * 90;
  for (let base = 0; base < shoulder; base += 4) {
    slabs.push({ outline: turned(cutSquare(half, 4.5), turn(base + 1.3)), base, top: base + 2.6, paint: '#eef0f1' });
    slabs.push({ outline: turned(cutSquare(half - 0.6, 4.3), turn(base + 3.3)), base: base + 2.6, top: base + 4, paint: '#4f6478' });
  }
  // The sloping roof: the square draws in towards one of its corners.
  stack(slabs, shoulder, height, 3, (z) => {
    const up = (z - shoulder) / (height - shoulder);
    return turned(moved(grown(cutSquare(half, 4.5), 1 - up * 0.82), up * 13, up * 13), turn(z));
  }, ['#eef0f1', '#dfe4e7']);
  return slabs;
}

/**
 * Riyadh TV Tower, 170 m: a sand-coloured shaft on a base of fins, with a
 * faceted glass lantern near the top like a cut stone in its setting.
 */
function tvTower() {
  const slabs = [];
  const stone = ['#d9c9a9', '#d1c09d'];
  const shaftTop = 116;
  const shaft = (z) => 5.6 - (z / shaftTop) * 2.1;
  // Four fins that brace the foot of the shaft.
  for (const degrees of [0, 90]) {
    stack(slabs, 0, 24, 4, (z) => turned(block(13 - z * 0.33, 1.3), degrees), stone);
  }
  stack(slabs, 0, shaftTop, 6, (z) => cutSquare(shaft(z), shaft(z) * 0.4), stone);
  // The lantern: it widens, holds, and draws in again.
  const lantern = [[116, 4], [120, 7.2], [124, 9.6], [133, 9.6], [137, 7.4], [140, 4.6]];
  for (let i = 1; i < lantern.length; i += 1) {
    const [z0, r0] = lantern[i - 1];
    const [z1, r1] = lantern[i];
    const steps = Math.max(Math.round((z1 - z0) / 2), 1);
    for (let k = 0; k < steps; k += 1) {
      const r = r0 + ((r1 - r0) * (k + 0.5)) / steps;
      slabs.push({ outline: circle(r, 12, Math.PI / 12), base: z0 + ((z1 - z0) * k) / steps, top: z0 + ((z1 - z0) * (k + 1)) / steps, paint: i === 3 ? (k % 2 === 0 ? '#3f566c' : '#c9a24c') : '#bfa770' });
    }
  }
  stack(slabs, 140, 150, 5, () => cutSquare(2.6, 1), stone);
  slabs.push({ outline: block(0.7, 0.7), base: 150, top: 170, paint: '#d5d7d8' });
  return slabs;
}

/**
 * Riyadh Water Tower, 61 m: a stem that opens out into a wide bowl, striped
 * from top to bottom, with a flat lid.
 */
function waterTower() {
  const slabs = [];
  const profile = [[0, 9], [6, 6.5], [26, 6], [34, 9], [42, 15], [50, 22.5], [54, 26], [58, 26]];
  const stripes = 16;
  const paints = ['#2d5ea6', '#f0ede2'];
  const radiusAt = (z) => {
    for (let i = 1; i < profile.length; i += 1) {
      if (z <= profile[i][0]) {
        const [z0, r0] = profile[i - 1];
        const [z1, r1] = profile[i];
        return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
      }
    }
    return profile[profile.length - 1][1];
  };
  // Each level is cut like a cake, so the stripes can run up and down.
  for (let base = 0; base < 58; base += 4) {
    const top = Math.min(base + 4, 58);
    const r = radiusAt((base + top) / 2);
    for (let i = 0; i < stripes; i += 1) {
      const from = (i / stripes) * TAU;
      const to = ((i + 1) / stripes) * TAU;
      const middle = (from + to) / 2;
      slabs.push({ outline: [[0, 0], [Math.cos(from) * r, Math.sin(from) * r], [Math.cos(middle) * r, Math.sin(middle) * r], [Math.cos(to) * r, Math.sin(to) * r]], base, top, paint: paints[i % 2] });
    }
  }
  slabs.push({ outline: circle(23, 24), base: 58, top: 61, paint: '#e6e2d6' });
  return slabs;
}

/**
 * The metro station of the King Abdullah Financial District, 210 m long: a
 * white shell whose sides ripple like wind-blown sand, a different ripple at
 * every level, under a roof that rolls in waves from one end to the other.
 * Glass at the ground, and pale gold where the shell is pierced.
 */
function kafdStation() {
  const slabs = [];
  const halfLength = 105;
  const halfWidth = 20.5;
  const eaves = 25; // the viaducts run in through its ends on two levels, the upper one some 20 m up
  // The shell between two places along its length, at a height: rounded at its two ends, rippling along its sides.
  const shell = (from, to, z, inset = 0) => {
    const near = [];
    const far = [];
    const steps = Math.max(Math.round((to - from) / 5), 2);
    for (let i = 0; i <= steps; i += 1) {
      const u = from + ((to - from) * i) / steps;
      const taper = Math.sqrt(Math.max(1 - (Math.abs(u) / halfLength) ** 4, 0));
      const half = Math.max(halfWidth * taper - inset, 0);
      if (half < 0.3) {
        near.push([u, 0]);
        continue;
      }
      near.push([u, -half * (1 + 0.075 * Math.sin(u / 8 + z * 0.5))]);
      far.push([u, half * (1 + 0.075 * Math.sin(u / 8 - z * 0.5 + 2))]);
    }
    return [...near, ...far.reverse()];
  };
  // Glass where people walk in, then the shell in bands of white and pale gold.
  stack(slabs, 0, 4.5, 4.5, (z) => shell(-halfLength + 4, halfLength - 4, z, 1.5), ['#8fa7b8']);
  stack(slabs, 4.5, eaves, 2.05, (z) => shell(-halfLength, halfLength, z), ['#f5f3ee', '#e6d9bb', '#f5f3ee', '#efe9dc', '#f5f3ee', '#e6d9bb', '#f5f3ee', '#efe9dc', '#f5f3ee', '#f5f3ee']);
  // The roof: its height rolls along the building, so each level up covers less of it.
  const roofAt = (u) => eaves + 5 + 4.2 * Math.sin(u / 15 + 0.6) - 3.5 * (Math.abs(u) / halfLength) ** 2;
  for (let base = eaves; base < eaves + 10; base += 1.25) {
    let from = null;
    for (let u = -halfLength; u <= halfLength + 0.1; u += 3) {
      const covered = u <= halfLength && roofAt(u) > base;
      if (covered && from === null) from = u;
      if (!covered && from !== null) {
        if (u - 3 - from >= 6) slabs.push({ outline: shell(from, u - 3, base, (base - eaves) * 0.55), base, top: base + 1.25, paint: Math.round(base / 1.25) % 2 === 0 ? '#f5f3ee' : '#ebe5d6' });
        from = null;
      }
    }
  }
  return slabs;
}

/**
 * The landmarks: where each stands ([lng, lat] of the middle of its
 * footprint), which way its long axis points (degrees clockwise from north),
 * and how to build it. clear: within this many metres of its middle the map's
 * own buildings are taken out, so the model does not stand inside a block.
 * shade: a footprint and height for its shadow, where the map data has none.
 */
export const LANDMARKS = [
  { id: 'kingdom-centre', name: 'Kingdom Centre', at: [46.67441, 24.711346], bearing: 63.4, height: 302, clear: 48, build: kingdomCentre },
  { id: 'al-faisaliah', name: 'Al Faisaliah Tower', at: [46.68501, 24.6902], bearing: 113.8, height: 267, clear: 30, build: faisaliah },
  { id: 'pif-tower', name: 'PIF Tower', at: [46.641519, 24.763678], bearing: 90, height: 385, clear: 34, build: pifTower },
  { id: 'burj-rafal', name: 'Burj Rafal', at: [46.632342, 24.792398], bearing: 81.6, height: 308, clear: 32, build: burjRafal },
  { id: 'al-majdoul', name: 'Al Majdoul Tower', at: [46.659233, 24.739117], bearing: 20, height: 232, clear: 30, build: majdoul },
  { id: 'tv-tower', name: 'Riyadh TV Tower', at: [46.69601, 24.64322], bearing: 0, height: 170, clear: 0, build: tvTower, shade: { radius: 5, height: 150 } },
  { id: 'water-tower', name: 'Riyadh Water Tower', at: [46.712275, 24.645119], bearing: 0, height: 61, clear: 30, build: waterTower, shade: { radius: 12, height: 58 } },
  { id: 'kafd-station', name: 'KAFD Metro Station', at: [46.642994, 24.767531], bearing: 155.8, height: 34, clear: 70, build: kafdStation },
];

/** [lng, lat] of a point given in a landmark's own measure: u along its axis and v to the left, or east and north. */
function place(landmark, u, v, north) {
  const angle = (landmark.bearing * Math.PI) / 180;
  const east = north ? u : u * Math.sin(angle) - v * Math.cos(angle);
  const up = north ? v : u * Math.cos(angle) + v * Math.sin(angle);
  const squeeze = Math.cos((landmark.at[1] * Math.PI) / 180) * METERS_PER_DEGREE;
  return [landmark.at[0] + east / squeeze, landmark.at[1] + up / METERS_PER_DEGREE];
}

let made = null;

/**
 * Every landmark as map data: one feature per slab, with where it starts
 * (b), where it ends (t) and its colour (c), ready for a layer of 3D blocks.
 */
export function landmarkSlabs() {
  if (made) return made;
  const features = [];
  for (const landmark of LANDMARKS) {
    for (const slab of landmark.build()) {
      const ring = slab.outline.map(([u, v]) => place(landmark, u, v, slab.north));
      ring.push(ring[0]);
      features.push({
        type: 'Feature',
        properties: { landmark: landmark.id, b: Math.round(slab.base * 100) / 100, t: Math.round(slab.top * 100) / 100, c: slab.paint },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
  }
  made = { type: 'FeatureCollection', features };
  return made;
}

/**
 * The flat roofs among the landmarks' slabs: the wings of a mall at a tower's
 * foot, the hall of a station. Each is laid and furnished like any other
 * roof, so they come in the form the roof layer takes buildings in (see
 * roofDecks in roofs.js): [{ height, base, replaced, roofTop, roofColour,
 * roofing, polygons }], in the slab's own colour, covered with slabs.
 */
export function landmarkRoofs() {
  const roofs = [];
  for (const landmark of LANDMARKS) {
    for (const slab of landmark.build()) {
      if (!slab.roof) continue;
      const ring = slab.outline.map(([u, v]) => place(landmark, u, v, slab.north));
      ring.push(ring[0]);
      roofs.push({ height: slab.top, base: 0, replaced: true, roofTop: slab.top, roofColour: slab.paint, roofing: 'slabs', polygons: [[ring]] });
    }
  }
  return roofs;
}

/**
 * Bridges that hang from cables. The map has their decks, as it has every
 * bridge's; what stands on the deck is set out here and drawn with the
 * bridges (see drawBridges in life.js).
 *
 * Wadi Laban Bridge carries the Western Ring Road over the wadi in three
 * spans, the middle one 405 m. Two slender concrete masts stand in the
 * middle of the deck, and from each a single fan of white cables runs down
 * to the deck's centre line on either side.
 */
export const STAYED_BRIDGES = [
  {
    id: 'wadi-laban',
    name: 'Wadi Laban Bridge',
    at: [46.58268, 24.616195], // the middle of the main span
    bearing: 336.6, // the way the deck runs
    masts: [-202.5, 202.5], // where they stand, in metres along the deck from the middle
    mast: 96, // how far each rises above the deck
    cables: 22, // in each fan, on either side of a mast
    reach: { bank: 168, span: 196 }, // how far a fan reaches along the deck: towards the bank, and towards the middle of the bridge
    between: 10, // from the deck's centre line to the middle of each carriageway
  },
];

/**
 * The footprints that landmarks without a building on the map throw a
 * shadow from, in the form buildingShadows() takes: [{ height, base, polygons }].
 */
export function landmarkShades() {
  const shades = LANDMARKS.filter((landmark) => landmark.shade).map((landmark) => {
    const ring = circle(landmark.shade.radius, 12).map(([u, v]) => place(landmark, u, v, true));
    ring.push(ring[0]);
    return { height: landmark.shade.height, base: 0, polygons: [[ring]] };
  });
  // The masts of the cable-stayed bridges.
  for (const bridge of STAYED_BRIDGES) {
    for (const along of bridge.masts) {
      const ring = block(2.2, 1.8).map(([u, v]) => place(bridge, u + along, v));
      ring.push(ring[0]);
      shades.push({ height: bridge.mast, base: 0, polygons: [[ring]] });
    }
  }
  return shades;
}

/**
 * Which of the map's own buildings a landmark model stands in for: those
 * whose middle lies within the landmark's clearing and which are not much
 * larger than it (a tower's outline, not the whole block it stands in).
 *
 * outlines: [{ id, ring: [[lng, lat], …] }]. Returns the ids to leave out.
 */
export function replacedByLandmarks(outlines) {
  const out = new Set();
  for (const landmark of LANDMARKS) {
    if (!(landmark.clear > 0)) continue;
    const squeeze = Math.cos((landmark.at[1] * Math.PI) / 180) * METERS_PER_DEGREE;
    const reach = landmark.clear * 3 / METERS_PER_DEGREE; // nothing further off than this needs a closer look
    for (const { id, ring } of outlines) {
      if (id === undefined || id === null || !ring || ring.length < 4) continue;
      if (Math.abs(ring[0][1] - landmark.at[1]) > reach || Math.abs(ring[0][0] - landmark.at[0]) > reach * 1.2) continue;
      let east = 0;
      let north = 0;
      for (let i = 1; i < ring.length; i += 1) {
        east += (ring[i][0] - landmark.at[0]) * squeeze;
        north += (ring[i][1] - landmark.at[1]) * METERS_PER_DEGREE;
      }
      east /= ring.length - 1;
      north /= ring.length - 1;
      let widest = 0;
      for (const [lng, lat] of ring) widest = Math.max(widest, Math.hypot((lng - landmark.at[0]) * squeeze - east, (lat - landmark.at[1]) * METERS_PER_DEGREE - north));
      if (Math.hypot(east, north) <= landmark.clear && widest <= landmark.clear * 1.6) out.add(id);
    }
  }
  return out;
}
