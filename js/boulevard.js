// Boulevard World, in Hittin: the lagoon and what stands round it.
//
// Boulevard World is the fairground of the Riyadh Season, opened in November
// 2022 beside Boulevard City: quarters built after some thirty countries
// round a lagoon. The street map has almost nothing of it: a name, a few
// outlines, no water. What is built here was taken from three things:
//   - the satellite photo the app itself shows (Esri World Imagery, taken in
//     September 2025): where each thing stands and how large it is on the
//     ground. The lagoon's shore was traced from it. (It is taken at a slant:
//     the top of a tall thing lies half its height north-north-west of its
//     foot, and where a thing stands is its foot.);
//   - sixteen photographs of the place by night, sent by the app's owner in
//     November 2026;
//   - the fairground's own booklet for the season of 2026-27, sent by the
//     owner as well: one picture to each quarter and ride.
// What each thing looks like, and how it is lit, is read off those pictures.
// How tall things are is judged from them against people and storeys, not
// measured; where the pictures do not show where a thing stands and the
// satellite photo does not show it plainly, its place is a judgement, and it
// says so where it is built.
//
// Every thing here is a true model (see models.js and solids.js): flat faces
// that lean and curve, each with its own colour by day and its own light by
// night. Places are measured in metres east and north of the fairground's
// own mark; each part is measured from its own middle.
//
// Nothing here touches the browser. Places on the map are [lng, lat].

import { ballProfile, beam, block, disc, frame, lathe, panes, prism, sweptRoof, taper } from './solids.js';

const METERS_PER_DEGREE = 111320;
const TAU = Math.PI * 2;
const DEGREES = Math.PI / 180;

/** The point the fairground is measured from: metres east and north of it. */
export const BOULEVARD_WORLD = [46.60113, 24.77662];

// The lagoon's shore: corners in tenths of a metre east and north of that point, east first. Traced
// from the satellite photo at about half a metre a spot, and thinned to within two metres of the trace.
const LAGOON = [
  [
    -1720, 1284, -1769, 1213, -1775, 1132, -1812, 1110, -1785, 1104, -1769, 1051, -1688, 1029, -1693, 974, -1748, 947, -1715, 909, -1656, 909, -1644, 855,
    -1558, 844, -1541, 774, -1638, 687, -1704, 687, -1741, 849, -1920, 855, -1932, 909, -1980, 921, -2023, 1002, -2023, 936, -2105, 936, -2122, 834,
    -2073, 817, -2089, 730, -2040, 692, -2002, 557, -2094, 535, -2110, 633, -2176, 660, -2186, 719, -2225, 719, -2241, 768, -2289, 715, -2305, 606,
    -2344, 594, -2349, 509, -2305, 503, -2300, 475, -2186, 509, -2181, 465, -2002, 470, -1991, 345, -1959, 389, -1834, 400, -1753, 367, -1650, 237,
    -1612, 226, -1585, 124, -1612, 80, -1698, 42, -1709, 4, -1823, -50, -1828, -94, -1867, -105, -1904, -169, -2159, -159, -2213, -18, -2289, 31,
    -2387, 26, -2397, 101, -2479, 124, -2355, -56, -2289, -413, -2186, -409, -2122, -360, -2105, -278, -2057, -273, -1975, -381, -1964, -456, -2046, -473,
    -2073, -430, -2073, -468, -2143, -473, -2186, -543, -2110, -571, -2105, -539, -2051, -533, -2046, -566, -1920, -571, -1856, -490, -1801, -490, -1677, -581,
    -1661, -652, -1736, -766, -1693, -989, -1569, -1000, -1563, -945, -1433, -934, -1411, -896, -1243, -885, -1161, -815, -1167, -734, -1092, -734, -1016, -836,
    -1032, -907, -1167, -923, -1221, -983, -1211, -1085, -1243, -1102, -1200, -1108, -1195, -1189, -1216, -1232, -1281, -1232, -1281, -1276, -1324, -1281, -1281, -1314,
    -1281, -1498, -1340, -1503, -1308, -1525, -1308, -1590, -1362, -1606, -1340, -1639, -1287, -1629, -1270, -1580, -1184, -1580, -1140, -1623, -1108, -1580, -1053, -1580,
    -945, -1623, -907, -1557, -853, -1557, -837, -1612, -734, -1617, -631, -1308, -668, -1292, -668, -1232, -533, -1189, -528, -1216, -489, -1183, -397, -1194,
    -370, -1482, -430, -1580, -397, -1780, -495, -1899, -533, -2051, -511, -2089, -376, -2105, -349, -1954, -278, -1964, -289, -1916, -338, -1910, -354, -1818,
    -310, -1807, -283, -1737, -299, -1661, -262, -1650, -257, -1585, -299, -1574, -299, -1493, -246, -1487, -218, -1351, -143, -1346, -115, -1389, -18, -1389,
    -28, -1276, 75, -1276, 53, -1406, 85, -1417, 85, -1455, 264, -1438, 383, -1536, 438, -1769, 492, -1845, 513, -2035, 605, -2056, 655, -2160,
    725, -2160, 736, -2192, 839, -2132, 790, -2035, 649, -2003, 655, -1872, 709, -1856, 687, -1829, 687, -1585, 742, -1580, 758, -1525, 834, -1465,
    980, -1433, 985, -1389, 1034, -1378, 1040, -1308, 1169, -1287, 1186, -1157, 1142, -1140, 1089, -983, 887, -972, 866, -885, 790, -885, 720, -815,
    595, -793, 584, -820, 492, -826, 433, -783, 410, -668, 465, -636, 400, -543, 400, -462, 454, -424, 449, -354, 481, -322, 443, -311,
    438, -267, 389, -262, 378, -154, 438, -99, 470, 20, 622, 58, 828, 188, 991, 188, 997, 134, 1110, 96, 1132, 31, 1295, 26,
    1295, 69, 1348, 107, 1371, 243, 1403, 258, 1446, 416, 1338, 460, 1284, 584, 1251, 590, 1251, 671, 1208, 692, 1164, 844, 1169, 942,
    1142, 947, 1137, 1078, 1181, 1083, 1142, 1104, 1142, 1202, 1089, 1213, 1077, 1251, 991, 1257, 947, 1202, 887, 1202, 882, 1223, 665, 1197,
    622, 1295, 639, 1478, 416, 1457, 199, 1506, 172, 1550, 91, 1582, 64, 1658, 15, 1663, 4, 1728, -28, 1707, -299, 1718, -386, 1766,
    -397, 1804, -446, 1804, -462, 1848, -446, 1555, -478, 1512, -560, 1501, -571, 1457, -652, 1484, -576, 1110, -625, 1066, -695, 1066, -674, 958,
    -576, 861, -571, 649, -652, 535, -690, 530, -695, 481, -793, 481, -798, 449, -853, 449, -869, 551, -950, 600, -1010, 730, -1016, 849,
    -961, 904, -1021, 1017, -1042, 1017, -1042, 947, -1167, 849, -1379, 861, -1466, 942, -1466, 1002, -1563, 1029, -1574, 1142, -1661, 1180, -1688, 1267,
  ],
  [
    1625, -322, 1582, -365, 1603, -424, 1511, -511, 1419, -734, 1295, -745, 1192, -663, 1192, -745, 1229, -755, 1229, -874, 1181, -885, 1186, -956,
    1219, -977, 1256, -1102, 1343, -1140, 1348, -1097, 1441, -1102, 1446, -1059, 1543, -1070, 1614, -1129, 1603, -1064, 1630, -1015, 1772, -1032, 1864, -1091,
    1875, -1168, 1772, -1178, 1722, -1243, 1761, -1265, 1761, -1314, 1804, -1314, 1809, -1346, 1864, -1363, 1875, -1438, 2021, -1493, 2021, -1552, 1988, -1557,
    2004, -1710, 1945, -1763, 1907, -1943, 1875, -1964, 1869, -2148, 1815, -2160, 1782, -2246, 1820, -2246, 1825, -2290, 1859, -2235, 1956, -2252, 1972, -2387,
    2270, -2501, 2346, -2496, 2389, -2545, 2492, -2534, 2531, -2382, 2563, -2377, 2563, -2317, 2596, -2284, 2596, -2171, 2509, -2175, 2504, -2137, 2352, -2116,
    2314, -2067, 2173, -2046, 2151, -1959, 2124, -1948, 2135, -1769, 2200, -1753, 2200, -1714, 2151, -1710, 2151, -1666, 2200, -1661, 2217, -1704, 2260, -1590,
    2205, -1482, 2205, -1406, 2292, -1314, 2260, -1253, 2194, -1232, 2205, -1102, 2260, -1085, 2254, -1026, 2302, -1015, 2330, -917, 2428, -902, 2352, -879,
    2352, -798, 2320, -793, 2297, -734, 2167, -706, 2157, -625, 2205, -533, 2130, -566, 2097, -673, 1961, -673, 1928, -614, 1923, -500, 1842, -528,
    1739, -316,
  ],
];

const ringOf = (flat) => {
  const ring = [];
  for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] / 10, flat[i + 1] / 10]);
  return ring;
};
const circle = (radius, sides, [east, north] = [0, 0], from = 0) => Array.from({ length: sides }, (_, i) => [east + Math.cos(from + (i / sides) * TAU) * radius, north + Math.sin(from + (i / sides) * TAU) * radius]);
/** A number from 0 up to 1 that is always the same for the same two numbers. */
const chance = (a, b = 0) => {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const hex = (red, green, blue) => `#${[red, green, blue].map((part) => Math.round(Math.min(Math.max(part, 0), 255)).toString(16).padStart(2, '0')).join('')}`;
const rgb = (colour) => [Number.parseInt(colour.slice(1, 3), 16), Number.parseInt(colour.slice(3, 5), 16), Number.parseInt(colour.slice(5, 7), 16)];
/** A colour part of the way from one to another. */
const blend = (from, to, share) => {
  const a = rgb(from);
  const b = rgb(to);
  return hex(a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share);
};

// What things are made of. Plain stuff shows by night in the light trained on it; a lamp gives its own.
const plain = (colour, light = null, glow = 1) => (light ? { kind: 'plain', colour, light, glow } : { kind: 'plain', colour });
const lamp = (colour, light, glow = 1) => ({ kind: 'lamp', colour, light, glow });

/** The lagoon's two pieces of open water, each a ring of [east, north] in metres from BOULEVARD_WORLD. */
export function lagoonRings() {
  return LAGOON.map(ringOf);
}

/** Whether a place lies on the lagoon's water. */
export function onLagoon(lng, lat) {
  const squeeze = Math.cos(BOULEVARD_WORLD[1] * DEGREES) * METERS_PER_DEGREE;
  const x = (lng - BOULEVARD_WORLD[0]) * squeeze;
  const y = (lat - BOULEVARD_WORLD[1]) * METERS_PER_DEGREE;
  if (x < -260 || x > 330 || y < -330 || y > 230) return false;
  for (const ring of lagoonRings()) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[j];
      if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// The fairground's own ground, as the street map outlines it: west, south, east, north.
const FAIRGROUND = [46.59664, 24.7733, 46.60527, 24.78005];

/**
 * Whether a place lies within the fairground. (Seen from above it is full of
 * dark water, dark canopies and rock, which beside a building look like the
 * building's shadow: nothing there is measured by its shadow.)
 */
export function inFairground(lng, lat) {
  return lng >= FAIRGROUND[0] && lng <= FAIRGROUND[2] && lat >= FAIRGROUND[1] && lat <= FAIRGROUND[3];
}

/** Where the jets of the lagoon's fountain stand, in a line across it: [east, north] in metres from BOULEVARD_WORLD. */
export function fountainJets(count = 24) {
  const [[x0, y0], [x1, y1]] = [[-106.4, 0.4], [30.2, 72]];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    // (The line bows a little to the south, as the photo shows it.)
    const bow = Math.sin(t * Math.PI) * 14;
    return [x0 + (x1 - x0) * t + bow * 0.45, y0 + (y1 - y0) * t - bow];
  });
}

// ── The lagoon ────────────────────────────────────────────────────────────

const WATER_LEVEL = 0.12;
// The water: a mirror lying flat. By day it shows the sky, more of it the lower the eye; by night it is dark.
const WATER = { kind: 'glass', colour: '#2f6b78', storey: 4, bay: 3, floors: 0, mirror: 0.5, lit: 0 };
const QUAY_STONE = '#d2cbbb';
const QUAY_LIGHT = '#4a5cff'; // the quay wall is lit blue-violet right round the water
const PAVING = plain('#beb6a6', '#ffd29a', 0.2);
const PROMENADE_METERS = 9;
const PARAPET_METERS = 1.05;

