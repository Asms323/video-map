// More of Riyadh's famous buildings, each built as a true model with its details.
//
// The towers of the skyline were built first (see landmarks.js), then the financial district (kafd.js).
// Here are the buildings the city is known by that are not towers: each looked up, studied in
// photographs and in the satellite photo the app shows, and built face by face (see models.js and
// solids.js). What is known of each, what was measured and what is a judgement is said where it is built.
// And, after those, the towers that were at first plain stacks of slabs, built again with their details:
// they keep their places among the landmarks (see landmarks.js).
//
// Nothing here touches the browser. Measurements are in metres; a model is measured from the middle of
// its own footprint, east and north being its own (it is turned with its landmark's bearing).

import { ballProfile, beam, block, frame, lathe, prism, taper } from './solids.js';

const TAU = Math.PI * 2;

const raised = (ring, up) => ring.map(([east, north]) => [east, north, up]);

/**
 * The walls between two outlines of as many corners, one over the other (each corner [east, north, up],
 * going round anticlockwise): a face for every side. way: 1 if they look outwards, -1 if inwards.
 * lines: along which edges of each face a line is drawn: [its foot, its far end, its top, its near end].
 * bands: between these heights the faces are of other stuff (see models.js).
 */
function between(model, low, high, stuff, { way = 1, lines = [false, false, false, false], bands = null, lit = null } = {}) {
  const count = low.length;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const [a, b, c, d] = [low[i], low[j], high[j], high[i]];
    const long = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (long < 1e-6 && Math.hypot(c[0] - d[0], c[1] - d[1]) < 1e-6) continue;
    const out = [(b[1] - a[1]) * way, -(b[0] - a[0]) * way, 0];
    // (lit: [outwards, up]: the light falls on each face as on one that looks so far outwards and so far up, whichever way it leans.)
    const looks = lit && long > 1e-6 ? [(out[0] / long) * lit[0], (out[1] / long) * lit[0], lit[1]] : null;
    model.quad(a, b, c, d, stuff, { out, lines, along: [b[0] - a[0], b[1] - a[1]], from: [a[0], a[1]], ...(bands ? { bands } : {}), ...(looks ? { normals: [looks, looks, looks, looks] } : {}) });
  }
}

// ── The Ministry of Interior ──────────────────────────────────────────────

/** How long each step of the building's stepped corners is, along either of its sides. */
const STEP = 9.07;

/**
 * A square of so wide a half-width whose four corners are cut back in steps: so many steps to a
 * corner, each STEP long both ways (none: a plain square). Anticlockwise, from the east side's
 * northern end.
 */
export function stepped(half, steps = 0, step = STEP) {
  const corner = [];
  for (let k = 0; k <= steps; k += 1) {
    corner.push([half - k * step, half - (steps - k) * step]);
    if (k < steps) corner.push([half - (k + 1) * step, half - (steps - k) * step]);
  }
  const ring = [];
  for (let turn = 0; turn < 4; turn += 1) {
    for (const [east, north] of corner) {
      // (A quarter turn anticlockwise, turn times.)
      ring.push(turn === 0 ? [east, north] : turn === 1 ? [-north, east] : turn === 2 ? [-east, -north] : [north, -east]);
    }
  }
  return ring;
}

// The ministry's measures, in metres.
export const MINISTRY = {
  storey: 4.8, // from one floor of the pyramid to the next
  floors: 5,
  podium: 4, // the height of the podium the hall stands on
  foot: 9.6, // the underside of the pyramid
  narrow: 56.2, // the half-width of the pyramid at its foot…
  widening: 5.2, // …and how much wider each floor is than the one below it
  window: 2.4, // the height of each floor's band of glass
  recess: 1, // how far the glass stands back from the edge of the sill under it
  tip: 33.6, // the widest edge of the building, 82.2 m from its middle: the top of the fifth floor
  terrace: 37.8, // the terrace the white roof slopes up to…
  terraceHalf: 76.4,
  upperHalf: 69.3, // …and the top storey that stands back on it
  roof: 41.6,
  lantern: [55, 48.6, 43.6], // the glazed lantern on that roof: the half-width of its foot and of its top, and its top's height
  rim: [30.5, 26.8, 44.6], // the low rim round the terrace of the dome: outer and inner half-width, and height
  court: 43.6, // that terrace: the foot of the dome
  domeRadius: 21.75,
  domeTop: 55.2,
  top: 56.2, // with the cap on the dome
  eyes: 32, // the round windows in a ring about the dome…
  eyesOut: 18.25, // …so far from its axis
};

/**
 * The Ministry of Interior (Archisystems with Musalli, Shakir and Mandill; built by Hyundai, 1980 to
 * 1989), on King Fahd Road at Al Olaya: the upside-down pyramid with a dome on it, 55 m high, that the
 * city calls the flying saucer.
 *
 * It is a square that stands corner-on to the road, and each of its five floors is wider than the one
 * under it: 112 m across at the foot, 164 m at the top. Every floor shows as a band of pale stone that
 * leans outwards, the underside of the floor above, over a dark band of glass set back in its shade. The
 * four corners are not points: each is cut back in three steps, on every floor, so that the corner of
 * the building is a stair of prows. Under the pyramid stands a glass hall among columns, on a low
 * podium of stone.
 *
 * On top the roof slopes up, white, from the widest edge to a terrace; a top storey stands back on that,
 * and on its roof a long glazed lantern, with sixteen round skylights; and in the middle, on a terrace
 * of its own, the dome: 43 m across and 12 m high, a ring of round windows about it and a cap on top. By night the stone
 * bands are floodlit, a line of lamps runs along the edge of every floor, and the dome is lit.
 *
 * (Its height, 55 m, and its builders are as published; the height is taken here as that of the
 * dome. Its plan was measured on the satellite photo the app shows: the steps of the corners, the
 * terrace, the lantern, the court, the dome and its ring of windows, the skylights. That photo is taken
 * at a slant, which is how the heights of what stands on the roof were told apart, each to a couple of
 * metres; where the building stands on the ground is worked back from the same slant and from its
 * shadow, and is good to some five metres. The height of a floor, how far each widens, and the hall and
 * podium under them are read off photographs from the road, with the dome for a measure. The two
 * pavilions at its foot are placed from the satellite photo and built plainly.)
 */
function ministryOfInterior(model) {
  const M = MINISTRY;
  const to = frame([0, 0], 0);
  const stone = '#d8cbae';
  // The leaning bands of stone: floodlit by night, and a line of lamps along the upper edge of each.
  // (They look down, and no sun reaches them; but the pale ground under them throws the sun's light
  // up at them, and they are as bright as a wall that faces it. So the light falls on each as on a
  // wall that looks the way it does, and the shadow of the floors over it is not counted.)
  const band = { kind: 'plain', colour: stone, light: '#ffe9c4', glow: 0.5, ridge: 0.8, open: true };
  // The glass behind them: dark bronze, in narrow bays; by night some of the offices are lit.
  const glass = { kind: 'glass', colour: '#1f1c19', storey: M.window, bay: 1.5, lit: 0.4, floors: 0, mirror: 0 };
  const plain = { kind: 'plain', colour: stone };

  // The podium, the hall that stands on it under the pyramid, and the columns round the hall.
  const podium = stepped(58);
  between(model, raised(podium, 0), raised(podium, M.podium), { kind: 'pierced', colour: '#ddd1b6', storey: M.podium, bay: 3.4, holes: 0.3, lit: 0.5, light: '#ffe9c4', glow: 0.25 });
  const hall = stepped(27);
  model.flat(raised(podium, M.podium), { kind: 'plain', colour: '#d2c7ae' }, { holes: [raised(hall, M.podium)] });
  between(model, raised(hall, M.podium), raised(hall, M.foot), { kind: 'glass', colour: '#3a332b', storey: (M.foot - M.podium) / 2, bay: 2.2, lit: 0.9, floors: 0.2, mirror: 0.15 });
  const column = { kind: 'plain', colour: '#e2d7bf', light: '#ffe9c4', glow: 0.45 };
  for (let side = 0; side < 4; side += 1) {
    for (let k = -3; k < 3; k += 1) {
      const [along, out] = [(k + 0.5) * 13.2, 40];
      const [east, north] = side === 0 ? [out, along] : side === 1 ? [-along, out] : side === 2 ? [-out, -along] : [along, -out];
      beam(model, [east, north, M.podium], [east, north, M.foot], 1.2, column);
    }
  }
  // The underside of the pyramid: lit from below by night.
  const footRing = stepped(M.narrow, 3);
  model.flat(raised(footRing, M.foot), { kind: 'plain', colour: '#cfc3a8', light: '#ffe9c4', glow: 0.4 }, { out: [0, 0, -1], holes: [raised(hall, M.foot)] });

  // The five floors: each a band of glass, set back, and over it the leaning band of stone that carries
  // the floor above out past it.
  for (let floor = 0; floor < M.floors; floor += 1) {
    const sill = M.foot + floor * M.storey;
    const head = sill + M.window;
    const pane = stepped(M.narrow + floor * M.widening - M.recess, 3);
    const next = stepped(M.narrow + (floor + 1) * M.widening, 3);
    between(model, raised(pane, sill), raised(pane, head), glass);
    between(model, raised(pane, head), raised(next, sill + M.storey), band, { lines: [false, false, true, false], lit: [1, -0.3] });
  }

  // The roof: white, sloping up from the widest edge to the terrace; the top storey standing back on
  // the terrace, glass under a band of stone; and its flat roof.
  const tipRing = stepped(M.narrow + M.floors * M.widening, 3);
  const terrace = stepped(M.terraceHalf, 3);
  const upper = stepped(M.upperHalf, 3);
  between(model, raised(tipRing, M.tip), raised(terrace, M.terrace), { kind: 'plain', colour: '#efe9da' });
  model.flat(raised(terrace, M.terrace), { kind: 'plain', colour: '#c9b8a0' }, { holes: [raised(upper, M.terrace)] });
  between(model, raised(upper, M.terrace), raised(upper, M.roof), { ...glass, storey: M.roof - M.terrace + 0.4 }, { bands: [{ from: M.roof - 1.1, to: M.roof + 0.1, stuff: { kind: 'plain', colour: stone, light: '#ffe9c4', glow: 0.5 } }] });
  const [lanternFoot, lanternTop, lanternUp] = M.lantern;
  const roofing = { kind: 'plain', colour: '#d9ceb5' };
  model.flat(raised(upper, M.roof), roofing, { holes: [raised(stepped(lanternFoot, 2), M.roof)] });

  // The lantern on it: its sides slanting glass in a white frame, its top flat, with the skylights.
  const skylight = { kind: 'glass', colour: '#77858c', storey: 2.6, bay: 1.3, lit: 0.8, floors: 0.8, mirror: 0.3 };
  between(model, raised(stepped(lanternFoot, 2), M.roof), raised(stepped(lanternTop, 2), lanternUp), skylight, { lines: [true, false, true, false] });
  const [rimOut, rimIn, rimUp] = M.rim;
  model.flat(raised(stepped(lanternTop, 2), lanternUp), roofing, { holes: [raised(stepped(rimOut + 3.6, 1), lanternUp)] });
  // (Sixteen round skylights, each a bubble of glass: three along each side and one at each corner.)
  const bubble = { kind: 'glass', colour: '#4f6672', storey: 3, bay: 3, lit: 1, floors: 0, mirror: 0.6 };
  const bubbles = [];
  for (const turn of [0, 1, 2, 3]) {
    for (const along of [-9.2, 0, 9.2]) bubbles.push([36.4, along, turn]);
    bubbles.push([27.6, 27.6, turn]);
  }
  for (const [east, north, turn] of bubbles) {
    const at = turn === 0 ? [east, north] : turn === 1 ? [-north, east] : turn === 2 ? [-east, -north] : [north, -east];
    lathe(model, to, at, [[2.3, lanternUp], [2.1, lanternUp + 0.7], [1.2, lanternUp + 1.3], [0, lanternUp + 1.5]], bubble, { cuts: 8 });
  }

  // The low rim round the terrace of the dome: slanting glass outside, a white top, and a step down to the terrace.
  between(model, raised(stepped(rimOut + 3.6, 1), lanternUp), raised(stepped(rimOut, 1), rimUp), skylight, { lines: [true, false, true, false] });
  model.flat(raised(stepped(rimOut, 1), rimUp), { kind: 'plain', colour: '#efe9da' }, { holes: [raised(stepped(rimIn, 1), rimUp)] });
  between(model, raised(stepped(rimIn, 1), M.court), raised(stepped(rimIn, 1), rimUp), { kind: 'plain', colour: '#e4dcc8' }, { way: -1 });
  model.flat(raised(stepped(rimIn, 1), M.court), { kind: 'plain', colour: '#e9e2d0', open: true });

  // The dome: a cap of a ball, 43.5 m across at its foot on the terrace and 11.6 m high.
  const rise = M.domeTop - M.court;
  const ball = (M.domeRadius ** 2 + rise ** 2) / (2 * rise); // the radius of the ball it is a cap of
  const middle = M.domeTop - ball; // the height of that ball's middle
  const dome = { kind: 'plain', colour: '#e3d5b3', light: '#f1f5ff', glow: 0.75 };
  lathe(model, to, [0, 0], ballProfile(ball, middle, { rings: 9, from: 0.05, until: Math.asin(M.domeRadius / ball) }), dome, { cuts: 40 });
  // Its ring of round windows: dark by day, lit by night.
  const eye = { kind: 'lamp', colour: '#3b3832', light: '#ffeccb', glow: 0.9 };
  const down = Math.asin(M.eyesOut / ball); // how far down from the top of the ball the ring lies
  for (let k = 0; k < M.eyes; k += 1) {
    const angle = ((k + 0.5) / M.eyes) * TAU;
    const out = [Math.sin(down) * Math.cos(angle), Math.sin(down) * Math.sin(angle), Math.cos(down)];
    const at = [out[0] * (ball + 0.12), out[1] * (ball + 0.12), middle + out[2] * (ball + 0.12)];
    // (Each a little round of eight sides, lying on the dome.)
    const aside = [-Math.sin(angle), Math.cos(angle), 0];
    const up = [-Math.cos(down) * Math.cos(angle), -Math.cos(down) * Math.sin(angle), Math.sin(down)];
    const round = Array.from({ length: 8 }, (_, i) => {
      const [s, t] = [Math.cos((i / 8) * TAU) * 0.85, Math.sin((i / 8) * TAU) * 0.85];
      return [at[0] + aside[0] * s + up[0] * t, at[1] + aside[1] * s + up[1] * t, at[2] + aside[2] * s + up[2] * t];
    });
    model.flat(round, eye, { out });
  }
  // The cap on top, and the red lamp on it.
  lathe(model, to, [0, 0], [[1.7, M.domeTop - 0.5], [1.7, M.domeTop + 0.35], [1.1, M.domeTop + 0.75], [0.25, M.top - 0.1]], { kind: 'plain', colour: '#b9a57a', light: '#f1f5ff', glow: 0.6 }, { cuts: 10 });
  lathe(model, to, [0, 0], [[0.25, M.top - 0.1], [0.22, M.top + 0.25], [0, M.top + 0.4]], { kind: 'lamp', colour: '#a02a22', light: '#ff3a2c', glow: 1 }, { cuts: 6 });

  // The two pavilions at its foot that the roof does not hide: the square one by the south-eastern side,
  // with its nine glass domes, and the long one by the south-western, with three.
  const pavilion = { kind: 'pierced', colour: '#ddd1b6', storey: 6, bay: 3, holes: 0.3, lit: 0.5, light: '#ffe9c4', glow: 0.25 };
  const little = { kind: 'glass', colour: '#5a7480', storey: 3, bay: 3, lit: 1, floors: 0, mirror: 0.6 };
  for (const { box: [east0, east1, north0, north1], domes } of [
    { box: [69.4, 87.4, 1.3, 19.3], domes: [-6, 0, 6].flatMap((east) => [-6, 0, 6].map((north) => [78.4 + east, 10.3 + north])) },
    { box: [-25, 3, -90.8, -78.8], domes: [-9, 0, 9].map((east) => [-11 + east, -84.8]) },
  ]) {
    const ring = [[east0, north0], [east1, north0], [east1, north1], [east0, north1]];
    between(model, raised(ring, 0), raised(ring, 6), pavilion);
    model.flat(raised(ring, 6), { kind: 'plain', colour: '#d2c7ae' });
    for (const at of domes) lathe(model, to, at, [[2, 6], [1.8, 6.7], [1, 7.3], [0, 7.5]], little, { cuts: 8 });
  }
  return {};
}

// ── The King Fahd National Library ────────────────────────────────────────

// The library's measures, in metres.
export const LIBRARY = {
  sail: 4.9, // a sail of the veil: so wide and so tall, a square standing on its point
  across: 29, // sails side by side along each side of the building
  levels: 8, // from the foot of the veil to its top, in half sails
  foot: 6.5, // the foot of the veil: the ceiling of the open ground floor
  depth: 2.4, // from the front net of cables to the one behind it
  scallop: 0.72, // how far the middle of a sail's edge is drawn in: its share of the way out from the sail's middle
  glass: 67.4, // the half-width of the glass box behind the veil
  hall: 61, // …and of the glass of the ground floor, which stands further back
  roof: 25,
  strips: 10, // the skylights of the roof: so many to each side, 9.8 m apart, each 2.4 m wide
  well: 26.5, // the eight-sided court in the middle of the roof: from its middle to its corners…
  wellFloor: 17, // …and its floor, which is the roof of the old library
  dome: [8.8, 20, 26], // the dome on that: its radius, and the heights of its foot and of its top
};

