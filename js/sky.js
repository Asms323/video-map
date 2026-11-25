// The sky over the city, and what is in it.
//
// The map draws a sky: a colour overhead that pales towards the horizon.
// That is a backdrop, and it has no depth. What gives a sky its depth is
// what is in it at different distances, and that is set out here as it is
// over Riyadh at the moment in hand:
//
//  - the sun, and round the horizon the colours of its going down: the glow
//    on its own side, and on the far side the pink band over the grey-blue
//    shadow of the Earth;
//  - the moon where it really stands, with as much of its face lit as it has;
//  - the stars and the planets where they really stand, coming out one by
//    one as it darkens, the brightest first;
//  - the clouds, in the three layers the weather tells of (low, middle and
//    high), as much of each as it says there is: each lies level at its own
//    height, so that it runs away to the horizon in ever thinner bands, and
//    each drifts on the wind at its own pace;
//  - the aircraft where flights.js has them, with the trails the high ones
//    leave and the lamps they all carry.
//
// The clouds and the aircraft are put where they are, kilometres off (and
// as much lower as the Earth curves away under them); the sun, the moon and
// the stars on a great bowl round the eye. The scene draws all of it behind
// everything else it draws.
//
// Nothing here touches the browser. Directions are [east, north, up];
// places in the scene are metres east, north and up of its origin.

import { AIRLINERS as AIRLINER_SIZES, AIRLINER_PARTS as AIRLINER_PARTS_PAINT, airliner, wingEndsOf } from './airliner.js';
import { STARS } from './stars.js';

const RADIANS = Math.PI / 180;
const TAU = Math.PI * 2;
/** How far off the sun, the moon and the stars are put, in metres: far enough that moving about the city does not shift them. */
export const SKY_RADIUS = 2000000;
// The Earth's radius as the bending of light through the air makes it seem: what is far off stands so much lower.
const EARTH_CURVE_METERS = 7.4e6;

const daysSince2000 = (date) => date.getTime() / 86400000 + 2440587.5 - 2451545;
const turned = (degrees) => ((degrees % 360) + 360) % 360;
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const smooth = (from, to, x) => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, part) => [a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part, a[2] + (b[2] - a[2]) * part];
const add = (a, b, by = 1) => [a[0] + b[0] * by, a[1] + b[1] * by, a[2] + b[2] * by];
const scaled = (a, by) => [a[0] * by, a[1] * by, a[2] * by];
const capped = (a) => [Math.min(a[0], 255), Math.min(a[1], 255), Math.min(a[2], 255)];
const hex = (colour) => [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));

// ── Where things stand ────────────────────────────────────────────────────

/** Where in the sky a place among the stars stands: { azimuth (degrees from north, clockwise), altitude (degrees up) }. ra in hours, dec in degrees. */
export function horizontal(ra, dec, date, lng, lat) {
  const sidereal = turned(280.46061837 + 360.98564736629 * daysSince2000(date) + lng);
  const hour = (sidereal - ra * 15) * RADIANS;
  const [d, l] = [dec * RADIANS, lat * RADIANS];
  const altitude = Math.asin(Math.min(Math.max(Math.sin(d) * Math.sin(l) + Math.cos(d) * Math.cos(l) * Math.cos(hour), -1), 1));
  const azimuth = Math.atan2(-Math.cos(d) * Math.sin(hour), Math.sin(d) * Math.cos(l) - Math.cos(d) * Math.sin(l) * Math.cos(hour));
  return { azimuth: turned(azimuth / RADIANS), altitude: altitude / RADIANS };
}

/**
 * Where a star of the catalogue stands among the stars today: the catalogue gives each place as it was
 * at the start of 2000, and since then the Earth's axis has swung round a little (by a third of a degree
 * in twenty-six years), so every place has moved. ra in hours, dec in degrees; returns [ra, dec] for the
 * date. (After Lieske, 1977; good to a few seconds of arc for centuries.)
 */
export function precessed(ra, dec, date) {
  const t = daysSince2000(date) / 36525;
  const arcsec = RADIANS / 3600;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * arcsec;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * arcsec;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * arcsec;
  const [a0, d0] = [ra * 15 * RADIANS + zeta, dec * RADIANS];
  const x = Math.cos(theta) * Math.cos(d0) * Math.cos(a0) - Math.sin(theta) * Math.sin(d0);
  const y = Math.cos(d0) * Math.sin(a0);
  const w = Math.sin(theta) * Math.cos(d0) * Math.cos(a0) + Math.cos(theta) * Math.sin(d0);
  return [turned((Math.atan2(y, x) + z) / RADIANS) / 15, Math.asin(Math.min(Math.max(w, -1), 1)) / RADIANS];
}

/**
 * The moon: where it stands, as seen from the place (not from the middle of the Earth: from Riyadh it
 * stands as much as a degree lower than that), how much of its face is lit (0 new, 1 full) and whether it
 * is waxing. Its path round the Earth and the dozen largest pulls of the sun on it (after Paul Schlyter's
 * "How to compute planetary positions"): good to a tenth of a degree or two, a fifth of its own width.
 */
export function moonAt(date, lng, lat) {
  const d = daysSince2000(date) + 1.5; // (these paths are reckoned from the last midnight of 1999)
  const deg = (x) => x * RADIANS;
  const N = deg(turned(125.1228 - 0.0529538083 * d));
  const i = deg(5.1454);
  const w = deg(turned(318.0634 + 0.1643573223 * d));
  const e = 0.0549;
  const M = deg(turned(115.3654 + 13.0649929509 * d));
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 6; k += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const [xv, yv] = [60.2666 * (Math.cos(E) - e), 60.2666 * Math.sqrt(1 - e * e) * Math.sin(E)];
  const v = Math.atan2(yv, xv);
  let far = Math.hypot(xv, yv); // in the Earth's radii
  const [xh, yh, zh] = [far * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)), far * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)), far * Math.sin(v + w) * Math.sin(i)];
  let longitude = Math.atan2(yh, xh);
  let latitude = Math.atan2(zh, Math.hypot(xh, yh));
  // The sun's pull: its own place, and the angles between the two.
  const Ms = deg(turned(356.047 + 0.9856002585 * d));
  const Ls = Ms + deg(282.9404 + 4.70935e-5 * d);
  const Lm = M + w + N;
  const D = Lm - Ls;
  const F = Lm - N;
  longitude += deg(-1.274 * Math.sin(M - 2 * D) + 0.658 * Math.sin(2 * D) - 0.186 * Math.sin(Ms) - 0.059 * Math.sin(2 * M - 2 * D) - 0.057 * Math.sin(M - 2 * D + Ms) + 0.053 * Math.sin(M + 2 * D) + 0.046 * Math.sin(2 * D - Ms) + 0.041 * Math.sin(M - Ms) - 0.035 * Math.sin(D) - 0.031 * Math.sin(M + Ms) - 0.015 * Math.sin(2 * F - 2 * D) + 0.011 * Math.sin(M - 4 * D));
  latitude += deg(-0.173 * Math.sin(F - 2 * D) - 0.055 * Math.sin(M - F - 2 * D) - 0.046 * Math.sin(M + F - 2 * D) + 0.033 * Math.sin(F + 2 * D) + 0.017 * Math.sin(2 * M + F));
  far += -0.58 * Math.cos(M - 2 * D) - 0.46 * Math.cos(2 * D);
  // Against the sky's equator instead of the Earth's path.
  const tilt = deg(23.4393 - 3.563e-7 * d);
  const [x, y, z] = [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
  let ra = Math.atan2(y * Math.cos(tilt) - z * Math.sin(tilt), x);
  let dec = Math.asin(y * Math.sin(tilt) + z * Math.cos(tilt));
  // As seen from the place, not from the middle of the Earth (it is close enough for that to show).
  const sidereal = deg(turned(280.46061837 + 360.98564736629 * daysSince2000(date) + lng));
  const hour = sidereal - ra;
  const parallax = Math.asin(1 / far);
  const ground = deg(lat - 0.1924 * Math.sin(2 * deg(lat)));
  const rho = 0.99833 + 0.00167 * Math.cos(2 * deg(lat));
  const g = Math.atan2(Math.tan(ground), Math.cos(hour));
  ra -= (parallax * rho * Math.cos(ground) * Math.sin(hour)) / Math.cos(dec);
  dec -= Math.abs(g) > 1e-9 ? (parallax * rho * Math.sin(ground) * Math.sin(g - dec)) / Math.sin(g) : parallax * rho * Math.sin(-dec) * Math.cos(hour);
  // How far round from the sun it has come: so much of its face is lit.
  const sunLongitude = Ls + deg(1.915 * Math.sin(Ms) + 0.02 * Math.sin(2 * Ms));
  const apart = Math.acos(Math.min(Math.max(Math.cos(latitude) * Math.cos(longitude - sunLongitude), -1), 1));
  return { ...horizontal(turned(ra / RADIANS) / 15, dec / RADIANS, date, lng, lat), lit: (1 - Math.cos(apart)) / 2, waxing: Math.sin(longitude - sunLongitude) > 0 };
}

/** How many stars are known. */
export const STAR_COUNT = STARS.length;

// A star's colour by its B-V: blue-white, white, the sun's cream, orange, red.
const STAR_COLOURS = [[-0.3, [168, 194, 255]], [0, [212, 224, 255]], [0.6, [255, 246, 228]], [1.1, [255, 222, 178]], [1.6, [255, 192, 138]], [2, [255, 168, 118]]];
function starColour(bv) {
  for (let k = 1; k < STAR_COLOURS.length; k += 1) {
    if (bv <= STAR_COLOURS[k][0]) return mix(STAR_COLOURS[k - 1][1], STAR_COLOURS[k][1], clamp01((bv - STAR_COLOURS[k - 1][0]) / (STAR_COLOURS[k][0] - STAR_COLOURS[k - 1][0])));
  }
  return STAR_COLOURS[STAR_COLOURS.length - 1][1];
}