// The lights that lie mirrored on the water, each a streak of ripples running out from its shore: where it
// starts and which way it runs (metres east and north), how long and how wide, and its colours.
const MIRRORED = [
  { from: [38, 146], way: [-0.2, -1], long: 78, wide: 24, colours: ['#ff5fb0', '#ffb347', '#ffffff', '#5fd8ff', '#ff7a3a'] }, // the Sphere
  { from: [116, 66], way: [-1, -0.45], long: 55, wide: 34, colours: ['#ffc45a', '#ffd98a', '#ffb03a'] }, // the temple and the pyramids
  { from: [4, -152], way: [0.15, 1], long: 46, wide: 44, colours: ['#ff4a2a', '#ffb03a', '#d8f05a', '#ff7a3a'] }, // the Chinese quarter
  { from: [-66, -146], way: [0.45, 1], long: 36, wide: 26, colours: ['#ff8a3a', '#ffa24a'] }, // the rock
  { from: [-164, -76], way: [1, 0.25], long: 44, wide: 30, colours: ['#ffd9a0', '#ff6a2a', '#9df2cf'] }, // the Paris quarter and its tower
  { from: [-62, 112], way: [0.8, -0.6], long: 46, wide: 26, colours: ['#ff3d8e', '#5f8dff', '#59f0c0', '#ffd23f'] }, // the rides of the pier
  { from: [44, -36], way: [-1, 0.1], long: 34, wide: 40, colours: ['#ffd9a0', '#ffb070'] }, // Little Venice
];

/**
 * The lagoon: its water; round it a parapet of stone, lit blue-violet on the
 * side of the water, and a paved walk behind the parapet with lamps along
 * it; on the water the light of the parapet and the mirrored lights of what
 * stands on the shores; across it the fountain's jets; on its shores the tall
 * masts of blue floodlights.
 */
function lagoon(model) {
  const lit = plain(QUAY_STONE, QUAY_LIGHT, 0.95);
  const stone = plain(QUAY_STONE, '#ffd29a', 0.25);
  const top = plain(QUAY_STONE, QUAY_LIGHT, 0.35);
  const shine = lamp('#3d7f8e', QUAY_LIGHT, 0.5);
  const post = plain('#2c3a33');
  const lantern = lamp('#f3e2b0', '#ffd98a', 1);
  let lamps = 0;
  for (const ring of lagoonRings()) {
    model.flat(ring.map(([east, north]) => [east, north, WATER_LEVEL]), WATER, { own: 5 });
    let area = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      area += x0 * y1 - x1 * y0;
    }
    const water = area >= 0 ? 1 : -1; // going round anticlockwise, the water is on the left
    // At every corner, the way straight back from the water: between the two sides that meet there.
    const back = ring.map((corner, i) => {
      const before = ring[(i + ring.length - 1) % ring.length];
      const after = ring[(i + 1) % ring.length];
      const a = Math.hypot(corner[0] - before[0], corner[1] - before[1]) || 1;
      const b = Math.hypot(after[0] - corner[0], after[1] - corner[1]) || 1;
      const n0 = [((corner[1] - before[1]) / a) * water, (-(corner[0] - before[0]) / a) * water];
      const n1 = [((after[1] - corner[1]) / b) * water, (-(after[0] - corner[0]) / b) * water];
      const size = Math.hypot(n0[0] + n1[0], n0[1] + n1[1]);
      if (size < 0.3) return [n0[0], n0[1], 1];
      // (Mitred, so that the parapet is as thick at a corner as along a side; but no spike at a sharp one.)
      const mitre = Math.min(2 / size, 1.6);
      return [(n0[0] + n1[0]) / size, (n0[1] + n1[1]) / size, mitre];
    });
    const off = (i, far) => [ring[i][0] + back[i][0] * back[i][2] * far, ring[i][1] + back[i][1] * back[i][2] * far];
    let walked = 0;
    let landBefore = null;
    for (let i = 0; i < ring.length; i += 1) {
      const j = (i + 1) % ring.length;
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[j];
      const run = Math.hypot(x1 - x0, y1 - y0);
      if (run < 0.3) continue;
      const land = [((y1 - y0) / run) * water, (-(x1 - x0) / run) * water];
      const [a0, a1] = [off(i, 0.45), off(j, 0.45)];
      // (The walk is laid side by side, each piece square to its own stretch of shore, and a wedge at every
      // corner between one piece and the next: a band mitred this wide would fold over itself in the coves.)
      const b0 = [x0 + land[0] * PROMENADE_METERS, y0 + land[1] * PROMENADE_METERS];
      const b1 = [x1 + land[0] * PROMENADE_METERS, y1 + land[1] * PROMENADE_METERS];
      if (landBefore) model.facet([x0, y0, 0.05], [x0 + landBefore[0] * PROMENADE_METERS, y0 + landBefore[1] * PROMENADE_METERS, 0.05], [b0[0], b0[1], 0.05], PAVING, { out: [0, 0, 1], own: 3, lines: [false, false, false] });
      landBefore = land;
      const [w0, w1] = [off(i, -2.4), off(j, -2.4)];
      // The parapet: lit on the side of the water, plain on the side of the walk.
      model.quad([x0, y0, WATER_LEVEL], [x1, y1, WATER_LEVEL], [x1, y1, PARAPET_METERS], [x0, y0, PARAPET_METERS], lit, { out: [-land[0], -land[1], 0] });
      model.quad([x0, y0, PARAPET_METERS], [x1, y1, PARAPET_METERS], [a1[0], a1[1], PARAPET_METERS], [a0[0], a0[1], PARAPET_METERS], top, { out: [0, 0, 1], own: 2 });
      model.quad([a0[0], a0[1], 0], [a1[0], a1[1], 0], [a1[0], a1[1], PARAPET_METERS], [a0[0], a0[1], PARAPET_METERS], stone, { out: [land[0], land[1], 0] });
      // The walk behind it, and the parapet's light lying on the water before it.
      model.quad([x0, y0, 0.05], [x1, y1, 0.05], [b1[0], b1[1], 0.05], [b0[0], b0[1], 0.05], PAVING, { out: [0, 0, 1], own: 3, lines: [false, false, false, false] });
      model.quad([x0, y0, WATER_LEVEL + 0.02], [x1, y1, WATER_LEVEL + 0.02], [w1[0], w1[1], WATER_LEVEL + 0.02], [w0[0], w0[1], WATER_LEVEL + 0.02], shine, { out: [0, 0, 1], own: 4 });
      // A lamp on the walk every 26 m or so.
      walked += run;
      if (walked >= 26) {
        walked = 0;
        const at = [(x0 + x1) / 2 + land[0] * 3.2, (y0 + y1) / 2 + land[1] * 3.2];
        beam(model, [at[0], at[1], 0], [at[0], at[1], 4.4], 0.16, post);
        block(model, frame(at), [-0.28, 0.28, -0.28, 0.28], 4.4, 5.1, lantern);
        lamps += 1;
      }
    }
  }
  // The mirrored lights: ripples, short and level, fewer and fainter the further out.
  MIRRORED.forEach((light, which) => {
    const size = Math.hypot(light.way[0], light.way[1]);
    const way = [light.way[0] / size, light.way[1] / size];
    const across = [-way[1], way[0]];
    for (let step = 0; step * 1.5 < light.long; step += 1) {
      const out = step * 1.5;
      const fade = 1 - out / light.long;
      if (chance(step, which) > 0.35 + 0.6 * fade) continue;
      const half = (light.wide / 2) * (0.3 + 0.7 * chance(step + 9, which)) * (0.55 + 0.45 * fade);
      const aside = (chance(step + 3, which * 7) - 0.5) * light.wide * 0.5;
      const middle = [light.from[0] + way[0] * out + across[0] * aside, light.from[1] + way[1] * out + across[1] * aside];
      const corner = (s, t) => [middle[0] + across[0] * half * s + way[0] * 0.38 * t, middle[1] + across[1] * half * s + way[1] * 0.38 * t, WATER_LEVEL + 0.04];
      const colour = light.colours[Math.floor(chance(step, which + 5) * light.colours.length)];
      model.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), lamp(blend('#2f6b78', colour, 0.25), colour, 0.3 + 0.6 * fade), { out: [0, 0, 1] });
    }
  });
  // The fountain's jets: thin plumes, lit blue from below.
  const plume = lamp('#e8f1f5', '#6a8bff', 0.9);
  for (const [east, north] of fountainJets()) lathe(model, frame([east, north]), [0, 0], [[0.45, WATER_LEVEL], [0.3, 2.6], [0.05, 5.2]], plume, { cuts: 5, smooth: false });
  // The floodlight masts: a pole as tall as a six-storey house, with a rack of blue lamps at its head.
  const mast = plain('#3a3f45');
  const flood = lamp('#cfe0ff', '#3f7dff', 1);
  for (const [east, north, turn] of FLOOD_MASTS) {
    const to = frame([east, north], turn * DEGREES);
    beam(model, to(0, 0, 0), to(0, 0, 19), 0.45, mast);
    for (const up of [17.2, 18.4]) for (const aside of [-1.3, 0, 1.3]) block(model, to, [-0.3, 0.3, aside - 0.5, aside + 0.5], up - 0.45, up + 0.45, flood);
  }
  return { lamps };
}

// Where the masts stand (metres east and north), and which way their lamps look (degrees anticlockwise from
// east). The photographs show them on every shore; their exact places are a judgement.
const FLOOD_MASTS = [[70, 138, 250], [128, 92, 215], [172, 30, 200], [158, -112, 120], [28, -146, 80], [-58, -128, 60], [-150, -60, 20], [-178, 12, 350], [-98, 96, 310], [-8, 150, 280]];

// ── The Sphere ────────────────────────────────────────────────────────────

const SPHERE_RADIUS = 17.5; // a ball 35 m through…
const SPHERE_MIDDLE = 22; // …its middle 22 m up: its foot is sunk into the round house it stands in
// What its screens show by night: bursts of colour like fireworks, each in its own colours.
const BURSTS = [['#ff4fa3', '#ffd0e6', '#ff8a3a'], ['#ffb347', '#fff1d6', '#ff5a3a'], ['#4fd8ff', '#e6fbff', '#b06bff'], ['#b06bff', '#ffd0ff', '#ff4fa3'], ['#59f0c0', '#eafff6', '#ffd23f'], ['#ff6a3a', '#ffe0c0', '#ffd23f']];

/** The way from the middle of a ball to the n-th of count places spread evenly over it. */
function spread(n, count) {
  const up = 1 - (2 * (n + 0.5)) / count;
  const round = n * 2.399963;
  const out = Math.sqrt(Math.max(1 - up * up, 0));
  return [Math.cos(round) * out, Math.sin(round) * out, up];
}

/**
 * The Sphere: a ball of screens 35 m through, sunk a little into a low round
 * house with lit glass fronts at the water's edge, on a round paved terrace.
 * (Inside it is a cinema whose screen goes right round.) Before it, at the
 * water, stands the tail of a whale, and a whale lies in the lagoon.
 */