/**
 * The King Fahd National Library on King Fahd Road (Gerber Architekten, opened 2013): the old library
 * of the 1980s, a cross-shaped building under a dome, kept whole and wrapped on all four sides in a new
 * square building of glass; and that in a veil.
 *
 * The veil is what the building is known by: white sails of cloth, each a square of some five metres
 * standing on its point, held in two nets of steel cable that hang one 2.4 m before the other. Every
 * sail is fastened by its top and its bottom to the front net and by its two sides to the back one, so
 * that it is a saddle, and its edges are drawn in between its corners; so sail stands over sail like the
 * scales of a fish, with dark eyes between them through which the glass shows. They keep the sun off
 * the glass. By night every sail is lit.
 *
 * Under the veil the ground floor stands open: glass set back behind a row of round columns. The roof is
 * white, with ten strips of skylight to each side over the reading rooms; and in its middle an
 * eight-sided court goes down to the roof of the old library, with its dome, now of glass.
 *
 * (Its architects and what it is made of are as published. Its plan was measured on the satellite photo
 * the app shows: 142 m square to the points of the veil, which agrees with the buildings data's outline
 * of it; twenty-nine sails to a side; the strips of skylight; the court, 53 m across, and the dome in
 * it. One published figure, a cube of 90 m, does not agree with either. The rows of sails, eight of
 * them each half a sail over the last, were counted off two photographs; its height, 26 m, follows from
 * that count and from a ground floor judged at 6.5 m against the people standing in it, and may be out
 * by two or three metres. What stands in the court round the dome is built plainly.)
 */
function kingFahdLibrary(model) {
  const L = LIBRARY;
  const to = frame([0, 0], 0);
  const half = (L.across * L.sail) / 2; // to the front net
  const top = L.foot + (L.levels * L.sail) / 2;

  // The glass box, four storeys of it; and under it the ground floor, further back, with its lamps on.
  const glass = { kind: 'glass', colour: '#27343c', storey: (L.roof - L.foot) / 4, bay: 2.45, lit: 0.55, floors: 0.6, mirror: 0.25 };
  const box = stepped(L.glass);
  between(model, raised(box, L.foot), raised(box, L.roof), glass);
  const hall = stepped(L.hall);
  between(model, raised(hall, 0), raised(hall, L.foot), { kind: 'glass', colour: '#4b5f69', storey: L.foot, bay: 2.45, lit: 1, floors: 0, mirror: 0.2 });
  // (The ceiling over the open ground floor, out to the foot of the veil: lit from below by night.)
  const eaves = stepped(half - L.depth);
  model.flat(raised(eaves, L.foot), { kind: 'plain', colour: '#d9d9d6', light: '#fff0d2', glow: 0.5 }, { out: [0, 0, -1], holes: [raised(hall, L.foot)] });
  between(model, raised(eaves, L.foot), raised(eaves, L.foot + 0.7), { kind: 'plain', colour: '#c9cac8' });
  model.flat(raised(eaves, L.foot + 0.7), { kind: 'plain', colour: '#c9cac8' }, { holes: [raised(box, L.foot + 0.7)] });
  // Its columns: round, pale, under every other sail.
  const column = { kind: 'plain', colour: '#dcdcd8', light: '#fff0d2', glow: 0.45 };
  const turned = (turn, [east, north]) => (turn === 0 ? [east, north] : turn === 1 ? [-north, east] : turn === 2 ? [-east, -north] : [north, -east]);
  for (let turn = 0; turn < 4; turn += 1) {
    for (let k = 0.5; k < L.across; k += 2) {
      lathe(model, to, turned(turn, [half - L.depth, -half + k * L.sail]), [[0.45, 0], [0.45, L.foot]], column, { cuts: 6 });
    }
  }

  // The roof: white, with the court cut out of its middle; the strips of skylight, lit by night from the rooms under them.
  const court = Array.from({ length: 8 }, (_, k) => [Math.cos(((k + 0.5) / 8) * TAU) * L.well, Math.sin(((k + 0.5) / 8) * TAU) * L.well]);
  model.flat(raised(box, L.roof), { kind: 'plain', colour: '#f1ece0' }, { holes: [raised(court, L.roof)] });
  const strip = { kind: 'glass', colour: '#7d8779', storey: 3, bay: 2.4, lit: 1, floors: 0, mirror: 0.25 };
  for (let turn = 0; turn < 4; turn += 1) {
    for (let j = 0; j < L.strips; j += 1) {
      const aside = (j - (L.strips - 1) / 2) * 2 * L.sail;
      // (Each runs in from near the edge towards the court, and stops short of its neighbours on the next side.)
      const [inner, outer] = [Math.max(31, Math.abs(aside) + 3), 56];
      if (outer - inner < 4) continue;
      const corners = [[inner, aside - 1.2], [outer, aside - 1.2], [outer, aside + 1.2], [inner, aside + 1.2]].map((corner) => [...turned(turn, corner), L.roof + 0.25]);
      model.quad(...corners, strip, { lines: [false, false, false, false] });
    }
  }
  // The court: its walls of glass, its floor, the arms of the old library's cross, and the dome in the middle.
  between(model, raised(court, L.wellFloor), raised(court, L.roof), { kind: 'glass', colour: '#2c3a42', storey: 4, bay: 2.4, lit: 0.6, floors: 0.5, mirror: 0.2 }, { way: -1 });
  model.flat(raised(court, L.wellFloor), { kind: 'plain', colour: '#d8cdb6', open: true });
  const old = { kind: 'plain', colour: '#e0d6c0', open: true };
  for (let turn = 0; turn < 4; turn += 1) {
    const arm = [[10.5, -5.5], [20, -5.5], [20, 5.5], [10.5, 5.5]].map((corner) => turned(turn, corner));
    between(model, raised(arm, L.wellFloor), raised(arm, L.wellFloor + 2.6), old);
    model.flat(raised(arm, L.wellFloor + 2.6), old);
  }
  const [domeRadius, domeFoot, domeTop] = L.dome;
  lathe(model, to, [0, 0], [[domeRadius + 0.8, L.wellFloor], [domeRadius + 0.8, domeFoot], [domeRadius, domeFoot]], { kind: 'plain', colour: '#e6dfcf', open: true }, { cuts: 24 });
  const rise = domeTop - domeFoot;
  const ball = (domeRadius ** 2 + rise ** 2) / (2 * rise);
  lathe(model, to, [0, 0], ballProfile(ball, domeTop - ball, { rings: 6, from: 0.02, until: Math.asin(domeRadius / ball) }), { kind: 'glass', colour: '#6c8d94', storey: 2, bay: 2, lit: 1, floors: 0.3, mirror: 0.45 }, { cuts: 24 });

  // The veil. On each side: rows of sails, each row half a sail lower than the last and half a sail along.
  const sail = { kind: 'plain', colour: '#f3f0e7', light: '#fff0d2', glow: 0.85 };
  const s = L.sail;
  const reach = (s / 4) * L.scallop; // from a sail's middle to the middle of each of its edges, across and up
  for (let turn = 0; turn < 4; turn += 1) {
    /** A place on this side's veil: so far along the side, so high, so far behind the front net. */
    const at = (along, up, behind) => [...turned(turn, [half - behind, along]), up];
    const out = [...turned(turn, [1, 0]), 0];
    const back = [-out[0], -out[1], 0];
    /** A piece of sail, seen from before it and from behind. */
    const both = (a, b, c) => {
      model.facet(a, b, c, sail, { out, lines: [false, false, false] });
      model.facet(a, b, c, sail, { out: back, lines: [false, false, false] });
    };
    for (let level = 1; level <= L.levels; level += 1) {
      const up = top - (level * s) / 2; // the height of the row's middle
      const odd = level % 2 === 1;
      for (let k = odd ? 0 : 1; k < L.across; k += 1) {
        const along = -half + (odd ? k + 0.5 : k) * s;
        const [high, right, left] = [at(along, up + s / 2, 0), at(along + s / 2, up, L.depth), at(along - s / 2, up, L.depth)];
        if (level === L.levels) {
          // (The lowest row is cut off at the foot of the veil: the upper half of a sail, like a tent.)
          both(left, right, high);
          continue;
        }
        const low = at(along, up - s / 2, 0);
        const [a, b, c, d] = [at(along + reach, up + reach, L.depth / 2), at(along + reach, up - reach, L.depth / 2), at(along - reach, up - reach, L.depth / 2), at(along - reach, up + reach, L.depth / 2)];
        model.quad(d, a, b, c, sail, { out, lines: [false, false, false, false] });
        both(d, high, a);
        both(a, right, b);
        both(b, low, c);
        both(c, left, d);
      }
    }
  }
  return {};
}

// ── Masmak Fort ───────────────────────────────────────────────────────────

/**
 * A ring with every side moved in by so much (out, if by less than nothing): for a ring without
 * hollows in its outline, its corners [[u, v], …] anticlockwise.
 */
export function inset(ring, by) {
  const count = ring.length;
  const inward = ring.map(([u, v], i) => {
    const [nextU, nextV] = ring[(i + 1) % count];
    const long = Math.hypot(nextU - u, nextV - v) || 1;
    return [-(nextV - v) / long, (nextU - u) / long];
  });
  return ring.map(([u, v], i) => {
    const [a, b] = [inward[(i + count - 1) % count], inward[i]];
    const share = by / (1 + a[0] * b[0] + a[1] * b[1]);
    return [u + (a[0] + b[0]) * share, v + (a[1] + b[1]) * share];
  });
}

// The fort's measures, in metres. Places are [u, v]: u along its north wall, eastwards, v across it, northwards.
export const MASMAK = {
  turn: 19, // how far that u is turned from east, anticlockwise, in degrees
  corners: [[27.3, 18.7], [-32.4, 22.4], [-26.6, -22.5], [23.2, -23.8]], // where its walls meet: north-east, north-west, south-west, south-east
  towers: [[29.8, 20], [-34.5, 23.6], [-28.8, -24.4], [25, -24.9]], // the middles of its four round towers
  batter: 0.6, // how much further out the foot of a wall stands than its top
  wall: 9.5, // the top of the walls…
  roof: 8.2, // …and the roofs of the rooms inside them
  tower: [4.4, 3.5, 3.05, 12, 16.9, 18], // a round tower: its radius at the foot, at its ledge and at its top; the heights of the ledge, of its floor on top and of the points of its battlements
  keep: [-9.7, 14.5, 3.5, 13.6, 14.6], // the square tower: where its middle is, its half-width, and the heights of its roof and of its battlements
  gate: [0.45, 2.65, 3.6], // the gate in the west wall: how far along from the north-western corner (as a share), its width and its height
  // The courts inside: the middle of each, and how long and how wide it is.
  courts: [[-21.5, 14.4, 13, 8.5], [-2.4, 13, 4, 8], [13.3, 9.8, 10, 8], [-15.7, -9.8, 14, 10], [-1.8, -12.5, 5, 11], [15.9, -13.3, 8, 8]],
};

/**
 * Masmak Fort (Qasr al-Masmak), in the old town: the fort of clay and mud brick, begun in 1865 and
 * finished in 1895, that Abdulaziz ibn Saud took in January 1902; a museum since 1995.
 *
 * Four walls of clay, thick at the foot and leaning back as they rise, with a round tower at each
 * corner: each tower some 18 m high, narrowing upwards, with a ledge round it two thirds of the way up
 * and a crown of pointed battlements. The gate is in the west wall, 3.6 m high and 2.65 m wide, of palm
 * wood, under a box that stands out of the wall over it. Inside, rooms of two storeys round a handful of
 * courts, under flat roofs; and over them a square watchtower. Rows of small three-cornered holes air
 * the rooms, and wooden spouts stand out of the walls to throw the rain clear of them. By night the fort
 * is floodlit, golden.
 *
 * (Its outline, with the four towers, is the buildings data's; it agrees with the satellite photo the
 * app shows, in which the tops of the towers lie four metres east of where the data has their feet: that
 * is the slant of the photo. The height of the towers and the size of the gate are as published. The
 * height of the walls, 9.5 m, is judged against the towers in photographs. The courts are placed from
 * the satellite photo, and the rooms round them built plainly, as one roof; which of the roofs the
 * square tower stands on is a judgement. The holes, spouts and battlements are as the photographs show
 * them, but not counted.)
 */