// The brightest stars by the names they are known by, many of them Arabic: each with its place in the
// catalogue ([hours, degrees], as of 2000), by which it is found there.
const STAR_NAMES = [
  ['Sirius', 6.752, -16.72], ['Canopus', 6.399, -52.7], ['Arcturus', 14.261, 19.18], ['Rigil Kentaurus', 14.66, -60.83], ['Vega', 18.616, 38.78],
  ['Capella', 5.278, 46], ['Rigel', 5.242, -8.2], ['Procyon', 7.655, 5.22], ['Achernar', 1.629, -57.24], ['Betelgeuse', 5.92, 7.41],
  ['Hadar', 14.064, -60.37], ['Altair', 19.846, 8.87], ['Aldebaran', 4.599, 16.51], ['Spica', 13.42, -11.16], ['Antares', 16.49, -26.43],
  ['Pollux', 7.755, 28.03], ['Fomalhaut', 22.961, -29.62], ['Mimosa', 12.795, -59.69], ['Deneb', 20.691, 45.28], ['Regulus', 10.14, 11.97],
  ['Adhara', 6.977, -28.97], ['Castor', 7.577, 31.89], ['Gacrux', 12.519, -57.11], ['Shaula', 17.56, -37.1], ['Bellatrix', 5.419, 6.35],
  ['Elnath', 5.438, 28.61], ['Alnilam', 5.604, -1.2], ['Alnair', 22.137, -46.96], ['Alnitak', 5.679, -1.94], ['Regor', 8.159, -47.34],
  ['Alioth', 12.9, 55.96], ['Mirfak', 3.405, 49.86], ['Kaus Australis', 18.403, -34.38], ['Dubhe', 11.062, 61.75], ['Wezen', 7.14, -26.39],
  ['Alkaid', 13.792, 49.31], ['Avior', 8.375, -59.51], ['Sargas', 17.622, -43], ['Menkalinan', 5.992, 44.95], ['Alhena', 6.629, 16.4],
  ['Alsephina', 8.745, -54.71], ['Peacock', 20.427, -56.74], ['Polaris', 2.53, 89.26], ['Mirzam', 6.378, -17.96], ['Alphard', 9.46, -8.66],
  ['Hamal', 2.12, 23.46], ['Algieba', 10.333, 19.84], ['Diphda', 0.726, -17.99], ['Nunki', 18.921, -26.3], ['Menkent', 14.111, -36.37],
  ['Alpheratz', 0.14, 29.09], ['Mirach', 1.162, 35.62], ['Saiph', 5.796, -9.67], ['Kochab', 14.845, 74.16], ['Rasalhague', 17.582, 12.56],
  ['Algol', 3.136, 40.96], ['Almach', 2.065, 42.33], ['Denebola', 11.818, 14.57],
];
/** The name of each of those stars, by its place in the catalogue. */
const NAMED = new Map(STAR_NAMES.map(([name, ra, dec]) => [STARS.findIndex(([r, d]) => Math.abs(r - ra) < 0.002 && Math.abs(d - dec) < 0.02), name]));
/** How many of the stars have a name the app knows them by. */
export const NAMED_STARS = [...NAMED.keys()].filter((index) => index >= 0).length;

/** The stars that are up: [{ azimuth, altitude, magnitude (less is brighter), colour, name (for the brightest) }]. */
export function starsAt(date, lng, lat) {
  const up = [];
  STARS.forEach(([ra, dec, magnitude, bv], index) => {
    const place = horizontal(...precessed(ra, dec, date), date, lng, lat);
    if (place.altitude > 0.5) up.push({ ...place, magnitude, colour: starColour(bv), ...(NAMED.has(index) ? { name: NAMED.get(index) } : {}) });
  });
  return up;
}

// The planets that the eye can see: for each, the shape of its path round the sun and where on it it
// is (each number: what it was as 2000 began, and how much it changes in a day), its colour, and how
// bright it is: at one Earth's distance from both sun and Earth, and less by so much for each degree
// that it is turned away. (After Paul Schlyter's "How to compute planetary positions": good to a
// degree, which puts each in the right part of the sky.)
const PLANETS = [
  { name: 'Mercury', node: [48.3313, 3.24587e-5], lean: [7.0047, 5.0e-8], near: [29.1241, 1.01444e-5], size: 0.387098, oval: [0.205635, 5.59e-10], along: [168.6562, 4.0923344368], colour: [255, 232, 208], bright: [-0.36, 0.027] },
  { name: 'Venus', node: [76.6799, 2.4659e-5], lean: [3.3946, 2.75e-8], near: [54.891, 1.38374e-5], size: 0.72333, oval: [0.006773, -1.302e-9], along: [48.0052, 1.6021302244], colour: [255, 250, 234], bright: [-4.34, 0.013] },
  { name: 'Mars', node: [49.5574, 2.11081e-5], lean: [1.8497, -1.78e-8], near: [286.5016, 2.92961e-5], size: 1.523688, oval: [0.093405, 2.516e-9], along: [18.6021, 0.5240207766], colour: [255, 176, 122], bright: [-1.51, 0.016] },
  { name: 'Jupiter', node: [100.4542, 2.76854e-5], lean: [1.303, -1.557e-7], near: [273.8777, 1.64505e-5], size: 5.20256, oval: [0.048498, 4.469e-9], along: [19.895, 0.0830853001], colour: [255, 240, 214], bright: [-9.25, 0.014] },
  { name: 'Saturn', node: [113.6634, 2.3898e-5], lean: [2.4886, -1.081e-7], near: [339.3939, 2.97661e-5], size: 9.55475, oval: [0.055546, -9.499e-9], along: [316.967, 0.0334442282], colour: [248, 226, 176], bright: [-9.0, 0.044] },
];
const SUN_PATH = { near: [282.9404, 4.70935e-5], oval: [0.016709, -1.151e-9], along: [356.047, 0.9856002585] };

/**
 * The planets: [{ name, azimuth, altitude, magnitude, fromSun (degrees
 * round the sky from the sun), colour }], all five whether they are up or
 * not.
 */
export function planetsAt(date, lng, lat) {
  const d = daysSince2000(date) + 1.5; // (these paths are reckoned from the last midnight of 1999)
  const at = ([from, daily]) => from + daily * d;
  const within = (x) => Math.min(Math.max(x, -1), 1);
  /** Where a body is on its oval path: how far round from its nearest point to the sun, and how far from the sun. */
  const onPath = (size, oval, along) => {
    const mean = turned(along) * RADIANS;
    let angle = mean + oval * Math.sin(mean) * (1 + oval * Math.cos(mean));
    for (let k = 0; k < 6; k += 1) angle -= (angle - oval * Math.sin(angle) - mean) / (1 - oval * Math.cos(angle));
    const [x, y] = [size * (Math.cos(angle) - oval), size * Math.sqrt(1 - oval * oval) * Math.sin(angle)];
    return { round: Math.atan2(y, x), far: Math.hypot(x, y) };
  };
  // The sun, as it is seen from the Earth.
  const sun = onPath(1, at(SUN_PATH.oval), at(SUN_PATH.along));
  const sunLong = sun.round + at(SUN_PATH.near) * RADIANS;
  const [xs, ys] = [sun.far * Math.cos(sunLong), sun.far * Math.sin(sunLong)];
  const tilt = (23.4393 - 3.563e-7 * d) * RADIANS;
  return PLANETS.map((planet) => {
    const [node, lean] = [at(planet.node) * RADIANS, at(planet.lean) * RADIANS];
    const { round, far } = onPath(planet.size, at(planet.oval), at(planet.along));
    const u = round + at(planet.near) * RADIANS;
    // Where it is from the sun; then from the Earth; then against the sky's equator instead of the Earth's path.
    const xh = far * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(lean));
    const yh = far * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(lean));
    const zh = far * Math.sin(u) * Math.sin(lean);
    const [xg, yg, zg] = [xh + xs, yh + ys, zh];
    const off = Math.hypot(xg, yg, zg);
    const [xe, ye, ze] = [xg, yg * Math.cos(tilt) - zg * Math.sin(tilt), yg * Math.sin(tilt) + zg * Math.cos(tilt)];
    const ra = (Math.atan2(ye, xe) / RADIANS / 15 + 24) % 24;
    const dec = Math.atan2(ze, Math.hypot(xe, ye)) / RADIANS;
    // How far round the sky from the sun it stands, and how far it is turned away from us (its phase).
    const fromSun = Math.acos(within((sun.far * sun.far + off * off - far * far) / (2 * sun.far * off))) / RADIANS;
    const phase = Math.acos(within((far * far + off * off - sun.far * sun.far) / (2 * far * off))) / RADIANS;
    let magnitude = planet.bright[0] + 5 * Math.log10(far * off) + planet.bright[1] * phase;
    if (planet.name === 'Venus') magnitude += 4.2e-7 * phase ** 3;
    if (planet.name === 'Mercury') magnitude += 2.2e-13 * phase ** 6;
    return { name: planet.name, ...horizontal(ra, dec, date, lng, lat), magnitude, fromSun, colour: planet.colour };
  });
}

/** The direction a place in the sky lies in: [east, north, up], one long. */
export function directionOf(azimuth, altitude) {
  const [a, h] = [azimuth * RADIANS, altitude * RADIANS];
  return [Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h)];
}