function sphere(model) {
  const to = frame();
  prism(model, to, circle(40, 56), 0, 0.4, plain('#c9bfa9', '#ffd29a', 0.22));
  // The round house: glass fronts with lamps behind them between dark piers, a dark roof with a well for the ball.
  const pier = plain('#2b2f36');
  const front = lamp('#3c4854', '#ffc27a', 0.85);
  const roof = plain('#3b3632');
  lathe(model, to, [0, 0], [[24, 0.4], [24, 5.6]], (i, k) => (k % 4 === 3 ? pier : front), { cuts: 64, smooth: false });
  lathe(model, to, [0, 0], [[24, 5.6], [24.5, 5.9], [24.5, 6.4], [15.2, 6.4]], roof, { cuts: 48 });
  // The ball: rings of panes, each pane with the colour its place in a burst gives it.
  const centres = Array.from({ length: 18 }, (_, n) => spread(n, 18));
  const rings = 24;
  const cuts = 48;
  const until = 2.58; // (what lies lower is inside the house)
  const profile = ballProfile(SPHERE_RADIUS, SPHERE_MIDDLE, { rings, until });
  lathe(
    model,
    to,
    [0, 0],
    profile,
    (i, k) => {
      const down = until * (1 - (i + 0.5) / rings);
      const round = ((k + 0.5) / cuts) * TAU;
      const place = [Math.sin(down) * Math.cos(round), Math.sin(down) * Math.sin(round), Math.cos(down)];
      let nearest = 0;
      let most = -2;
      centres.forEach((centre, n) => {
        const close = place[0] * centre[0] + place[1] * centre[1] + place[2] * centre[2];
        if (close > most) {
          most = close;
          nearest = n;
        }
      });
      const centre = centres[nearest];
      const far = Math.acos(Math.min(most, 1)); // how far from the burst's middle, in radians
      // Which ray of the burst it lies on: the angle round the burst's middle.
      const aside = Math.abs(centre[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
      const e1 = [centre[1] * aside[2] - centre[2] * aside[1], centre[2] * aside[0] - centre[0] * aside[2], centre[0] * aside[1] - centre[1] * aside[0]];
      const size = Math.hypot(...e1) || 1;
      const e2 = [centre[1] * e1[2] - centre[2] * e1[1], centre[2] * e1[0] - centre[0] * e1[2], centre[0] * e1[1] - centre[1] * e1[0]];
      const ray = Math.floor(((Math.atan2(place[0] * e2[0] + place[1] * e2[1] + place[2] * e2[2], (place[0] * e1[0] + place[1] * e1[1] + place[2] * e1[2]) / size) + Math.PI) / TAU) * 16);
      const colours = BURSTS[nearest % BURSTS.length];
      const colour = far < 0.1 ? '#ffffff' : colours[(ray + (far > 0.3 ? 1 : 0)) % colours.length];
      const strong = far < 0.1 ? 1 : (ray % 2 === 0 ? 1 : 0.62) * (1 - 0.45 * Math.min(far / 0.55, 1));
      return lamp(blend('#18202e', colour, 0.3), colour, strong);
    },
    { cuts },
  );
  // The way in, on the side away from the water.
  const hall = frame([14, 36.5], -14 * DEGREES);
  block(model, hall, [-7.5, 7.5, -10, 10], 0.4, 7, plain('#2f3238', '#ffc27a', 0.15));
  panes(model, hall, [-7.5, 7.5, -10, 10], 'north', [[1, 4.6]], 4, lamp('#3c4854', '#ffc27a', 0.9), { share: 0.7 });
  // The whale's tail on its little quay, and the whale in the water.
  const whale = plain('#3b4650', '#6a8bff', 0.5);
  const tail = frame([-44.1, -24.8], 35 * DEGREES);
  lathe(model, tail, [0, 0], [[1.5, 0], [1.1, 4], [0.7, 8.5]], whale, { cuts: 8 });
  for (const side of [-1, 1]) {
    // (Its two flukes, spread.)
    const [v0, v1] = side < 0 ? [-0.5, 0] : [0, 0.5];
    const [w0, w1] = side < 0 ? [-4.2, -2.4] : [2.4, 4.2];
    taper(model, tail, [-0.6, 0.6, v0, v1], [-0.25, 0.25, w0, w1], 8.3, 10.6, whale);
  }
  const body = frame([-27.8, -47.5], 80 * DEGREES);
  taper(model, body, [-9, 9, -2.1, 2.1], [-6.5, 5, -1.2, 1.2], WATER_LEVEL, 2.3, whale);
  return {};
}

// ── The Star Flyer ────────────────────────────────────────────────────────

const FLYER_TALL = 115;

/**
 * The Star Flyer: the tall thin tower west of the Sphere, lit violet from
 * foot to head. A ring of seats rides up it on chains and swings out round
 * it. (How tall: judged from the booklet's cover, where it stands three
 * times as tall as the Sphere, and from the length of its streak in the
 * satellite photo.)
 */
function starFlyer(model) {
  const to = frame();
  lathe(model, to, [0, 0], [[6.5, 0], [6.5, 2.6], [5.6, 3.2], [1.9, 3.2]], plain('#e3e1dc', '#b455ff', 0.4), { cuts: 20 });
  const shaft = lamp('#d6d9de', '#b455ff', 0.95);
  lathe(model, to, [0, 0], [[1.9, 3.2], [1.5, 60], [1.2, 108], [0.5, 111], [0.12, FLYER_TALL]], shaft, { cuts: 8 });
  // The ring of seats, two thirds of the way up, and the star at the head.
  const ring = lamp('#e9e3d0', '#ffd23f', 1);
  const arm = lamp('#cfd3d8', '#ff5fd0', 0.9);
  const count = 12;
  for (let i = 0; i < count; i += 1) {
    const a0 = (i / count) * TAU;
    const a1 = ((i + 1) / count) * TAU;
    beam(model, to(Math.cos(a0) * 8.5, Math.sin(a0) * 8.5, 78), to(Math.cos(a1) * 8.5, Math.sin(a1) * 8.5, 78), 0.5, ring);
    beam(model, to(Math.cos(a0) * 1.4, Math.sin(a0) * 1.4, 81.5), to(Math.cos(a0) * 8.5, Math.sin(a0) * 8.5, 78), 0.3, arm);
    // (A seat on its chains, swung out.)
    beam(model, to(Math.cos(a0) * 8.5, Math.sin(a0) * 8.5, 78), to(Math.cos(a0) * 12.5, Math.sin(a0) * 12.5, 71.5), 0.14, plain('#9aa0a6'));
    block(model, frame([Math.cos(a0) * 12.5, Math.sin(a0) * 12.5]), [-0.5, 0.5, -0.5, 0.5], 70.4, 71.5, lamp('#c9ccd1', '#59f0ff', 0.8));
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * TAU;
    beam(model, to(0, 0, 108.5), to(Math.cos(angle) * 5, Math.sin(angle) * 5, 108.5 + (i % 2 ? 1.6 : 0)), 0.35, ring);
  }
  return { beacons: [[0, 0, FLYER_TALL + 0.6]] };
}

// ── Egypt ─────────────────────────────────────────────────────────────────

// The three pyramids, the smallest to the north: where the middle of each foot lies (metres east and north
// of the middle one), half its side, and its height (by the slope of the pyramids at Giza). They stand
// corner into corner, turned 24.5 degrees off the compass.
const PYRAMIDS = [
  { at: [-4.6, 35.4], half: 9.85, tall: 12.5 },
  { at: [0, 0], half: 18.2, tall: 23.1 },
  { at: [14.9, -41.9], half: 21.8, tall: 27.7 },
];
const PYRAMIDS_TURN = 24.5 * DEGREES;
const SANDSTONE = '#dcc48c';
const COURSE_LIGHT = '#ffbf5e';

/**
 * Egypt: the three pyramids, built in courses a man's height tall, every
 * course lit from its foot by night, so that each pyramid is striped with
 * light; the temple at the water, a columned court between two wings, and
 * before it the two pylons with a seated king at the foot of each; the
 * sphinx, and an obelisk.
 */
function egypt(model) {
  const riser = plain(SANDSTONE, COURSE_LIGHT, 0.95);
  const tread = plain('#cbb27c');
  for (const pyramid of PYRAMIDS) {
    const to = frame(pyramid.at, PYRAMIDS_TURN);
    const body = pyramid.tall - 1.6; // (the last of it is the capstone)
    const courses = Math.max(Math.round(body / 0.92), 4);
    const point = pyramid.half * (1.6 / pyramid.tall); // half the width where the capstone begins
    for (let i = 0; i < courses; i += 1) {
      const half = pyramid.half + (point - pyramid.half) * (i / courses);
      block(model, to, [-half, half, -half, half], (body * i) / courses, (body * (i + 1)) / courses, riser, { top: tread });
    }
    taper(model, to, [-point, point, -point, point], [0, 0, 0, 0], body, pyramid.tall, plain('#efe2bd', '#fff0c8', 0.8));
  }

  // The temple, down at the water: its long back to the lagoon, two wings running up from it, a court between.
  const stone = plain('#dcc9a0', '#ffc66a', 0.6);
  const gold = plain('#e6c880', '#ffcf6e', 0.95);
  const temple = frame([-28.9, -88.2], -16 * DEGREES);
  const cornice = (to, [u0, u1, v0, v1], foot, head) => {
    taper(model, to, [u0, u1, v0, v1], [u0 - 0.7, u1 + 0.7, v0 - 0.7, v1 + 0.7], foot, head, gold, { top: plain('#b8a57e') });
  };
  block(model, temple, [-17.5, 17.5, -8.5, -1], 0, 8, stone, { top: null });
  cornice(temple, [-17.5, 17.5, -8.5, -1], 8, 9.1);
  for (const side of [-1, 1]) {
    const [u0, u1] = side < 0 ? [-17.5, -11.5] : [11.5, 17.5];
    block(model, temple, [u0, u1, -1, 12], 0, 8, stone, { top: null });
    cornice(temple, [u0, u1, -1, 12], 8, 9.1);
  }
  // The columns round the court: a shaft that swells, and a capital like an open flower. Lit from the floor.
  const column = plain('#e2cf9f', '#ffc86a', 0.9);
  for (let i = 0; i < 6; i += 1) {
    const u = -9 + i * 3.6;
    lathe(model, temple, [u, 0.6], [[0.75, 0], [0.82, 2.5], [0.7, 5.6], [1.15, 6.6], [1.15, 7]], column, { cuts: 8 });
  }
  for (const side of [-1, 1]) for (let i = 0; i < 3; i += 1) lathe(model, temple, [side * 10.2, 3.6 + i * 3.4], [[0.75, 0], [0.82, 2.5], [0.7, 5.6], [1.15, 6.6], [1.15, 7]], column, { cuts: 8 });
  block(model, temple, [-11.5, 11.5, -1, 12], 0, 0.18, plain('#cdbb92', '#ffc66a', 0.35));

  // The pylons: walls that lean in as they rise, under a cornice that curls out; before each, a king seated.
  for (const at of [[-39.8, -70.7], [-13.4, -75.1]]) {
    const to = frame(at, -16 * DEGREES);
    taper(model, to, [-5.2, 5.2, -2.7, 2.7], [-4.5, 4.5, -2.1, 2.1], 0, 13.2, stone, { top: null });
    cornice(to, [-4.5, 4.5, -2.1, 2.1], 13.2, 14.7);
    // (The king sits on the side towards the water.)
    block(model, to, [-1.9, 1.9, -6.2, -3], 0, 1.4, stone);
    block(model, to, [-1.5, 1.5, -5.4, -3.2], 1.4, 2.9, gold);
    taper(model, to, [-1.5, 1.5, -4.4, -3.2], [-1.2, 1.2, -4.2, -3.3], 2.9, 5.6, gold);
    block(model, to, [-0.75, 0.75, -4.5, -3.3], 5.6, 7.1, gold);
    taper(model, to, [-1.05, 1.05, -4.6, -3.2], [-0.5, 0.5, -4.3, -3.4], 6.3, 8, gold);
  }

  // The sphinx, looking out over the lagoon: a lion lying, with a king's head in its striped cloth. (Where
  // it lies is a judgement: the booklet shows it before the pyramids at the water.)
  const sphinx = frame([-31.4, -37.7], -135 * DEGREES);
  block(model, sphinx, [-9, 9.5, -3.4, 3.4], 0, 1, stone);
  taper(model, sphinx, [-8, 3, -2.5, 2.5], [-7, 2.6, -1.9, 1.9], 1, 4.6, gold);
  for (const side of [-1, 1]) block(model, sphinx, [3, 9, side < 0 ? -2.4 : 1.2, side < 0 ? -1.2 : 2.4], 1, 2.5, gold);
  taper(model, sphinx, [0.6, 4.4, -2.1, 2.1], [1.2, 3.8, -1.5, 1.5], 4.6, 8.6, gold);
  taper(model, sphinx, [0.2, 3.4, -2.9, 2.9], [1, 3, -1.9, 1.9], 5.2, 9.3, plain('#d9bd72', '#ffcf6e', 0.9));

  // The obelisk.
  const obelisk = frame([-22.4, -20.7], PYRAMIDS_TURN);
  taper(model, obelisk, [-0.95, 0.95, -0.95, 0.95], [-0.6, 0.6, -0.6, 0.6], 0, 13, stone, { top: null });
  taper(model, obelisk, [-0.6, 0.6, -0.6, 0.6], [0, 0, 0, 0], 13, 14.3, gold);
  return {};
}

// ── The rock ──────────────────────────────────────────────────────────────

// The rock is a ring of cliffs: this many crags stand shoulder to shoulder round its court.
const CRAGS = 20;
const ROCK_ACROSS = [50, 41]; // from its middle to the middle of the ring: east-west, north-south
const GATE_AT = 238 * DEGREES; // where the gate goes through, anticlockwise from east: its south-south-west
const ROCK_STONE = ['#c99a69', '#c08f5e', '#d1a474', '#b98857'];
const ROCK_LIGHT = ['#ff8f3d', '#ff7a2e', '#ffa24f', '#ff6f4a'];
// What is thrown on the cliffs beside the gate by night: pictures in every colour.
const THROWN = ['#ff5fa8', '#3fd0c8', '#ffd23f', '#9a6bff', '#ff8a3a', '#5f8dff'];
// The fairground's name, as it stands in lit letters over the gate: five spots wide, seven tall.
const LETTERS = {
  B: ['1111.', '1...1', '1...1', '1111.', '1...1', '1...1', '1111.'],
  L: ['1....', '1....', '1....', '1....', '1....', '1....', '11111'],
  V: ['1...1', '1...1', '1...1', '1...1', '.1.1.', '.1.1.', '..1..'],
  D: ['1111.', '1...1', '1...1', '1...1', '1...1', '1...1', '1111.'],
  W: ['1...1', '1...1', '1...1', '1.1.1', '1.1.1', '11.11', '1...1'],
  O: ['.111.', '1...1', '1...1', '1...1', '1...1', '1...1', '.111.'],
  R: ['1111.', '1...1', '1...1', '1111.', '1.1..', '1..1.', '1...1'],
};

/** Letters of lamps on an upright face: to(u, v, up) with u along the face; each spot a lamp. */
function lettering(model, to, lines, { pitch = 0.44, top = 0, proud = 0, stuff }) {
  lines.forEach((line, row) => {
    const wide = line.length * 6 * pitch - pitch;
    [...line].forEach((letter, place) => {
      (LETTERS[letter] ?? []).forEach((spots, y) => {
        [...spots].forEach((spot, x) => {
          if (spot !== '1') return;
          const u = -wide / 2 + (place * 6 + x) * pitch;
          const up = top - row * 8.6 * pitch - y * pitch;
          model.quad(to(u, -proud, up - pitch * 0.8), to(u + pitch * 0.8, -proud, up - pitch * 0.8), to(u + pitch * 0.8, -proud, up), to(u, -proud, up), stuff, { out: to.way(0, -1) });
        });
      });
    });
  });
}

/**
 * The rock at the entrance: a ring of sandstone cliffs some hundred metres
 * across, ledged and crowned with knobs of rock, round an open court; lit
 * orange by night. The gate goes through its south-south-west, under the
 * fairground's name in lit letters, with pictures thrown on the cliffs
 * beside it. From its north-east an arm of rock runs out to the lagoon,
 * carrying the trough of the boat ride that plunges into the water there.
 */
function rock(model) {
  const crag = (middle, reach, tall, n, thrown = false) => {
    // A crag: an uneven column, stepping in at two ledges, with a knob or two on its head.
    const corners = 9;
    const outline = (shrink, twist) => Array.from({ length: corners }, (_, k) => {
      const angle = (k / corners) * TAU + twist;
      const far = reach * shrink * (0.82 + 0.36 * chance(n * 3.1 + k, 2));
      return [middle[0] + Math.cos(angle) * far, middle[1] + Math.sin(angle) * far];
    });
    const stages = [[0, 0.46, 1, 0], [0.46, 0.8, 0.9, 0.2], [0.8, 1, 0.76, 0.45]];
    stages.forEach(([from, until, shrink, twist], stage) => {
      const tone = (n + stage) % ROCK_STONE.length;
      const light = thrown ? THROWN[(n * 2 + stage) % THROWN.length] : ROCK_LIGHT[tone];
      prism(model, frame(), outline(shrink, twist), tall * from, tall * until, plain(ROCK_STONE[tone], light, thrown ? 0.85 : 0.8), { top: plain(blend(ROCK_STONE[tone], '#8a6a48', 0.35), light, 0.25) });
    });
    const knobs = 1 + Math.floor(chance(n, 7) * 2.2);
    for (let k = 0; k < knobs; k += 1) {
      const at = [middle[0] + (chance(n, k + 11) - 0.5) * reach * 0.8, middle[1] + (chance(n, k + 17) - 0.5) * reach * 0.8];
      const wide = reach * (0.22 + 0.16 * chance(n, k + 23));
      lathe(model, frame(at), [0, 0], [[wide, tall - 0.5], [wide * 1.08, tall + wide * 0.8], [wide * 0.8, tall + wide * 1.6], [wide * 0.3, tall + wide * 2]], plain(ROCK_STONE[(n + k) % ROCK_STONE.length], ROCK_LIGHT[k % ROCK_LIGHT.length], 0.7), { cuts: 7, smooth: false });
    }
  };
  let tallest = 0;
  for (let n = 0; n < CRAGS; n += 1) {
    const angle = (n / CRAGS) * TAU;
    // (Two crags make way for the gate.)
    const off = Math.abs(((angle - GATE_AT + Math.PI * 3) % TAU) - Math.PI);
    if (off < 0.12) continue;
    const middle = [Math.cos(angle) * ROCK_ACROSS[0] * (0.94 + 0.12 * chance(n, 1)), Math.sin(angle) * ROCK_ACROSS[1] * (0.94 + 0.12 * chance(n, 3))];
    // Tallest at the back, to the north; lower beside the gate.
    const tall = 21 + 9 * chance(n, 5) + 4 * Math.max(Math.sin(angle), 0);
    tallest = Math.max(tallest, tall);
    crag(middle, 11.5 + 3 * chance(n, 9), tall, n, off < 0.75);
  }
  // The gate: a way through under a lintel of rock, and the name over it.
  const gate = frame([Math.cos(GATE_AT) * ROCK_ACROSS[0], Math.sin(GATE_AT) * ROCK_ACROSS[1]], GATE_AT + Math.PI / 2);
  const lintel = plain(ROCK_STONE[0], '#ffb070', 0.85);
  block(model, gate, [-11, -4.5, -6, 6], 0, 24, lintel);
  block(model, gate, [4.5, 11, -6, 6], 0, 24, lintel);
  block(model, gate, [-4.5, 4.5, -6, 6], 9.5, 25.5, lintel, { faces: {} });
  block(model, gate, [-4.5, 4.5, -5.4, 5.4], 0, 0.15, plain('#b79a78', '#ff9a4a', 0.5));
  lettering(model, gate, ['BLVD', 'WORLD'], { top: 23, proud: 6.3, stuff: lamp('#f1e6c8', '#fff0b8', 1) });
  // The arm of rock to the lagoon, and the trough the boats ride: up along the arm, and down into the water.
  const arm = [[30, 34, 20], [37, 52, 18], [43, 70, 16], [48, 88, 13]];
  arm.forEach(([east, north, tall], n) => crag([east, north], 9 - n, tall, 40 + n));
  const trough = plain('#8a7a66', '#ffb070', 0.3);
  const run = lamp('#7fb8c8', '#8fd8ff', 0.8);
  const way = [[24, 22, 19.5], [34, 46, 21.5], [42, 70, 19], [47, 90, 16.5], [52, 112, 1.2], [54.5, 124, 0.5]];
  for (let i = 0; i < way.length - 1; i += 1) {
    const [a, b] = [way[i], way[i + 1]];
    beam(model, a, b, 4.6, trough, { deep: 1.2 });
    beam(model, [a[0], a[1], a[2] + 0.7], [b[0], b[1], b[2] + 0.7], 2.6, run, { deep: 0.2 });
  }
  return { tallest };
}

// ── The entrance ──────────────────────────────────────────────────────────

const MUD = '#9a6a47'; // the brown of a Najdi wall
const MUD_LIGHT = '#ff9a55';

/** A Najdi tower: mud-brick, leaning in a little, its head stepped at the corners and picked out in white; small lit windows. */
function najdiTower(model, to, half, tall) {
  const wall = plain(MUD, MUD_LIGHT, 0.55);
  const white = plain('#efe6d6', '#ffe6c0', 0.8);
  taper(model, to, [-half, half, -half, half], [-half * 0.93, half * 0.93, -half * 0.93, half * 0.93], 0, tall, wall, { top: plain('#7d573b') });
  const head = half * 0.93;
  // A white band under the head, a row of small triangles above it, and the stepped corners.
  block(model, to, [-head - 0.12, head + 0.12, -head - 0.12, head + 0.12], tall - 2.6, tall - 2.2, white, { top: null });
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let step = 0; step < 3; step += 1) {
      const size = 1.5 - step * 0.45;
      const [u0, u1] = su > 0 ? [head - size, head] : [-head, -head + size];
      const [v0, v1] = sv > 0 ? [head - size, head] : [-head, -head + size];
      block(model, to, [u0, u1, v0, v1], tall + step * 0.7, tall + (step + 1) * 0.7, step === 2 ? white : wall);
    }
  }
  const window = lamp('#5a3d28', '#ffb060', 0.9);
  const rows = [];
  for (let up = 4.2; up < tall - 4; up += 3.6) rows.push([up, up + 1.1]);
  for (const side of ['south', 'east', 'north', 'west']) panes(model, to, [-head, head, -head, head], side, rows, 2, window, { share: 0.26, margin: 1.2 });
}