function masmakFort(model) {
  const F = MASMAK;
  const to = frame([0, 0], (F.turn * Math.PI) / 180);
  const up = (ring, height) => ring.map(([u, v]) => to(u, v, height));
  // Clay: floodlit by night where it faces the town.
  const clay = { kind: 'plain', colour: '#c8a878', light: '#ffe08a', glow: 0.8 };
  const roofing = { kind: 'plain', colour: '#d8c09a', open: true };
  const dark = { kind: 'plain', colour: '#4a3826' };
  const wood = { kind: 'plain', colour: '#6b4a2b' };

  // The walls: leaning back from foot to top; a parapet on top; and inside it the one roof of all the rooms.
  const walls = F.corners;
  const within = inset(walls, 0.5);
  between(model, up(inset(walls, -F.batter), 0), up(walls, F.wall), clay);
  model.flat(up(walls, F.wall), { ...clay, open: true }, { holes: [up(within, F.wall)] });
  between(model, up(within, F.roof), up(within, F.wall), { kind: 'plain', colour: '#c8a878', open: true }, { way: -1 });
  const courts = F.courts.map(([u, v, long, wide]) => [[u - long / 2, v - wide / 2], [u + long / 2, v - wide / 2], [u + long / 2, v + wide / 2], [u - long / 2, v + wide / 2]]);
  model.flat(up(within, F.roof), roofing, { holes: courts.map((court) => up(court, F.roof)) });
  for (const court of courts) {
    // (A court's walls, with the doors and windows of the rooms dark in them; and its floor of trodden earth.)
    between(model, up(court, 0), up(court, F.roof), { kind: 'pierced', colour: '#c2a274', storey: F.roof / 2, bay: 2.6, holes: 0.1, lit: 0.25 }, { way: -1 });
    model.flat(up(court, 0.05), { kind: 'plain', colour: '#b3966a' });
  }

  /** A place on the face of a wall: which wall (0: the north one, then west, south, east), how far along it as a share, how high, and how far it stands out of the face. */
  const onWall = (wall, along, height, proud = 0) => {
    const [from, until] = [walls[wall], walls[(wall + 1) % 4]];
    const long = Math.hypot(until[0] - from[0], until[1] - from[1]);
    const out = [(until[1] - from[1]) / long, -(until[0] - from[0]) / long];
    const stands = F.batter * (1 - Math.min(height, F.wall) / F.wall) + proud;
    return to(from[0] + (until[0] - from[0]) * along + out[0] * stands, from[1] + (until[1] - from[1]) * along + out[1] * stands, height);
  };
  const wayOut = (wall) => {
    const [from, until] = [walls[wall], walls[(wall + 1) % 4]];
    return to.way(until[1] - from[1], -(until[0] - from[0]));
  };
  for (let wall = 0; wall < 4; wall += 1) {
    const [from, until] = [walls[wall], walls[(wall + 1) % 4]];
    const long = Math.hypot(until[0] - from[0], until[1] - from[1]);
    const out = wayOut(wall);
    // Along its top, small pointed battlements; under them a row of three-cornered holes; and a wooden spout every so often.
    for (let at = 4.2; at < long - 4; at += 1.4) {
      const tooth = [onWall(wall, (at - 0.4) / long, F.wall), onWall(wall, (at + 0.4) / long, F.wall), onWall(wall, at / long, F.wall + 0.75)];
      model.facet(...tooth, clay, { out, lines: [false, false, false] });
      model.facet(...tooth, { kind: 'plain', colour: '#c8a878', open: true }, { out: [-out[0], -out[1], 0], lines: [false, false, false] });
    }
    for (let at = 5; at < long - 4.5; at += 2.4) {
      model.facet(onWall(wall, (at - 0.25) / long, F.roof - 0.9, 0.04), onWall(wall, (at + 0.25) / long, F.roof - 0.9, 0.04), onWall(wall, at / long, F.roof - 0.35, 0.04), dark, { out, lines: [false, false, false] });
    }
    for (let at = 7; at < long - 6; at += 8.5) beam(model, onWall(wall, at / long, F.roof - 0.1, -0.2), onWall(wall, at / long, F.roof - 0.35, 0.95), 0.22, wood, { ends: true });
  }

  // The gate in the west wall: dark palm wood in a deep doorway; and over it the box that stands out of the wall, with its three slots.
  const [gateAt, gateWide, gateTall] = F.gate;
  const westLong = Math.hypot(walls[2][0] - walls[1][0], walls[2][1] - walls[1][1]);
  const west = wayOut(1);
  const half = gateWide / 2 / westLong;
  model.quad(onWall(1, gateAt - half, 0, 0.05), onWall(1, gateAt + half, 0, 0.05), onWall(1, gateAt + half, gateTall, 0.05), onWall(1, gateAt - half, gateTall, 0.05), wood, { out: west, lines: [false, false, false, false] });
  const box = [[gateAt - 1.1 / westLong, 0.05], [gateAt + 1.1 / westLong, 0.05], [gateAt + 1.1 / westLong, 0.85], [gateAt - 1.1 / westLong, 0.85]];
  const [boxFoot, boxTop] = [gateTall + 1.5, gateTall + 3];
  for (let i = 0; i < 4; i += 1) {
    const [a, b] = [box[i], box[(i + 1) % 4]];
    if (i === 3) continue; // (its back is the wall)
    model.quad(onWall(1, a[0], boxFoot, a[1]), onWall(1, b[0], boxFoot, b[1]), onWall(1, b[0], boxTop, b[1]), onWall(1, a[0], boxTop, a[1]), clay, { out: i === 1 ? west : to.way(walls[2][0] - walls[1][0], walls[2][1] - walls[1][1]).map((part) => part * (i === 0 ? -1 : 1)), lines: [false, false, false, false] });
  }
  model.flat(box.map(([along, proud]) => onWall(1, along, boxTop, proud)), clay);
  model.flat(box.map(([along, proud]) => onWall(1, along, boxFoot, proud)), dark, { out: [0, 0, -1] });
  for (const slot of [-0.62, 0, 0.62]) {
    const [left, right] = [gateAt + (slot - 0.17) / westLong, gateAt + (slot + 0.17) / westLong];
    model.quad(onWall(1, left, boxFoot + 0.35, 0.89), onWall(1, right, boxFoot + 0.35, 0.89), onWall(1, right, boxFoot + 1.05, 0.89), onWall(1, left, boxFoot + 1.05, 0.89), dark, { out: west, lines: [false, false, false, false] });
  }

  // The four round towers: narrowing upwards, with a ledge round them, a floor on top behind a parapet, and a crown of pointed battlements.
  const [footRadius, ledgeRadius, topRadius, ledge, floor, crown] = F.tower;
  for (const [u, v] of F.towers) {
    lathe(model, to, [u, v], [[footRadius, 0], [ledgeRadius + 0.05, ledge - 0.3], [ledgeRadius + 0.22, ledge], [ledgeRadius, ledge + 0.25], [topRadius, crown - 1.6]], clay, { cuts: 20 });
    lathe(model, to, [u, v], [[topRadius, crown - 1.6], [topRadius - 0.03, crown - 0.75]], clay, { cuts: 20 });
    const disc = (radius, height) => Array.from({ length: 20 }, (_, k) => to(u + Math.cos((k / 20) * TAU) * radius, v + Math.sin((k / 20) * TAU) * radius, height));
    model.flat(disc(topRadius - 0.03, crown - 0.75), { kind: 'plain', colour: '#c8a878', open: true }, { holes: [disc(topRadius - 0.5, crown - 0.75)] });
    lathe(model, to, [u, v], [[topRadius - 0.5, crown - 0.75], [topRadius - 0.5, floor]], { kind: 'plain', colour: '#b99a6c', open: true }, { cuts: 20 });
    model.flat(disc(topRadius - 0.5, floor), roofing);
    for (let k = 0; k < 10; k += 1) {
      // (Each battlement a little block that ends in a point.)
      const [a0, a1] = [((k + 0.2) / 10) * TAU, ((k + 0.8) / 10) * TAU];
      const at = (angle, radius, height) => to(u + Math.cos(angle) * radius, v + Math.sin(angle) * radius, height);
      const [outer, inner] = [topRadius - 0.03, topRadius - 0.5];
      const mid = (a0 + a1) / 2;
      const point = at(mid, (outer + inner) / 2, crown);
      const foot = [at(a0, outer, crown - 0.75), at(a1, outer, crown - 0.75), at(a1, inner, crown - 0.75), at(a0, inner, crown - 0.75)];
      const away = to.way(Math.cos(mid), Math.sin(mid));
      model.facet(foot[0], foot[1], point, clay, { out: away, lines: [false, false, false] });
      model.facet(foot[2], foot[3], point, { kind: 'plain', colour: '#c8a878', open: true }, { out: [-away[0], -away[1], 0], lines: [false, false, false] });
      model.facet(foot[1], foot[2], point, clay, { out: to.way(-Math.sin(mid), Math.cos(mid)), lines: [false, false, false] });
      model.facet(foot[3], foot[0], point, clay, { out: to.way(Math.sin(mid), -Math.cos(mid)), lines: [false, false, false] });
    }
    // Its holes, in two rings; and the pole that stands out near its top.
    for (const [height, count, turnBy] of [[8.4, 8, 0], [14, 8, 0.5]]) {
      const radius = height < ledge ? footRadius + ((ledgeRadius - footRadius) * height) / ledge : ledgeRadius + ((topRadius - ledgeRadius) * (height - ledge)) / (crown - 1.6 - ledge);
      for (let k = 0; k < count; k += 1) {
        const angle = ((k + turnBy) / count) * TAU;
        const at = (aside, rise) => to(u + Math.cos(angle) * (radius + 0.07) - Math.sin(angle) * aside, v + Math.sin(angle) * (radius + 0.07) + Math.cos(angle) * aside, height + rise);
        model.facet(at(-0.25, 0), at(0.25, 0), at(0, 0.55), dark, { out: to.way(Math.cos(angle), Math.sin(angle)), lines: [false, false, false] });
      }
    }
    const away = Math.atan2(v, u);
    beam(model, to(u + Math.cos(away) * (topRadius - 0.3), v + Math.sin(away) * (topRadius - 0.3), crown - 3), to(u + Math.cos(away) * (topRadius + 1.5), v + Math.sin(away) * (topRadius + 1.5), crown - 2.7), 0.16, wood, { ends: true });
  }

  // The square watchtower over the roofs: drawing in a little as it rises, with stepped battlements at its corners and the middles of its sides.
  const [keepU, keepV, keepHalf, keepRoof, keepTop] = F.keep;
  const keep = to.sub([keepU, keepV]);
  // (It stands inside the block the map has for the fort, whose shadow would always lie on it: it takes none.)
  const high = { ...clay, open: true };
  taper(model, keep, [-keepHalf, keepHalf, -keepHalf, keepHalf], [-keepHalf + 0.35, keepHalf - 0.35, -keepHalf + 0.35, keepHalf - 0.35], F.roof, keepRoof, high, { top: roofing });
  const edge = keepHalf - 0.35;
  for (const [a, b] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) {
    const [cu, cv] = [a * (edge - 0.45), b * (edge - 0.45)];
    prism(model, keep, [[cu - 0.45, cv - 0.45], [cu + 0.45, cv - 0.45], [cu + 0.45, cv + 0.45], [cu - 0.45, cv + 0.45]], keepRoof, keepTop - (a !== 0 && b !== 0 ? 0 : 0.35), high);
  }
  for (const side of [0, 1, 2, 3]) {
    const [du, dv] = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
    for (const aside of [-1.2, 1.2]) {
      const mid = [du * (keepHalf - 0.1) - dv * aside, dv * (keepHalf - 0.1) + du * aside];
      const span = [-dv * 0.22, du * 0.22];
      model.facet(keep(mid[0] - span[0], mid[1] - span[1], keepRoof - 2.2), keep(mid[0] + span[0], mid[1] + span[1], keepRoof - 2.2), keep(mid[0], mid[1], keepRoof - 1.7), dark, { out: keep.way(du, dv), lines: [false, false, false] });
    }
  }
  return {};
}

// ── Al Majdoul Tower ──────────────────────────────────────────────────────

// The tower's measures, in metres.
export const MAJDOUL = {
  half: 18.8, // half the side of its square
  floors: 54,
  deck: 214, // its roof, where the helipad is
  top: 244, // the highest corner of the screen that stands round the roof…
  low: 217.5, // …and its lowest, across the roof from that
  turn: 90, // how far it turns between the ground and its roof, in degrees: clockwise, seen from above, as it rises
  fin: 0.8, // how far the white fin at every floor stands out of the glass
  helipad: 12, // the radius of the helipad
  canopy: [24.5, 38, 11, 8], // the glass canopy at its foot: how far out it reaches at its two ends and in its middle, how high it is at the tower and at its edge
};

/** The tower's square at a height: its four corners [east, north], anticlockwise, turned as far as the tower has turned by then. */
export function majdoulSquare(height, half = MAJDOUL.half) {
  const angle = -((MAJDOUL.turn * Math.PI) / 180) * (Math.min(Math.max(height, 0), MAJDOUL.deck) / MAJDOUL.deck);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return [[half, half], [-half, half], [-half, -half], [half, -half]].map(([east, north]) => [east * cos - north * sin, east * sin + north * cos]);
}

/**
 * Al Majdoul Tower (Zeidler Partnership; built 2012 to 2019), on King Fahd Road north of Kingdom Centre:
 * the twisted tower. 244 m and 54 floors; its name means the braided one.
 *
 * It is a square of some 38 m that does not narrow, and turns a quarter of a turn between the ground and
 * its roof, clockwise as it rises when seen from above: so each of its four walls is a twisted sheet of
 * glass, and round the whole of it, at every floor, runs a white fin that stands out of the glass and
 * turns with it. That is what the tower looks like from anywhere: a white screw.
 *
 * On its roof is a round helipad; and round the roof stands a screen of glass whose top is cut off
 * aslant, lowest at one corner and thirty metres higher at the corner across from it, where a rod
 * stands. At its foot, on the side towards the road, a canopy of glass on white ribs curves round it,
 * shaped like a leaf; and on the other side stands a low wing (see majdoulAnnex).
 *
 * (Its height, its floors and its architects are as published. Its square, that it does not narrow, the
 * quarter turn and which way it goes, the fins, the helipad and the screen with its high corner are read
 * off the satellite photo the app shows, which is taken at a slant from the south and shows two of its
 * walls from top to bottom; the outline the buildings data has of it agrees. No photograph of it from the
 * ground could be had for this: the colour of its glass, the height of the roof under the screen, 214 m,
 * and the height of the canopy, which the satellite photo shows only from above, are judgements. The
 * canopy's outline, and the wing's, are the buildings data's, which has them and the tower's foot as one.)
 */
export function majdoulTower(model) {
  const T = MAJDOUL;
  const storey = T.deck / T.floors;
  const glass = { kind: 'glass', colour: '#5d7d94', storey, bay: 1.5, lit: 0.35, floors: 0, mirror: 0.5 };
  const lobby = { kind: 'glass', colour: '#7c98a8', storey, bay: 1.5, lit: 1, floors: 0, mirror: 0.3 };
  const white = { kind: 'plain', colour: '#f1f2f1', light: '#dce8ff', glow: 0.3 };

  // The four twisted walls, a floor at a time; and at the top of every floor the fin: its upper side, its underside and its edge.
  for (let floor = 0; floor < T.floors; floor += 1) {
    const [low, high] = [floor * storey, (floor + 1) * storey];
    between(model, raised(majdoulSquare(low), low), raised(majdoulSquare(high), high), floor < 2 ? lobby : glass);
    const [inner, outer] = [majdoulSquare(high), majdoulSquare(high, T.half + T.fin)];
    model.flat(raised(outer, high + 0.12), white, { holes: [raised(inner, high + 0.12)] });
    model.flat(raised(outer, high - 0.12), white, { out: [0, 0, -1], holes: [raised(inner, high - 0.12)] });
    between(model, raised(outer, high - 0.12), raised(outer, high + 0.12), white);
  }

  // The screen round the roof: glass, its top one slanting plane, highest at the north-western corner.
  const square = majdoulSquare(T.deck);
  const topAt = ([east, north]) => T.low + (T.top - T.low) * ((north - east) / (2 * T.half) + 1) / 2;
  const rim = square.map((corner) => [corner[0], corner[1], topAt(corner)]);
  const screen = { kind: 'glass', colour: '#7d9bb0', storey, bay: 1.5, lit: 0, floors: 0.6, mirror: 0.55, ridge: 1, light: '#dfeaff', glow: 0.5 };
  between(model, raised(square, T.deck), rim, screen, { lines: [false, false, true, false] });
  // (Seen from the roof it is dark glass; and it takes no shadow from the block the map has for the tower.)
  between(model, raised(square, T.deck), rim, { kind: 'glass', colour: '#2f3d49', storey, bay: 1.5, lit: 0, floors: 0.4, mirror: 0.2, open: true }, { way: -1 });
  // The roof, and the helipad on it: blue, in a white ring.
  model.flat(raised(square, T.deck + 0.15), { kind: 'plain', colour: '#ecebe6', open: true });
  const round = (radius, height) => Array.from({ length: 28 }, (_, k) => [Math.cos((k / 28) * TAU) * radius, Math.sin((k / 28) * TAU) * radius, height]);
  model.flat(round(T.helipad + 0.9, T.deck + 0.3), { kind: 'plain', colour: '#fbfbf8', open: true });
  model.flat(round(T.helipad, T.deck + 0.4), { kind: 'plain', colour: '#2f7fd2', open: true });
  // The rod on the high corner.
  const peak = rim.reduce((best, corner) => (corner[2] > best[2] ? corner : best));
  beam(model, [peak[0] * 0.97, peak[1] * 0.97, peak[2] - 0.5], [peak[0] * 0.97, peak[1] * 0.97, peak[2] + 3], 0.3, white, { ends: true });

  // The canopy at its foot, towards the road: glass on white ribs, curving round the tower from its western
  // side to its southern, and reaching furthest out before its south-western corner.
  const [ends, most, high, low] = T.canopy;
  const pane = { kind: 'glass', colour: '#a9bcc6', storey: 3.2, bay: 3, lit: 0.6, floors: 0, mirror: 0.5, ridge: 1 };
  const [from, sweep, pieces] = [(-185 * Math.PI) / 180, (110 * Math.PI) / 180, 12];
  // (It begins at the tower's glass, which at that height has turned four degrees.)
  const turned = (T.turn * Math.PI) / 180 * (high / T.deck);
  const spot = (k, part, height) => {
    const angle = from + (sweep * k) / pieces;
    const inner = (T.half + 0.7) / Math.max(Math.abs(Math.cos(angle + turned)), Math.abs(Math.sin(angle + turned)));
    const outer = ends + (most - ends) * (1 - ((2 * k) / pieces - 1) ** 2);
    const radius = inner + (outer - inner) * part;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, height];
  };
  for (let k = 0; k < pieces; k += 1) {
    for (const [p0, p1, z0, z1] of [[0, 0.5, high, (high + low) / 2], [0.5, 1, (high + low) / 2, low]]) {
      const corners = [spot(k, p0, z0), spot(k, p1, z1), spot(k + 1, p1, z1), spot(k + 1, p0, z0)];
      model.quad(...corners, pane, { out: [0, 0, 1] });
      model.quad(...corners, { ...pane, lit: 0, light: '#fff0d2', glow: 0.5 }, { out: [0, 0, -1] });
    }
    if (k % 2 === 1) lathe(model, frame([0, 0], 0), [spot(k, 0.95, 0)[0], spot(k, 0.95, 0)[1]], [[0.28, 0], [0.28, low + 0.15]], white, { cuts: 6 });
  }
  return { beacons: [[peak[0] * 0.97, peak[1] * 0.97, peak[2] + 3.6]] };
}

/**
 * The low wing at the tower's foot, on the side away from the road: two storeys under a flat white roof.
 * (Its outline is the buildings data's, measured east and north of the tower's middle; it is built
 * plainly, as a slab: see landmarks.js.)
 */
export function majdoulAnnex() {
  const outline = [[28, -0.9], [41, 4.6], [61.6, 8.9], [58.9, 19.8], [74.6, 22.5], [60, 54.5], [47.5, 41.4], [42.1, 51.7], [36.6, 46.3], [41, 38.2], [20.4, 29], [12, 18], [24.5, 12]];
  return [{ outline, base: 0, top: 9, paint: '#e9e6dc', roof: true, north: true }];
}

// ── Burj Rafal ────────────────────────────────────────────────────────────

// The tower's measures, in metres. (Its own north is the way its length runs: east by north on the map.)
export const RAFAL = {
  long: 29, // half its length
  ends: 8.5, // half its width at its two ends…
  middle: 15, // …and in its middle
  floors: 68,
  podium: 23.1, // the height of the podium, and of the stone piers at the tower's own foot
  deck: 276, // its roof
  dip: 281, // the top of the screen that stands round the roof: in the middle of the tower's long sides…
  horns: 298, // …and at its two ends
  top: 308, // the tips of the two masts
  // The podium's outline, in metres east and north of the tower's middle on the map (the buildings data's), anticlockwise.
  base: [
    [30, -4.3], [39.2, -1.6], [58.2, -5.9], [73.4, -1], [81, 4.9], [85.3, 12.5], [88, 20.7], [88, 29.3], [83.7, 43.4], [77.7, 58.1], [70.7, 68.4],
    [61.5, 79.2], [45.8, 84.1], [33.8, 81.4], [24.1, 73.8], [20.3, 66.7], [18.1, 59.1], [15.9, 39.6], [15.9, 22.8], [14.3, 17.4], [26.8, 10.4], [23, 4.4],
  ],
  court: [63, 45, 155], // the tennis court on the podium's roof: where its middle is, and the way its length runs, in degrees from north
  tent: [27, 15, 9], // the round white tent on that roof: where, and its radius
  fountain: [0, -33, 6], // the round fountain before the door: where, and its radius
};

/** Half the tower's width, so far along its length from its middle: its long sides are bowed. */
export const rafalHalf = (along) => RAFAL.ends + (RAFAL.middle - RAFAL.ends) * (1 - (along / RAFAL.long) ** 2);
/** How high the screen round its roof stands, so far along the tower from its middle: lowest in the middle, highest at the two ends. */
export const rafalRim = (along) => RAFAL.dip + (RAFAL.horns - RAFAL.dip) * (Math.abs(along) / RAFAL.long) ** 1.7;