/** A number from 0 to 1 that is always the same for the same three whole numbers. */
function chance(a, b, c) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul((c | 0) + 0x27d4eb2f, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ── The light ─────────────────────────────────────────────────────────────

// The colour of the sun's light by how high the sun stands: white, then gold, then red as it goes down.
const SUNLIGHT = [[-1.5, [226, 104, 96]], [0, [255, 150, 98]], [3, [255, 198, 140]], [8, [255, 236, 206]], [16, [255, 250, 240]]];

/** The colour of the sun's light where the sun stands so many degrees up. */
export function sunlightAt(altitude) {
  if (altitude <= SUNLIGHT[0][0]) return SUNLIGHT[0][1];
  for (let k = 1; k < SUNLIGHT.length; k += 1) {
    if (altitude <= SUNLIGHT[k][0]) return mix(SUNLIGHT[k - 1][1], SUNLIGHT[k][1], (altitude - SUNLIGHT[k - 1][0]) / (SUNLIGHT[k][0] - SUNLIGHT[k - 1][0]));
  }
  return SUNLIGHT[SUNLIGHT.length - 1][1];
}

// ── The clouds ────────────────────────────────────────────────────────────

/**
 * The three layers of cloud, the highest first (the order they are drawn
 * in: what is higher is behind). For each: how wide the squares of its field
 * are, between what heights over the ground its clouds lie, how far off they
 * are still drawn, how many times the wind on the ground it drifts at, how
 * solid its clouds are, how thick each is in its middle (a low cloud is a
 * solid heap; a middle one is thin enough to break up into a flock of small
 * clouds), and its grain: how wide the coarsest of it is, and how many
 * times longer than wide it is, along the wind (high cloud is combed out
 * into long threads). (The weather service counts as low what
 * lies under three kilometres above the sea, as high what lies over eight;
 * and Riyadh stands six hundred metres up.)
 */
export const CLOUD_LAYERS = [
  { name: 'high', cell: 15000, from: 9200, to: 11200, reach: 130000, drift: 4, solid: 0.6, thick: 0.72, grain: 520, stretch: 7 },
  { name: 'mid', cell: 6500, from: 4300, to: 5700, reach: 90000, drift: 3, solid: 0.84, thick: 0.6, grain: 640, stretch: 1.3 },
  { name: 'low', cell: 4800, from: 1700, to: 2400, reach: 60000, drift: 2, solid: 0.95, thick: 1, grain: 1150, stretch: 1 },
];
// A cloud is thin towards its edge: so much more of it is laid than the weather counts as covered.
const CLOUD_SOFT = 1.35;
// A layer that covers all the sky hides whatever is above it.
const CLOUD_HIDES_ALL = 0.97;

/**
 * How much of the sky each layer of cloud covers, out of what is known of
 * the weather (see weatherSummary() in lib.js): { low, mid, high }, each 0
 * to 1. Where the weather tells each layer, that; where it tells only how
 * much of the sky is covered in all, that is shared out as it most often
 * is over Riyadh, where more of the cloud is high and thin than low; where
 * nothing is known, a clear sky.
 */
export function cloudLayersOf(weather) {
  if (!weather) return { low: 0, mid: 0, high: 0 };
  const known = [weather.cloudLow, weather.cloudMid, weather.cloudHigh];
  if (known.some((share) => Number.isFinite(share))) return { low: clamp01(known[0] ?? 0), mid: clamp01(known[1] ?? 0), high: clamp01(known[2] ?? 0) };
  const all = clamp01(weather.cloud ?? 0);
  return { low: all * 0.45, mid: all * 0.4, high: all * 0.6 };
}

/**
 * How much of the sky each layer of cloud covers at a place, from a field of readings round it (see
 * cloudField() in lib.js): { low, mid, high }, each 0 to 1, read between the four readings round the
 * place; beyond the edge of the field, as at its edge.
 */
export function fieldCover(field, lng, lat) {
  const { lats, lngs } = field;
  const along = (lines, value) => {
    if (lines.length < 2 || value <= lines[0]) return [0, 0, 0];
    if (value >= lines[lines.length - 1]) return [lines.length - 1, lines.length - 1, 0];
    let k = 0;
    while (value > lines[k + 1]) k += 1;
    return [k, k + 1, (value - lines[k]) / (lines[k + 1] - lines[k])];
  };
  const [r0, r1, fr] = along(lats, lat);
  const [c0, c1, fc] = along(lngs, lng);
  const width = lngs.length;
  const read = (values) => {
    const at = (r, c) => values[r * width + c];
    const south = at(r0, c0) + (at(r0, c1) - at(r0, c0)) * fc;
    const north = at(r1, c0) + (at(r1, c1) - at(r1, c0)) * fc;
    return clamp01(south + (north - south) * fr);
  };
  return { low: read(field.low), mid: read(field.mid), high: read(field.high) };
}

/** Of a { low, mid, high }, the share of a layer of cloud (0 high, 1 mid, 2 low, as in CLOUD_LAYERS). */
export const layerShare = (cover, layer) => clamp01([cover.high, cover.mid, cover.low][layer] ?? 0);

/**
 * How much of the sun shows between the clouds, 1 (a clear sky) to nearly 0
 * (a covered one): low cloud hides it, middle cloud dims it, high cloud
 * only veils it. cover: { low, mid, high }.
 */
export function sunBetween(cover = {}) {
  return (1 - 0.92 * clamp01(cover.low ?? 0)) * (1 - 0.7 * clamp01(cover.mid ?? 0)) * (1 - 0.3 * clamp01(cover.high ?? 0));
}

/**
 * Where the wind that carries a layer of cloud blows from, and how fast: { from (degrees), speed (m/s) }.
 * Where the wind at the layer's own height is known (aloft: [{ from, speed }] for the high, middle and low
 * layers), that; otherwise the wind on the ground, the faster the higher the layer.
 */
export function layerWind(layer, { windFrom = 315, windSpeed = 4, aloft = null } = {}) {
  const own = aloft?.[layer];
  if (own && Number.isFinite(own.from) && Number.isFinite(own.speed)) return { from: own.from, speed: own.speed };
  return { from: windFrom, speed: windSpeed * CLOUD_LAYERS[layer].drift };
}

/** How far a layer of cloud has drifted by a time, in metres [east, north]: with the wind at its height. */
export function cloudDrift(layer, wind = {}, seconds = 0) {
  const { from, speed } = layerWind(layer, wind);
  const to = (from + 180) * RADIANS;
  const far = speed * seconds;
  return [Math.sin(to) * far, Math.cos(to) * far];
}

/**
 * The clouds round a place. at: [east, north] in metres (of anything that
 * does not move: the clouds are fixed to the air they drift in, not to the
 * eye). low, mid, high: how much of the sky each layer covers, 0 to 1, as
 * the weather has it. windFrom, windSpeed: where the wind comes from in
 * degrees, and how fast in m/s; aloft: the winds at the layers' own heights
 * (see layerWind). seconds: the time. coverAt(layer, x, y): where the
 * weather is known place by place, how much of the sky the layer covers at
 * a place (in the same metres as at): each cloud is then laid as the
 * weather is where it is, and low, mid and high only say how much there is
 * at most.
 *
 * Returns [{ layer (0 high, 1 mid, 2 low), x, y, z (its base), radius,
 * turn, seed, cover }]. The same place, weather and time always give the
 * same clouds; and a moment later each has drifted a little.
 */
export function cloudsNear(at, { low = 0, mid = 0, high = 0, windFrom = 315, windSpeed = 4, aloft = null, seconds = 0, coverAt = null } = {}) {
  const clouds = [];
  const cover = [clamp01(high), clamp01(mid), clamp01(low)];
  CLOUD_LAYERS.forEach((layer, index) => {
    if (!(cover[index] > 0.02)) return;
    // (A layer that covers the whole sky hides those above it: everywhere, or, where the weather is known
    // place by place, wherever it does.)
    if (!coverAt && cover.slice(index + 1).some((below) => below >= CLOUD_HIDES_ALL)) return;
    // How thick the clouds lie for so much of the sky to be covered, where they overlap by chance; a sky
    // with little cloud has small clouds, a sky with much has wide ones that run together.
    const laying = (share) => {
      const thick = -Math.log(1 - Math.min(share, CLOUD_HIDES_ALL));
      let area = layer.cell * layer.cell * (0.25 + 0.9 * share);
      let odds = (thick * layer.cell * layer.cell) / area;
      if (odds > 1) {
        area *= odds;
        odds = 1;
      }
      return { odds, radius: Math.sqrt((area * CLOUD_SOFT) / Math.PI) };
    };
    const even = laying(cover[index]);
    // How far the whole field has drifted; the squares are counted in the field's own measure.
    const moved = cloudDrift(index, { windFrom, windSpeed, aloft }, seconds);
    const middle = [(at[0] - moved[0]) / layer.cell, (at[1] - moved[1]) / layer.cell];
    const span = Math.ceil(layer.reach / layer.cell);
    for (let i = Math.floor(middle[0]) - span; i <= Math.floor(middle[0]) + span; i += 1) {
      for (let j = Math.floor(middle[1]) - span; j <= Math.floor(middle[1]) + span; j += 1) {
        const x = (i + 0.2 + chance(i, j, 11 + index) * 0.6) * layer.cell + moved[0];
        const y = (j + 0.2 + chance(i, j, 13 + index) * 0.6) * layer.cell + moved[1];
        if (Math.hypot(x - at[0], y - at[1]) > layer.reach) continue;
        // (Where the weather is known place by place, as much cloud is laid here as there is here.)
        const share = coverAt ? Math.min(clamp01(coverAt(index, x, y)), cover[index]) : cover[index];
        if (!(share > 0.02)) continue;
        if (coverAt && [1, 2].some((below) => below > index && coverAt(below, x, y) >= CLOUD_HIDES_ALL)) continue;
        const { odds, radius } = coverAt ? laying(share) : even;
        if (chance(i, j, 101 + index) >= odds) continue;
        clouds.push({
          layer: index,
          x,
          y,
          z: layer.from + chance(i, j, 19 + index) * (layer.to - layer.from),
          radius: radius * (0.72 + 0.56 * chance(i, j, 17 + index)),
          turn: chance(i, j, 23 + index) * 360,
          seed: Math.floor(chance(i, j, 29 + index) * 65536),
          cover: share,
        });
      }
    }
  });
  return clouds;
}

// What light there is on a cloud when no sun is: the whole sky's by day, what is left of it at dusk, next to none by night.
const AMBIENT = { day: [198, 208, 224], dusk: [116, 122, 146], night: [20, 22, 34] };
// The city's own light on the underside of a cloud by night, and the moon's on its edges.
const CITY_GLOW = [78, 66, 58];
const MOONLIGHT = [30, 33, 42];
// How many degrees further round the Earth a cloud of each layer still sees the sun, for being so high.
const SUN_SEEN_FURTHER = [3.2, 2.4, 1.6];

/**
 * The colours of a cloud of a layer (0 high, 1 mid, 2 low) at an hour:
 * { base (its thick middle, seen from underneath), rim (its thin edge), top
 * (where it is heaped up, seen from the side), light (the colour of the
 * sunlight on it), direct (how much of that it has, 0 to 1) }.
 *
 * By day a cloud is white with a grey belly. As the sun goes down its light
 * reddens and comes from underneath: the high clouds are lit longest,
 * the low ones first go dark. By night a cloud over the city has a little
 * of the city's light on its belly, and of the moon's on its edges.
 * sun: { azimuth, altitude }; night: 0 by day to 1 by night; moon: as
 * moonAt() gives it; cover: how much of the sky the layer covers, 0 to 1.
 */
export function cloudTones(layer, { sun = null, night = 0, moon = null, cover = 0 } = {}) {
  const dark = clamp01(night);
  const ambient = dark < 0.5 ? mix(AMBIENT.day, AMBIENT.dusk, dark / 0.5) : mix(AMBIENT.dusk, AMBIENT.night, (dark - 0.5) / 0.5);
  const seen = (sun ? sun.altitude : 60 - 80 * dark) + SUN_SEEN_FURTHER[layer];
  const light = sunlightAt(seen);
  // How much of the sun's light the cloud has. A low sun has to come in under the layer for a long way:
  // the more of the sky the layer covers, the less of it gets there.
  const direct = smooth(-1.2, 3.5, seen) * (1 - 0.9 * clamp01(cover) * (1 - smooth(4, 20, seen)));
  // How far the light comes from underneath: it does once the sun, seen from the ground, is at the horizon or under it.
  const under = sun ? 1 - smooth(-0.5, 2, sun.altitude) : 0;
  const city = scaled(CITY_GLOW, dark * dark * [0.04, 0.2, 0.5][layer]);
  const moonlit = moon && moon.altitude > 0 ? scaled(MOONLIGHT, clamp01(moon.lit) * clamp01(moon.altitude / 25) * dark) : [0, 0, 0];
  // How much of the sky's light comes through the thick of it: less, the more of the sky it covers.
  const through = [1, 0.85, 0.74][layer] * (layer === 0 ? 1 : 1 - 0.26 * clamp01(cover));
  const base = capped(add(add(add(scaled(ambient, through), light, direct * ([0.5, 0.12, 0.1][layer] + [0.3, 0.6, 0.62][layer] * under)), city), moonlit, 0.4));
  const rim = capped(add(add(add(scaled(ambient, 0.7), light, direct * 0.6), city, 0.6), moonlit));
  const top = capped(add(add(scaled(ambient, 0.92), light, direct * 0.62), moonlit));
  return { base, rim, top, light, direct };
}

// How low towards the horizon a cloud is still drawn (as the sine of its height in the sky), and from where up it is drawn in full.
const CLOUD_LOWEST = 0.014;
const CLOUD_FULL = 0.06;
// Near clouds are drawn in several patches each, far ones in one: within these distances, and no more patches in all than this.
const CLOUD_NEAR_METERS = 16000;
const CLOUD_MIDDLING_METERS = 34000;
const CLOUD_PATCHES_MOST = 2400;

/**
 * A level patch of cloud. Each corner says how thick the cloud is there:
 * full in its middle, nothing at its rim (the scene makes the ragged edge
 * out of that, see "cloud" in scene.js). (cx, cy, z): its middle; a, b: half
 * its length and width; core: how far out its thick middle reaches, as a
 * part of that (0 for a patch that only thins from its middle outwards);
 * thick: how thick it is in its middle, 1 for a solid cloud.
 */
function patch(mesh, eye, cx, cy, z, a, b, turn, middle, edge, sides, core, thick = 1, seed = 0) {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const sunk = (x, y) => z - ((x - eye[0]) ** 2 + (y - eye[1]) ** 2) / (2 * EARTH_CURVE_METERS);
  // (Round its rim each corner is a little in or out of the true oval: no cloud is one.)
  const ring = [];
  for (let k = 0; k < sides; k += 1) {
    const t = (k / sides) * TAU;
    const ragged = 0.8 + 0.4 * chance(seed, k, 31);
    const [u, v] = [Math.cos(t) * a * ragged, Math.sin(t) * b * ragged];
    ring.push([u * c - v * s, u * s + v * c]);
  }
  const low = sunk(cx, cy);
  if (!(core > 0)) {
    mesh.room(sides * 3);
    for (let k = 0; k < sides; k += 1) {
      const [p, q] = [ring[k], ring[(k + 1) % sides]];
      mesh.corner(cx, cy, low, middle[0], middle[1], middle[2], thick);
      mesh.corner(cx + p[0], cy + p[1], sunk(cx + p[0], cy + p[1]), edge[0], edge[1], edge[2], 0);
      mesh.corner(cx + q[0], cy + q[1], sunk(cx + q[0], cy + q[1]), edge[0], edge[1], edge[2], 0);
    }
    return;
  }
  mesh.room(sides * 9);
  for (let k = 0; k < sides; k += 1) {
    const [p, q] = [ring[k], ring[(k + 1) % sides]];
    const [pi, qi] = [[cx + p[0] * core, cy + p[1] * core], [cx + q[0] * core, cy + q[1] * core]];
    const [po, qo] = [[cx + p[0], cy + p[1]], [cx + q[0], cy + q[1]]];
    const [zpi, zqi, zpo, zqo] = [sunk(pi[0], pi[1]), sunk(qi[0], qi[1]), sunk(po[0], po[1]), sunk(qo[0], qo[1])];
    mesh.corner(cx, cy, low, middle[0], middle[1], middle[2], thick);
    mesh.corner(pi[0], pi[1], zpi, edge[0], edge[1], edge[2], thick);
    mesh.corner(qi[0], qi[1], zqi, edge[0], edge[1], edge[2], thick);
    mesh.corner(pi[0], pi[1], zpi, edge[0], edge[1], edge[2], thick);
    mesh.corner(po[0], po[1], zpo, edge[0], edge[1], edge[2], 0);
    mesh.corner(qo[0], qo[1], zqo, edge[0], edge[1], edge[2], 0);
    mesh.corner(pi[0], pi[1], zpi, edge[0], edge[1], edge[2], thick);
    mesh.corner(qo[0], qo[1], zqo, edge[0], edge[1], edge[2], 0);
    mesh.corner(qi[0], qi[1], zqi, edge[0], edge[1], edge[2], thick);
  }
}

/**
 * A heap of cloud standing on a level base, as it is seen from the side:
 * thick in its body, thinning to nothing all round (the scene makes its
 * edge ragged: so it swells like a cauliflower). It reaches a little way
 * down through the base, which is drawn before it: there the two run
 * together. (cx, cy, z): the middle of its foot; wide: half its width,
 * across the line of sight; tall: its height.
 */
function heap(mesh, eye, cx, cy, z, wide, tall, body, sides = 9, seed = 0) {
  const [dx, dy] = [cx - eye[0], cy - eye[1]];
  const flat = Math.hypot(dx, dy) || 1;
  const right = [dy / flat, -dx / flat];
  const low = z - (flat * flat) / (2 * EARTH_CURVE_METERS);
  const middle = low + tall * 0.34;
  // (Its outline swells and dips from corner to corner: seen from far off, where its grain does not show, it is still no dome.)
  const at = (k) => {
    const t = ((k % sides) / sides) * TAU;
    const swell = 0.72 + 0.5 * chance(seed, k % sides, 73);
    return [cx + right[0] * Math.cos(t) * wide * swell, cy + right[1] * Math.cos(t) * wide * swell, middle + Math.sin(t) * (Math.sin(t) > 0 ? tall * 0.66 : tall * 0.5) * swell];
  };
  mesh.room(sides * 3);
  for (let k = 0; k < sides; k += 1) {
    const [p, q] = [at(k), at(k + 1)];
    mesh.corner(cx, cy, middle, body[0], body[1], body[2], 1);
    mesh.corner(p[0], p[1], p[2], body[0], body[1], body[2], 0);
    mesh.corner(q[0], q[1], q[2], body[0], body[1], body[2], 0);
  }
}

/**
 * Draw the clouds into three meshes (see Mesh in life.js), one for each
 * layer, the highest first: each cloud where it is, in the scene's metres.
 * (The meshes are for parts of the scene that are clouds: what is written
 * for each corner is the cloud's colour and how thick it is there.)
 *
 * eye: where the eye is. sun: { azimuth, altitude } in degrees. night: 0 by
 * day to 1 by night. horizon: the sky's colour at the horizon ('#rrggbb'):
 * what a cloud far off fades into. moon: as moonAt() gives it. clouds: as
 * cloudsNear() gives them, in the scene's metres. visibility: how far one
 * can see along the ground, in metres, if the weather tells. windFrom: where
 * the wind comes from: the high clouds are drawn out along it. only: to
 * draw one layer alone (0 high, 1 mid, 2 low), leaving the other meshes as
 * they are.
 *
 * Returns { clouds, patches }: how many of each were drawn.
 */
export function drawClouds(meshes, { eye, sun = null, night = 0, horizon = '#e4eaef', moon = null, clouds = [], visibility = null, windFrom = 315, only = null } = {}) {
  for (const [layer, mesh] of meshes.entries()) {
    if (only === null || only === layer) mesh.clear();
  }
  const made = { clouds: 0, patches: 0 };
  if (only !== null) clouds = clouds.filter((cloud) => cloud.layer === only);
  if (clouds.length === 0) return made;
  const dark = clamp01(night);
  const day = 1 - smooth(0.1, 0.6, dark);
  const haze = hex(horizon);
  // How far off a cloud has faded half into the sky behind it: through clear air, very far.
  const clear = Math.min(Math.max((Number.isFinite(visibility) ? visibility : 24000) * 4.5, 30000), 140000);
  const sunWay = sun ? directionOf(sun.azimuth, sun.altitude) : null;
  const along = (windFrom + 180) * RADIANS; // the way the wind blows, as an angle from north
  // The colours of each layer at this hour, for as much of the sky as it covers.
  const cover = [0, 0, 0];
  for (const cloud of clouds) cover[cloud.layer] = cloud.cover;
  const tones = [0, 1, 2].map((layer) => cloudTones(layer, { sun, night: dark, moon, cover: cover[layer] }));

  // Those that stand clear of the horizon, the furthest first: the near ones lie over them.
  const seen = [];
  for (const cloud of clouds) {
    const [dx, dy] = [cloud.x - eye[0], cloud.y - eye[1]];
    const flat = Math.hypot(dx, dy);
    const up = cloud.z - (flat * flat) / (2 * EARTH_CURVE_METERS) - eye[2];
    const far = Math.hypot(flat, up);
    if (!(up > 0) || (up / far < CLOUD_LOWEST && flat > cloud.radius)) continue;
    seen.push({ cloud, flat, far, way: [dx / far, dy / far, up / far] });
  }
  seen.sort((a, b) => b.flat - a.flat);
  // Within what distances a cloud is drawn in several patches: drawn in, if there are too many clouds for that.
  let [near, middling] = [CLOUD_NEAR_METERS, CLOUD_MIDDLING_METERS];
  const wanted = seen.reduce((sum, { flat }) => sum + (flat < near ? 4 : flat < middling ? 2 : 1), 0);
  const most = only === null ? CLOUD_PATCHES_MOST : CLOUD_PATCHES_MOST / 2;
  if (wanted > most) {
    const by = Math.max((most - seen.length) / Math.max(wanted - seen.length, 1), 0.05);
    [near, middling] = [near * Math.sqrt(by), middling * Math.sqrt(by)];
  }

  for (const { cloud, flat, far, way } of seen) {
    const mesh = meshes[cloud.layer];
    const tone = tones[cloud.layer];
    // Far off a cloud takes the colour of the sky at the horizon; towards the sun it shines.
    const veil = 1 - Math.exp(-far / clear);
    const forward = sunWay ? Math.max(way[0] * sunWay[0] + way[1] * sunWay[1] + way[2] * sunWay[2], 0) ** 6 * tone.direct : 0;
    const shade = 0.94 + 0.12 * chance(cloud.seed, 1, 41); // no two clouds are quite the same grey
    const base = capped(mix(add(scaled(tone.base, shade), tone.light, 0.3 * forward), haze, veil));
    const rim = capped(mix(add(tone.rim, tone.light, 0.5 * forward), haze, veil));
    const edge = mix(base, rim, 0.3);
    const count = flat < near ? 3 + (cloud.seed % 2) : flat < middling ? 2 : 1;
    const sides = flat < near ? 10 : flat < middling ? 8 : 6;
    const core = flat < middling ? 0.36 : 0;
    const thick = CLOUD_LAYERS[cloud.layer].thick;
    // (A patch that only thins from its middle outwards shows less of itself: it is laid that much wider.)
    const wider = core > 0 ? 1 : 1.3;

    if (cloud.layer === 0) {
      // High cloud: sheets of ice drawn out along the wind, side by side; a veil where there is much of it.
      const length = cloud.radius * 1.6 * wider;
      const width = length * (0.07 + 0.3 * cloud.cover);
      const lean = along + (chance(cloud.seed, 2, 43) - 0.5) * 0.6;
      const [ax, ay] = [Math.sin(lean), Math.cos(lean)];
      const streaks = count + 2;
      for (let k = 0; k < streaks; k += 1) {
        const aside = (k - (streaks - 1) / 2) * width * 1.9 + (chance(cloud.seed, k, 45) - 0.5) * width * 1.4;
        const ahead = (chance(cloud.seed, k, 47) - 0.5) * length * 0.7;
        const [a, b] = [length * (0.55 + 0.5 * chance(cloud.seed, k, 49)), width * (0.6 + 0.6 * chance(cloud.seed, k, 51))];
        // (The patch's long axis lies along the wind: its turn is measured from east, anticlockwise.)
        patch(mesh, eye, cloud.x + ax * ahead - ay * aside, cloud.y + ay * ahead + ax * aside, cloud.z, a, b, Math.PI / 2 - lean, rim, rim, sides, core, thick, cloud.seed + k * 7);
        made.patches += 1;
      }
      made.clouds += 1;
      continue;
    }

    // The patches of a low or a middle cloud: round its middle, each an oval of its own.
    const turn = cloud.turn * RADIANS;
    const patches = [];
    for (let k = 0; k < count; k += 1) {
      const round = turn + (k / count) * TAU + (chance(cloud.seed, k, 53) - 0.5) * 1.2;
      const out = count === 1 ? 0 : cloud.radius * 0.44 * (0.5 + chance(cloud.seed, k, 55));
      const a = cloud.radius * (count === 1 ? 0.98 : 0.56 + 0.3 * chance(cloud.seed, k, 57)) * wider;
      const b = a * (0.6 + 0.34 * chance(cloud.seed, k, 59));
      patches.push({ x: cloud.x + Math.cos(round) * out, y: cloud.y + Math.sin(round) * out, a, b, turn: along + (chance(cloud.seed, k, 61) - 0.5) * 1.4 });
    }
    for (const [k, one] of patches.entries()) {
      patch(mesh, eye, one.x, one.y, cloud.z, one.a, one.b, one.turn, base, edge, sides, core, thick, cloud.seed + k * 13);
      made.patches += 1;
    }
    // A low cloud by day is heaped up over its base: the less of the sky is covered, the higher. (Where
    // most of the sky is covered the clouds lie in a flat sheet, with no heaps at all.) What the eye sees
    // of a heap from below is the side that faces it, standing over the near edge of the base.
    const tall = cloud.layer === 2 ? cloud.radius * 0.5 * clamp01(1 - cloud.cover / 0.75) * (0.3 + 0.7 * day) : 0;
    if (tall > 90) {
      // (Seen with the sun behind the eye that side is in full light; against the sun it is in its own shade.)
      const facing = sunWay ? 0.5 - 0.5 * (way[0] * sunWay[0] + way[1] * sunWay[1]) : 0.5;
      const body = capped(mix(add(mix(tone.base, tone.top, 0.5 + 0.5 * facing), tone.light, 0.4 * forward), haze, veil));
      const [ux, uy] = [(cloud.x - eye[0]) / (flat || 1), (cloud.y - eye[1]) / (flat || 1)];
      for (const [k, one] of patches.entries()) {
        // How far the patch reaches towards the eye, and how wide it is across the line of sight.
        const [c, s] = [Math.cos(one.turn), Math.sin(one.turn)];
        const [lined, crossed] = [ux * c + uy * s, -ux * s + uy * c];
        const towards = Math.hypot(one.a * lined, one.b * crossed);
        const across = Math.hypot(one.a * crossed, one.b * lined);
        const high = tall * (0.6 + 0.6 * chance(cloud.seed, k, 63));
        const [fx, fy] = [one.x - ux * towards * 0.55, one.y - uy * towards * 0.55];
        heap(mesh, eye, fx, fy, cloud.z, across * 0.8, high, body, flat < middling ? 10 : 8, cloud.seed + k * 17);
        if (flat < middling) heap(mesh, eye, fx + uy * across * 0.5, fy - ux * across * 0.5, cloud.z, across * 0.5, high * 0.66, body, 9, cloud.seed + k * 17 + 5);
      }
    }
    made.clouds += 1;
  }
  return made;
}

// ── The sun, the moon and the colours of dusk ─────────────────────────────

/**
 * Draw what stands still in the sky into four meshes, on the bowl round
 * the eye:
 *
 * wash: colour laid over the sky: the grey-blue shadow of the Earth, that
 *   rises opposite the sun as it goes down.
 * glow: light added to the sky: the glare round the sun, the glow along
 *   the horizon where it goes down, the pink band over the Earth's shadow,
 *   the shine round the moon.
 * disc: the sun's own disc: a light that shows through the haze on the
 *   horizon, reddened, and through cloud by as much as there are gaps in it.
 * face: the moon's face.
 *
 * eye: where the eye is. sun: { azimuth, altitude }. night: 0 by day to 1
 * by night. moon: as moonAt() gives it. cover: { low, mid, high }: how much
 * of the sky each layer of cloud covers.
 *
 * Returns { sun, moon }: whether each was drawn.
 */
export function drawHeavens({ wash, glow, disc, face }, { eye, sun = null, night = 0, moon = null, cover = {} } = {}) {
  wash.clear();
  glow.clear();
  disc.clear();
  face.clear();
  const made = { sun: false, moon: false };
  const dark = clamp01(night);
  /** A place on the bowl: so far round and up from the eye; never under the horizon. */
  const onBowl = (way) => [eye[0] + way[0] * SKY_RADIUS, eye[1] + way[1] * SKY_RADIUS, eye[2] + Math.max(way[2], 0) * SKY_RADIUS];
  /** Two directions square to a line of sight: to the right of it, and up it. */
  const across = (way) => {
    let right = [way[1], -way[0], 0];
    const size = Math.hypot(right[0], right[1]);
    right = size > 1e-6 ? [right[0] / size, right[1] / size, 0] : [1, 0, 0];
    return [right, [right[1] * way[2] - right[2] * way[1], right[2] * way[0] - right[0] * way[2], right[0] * way[1] - right[1] * way[0]]];
  };
  const degrees = (angle) => Math.tan(angle * RADIANS);
  /** A round light: brightest in its middle, nothing at its rim. (wide, tall: its half-sizes, as tangents.) What of it is under the horizon is not drawn. */
  const shine = (way, right, up, wide, tall, colour, strength, sides = 14, into = glow) => {
    if (!(strength > 0.004)) return;
    into.room(sides * 3);
    const middle = onBowl(way);
    for (let k = 0; k < sides; k += 1) {
      into.glow(middle[0], middle[1], middle[2], colour[0], colour[1], colour[2], strength);
      for (const t of [(k / sides) * TAU, ((k + 1) / sides) * TAU]) {
        const [c, s] = [Math.cos(t) * wide, Math.sin(t) * tall];
        const at = onBowl([way[0] + right[0] * c + up[0] * s, way[1] + right[1] * c + up[1] * s, way[2] + right[2] * c + up[2] * s]);
        into.glow(at[0], at[1], at[2], colour[0], colour[1], colour[2], 0);
      }
    }
  };

  // ── The sun ──
  const sunWay = sun ? directionOf(sun.azimuth, sun.altitude) : null;
  if (sun && sun.altitude > -1.2) {
    // Its disc (drawn half as wide again as it is, as the eye sees a bright thing), and the glare round it.
    const [right, up] = across(sunWay);
    const colour = sunlightAt(sun.altitude);
    const low = clamp01(1 - sun.altitude / 14); // how near the horizon: there it is dimmer
    // (How much of it shows between the clouds: all of it in a clear sky, little under a covered one.)
    const between = sunBetween(cover);
    shine(sunWay, right, up, degrees(0.42), degrees(0.42), colour, (1 - 0.3 * low) * between, 16, disc);
    shine(sunWay, right, up, degrees(0.75), degrees(0.75), colour, (1 - 0.3 * low) * between, 16, disc);
    shine(sunWay, right, up, degrees(7), degrees(7), colour, (0.32 - 0.12 * low) * (0.4 + 0.6 * between));
    made.sun = true;
  }

  // ── The colours of its going down, all round the horizon ──
  if (sun && sun.altitude < 6 && sun.altitude > -16) {
    const s = sun.altitude;
    const set = smooth(6, -1.5, s) * smooth(-16, -5, s); // the glow where it goes down: strongest when it has just gone
    const belt = smooth(1.5, -1.5, s) * smooth(-9, -4.5, s); // the pink band opposite, and the Earth's shadow under it
    const rise = Math.min(Math.max(-s, 0), 7); // the shadow climbs as the sun sinks
    const rows = [0, 1.8, 4, 7, 11, 16, 23, 32];
    const steps = 24;
    /** What light is added at a place round the horizon: [r, g, b], and what colour is laid over it: [r, g, b, how solid]. */
    const at = (round, height) => {
      const x = Math.cos((round - sun.azimuth) * RADIANS);
      const [toward, away] = [Math.max(x, 0), Math.max(-x, 0)];
      const orange = set * 0.6 * toward ** 2 * Math.exp(-height / 4.5);
      const gold = set * 0.3 * toward ** 0.8 * Math.exp(-height / 13);
      const pink = belt * 0.26 * away ** 0.6 * Math.exp(-(((height - (9 + rise)) / 6) ** 2));
      const shade = belt * 0.72 * away ** 0.6 * Math.exp(-((height / (5 + rise)) ** 1.6));
      return {
        light: [255 * orange + 255 * gold + 255 * pink, 138 * orange + 196 * gold + 128 * pink, 72 * orange + 120 * gold + 150 * pink],
        shade,
      };
    };
    glow.room(steps * (rows.length - 1) * 6);
    wash.room(steps * (rows.length - 1) * 6);
    for (let k = 0; k < steps; k += 1) {
      const [r0, r1] = [(k / steps) * 360, ((k + 1) / steps) * 360];
      for (let row = 0; row + 1 < rows.length; row += 1) {
        const quad = [[r0, rows[row]], [r1, rows[row]], [r1, rows[row + 1]], [r0, rows[row + 1]]].map(([round, height]) => ({ place: onBowl(directionOf(round, height)), ...at(round, height) }));
        for (const corner of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) {
          glow.glow(corner.place[0], corner.place[1], corner.place[2], Math.min(corner.light[0], 255), Math.min(corner.light[1], 255), Math.min(corner.light[2], 255), 1);
          wash.corner(corner.place[0], corner.place[1], corner.place[2], 86, 94, 140, corner.shade);
        }
      }
    }
  }

  // ── The moon ──
  if (moon && moon.altitude > 1) {
    const way = directionOf(moon.azimuth, moon.altitude);
    const [right, up] = across(way);
    const half = degrees(0.27 * 1.7); // (drawn larger than life, as it looks to the eye)
    // Its lit side looks towards the sun: which way that is on its face.
    let towards = sunWay ? [sunWay[0] * right[0] + sunWay[1] * right[1] + sunWay[2] * right[2], sunWay[0] * up[0] + sunWay[1] * up[1] + sunWay[2] * up[2]] : [1, 0];
    const size = Math.hypot(towards[0], towards[1]);
    towards = size > 1e-6 ? [towards[0] / size, towards[1] / size] : [1, 0];
    // By day it is a pale shape in the blue; low in the sky it is the colour of the haze it is seen through.
    const shown = 0.3 + 0.7 * smooth(0.1, 0.45, dark);
    const colour = mix(mix([232, 238, 246], [238, 235, 222], smooth(0.1, 0.5, dark)), [255, 206, 150], 0.7 * clamp01(1 - moon.altitude / 9));
    // From the bright limb to the line between light and dark, in slices across its face.
    const slices = 12;
    const edge = 1 - 2 * clamp01(moon.lit); // where that line crosses the middle of the face: 1 new, -1 full
    const point = (toSun, level) => {
      const [x, y] = [(towards[0] * toSun - towards[1] * level) * half, (towards[1] * toSun + towards[0] * level) * half];
      return onBowl([way[0] + right[0] * x + up[0] * y, way[1] + right[1] * x + up[1] * y, way[2] + right[2] * x + up[2] * y]);
    };
    face.room(slices * 6);
    for (let k = 0; k < slices; k += 1) {
      const [l0, l1] = [-1 + (2 * k) / slices, -1 + (2 * (k + 1)) / slices];
      const [w0, w1] = [Math.sqrt(Math.max(1 - l0 * l0, 0)), Math.sqrt(Math.max(1 - l1 * l1, 0))];
      const quad = [point(w0, l0), point(w1, l1), point(w1 * edge, l1), point(w0 * edge, l0)];
      for (const corner of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) face.corner(corner[0], corner[1], corner[2], colour[0], colour[1], colour[2], shown);
    }
    shine(way, right, up, half * 6, half * 6, [190, 200, 230], 0.2 * moon.lit * smooth(0.25, 0.7, dark));
    made.moon = true;
  }
  return made;
}

// ── The stars and the planets ─────────────────────────────────────────────

/**
 * The points of light of the night sky, each where it stands on the bowl
 * round the eye: the planets and the stars that show at this hour, the
 * brightest coming out first as it darkens. eye: where the eye is. night: 0
 * by day to 1 by night. stars: as starsAt() gives them; planets: as
 * planetsAt() does.
 *
 * Returns [{ x, y, z, colour, strength (0 to 1), wide (how much larger than
 * a faint star it is drawn, 0 to 1), halo (how much of a halo it has, 0 to
 * 1), flicker (how much it twinkles), pace, planet (its name, or null) }].
 */
export function starPoints({ eye, night = 0, stars = [], planets = [], moon = null } = {}) {
  const dark = clamp01(night);
  // How faint a star still shows: none by day, more and more as it darkens, down to the fourth magnitude
  // or a little past it on a moonless night in the city (its own light hides the rest). The moon hides
  // more: a full moon high in the sky puts out all but the brighter stars, as it does over Riyadh.
  const moonlight = moon ? clamp01(moon.lit ?? 0) * smooth(-2, 25, moon.altitude ?? -90) : 0;
  const faintest = -5.5 + 9.8 * smooth(0.2, 0.95, dark) - 1.3 * moonlight;
  const points = [];
  const put = (body, planet) => {
    if (!(body.altitude > 0.5)) return;
    const shown = clamp01((faintest - body.magnitude) / 1.2);
    // (Low in the sky the dust and the city's glow put all but the brightest out.)
    const through = clamp01((body.altitude - 1) / 9) ** 0.7;
    // How bright it is drawn, and how wide: the brighter the stronger and the wider, but every star that
    // shows is at least a clear dot on a phone's screen, not a speck one cannot see.
    const strength = 0.32 + 0.68 * clamp01((3.6 - body.magnitude) / 5.1);
    if (!(shown * through > 0.02)) return;
    const way = directionOf(body.azimuth, body.altitude);
    points.push({
      x: eye[0] + way[0] * SKY_RADIUS,
      y: eye[1] + way[1] * SKY_RADIUS,
      z: eye[2] + way[2] * SKY_RADIUS,
      colour: body.colour ?? [226, 232, 255],
      strength: strength * shown * through,
      wide: 0.08 + 0.42 * clamp01((2.6 - body.magnitude) / 4.1),
      // (Round what outshines every star there is a soft halo: Venus, Jupiter.)
      halo: clamp01((-1.6 - body.magnitude) / 2.6),
      // A star twinkles, the more the lower it stands; a planet shines steadily.
      flicker: planet ? 0.06 : 0.16 + 0.34 * clamp01(1 - body.altitude / 40),
      pace: 3 + 5 * chance(Math.round(body.azimuth * 50), Math.round(body.altitude * 50), 71),
      planet: planet ? body.name : null,
      name: body.name ?? null,
      magnitude: body.magnitude,
      azimuth: body.azimuth,
      altitude: body.altitude,
    });
  };
  for (const planet of planets) put(planet, true);
  for (const star of stars) put(star, false);
  return points;
}

/** The compass point a direction lies towards: 'north', 'north-east' and so on. */
export function compassPoint(azimuth) {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(turned(azimuth) / 45) % 8];
}