/** A golden rider on a camel, a little over life size, on the garden's ground: which way it walks (radians anticlockwise from east). */
function camelRider(model, at, facing, scale = 1) {
  const to = frame(at, facing);
  const gold = plain('#d9a640', '#ffc24a', 0.95);
  const s = scale;
  for (const [u, v] of [[-1.1, -0.35], [-1.1, 0.35], [0.9, -0.35], [0.9, 0.35]]) block(model, to, [(u - 0.16) * s, (u + 0.16) * s, (v - 0.16) * s, (v + 0.16) * s], 0, 1.7 * s, gold, { top: null });
  taper(model, to, [-1.5 * s, 1.3 * s, -0.55 * s, 0.55 * s], [-1.2 * s, 1 * s, -0.4 * s, 0.4 * s], 1.7 * s, 2.7 * s, gold);
  taper(model, to, [-0.5 * s, 0.3 * s, -0.4 * s, 0.4 * s], [-0.3 * s, 0.1 * s, -0.25 * s, 0.25 * s], 2.7 * s, 3.3 * s, gold); // the hump
  beam(model, to(1.15 * s, 0, 2.4 * s), to(1.9 * s, 0, 3.7 * s), 0.38 * s, gold); // the neck
  block(model, to, [1.7 * s, 2.5 * s, -0.22 * s, 0.22 * s], 3.55 * s, 4 * s, gold); // the head
  taper(model, to, [-0.5 * s, 0.05 * s, -0.3 * s, 0.3 * s], [-0.4 * s, -0.05 * s, -0.22 * s, 0.22 * s], 3.2 * s, 4.5 * s, gold); // the rider
  block(model, to, [-0.4 * s, -0.05 * s, -0.2 * s, 0.2 * s], 4.5 * s, 4.95 * s, gold);
}

/**
 * The entrance: a round plaza before the rock's gate. In its middle a garden
 * with golden riders on camels; on either hand a curved range of Najdi
 * towers with a great screen between two of them; across its south edge
 * four black posts of light; from its north a ramp up to the gate.
 */