/**
 * Burj Rafal (P&T Architects; opened 2014), on King Fahd Road in As Sahafah: 307.9 m and 68 floors, a
 * hotel below and flats above; for some years the tallest building of the city.
 *
 * A long narrow tower of silvery glass, 58 m by 30 m: its two long sides are bowed, its two ends are flat
 * and half as wide. The glass of the long sides and of the ends runs on past the roof as a screen, low
 * in the middle of the tower and seventeen metres higher at its two ends: so that from the side its top
 * is a hollow between two horns; and on each horn stands a mast. It stands on a podium of six storeys in
 * pale Riyadh stone, an oval some 80 m by 95 m with rows of three-cornered openings in the Najdi way; on
 * the podium's roof are terraces, a tennis court and a round white tent. Before the hotel's door, on the
 * southern side, is a round fountain in a ring of road, with a canopy over the door.
 *
 * (Its height, floors and architects, and that its podium is of six storeys of stone with three-cornered
 * openings under a tower of silvery glass, are as published. Its plan, bowed sides and flat ends, the
 * masts at its two ends, the podium's roof and the fountain are read off the satellite photo the app
 * shows, in which the tower lies on its side across the road; the outlines of the tower and of the
 * podium are the buildings data's. No photograph of it from the ground could be had for this: the
 * hollow between its horns is as the model before this one had it, from photographs seen then; the
 * heights of its roof, 276 m, and of its horns, 298 m, and the stone piers at its foot are judgements.)
 */
export function rafalTower(model) {
  const T = RAFAL;
  const storey = T.deck / T.floors;
  const glass = { kind: 'glass', colour: '#7f9db3', storey, bay: 1.6, lit: 0.4, floors: 0.55, mirror: 0.7 };
  const screen = { kind: 'glass', colour: '#93afc2', storey, bay: 1.6, lit: 0, floors: 0.55, mirror: 0.7, ridge: 0.8, light: '#e6f0ff', glow: 0.55 };
  const within = { kind: 'glass', colour: '#34424d', storey, bay: 1.6, lit: 0, floors: 0.4, mirror: 0.2, open: true };
  const stone = { kind: 'pierced', colour: '#ddd0b0', storey: T.podium, bay: 3.2, holes: 0.45, lit: 0.7, light: '#ffe2b0', glow: 0.35 };
  const white = { kind: 'plain', colour: '#f0f1ef', light: '#e6f0ff', glow: 0.4 };

  // The two long sides, bowed: each in twelve pieces, lit as the curve they stand for. From the ground to
  // the podium's height, stone piers; from there to the roof, glass; from the roof to its own top, the screen.
  const pieces = 12;
  for (const side of [1, -1]) {
    for (let k = 0; k < pieces; k += 1) {
      // (Going round anticlockwise: north along the eastern side, south along the western.)
      const [y0, y1] = side > 0 ? [-T.long + (2 * T.long * k) / pieces, -T.long + (2 * T.long * (k + 1)) / pieces] : [T.long - (2 * T.long * k) / pieces, T.long - (2 * T.long * (k + 1)) / pieces];
      const [a, b] = [[side * rafalHalf(y0), y0], [side * rafalHalf(y1), y1]];
      const looks = (y) => {
        const slope = (-2 * (T.middle - T.ends) * y) / T.long ** 2; // how fast the side draws in
        return [side, -slope, 0];
      };
      const normals = [looks(y0), looks(y1), looks(y1), looks(y0)];
      const more = { out: [side, 0, 0], lines: [false, false, false, false], along: [b[0] - a[0], b[1] - a[1]], from: side > 0 ? [rafalHalf(-T.long), -T.long] : [-rafalHalf(T.long), T.long] };
      model.quad([...a, 0], [...b, 0], [...b, T.podium], [...a, T.podium], stone, more);
      model.quad([...a, T.podium], [...b, T.podium], [...b, T.deck], [...a, T.deck], glass, { ...more, normals });
      model.quad([...a, T.deck], [...b, T.deck], [...b, rafalRim(y1)], [...a, rafalRim(y0)], screen, { ...more, normals, lines: [false, false, true, false] });
      model.quad([...a, T.deck], [...b, T.deck], [...b, rafalRim(y1)], [...a, rafalRim(y0)], within, { ...more, out: [-side, 0, 0] });
    }
  }
  // Its two flat ends: the same, and as high as the horns.
  for (const end of [1, -1]) {
    const [a, b] = [[end * T.ends, end * T.long], [-end * T.ends, end * T.long]];
    const more = { out: [0, end, 0], lines: [false, false, false, false] };
    model.quad([...a, 0], [...b, 0], [...b, T.podium], [...a, T.podium], stone, more);
    model.quad([...a, T.podium], [...b, T.podium], [...b, T.deck], [...a, T.deck], glass, more);
    model.quad([...a, T.deck], [...b, T.deck], [...b, T.horns], [...a, T.horns], screen, { ...more, lines: [false, false, true, false] });
    model.quad([...a, T.deck], [...b, T.deck], [...b, T.horns], [...a, T.horns], within, { ...more, out: [0, -end, 0] });
    // A white pier up each of its two corners; and the mast on the horn, with its red lamp.
    for (const corner of [a, b]) beam(model, [corner[0], corner[1], 0], [corner[0], corner[1], T.horns], 1.3, white);
    beam(model, [0, end * (T.long - 0.6), T.horns - 1], [0, end * (T.long - 0.6), T.top], 0.5, white, { ends: true });
  }
  // The roof inside the screen, and the low house on it.
  const barrel = (along, across) => [
    ...Array.from({ length: pieces + 1 }, (_, k) => [rafalHalf(-T.long + (2 * T.long * k) / pieces) * across, (-T.long + (2 * T.long * k) / pieces) * along]),
    ...Array.from({ length: pieces + 1 }, (_, k) => [-rafalHalf(T.long - (2 * T.long * k) / pieces) * across, (T.long - (2 * T.long * k) / pieces) * along]),
  ];
  model.flat(raised(barrel(1, 1), T.deck + 0.2), { kind: 'plain', colour: '#e9e8e2', open: true });
  const house = barrel(0.62, 0.42);
  between(model, raised(house, T.deck + 0.2), raised(house, T.deck + 6.5), { kind: 'plain', colour: '#f1f0ea', open: true });
  model.flat(raised(house, T.deck + 6.5), { kind: 'plain', colour: '#f1f0ea', open: true });

  // The podium. (What was measured on the map is turned into the tower's own measure: the tower's length runs 83 degrees east of north.)
  const turn = (83 * Math.PI) / 180;
  const own = ([east, north]) => [east * Math.cos(turn) - north * Math.sin(turn), east * Math.sin(turn) + north * Math.cos(turn)];
  const ring = T.base.map(own);
  const wall = { kind: 'pierced', colour: '#d8c7a2', storey: T.podium / 6, bay: 3.2, holes: 0.3, lit: 0.5, light: '#ffe2b0', glow: 0.35 };
  between(model, raised(ring, 0), raised(ring, T.podium), wall);
  model.flat(raised(ring, T.podium), { kind: 'plain', colour: '#d9cdb4' });
  // (Under its top, a row of three-cornered openings.)
  const dark = { kind: 'plain', colour: '#4b3d2c' };
  ring.forEach((from, i) => {
    const to = ring[(i + 1) % ring.length];
    const long = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const out = [(to[1] - from[1]) / long, -(to[0] - from[0]) / long, 0];
    for (let at = 1.6; at < long - 1; at += 3.2) {
      const spot = (aside, up) => [from[0] + ((to[0] - from[0]) * (at + aside)) / long + out[0] * 0.06, from[1] + ((to[1] - from[1]) * (at + aside)) / long + out[1] * 0.06, up];
      model.facet(spot(-0.6, T.podium - 2.9), spot(0.6, T.podium - 2.9), spot(0, T.podium - 1.5), dark, { out, lines: [false, false, false] });
    }
  });
  // On its roof: the tennis court, blue in green; the round white tent; and the slatted shades of the terraces.
  const flatBox = ([east, north], long, wide, degrees, up, stuff) => {
    const angle = (degrees * Math.PI) / 180;
    const [along, across] = [[Math.sin(angle), Math.cos(angle)], [Math.cos(angle), -Math.sin(angle)]];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => own([east + (along[0] * s * long) / 2 + (across[0] * t * wide) / 2, north + (along[1] * s * long) / 2 + (across[1] * t * wide) / 2]));
    model.flat(raised(corners, up), stuff, { out: [0, 0, 1] });
  };
  const [courtEast, courtNorth, courtTurn] = T.court;
  flatBox([courtEast, courtNorth], 36, 18, courtTurn, T.podium + 0.12, { kind: 'plain', colour: '#3f7d5a' });
  flatBox([courtEast, courtNorth], 23.8, 11, courtTurn, T.podium + 0.2, { kind: 'plain', colour: '#3b5fa8' });
  for (const [east, north] of [[38, 62], [47, 56], [30, 50], [50, 12], [62, 8]]) flatBox([east, north], 9, 5, courtTurn - 90, T.podium + 3, { kind: 'plain', colour: '#6f553f' });
  const [tentEast, tentNorth, tentRadius] = T.tent;
  lathe(model, frame([0, 0], 0), own([tentEast, tentNorth]), [[tentRadius, T.podium + 2.6], [tentRadius * 0.45, T.podium + 4.2], [0.3, T.podium + 6.4]], { kind: 'plain', colour: '#f4f2ea', light: '#ffe9c4', glow: 0.5 }, { cuts: 16 });

  // Before the door: the fountain, round, in its low wall; and the canopy over the door, a white crescent on columns.
  const [fountEast, fountNorth, fountRadius] = T.fountain;
  const middle = own([fountEast, fountNorth]);
  const to = frame(middle, 0);
  lathe(model, to, [0, 0], [[fountRadius + 0.9, 0], [fountRadius + 0.9, 0.7], [fountRadius, 0.7], [fountRadius, 0.45]], { kind: 'plain', colour: '#e9e4d6' }, { cuts: 24 });
  model.flat(Array.from({ length: 24 }, (_, k) => to(Math.cos((k / 24) * TAU) * fountRadius, Math.sin((k / 24) * TAU) * fountRadius, 0.45)), { kind: 'plain', colour: '#3f8f86', light: '#7fe0d0', glow: 0.5 });
  // (The door is in the tower's southern side: the canopy lies between the fountain and the tower.)
  const towards = Math.atan2(-middle[1], -middle[0]);
  const arc = (k, radius, up) => to(Math.cos(towards - 1.05 + (2.1 * k) / 8) * radius, Math.sin(towards - 1.05 + (2.1 * k) / 8) * radius, up);
  for (let k = 0; k < 8; k += 1) {
    const corners = [arc(k, 11.5, 5.6), arc(k, 17.5, 5.6), arc(k + 1, 17.5, 5.6), arc(k + 1, 11.5, 5.6)];
    model.quad(...corners, white, { out: [0, 0, 1], lines: [false, false, false, false] });
    model.quad(...corners, { kind: 'plain', colour: '#f3f1ea', light: '#ffe9c4', glow: 0.7 }, { out: [0, 0, -1], lines: [false, false, false, false] });
    if (k % 2 === 0) beam(model, arc(k + 0.5, 16.6, 0), arc(k + 0.5, 16.6, 5.6), 0.4, white);
  }
  return { beacons: [[0, T.long - 0.6, T.top + 0.6], [0, -(T.long - 0.6), T.top + 0.6]] };
}

// ── The Riyadh TV Tower ───────────────────────────────────────────────────

// The tower's measures, in metres.
export const TV_TOWER = {
  foot: 5.6, // half the width of its shaft at the ground…
  neck: 3.5, // …and under its lantern
  shaft: 116, // how high the shaft is that wide
  fins: [13, 1.3, 24], // the four fins that brace its foot: how far each reaches from the middle, half its thickness, and how high it rises
  collar: [114, 4.6], // where the lantern leaves the shaft: the height, and how far its corners stand from the middle there
  girdle: [125, 131, 12.8], // the lantern's widest belt: from this height to this, and half its width from side to side
  roof: [139.5, 6], // the lantern's roof: its height, and half its width
  drum: [2.6, 150], // the shaft that goes on over the lantern: half its width, and its top
  mast: [160, 170], // the mast: where it grows thinner, and its tip
};

/** A square of so wide a half-width with its four corners cut off by so much: eight corners [east, north], anticlockwise. */
const chamfered = (half, cut) => [[half - cut, -half], [half, -half + cut], [half, half - cut], [half - cut, half], [-half + cut, half], [-half, half - cut], [-half, -half + cut], [-half + cut, -half]];
/** A ring of eight corners so far from the middle, the first so far round (in radians, anticlockwise from east), at a height. */
const eight = (out, turn, up) => Array.from({ length: 8 }, (_, k) => [Math.cos(turn + (k / 8) * TAU) * out, Math.sin(turn + (k / 8) * TAU) * out, up]);

/**
 * The Riyadh TV Tower (Maurice Novarina; built in the later 1970s), in the grounds of the broadcasting
 * authority in Al Wisham: 170 m to the tip of its mast, and until Al Faisaliah Tower the highest thing in
 * the country.
 *
 * A shaft of pale concrete, square with its corners cut off, 11 m wide at the ground and 7 m under the
 * lantern, braced at its foot by four fins. Near its top it carries the lantern it is known by: a body
 * of glass and gold cut in facets like a stone in its setting, eight-sided, 26 m across at its belt,
 * drawing in below to the shaft and above to a roof of 12 m. Over the lantern the shaft goes on, thinner,
 * and ends in the mast. By night the lantern is lit from within, the shaft floodlit.
 *
 * (Its height and its architect are as published. The lantern's width, that it is eight-sided with its
 * sides to the four winds, and the width of its roof are measured on the satellite photo the app shows,
 * which looks nearly straight down on it. The heights at which the lantern begins and ends, the taper of
 * the shaft and the fins are as the model before this one had them, from photographs seen then; that the
 * lantern's facets are three-cornered, and the mast, are a likeness. What stands round its foot is not
 * built: the photo shows a round paved court there, and a pointed one to the south.)
 */
export function tvTower(model) {
  const T = TV_TOWER;
  const to = frame([0, 0], 0);
  const concrete = { kind: 'plain', colour: '#d9c9a9', light: '#ffe2ae', glow: 0.4, ridge: 0.45 };
  const halfAt = (up) => T.foot - (T.foot - T.neck) * (Math.min(up, T.shaft) / T.shaft);

  // The shaft: square with its corners cut off, drawing in as it rises; a line up each of its eight edges.
  const levels = [0, 24, 55, 86, T.collar[0] + 3];
  for (let i = 0; i < levels.length - 1; i += 1) {
    const [low, high] = [levels[i], levels[i + 1]];
    between(model, raised(chamfered(halfAt(low), halfAt(low) * 0.4), low), raised(chamfered(halfAt(high), halfAt(high) * 0.4), high), concrete, { lines: [false, true, false, true] });
  }
  // The four fins at its foot: each a thin wall that leans in to the shaft.
  const [reach, thick, tall] = T.fins;
  for (let k = 0; k < 4; k += 1) {
    const fin = to.sub([0, 0], (k * Math.PI) / 2);
    const inner = halfAt(tall) - 0.6;
    for (const side of [1, -1]) {
      model.facet(fin(inner, side * thick, 0), fin(reach, side * thick, 0), fin(inner, side * thick, tall), concrete, { out: fin.way(0, side), lines: [false, true, false] });
    }
    model.quad(fin(reach, -thick, 0), fin(reach, thick, 0), fin(inner, thick, tall), fin(inner, -thick, tall), concrete, { out: fin.way(1, 0, 1), lines: [false, true, false, true] });
  }

  // The lantern. Its underside, from the shaft out to the belt: sixteen three-cornered facets of gold-coloured
  // panel, lit from below by night.
  const gold = { kind: 'plain', colour: '#bfa770', light: '#ffce63', glow: 0.6, ridge: 0.7 };
  const glass = { kind: 'glass', colour: '#3f566c', storey: 3.5, bay: 2, lit: 1, floors: 0.3, mirror: 0.45, ridge: 1, light: '#ffd27a', glow: 0.9 };
  const [collarUp, collarOut] = T.collar;
  const [beltLow, beltHigh, beltHalf] = T.girdle;
  const [roofUp, roofHalf] = T.roof;
  const corner = Math.cos(Math.PI / 8); // an eight-sided ring's corners stand further out than its sides, by one over this
  const collar = eight(collarOut, 0, collarUp);
  const low = eight(beltHalf / corner, Math.PI / 8, beltLow);
  const high = eight(beltHalf / corner, Math.PI / 8, beltHigh);
  const top = eight(roofHalf / corner, 0, roofUp);
  const outwards = (...corners) => [corners.reduce((sum, one) => sum + one[0], 0), corners.reduce((sum, one) => sum + one[1], 0), 0];
  for (let k = 0; k < 8; k += 1) {
    const next = (k + 1) % 8;
    // (Each corner of the belt stands between two corners of the collar, and so round: the facets are three-cornered.)
    model.facet(collar[k], collar[next], low[k], gold, { out: outwards(collar[k], collar[next], low[k]) });
    model.facet(low[k], collar[next], low[next], gold, { out: outwards(low[k], collar[next], low[next]) });
    // The belt: glass, with a band of gold at its foot, at its middle and at its head.
    model.quad(low[k], low[next], high[next], high[k], glass, {
      out: outwards(low[k], low[next]),
      bands: [
        { from: beltLow, to: beltLow + 0.7, stuff: { ...gold, glow: 0.9 } },
        { from: (beltLow + beltHigh) / 2 - 0.35, to: (beltLow + beltHigh) / 2 + 0.35, stuff: { ...gold, glow: 0.9 } },
        { from: beltHigh - 0.7, to: beltHigh, stuff: { ...gold, glow: 0.9 } },
      ],
    });
    // Its upper side, from the belt in to the roof: sixteen facets of glass.
    model.facet(high[k], high[next], top[next], glass, { out: outwards(high[k], high[next], top[next]) });
    model.facet(top[next], high[next], top[(next + 1) % 8], glass, { out: outwards(top[next], high[next], top[(next + 1) % 8]) });
  }
  // Its roof, behind a low rim of gold. (The roof, and all that stands on it, lies inside the round the
  // tower's shadow is thrown from: it takes none.)
  const rim = top.map(([east, north, up]) => [east, north, up + 1.1]);
  between(model, top, rim, { ...gold, glow: 0.9 }, { lines: [false, false, true, false] });
  between(model, top, rim, { kind: 'plain', colour: '#a8946a', open: true }, { way: -1 });
  model.flat(top, { kind: 'plain', colour: '#b9ad94', open: true });
  // Over the lantern: the shaft again, thinner; and the mast, in two lengths.
  const [drumHalf, drumTop] = T.drum;
  const drum = chamfered(drumHalf, 1);
  between(model, raised(drum, roofUp), raised(drum, drumTop), { ...concrete, open: true }, { lines: [false, true, false, true] });
  model.flat(raised(drum, drumTop), { kind: 'plain', colour: '#d8cfb9', open: true });
  const steel = { kind: 'plain', colour: '#d5d7d8', light: '#ffffff', glow: 0.35, open: true };
  const [thinner, tip] = T.mast;
  beam(model, [0, 0, drumTop], [0, 0, thinner], 1.4, steel, { ends: true });
  beam(model, [0, 0, thinner], [0, 0, tip], 0.7, steel, { ends: true });
  return { beacons: [[0, 0, tip + 0.6]] };
}

