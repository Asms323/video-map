// More of Riyadh's famous buildings, each built as a true model with its details.
//
// The towers of the skyline were built first (see landmarks.js), then the financial district (kafd.js).
// Here are the buildings the city is known by that are not towers: each looked up, studied in
// photographs and in the satellite photo the app shows, and built face by face (see models.js and
// solids.js). What is known of each, what was measured and what is a judgement is said where it is built.
//
// Nothing here touches the browser. Measurements are in metres; a model is measured from the middle of
// its own footprint, east and north being its own (it is turned with its landmark's bearing).

import { ballProfile, beam, frame, lathe, prism, taper } from './solids.js';

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

/**
 * The famous buildings built here, as landmarks for the map (see landmarks.js): where each stands
 * ([lng, lat]), which way it is turned, how tall it is, within what distance of its middle the map's
 * own blocks are taken out for it, and the round its shadow is thrown from.
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
];