function entrance(model) {
  const to = frame();
  prism(model, to, circle(32.5, 48), 0, 0.1, plain('#b9a88e', '#ffc98a', 0.3));
  // The garden: a bed in the middle, lamps round it, and the riders.
  prism(model, to, [[-11, -14], [4, -15], [13, -8], [12, 9], [3, 15], [-9, 13], [-14, 2]], 0.1, 0.45, plain('#8f8a5c', '#ffb85a', 0.4));
  [[-6, -8, 20], [2, -9, 60], [8, -3, 100], [7, 5, 140], [0, 9, 200], [-7, 7, 250], [-9, -1, 300], [-1, -2, 30], [3, 2, 170]].forEach(([east, north, turn], n) => camelRider(model, [east, north], turn * DEGREES, 1 + 0.25 * chance(n, 4)));
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * TAU;
    const at = [Math.cos(angle) * 17.5, Math.sin(angle) * 18.5];
    beam(model, [at[0], at[1], 0.1], [at[0], at[1], 3.4], 0.14, plain('#3a2f24'));
    block(model, frame(at), [-0.3, 0.3, -0.3, 0.3], 3.4, 4, lamp('#f3dca0', '#ffcf7a', 1));
  }
  // The ranges of towers: west of the plaza, and east of it.
  const range = (from, until, screenAt) => {
    const towers = [from, (from + until) / 2, until];
    towers.forEach((angle, n) => {
      const here = frame([Math.cos(angle * DEGREES) * 43, Math.sin(angle * DEGREES) * 43], angle * DEGREES + Math.PI / 2);
      najdiTower(model, here, 4.6, n === 1 ? 21 : 18.5);
    });
    // Between the towers: a lower wing with shops under an arcade; and between two of them the screen.
    for (let n = 0; n < 2; n += 1) {
      const a0 = towers[n] + 7;
      const a1 = towers[n + 1] - 7;
      const pieces = Math.max(Math.round(Math.abs(a1 - a0) / 6), 1);
      for (let i = 0; i < pieces; i += 1) {
        const angle = (a0 + ((a1 - a0) * (i + 0.5)) / pieces) * DEGREES;
        const long = ((Math.abs(a1 - a0) / pieces) * DEGREES * 43) / 2 + 0.3;
        const here = frame([Math.cos(angle) * 43, Math.sin(angle) * 43], angle + Math.PI / 2);
        block(model, here, [-long, long, -3.6, 3.6], 0, 8.2, plain(MUD, MUD_LIGHT, 0.5), { top: plain('#7d573b') });
        // (The side towards the plaza is the one at +v: it looks back at the middle.)
        panes(model, here, [-long, long, -3.6, 3.6], 'north', [[0.4, 3.4]], 2, lamp('#6a4a30', '#ffc27a', 0.95), { share: 0.7, margin: 0.4 });
        if (n === screenAt) block(model, here, [-long, long, 3.7, 4.1], 4.4, 14.5, { kind: 'lamp', colour: '#d8d2e6', light: '#ff5fa8', glow: 1, changing: true }, { top: plain('#2a2a2e') });
      }
    }
  };
  range(152, 204, 0);
  range(43, -45, 0);
  // The four posts of light across the south.
  const post = plain('#16171a');
  const strip = lamp('#dfe6f2', '#bfe0ff', 1);
  for (const angle of [209, 232, 255, 279]) {
    const here = frame([Math.cos(angle * DEGREES) * 33.5, Math.sin(angle * DEGREES) * 33.5], angle * DEGREES + Math.PI / 2);
    block(model, here, [-0.9, 0.9, -0.55, 0.55], 0, 8, post);
    for (const side of ['south', 'north']) panes(model, here, [-0.9, 0.9, -0.55, 0.55], side, [[0.6, 7.4]], 2, strip, { share: 0.16, margin: 0.15 });
  }
  // The ramp up to the gate, railed in timber.
  const ramp = [[10, 30, 0.1], [14.5, 50, 0.3]];
  beam(model, ramp[0], ramp[1], 6, plain('#a8906c', '#ffb070', 0.4), { deep: 0.25 });
  // The screens on poles that show the flags of the quarters. (The owner's photograph shows them beside the
  // way in; just where they stand is a judgement.)
  const flags = [
    [[0, 1 / 3, '#1f9a4a'], [1 / 3, 2 / 3, '#f4f4f4'], [2 / 3, 1, '#d8262c']], // Italy
    [[0, 0.25, '#c8102e'], [0.25, 0.75, '#ffc400'], [0.75, 1, '#c8102e']], // Spain (level)
    [[0, 1 / 3, '#2f8a3a'], [1 / 3, 2 / 3, '#f4f4f4'], [2 / 3, 1, '#ff9933']], // India (level)
    [[0, 1 / 3, '#1a1a1a'], [1 / 3, 2 / 3, '#f4f4f4'], [2 / 3, 1, '#ce1126']], // Egypt (level)
    [[0, 1 / 3, '#0055a4'], [1 / 3, 2 / 3, '#f4f4f4'], [2 / 3, 1, '#ef4135']], // France
    [[0, 0.2, '#0d5eaf'], [0.2, 0.4, '#f4f4f4'], [0.4, 0.6, '#0d5eaf'], [0.6, 0.8, '#f4f4f4'], [0.8, 1, '#0d5eaf']], // Greece (level)
  ];
  flags.forEach((bands, n) => {
    const at = [-41 + n * 3.4 + (n % 2) * 1.5, 31 + (n % 3) * 3.2];
    const tall = 9 + ((n * 5) % 7);
    beam(model, [at[0], at[1], 0], [at[0], at[1], tall], 0.3, plain('#1c1d20'));
    disc(model, [at[0], at[1], tall + 1.2], 2.1, (250 + n * 6) * DEGREES, bands.map(([from, until, colour]) => [from, until, lamp(blend(colour, '#101010', 0.35), colour, 0.95)]), { level: [1, 2, 3, 5].includes(n) });
  });
  return {};
}

// ── China ─────────────────────────────────────────────────────────────────

const CHINA_RED = '#b3261e';
const TILE_GREY = '#49575a';
const TILE_GREEN = '#2f9a58';
const LATTICE = lamp('#b08a3c', '#ffd68a', 0.95); // a window of gilded lattice with a lamp behind it

/**
 * A Chinese hall: red posts and walls with windows of gilded lattice, under a
 * roof of tiles that sweeps down to deep eaves and turns up at its corners.
 * The underside of the eaves is lit red; the edge of the roof is a line of
 * light. half: [along, across]; storeys: one or two.
 */
function chineseHall(model, to, [halfU, halfV], { storeys = 1, tiles = TILE_GREY, edge = '#d8f05a', shops = false } = {}) {
  const red = plain(CHINA_RED, '#ff5a30', 0.7);
  const storey = 5;
  const tall = storeys * storey + 0.6;
  block(model, to, [-halfU, halfU, -halfV, halfV], 0, tall, red, { top: null });
  const bays = Math.max(Math.round(halfU / 1.9), 2);
  const deepBays = Math.max(Math.round(halfV / 1.9), 2);
  for (let floor = 0; floor < storeys; floor += 1) {
    const row = [[floor * storey + 1.1, floor * storey + 4.1]];
    const pane = floor === 0 && shops ? lamp('#c9b48a', '#fff0d0', 1) : LATTICE;
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'south', row, bays, pane, { share: 0.62, margin: 0.5 });
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'north', row, bays, pane, { share: 0.62, margin: 0.5 });
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'east', row, deepBays, pane, { share: 0.62, margin: 0.5 });
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'west', row, deepBays, pane, { share: 0.62, margin: 0.5 });
    // (A balcony round the upper floor.)
    if (floor > 0) block(model, to, [-halfU - 1, halfU + 1, -halfV - 1, halfV + 1], floor * storey - 0.25, floor * storey + 0.1, plain('#8f1f19', '#ff5a30', 0.6));
  }
  const over = 3;
  const rise = Math.min(halfV, halfU) * 0.5 + 1;
  sweptRoof(model, to, [halfU + over, halfV + over], [Math.max(halfU - halfV, 0) * 0.9 + 0.6, 0.35], tall, rise, plain(tiles, edge, 0.12), { power: 1.75, lift: 1.5, steps: 4, cols: 6, under: plain('#a52a1c', '#ff4a2a', 0.95), wall: [halfU, halfV] });
  // The line of light along the eaves, and the ridge with its gilded ends.
  const line = lamp(blend(tiles, edge, 0.4), edge, 0.95);
  const [eu, ev] = [halfU + over, halfV + over];
  for (const [a, b] of [[[-eu, -ev], [eu, -ev]], [[eu, -ev], [eu, ev]], [[eu, ev], [-eu, ev]], [[-eu, ev], [-eu, -ev]]]) beam(model, to(a[0] * 0.86, a[1] * 0.86, tall + 0.1), to(b[0] * 0.86, b[1] * 0.86, tall + 0.1), 0.3, line);
  const ridge = Math.max(halfU - halfV, 0) * 0.9 + 0.6;
  beam(model, to(-ridge, 0, tall + rise + 0.2), to(ridge, 0, tall + rise + 0.2), 0.5, plain('#3b4649', '#ffd68a', 0.5), { ends: true });
  for (const end of [-1, 1]) taper(model, to, [end * ridge - 0.5, end * ridge + 0.5, -0.4, 0.4], [end * (ridge + 0.5) - 0.15, end * (ridge + 0.5) + 0.15, -0.12, 0.12], tall + rise, tall + rise + 1.8, plain('#c9a94a', '#ffd68a', 0.9));
  return tall + rise + 1.8;
}

/**
 * The Chinese quarter, square to the compass on its own quay: the long
 * gallery down its west side; kiosks under green roofs and dark ones;
 * lanterns on strings between them; and a junk at anchor off the quay. (Its
 * halls and its pagoda are models made from photographs: see props.js.)
 */
function china(model) {
  const to = frame();
  prism(model, to, [[-31, 52], [18, 52], [22, 20], [70, -30], [70, -70], [-31, -70]], 0, 0.3, plain('#d9cdb4', '#ffcf9a', 0.3));
  // (The great hall, the red hall and the small hall in the south-east, and the pagoda at the red hall's
  // corner, are not built here: they are models made from photographs. See props.js.)
  chineseHall(model, frame([-27, 21], Math.PI / 2), [30, 4], { edge: '#ffb03a' });
  // Kiosks: four under green roofs, then two rows under dark ones, six-sided.
  for (const east of [-11, 0, 11, 22]) chineseHall(model, frame([east, -22]), [4, 3.2], { tiles: TILE_GREEN, edge: '#c8ff6a' });
  for (const [row, north] of [[0, -35], [1, -47]]) {
    for (let i = 0; i < 5; i += 1) {
      const kiosk = frame([-16 + i * 9 + row * 3, north]);
      lathe(model, kiosk, [0, 0], [[3, 0], [3, 3.1]], plain(CHINA_RED, '#ff5a30', 0.75), { cuts: 6, smooth: false });
      lathe(model, kiosk, [0, 0], [[4.6, 3.1], [3.2, 3.9], [1.2, 5.3], [0.15, 6.4]], plain(TILE_GREY, '#ffb03a', 0.3), { cuts: 6, smooth: false });
      lathe(model, kiosk, [0, 0], [[3.05, 0.9], [3.05, 2.5]], (i2, k) => (k % 2 === 0 ? lamp('#c9b48a', '#fff0d0', 0.95) : null), { cuts: 6, smooth: false });
    }
  }
  // Lanterns on strings: red, each with its lamp.
  const lantern = lamp('#c8321e', '#ff4a22', 1);
  for (const [from, until] of [[[-20, -12], [26, -12]], [[-20, -29], [30, -29]], [[-20, -41], [30, -41]], [[-14, 12], [14, 12]]]) {
    for (let i = 0; i <= 10; i += 1) {
      const at = [from[0] + ((until[0] - from[0]) * i) / 10, from[1] + ((until[1] - from[1]) * i) / 10];
      const sag = 5.6 - Math.sin((i / 10) * Math.PI) * 0.7;
      lathe(model, frame(at), [0, 0], [[0.15, sag - 0.5], [0.42, sag - 0.2], [0.42, sag + 0.2], [0.15, sag + 0.5]], lantern, { cuts: 6 });
    }
  }
  // The junk: a hull high at the stern, one mast, a sail the colour of rust.
  const junk = frame([64, 49], 115 * DEGREES);
  const wood = plain('#7a4a2c', '#ff9a4a', 0.6);
  taper(model, junk, [-5.5, 6, -1.1, 1.1], [-6.5, 7, -1.9, 1.9], WATER_LEVEL, 2, wood);
  block(model, junk, [-6.3, -3.2, -1.7, 1.7], 2, 3.4, wood);
  beam(model, junk(0.5, 0, 2), junk(0.5, 0, 12), 0.3, wood);
  const sail = plain('#a8452e', '#ff7a4a', 0.5);
  model.quad(junk(-2.6, 0.2, 4), junk(3.6, 0.2, 3.4), junk(3.2, 0.2, 11), junk(-2, 0.2, 11.6), sail, { out: junk.way(0, 1) });
  model.quad(junk(-2.6, 0.1, 4), junk(3.6, 0.1, 3.4), junk(3.2, 0.1, 11), junk(-2, 0.1, 11.6), sail, { out: junk.way(0, -1) });
  return {};
}

// ── Greece ────────────────────────────────────────────────────────────────

const WHITEWASH = '#f4f6f8';
const AEGEAN = '#2a5fb0';

/**
 * The Greek village: whitewashed houses crowded up a low mound, the tallest
 * in the middle, each with its blue door and shutters; three blue domes, and
 * the bell tower of a church with a fourth. North of it the theatre: half a
 * ring of white tiers.
 */