// ── The Riyadh Water Tower ────────────────────────────────────────────────

// The tower's measures, in metres.
export const WATER_TOWER = {
  stripes: 32, // round it, tan and blue by turns
  stem: 5.45, // the radius of its stem
  // Its outline from the ground up: [radius, height]. The stem; where it begins to open; the bowl's straight slope; its widest edge; the top of its rim.
  profile: [[5.45, 0], [5.45, 31], [5.45, 34.9], [5.9, 36.3], [6.7, 37.5], [7.75, 38.5], [10.43, 40.5], [26, 52.1], [25, 53.4]],
  storey: [15.5, 56.4], // the round top storey on the terrace: its radius, and the height of its eaves
  eaves: 17.5, // how far out the roof's eaves reach
  top: 61, // the point of its roof
  mast: 67.5, // the tip of the mast on it
};

/**
 * The Riyadh Water Tower (Sune Lindström of VBB, 1971), in Al Watan Park by the old town: 61 m, after his
 * "mushroom" at Örebro in Sweden: a stem that opens into a wide flat bowl of water, with a round storey
 * and a look-out on top.
 *
 * The stem is 11 m thick and stands straight for 35 m; then it turns outwards in a tight curve and runs
 * on as a flat cone to a rim 52 m across. All of it is painted in thirty-two stripes that run up the
 * stem and out across the underside of the bowl to the rim: every other one tan, and between them
 * stripes that are cream on the stem, white where it turns, and sky-blue on the bowl. On top is a
 * terrace behind a railing; a round glazed storey; a low cone of a roof; and a thin mast.
 *
 * (Its height, its designer and the tower it was modelled on are as published. Its rim, 52 m across,
 * and the roof on its terrace are measured on the satellite photo the app shows, and the buildings data
 * has the same round. Its outline from the side, the stripes, their number and their colours are read
 * off a photograph of about 2010, taken from the park; it has been painted otherwise before, in yellow
 * and white and in yellow and black, and may be again. The stem's lower third was behind trees in that
 * photograph: it is taken to run straight to the ground, as an older one shows it.)
 */
export function waterTower(model) {
  const T = WATER_TOWER;
  const to = frame([0, 0], 0);
  const lit = { light: '#ffeccb', glow: 0.5 };
  const tan = { kind: 'plain', colour: '#86733f', ...lit };
  const cream = { kind: 'plain', colour: '#efe2b4', ...lit };
  const white = { kind: 'plain', colour: '#f1f3f1', ...lit };
  const pale = { kind: 'plain', colour: '#c4d9ec', ...lit };
  const blue = { kind: 'plain', colour: '#4d86c4', ...lit };
  // (The stripes between the tan ones: cream up the stem to 31 m, white from there over the turn, paling into blue on the bowl.)
  const others = [cream, white, white, white, white, pale, blue, blue];
  lathe(model, to, [0, 0], T.profile, (piece, cut) => (cut % 2 === 0 ? tan : others[piece]), { cuts: T.stripes });

  // The terrace, inside the rim; its railing: a post at every stripe, and a rail.
  const [rimRadius, terrace] = T.profile[T.profile.length - 1];
  const [storeyRadius, eavesUp] = T.storey;
  const round = (radius, up, count = T.stripes) => Array.from({ length: count }, (_, k) => [Math.cos((k / count) * TAU) * radius, Math.sin((k / count) * TAU) * radius, up]);
  model.flat(round(rimRadius, terrace), { kind: 'plain', colour: '#d5dadb' }, { holes: [round(storeyRadius, terrace)] });
  const rail = { kind: 'plain', colour: '#f4f5f3' };
  for (const [east, north] of round(rimRadius - 0.3, 0)) beam(model, [east, north, terrace], [east, north, terrace + 1.15], 0.12, rail);
  lathe(model, to, [0, 0], [[rimRadius - 0.3, terrace + 1.05], [rimRadius - 0.3, terrace + 1.2]], rail, { cuts: T.stripes });
  // The round storey: glass between cream posts, its lamps on by night; and its roof, a low cone that stands out past it.
  lathe(model, to, [0, 0], [[storeyRadius, terrace], [storeyRadius, eavesUp]], (piece, cut) => (cut % 4 === 0 ? cream : { kind: 'glass', colour: '#3c4a52', storey: 3.2, bay: 2, lit: 1, floors: 0, mirror: 0.3 }), { cuts: T.stripes * 2 });
  model.flat(round(T.eaves, eavesUp), { kind: 'plain', colour: '#e4dcc0', light: '#ffeccb', glow: 0.6 }, { out: [0, 0, -1], holes: [round(storeyRadius, eavesUp)] });
  lathe(model, to, [0, 0], [[T.eaves, eavesUp], [T.eaves, eavesUp + 0.35], [0, T.top]], { kind: 'plain', colour: '#a9a48e' }, { cuts: T.stripes });
  // The mast, and the red lamp on its tip.
  beam(model, [0, 0, T.top - 0.3], [0, 0, T.mast], 0.25, rail, { ends: true });
  return { beacons: [[0, 0, T.mast + 0.6]] };
}

// ── The Grand Mosque of Riyadh ────────────────────────────────────────────

// The mosque's measures, in metres. Places are [east, north] in its own frame, which is turned with its
// walls: the qibla wall is its west side, the square lies to its east, Imam Turki bin Abdullah Street to
// its north and the palace to its south.
export const TURKI_MOSQUE = {
  hall: [-62, 3.5, -52.3, 52], // the prayer hall: its west, east, south and north walls
  wall: 11, // the top of the hall's walls…
  roof: 10.4, // …and its roof behind them
  // The little towers on that roof that let light and air into the hall, one over every bay: where the
  // north-western one stands; how far it is to the next, eastwards and southwards; how many there are,
  // from west to east and from north to south; half their width; and how high they stand.
  lanterns: { first: [-53.9, 45.2], step: [8.5, 8.45], count: [7, 12], half: 1.8, top: 12.9 },
  piers: { wide: 2.6, proud: 1.2, top: 11.7 }, // the square piers of the qibla wall, one between every two rows of lanterns
  surround: [[3.5, -54], [54.5, -54], [54.5, 50], [49.5, 52], [3.5, 52]], // the wings round the court, with the walks under them
  wings: 10, // their roofs…
  parapet: 10.6, // …and the walls round those
  court: [12, 36.6, -40, 33.8], // the court itself: west, east, south, north
  bay: 8.2, // from one column of its walks to the next
  walk: 6, // how deep the walks behind those columns are (the western one reaches to the wall of the hall)
  eaves: 7.6, // the underside of the beam the columns carry
  cover: { top: 11, rows: 9, open: 2 }, // the roof of white beams and cloth over the court: its height, its rows of squares, and how many of them stand open, at the southern end
  front: [54.5, 61], // the row of gatehouses and forecourts on the square: from the wing's wall out to their faces
  // The blocks along that front, from north to south, each [south, north, top]: gatehouses, and between them forecourts.
  blocks: [[26.1, 33.6, 11], [9.5, 19.1, 11], [-7.9, 3.3, 13.2], [-23.7, -14.1, 11], [-40.3, -30.7, 11], [-61.4, -47.3, 11]],
  gate: { block: 2, out: 62.5, door: [5, 7.4, 10] }, // the great gate among them, on the line of the mihrab: which block it is, how far out its face stands, and its doorway: how wide, where it begins to narrow, its point
  minaret: { at: [46.65, 37], foot: 4.2, top: 3.7, crown: 46.6, rim: 48.2, horns: 50 }, // half its width at the foot and under its crown; the floor of the crown, its rim, and the tips of its four horns
  portico: [-54, 61, -61.4, -57, 7.5], // the colonnade along the palace's square: west, east, front, back, and the top of its roof
  bridges: [[-55.5, -41, -104], [45, 56.5, -103]], // the two bridges to the palace, each: west, east, and where it meets the palace
  deck: [5.2, 10.2], // the underside and the roof of the storey they carry
  // The two houses between the hall and the street, and the courts in them.
  houses: [
    { ring: [[-60.5, 58], [-29, 58], [-29, 81.3], [-52.2, 89.6], [-60.4, 70.7]], courts: [[-55, -46.5, 64, 72.5], [-40, -33, 62, 70]] },
    { ring: [[-25, 58], [3.5, 58], [3.5, 69.1], [-25, 79.8]], courts: [[-15, -7, 62, 70]] },
  ],
  house: 8,
  wing: [[67.6, 12.4], [125, 12.4], [125, 27.1], [67.6, 46]], // the wing along the street, east of the minaret
  wingTop: 11.5,
  canopy: [59.8, 67.6, 33.6, 46.5, 8.1], // the white canopy between that wing and the mosque
  arcade: { rows: [78, 86.4], from: 5, step: -5.45, bays: 20, top: 9 }, // the long colonnade that crosses the square: its two rows of columns, its northern end, the step from one pair to the next, how many steps, and the underside of its roof
  square: [[54.5, -104], [128, -104], [128, 12.4], [61, 12.4], [61, 33.6], [54.5, 33.6]], // the paving of the great square, east of the mosque
  star: [109.5, -40.5, 9], // the star laid in that paving: its middle, and how far its points reach
};

/**
 * The Imam Turki bin Abdullah Grand Mosque (Rasem Badran for the Arriyadh Development Authority,
 * opened in January 1993), in the old town beside the Justice Palace: the Friday mosque of Riyadh, on
 * the ground where one has stood since about 1830. It holds 17,000, and with its courts and houses it
 * covers 16,800 square metres. It was given the Aga Khan Award for Architecture in 1995.
 *
 * It is built in the manner of Najd, of the pale local limestone that looks golden under its lamps:
 * plain walls with rows of small three-cornered openings, doorways that end in a point, flat roofs
 * behind low parapets. The prayer hall is a wide low block, 104 m along its qibla wall and 66 m deep;
 * on its roof stand eighty-four little towers, one over every bay, which let light and air down to the
 * columns. East of it lies the court, 74 m long, with a walk behind round columns on every side and,
 * over it, a roof of white beams and cloth that can be drawn back: here seven of its nine rows are
 * closed and two stand open. Towards the square the mosque shows a row of gatehouses with columned
 * forecourts between them, the great gate in the middle, on the line of the mihrab.
 *
 * One minaret stands at the north-east corner, by the street: a square tower of darker stone that
 * draws in a little as it rises, 50 m high, with a slit in each face every few metres and a crown of
 * four horns. Two bridges cross the square between the mosque and the palace, a storey carried on
 * piers; a colonnade runs along the mosque's side of that square; the imam's and the muezzin's houses
 * stand between the hall and the street; a wing closes the great square to the north; and a long
 * colonnade of tall columns crosses that square from north to south.
 *
 * (What it holds, the ground it covers, its builders and dates, the stone, the two bridges and the
 * height of its minarets are as published: two minarets of 50 m are spoken of. Only one could be found:
 * in the satellite photo the app shows, in which it lies along its own shadow and both are of the
 * length a tower of 50 m would give, and in four photographs taken from the streets and the square;
 * so one is built. The plan is measured on that satellite photo, which is taken at a slant of about
 * 0.3 m to the north for every metre of height: the hall and the towers on its roof, which were
 * counted; the court and the squares of its cover; the gatehouses and forecourts; the bridges, the
 * houses, the wing and the colonnades. The buildings data has the same outline. Heights other than the
 * minaret's are judged from shadows there and against the minaret in the photographs: the hall some
 * 11 m, the wings 10 m. The look of the minaret, the columns, the pointed doorways and the openings are
 * as a photograph from the square shows them; how many doorways there are and where, the storey on
 * each bridge and the fronts of the houses and of the wing are a likeness. No mihrab is shown on the
 * qibla wall, which trees hide in the photo.)
 */