/**
 * What of the night sky is to be seen, in words, from the points starPoints() gave: { stars (how many
 * show), brightest: ['Sirius (south-east)', …] (the brightest named stars that show, up to three),
 * planets: ['Jupiter (east)', …] }.
 */
export function skyTonight(points = []) {
  const stars = points.filter((point) => !point.planet);
  const named = stars.filter((point) => point.name && point.strength > 0.15).sort((a, b) => a.magnitude - b.magnitude);
  const words = (point) => `${point.name} (${compassPoint(point.azimuth)})`;
  return { stars: stars.length, brightest: named.slice(0, 3).map(words), planets: points.filter((point) => point.planet).sort((a, b) => a.magnitude - b.magnitude).map(words) };
}

/** Draw those points into a mesh of lights, as they are at a moment: each twinkling at its own pace. Returns how many. */
export function drawStars(lights, points, seconds = 0) {
  lights.clear();
  lights.room(points.length * 2);
  for (const point of points) {
    const twinkle = 1 + point.flicker * Math.sin(seconds * point.pace + point.pace * 40);
    if (point.halo > 0) lights.glow(point.x, point.y, point.z, point.colour[0], point.colour[1], point.colour[2], 0.3 * point.halo * point.strength, 0.55 + 0.45 * point.halo);
    lights.glow(point.x, point.y, point.z, point.colour[0], point.colour[1], point.colour[2], Math.min(point.strength * twinkle, 1), point.wide);
  }
  return points.length;
}