function greece(model) {
  const white = plain(WHITEWASH, '#dfe6ff', 0.75);
  const blue = plain(AEGEAN, '#4f8dff', 0.8);
  const door = lamp('#2a5fb0', '#5f9dff', 0.7);
  const warm = lamp('#c8d2e6', '#ffe6b8', 0.9);
  const dome = (to, at, radius, foot) => {
    lathe(model, to, at, [[radius * 1.02, foot], [radius * 1.02, foot + 0.7]], white, { cuts: 14 });
    lathe(model, to, at, ballProfile(radius, foot + 0.7, { rings: 5, until: Math.PI / 2 }), blue, { cuts: 14 });
  };
  let n = 0;
  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      n += 1;
      const far = Math.hypot(column * 9.4, row * 10.4);
      if (far > 25) continue;
      const pick = chance(n, 1);
      const at = [column * 9.4 + (pick - 0.5) * 3, row * 10.4 + (chance(n, 2) - 0.5) * 3];
      const to = frame(at, (-8 + 16 * chance(n, 3)) * DEGREES);
      const half = [3.6 + 1.6 * chance(n, 4), 3.4 + 1.4 * chance(n, 5)];
      const tall = 5.5 + 5.5 * (1 - far / 26) + 1.5 * chance(n, 6);
      block(model, to, [-half[0], half[0], -half[1], half[1]], 0, tall, white);
      // (A parapet with rounded shoulders, as the houses of the islands have: a low block set back.)
      block(model, to, [-half[0] + 0.5, half[0] - 0.5, -half[1] + 0.5, half[1] - 0.5], tall, tall + 0.5, white);
      // An upper room on some; a dome on others.
      if (pick > 0.62) block(model, to, [-half[0] + 0.4, half[0] * 0.2, -half[1] + 0.4, half[1] - 1], tall + 0.5, tall + 3.4, white);
      else if (pick < 0.2) dome(to, [0, 0], Math.min(half[0], half[1]) * 0.62, tall + 0.5);
      const floors = Math.max(Math.floor(tall / 3.2), 1);
      const rows = Array.from({ length: floors }, (_, floor) => [floor * 3.2 + 0.2, floor * 3.2 + 2.4]);
      for (const side of ['south', 'east', 'north', 'west']) panes(model, to, [-half[0], half[0], -half[1], half[1]], side, rows, 2, (floor, bay) => (floor === 0 && bay === 0 ? door : (floor + bay + n) % 3 === 0 ? warm : door), { share: 0.3, margin: 0.9 });
    }
  }
  // The church: a white tower, an arched opening for the bell under a blue dome.
  const tower = frame([-10, -24]);
  block(model, tower, [-2.1, 2.1, -2.1, 2.1], 0, 9.5, white);
  block(model, tower, [-1.7, 1.7, -1.7, 1.7], 9.5, 12.2, white);
  for (const side of ['south', 'east', 'north', 'west']) panes(model, tower, [-1.7, 1.7, -1.7, 1.7], side, [[10, 11.6]], 1, lamp('#3a4a66', '#ffe6b8', 0.8), { share: 0.4, margin: 0.2 });
  dome(tower, [0, 0], 1.75, 12.2);
  // The theatre: tiers rising to the north, the stage to the south.
  const theatre = frame([7.8, 57]);
  const tiers = [];
  for (let i = 0; i < 8; i += 1) tiers.push([9 + i * 1.9, i * 0.75], [9 + i * 1.9, (i + 1) * 0.75]);
  tiers.push([24.5, 6], [24.5, 0]);
  lathe(model, theatre, [0, 0], tiers, plain('#efe9dc', '#dfe6ff', 0.55), { cuts: 20, from: 0, sweep: Math.PI, smooth: false });
  block(model, theatre, [-11, 11, -9, -5], 0, 4.5, white);
  return {};
}

/**
 * The white bridge from Egypt's shore to Little Venice: a walk on low
 * arches, curving, between white balustrades, lit blue from under its
 * deck.
 */
function whiteBridge(model) {
  const path = [[18.7, 61.3], [5.3, 57.3], [0, 42.6], [4.7, 25.3], [-2, 10.6], [-4, 0]];
  const deck = plain('#eceae4', '#dfe6ff', 0.6);
  const under = lamp('#b9c2d6', QUAY_LIGHT, 0.9);
  for (let i = 0; i < path.length - 1; i += 1) {
    const [a, b] = [path[i], path[i + 1]];
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const to = frame(a, Math.atan2(b[1] - a[1], b[0] - a[0]));
    block(model, to, [-0.4, run + 0.4, -3.3, 3.3], 2, 2.5, deck, { faces: { south: under, north: under } });
    for (const side of [-1, 1]) block(model, to, [-0.4, run + 0.4, side * 3.3 - 0.18, side * 3.3 + 0.18], 2.5, 3.5, deck);
    // (A pier under every joint.)
    block(model, to, [-0.9, 0.9, -2.9, 2.9], 0, 2, deck, { top: null });
  }
  return {};
}

// ── Little Venice ─────────────────────────────────────────────────────────

// The houses on the island: where each stands (metres east and north of the island's middle), half its
// length and half its depth, how tall, and which way it is turned (degrees anticlockwise from east).
const PALAZZI = [
  [-40, 37.3, 4, 4, 9, 30], [-44.7, 28, 5.3, 4.6, 11, 30], [-44, 14.7, 6, 5, 10, 30], [-31.3, 38.7, 5.5, 5.5, 12, 30], [-22.7, 42.7, 4.5, 5, 10, 30],
  [-15.3, 49.3, 5.5, 6, 11, 25], [-3.3, 51.3, 6, 4.5, 9.5, 25], [0, 41.3, 6.5, 7, 13, 25], [-21.3, 28, 7.5, 7.5, 13.5, 30], [1.3, 25.3, 5, 5, 10, 25],
  [-4.7, 13.3, 5.5, 5, 11, 25], [-20.7, 6, 5.5, 5, 10, 25], [25.3, 34.7, 6.5, 6, 11, 0], [25.3, 17.3, 9, 7, 12, 5], [20, -5.3, 6.5, 5.5, 11, 23],
  [32, 1.3, 4.5, 6, 9, 23], [40.7, -8, 5, 6, 10, 23], [32, -21.3, 4.5, 6.5, 9, 23], [-14, -21.3, 4.5, 10, 11, 23], [3.3, -22.7, 7.5, 8, 13, 23],
  [14, -36, 6, 6, 10, 23], [-3.3, -40, 7, 7.5, 12, 23], [-28, -18.7, 4.5, 5, 9, 23], [-31.3, -32, 4.5, 5, 10, 23],
];
const STUCCO = ['#d9a59a', '#e0b877', '#ead9bd', '#c98263', '#e6c9a8', '#d8b0a0'];
const ROOF_TILE = '#a8523a';

/**
 * Little Venice: an island of houses in pink, ochre and cream stucco under
 * low roofs of red tiles, their windows lit, canals between them; at its
 * west point a bell tower of red brick under a green spire; at its east
 * point, where the white bridge lands, a round lighthouse banded in red.
 */
function venice(model) {
  PALAZZI.forEach(([east, north, halfU, halfV, tall, turn], n) => {
    const to = frame([east, north], turn * DEGREES);
    const colour = STUCCO[n % STUCCO.length];
    block(model, to, [-halfU, halfU, -halfV, halfV], 0, tall, plain(colour, '#ffc890', 0.5), { top: null });
    sweptRoof(model, to, [halfU + 0.6, halfV + 0.6], [Math.max(halfU - halfV, 0) + 0.3, Math.max(halfV - halfU, 0) + 0.3], tall, Math.min(halfU, halfV) * 0.42, plain(ROOF_TILE, '#ff9a6a', 0.12));
    const floors = Math.round((tall - 1) / 3.4);
    const rows = Array.from({ length: floors }, (_, floor) => [0.9 + floor * 3.4, 0.9 + floor * 3.4 + 2.1]);
    const window = (floor, bay) => (chance(n * 7 + floor, bay) < 0.7 ? lamp('#4a4038', '#ffd9a0', 0.95) : plain('#3a3a40'));
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'south', rows, Math.max(Math.round(halfU / 1.5), 2), window, { share: 0.42 });
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'north', rows, Math.max(Math.round(halfU / 1.5), 2), window, { share: 0.42 });
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'east', rows, Math.max(Math.round(halfV / 1.5), 2), window, { share: 0.42 });
    panes(model, to, [-halfU, halfU, -halfV, halfV], 'west', rows, Math.max(Math.round(halfV / 1.5), 2), window, { share: 0.42 });
  });
  // The bell tower. (The booklet shows it at the water; which point of the island it stands on is a judgement.)
  const tower = frame([-46.5, -4], 23 * DEGREES);
  const brick = plain('#b5553a', '#ffb070', 0.7);
  const pale = plain('#e9dcc4', '#ffe0b0', 0.85);
  block(model, tower, [-2.7, 2.7, -2.7, 2.7], 0, 19, brick, { top: null });
  block(model, tower, [-3, 3, -3, 3], 19, 19.7, pale);
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) block(model, tower, [su * 2.7 - 0.55 * (su > 0 ? 1 : 0), su * 2.7 + 0.55 * (su > 0 ? 0 : 1), sv * 2.7 - 0.55 * (sv > 0 ? 1 : 0), sv * 2.7 + 0.55 * (sv > 0 ? 0 : 1)], 19.7, 23.6, pale, { top: null });
  block(model, tower, [-1.6, 1.6, -1.6, 1.6], 19.7, 23.4, lamp('#5a4a3a', '#ffd08a', 0.9), { top: null });
  block(model, tower, [-3, 3, -3, 3], 23.6, 24.4, pale);
  taper(model, tower, [-2.6, 2.6, -2.6, 2.6], [0, 0, 0, 0], 24.4, 30.5, plain('#6f9a7a', '#d8e08a', 0.6));
  // The lighthouse: white, three red bands, a lantern under a cap.
  const light = frame([51.3, 8]);
  lathe(model, light, [0, 0], [[3.3, 0], [3.1, 3], [2.9, 6], [2.7, 9], [2.5, 12], [2.3, 14]], (i) => (i % 2 === 0 ? plain('#f1efe9', '#ffe6c8', 0.7) : plain('#c8322a', '#ff5a40', 0.8)), { cuts: 14 });
  lathe(model, light, [0, 0], [[2.9, 14], [2.9, 14.4], [1.5, 14.4], [1.5, 16.4], [1.9, 16.6], [0.1, 18]], (i) => (i === 3 ? lamp('#f3e2b0', '#fff0c0', 1) : plain('#e9e7e1', '#ffe6c8', 0.6)), { cuts: 12 });
  // The causeway to the south shore.
  const walk = plain('#d9d2c2', '#ffd29a', 0.35);
  beam(model, [13, -48, 0.9], [31, -80, 0.9], 6.5, walk, { deep: 0.5 });
  return {};
}

// ── Paris ─────────────────────────────────────────────────────────────────

const EIFFEL_AT = [-69.1, -26.4]; // from the fountain. (The satellite photo does not show the tower plainly: a judgement.)
const EIFFEL_TALL = 40;

/** The tower: four legs that lean together under arches, two platforms, a shaft of four chords braced crosswise, a cabin and a mast. All of it lit orange by night, redder towards the top. */
function eiffel(model, to) {
  const iron = (share) => lamp('#7a4a30', share > 0.7 ? '#ff3a3a' : share > 0.4 ? '#ff5a2a' : '#ff7a2a', 1);
  const levels = [[0, 6.4], [8.6, 3.5], [17, 1.9], [35, 0.5]]; // height, half the width there
  for (let n = 0; n < levels.length - 1; n += 1) {
    const [z0, h0] = levels[n];
    const [z1, h1] = levels[n + 1];
    const thick = [1.25, 0.85, 0.5][n];
    const stuff = iron(z1 / EIFFEL_TALL);
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) beam(model, to(su * h0, sv * h0, z0), to(su * h1, sv * h1, z1), thick, stuff);
    // Braces crosswise on all four faces: more of them where the tower is tall and thin.
    const panels = [1, 2, 7][n];
    for (let p = 0; p < panels; p += 1) {
      const [a, b] = [p / panels, (p + 1) / panels];
      const [za, zb] = [z0 + (z1 - z0) * a, z0 + (z1 - z0) * b];
      const [ha, hb] = [h0 + (h1 - h0) * a, h0 + (h1 - h0) * b];
      for (const [fu, fv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const corner = (half, side, z) => (fu !== 0 ? to(fu * half, side * half, z) : to(side * half, fv * half, z));
        if (n > 0) {
          beam(model, corner(ha, -1, za), corner(hb, 1, zb), thick * 0.4, stuff);
          beam(model, corner(ha, 1, za), corner(hb, -1, zb), thick * 0.4, stuff);
        }
        beam(model, corner(hb, -1, zb), corner(hb, 1, zb), thick * 0.45, stuff);
      }
    }
  }
  // The arches between the legs.
  for (const [fu, fv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let before = null;
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      const side = -1 + 2 * t;
      const half = 6.4 - (6.4 - 3.5) * (Math.sin(t * Math.PI) * 6.6) / 8.6;
      const z = Math.sin(t * Math.PI) * 6.6;
      const here = fu !== 0 ? to(fu * half, side * 5.4, z) : to(side * 5.4, fv * half, z);
      if (before) beam(model, before, here, 0.5, iron(0.1));
      before = here;
    }
  }
  block(model, to, [-4.3, 4.3, -4.3, 4.3], 8.3, 8.9, iron(0.2));
  block(model, to, [-2.5, 2.5, -2.5, 2.5], 16.7, 17.3, iron(0.45));
  block(model, to, [-1, 1, -1, 1], 34.4, 36.4, iron(0.9));
  beam(model, to(0, 0, 36.4), to(0, 0, EIFFEL_TALL), 0.25, lamp('#8a8a8a', '#fff3d0', 1));
}

/**
 * The Paris quarter: a round place with a fountain in its middle, open to
 * the lagoon on the north-east; round it blocks of pale stone four storeys
 * tall under roofs of grey slate, their windows lit; down the street to the
 * west-south-west the tower; north-west of the place a hall under a dome;
 * and in the water before it a sea serpent arching.
 */