export function turkiMosque(model) {
  const G = TURKI_MOSQUE;
  const to = frame([0, 0], 0);
  const up = (ring, height) => ring.map(([east, north]) => [east, north, height]);
  const rect = ([west, east, south, north]) => [[west, south], [east, south], [east, north], [west, north]];
  // Riyadh limestone: pale and warm by day, golden under the floodlights.
  const stone = { kind: 'plain', colour: '#e3d0af', light: '#ffc978', glow: 0.6 };
  const shaded = { kind: 'plain', colour: '#dcc8a6' }; // (the same stone where no floodlight reaches)
  // (A roof lies level with the top of the block that throws the building's shadow, and what stands on it within that block: they take none.)
  const roofing = { kind: 'plain', colour: '#e8dabd', open: true };
  const inside = { kind: 'plain', colour: '#dcc8a6', open: true };
  const dark = { kind: 'plain', colour: '#3a2d22' };
  const timber = { kind: 'plain', colour: '#6f553a' };
  const pillar = { kind: 'plain', colour: '#eadbc0', light: '#ffd9a0', glow: 0.45 };
  // Walls with windows in them: the houses, the wing, the storeys on the bridges.
  const windowed = { kind: 'pierced', colour: '#e1cdab', storey: 4, bay: 3.2, holes: 0.22, lit: 0.35, light: '#ffc978', glow: 0.35 };

  /** The way a wall that runs from a to b looks: to the right of that way. And how long it is, and the way along it. */
  const wallOf = (a, b) => {
    const long = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = [(b[0] - a[0]) / long, (b[1] - a[1]) / long];
    return { long, along, out: [along[1], -along[0]] };
  };
  /** A row of three-cornered openings on a wall from a to b, at a height: one every so often. Returns how many. */
  const openings = (a, b, height, { every = 2.8, wide = 0.7, tall = 0.8, margin = 1.6, proud = 0.05 } = {}) => {
    const { long, along, out } = wallOf(a, b);
    const count = Math.floor((long - margin * 2) / every) + 1;
    if (!(count >= 1)) return 0;
    const first = (long - (count - 1) * every) / 2;
    for (let k = 0; k < count; k += 1) {
      const spot = (aside, rise) => [a[0] + along[0] * (first + k * every + aside) + out[0] * proud, a[1] + along[1] * (first + k * every + aside) + out[1] * proud, height + rise];
      model.facet(spot(-wide / 2, 0), spot(wide / 2, 0), spot(0, tall), dark, { out: [out[0], out[1], 0], lines: [false, false, false] });
    }
    return count;
  };
  /** A doorway that ends in a point, dark, in a wall from a to b: its middle so far along, so wide, straight up to where it turns, and its point. */
  const doorway = (a, b, at, wide, turn, point, proud = 0.06) => {
    const { along, out } = wallOf(a, b);
    const spot = (aside, rise) => [a[0] + along[0] * (at + aside) + out[0] * proud, a[1] + along[1] * (at + aside) + out[1] * proud, rise];
    model.quad(spot(-wide / 2, 0), spot(wide / 2, 0), spot(wide / 2, turn), spot(-wide / 2, turn), dark, { out: [out[0], out[1], 0], lines: [false, false, false, false] });
    model.facet(spot(-wide / 2, turn), spot(wide / 2, turn), spot(0, point), dark, { out: [out[0], out[1], 0], lines: [false, false, false] });
  };
  /** Openings set in a triangle over a doorway: one, two and three of them, from the top down. */
  const cluster = (a, b, at, top) => {
    const { along } = wallOf(a, b);
    for (let row = 0; row < 3; row += 1) {
      const half = row * 0.5;
      const from = [a[0] + along[0] * (at - half - 0.5), a[1] + along[1] * (at - half - 0.5)];
      const until = [a[0] + along[0] * (at + half + 0.5), a[1] + along[1] * (at + half + 0.5)];
      openings(from, until, top - (row + 1) * 0.85, { every: 1, wide: 0.6, tall: 0.65, margin: 0.5 });
    }
  };
  /** A round column of stone on a square foot, with a head that steps out under what it carries. */
  const column = (east, north, top, { radius = 0.5, sides = 8 } = {}) => {
    const at = (k, height) => [east + Math.cos((k / sides) * TAU) * radius, north + Math.sin((k / sides) * TAU) * radius, height];
    const looks = (k) => [Math.cos((k / sides) * TAU), Math.sin((k / sides) * TAU), 0];
    for (let k = 0; k < sides; k += 1) {
      model.quad(at(k, 0.45), at(k + 1, 0.45), at(k + 1, top - 0.5), at(k, top - 0.5), pillar, { out: looks(k + 0.5), normals: [looks(k), looks(k + 1), looks(k + 1), looks(k)], lines: [false, false, false, false] });
    }
    block(model, to, [east - radius * 1.5, east + radius * 1.5, north - radius * 1.5, north + radius * 1.5], 0, 0.45, pillar);
    taper(model, to, [east - radius * 1.1, east + radius * 1.1, north - radius * 1.1, north + radius * 1.1], [east - radius * 1.9, east + radius * 1.9, north - radius * 1.9, north + radius * 1.9], top - 0.5, top, pillar, { top: null });
  };
  /** A flat roof behind a parapet: the walls of an outline up to the parapet's top, the top of the parapet, its inner face, and the roof inside it, with any courts cut out of it. */
  const roofed = (ring, top, roofAt, stuff, { courts = [], walls = true } = {}) => {
    const within = inset(ring, 0.5);
    if (walls) between(model, up(ring, 0), up(ring, top), stuff);
    model.flat(up(ring, top), { kind: 'plain', colour: stone.colour, open: true }, { holes: [up(within, top)] });
    between(model, up(within, roofAt), up(within, top), inside, { way: -1 });
    model.flat(up(within, roofAt), roofing, { holes: courts.map((court) => up(court, roofAt)) });
  };

  // ── The prayer hall: its four walls, its roof, and the towers on the roof.
  const [hallWest, hallEast, hallSouth, hallNorth] = G.hall;
  roofed(rect(G.hall), G.wall, G.roof, stone);
  const L = G.lanterns;
  const lantern = { kind: 'pierced', colour: '#dcc9a6', storey: L.top - G.roof, bay: 0.9, holes: 0.5, lit: 0.9, light: '#ffd9a0', glow: 0.3, open: true };
  for (let i = 0; i < L.count[0]; i += 1) {
    for (let k = 0; k < L.count[1]; k += 1) {
      const [east, north] = [L.first[0] + i * L.step[0], L.first[1] - k * L.step[1]];
      block(model, to, [east - L.half, east + L.half, north - L.half, north + L.half], G.roof, L.top, lantern, { top: roofing });
    }
  }
  // The qibla wall: a square pier between every two rows of towers, a little higher than the wall; and openings between the piers.
  for (let k = 0; k <= L.count[1]; k += 1) {
    const north = L.first[1] + L.step[1] / 2 - k * L.step[1];
    block(model, to, [hallWest - G.piers.proud, hallWest + 0.3, north - G.piers.wide / 2, north + G.piers.wide / 2], 0, G.piers.top, stone);
    if (k < L.count[1]) openings([hallWest, north - G.piers.wide / 2], [hallWest, north - L.step[1] + G.piers.wide / 2], 8.7, { every: 2.2, margin: 1.2 });
  }
  // Its north and south walls, on the lanes: openings high up, and three doorways each.
  for (const [a, b] of [[[hallEast, hallNorth], [hallWest, hallNorth]], [[hallWest, hallSouth], [hallEast, hallSouth]]]) {
    openings(a, b, 8.7);
    for (const along of [12, 32.75, 53.5]) doorway(a, b, along, 2.6, 4.2, 5.6);
  }

  // ── The wings round the court: one roof with the court cut out of it; the walks under it, behind their columns.
  const [courtWest, courtEast, courtSouth, courtNorth] = G.court;
  const court = rect(G.court);
  const lip = inset(court, -0.5);
  const surround = G.surround;
  // (Its west side is the wall of the hall, which stands higher.)
  for (let i = 0; i < surround.length - 1; i += 1) between(model, up([surround[i], surround[i + 1]], 0), up([surround[i], surround[i + 1]], G.parapet), stone, { lines: [false, false, false, false] });
  between(model, up([[hallEast, hallSouth], surround[0]], 0), up([[hallEast, hallSouth], surround[0]], G.parapet), stone);
  roofed(surround, G.parapet, G.wings, stone, { courts: [lip], walls: false });
  // (Round the court the roof ends in a parapet too; under it the beam the columns carry.)
  model.flat(up(lip, G.parapet), { kind: 'plain', colour: stone.colour, open: true }, { holes: [up(court, G.parapet)] });
  between(model, up(lip, G.wings), up(lip, G.parapet), inside);
  between(model, up(court, G.eaves), up(court, G.parapet), shaded, { way: -1 });
  // The walks: their ceilings of timber, and the walls behind them (the western one's is the wall of the hall, with its nine doorways).
  const walks = [hallEast, courtEast + G.walk, courtSouth - G.walk, courtNorth + G.walk];
  model.flat(up(rect(walks), G.eaves), timber, { out: [0, 0, -1], holes: [up(court, G.eaves)] });
  const [walkWest, walkEast, walkSouth, walkNorth] = walks;
  const backs = [[[walkWest, walkNorth], [walkEast, walkNorth]], [[walkEast, walkNorth], [walkEast, walkSouth]], [[walkEast, walkSouth], [walkWest, walkSouth]]];
  for (const [a, b] of backs) {
    between(model, up([b, a], 0), up([b, a], G.eaves), shaded);
    for (let along = G.walk + G.bay / 2; along < wallOf(a, b).long - G.walk; along += G.bay) doorway(b, a, wallOf(a, b).long - along, 2.2, 3.6, 4.8);
  }
  for (let k = 0; k < G.cover.rows; k += 1) doorway([hallEast, courtSouth], [hallEast, courtNorth], (k + 0.5) * G.bay, 3.2, 5.4, 7);
  // The court's floor of pale stone; its columns, one every 8.2 m on all four sides; and openings in the beam over them.
  model.flat(up(court, 0.1), { kind: 'plain', colour: '#ebe4d3' });
  for (let k = 0; k <= G.cover.rows; k += 1) for (const east of [courtWest, courtEast]) column(east, courtNorth - k * G.bay, G.eaves);
  for (const east of [courtWest + G.bay, courtWest + G.bay * 2]) for (const north of [courtSouth, courtNorth]) column(east, north, G.eaves);
  for (let i = 0; i < 4; i += 1) openings(court[(i + 1) % 4], court[i], 8.7, { every: 2.05, margin: 1 });
  // Its cover: white beams along every row of columns and across, and cloth in the squares between; the two southern rows stand open.
  const white = { kind: 'plain', colour: '#f3f3ee' };
  for (let i = 0; i <= 3; i += 1) beam(model, [courtWest + i * G.bay, courtSouth, G.cover.top], [courtWest + i * G.bay, courtNorth, G.cover.top], 0.5, white);
  for (let k = 0; k <= G.cover.rows; k += 1) beam(model, [courtWest, courtNorth - k * G.bay, G.cover.top], [courtEast, courtNorth - k * G.bay, G.cover.top], 0.5, white);
  const closed = rect([courtWest, courtEast, courtNorth - (G.cover.rows - G.cover.open) * G.bay, courtNorth]);
  model.flat(up(closed, G.cover.top - 0.1), { kind: 'plain', colour: '#a4a8a4' });
  model.flat(up(closed, G.cover.top - 0.15), { kind: 'plain', colour: '#d6d6cf' }, { out: [0, 0, -1] });

  // ── The front on the square: gatehouses, and between them forecourts behind two columns and a beam. The great gate stands further out and higher.
  const [frontWest, frontEast] = G.front;
  G.blocks.forEach(([south, north, top], index) => {
    const great = index === G.gate.block;
    const east = great ? G.gate.out : frontEast;
    block(model, to, [frontWest, east, south, north], 0, top, stone, { top: roofing, faces: { west: null } });
    // (Where it stands higher than the wing behind it, its back shows over the wing's roof.)
    model.quad([frontWest, north, G.parapet], [frontWest, south, G.parapet], [frontWest, south, top], [frontWest, north, top], stone, { out: [-1, 0, 0] });
    const [a, b] = [[east, south], [east, north]];
    const middle = (north - south) / 2;
    if (great) {
      doorway(a, b, middle, G.gate.door[0], G.gate.door[1], G.gate.door[2]);
      cluster(a, b, middle, top - 0.2);
    } else if (north - south > 8) {
      doorway(a, b, middle, 3, 5, 6.8);
      cluster(a, b, middle, top - 0.5);
    }
    openings(a, b, top - 1.2, { every: great ? 1.4 : 2.4, margin: 0.9 });
    const next = G.blocks[index + 1];
    if (!next) return;
    // The forecourt south of it: a door in the wing's wall, two columns at its mouth, and the beam they carry.
    const [from, until] = [next[1], south];
    doorway([frontWest, from], [frontWest, until], (until - from) / 2, 2.6, 4.2, 5.6);
    for (const share of [0.3, 0.7]) column(frontEast - 0.9, from + (until - from) * share, 6.9, { radius: 0.45 });
    block(model, to, [frontEast - 1.8, frontEast, from, until], 6.9, 7.7, stone);
    model.flat(up(rect([frontEast - 1.8, frontEast, from, until]), 6.9), shaded, { out: [0, 0, -1] });
  });

  // ── The minaret: a square tower of darker stone that draws in as it rises; slits up each face, a band, two openings under the crown; and the crown of four horns.
  const M = G.minaret;
  const tower = to.sub(M.at);
  const tan = { kind: 'plain', colour: '#c79f70', light: '#ffd08a', glow: 0.8 };
  const halfAt = (height) => M.foot + ((M.top - M.foot) * Math.min(height, M.crown)) / M.crown;
  taper(model, tower, [-M.foot, M.foot, -M.foot, M.foot], [-M.top, M.top, -M.top, M.top], 0, M.crown, tan, { top: { kind: 'plain', colour: '#b8946a' } });
  const band = halfAt(36.5) + 0.12;
  block(model, tower, [-band, band, -band, band], 36.3, 36.7, tan, { top: null });
  for (const [east, north] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const face = (aside, height) => tower((halfAt(height) + 0.05) * east - aside * north, (halfAt(height) + 0.05) * north + aside * east, height);
    const out = tower.way(east, north);
    for (const height of [15, 20.5, 26, 31.5, 40.5]) model.quad(face(-0.18, height), face(0.18, height), face(0.18, height + 1.3), face(-0.18, height + 1.3), dark, { out, lines: [false, false, false, false] });
    for (const aside of [-0.85, 0.85]) model.facet(face(aside - 0.32, 43.2), face(aside + 0.32, 43.2), face(aside, 43.95), dark, { out, lines: [false, false, false] });
    // The crown on this side: its rim dips between the horns.
    const [outer, inner, dip] = [M.top, M.top - 0.4, M.rim - 0.75];
    const rim = (reach, aside, height) => tower(reach * east - aside * north, reach * north + aside * east, height);
    for (const [from, until] of [[-outer, 0], [0, outer]]) {
      const [low, high] = [from === 0 ? dip : M.rim, until === 0 ? dip : M.rim];
      model.quad(rim(outer, from, M.crown), rim(outer, until, M.crown), rim(outer, until, high), rim(outer, from, low), tan, { out, lines: [false, false, true, false] });
      const [within0, within1] = [Math.max(from, -inner), Math.min(until, inner)];
      model.quad(rim(inner, within0, M.crown), rim(inner, within1, M.crown), rim(inner, within1, high), rim(inner, within0, low), tan, { out: [-out[0], -out[1], 0], lines: [false, false, true, false] });
      model.quad(rim(outer, from, low), rim(outer, until, high), rim(inner, within1, high), rim(inner, within0, low), tan, { out: [0, 0, 1], lines: [false, false, false, false] });
    }
  }
  for (const [east, north] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    // (A horn: a point over each corner.)
    const [x0, x1] = [Math.min(east * M.top, east * (M.top - 1.1)), Math.max(east * M.top, east * (M.top - 1.1))];
    const [y0, y1] = [Math.min(north * M.top, north * (M.top - 1.1)), Math.max(north * M.top, north * (M.top - 1.1))];
    const [px, py] = [east * (M.top - 0.3), north * (M.top - 0.3)];
    taper(model, tower, [x0, x1, y0, y1], [px, px, py, py], M.rim, M.horns, tan);
  }

  // ── The colonnade along the palace's square: a wall on the lane behind it, a flat roof, a row of columns.
  const [porticoWest, porticoEast, porticoFront, porticoBack, porticoTop] = G.portico;
  const porticoEaves = porticoTop - 0.6;
  block(model, to, [porticoWest, porticoEast, porticoBack - 0.5, porticoBack], 0, porticoEaves, stone, { top: null });
  block(model, to, [porticoWest, porticoEast, porticoFront, porticoBack], porticoEaves, porticoTop, stone, { top: roofing });
  model.flat(up(rect([porticoWest, porticoEast, porticoFront, porticoBack - 0.5]), porticoEaves), timber, { out: [0, 0, -1] });
  const porticoBays = 20;
  for (let k = 0; k <= porticoBays; k += 1) column(porticoWest + 0.9 + ((porticoEast - porticoWest - 1.8) * k) / porticoBays, porticoFront + 0.9, porticoEaves, { radius: 0.42 });
  openings([porticoWest, porticoBack - 0.5], [porticoEast, porticoBack - 0.5], 5.2, { every: 2.8 });

  // ── The two bridges to the palace: a storey with small windows, carried on square piers; one may walk through under them.
  const [deckLow, deckHigh] = G.deck;
  for (const [west, east, far] of G.bridges) {
    const body = rect([west, east, far, porticoFront]);
    between(model, up(body, deckLow), up(body, deckHigh), { ...windowed, storey: deckHigh - deckLow });
    model.flat(up(body, deckLow), { kind: 'plain', colour: '#bfa987' }, { out: [0, 0, -1] });
    model.flat(up(body, deckHigh), roofing);
    openings(body[1], body[2], deckHigh - 1, { every: 3.2 });
    openings(body[3], body[0], deckHigh - 1, { every: 3.2 });
    const bays = Math.round((porticoFront - far) / 6.1);
    for (let k = 0; k <= bays; k += 1) {
      const north = far + 0.6 + ((porticoFront - far - 1.2) * k) / bays;
      for (const at of [west + 0.6, east - 0.6]) block(model, to, [at - 0.6, at + 0.6, north - 0.6, north + 0.6], 0, deckLow, stone, { top: null });
    }
  }

  // ── The houses between the hall and the street, each round its courts; and the wing along the street, east of the minaret.
  for (const { ring, courts } of G.houses) {
    roofed(ring, G.house + 0.6, G.house, windowed, { courts: courts.map(rect) });
    for (const yard of courts.map(rect)) {
      between(model, up(yard, 0), up(yard, G.house), { ...windowed, glow: 0, open: true }, { way: -1 });
      model.flat(up(yard, 0.05), { kind: 'plain', colour: '#d9cdb4', open: true });
    }
  }
  const wide = { ...windowed, storey: 3.8, bay: 3.4, holes: 0.3 };
  roofed(G.wing, G.wingTop + 0.6, G.wingTop, wide);
  openings(G.wing[0], G.wing[1], G.wingTop - 0.6, { every: 2.4 });
  for (let along = 6; along < G.wing[1][0] - G.wing[0][0] - 3; along += 9.2) doorway(G.wing[0], G.wing[1], along, 2.6, 4, 5.4);
  // The white canopy between the wing and the mosque, on four posts.
  const [canopyWest, canopyEast, canopySouth, canopyNorth, canopyTop] = G.canopy;
  block(model, to, [canopyWest, canopyEast, canopySouth, canopyNorth], canopyTop - 0.3, canopyTop, white);
  model.flat(up(rect([canopyWest, canopyEast, canopySouth, canopyNorth]), canopyTop - 0.3), white, { out: [0, 0, -1] });
  for (const east of [canopyWest + 0.4, canopyEast - 0.4]) for (const north of [canopySouth + 0.4, canopyNorth - 0.4]) beam(model, [east, north, 0], [east, north, canopyTop - 0.3], 0.3, white);

  // ── The colonnade that crosses the great square: two rows of tall columns under a flat roof with a ceiling of timber.
  const A = G.arcade;
  const arcadeSouth = A.from + A.step * A.bays;
  const cover = [A.rows[0] - 1.3, A.rows[1] + 1.3, arcadeSouth - 1.3, A.from + 1.3];
  block(model, to, cover, A.top, A.top + 0.9, stone, { top: roofing });
  model.flat(up(rect(cover), A.top), timber, { out: [0, 0, -1] });
  for (let k = 0; k <= A.bays; k += 1) for (const east of A.rows) column(east, A.from + k * A.step, A.top, { radius: 0.6 });
  // The square itself: paved in pale stone, with a star of darker stone laid in it.
  model.flat(up(G.square, 0.04), { kind: 'plain', colour: '#dedbd3' });
  const [starEast, starNorth, starReach] = G.star;
  for (const [reach, colour, lift] of [[starReach, '#c4b59b', 0.06], [starReach * 0.62, '#dedbd3', 0.08], [starReach * 0.3, '#a8977c', 0.1]]) {
    model.flat([[starEast + reach, starNorth, lift], [starEast, starNorth + reach, lift], [starEast - reach, starNorth, lift], [starEast, starNorth - reach, lift]], { kind: 'plain', colour });
  }
  return {};
}