// ── The aircraft ──────────────────────────────────────────────────────────

// An aircraft far off is drawn larger than life, or it would be a speck: by as much as it is further
// off than this, so that out to the second distance it looks as long as it would from the first (a
// little over a degree: two moons and a half), and beyond that it dwindles.
const AIRCRAFT_LIFE_SIZE_WITHIN_METERS = 1750;
const AIRCRAFT_DWINDLES_FROM_METERS = 45000;
const AIRCRAFT_SEEN_WITHIN_METERS = 150000;
// Nearer than this an aircraft is drawn whole and true (see drawAirliner()): in its real depth, so that
// it passes in front of the buildings under it and behind those before it. Further off it is drawn as
// part of the sky, behind everything.
export const NEAR_AIRCRAFT_METERS = 15000;
// How its parts are painted: the body, the belly, the fin and the engines from its airline's colours
// (see flights.js); the rest the same for all.
const AIRLINER_FIXED = { cockpit: [34, 42, 56], wing: [196, 200, 206], intake: [48, 52, 60], exhaust: [98, 100, 106], strut: [150, 152, 158], tyre: [34, 34, 36], window: [40, 48, 62] };
const BELLY = [196, 200, 206];
const WINDOW_GLOW = [255, 212, 150]; // a cabin's light by night
const WINDOWS_LIT_WITHIN_METERS = 2500; // (further off, a window is less than a pixel, and only flickers)
const PLANE_SHADOW_BELOW_METERS = 1000; // the shadow of one lower than this shows on the ground: fainter the higher it is, as the sun's own width blurs it
// The trail a high aircraft leaves: how far behind it each part is, how wide there, and how solid.
const TRAIL = [[150, 16, 0], [1100, 34, 0.66], [3600, 90, 0.56], [8000, 190, 0.42], [14000, 300, 0.26], [22000, 400, 0]];
const TRAIL_FROM_METERS = 8000; // how high it must fly to leave one