function paris(model) {
  const to = frame();
  prism(model, to, circle(30, 48), 0, 0.08, plain('#c4bcab', '#ffd29a', 0.3));
  // The fountain: a pool in a rim of stone, its water lit green; a bowl raised on a stem; jets round it.
  lathe(model, to, [0, 0], [[6.9, 0.08], [6.9, 0.8], [6.2, 0.8], [6.2, 0.55]], plain('#e2dccb', '#ffe6c0', 0.6), { cuts: 28 });
  prism(model, to, circle(6.2, 28), 0.5, 0.55, lamp('#7fcfc4', '#9df2cf', 0.9));
  lathe(model, to, [0, 0], [[0.7, 0.55], [0.6, 2.2], [3.3, 3], [3.4, 3.3], [0.4, 3.3], [0.25, 4.6]], plain('#e2dccb', '#fff0c8', 0.9), { cuts: 16 });
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * TAU;
    lathe(model, frame([Math.cos(angle) * 5.2, Math.sin(angle) * 5.2]), [0, 0], [[0.2, 0.55], [0.12, 1.5], [0.03, 2.2]], lamp('#e8f1f5', '#eafff6', 0.9), { cuts: 4, smooth: false });
  }
  // The blocks round the place: each stands square to the middle. (A street is left open towards the tower.)
  const stone = ['#e8dfc8', '#e3d6c0', '#ead9c8', '#dcd0bd'];
  const slate = plain('#4a4f58', '#8a90a0', 0.1);
  const window = (n) => (floor, bay) => (chance(n * 5 + floor, bay) < 0.72 ? lamp('#4a4038', '#ffd9a0', 0.95) : plain('#33353c'));
  const shop = lamp('#5a4a3a', '#ffcf8a', 1);
  [98, 127, 156, 185, 217, 246, 275, 304].forEach((angle, n) => {
    const here = frame([Math.cos(angle * DEGREES) * 39, Math.sin(angle * DEGREES) * 39], angle * DEGREES + Math.PI / 2);
    const [halfU, halfV] = [8.6, 6.4];
    block(model, here, [-halfU, halfU, -halfV, halfV], 0, 15.4, plain(stone[n % stone.length], '#ffe2b0', 0.42), { top: null });
    block(model, here, [-halfU - 0.25, halfU + 0.25, -halfV - 0.25, halfV + 0.25], 15.4, 15.9, plain('#f1e9d6', '#ffe2b0', 0.6));
    taper(model, here, [-halfU, halfU, -halfV, halfV], [-halfU + 1.5, halfU - 1.5, -halfV + 1.5, halfV - 1.5], 15.9, 19.4, slate);
    const rows = [[4.6, 6.9], [8.2, 10.5], [11.8, 14.1]];
    for (const [side, bays] of [['south', 5], ['north', 5], ['east', 3], ['west', 3]]) {
      panes(model, here, [-halfU, halfU, -halfV, halfV], side, rows, bays, window(n), { share: 0.42 });
      // (The windows in the roof, each in its own little gable.)
      panes(model, here, [-halfU + 0.8, halfU - 0.8, -halfV + 0.8, halfV - 0.8], side, [[16.3, 18.1]], bays - 1, window(n + 9), { share: 0.34, proud: 0.05 });
    }
    // The shops on the ground floor, towards the place (the side at +v looks back at the fountain).
    panes(model, here, [-halfU, halfU, -halfV, halfV], 'north', [[0.5, 3.5]], 3, shop, { share: 0.8, margin: 0.5 });
    panes(model, here, [-halfU, halfU, -halfV, halfV], 'south', [[0.5, 3.5]], 3, shop, { share: 0.6, margin: 0.5 });
  });
  eiffel(model, frame(EIFFEL_AT, 20 * DEGREES));
  // The hall under its dome.
  const hall = frame([-39.1, 24.6]);
  lathe(model, hall, [0, 0], [[8, 0], [8, 6.5], [8.4, 6.9], [8, 7.2]], plain('#ece6d8', '#ffe2b0', 0.55), { cuts: 20 });
  lathe(model, hall, [0, 0], ballProfile(8, 7.2, { rings: 6, until: Math.PI / 2, squash: 0.8 }), plain('#f3f1ec', '#dfe6ff', 0.5), { cuts: 20 });
  // The stage by the water, under a blue canopy.
  const stage = frame([30, 30], 35 * DEGREES);
  block(model, stage, [-11, 11, -7, 7], 6.2, 6.9, plain('#2f5fb8', '#5f8dff', 0.7));
  for (const [u, v] of [[-10, -6], [10, -6], [10, 6], [-10, 6]]) beam(model, stage(u, v, 0), stage(u, v, 6.2), 0.4, plain('#2a2d33'));
  block(model, stage, [-9, 9, 5.2, 5.6], 1.2, 5.6, { kind: 'lamp', colour: '#d8d2e6', light: '#ff3d5e', glow: 1, changing: true });
  // The sea serpent: three arches of its body out of the water, and its head.
  const serpent = plain('#b8742e', '#ff9a3a', 0.9);
  const lie = frame([52, 14], -20 * DEGREES);
  for (let hump = 0; hump < 3; hump += 1) {
    let before = null;
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      const here = lie(hump * 7 + t * 5.6, 0, Math.sin(t * Math.PI) * (4.6 - hump * 0.9));
      if (before) beam(model, before, here, 1.1 - hump * 0.15, serpent);
      before = here;
    }
  }
  taper(model, lie, [-3.4, -1.6, -0.8, 0.8], [-4.6, -3, -0.5, 0.5], 4.4, 6.6, serpent);
  beam(model, lie(-1.2, 0, 0.2), lie(-2.4, 0, 4.6), 1, serpent);
  return {};
}

// ── The big wheel ─────────────────────────────────────────────────────────

const WHEEL_RADIUS = 31;
const WHEEL_AXLE = 35;
const WHEEL_FACES = Math.atan2(121, 349.6); // the way from the wheel to the middle of the lagoon

/**
 * The big wheel: a thin white rim strung with lights on spokes as thin as
 * wire, cabins hung all round it, on two pairs of legs; it turns its face to
 * the lagoon. (The satellite photo is older than the wheel: where it stands
 * is judged from the owner's photograph of it, taken across the water.)
 */
function wheel(model) {
  const to = frame([0, 0], WHEEL_FACES + Math.PI / 2); // u runs along the wheel's face, v through it
  const rim = lamp('#e9edf2', '#ffffff', 1);
  const spoke = lamp('#cfd8e2', '#8fc8ff', 0.75);
  const steel = plain('#dfe3e8', '#bfd8ff', 0.5);
  const count = 40;
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      const a0 = (i / count) * TAU;
      const a1 = ((i + 1) / count) * TAU;
      beam(model, to(Math.cos(a0) * WHEEL_RADIUS, side * 1.3, WHEEL_AXLE + Math.sin(a0) * WHEEL_RADIUS), to(Math.cos(a1) * WHEEL_RADIUS, side * 1.3, WHEEL_AXLE + Math.sin(a1) * WHEEL_RADIUS), 0.55, rim);
      if (i % 2 === 0) beam(model, to(0, side * 0.9, WHEEL_AXLE), to(Math.cos(a0) * WHEEL_RADIUS, side * 1.3, WHEEL_AXLE + Math.sin(a0) * WHEEL_RADIUS), 0.26, spoke);
    }
    // A leg on either hand, spread at the foot.
    for (const along of [-1, 1]) beam(model, to(along * 12, side * 4.5, 0), to(0, side * 1.6, WHEEL_AXLE), 1, steel);
  }
  for (let i = 0; i < count; i += 2) {
    const angle = (i / count) * TAU;
    const [u, up] = [Math.cos(angle) * WHEEL_RADIUS, WHEEL_AXLE + Math.sin(angle) * WHEEL_RADIUS];
    beam(model, to(u, -1.3, up), to(u, 1.3, up), 0.3, steel);
    // (A cabin hangs under every other joint of the rim.)
    block(model, frame(to(u, 0).slice(0, 2), WHEEL_FACES + Math.PI / 2), [-0.9, 0.9, -0.9, 0.9], up - 3, up - 0.8, lamp('#e6ebf1', i % 4 === 0 ? '#ffffff' : '#6ab8ff', 0.9));
  }
  beam(model, to(0, -2.2, WHEEL_AXLE), to(0, 2.2, WHEEL_AXLE), 2.4, steel, { ends: true });
  block(model, to, [-14, 14, -6, 6], 0, 1.2, plain('#c9cdd2', '#bfd8ff', 0.3));
  return { beacons: [[0, 0, WHEEL_AXLE + WHEEL_RADIUS + 0.8]] };
}

// ── Mexico, India, Kuwait ─────────────────────────────────────────────────

/** Mexico: a pyramid of nine steps in pale stone, a stair up the side towards the lagoon between two edges of yellow light, and a small temple on top. */
function mexico(model) {
  const to = frame([0, 0], 30 * DEGREES);
  const stone = plain('#e7d5cf', '#ffb8a8', 0.75);
  const steps = 9;
  const [foot, head, tall] = [17, 6.4, 16.2];
  for (let i = 0; i < steps; i += 1) {
    const h0 = foot + ((head - foot) * i) / steps;
    const h1 = foot + ((head - foot) * (i + 1)) / steps + 0.55;
    taper(model, to, [-h0, h0, -h0, h0], [-h1, h1, -h1, h1], (tall * i) / steps, (tall * (i + 1)) / steps, stone, { top: plain('#d9c6c0', '#ffb8a8', 0.3) });
  }
  block(model, to, [-3.6, 3.6, -3.6, 3.6], tall, tall + 3.4, stone);
  block(model, to, [-4, 4, -4, 4], tall + 3.4, tall + 4, plain('#d9c6c0', '#ffb8a8', 0.5));
  panes(model, to, [-3.6, 3.6, -3.6, 3.6], 'south', [[tall + 0.3, tall + 2.6]], 1, lamp('#7a2a1a', '#ff6a2a', 0.9), { share: 0.34, margin: 0.2 });
  // The stair, and the light along its edges.
  const stair = plain('#efe1dc', '#ffd0c0', 0.8);
  const edge = lamp('#e6c84a', '#ffd23f', 1);
  model.quad(to(-3, -foot - 2.5, 0), to(3, -foot - 2.5, 0), to(3, -head + 0.2, tall), to(-3, -head + 0.2, tall), stair, { out: to.way(0, -1, 1) });
  for (const side of [-1, 1]) beam(model, to(side * 3.2, -foot - 2.5, 0.2), to(side * 3.2, -head + 0.2, tall + 0.2), 0.45, edge);
  return {};
}

/** A dome shaped like an onion, on a drum, with its finial: for the lathe. */
const onion = (radius, foot) => [[radius * 0.92, foot], [radius * 0.92, foot + radius * 0.35], [radius * 1.08, foot + radius * 0.75], [radius * 1.1, foot + radius * 1.1], [radius * 0.95, foot + radius * 1.5], [radius * 0.62, foot + radius * 1.85], [radius * 0.26, foot + radius * 2.1], [radius * 0.06, foot + radius * 2.3], [radius * 0.05, foot + radius * 2.9]];

/** India: a hall of white marble on its terrace, after the Taj Mahal: a great dome like an onion, four small domed kiosks round it, a slim tower at each corner of the terrace, tall arched bays lit from within. */
function india(model) {
  const to = frame([0, 0], 3 * DEGREES);
  const marble = plain('#f4efe8', '#ffd9e8', 0.8);
  const bay = lamp('#b8a890', '#ffe08a', 0.95);
  block(model, to, [-14, 14, -15, 15], 0, 1.6, marble);
  block(model, to, [-9, 9, -9, 9], 1.6, 10.6, marble);
  for (const side of ['south', 'east', 'north', 'west']) {
    panes(model, to, [-9, 9, -9, 9], side, [[2.2, 8.8]], 1, bay, { share: 0.3, margin: 0.5 });
    panes(model, to, [-9, 9, -9, 9], side, [[2.2, 5], [5.8, 8.6]], 4, (row, n) => (n === 1 || n === 2 ? null : bay), { share: 0.5, margin: 0.9 });
  }
  lathe(model, to, [0, 0], onion(5.4, 10.6), marble, { cuts: 20 });
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    // The kiosks on the roof: a little dome on posts.
    const kiosk = [su * 6.6, sv * 6.6];
    for (const [pu, pv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) beam(model, to(kiosk[0] + pu * 1.1, kiosk[1] + pv * 1.1, 10.6), to(kiosk[0] + pu * 1.1, kiosk[1] + pv * 1.1, 12.6), 0.3, marble);
    lathe(model, to, kiosk, onion(1.9, 12.6), marble, { cuts: 10 });
    // The towers at the terrace's corners.
    const tower = [su * 13, sv * 14];
    lathe(model, to, tower, [[1.05, 1.6], [0.85, 14.5], [1.15, 14.7], [1.15, 15.1], [0.8, 15.1]], marble, { cuts: 10 });
    lathe(model, to, tower, onion(0.85, 15.1), marble, { cuts: 8 });
  }
  return {};
}