// ── The KAFD metro station ────────────────────────────────────────────────

// The station's measures, in metres. It is measured across (east) and along (north): its own north is the
// way its long axis runs, which is to the south-south-east; the side on King Fahd Road is its own west.
export const KAFD_STATION = {
  half: [19.8, 105.2], // half its width and half its length
  corner: 10, // how round its four corners are
  eyes: 20, // the eye-shaped fields of lattice in each of its two rows, counted right round it
  columns: 12, // the upright strips each eye is built of
  rows: [[12.8, 3.8], [21.2, 2.9]], // the two rows: how high the middle of an eye is, and half its height
  crest: 25.2, // the top of the shell over the middle of an upper eye…
  dip: 21.5, // …and between two of them
  ridge: [27.4, 1, 60], // the roof along its middle: how high, and how much it rolls, over what length
  recess: 0.7, // how far the lattice stands back in the shell
  hood: 0.9, // how far the lid over an eye stands out
  arch: [3, 5.5], // a glazed arch at the foot of the shell, under every lower eye: half its width in strips, and its height
  door: [5, 7.6], // the great doorways: the same
  doors: [2, 7, 12, 17], // which arches they are: under which of the lower eyes, counted from the north end by the west
  mouth: [3, 9.5, 17], // where the trains run in at either end: half its width in strips, its sill and its top
  skylights: [[-49, -1, 6.5], [1, 61, 5.5]], // the fields of glass along the roof: from, to, and half the width
};

/** How full an eye is at a place along it (0 at its two points, 1 in its middle). */
const eyelid = (along) => Math.sin(Math.PI * Math.min(Math.max(along, 0), 1)) ** 0.8;

/**
 * The station's outline at so far round it, in metres from the middle of its north end, anticlockwise:
 * { at: [east, north], out: [east, north] the way the wall looks there }. round: its whole length.
 */
export function stationOutline(along) {
  const S = KAFD_STATION;
  const [halfWide, halfLong] = S.half;
  const r = S.corner;
  const arc = (Math.PI / 2) * r;
  const parts = [halfWide - r, arc, 2 * (halfLong - r), arc, 2 * (halfWide - r), arc, 2 * (halfLong - r), arc, halfWide - r];
  const round = parts.reduce((sum, part) => sum + part, 0);
  let s = ((along % round) + round) % round;
  const corner = (east, north, from) => {
    const angle = from + s / r;
    return { at: [east + Math.cos(angle) * r, north + Math.sin(angle) * r], out: [Math.cos(angle), Math.sin(angle)] };
  };
  const [x, y] = [halfWide - r, halfLong - r];
  const steps = [
    () => ({ at: [-s, halfLong], out: [0, 1] }),
    () => corner(-x, y, Math.PI / 2),
    () => ({ at: [-halfWide, y - s], out: [-1, 0] }),
    () => corner(-x, -y, Math.PI),
    () => ({ at: [-x + s, -halfLong], out: [0, -1] }),
    () => corner(x, -y, Math.PI * 1.5),
    () => ({ at: [halfWide, -y + s], out: [1, 0] }),
    () => corner(x, y, 0),
    () => ({ at: [x - s, halfLong], out: [0, 1] }),
  ];
  for (let i = 0; i < parts.length; i += 1) {
    if (s <= parts[i] || i === parts.length - 1) return { ...steps[i](), round };
    s -= parts[i];
  }
  return { ...steps[0](), round };
}

/**
 * What throws the station's shadows, in its own east and north: its whole outline up to some way short of
 * the top of its shell, and the middle of its roof up to the roof.
 */
export function stationShades() {
  const S = KAFD_STATION;
  const spine = S.half[1] - S.half[0];
  return [
    { ring: stationRing(), height: 23.5 },
    { ring: [[-12, -spine], [12, -spine], [12, spine], [-12, spine]], height: S.ridge[0] - 0.4 },
  ];
}

/** The station's outline as a ring, for its shadow: [[east, north], …]. */
export function stationRing(corners = 60) {
  const { round } = stationOutline(0);
  return Array.from({ length: corners }, (_, i) => stationOutline(((i + 0.5) / corners) * round).at);
}

/**
 * The metro station of the King Abdullah Financial District (Zaha Hadid Architects; opened in December
 * 2024), where the blue, the yellow and the purple line meet: six tracks under one white shell, 210 m
 * long, on a footprint of 8,150 square metres.
 *
 * The shell is of white concrete panels, and it is drawn as a net of waves that run against each other,
 * the way wind lays sand. Where two waves part they leave an eye, and every eye is filled with a lattice
 * of openings that stand on their points, with the glass dark behind it and, by night, the halls' lamps:
 * two rows of such eyes run right round the building, the upper row over the gaps of the lower. Over
 * every eye the shell swells into a smooth white lid that shades it, and the lids of the upper row make
 * the building's rolling skyline. Under the lower row the shell comes down plain, in long lines that
 * swoop with the waves, to a row of glazed arches at the ground; two on each long side are great
 * doorways. At either end the trains run in through a mouth in the shell, a floor up. The roof is the
 * same white, rolling a little along its length, with two long fields of glass over the platforms.
 *
 * (What it serves and its footprint are as published. Its outline is the buildings data's: 210.4 m long
 * and 39.6 m wide on the average, which comes to some 8,250 square metres against the 8,150 published;
 * its corners are rounded as the satellite photo shows them. Its builders describe the shell as waves
 * that run against each other, and its panels as pierced. How that looks is read off one photograph
 * taken from King Fahd Road: the two rows of eyes, each eye some 24 m long, the lids, the plain foot with
 * its swooping lines and arches. Its height is judged in that photograph against the PIF Tower behind
 * it, whose 385 m are known: some 25 m to the top of the lids, which depends on where the photographer
 * stood and may be out by five metres. The fields of glass on the roof are placed from the satellite
 * photo, to some ten metres. Which arches are the doorways, the mouths at the ends, and the side away
 * from the road, which no photograph showed, are a likeness: that side is built as the mirror of the
 * other.)
 */
export function kafdStation(model) {
  const S = KAFD_STATION;
  const [halfWide, halfLong] = S.half;
  const { round } = stationOutline(0);
  const strips = S.eyes * S.columns; // right round
  const step = round / strips;
  const eye = round / S.eyes;
  const [[lowerAt, lowerHalf], [upperAt, upperHalf]] = S.rows;
  // White concrete: by night a wash of the district's violet light lies on it.
  const white = { kind: 'plain', colour: '#f3f2ed', light: '#cdb8ff', glow: 0.3 };
  // (What stands back in the shell lies inside the block that throws its shadow, and takes none.)
  const inner = { kind: 'plain', colour: '#dedcd4', light: '#cdb8ff', glow: 0.45, open: true };
  // The lattice: every opening cut, larger and smaller; behind it the lamps of the halls.
  const lattice = { kind: 'pierced', colour: '#f3f2ed', storey: 1.5, bay: 1.9, diamonds: true, holes: 0.84, lit: 0.9, light: '#cdb8ff', glow: 0.3, open: true };
  const glass = { kind: 'glass', colour: '#3c4d59', storey: 5.5, bay: 2.03, lit: 1, floors: 0, mirror: 0.25, open: true };
  const dark = { kind: 'plain', colour: '#20262b', open: true };

  /** Which arch a strip's edge belongs to, if any: how high the arch is there. */
  const archAt = (index) => {
    // (An arch under the middle of every lower eye: those lie half an eye from the ends' middles.)
    const from = ((index - S.columns / 2) % S.columns + S.columns) % S.columns;
    const off = Math.min(from, S.columns - from); // strips from the nearest arch's middle
    const which = Math.round((index - S.columns / 2) / S.columns);
    const [half, tall] = S.doors.includes(((which % S.eyes) + S.eyes) % S.eyes) ? S.door : S.arch;
    return off >= half ? 0 : tall * Math.sqrt(1 - (off / half) ** 2);
  };
  /** How far a strip's edge is from the middle of the nearer end, in strips. */
  const fromEnd = (index) => {
    const turn = ((index % strips) + strips) % strips;
    return Math.min(turn, strips - turn, Math.abs(turn - strips / 2));
  };

  /**
   * The shell at the edge of a strip, from the ground up: the places its outline runs through, each
   * [how far out of the wall, how high], and between them: glass, the arch's head, the plain foot in
   * three lifts, a sill, the lower eye, its lid from below, the lid, the band between, a sill, the upper
   * eye, its lid from below, the lid up to the top of the shell.
   */
  const outlineAt = (index) => {
    const along = index * step;
    const { at, out } = stationOutline(along);
    const upper = eyelid((((along / eye + 0.5) % 1) + 1) % 1);
    // (By the mouths at the ends the lower eyes open later.)
    const squeeze = Math.min(Math.max((fromEnd(index) - S.mouth[0]) / S.mouth[0], 0), 1);
    const lower = eyelid((((along / eye) % 1) + 1) % 1) * squeeze * squeeze * (3 - 2 * squeeze);
    const mouth = fromEnd(index) < S.mouth[0] ? (S.mouth[2] - S.mouth[1]) * Math.sqrt(1 - (fromEnd(index) / S.mouth[0]) ** 2) : 0;
    const arch = archAt(index);
    const [low, high] = fromEnd(index) <= S.mouth[0] ? [S.mouth[1], S.mouth[1] + mouth] : [lowerAt - lowerHalf * lower, lowerAt + lowerHalf * lower];
    const back = fromEnd(index) <= S.mouth[0] ? (mouth > 0 ? 2.2 : 0) : S.recess * Math.min(lower * 4, 1);
    const lid = fromEnd(index) <= S.mouth[0] ? 0 : S.hood * lower;
    const [upperLow, upperHigh] = [upperAt - upperHalf * upper, upperAt + upperHalf * upper];
    // (The top of the shell follows the lids of the upper row: highest over the middle of each, lowest between two.)
    const top = upperHigh + (S.dip - upperAt) + (S.crest - upperAt - upperHalf - (S.dip - upperAt)) * upper;
    const upperBack = S.recess * Math.min(upper * 4, 1);
    const rise = Math.min(1.4, (upperLow - high) / 2);
    const line = [
      [arch > 0 ? -0.3 : 0, 0],
      [arch > 0 ? -0.3 : 0, arch],
      [0, arch],
      [0, arch + (low - arch) / 3],
      [0, arch + ((low - arch) * 2) / 3],
      [0, low],
      [-back, low],
      [-back, high],
      [lid, high],
      [0, high + rise],
      [0, upperLow],
      [-upperBack, upperLow],
      [-upperBack, upperHigh],
      [S.hood * upper, upperHigh],
      [0, top],
    ];
    return { at, out, line, top, mouth: fromEnd(index) <= S.mouth[0] };
  };

  const edges = Array.from({ length: strips + 1 }, (_, index) => outlineAt(index));
  const spot = (edge, [proud, up]) => [edge.at[0] + edge.out[0] * proud, edge.at[1] + edge.out[1] * proud, up];
  for (let index = 0; index < strips; index += 1) {
    const [a, b] = [edges[index], edges[index + 1]];
    const mouth = a.mouth && b.mouth;
    const stuffs = [glass, inner, white, white, white, inner, mouth ? dark : lattice, inner, white, white, inner, lattice, inner, white];
    // (The swooping lines of the foot: along the top of each of its lifts.)
    const lined = [false, false, true, true, false, false, false, false, false, false, false, false, false, false];
    for (let piece = 0; piece < stuffs.length; piece += 1) {
      const [a0, a1, b0, b1] = [a.line[piece], a.line[piece + 1], b.line[piece], b.line[piece + 1]];
      if (Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) < 1e-6 && Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) < 1e-6) continue;
      // Which way this piece of the shell looks: outwards, and as far up or down as it leans.
      const looks = (edge, [from, to]) => {
        const [run, rise] = [to[0] - from[0], to[1] - from[1]];
        const size = Math.hypot(run, rise) || 1;
        return [(edge.out[0] * rise) / size, (edge.out[1] * rise) / size, -run / size];
      };
      const [wayA, wayB] = [looks(a, Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) < 1e-6 ? [b0, b1] : [a0, a1]), looks(b, Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) < 1e-6 ? [a0, a1] : [b0, b1])];
      const out = [wayA[0] + wayB[0], wayA[1] + wayB[1], wayA[2] + wayB[2]];
      const pierced = stuffs[piece].kind === 'pierced' || stuffs[piece].kind === 'glass';
      model.quad(spot(a, a0), spot(b, b0), spot(b, b1), spot(a, a1), stuffs[piece], {
        out,
        lines: [false, false, lined[piece], false],
        // (A lattice counts its openings right round the building, from the north end.)
        ...(pierced ? { along: [b.at[0] - a.at[0], b.at[1] - a.at[1]], from: [a.at[0] - ((b.at[0] - a.at[0]) / step) * index * step, a.at[1] - ((b.at[1] - a.at[1]) / step) * index * step] } : { normals: [wayA, wayB, wayB, wayA] }),
      });
    }
  }

  // The roof: from the top of the shell it rises, steeply at first, to a level strip along the middle that rolls along the building.
  const [ridgeAt, roll, wave] = S.ridge;
  const spine = halfLong - halfWide;
  const ridge = (north) => ridgeAt + roll * Math.cos((Math.PI * 2 * north) / wave);
  const rings = [0, 0.2, 0.42, 0.65, 1];
  const roofAt = (edge, share) => {
    const foot = [0, Math.min(Math.max(edge.at[1], -spine), spine)];
    const level = ridge(foot[1]);
    const lift = share >= 0.65 ? 1 : 1 - (1 - share / 0.65) ** 2;
    return [edge.at[0] + (foot[0] - edge.at[0]) * share, edge.at[1] + (foot[1] - edge.at[1]) * share, edge.top + (Math.max(level, edge.top) - edge.top) * lift];
  };
  // (It lies within the block that throws the station's shadow: it takes none.)
  const roofing = { kind: 'plain', colour: '#f1f0ea', open: true };
  for (let index = 0; index < strips; index += 1) {
    const [a, b] = [edges[index], edges[index + 1]];
    for (let ring = 0; ring < rings.length - 1; ring += 1) {
      const [a0, b0, b1, a1] = [roofAt(a, rings[ring]), roofAt(b, rings[ring]), roofAt(b, rings[ring + 1]), roofAt(a, rings[ring + 1])];
      // (A seam along the roof where its slope ends: it winds with the waves of the shell.)
      model.quad(a0, b0, b1, a1, roofing, { out: [0, 0, 1], lines: [false, false, ring === 1, false] });
    }
  }
  // The fields of glass along the roof: each an eye too, set with panes that stand on their points.
  const pane = { kind: 'lamp', colour: '#3b464e', light: '#fff0d6', glow: 0.5, open: true };
  for (const [from, to, half] of S.skylights) {
    const rows = Math.round((to - from) / 1.3);
    for (let row = 1; row < rows; row += 1) {
      const north = from + ((to - from) * row) / rows;
      const wide = half * eyelid((north - from) / (to - from)) - 0.9;
      for (let east = (row % 2) * 0.85 - Math.floor(wide / 1.7) * 1.7; east <= wide; east += 1.7) {
        if (Math.abs(east) > wide) continue;
        const up = (y) => ridge(y) + 0.07;
        model.quad([east - 0.62, north, up(north)], [east, north - 0.95, up(north - 0.95)], [east + 0.62, north, up(north)], [east, north + 0.95, up(north + 0.95)], pane, { out: [0, 0, 1], lines: [false, false, false, false] });
      }
    }
  }
  return {};
}

// ── Murabba Palace ────────────────────────────────────────────────────────

// The palace's measures, in metres. Places are [east, north] in its own frame, which is turned with its walls.
export const MURABBA = {
  half: [17.8, 23.5], // half its width and half its length: it is 35.6 m by 47 m
  court: [-7.3, 11.7, -14, 8.5], // the court within it: west, east, south, north
  wall: 9.4, // the top of its walls, where the battlements stand…
  roof: 8.6, // …its roof…
  floor: 4.4, // …and the floor of its upper storey
  footing: 0.9, // its footing of stone
  battlement: [0.9, 0.62], // from one battlement to the next, and how high they stand
  bands: [3.85, 7.75], // the two bands of zig-zag that run round it
  windows: 3.4, // from one window to the next
  gallery: 2.4, // how deep the galleries round the court are
  bays: [6, 7], // how many columns apart each gallery is: across the court, and along it
  door: [2.4, 3.3], // the great door: how wide, how high
};

/**
 * Murabba Palace (Qasr al-Murabba), north of the old town: the palace King Abdulaziz had built outside
 * the walls from 1936 and moved into in 1938; a museum in the King Abdulaziz Historical Center since
 * 1999.
 *
 * A block of two storeys round a court, in the manner of Najd: walls of clay brick plastered with clay
 * and straw, on a footing of stone; sixteen rooms to a floor, which open on galleries round the court,
 * behind columns. Outside, each floor has its row of windows, the lower ones small and square, the
 * upper ones tall with round heads, every one in a white surround; two bands of zig-zag run round the
 * walls, one between the floors and one under the top; and along the top stands a row of white pointed
 * battlements. By night its walls are floodlit.
 *
 * (Its dates, its two floors of sixteen rooms round a court and what it is built of are as published;
 * so is the ground it covers, 1,680 square metres, which is what the buildings data's outline comes
 * to: 35.6 m by 47 m. The court is measured on the satellite photo the app shows. Its height, some
 * 9.4 m to the foot of the battlements, is judged from that photo's slant and from a photograph taken
 * in the lane west of it, which also shows that west wall to be plain, with small windows only. The
 * windows in their white surrounds, the bands of zig-zag and the battlements are as that photograph
 * shows them on the wing across the lane, which is of the same build; how many windows the palace's
 * other walls have, where its door is, and the galleries inside the court are a likeness. The houses
 * and halls round it are not built: they are still the map's blocks.)
 */