/**
 * One aircraft near enough to be seen whole (see NEAR_AIRCRAFT_METERS): the airliner of airliner.js, as
 * it flies just now (its nose up as it climbs or comes in to land, a wing down in a turn, its wheels and
 * flaps down near the ground), lit by the sun as the buildings are. Into near.body the aircraft itself,
 * and its shadow on the ground when it flies low by day; into near.glow its lit windows and the glare of
 * its landing lamps; into near.lamps the points of its lamps. at: where it is in the scene's metres (its
 * wheels); scale: how much larger than life it is drawn.
 */
export function drawAirliner(near, plane, { at, far, scale = 1, sun = null, lampsOn = 0, seconds = 0, eye = [0, 0, 0] }) {
  const landing = plane.phase === 'landing';
  const onGround = plane.alt < 1;
  const gear = onGround || (landing ? plane.alt < 900 : plane.alt < 250);
  const flaps = landing ? (plane.alt < 1300 ? 30 : plane.alt < 2600 ? 15 : 0) : plane.phase === 'takeoff' && plane.alt < 700 ? 15 : 0;
  const model = airliner(plane.wide ? 'wide' : 'narrow', { gear, flaps });
  // Its attitude: along its path, the nose a few degrees above it (more as it climbs away, less in the
  // cruise), level on the ground; and banked into a turn.
  const course = plane.track * RADIANS;
  const path = Math.atan2(plane.climb ?? 0, Math.max(plane.speed ?? 100, 30));
  const pitch = onGround ? 0 : path + (landing ? 5 : plane.phase === 'takeoff' ? 8 : 2.5) * RADIANS;
  const bank = (plane.bank ?? 0) * RADIANS;
  const ahead = [Math.sin(course) * Math.cos(pitch), Math.cos(course) * Math.cos(pitch), Math.sin(pitch)];
  const flatRight = [Math.cos(course), -Math.sin(course), 0];
  const flatRoof = [-Math.sin(course) * Math.sin(pitch), -Math.cos(course) * Math.sin(pitch), Math.cos(pitch)];
  const right = [0, 1, 2].map((k) => flatRight[k] * Math.cos(bank) - flatRoof[k] * Math.sin(bank));
  const roof = [0, 1, 2].map((k) => flatRoof[k] * Math.cos(bank) + flatRight[k] * Math.sin(bank));
  const turn = (x, y, z) => [right[0] * x + ahead[0] * y + roof[0] * z, right[1] * x + ahead[1] * y + roof[1] * z, right[2] * x + ahead[2] * y + roof[2] * z];
  const place = (x, y, z) => {
    const t = turn(x * scale, y * scale, z * scale);
    return [at[0] + t[0], at[1] + t[1], at[2] + t[2]];
  };
  // Its paint, and the light on it: the sun's, as on the buildings (from at least 35° up), or by night
  // the same all round (the night itself is laid on by the scene).
  const body = plane.body ?? [244, 244, 244];
  const tail = plane.tail ?? [60, 90, 150];
  const paint = {
    ...AIRLINER_FIXED,
    body,
    belly: [0, 1, 2].map((k) => body[k] * 0.35 + BELLY[k] * 0.65),
    fin: tail,
    engine: [0, 1, 2].map((k) => body[k] * 0.8 + 200 * 0.2),
  };
  const colours = AIRLINER_PARTS_PAINT.map((name) => paint[name]);
  const light = sun && sun.altitude > 3 ? directionOf(sun.azimuth, Math.max(sun.altitude, 35)) : null;
  const { corners, normals, parts } = model;
  const count = parts.length;
  near.body.room(count * 3);
  for (let i = 0; i < count; i += 1) {
    const n = turn(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    const shade = light ? Math.min(0.6 + 0.4 * Math.max(n[0] * light[0] + n[1] * light[1] + n[2] * light[2], 0) + 0.05 * n[2], 1.04) : 0.82;
    const colour = colours[parts[i]];
    const [r, g, b] = [Math.min(colour[0] * shade, 255), Math.min(colour[1] * shade, 255), Math.min(colour[2] * shade, 255)];
    for (let k = 0; k < 3; k += 1) {
      const c = i * 9 + k * 3;
      const p = place(corners[c], corners[c + 1], corners[c + 2]);
      near.body.corner(p[0], p[1], p[2], r, g, b, 1);
    }
  }

  // Its shadow on the ground, when it flies low under the sun: its body, wings and tailplane, laid down
  // along the sun's rays, fainter the higher it is.
  if (sun && sun.altitude > 10 && plane.alt < PLANE_SHADOW_BELOW_METERS) {
    const way = directionOf(sun.azimuth, sun.altitude);
    const strength = 0.3 * (1 - plane.alt / PLANE_SHADOW_BELOW_METERS) ** 0.7;
    const ground = (x, y, z) => {
      const p = place(x, y, z);
      const down = p[2] - 0.25;
      return [p[0] - (way[0] / way[2]) * down, p[1] - (way[1] / way[2]) * down, 0.25];
    };
    const size = AIRLINER_SIZES[model.kind];
    const half = size.width / 2;
    const [root, tip] = wingEndsOf(size);
    const outline = [
      [[-half, size.length / 2 - 2, size.centre], [half, size.length / 2 - 2, size.centre], [half, -size.length / 2 + 2, size.centre], [-half, -size.length / 2 + 2, size.centre]],
      ...[-1, 1].map((side) => [[side * half, root[1], root[2]], [side * tip[0], tip[1], tip[2]], [side * tip[0], tip[1] - tip[3], tip[2]], [side * half, root[1] - root[3], root[2]]]),
    ];
    near.body.room(outline.length * 6);
    for (const corners4 of outline) {
      const [a, b, c, d] = corners4.map((p) => ground(...p));
      near.body.face(a, b, c, d, 0, 0, 0, strength);
    }
  }

  if (!(lampsOn > 0.02)) return;
  // By night: the cabin's windows lit, seen from near by; its lamps (red on the left wing tip, green on
  // the right, white at the tail; the red beacons flashing once a second, the white flashes at the tips
  // twice); and below three kilometres, coming in or going out, its landing lamps.
  if (far < WINDOWS_LIT_WITHIN_METERS) {
    near.glow.room(model.windows.length * 6);
    for (const [x, y, z] of model.windows) {
      const out = Math.sign(x) * 0.02;
      const quad = [place(x + out, y + 0.14, z - 0.2), place(x + out, y - 0.14, z - 0.2), place(x + out, y - 0.14, z + 0.2), place(x + out, y + 0.14, z + 0.2)];
      for (const p of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) near.glow.glow(p[0], p[1], p[2], WINDOW_GLOW[0], WINDOW_GLOW[1], WINDOW_GLOW[2], 0.85 * lampsOn);
    }
  }
  const beat = (((seconds + (plane.id ? plane.id.length * 0.37 : 0)) % 1) + 1) % 1;
  const lamp = (where, colour, strength) => {
    const p = place(...where);
    near.lamps.glow(p[0], p[1], p[2], colour[0], colour[1], colour[2], strength * lampsOn);
  };
  const L = model.lamps;
  near.lamps.room(10);
  lamp(L.left, [255, 60, 50], 1);
  lamp(L.right, [70, 255, 120], 1);
  lamp(L.tail, [255, 255, 255], 0.8);
  if (beat < 0.12) {
    lamp(L.top, [255, 60, 50], 1);
    lamp(L.bottom, [255, 60, 50], 1);
  }
  if (beat > 0.5 && (beat < 0.56 || (beat > 0.62 && beat < 0.68))) {
    lamp(L.left, [255, 255, 255], 1);
    lamp(L.right, [255, 255, 255], 1);
  }
  if (plane.phase !== 'cruise' && plane.alt < 3200) {
    for (const where of L.landing) lamp(where, [255, 248, 232], 1);
    // (And their glare, so wide whatever the distance, where they point at the eye.)
    const middle = place(0, model.size.length * 0.2, AIRLINER_SIZES[model.kind].centre - 1);
    const to = [middle[0] - eye[0], middle[1] - eye[1], middle[2] - eye[2]];
    const away = Math.hypot(to[0], to[1], to[2]) || 1;
    const facing = -(ahead[0] * to[0] + ahead[1] * to[1] + ahead[2] * to[2]) / away;
    const strength = smooth(0.3, 0.95, facing) * 0.9;
    if (strength > 0.05) {
      const wide = Math.max(away * 0.004, 2.5);
      const way = [to[0] / away, to[1] / away, to[2] / away];
      let side = [way[1], -way[0], 0];
      const size = Math.hypot(side[0], side[1]) || 1;
      side = [side[0] / size, side[1] / size, 0];
      const up = [side[1] * way[2] - side[2] * way[1], side[2] * way[0] - side[0] * way[2], side[0] * way[1] - side[1] * way[0]];
      const sides = 10;
      near.glow.room(sides * 3);
      for (let k = 0; k < sides; k += 1) {
        near.glow.glow(middle[0], middle[1], middle[2], 255, 246, 224, strength * lampsOn);
        for (const t of [(k / sides) * TAU, ((k + 1) / sides) * TAU]) {
          const [c, s2] = [Math.cos(t) * wide, Math.sin(t) * wide];
          near.glow.glow(middle[0] + side[0] * c + up[0] * s2, middle[1] + side[1] * c + up[1] * s2, middle[2] + side[2] * c + up[2] * s2, 255, 246, 224, 0);
        }
      }
    }
  }
}

/**
 * Draw the aircraft into two meshes: each where it is, in the scene's
 * metres.
 *
 * mesh: the aircraft themselves, the trails behind the high ones, and the
 *   glare of their landing lamps.
 * lights: the points of their lamps.
 *
 * eye: where the eye is. origin: { lng, lat } of the scene. planes: as
 * Flights.at() gives them. night: 0 by day to 1 by night. sun, moon: for the
 * light on the trails. cover: { low, mid, high }: how much of the sky each
 * layer of cloud covers: an aircraft over a covered sky is not seen through
 * it. seconds: the time, for the lamps that flash. shown: an array, if wanted,
 * into which each one drawn is put: { id, kind, callsign, phase, alt, at
 * (where it is, in the scene's metres), seen (how much of it shows through
 * the cloud, 0 to 1), far (metres from the eye) }.
 *
 * Returns how many were drawn.
 */
export function drawAircraft(mesh, lights, { eye, origin, planes = [], night = 0, sun = null, moon = null, cover = {}, seconds = 0, shown = null, near = null, far: farOnes = true } = {}) {
  mesh.clear();
  lights.clear();
  if (near) for (const part of [near.body, near.glow, near.lamps]) part.clear();
  if (planes.length === 0) return 0;
  const dark = clamp01(night);
  const squeeze = Math.cos(origin.lat * RADIANS) * 111320;
  const ice = cloudTones(0, { sun, night: dark, moon });
  const lampsOn = smooth(0.2, 0.5, dark);
  // How much of what is above each layer of cloud shows through it.
  const through = (share) => 1 - smooth(0.45, 0.95, share ?? 0);
  const [overLow, overMid, overHigh] = [through(cover.low), through(cover.mid), through(cover.high)];
  let drawn = 0;
  for (const plane of planes) {
    const flat = Math.hypot((plane.lng - origin.lng) * squeeze - eye[0], (plane.lat - origin.lat) * 111320 - eye[1]);
    const at = [(plane.lng - origin.lng) * squeeze, (plane.lat - origin.lat) * 111320, plane.alt - (flat * flat) / (2 * EARTH_CURVE_METERS)];
    const to = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
    const far = Math.hypot(to[0], to[1], to[2]);
    const seen = (plane.alt > CLOUD_LAYERS[2].to ? overLow : 1) * (plane.alt > CLOUD_LAYERS[1].to ? overMid : 1) * (plane.alt > CLOUD_LAYERS[0].to ? overHigh : 1);
    // An aircraft far off is drawn larger than life (see above): but only as far as it is seen against
    // the sky. Seen from above, against the city, it is as large as it is.
    const enlarged = Math.max(far / AIRCRAFT_LIFE_SIZE_WITHIN_METERS, 1) * Math.min(AIRCRAFT_DWINDLES_FROM_METERS / far, 1) ** 0.66;
    if (near && far < NEAR_AIRCRAFT_METERS) {
      // Near: whole, in its true depth, wherever the eye is (below it, level with it, above it).
      if (!(far > 12) || !(seen > 0.35)) continue;
      const large = 1 + (enlarged - 1) * smooth(0.004, 0.03, to[2] / far);
      drawAirliner(near, plane, { at, far, scale: large, sun, lampsOn, seconds, eye });
      drawn += 1;
      shown?.push({ id: plane.id, kind: plane.kind, callsign: plane.callsign, phase: plane.phase, alt: plane.alt, at, seen, far });
      continue;
    }
    if (!farOnes || !(far > 120) || far > AIRCRAFT_SEEN_WITHIN_METERS || to[2] / far < 0.004) continue;
    if (!(seen > 0.03)) continue;
    const large = enlarged;
    const long = (plane.wide ? 64 : 38) * large;
    // Its own directions: ahead (nose up or down as it climbs), to its right, and up through its roof.
    const course = plane.track * RADIANS;
    const pitch = Math.atan2(plane.climb ?? 0, Math.max(plane.speed ?? 100, 30)) + (plane.phase === 'landing' ? 0.05 : 0);
    const ahead = [Math.sin(course) * Math.cos(pitch), Math.cos(course) * Math.cos(pitch), Math.sin(pitch)];
    const right = [Math.cos(course), -Math.sin(course), 0];
    const roof = [-Math.sin(course) * Math.sin(pitch), -Math.cos(course) * Math.sin(pitch), Math.cos(pitch)];
    /** A place on the aircraft: so far to its right, ahead and up, as parts of its length. */
    const part = (x, y, z) => [at[0] + (right[0] * x + ahead[0] * y + roof[0] * z) * long, at[1] + (right[1] * x + ahead[1] * y + roof[1] * z) * long, at[2] + (right[2] * x + ahead[2] * y + roof[2] * z) * long];

    // The trail behind one that flies high: a ribbon of ice lying level behind it, widening and thinning;
    // lit as the high clouds are; long where the air up there is damp (which is where there is high cloud).
    if (plane.alt > TRAIL_FROM_METERS) {
      const lasting = 0.45 + 0.9 * clamp01(cover.high ?? 0);
      const shown = seen * (0.3 + 0.7 * (1 - dark)) * smooth(0.004, 0.03, to[2] / far);
      const colour = capped(add(ice.rim, [18, 18, 18]));
      const [bx, by] = [-Math.sin(course), -Math.cos(course)];
      const [sx, sy] = [Math.cos(course), -Math.sin(course)];
      mesh.room((TRAIL.length - 1) * 6);
      for (let k = 1; k < TRAIL.length; k += 1) {
        const [[d0, w0, s0], [d1, w1, s1]] = [TRAIL[k - 1], TRAIL[k]];
        const [f0, f1] = [long * 0.5 + d0 * lasting, long * 0.5 + d1 * lasting];
        const corner = (back, side) => [at[0] + bx * back + sx * side, at[1] + by * back + sy * side, at[2]];
        const quad = [[corner(f0, -w0), s0], [corner(f0, w0), s0], [corner(f1, w1), s1], [corner(f1, -w1), s1]];
        for (const [place, solid] of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) mesh.corner(place[0], place[1], place[2], colour[0], colour[1], colour[2], solid * shown);
      }
    }

    // By day in its paint; by night a dark shape that only its lamps give away.
    const dim = 1 - 0.82 * smooth(0.2, 0.8, dark);
    const tint = (colour, shade) => [colour[0] * shade * dim, colour[1] * shade * dim, colour[2] * shade * dim];
    const face = (a, b, c, d, colour) => {
      mesh.room(6);
      for (const corner of [a, b, c, a, c, d]) mesh.corner(corner[0], corner[1], corner[2], colour[0], colour[1], colour[2], seen);
    };
    const three = (a, b, c, colour) => {
      mesh.room(3);
      for (const corner of [a, b, c]) mesh.corner(corner[0], corner[1], corner[2], colour[0], colour[1], colour[2], seen);
    };
    const body = plane.body ?? [244, 244, 244];
    const tail = plane.tail ?? [60, 90, 150];
    // The body: a tube that comes to a point at the nose and at the tail.
    const [w, h] = [0.05, 0.052];
    const ring = (y) => [part(-w, y, -h), part(w, y, -h), part(w, y, h), part(-w, y, h)];
    const [front, back] = [ring(0.36), ring(-0.3)];
    const nose = part(0, 0.5, -0.01);
    const end = part(0, -0.5, 0.03);
    const shades = [0.7, 0.9, 1, 0.9]; // underneath, one side, the roof, the other side
    for (let k = 0; k < 4; k += 1) {
      const colour = tint(body, shades[k]);
      face(back[k], back[(k + 1) % 4], front[(k + 1) % 4], front[k], colour);
      three(front[k], front[(k + 1) % 4], nose, colour);
      three(back[(k + 1) % 4], back[k], end, colour);
    }
    // The wings, swept back; the tailplane; the fin in its airline's colour; an engine under each wing.
    const wing = tint([206, 210, 214], 0.95);
    for (const side of [-1, 1]) {
      face(part(side * w, 0.1, -0.02), part(side * 0.47, -0.13, 0.01), part(side * 0.47, -0.19, 0.01), part(side * w, -0.08, -0.02), wing);
      face(part(side * w * 0.6, -0.38, 0.02), part(side * 0.17, -0.46, 0.025), part(side * 0.17, -0.5, 0.025), part(side * w * 0.6, -0.46, 0.02), wing);
      const engine = tint([92, 96, 104], 1);
      face(part(side * 0.15 - 0.022, 0.1, -0.06), part(side * 0.15 + 0.022, 0.1, -0.06), part(side * 0.15 + 0.022, -0.02, -0.06), part(side * 0.15 - 0.022, -0.02, -0.06), engine);
      face(part(side * 0.15 - 0.022, 0.1, -0.025), part(side * 0.15 + 0.022, 0.1, -0.025), part(side * 0.15 + 0.022, -0.02, -0.025), part(side * 0.15 - 0.022, -0.02, -0.025), engine);
      for (const edge of [-0.022, 0.022]) face(part(side * 0.15 + edge, 0.1, -0.06), part(side * 0.15 + edge, -0.02, -0.06), part(side * 0.15 + edge, -0.02, -0.025), part(side * 0.15 + edge, 0.1, -0.025), engine);
    }
    face(part(0, -0.33, h), part(0, -0.43, 0.2), part(0, -0.5, 0.2), part(0, -0.47, h * 0.6), tint(tail, 1));
    drawn += 1;
    shown?.push({ id: plane.id, kind: plane.kind, callsign: plane.callsign, phase: plane.phase, alt: plane.alt, at, seen, far });

    // Its landing lamps, coming in or going out below three kilometres: lit by day too, and the brightest
    // thing in the sky when they point at the eye.
    // (They throw their light ahead: from the side there is nothing of them to see by day, and little by night.)
    const heading = -(ahead[0] * to[0] + ahead[1] * to[1] + ahead[2] * to[2]) / far; // 1 when it flies straight at the eye
    const landing = plane.phase !== 'cruise' && plane.alt < 3200 ? seen * (smooth(0.3, 0.95, heading) * (0.45 + 0.55 * lampsOn) + 0.2 * lampsOn) : 0;
    if (landing > 0.05) {
      // (A glare round them: so wide whatever the distance, as a bright light looks to the eye.)
      const middle = part(0, 0.3, -h);
      const wide = far * 0.0042 * (0.6 + 0.4 * lampsOn);
      const way = [to[0] / far, to[1] / far, to[2] / far];
      let side = [way[1], -way[0], 0];
      const size = Math.hypot(side[0], side[1]) || 1;
      side = [side[0] / size, side[1] / size, 0];
      const up = [side[1] * way[2] - side[2] * way[1], side[2] * way[0] - side[0] * way[2], side[0] * way[1] - side[1] * way[0]];
      const sides = 10;
      mesh.room(sides * 3);
      for (let k = 0; k < sides; k += 1) {
        mesh.glow(middle[0], middle[1], middle[2], 255, 246, 224, landing);
        for (const t of [(k / sides) * TAU, ((k + 1) / sides) * TAU]) {
          const [c, s] = [Math.cos(t) * wide, Math.sin(t) * wide];
          mesh.glow(middle[0] + side[0] * c + up[0] * s, middle[1] + side[1] * c + up[1] * s, middle[2] + side[2] * c + up[2] * s, 255, 246, 224, 0);
        }
      }
      lights.room(1);
      lights.glow(middle[0], middle[1], middle[2], 255, 248, 232, Math.min(landing * 1.4, 1), 0.35);
    }
    if (!(lampsOn > 0.02)) continue;
    // Its other lamps: red on the left wing, green on the right, white at the tail; a red one on the roof
    // that flashes once a second; white ones on the wings that flash twice.
    const beat = (((seconds + (plane.id ? plane.id.length * 0.37 : 0)) % 1) + 1) % 1;
    lights.room(6);
    const lamp = (place, colour, strength, wide = 0) => lights.glow(place[0], place[1], place[2], colour[0], colour[1], colour[2], strength * lampsOn * seen, wide);
    lamp(part(-0.47, -0.16, 0.01), [255, 60, 50], 0.9);
    lamp(part(0.47, -0.16, 0.01), [70, 255, 120], 0.9);
    lamp(part(0, -0.5, 0.03), [255, 255, 255], 0.7);
    if (beat < 0.12) lamp(part(0, 0, h + 0.01), [255, 60, 50], 1, 0.13);
    if (beat > 0.5 && (beat < 0.56 || (beat > 0.62 && beat < 0.68))) {
      lamp(part(-0.47, -0.16, 0.012), [255, 255, 255], 1, 0.15);
      lamp(part(0.47, -0.16, 0.012), [255, 255, 255], 1, 0.15);
    }
  }
  return drawn;
}