/** Kuwait: the towers of Kuwait City in little: white needles, the tallest carrying two balls covered in blue-green discs, the second one ball, the third none. */
function kuwait(model) {
  const needle = plain('#f1efe9', '#dfe6ff', 0.75);
  const ball = (to, at, radius, middle) => {
    lathe(model, to, at, ballProfile(radius, middle, { rings: 9, squash: 0.86 }), (i, k) => ((i + k) % 3 === 0 ? lamp('#e9f1ef', '#eafff6', 0.8) : (i + k) % 3 === 1 ? lamp('#1f8f8a', '#2fd0c0', 0.8) : lamp('#2a6fb0', '#4f9dff', 0.8)), { cuts: 18 });
  };
  const first = frame([-8, 14]);
  lathe(model, first, [0, 0], [[2.3, 0], [1.3, 12], [0.9, 24], [0.12, 32]], needle, { cuts: 10 });
  ball(first, [0, 0], 5.8, 15.5);
  ball(first, [0, 0], 3, 24.5);
  const second = frame([6, -14]);
  lathe(model, second, [0, 0], [[1.6, 0], [0.9, 12], [0.1, 24]], needle, { cuts: 10 });
  ball(second, [0, 0], 4, 13.5);
  lathe(model, frame([3, 0]), [0, 0], [[1.1, 0], [0.5, 14], [0.08, 22]], needle, { cuts: 8 });
  return {};
}

// ── Japan ─────────────────────────────────────────────────────────────────

const GRENDIZER_TALL = 33.7;

/**
 * Japan: the giant robot of the cartoon, 33.7 m to the tips of its horns:
 * black and silver, a red breast, blue at the hips, horns of gold; and behind
 * it the fronts of a city street, grey, hung with signs of red and pink
 * light. (Where the robot stands is a judgement from the satellite photo and
 * the booklet's picture across the lagoon.)
 */
function japan(model) {
  const to = frame([0, 0], -45 * DEGREES); // it looks out over the lagoon, to the south-east: u is the way it looks
  const black = plain('#22252b', '#cfd8ff', 0.5);
  const silver = plain('#c9ced6', '#eef2ff', 0.7);
  const red = plain('#c8202a', '#ff4a4a', 0.85);
  const blue = plain('#2a5fd0', '#5f9dff', 0.85);
  const gold = plain('#d9b03a', '#ffd86a', 0.95);
  for (const side of [-1, 1]) {
    // A leg: a silver boot, a black thigh; an arm: black, with a forearm striped red and white.
    taper(model, to, [-1.9, 2.1, side * 2.6 - 1.7, side * 2.6 + 1.7], [-1.5, 1.5, side * 2.4 - 1.3, side * 2.4 + 1.3], 0, 7.5, silver);
    taper(model, to, [-1.5, 1.5, side * 2.4 - 1.3, side * 2.4 + 1.3], [-1.7, 1.7, side * 2.2 - 1.5, side * 2.2 + 1.5], 7.5, 13.5, black);
    lathe(model, to, [0, side * 6.3], ballProfile(2.5, 23.6, { rings: 6 }), black, { cuts: 10 });
    block(model, to, [-1.3, 1.3, side * 6.6 - 1.2, side * 6.6 + 1.2], 16.5, 22, black);
    taper(model, to, [-1.5, 1.5, side * 6.8 - 1.4, side * 6.8 + 1.4], [-1.2, 1.2, side * 6.8 - 1.1, side * 6.8 + 1.1], 12, 16.5, red);
    block(model, to, [-1, 1.2, side * 6.8 - 0.95, side * 6.8 + 0.95], 10.2, 12, black);
    // A horn: out from the head, and up.
    beam(model, to(0, side * 1.2, 28.2), to(0, side * 4.6, 29.6), 1.1, gold);
    beam(model, to(0, side * 4.6, 29.6), to(0, side * 5.4, GRENDIZER_TALL), 0.8, gold);
  }
  block(model, to, [-1.9, 1.9, -3.6, 3.6], 13.5, 16, blue);
  taper(model, to, [-2, 2, -3.4, 3.4], [-2.6, 2.6, -5, 5], 16, 22, black);
  block(model, to, [-2.6, 2.6, -5, 5], 22, 24.6, black);
  // The red breast, a broad point downwards.
  model.flat([to(2.68, -4.4, 24.2), to(2.68, 4.4, 24.2), to(2.3, 0, 17.6)], red, { out: to.way(1, 0, 0) });
  block(model, to, [-1.3, 1.5, -1.5, 1.5], 24.6, 29.2, black);
  panes(model, to, [-1.3, 1.5, -1.5, 1.5], 'east', [[27, 27.7]], 2, lamp('#d9c84a', '#ffe84a', 1), { share: 0.5, margin: 0.25 });
  // The street behind it: fronts of grey, and signs of light standing down them.
  const signs = ['#ff2a4a', '#ff5fd0', '#3fd8ff', '#ffb03a'];
  [[-16, -10, 7, 14], [-18, 4, 6, 18], [-15, 17, 7, 12], [-27, -3, 6, 16], [-28, 12, 6, 13]].forEach(([u, v, half, tall], n) => {
    const here = to.sub([u, v]);
    block(model, here, [-half * 0.7, half * 0.7, -half, half], 0, tall, plain(['#6a6f78', '#5a5f68', '#787d86'][n % 3], '#8fa0c8', 0.3));
    panes(model, here, [-half * 0.7, half * 0.7, -half, half], 'east', Array.from({ length: Math.floor(tall / 3.2) }, (_, floor) => [floor * 3.2 + 1, floor * 3.2 + 2.6]), 4, (floor, bay) => (chance(n * 9 + floor, bay) < 0.55 ? lamp('#4a4f58', '#cfe6ff', 0.8) : plain('#30333a')), { share: 0.6 });
    block(model, here, [half * 0.7 + 0.1, half * 0.7 + 0.5, -half + 0.6, -half + 2], tall * 0.3, tall * 0.95, lamp('#c8c8d0', signs[n % signs.length], 1));
  });
  return {};
}

// ── The pier ──────────────────────────────────────────────────────────────

/** The pier of rides: a coaster of red steel on its trestles, running out along the pier and back; and a carousel under a striped tent at the pier's head. */
function pier(model) {
  const to = frame([0, 0], -61 * DEGREES); // u runs out along the pier, towards the lagoon
  const steel = lamp('#c0222e', '#ff3d6e', 0.9);
  const trestle = plain('#a81e28', '#ff3d6e', 0.45);
  const track = [];
  const count = 44;
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * TAU;
    // Out along one side, a hill and a dip; round the head; back along the other with a second, lower hill.
    const u = Math.cos(t) * 36;
    const v = Math.sin(t) * 6.5;
    const up = 6 + 7 * (1 + Math.sin(t * 3 + 0.6)) * (0.55 + 0.45 * Math.cos(t));
    track.push(to(u, v, up));
  }
  for (let i = 0; i < count; i += 1) {
    const [a, b] = [track[i], track[(i + 1) % count]];
    beam(model, a, b, 0.9, steel, { deep: 0.5 });
    if (i % 2 === 0) beam(model, [a[0], a[1], 0], [a[0], a[1], a[2] - 0.3], 0.35, trestle);
  }
  // The carousel.
  const tent = frame(to(44, -2).slice(0, 2));
  lathe(model, tent, [0, 0], [[5.6, 0], [5.6, 0.5]], plain('#e9dcc0', '#ffd98a', 0.6), { cuts: 16 });
  lathe(model, tent, [0, 0], [[5.8, 4.2], [5.4, 4.8], [0.3, 7.6], [0.1, 9]], (i, k) => (k % 2 === 0 ? lamp('#f1e6c8', '#ffe6a0', 0.9) : lamp('#d8b040', '#ffb03a', 0.9)), { cuts: 16, smooth: false });
  for (let i = 0; i < 8; i += 1) beam(model, tent(Math.cos((i / 8) * TAU) * 4.8, Math.sin((i / 8) * TAU) * 4.8, 0.5), tent(Math.cos((i / 8) * TAU) * 4.8, Math.sin((i / 8) * TAU) * 4.8, 4.3), 0.2, plain('#e6d8b0', '#ffd98a', 0.8));
  return {};
}

/**
 * What stands at Boulevard World, each thing a landmark for the map: its
 * name, where its middle is (metres east and north of BOULEVARD_WORLD), how
 * tall, how far it reaches from its middle, within what distance the map's
 * own blocks are taken out for it, and how it is built: model(model) builds
 * it as a true model about its middle. (shade, shades and covers: as for any
 * landmark, see landmarks.js.)
 */
export const WORLD_PARTS = [
  { id: 'blvd-world-lagoon', name: 'Boulevard World lagoon', at: [0, 0], height: 19, reach: 370, clear: 0, model: lagoon, covers: onLagoon },
  { id: 'blvd-world-sphere', name: 'The Sphere, Boulevard World', at: [40.5, 190.5], height: SPHERE_MIDDLE + SPHERE_RADIUS, reach: 62, clear: 42, model: sphere, shade: { radius: 16, height: 34 } },
  { id: 'blvd-world-flyer', name: 'The Star Flyer, Boulevard World', at: [-26, 192], height: FLYER_TALL, reach: 14, clear: 8, model: starFlyer, shade: { radius: 1.5, height: 100 } },
  {
    id: 'blvd-world-egypt',
    name: 'The pyramids, Boulevard World',
    at: [181.4, 155.7],
    height: 27.7,
    reach: 105,
    clear: 30,
    model: egypt,
    // (A pyramid's shadow is that of a block half as wide and half as tall.)
    shades: PYRAMIDS.map((pyramid) => ({ at: pyramid.at, radius: pyramid.half * 0.55, height: pyramid.tall * 0.55 })),
  },
  { id: 'blvd-world-rock', name: 'The rock at the entrance, Boulevard World', at: [-97, -205], height: 30, reach: 135, clear: 62, model: rock, shade: { radius: 44, height: 22 } },
  { id: 'blvd-world-entrance', name: 'The entrance, Boulevard World', at: [-136, -295], height: 21, reach: 55, clear: 52, model: entrance },
  { id: 'blvd-world-china', name: 'The Chinese quarter, Boulevard World', at: [2, -191], height: 12, reach: 82, clear: 80, model: china },
  { id: 'blvd-world-greece', name: 'The Greek village, Boulevard World', at: [203, -9], height: 16.2, reach: 85, clear: 34, model: greece },
  { id: 'blvd-world-bridge', name: 'The white bridge, Boulevard World', at: [149, -29.3], height: 3.5, reach: 66, clear: 0, model: whiteBridge },
  { id: 'blvd-world-venice', name: 'Little Venice, Boulevard World', at: [95, -40], height: 30.5, reach: 92, clear: 62, model: venice },
  { id: 'blvd-world-paris', name: 'The Paris quarter, Boulevard World', at: [-207.9, -88.6], height: EIFFEL_TALL, reach: 84, clear: 50, model: paris },
  { id: 'blvd-world-wheel', name: 'The big wheel, Boulevard World', at: [-349.6, -121], height: WHEEL_AXLE + WHEEL_RADIUS, reach: 33, clear: 16, model: wheel },
  { id: 'blvd-world-mexico', name: 'The Mexican pyramid, Boulevard World', at: [-261, 167], height: 20.2, reach: 30, clear: 26, model: mexico, shade: { radius: 10, height: 10 } },
  { id: 'blvd-world-india', name: 'The Indian hall, Boulevard World', at: [-72.5, 238], height: 26.2, reach: 24, clear: 24, model: india, shade: { radius: 9, height: 12 } },
  { id: 'blvd-world-kuwait', name: 'The Kuwait Towers, Boulevard World', at: [-116, 236], height: 32, reach: 24, clear: 10, model: kuwait },
  { id: 'blvd-world-japan', name: 'Grendizer, Boulevard World', at: [-137, 199], height: GRENDIZER_TALL, reach: 42, clear: 14, model: japan, shade: { radius: 5, height: 28 } },
  { id: 'blvd-world-pier', name: 'The pier of rides, Boulevard World', at: [-98, 176], height: 20, reach: 52, clear: 20, model: pier },
];

/** Where a part's middle lies, as [lng, lat]. */
export function worldPlace([east, north]) {
  const squeeze = Math.cos(BOULEVARD_WORLD[1] * DEGREES) * METERS_PER_DEGREE;
  return [BOULEVARD_WORLD[0] + east / squeeze, BOULEVARD_WORLD[1] + north / METERS_PER_DEGREE];
}