export function murabbaPalace(model) {
  const P = MURABBA;
  const up = (ring, height) => ring.map(([east, north]) => [east, north, height]);
  const rect = ([west, east, south, north]) => [[west, south], [east, south], [east, north], [west, north]];
  const clay = { kind: 'plain', colour: '#b68a63', light: '#ffc27a', glow: 0.55 };
  const shaded = { kind: 'plain', colour: '#ab8260' };
  const white = { kind: 'plain', colour: '#f1ece1', light: '#fff1d6', glow: 0.5 };
  const relief = { kind: 'plain', colour: '#d0aa84', light: '#ffc27a', glow: 0.55 };
  const dark = { kind: 'plain', colour: '#2e241b' };
  const wood = { kind: 'plain', colour: '#6a4a2c' };
  const roofing = { kind: 'plain', colour: '#d6bd97', open: true };
  const plain = [false, false, false, false];

  const [halfWide, halfLong] = P.half;
  const outline = rect([-halfWide, halfWide, -halfLong, halfLong]);
  const court = rect(P.court);
  const [courtWest, courtEast, courtSouth, courtNorth] = P.court;

  // The walls, on their footing of stone; the roof behind its parapet, with the court cut out of it.
  between(model, up(outline, 0), up(outline, P.wall), clay);
  const footing = inset(outline, -0.12);
  between(model, up(footing, 0), up(footing, P.footing), { kind: 'plain', colour: '#cbbd9f' });
  model.flat(up(footing, P.footing), { kind: 'plain', colour: '#cbbd9f' }, { holes: [up(outline, P.footing)] });
  const within = inset(outline, 0.45);
  const lip = inset(court, -0.45);
  model.flat(up(outline, P.wall), { kind: 'plain', colour: white.colour, open: true }, { holes: [up(within, P.wall)] });
  between(model, up(within, P.roof), up(within, P.wall), { kind: 'plain', colour: '#c29a74', open: true }, { way: -1 });
  model.flat(up(within, P.roof), roofing, { holes: [up(lip, P.roof)] });
  between(model, up(lip, P.roof), up(lip, P.roof + 0.5), { kind: 'plain', colour: '#c29a74', open: true });
  model.flat(up(lip, P.roof + 0.5), { kind: 'plain', colour: white.colour, open: true }, { holes: [up(court, P.roof + 0.5)] });

  // Round the outside, wall by wall (the outside is to the right of the way from a to b).
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % 4];
    const long = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = [(b[0] - a[0]) / long, (b[1] - a[1]) / long];
    const out = [along[1], -along[0], 0];
    const spot = (at, height, proud) => [a[0] + along[0] * at + out[0] * proud, a[1] + along[1] * at + out[1] * proud, height];
    // Along its top a white band, and on that the battlements: white, each ending in a point.
    model.quad(spot(0, P.wall - 0.28, 0.02), spot(long, P.wall - 0.28, 0.02), spot(long, P.wall, 0.02), spot(0, P.wall, 0.02), white, { out, lines: plain });
    const [pitch, tall] = P.battlement;
    const teeth = Math.round(long / pitch);
    for (let k = 0; k < teeth; k += 1) {
      const middle = ((k + 0.5) * long) / teeth;
      const tooth = (proud) => [spot(middle - pitch * 0.4, P.wall, proud), spot(middle + pitch * 0.4, P.wall, proud), spot(middle, P.wall + tall, proud)];
      model.facet(...tooth(0), white, { out, lines: [false, false, false] });
      model.facet(...tooth(-0.45), { ...white, open: true }, { out: [-out[0], -out[1], 0], lines: [false, false, false] });
    }
    // The two bands of zig-zag, in relief.
    for (const height of P.bands) {
      const count = Math.round(long / 0.75);
      for (let k = 0; k < count; k += 1) {
        const middle = ((k + 0.5) * long) / count;
        model.facet(spot(middle - 0.26, height, 0.04), spot(middle + 0.26, height, 0.04), spot(middle, height - 0.34, 0.04), relief, { out, lines: [false, false, false] });
      }
    }
    // Its windows, each in a white surround: small square ones below; above them tall ones with round heads, but in the west wall, which has only small ones.
    const west = index === 3;
    const count = Math.floor((long - 3) / (west ? P.windows * 1.5 : P.windows)) + 1;
    const first = (long - (count - 1) * (west ? P.windows * 1.5 : P.windows)) / 2;
    const square = (middle, foot, half, proud, stuff) => model.quad(spot(middle - half, foot, proud), spot(middle + half, foot, proud), spot(middle + half, foot + half * 2, proud), spot(middle - half, foot + half * 2, proud), stuff, { out, lines: plain });
    /** A window with a round head: its outline, so wide, from its foot up to where it turns, and round. */
    const arched = (middle, foot, half, turn, proud) => [[-1, 0], [1, 0], [1, turn], [0.71, turn + 0.71 * half], [0, turn + half], [-0.71, turn + 0.71 * half], [-1, turn]].map(([aside, rise]) => spot(middle + aside * half, foot + rise, proud));
    const south = index === 0;
    for (let k = 0; k < count; k += 1) {
      const middle = first + k * (west ? P.windows * 1.5 : P.windows);
      // (The great door takes the place of the two middle windows of the south wall.)
      const door = south && Math.abs(middle - long / 2) < P.windows / 2 + 0.01;
      if (!door) {
        square(middle, 2.05, 0.5, 0.03, white);
        square(middle, 2.23, 0.32, 0.05, dark);
      }
      if (west) {
        square(middle, 5.9, 0.42, 0.03, white);
        square(middle, 6.05, 0.27, 0.05, dark);
      } else {
        model.flat(arched(middle, 4.95, 0.62, 1.25, 0.03), white, { out });
        model.flat(arched(middle, 5.1, 0.42, 1.12, 0.05), wood, { out });
      }
    }
    if (south) {
      const [wide, tall2] = P.door;
      model.quad(spot(long / 2 - wide / 2 - 0.3, 0, 0.14), spot(long / 2 + wide / 2 + 0.3, 0, 0.14), spot(long / 2 + wide / 2 + 0.3, tall2 + 0.3, 0.14), spot(long / 2 - wide / 2 - 0.3, tall2 + 0.3, 0.14), white, { out, lines: plain });
      model.quad(spot(long / 2 - wide / 2, 0, 0.16), spot(long / 2 + wide / 2, 0, 0.16), spot(long / 2 + wide / 2, tall2, 0.16), spot(long / 2 - wide / 2, tall2, 0.16), wood, { out, lines: [false, true, false, true] });
    }
  });

  // The court: its floor; and round it, on both floors, a gallery behind white columns, with the doors of the rooms in the wall at its back.
  model.flat(up(court, 0.08), { kind: 'plain', colour: '#e3d6bd' });
  const back = rect([courtWest - P.gallery, courtEast + P.gallery, courtSouth - P.gallery, courtNorth + P.gallery]);
  const [slab, ceiling] = [P.floor - 0.35, P.roof - 0.3];
  between(model, up(back, 0), up(back, P.roof), shaded, { way: -1 });
  model.flat(up(back, slab), { kind: 'plain', colour: '#5d4630' }, { out: [0, 0, -1], holes: [up(court, slab)] });
  model.flat(up(back, P.floor), { kind: 'plain', colour: '#c7a47d' }, { holes: [up(court, P.floor)] });
  model.flat(up(back, ceiling), { kind: 'plain', colour: '#5d4630' }, { out: [0, 0, -1], holes: [up(court, ceiling)] });
  between(model, up(court, slab), up(court, P.floor), shaded, { way: -1 });
  between(model, up(court, ceiling), up(court, P.roof + 0.5), shaded, { way: -1 });
  // (A screen of wooden lattice along the upper gallery, waist high.)
  between(model, up(court, P.floor), up(court, P.floor + 0.95), { kind: 'pierced', colour: '#7a5836', storey: 0.95, bay: 0.5, diamonds: true, holes: 0.7 }, { way: -1 });
  const post = (east, north, foot, top, radius) => {
    const at = (k, height) => [east + Math.cos((k / 6) * TAU) * radius, north + Math.sin((k / 6) * TAU) * radius, height];
    const looks = (k) => [Math.cos((k / 6) * TAU), Math.sin((k / 6) * TAU), 0];
    for (let k = 0; k < 6; k += 1) model.quad(at(k, foot), at(k + 1, foot), at(k + 1, top - 0.3), at(k, top - 0.3), white, { out: looks(k + 0.5), normals: [looks(k), looks(k + 1), looks(k + 1), looks(k)], lines: plain });
    taper(model, frame([0, 0], 0), [east - radius, east + radius, north - radius, north + radius], [east - radius * 1.8, east + radius * 1.8, north - radius * 1.8, north + radius * 1.8], top - 0.3, top, white, { top: null });
  };
  const [across, lengthways] = P.bays;
  const posts = [];
  for (let k = 0; k <= lengthways; k += 1) for (const east of [courtWest, courtEast]) posts.push([east, courtSouth + ((courtNorth - courtSouth) * k) / lengthways]);
  for (let k = 1; k < across; k += 1) for (const north of [courtSouth, courtNorth]) posts.push([courtWest + ((courtEast - courtWest) * k) / across, north]);
  for (const [east, north] of posts) {
    // (Each stands a little back from the edge, under the beam.)
    const [x, y] = [east + Math.sign(east - (courtWest + courtEast) / 2) * 0.25, north + Math.sign(north - (courtSouth + courtNorth) / 2) * 0.25];
    post(x, y, 0, slab, 0.24);
    post(x, y, P.floor, ceiling, 0.2);
  }
  // The doors of the rooms: one to every bay, on both floors.
  back.forEach((a, index) => {
    const b = back[(index + 1) % 4];
    const long = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = [(b[0] - a[0]) / long, (b[1] - a[1]) / long];
    const inwards = [-along[1], along[0], 0];
    const spot = (at, height) => [a[0] + along[0] * at + inwards[0] * 0.05, a[1] + along[1] * at + inwards[1] * 0.05, height];
    const count = index % 2 === 0 ? across : lengthways;
    for (let k = 0; k < count; k += 1) {
      const middle = P.gallery + ((long - P.gallery * 2) * (k + 0.5)) / count;
      for (const foot of [0, P.floor]) model.quad(spot(middle - 0.55, foot), spot(middle + 0.55, foot), spot(middle + 0.55, foot + 2.2), spot(middle - 0.55, foot + 2.2), dark, { out: inwards, lines: plain });
    }
  });
  return {};
}

/** What throws the palace's shadows: its four wings, each [{ ring, height }] in its own east and north; the court between them throws none. */
export function murabbaShades() {
  const P = MURABBA;
  const [halfWide, halfLong] = P.half;
  const [courtWest, courtEast, courtSouth, courtNorth] = P.court;
  const rect = ([west, east, south, north]) => [[west, south], [east, south], [east, north], [west, north]];
  return [[-halfWide, halfWide, courtNorth, halfLong], [-halfWide, halfWide, -halfLong, courtSouth], [-halfWide, courtWest, courtSouth, courtNorth], [courtEast, halfWide, courtSouth, courtNorth]].map((box) => ({ ring: rect(box), height: P.wall }));
}

/** The way the mosque's own north points: along its qibla wall, north-north-westwards. */
const TURKI_BEARING = 333.93;

/** A place given in a model's own east and north, in true east and north: the model is turned with its landmark's bearing. */
const swung = (bearing, east, north) => {
  const angle = (bearing * Math.PI) / 180;
  return [east * Math.cos(angle) + north * Math.sin(angle), north * Math.cos(angle) - east * Math.sin(angle)];
};

/**
 * What throws the mosque's shadows: each [{ ring, height, base }], the ring in the mosque's own east and
 * north. The hall; the wings and the covered part of the court; the wings round its open part; each
 * block of the front; the minaret; the roof of the colonnade on the palace's square; the bridges, from
 * their undersides up; the houses, the wing and the canopy; and the roof of the colonnade in the square.
 */
export function turkiShades() {
  const G = TURKI_MOSQUE;
  const rect = ([west, east, south, north]) => [[west, south], [east, south], [east, north], [west, north]];
  const [courtWest, courtEast, courtSouth, courtNorth] = G.court;
  const open = courtNorth - (G.cover.rows - G.cover.open) * G.bay; // where the cover's open rows begin
  const [hallEast, south] = [G.hall[1], G.surround[0][1]];
  const [east, north] = [G.surround[1][0], G.hall[3]];
  const M = G.minaret;
  const A = G.arcade;
  return [
    { ring: rect(G.hall), height: G.wall },
    { ring: [[hallEast, open], [east, open], G.surround[2], G.surround[3], [hallEast, north]], height: G.parapet },
    { ring: [[hallEast, south], [east, south], [east, open], [courtEast, open], [courtEast, courtSouth], [courtWest, courtSouth], [courtWest, open], [hallEast, open]], height: G.parapet },
    ...G.blocks.map(([from, until, top], index) => ({ ring: rect([G.front[0], index === G.gate.block ? G.gate.out : G.front[1], from, until]), height: top })),
    { ring: rect([M.at[0] - M.foot, M.at[0] + M.foot, M.at[1] - M.foot, M.at[1] + M.foot]), height: M.horns },
    { ring: rect(G.portico.slice(0, 4)), height: G.portico[4], base: G.portico[4] - 0.6 },
    ...G.bridges.map(([west, bridgeEast, far]) => ({ ring: rect([west, bridgeEast, far, G.portico[2]]), height: G.deck[1], base: G.deck[0] })),
    ...G.houses.map(({ ring }) => ({ ring, height: G.house + 0.6 })),
    { ring: G.wing, height: G.wingTop + 0.6 },
    { ring: rect(G.canopy.slice(0, 4)), height: G.canopy[4], base: G.canopy[4] - 0.3 },
    { ring: rect([A.rows[0] - 1.3, A.rows[1] + 1.3, A.from + A.step * A.bays - 1.3, A.from + 1.3]), height: A.top + 0.9, base: A.top },
  ];
}

/**
 * The famous buildings built here, as landmarks for the map (see landmarks.js): where each stands
 * ([lng, lat]), which way it is turned, how tall it is, within what distance of its middle the map's
 * own blocks are taken out for it, and the round its shadow is thrown from (or, for the mosque, the
 * outlines of its parts, and the outlines of the buildings data that go altogether for it).
 */
export const FAMOUS = [
  {
    id: 'interior-ministry',
    name: 'Ministry of Interior',
    at: [46.695906, 24.670242],
    bearing: 45,
    height: MINISTRY.top,
    clear: 60,
    reach: 125,
    model: ministryOfInterior,
    within: 9000,
    // (Its shadow is that of its widest floor: under that floor the building itself stands in it.)
    shade: { radius: 78, height: 33 },
  },
  {
    id: 'king-fahd-library',
    name: 'King Fahd National Library',
    at: [46.686448, 24.685663],
    bearing: 336.4,
    height: LIBRARY.foot + (LIBRARY.levels * LIBRARY.sail) / 2,
    clear: 66,
    reach: 105,
    model: kingFahdLibrary,
    within: 7000,
  },
  {
    id: 'masmak-fort',
    name: 'Masmak Fort',
    at: [46.713368, 24.631221],
    bearing: 0,
    height: MASMAK.tower[5],
    clear: 36,
    reach: 52,
    model: masmakFort,
    within: 5000,
    // (The map's block for it throws the shadow of its walls; its towers stand twice as high.)
    shades: MASMAK.towers.map(([u, v]) => {
      const turn = (MASMAK.turn * Math.PI) / 180;
      return { at: [u * Math.cos(turn) - v * Math.sin(turn), u * Math.sin(turn) + v * Math.cos(turn)], radius: 3.6, height: 17 };
    }),
  },
  {
    id: 'imam-turki-mosque',
    name: 'Imam Turki bin Abdullah Grand Mosque',
    at: [46.710674, 24.630815],
    bearing: TURKI_BEARING,
    height: TURKI_MOSQUE.minaret.horns,
    clear: 0,
    reach: 170,
    model: turkiMosque,
    within: 5000,
    // (The buildings data has the mosque, its houses and the wing as one block, taller than any of them,
    // court and all; each bridge as a block that stands on the ground; and the colonnade in the square as
    // three. They go, shadows and all, and each part of the model throws its own.)
    // (And a bed of trees in the square, which the data has as a building too.)
    ghosts: [[22.5, 16.7], [-46.7, -82.8], [50.6, -81.2], [74.8, -10.2], [81.3, -30.5], [85.2, -60], [103.9, 0.7]].map(([east, north]) => swung(TURKI_BEARING, east, north)),
    shades: turkiShades(),
  },
  {
    id: 'murabba-palace',
    name: 'Murabba Palace',
    at: [46.709273, 24.646491],
    bearing: 353.4,
    height: MURABBA.wall + MURABBA.battlement[1],
    clear: 0,
    reach: 35,
    model: murabbaPalace,
    within: 4000,
    // (The buildings data has it as one block, court and all: that goes, and its four wings throw the shadows.)
    ghosts: [[0.5, 5]],
    shades: murabbaShades(),
  },
];
