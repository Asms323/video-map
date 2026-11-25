import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Mesh } from '../js/life.js';
import {
  CLOUD_LAYERS,
  SKY_RADIUS,
  STAR_COUNT,
  cloudDrift,
  cloudLayersOf,
  cloudTones,
  cloudsNear,
  compassPoint,
  directionOf,
  drawAircraft,
  drawClouds,
  drawHeavens,
  drawStars,
  fieldCover,
  horizontal,
  layerShare,
  layerWind,
  moonAt,
  NAMED_STARS,
  planetsAt,
  precessed,
  skyTonight,
  starPoints,
  starsAt,
  sunBetween,
  sunlightAt,
} from '../js/sky.js';
import { cloudField } from '../js/lib.js';
import { STARS } from '../js/stars.js';

const RIYADH = [46.68, 24.71];
const near = (a, b, by) => Math.abs(a - b) <= by;
const corners = (mesh) => Array.from({ length: mesh.count }, (_, i) => [...mesh.positions.subarray(i * 3, i * 3 + 3), ...mesh.colours.subarray(i * 4, i * 4 + 4)]);
const far = (point, eye) => Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]);
const at = (year, month, day, hour = 0, minute = 0) => new Date(Date.UTC(year, month - 1, day, hour, minute));
const NIGHT = at(2026, 11, 22, 18, 30); // half past nine in the evening, in Riyadh
const heavens = () => ({ wash: new Mesh(), glow: new Mesh(), disc: new Mesh(), face: new Mesh() });
const layers = () => [new Mesh(), new Mesh(), new Mesh()];
/** The direction from the eye to a corner on the bowl: [east, north, up], one long. */
const wayTo = (corner, eye) => [0, 1, 2].map((i) => (corner[i] - eye[i]) / far(corner, eye));
const degreesApart = (a, b) => (Math.acos(Math.min(Math.max(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1), 1)) * 180) / Math.PI;

test('the stars stand where they really do: the pole star at the height of the latitude, Sirius 48.6 degrees up when it is highest', () => {
  // Polaris, at any hour: due north (within its own small circle), as high as Riyadh is far from the equator.
  for (const hour of [0, 5, 11, 17, 23]) {
    const pole = horizontal(2.53, 89.26, at(2026, 11, 22, hour), ...RIYADH);
    assert.ok(near(pole.altitude, 24.71, 0.8) && (pole.azimuth < 1 || pole.azimuth > 359), JSON.stringify(pole));
  }
  // Sirius through a day: at its highest it is due south, 90 less the latitude less its own 16.7 degrees south.
  let best = { altitude: -90 };
  for (let minute = 0; minute < 1440; minute += 4) {
    const place = horizontal(6.752, -16.72, at(2026, 11, 22, 0, minute), ...RIYADH);
    if (place.altitude > best.altitude) best = place;
  }
  assert.ok(near(best.altitude, 90 - 24.71 - 16.72, 0.05) && near(best.azimuth, 180, 1.5), JSON.stringify(best));
  // The catalogue: every star to the fourth magnitude that rises over Riyadh, the brightest first.
  assert.equal(STAR_COUNT, 483);
  assert.deepEqual(STARS[0], [6.752, -16.72, -1.44, 0], 'Sirius');
  assert.ok(STARS.every(([ra, dec, magnitude], i) => ra >= 0 && ra < 24 && dec > -62 && dec <= 90 && magnitude <= 4 && (i === 0 || magnitude >= STARS[i - 1][2])));
  // Those that are up at an hour of the night: about half of them.
  const up = starsAt(NIGHT, ...RIYADH);
  assert.ok(up.length > STAR_COUNT * 0.38 && up.length < STAR_COUNT * 0.62 && up.every((star) => star.altitude > 0.5 && star.magnitude <= 4), `${up.length}`);
  // Sirius is up after midnight, and nothing outshines it; Betelgeuse is orange and Rigel blue-white.
  const later = starsAt(at(2026, 11, 22, 21, 30), ...RIYADH);
  assert.equal(Math.min(...later.map((star) => star.magnitude)), -1.44);
  const orion = later.filter((star) => star.magnitude < 0.5 && star.azimuth > 90 && star.azimuth < 270);
  const [betelgeuse, rigel] = [orion.find((star) => star.magnitude === 0.45), orion.find((star) => star.magnitude === 0.18)];
  assert.ok(betelgeuse && rigel && betelgeuse.colour[0] > betelgeuse.colour[2] + 60 && rigel.colour[2] >= rigel.colour[0], JSON.stringify([betelgeuse, rigel]));
  assert.deepEqual(directionOf(90, 0).map((part) => Math.round(part * 1e6) / 1e6), [1, 0, 0]);
  assert.deepEqual(directionOf(0, 90).map((part) => Math.round(part * 1e6) / 1e6), [0, 0, 1]);
});

test('the moon is where it really is, with as much of its face lit as it really has', () => {
  // New on the 9th of November 2026, full on the 24th.
  assert.ok(moonAt(at(2026, 11, 9, 7, 2), ...RIYADH).lit < 0.01);
  const full = moonAt(at(2026, 11, 24, 14, 53), ...RIYADH);
  assert.ok(full.lit > 0.99, `${full.lit}`);
  // Between the two it waxes: a week after new, half its face; after full it wanes.
  const half = moonAt(at(2026, 11, 17, 11, 48), ...RIYADH);
  assert.ok(near(half.lit, 0.5, 0.05) && half.waxing && !moonAt(at(2026, 11, 28), ...RIYADH).waxing);
  // A full moon rises as the sun goes down, in the east: an hour after sunset on the 24th it is low over the east-north-east.
  const rising = moonAt(at(2026, 11, 24, 15, 5), ...RIYADH);
  assert.ok(rising.altitude > 2 && rising.altitude < 25 && rising.azimuth > 50 && rising.azimuth < 90, JSON.stringify(rising));
  // And at midnight it is high in the south.
  const high = moonAt(at(2026, 11, 24, 20, 50), ...RIYADH);
  assert.ok(high.altitude > 70, JSON.stringify(high));
});

test('the planets are where they really are: opposite the sun on the nights they were, as far from it as Venus was', () => {
  const planet = (name, date) => planetsAt(date, ...RIYADH).find((one) => one.name === name);
  // Jupiter stood opposite the sun on 7 December 2024 and on 10 January 2026; Saturn on 21 September 2025; Mars on 16 January 2025.
  assert.ok(planet('Jupiter', at(2024, 12, 7, 21)).fromSun > 177 && planet('Jupiter', at(2026, 1, 10, 9)).fromSun > 177);
  assert.ok(planet('Saturn', at(2025, 9, 21, 6)).fromSun > 175);
  assert.ok(planet('Mars', at(2025, 1, 16, 3)).fromSun > 173);
  // Venus: furthest east of the sun on 10 January 2025 (47.2 degrees), between us and the sun on 23 March, furthest west on
  // 1 June (45.9 degrees), behind the sun on 6 January 2026. Mercury: 18.2 degrees east on 8 March 2025.
  assert.ok(near(planet('Venus', at(2025, 1, 10, 5)).fromSun, 47.2, 0.5) && near(planet('Venus', at(2025, 6, 1, 4)).fromSun, 45.9, 0.5));
  assert.ok(planet('Venus', at(2025, 3, 23, 1)).fromSun < 10 && planet('Venus', at(2026, 1, 6, 17)).fromSun < 2);
  assert.ok(near(planet('Mercury', at(2025, 3, 8, 6)).fromSun, 18.2, 0.6));
  // How bright: Venus outshines everything, Jupiter at its nearest is next; Saturn is a star of the first magnitude.
  assert.ok(planet('Venus', at(2025, 1, 10, 5)).magnitude < -4.2 && near(planet('Jupiter', at(2026, 1, 10, 9)).magnitude, -2.6, 0.3) && near(planet('Saturn', at(2025, 9, 21, 6)).magnitude, 0.6, 0.5));
  // All five, whether they are up or not; and before dawn on 23 November 2026 Venus is the morning star, in the east-south-east.
  const dawn = planetsAt(at(2026, 11, 23, 2, 20), ...RIYADH);
  assert.deepEqual(dawn.map((one) => one.name), ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']);
  const venus = dawn[1];
  assert.ok(venus.altitude > 15 && venus.altitude < 30 && venus.azimuth > 100 && venus.azimuth < 125 && venus.magnitude < -4, JSON.stringify(venus));
  assert.ok(dawn[4].altitude < 0, 'Saturn has set by then');
});

test('the clouds are as many as the weather says in each of three layers, and drift the way its wind blows', () => {
  const place = [4730000, 2750000];
  // A clear sky has none; and without any weather known, the sky is clear.
  assert.deepEqual(cloudsNear(place, { seconds: 1000 }), []);
  assert.deepEqual(cloudLayersOf(null), { low: 0, mid: 0, high: 0 });
  // The weather tells each layer; where it tells only the whole, that is shared out among the three.
  assert.deepEqual(cloudLayersOf({ cloud: 0.5, cloudLow: 0.1, cloudMid: 0.2, cloudHigh: 0.7 }), { low: 0.1, mid: 0.2, high: 0.7 });
  const shared = cloudLayersOf({ cloud: 0.5 });
  assert.ok(shared.low > 0.1 && shared.mid > 0.1 && shared.high > shared.low && shared.high <= 0.5);
  // Low cloud alone: every cloud in the low layer, between its heights, within its reach.
  const [high, mid, low] = CLOUD_LAYERS;
  assert.deepEqual([high.name, mid.name, low.name], ['high', 'mid', 'low']);
  const some = cloudsNear(place, { low: 0.3, seconds: 1000 });
  assert.ok(some.length > 100 && some.every((cloud) => cloud.layer === 2 && cloud.z >= low.from && cloud.z <= low.to && Math.hypot(cloud.x - place[0], cloud.y - place[1]) <= low.reach && cloud.cover === 0.3), `${some.length}`);
  // More of the sky covered: more clouds, and wider ones.
  const more = cloudsNear(place, { low: 0.8, seconds: 1000 });
  const mean = (clouds) => clouds.reduce((sum, cloud) => sum + cloud.radius, 0) / clouds.length;
  assert.ok(more.length > some.length && mean(more) > mean(some) * 1.3);
  // All three layers, each at its own height: the high ones above eight kilometres, the middle ones between.
  const all = cloudsNear(place, { low: 0.3, mid: 0.3, high: 0.3, seconds: 1000 });
  assert.ok([0, 1, 2].every((layer) => all.some((cloud) => cloud.layer === layer)));
  assert.ok(all.every((cloud) => cloud.z >= CLOUD_LAYERS[cloud.layer].from && cloud.z <= CLOUD_LAYERS[cloud.layer].to));
  assert.ok(high.from > 8000 && mid.from > 3000 && mid.to < 8000 && low.to < 3000);
  // A layer that covers the whole sky hides what is above it: none of that is set out.
  assert.ok(cloudsNear(place, { low: 1, mid: 0.5, high: 0.5, seconds: 1000 }).every((cloud) => cloud.layer === 2));
  assert.ok(cloudsNear(place, { mid: 1, high: 0.5, seconds: 1000 }).every((cloud) => cloud.layer === 1));
  assert.deepEqual(cloudsNear(place, { low: 0.3, mid: 0.3, high: 0.3, seconds: 1000 }), all, 'the same sky for the same moment');
  // A hundred seconds on, with 6 m/s out of the north-west: each layer has drifted to the south-east, the higher the further.
  const wind = { low: 0.4, mid: 0.4, high: 0.4, windFrom: 315, windSpeed: 6 };
  assert.deepEqual(cloudDrift(2, wind, 100).map(Math.round), [Math.round(1200 * Math.SQRT1_2), -Math.round(1200 * Math.SQRT1_2)]);
  const [before, after] = [cloudsNear(place, { ...wind, seconds: 5000 }), cloudsNear(place, { ...wind, seconds: 5100 })];
  let matched = 0;
  for (const cloud of before) {
    const same = after.find((one) => one.layer === cloud.layer && one.seed === cloud.seed && near(one.z, cloud.z, 1e-6) && near(one.radius, cloud.radius, 1e-6));
    if (!same) continue; // (one that has drifted out of reach)
    matched += 1;
    const drift = 6 * CLOUD_LAYERS[cloud.layer].drift * 100;
    assert.ok(near(same.x - cloud.x, drift * Math.SQRT1_2, 0.01) && near(same.y - cloud.y, -drift * Math.SQRT1_2, 0.01), `${same.x - cloud.x}, ${same.y - cloud.y}`);
  }
  assert.ok(matched > before.length * 0.9);
});

test('a cloud is white with a grey belly by day, red from underneath as the sun goes down, dark with the city on it by night', () => {
  // By day: its edge white, its belly a light grey; the high ones white right through.
  const day = [0, 1, 2].map((layer) => cloudTones(layer, { sun: { azimuth: 180, altitude: 45 }, night: 0 }));
  assert.deepEqual(day[2].rim, [255, 255, 255]);
  assert.ok(day[2].base[0] > 150 && day[2].base[0] < 200 && day[2].base[2] > day[2].base[0], JSON.stringify(day[2].base));
  assert.deepEqual(day[0].base, [255, 255, 255]);
  assert.ok(day.every((tone) => tone.direct === 1));
  // The sun just down: the low cloud's belly warm from underneath; the high cloud still in full light, the low one hardly.
  const set = [0, 1, 2].map((layer) => cloudTones(layer, { sun: { azimuth: 250, altitude: -0.9 }, night: 0.43 }));
  assert.ok(set[2].base[0] > set[2].base[2] + 10 && set[0].base[0] > 240 && set[0].direct > set[1].direct && set[1].direct > set[2].direct);
  // Deep in the dusk the low and the middle have lost the sun and are slate; the high one keeps a last pink.
  const dusk = [0, 1, 2].map((layer) => cloudTones(layer, { sun: { azimuth: 250, altitude: -3 }, night: 0.67 }));
  assert.ok(dusk[2].direct === 0 && dusk[2].base[2] > dusk[2].base[0] && Math.max(...dusk[2].base) < 110 && dusk[0].direct > 0 && dusk[0].base[0] > dusk[0].base[2]);
  // By night: dark, the low one with the city's light on its belly (so lighter underneath than at its edge), the high one hardly lit at all.
  const night = [0, 1, 2].map((layer) => cloudTones(layer, { sun: { azimuth: 300, altitude: -30 }, night: 1 }));
  assert.ok(Math.max(...night[2].base) < 75 && night[2].base[0] > night[2].rim[0] + 10 && night[2].base[0] > night[2].base[2] - 2 && Math.max(...night[0].base) < 40);
  // A moon lights its edges a little.
  const moonlit = cloudTones(2, { sun: { azimuth: 300, altitude: -30 }, night: 1, moon: { altitude: 50, lit: 1 } });
  assert.ok(moonlit.rim[2] > night[2].rim[2] + 20);
  // Under a sky full of cloud the low sun does not get in: the same cloud at sunset is greyer and darker.
  const covered = cloudTones(2, { sun: { azimuth: 250, altitude: -0.9 }, night: 0.43, cover: 0.9 });
  assert.ok(covered.direct < set[2].direct * 0.3 && covered.base[0] < set[2].base[0] - 40 && covered.base[0] - covered.base[2] < set[2].base[0] - set[2].base[2]);
  // The sun's own light: white high up, gold low down, red at the horizon; and how much of it gets between the clouds.
  assert.deepEqual(sunlightAt(40), [255, 250, 240]);
  assert.ok(sunlightAt(3)[2] < 160 && sunlightAt(0)[1] < 160 && sunlightAt(-5)[0] < 240);
  assert.equal(sunBetween({}), 1);
  assert.ok(sunBetween({ low: 1 }) < 0.1 && sunBetween({ high: 1 }) > 0.6 && sunBetween({ low: 0.5, mid: 0.5 }) < sunBetween({ low: 0.5 }));
});

test('a cloud is drawn where it is, level at its own height, and as much lower as the Earth curves away under it', () => {
  const eye = [0, 0, 100];
  const sun = { azimuth: 180, altitude: 50 };
  const meshes = layers();
  // A low cloud 12 km to the north with little of the sky covered; a high one 60 km to the east.
  const low = { layer: 2, x: 0, y: 12000, z: 2000, radius: 1500, turn: 30, seed: 7, cover: 0.2 };
  const high = { layer: 0, x: 60000, y: 0, z: 10000, radius: 6000, turn: 0, seed: 11, cover: 0.2 };
  const made = drawClouds(meshes, { eye, sun, night: 0, clouds: [low, high] });
  assert.deepEqual(made, { clouds: 2, patches: 4 + 3 }, 'the near one in four patches; the far, high one in three streaks');
  assert.ok(meshes[0].count > 0 && meshes[1].count === 0 && meshes[2].count > 0, 'each in its own layer\'s mesh');
  // The low cloud: every corner within its own width of its middle; level at its base, less what the Earth has curved away
  // (ten metres at twelve kilometres), but for the heaps that stand on it.
  const near12 = corners(meshes[2]);
  assert.ok(near12.every((corner) => Math.hypot(corner[0] - low.x, corner[1] - low.y) < low.radius * 2.2));
  // (Its four patches come first: each ten pieces round a thick middle, nine corners to a piece. Then its heaps.)
  const [level, heaps] = [near12.slice(0, 4 * 90), near12.slice(4 * 90)];
  assert.ok(level.every((corner) => near(corner[2], low.z - (corner[0] ** 2 + corner[1] ** 2) / (2 * 7.4e6), 0.05)), 'level, and sunk by the curve of the Earth');
  assert.ok(level.every((corner) => corner[2] > low.z - 16 && corner[2] < low.z - 5));
  assert.ok(heaps.length > 20 && heaps.some((corner) => corner[2] > low.z + 150) && Math.max(...heaps.map((corner) => corner[2])) < low.z + low.radius, 'by day, with little cloud about, it is heaped up over its base');
  // What comes with each corner is how thick the cloud is there: full in its middle, nothing at its rim.
  assert.ok(near12.some((corner) => corner[6] === 255) && near12.some((corner) => corner[6] === 0));
  // By day: no darker than a light grey anywhere, and white where it is heaped.
  const thick = near12.filter((corner) => corner[6] === 255);
  assert.ok(thick.every((corner) => corner[3] > 150 && corner[5] >= corner[3] - 4) && thick.some((corner) => corner[3] > 235));
  // The high one: thin (never as thick as a low cloud), long along the wind (which here blows to the south-east), and sunk 243 m.
  const streaks = corners(meshes[0]);
  assert.ok(Math.max(...streaks.map((corner) => corner[6])) < 200 && Math.max(...streaks.map((corner) => corner[6])) > 150);
  const middle = streaks.filter((corner) => corner[6] > 150);
  assert.ok(middle.every((corner) => near(corner[2], high.z - (corner[0] ** 2 + corner[1] ** 2) / (2 * 7.4e6), 0.5) && corner[2] < high.z - 200));
  const [east, north] = [streaks.map((corner) => corner[0] - high.x), streaks.map((corner) => corner[1] - high.y)];
  const along = Math.max(...streaks.map((corner, i) => Math.abs(east[i] - north[i]) * Math.SQRT1_2));
  const across = Math.max(...streaks.map((corner, i) => Math.abs(east[i] + north[i]) * Math.SQRT1_2));
  assert.ok(along > across * 1.5 && along > 6000, `${along} along, ${across} across`);

  // Where most of the sky is covered the low cloud lies flat: no heaps. Nor by night.
  drawClouds(meshes, { eye, sun, night: 0, clouds: [{ ...low, cover: 0.9 }] });
  assert.ok(meshes[2].count === 4 * 90 && corners(meshes[2]).every((corner) => corner[2] < low.z));
  drawClouds(meshes, { eye, sun: { azimuth: 300, altitude: -30 }, night: 1, clouds: [low] });
  const dark = corners(meshes[2]);
  assert.ok(Math.max(...dark.map((corner) => corner[2])) < low.z + low.radius * 0.25 && dark.filter((corner) => corner[6] === 255).every((corner) => corner[3] < 80));
  // One too far off stands under the horizon, and is not drawn; nor is one below the eye.
  assert.deepEqual(drawClouds(meshes, { eye, sun, night: 0, clouds: [{ ...low, y: 200000 }, { ...low, z: 50 }] }), { clouds: 0, patches: 0 });
  assert.ok(meshes.every((mesh) => mesh.count === 0));
  // Far off it is drawn in one patch, and takes the colour of the sky at the horizon.
  drawClouds(meshes, { eye, sun, night: 0, horizon: '#ff0000', clouds: [{ ...low, y: 50000, cover: 0.9 }] });
  const hazy = corners(meshes[2]).filter((corner) => corner[6] === 255);
  assert.ok(hazy.length > 0 && hazy.every((corner) => corner[3] > corner[4] + 20), 'reddened by a red horizon');
  assert.equal(drawClouds(meshes, { eye, sun, night: 0, clouds: [{ ...low, y: 50000, cover: 0.9 }] }).patches, 1);
  // The furthest is put down first, so that the nearer lies over it.
  drawClouds(meshes, { eye, sun, night: 0, clouds: [{ ...low, cover: 0.9 }, { ...low, y: 30000, cover: 0.9, seed: 9 }] });
  const order = corners(meshes[2]);
  assert.ok(Math.hypot(order[0][0], order[0][1]) > 25000 && Math.hypot(order.at(-1)[0], order.at(-1)[1]) < 16000);
  // One layer can be drawn alone: the others are left as they were.
  drawClouds(meshes, { eye, sun, night: 0, clouds: [low, high] });
  const [had, kept] = [meshes[0].count, meshes[2].count];
  assert.deepEqual(drawClouds(meshes, { eye, sun, night: 0, clouds: [low, high, { ...high, y: 9000, seed: 3 }], only: 0 }), { clouds: 2, patches: 6 });
  assert.ok(meshes[0].count > had && meshes[2].count === kept);
  // A sky full of them is drawn with no more patches than a phone can take.
  const full = cloudsNear([0, 0], { low: 0.9, mid: 0.9, high: 0.9, seconds: 0 });
  const heavy = drawClouds(meshes, { eye, sun, night: 0, clouds: full });
  assert.ok(full.length > 1000 && heavy.clouds > 1000 && heavy.patches <= 2400 * 1.25, JSON.stringify(heavy));
});

test('the sun, the colours of its going down and the moon are drawn on a bowl round the eye, never under the horizon', () => {
  const eye = [120, -340, 95];
  // By day, the sun 30 degrees up in the south-east: its disc, and the glare round it. No colours of dusk, no moon.
  const day = heavens();
  assert.deepEqual(drawHeavens(day, { eye, sun: { azimuth: 130, altitude: 30 }, night: 0 }), { sun: true, moon: false });
  assert.ok(day.disc.count > 0 && day.glow.count > 0 && day.wash.count === 0 && day.face.count === 0);
  const sunWay = directionOf(130, 30);
  const brightest = corners(day.disc).filter((corner) => corner[3] > 200);
  assert.ok(brightest.length > 0 && brightest.every((corner) => near(far(corner, eye), SKY_RADIUS, SKY_RADIUS * 1e-4) && degreesApart(wayTo(corner, eye), sunWay) < 0.01), 'in the sun\'s direction, on the bowl');
  assert.ok(corners(day.disc).every((corner) => degreesApart(wayTo(corner, eye), sunWay) < 0.8) && corners(day.glow).every((corner) => degreesApart(wayTo(corner, eye), sunWay) < 7.1));
  assert.ok([...corners(day.disc), ...corners(day.glow)].every((corner) => corner[6] === 0), 'light: it is added to the sky, and covers nothing');
  // Behind cloud its disc is dimmer.
  const clouded = heavens();
  drawHeavens(clouded, { eye, sun: { azimuth: 130, altitude: 30 }, night: 0, cover: { low: 0.8 } });
  assert.ok(Math.max(...corners(clouded.disc).map((corner) => corner[3])) < 100);

  // Just set: its disc is half under the horizon, and nothing of it is drawn there; it is red.
  const set = heavens();
  const sun = { azimuth: 250, altitude: -0.3 };
  assert.equal(drawHeavens(set, { eye, sun, night: 0.37 }).sun, true);
  const everything = [...corners(set.disc), ...corners(set.glow), ...corners(set.wash)];
  assert.ok(everything.length > 500 && everything.every((corner) => corner[2] >= eye[2] - 1), 'nothing under the horizon');
  assert.ok(corners(set.disc).filter((corner) => corner[3] > 100).every((corner) => corner[5] < corner[3] * 0.55), 'red');
  // The glow where it has gone down: strongest low on the sun's own side, orange; none opposite.
  const lit = corners(set.glow).map((corner) => ({ corner, way: wayTo(corner, eye) }));
  // (Looked for to either side of the sun, clear of the glare round it.)
  const towards = lit.filter(({ way }) => way[2] < Math.sin((2.5 * Math.PI) / 180) && degreesApart(way, directionOf(250, 1)) > 8 && degreesApart(way, directionOf(250, 1)) < 28);
  const overhead = lit.filter(({ way }) => way[2] > Math.sin((22 * Math.PI) / 180));
  assert.ok(towards.length > 0 && towards.every(({ corner }) => corner[3] > 100 && corner[3] > corner[5] * 1.5) && overhead.every(({ corner }) => corner[3] < 60));
  // Opposite the sun: the shadow of the Earth, grey-blue, low on the horizon, with a band of pink light over it.
  const shade = corners(set.wash).map((corner) => ({ corner, way: wayTo(corner, eye) }));
  const away = shade.filter(({ way }) => degreesApart(way, directionOf(70, 0)) < 20 && way[2] < 0.05);
  const sunward = shade.filter(({ way }) => degreesApart(way, directionOf(250, 0)) < 60);
  assert.ok(away.some(({ corner }) => corner[6] > 60 && corner[5] > corner[3]) && sunward.every(({ corner }) => corner[6] === 0));
  const pink = lit.filter(({ way }) => degreesApart(way, directionOf(70, 9)) < 7);
  assert.ok(pink.some(({ corner }) => corner[3] > 20 && corner[3] > corner[4]));
  // Well down: no disc, but the glow stays a while. By night: nothing at all.
  const later = heavens();
  assert.equal(drawHeavens(later, { eye, sun: { azimuth: 250, altitude: -5 }, night: 0.9 }).sun, false);
  assert.ok(later.disc.count === 0 && corners(later.glow).some((corner) => corner[3] > 30));
  const night = heavens();
  assert.deepEqual(drawHeavens(night, { eye, sun: { azimuth: 250, altitude: -20 }, night: 1 }), { sun: false, moon: false });
  assert.ok(night.glow.count === 0 && night.wash.count === 0 && night.disc.count === 0);

  // The moon: half its face, the lit half towards where the sun is. (A half moon stands a quarter of the sky from
  // the sun: here the sun is down in the south-south-west.)
  const moon = { azimuth: 100, altitude: 40, lit: 0.5, waxing: true };
  const down = { azimuth: 200, altitude: -35 };
  const half = heavens();
  assert.equal(drawHeavens(half, { eye, sun: down, night: 1, moon }).moon, true);
  const face = corners(half.face);
  const middle = directionOf(100, 40);
  const wide = 0.27 * 1.7;
  assert.ok(face.length > 0 && face.every((corner) => degreesApart(wayTo(corner, eye), middle) <= wide * 1.01 && corner[6] === 255));
  const downWay = directionOf(down.azimuth, down.altitude);
  const side = (corner) => { const way = wayTo(corner, eye); return (way[0] - middle[0]) * downWay[0] + (way[1] - middle[1]) * downWay[1] + (way[2] - middle[2]) * downWay[2]; };
  assert.ok(face.reduce((sum, corner) => sum + side(corner), 0) > 0 && face.every((corner) => side(corner) > -1e-4), 'the lit side looks towards the sun');
  // A full moon is a whole disc; by day it is a pale shape; under the horizon there is none.
  const full = heavens();
  drawHeavens(full, { eye, sun: down, night: 1, moon: { ...moon, lit: 1 } });
  assert.ok(corners(full.face).some((corner) => side(corner) < -Math.sin((wide * 0.5 * Math.PI) / 180)), 'the far side is lit too');
  assert.ok(corners(full.glow).length > 0, 'and it has a shine round it');
  const pale = heavens();
  assert.equal(drawHeavens(pale, { eye, sun: { azimuth: 130, altitude: 30 }, night: 0, moon }).moon, true);
  assert.ok(corners(pale.face).every((corner) => corner[6] > 60 && corner[6] < 110));
  assert.equal(drawHeavens(heavens(), { eye, sun: down, night: 1, moon: { ...moon, altitude: -3 } }).moon, false);
});

test('the planets and the stars come out one by one as it darkens, the brightest first, and twinkle', () => {
  const eye = [50, 60, 80];
  const stars = starsAt(NIGHT, ...RIYADH);
  const venus = { name: 'Venus', azimuth: 240, altitude: 20, magnitude: -4.4, colour: [255, 250, 234] };
  const jupiter = { name: 'Jupiter', azimuth: 100, altitude: 30, magnitude: -2.5, colour: [255, 240, 214] };
  const set = { name: 'Mars', azimuth: 280, altitude: -5, magnitude: 0.5, colour: [255, 176, 122] };
  // By day: none. With the sun just down: Venus alone. A little later Jupiter too; then the brightest stars; by night all of them.
  assert.deepEqual(starPoints({ eye, night: 0.1, stars, planets: [venus, jupiter, set] }), []);
  assert.deepEqual(starPoints({ eye, night: 0.42, stars, planets: [venus, jupiter, set] }).map((point) => point.planet), ['Venus']);
  const dusk = starPoints({ eye, night: 0.56, stars, planets: [venus, jupiter, set] });
  assert.deepEqual(dusk.filter((point) => point.planet).map((point) => point.planet), ['Venus', 'Jupiter']);
  assert.ok(dusk.length < 6);
  const some = starPoints({ eye, night: 0.75, stars, planets: [venus, jupiter, set] });
  const all = starPoints({ eye, night: 1, stars, planets: [venus, jupiter, set] });
  assert.ok(some.length > dusk.length && all.length > some.length && all.length > stars.length * 0.85 && all.length <= stars.length + 2, `${dusk.length}, ${some.length}, ${all.length}`);
  // Each on the bowl, in its own direction; Venus the strongest and the widest, with a halo round it.
  assert.ok(all.every((point) => near(far([point.x, point.y, point.z], eye), SKY_RADIUS, SKY_RADIUS * 1e-4) && point.strength > 0 && point.strength <= 1 && point.wide >= 0.08 && point.wide <= 0.5));
  assert.ok(degreesApart(wayTo([all[0].x, all[0].y, all[0].z], eye), directionOf(240, 20)) < 0.01);
  assert.ok(all[0].strength === 1 && all[0].wide === 0.5 && all[0].halo === 1 && all[1].halo > 0 && all.slice(2).every((point) => point.halo === 0));
  // A star low over the city is put out by its glow; a faint one is drawn faint.
  const low = starPoints({ eye, night: 1, stars: [{ azimuth: 10, altitude: 0.8, magnitude: 0, colour: [255, 255, 255] }, { azimuth: 10, altitude: 30, magnitude: 3.9, colour: [255, 255, 255] }] });
  assert.ok(low.length === 1 && low[0].strength < 0.25);
  // Drawn as points of light: each star once, the brightest planets twice (the halo, then the point); a star twinkles, a planet hardly.
  const lights = new Mesh();
  assert.equal(drawStars(lights, all, 100), all.length);
  assert.equal(lights.count, all.length + 2);
  const first = corners(lights);
  drawStars(lights, all, 100.4);
  const second = corners(lights);
  const changed = first.filter((corner, i) => Math.abs(corner[4] - second[i][4]) > 2).length;
  assert.ok(changed > all.length * 0.3 && first[1][4] > 240 && Math.abs(first[1][4] - second[1][4]) <= 25, `${changed} of ${all.length} twinkled`);
  assert.ok(first.every((corner, i) => corner[0] === second[i][0] && corner[2] === second[i][2]), 'none moves');
  // (The halo is wide and faint; the point within it is as wide as the brightest star is drawn.)
  assert.ok(first[0][6] === 255 && first[0][4] < 90 && first[1][6] === Math.floor(255 * 0.5));
  assert.equal(drawStars(lights, [], 100), 0);
  assert.equal(lights.count, 0);
});

test('an aircraft is drawn where it is, nose to its course, in its airline\'s colours, large enough to be seen; its trail and its lamps', () => {
  const eye = [0, 0, 100];
  const origin = { lng: 46.68, lat: 24.71 };
  const [mesh, lights] = [new Mesh(), new Mesh()];
  const metres = 111320;
  const sun = { azimuth: 180, altitude: 50 };
  // Twenty kilometres to the north, three kilometres up, flying east.
  const plane = { id: 'in1', kind: 'typical', phase: 'landing', lng: 46.68, lat: 24.71 + 20000 / metres, alt: 3000, track: 90, speed: 110, climb: -4, wide: false, tail: [22, 110, 84], body: [238, 232, 216] };
  assert.equal(drawAircraft(mesh, lights, { eye, origin, planes: [plane], night: 0, sun }), 1);
  assert.equal(lights.count, 0, 'no lamps by day, when it does not fly towards the eye');
  const all = corners(mesh);
  // Where it is (27 m lower, for the curve of the Earth), and larger than life: as long as it would look from 1750 m.
  const middle = [0, 20000, 3000 - 20000 ** 2 / (2 * 7.4e6)];
  const long = 38 * (Math.hypot(20000, middle[2] - 100) / 1750);
  assert.ok(long > 400 && long < 450);
  assert.ok(all.every((corner) => far(corner, middle) <= long * 0.72 + 1), 'all of it within its own length of its middle');
  const ahead = all.map((corner) => corner[0] - middle[0]);
  assert.ok(near(Math.max(...ahead), long * 0.5, 2) && near(Math.min(...ahead), -long * 0.5, 2), 'nose to the east, tail to the west');
  assert.ok(near(Math.max(...all.map((corner) => corner[1])) - Math.min(...all.map((corner) => corner[1])), long * 0.94, 2), 'wing tip to wing tip');
  // Its fin is its airline's green; its body the cream of its paint.
  assert.ok(all.some((corner) => corner[3] === 22 && corner[4] === 110 && corner[5] === 84) && all.some((corner) => corner[3] === 238 && corner[4] === 232 && corner[5] === 216));
  // One that is near is life size. A wide one is longer. One far beyond forty-five kilometres dwindles.
  drawAircraft(mesh, lights, { eye, origin, planes: [{ ...plane, lat: 24.71 + 1200 / metres, alt: 600 }], night: 0, sun });
  assert.ok(corners(mesh).every((corner) => far(corner, [0, 1200, 600]) <= 38 * 0.72 + 0.5));
  drawAircraft(mesh, lights, { eye, origin, planes: [{ ...plane, wide: true }], night: 0, sun });
  assert.ok(near(Math.max(...corners(mesh).map((corner) => corner[0])), (64 / 38) * long * 0.5, 3));
  drawAircraft(mesh, lights, { eye, origin, planes: [{ ...plane, lat: 24.71 + 120000 / metres, alt: 9000 }], night: 0, sun });
  const looks = (Math.max(...corners(mesh).map((corner) => corner[0])) * 2) / 120000;
  assert.ok(looks < (38 / 1750) * 0.6 && looks > (38 / 1750) * 0.4, 'smaller to the eye than a near one, but not a speck');
  // One below the horizon, or two hundred kilometres off, is not drawn.
  assert.equal(drawAircraft(mesh, lights, { eye, origin, planes: [{ ...plane, alt: 20 }, { ...plane, lat: 24.71 + 200000 / metres, alt: 11000 }], night: 0, sun }), 0);
  assert.equal(mesh.count, 0);

  // One flying high leaves a trail behind it, level, kilometres long, widening and thinning; a low one leaves none.
  const cruise = { ...plane, phase: 'cruise', alt: 11000, climb: 0 };
  drawAircraft(mesh, lights, { eye, origin, planes: [cruise], night: 0, sun });
  const trail = corners(mesh).filter((corner) => corner[0] < -2000);
  assert.ok(trail.length > 0 && Math.min(...trail.map((corner) => corner[0])) < -9000 && Math.min(...trail.map((corner) => corner[0])) > -11000);
  assert.ok(trail.every((corner) => near(corner[2], trail[0][2], 0.5) && corner[6] < 180) && trail.some((corner) => corner[6] === 0) && trail.some((corner) => corner[6] > 60));
  // (Where there is high cloud the air up there is damp, and the trail lasts three times as long.)
  drawAircraft(mesh, lights, { eye, origin, planes: [cruise], night: 0, sun, cover: { high: 1 } });
  assert.ok(Math.min(...corners(mesh).map((corner) => corner[0])) < -25000);
  // Above a sky covered with cloud it is not seen at all; under it, it is.
  assert.equal(drawAircraft(mesh, lights, { eye, origin, planes: [cruise], night: 0, sun, cover: { low: 1 } }), 0);
  assert.equal(drawAircraft(mesh, lights, { eye, origin, planes: [{ ...plane, alt: 1200 }], night: 0, sun, cover: { low: 1 } }), 1);

  // By night: a dark shape, with red on its left wing tip, green on its right, white at its tail.
  drawAircraft(mesh, lights, { eye, origin, planes: [plane], night: 1, sun: { azimuth: 300, altitude: -30 }, seconds: 0.3 });
  assert.ok(corners(mesh).every((corner) => Math.max(corner[3], corner[4], corner[5]) < 60));
  // (And, low as it is, its landing lamps: seen from the side, only a faint light.)
  const lamps = corners(lights);
  assert.equal(lamps.length, 4);
  const [landing, red, green, white] = lamps;
  assert.ok(landing[3] > 40 && landing[3] < 110);
  // (Flying east, its left wing is to the north.)
  assert.ok(red[3] > 200 && red[4] < 80 && red[1] > middle[1] + long * 0.4 && green[4] > 200 && green[3] < 80 && green[1] < middle[1] - long * 0.4);
  assert.ok(white[3] > 150 && white[4] > 150 && near(white[0], middle[0] - long * 0.5, 2));
  assert.ok([red, green, white].every((corner) => corner[6] === 0), 'each a point of light, as wide as the faintest star');
  // The red lamp on its roof flashes once a second; the white ones on its wings twice, a little later.
  const count = (seconds) => { drawAircraft(mesh, lights, { eye, origin, planes: [plane], night: 1, seconds: seconds - 'in1'.length * 0.37 }); return lights.count; };
  assert.deepEqual([count(0.05), count(0.3), count(0.53), count(0.59), count(0.65), count(0.9)], [5, 4, 6, 4, 6, 4]);
  // Coming in towards the eye, its landing lamps: the brightest thing in the sky, with a glare round them; and they show by day too.
  const coming = { ...plane, track: 180, alt: 1500 };
  drawAircraft(mesh, lights, { eye, origin, planes: [coming], night: 1, seconds: 0.3 - 'in1'.length * 0.37 });
  const bright = corners(lights);
  assert.equal(bright.length, 4);
  assert.ok(bright[0][3] === 255 && bright[0][6] > 80 && corners(mesh).some((corner) => corner[6] === 0 && corner[3] > 200), 'a wide point, and a glare of light in the mesh');
  assert.equal(drawAircraft(mesh, lights, { eye, origin, planes: [coming], night: 0, sun }), 1);
  assert.equal(lights.count, 1);
  // One that is cruising high shows none.
  drawAircraft(mesh, lights, { eye, origin, planes: [{ ...cruise, track: 180 }], night: 1, seconds: 0.3 - 'in1'.length * 0.37 });
  assert.equal(lights.count, 3);
});

test('the sky is as it stands this minute over Riyadh: stars, moon and planets agree with an astronomy library to a fraction of a degree', () => {
  // Where astropy (with the IAU's precession and nutation, and the Moon's position from its built-in ephemeris) puts them,
  // seen from Riyadh (46.6753 E, 24.7136 N) at 22:00 on 25 November 2026, without the bending of light near the horizon.
  const [lng, lat] = [46.6753, 24.7136];
  const date = new Date('2026-11-25T19:00:00Z');
  const apart = (place, azimuth, altitude) => degreesApart(directionOf(place.azimuth, place.altitude), directionOf(azimuth, altitude));
  const star = (k) => horizontal(...precessed(STARS[k][0], STARS[k][1], date), date, lng, lat);
  assert.ok(apart(star(0), 116.31, 14.17) < 0.05, 'Sirius');
  // (Without the slow swing of the Earth's axis since 2000, Sirius would be off by a third of a degree.)
  assert.ok(apart(horizontal(STARS[0][0], STARS[0][1], date, lng, lat), 116.31, 14.17) > 0.2);
  const polaris = STARS.findIndex(([ra, dec]) => near(ra, 2.53, 0.002) && near(dec, 89.26, 0.02));
  assert.ok(apart(star(polaris), 0.13, 25.33) < 0.05, 'Polaris');
  // And as of 2000 it is where the catalogue has it; it has moved by a third of a degree since.
  assert.deepEqual(precessed(6.752, -16.72, new Date('2000-01-01T12:00:00Z')).map((x) => Math.round(x * 1000) / 1000), [6.752, -16.72]);
  const [ra, dec] = precessed(6.752, -16.72, date);
  assert.ok(near(ra, 6.77, 0.01) && near(dec, -16.75, 0.02), `${ra}, ${dec}`);
  // The moon: a day after full, high in the east; as seen from Riyadh, not from the middle of the Earth.
  const moon = moonAt(date, lng, lat);
  assert.ok(apart(moon, 76.22, 51.42) < 0.25 && near(moon.lit, 0.978, 0.005) && !moon.waxing, JSON.stringify(moon));
  assert.ok(apart(moonAt(new Date('2026-11-26T01:30:00Z'), lng, lat), 285.28, 43.9) < 0.25);
  assert.ok(apart(moonAt(new Date('2027-01-15T16:00:00Z'), lng, lat), 245.21, 65.82) < 0.25);
  // Jupiter, rising before dawn: within a fifth of a degree.
  const jupiter = planetsAt(new Date('2026-11-26T01:30:00Z'), lng, lat).find((one) => one.name === 'Jupiter');
  assert.ok(apart(jupiter, 126.16, 71.98) < 0.2, JSON.stringify(jupiter));
});

test('by night the stars show as they would to the eye from the city: a full moon puts the fainter out, the brightest have their names', () => {
  const [lng, lat] = [46.6753, 24.7136];
  const date = new Date('2026-11-25T19:00:00Z');
  const stars = starsAt(date, lng, lat);
  const planets = planetsAt(date, lng, lat);
  const eye = [0, 0, 0];
  // Fifty-eight of the brightest have names; Sirius is one, and those that are up carry theirs.
  assert.equal(NAMED_STARS, 58);
  assert.equal(stars.find((one) => one.magnitude === -1.44).name, 'Sirius');
  assert.ok(stars.filter((one) => one.name).length > 20);
  // On a moonless night, nearly every star of the catalogue that is up; with a full moon high in the sky, a third as many.
  const dark = starPoints({ eye, night: 1, stars, planets, moon: { altitude: -20, lit: 0 } });
  const moonlit = starPoints({ eye, night: 1, stars, planets, moon: moonAt(date, lng, lat) });
  assert.ok(dark.length > stars.length * 0.85 && moonlit.length < dark.length * 0.45 && moonlit.length > 40, `${dark.length}, ${moonlit.length}`);
  // (A new moon, or one under the horizon, puts out none.)
  assert.equal(starPoints({ eye, night: 1, stars, planets, moon: { altitude: 50, lit: 0 } }).length, dark.length);
  // What shows is at least a dot a phone shows: none is drawn narrower than the faintest point, and the brightest are wider.
  assert.ok(moonlit.every((point) => point.wide >= 0.08));
  const mean = (some) => some.reduce((sum, point) => sum + point.strength, 0) / some.length;
  assert.ok(mean(moonlit.filter((point) => point.magnitude < 1.5)) > 0.6 && mean(moonlit.filter((point) => point.magnitude > 2.5)) < 0.35);
  const sirius = moonlit.find((point) => point.name === 'Sirius');
  assert.ok(sirius && sirius.wide > 0.45 && sirius.strength > 0.9);
  // In words, for the info sheet: tonight Sirius and Rigel in the south-east, Capella in the north-east; Saturn in the south-west.
  const words = skyTonight(moonlit);
  assert.equal(words.stars, moonlit.filter((point) => !point.planet).length);
  assert.deepEqual(words.brightest, ['Sirius (south-east)', 'Capella (north-east)', 'Rigel (south-east)']);
  assert.deepEqual(words.planets, ['Saturn (south-west)']);
  assert.deepEqual([0, 44, 46, 91, 180, 270, 337, 338, 359].map(compassPoint), ['north', 'north-east', 'north-east', 'east', 'south', 'west', 'north-west', 'north', 'north']);
});

test('the clouds are laid where the weather service has them, place by place round the city, and each layer drifts on the wind at its own height', () => {
  // The service's answer for a grid of 2 by 2: clear in the south-west, overcast with low cloud in the north-east.
  const lats = [24.5, 24.85];
  const lngs = [46.55, 46.9];
  const point = (low, mid, high, hourly) => ({ latitude: 0, longitude: 0, current: { time: '2026-11-25T09:15', interval: 900, cloud_cover_low: low, cloud_cover_mid: mid, cloud_cover_high: high }, ...(hourly ? { hourly } : {}) });
  const hourly = {
    time: ['2026-11-25T08:00', '2026-11-25T09:00', '2026-11-25T10:00'],
    wind_speed_250hPa: [40, 42, 44], wind_direction_250hPa: [270, 275, 280],
    wind_speed_500hPa: [20, 21, 22], wind_direction_500hPa: [300, 305, 310],
    wind_speed_700hPa: [8, 9, 10], wind_direction_700hPa: [330, 335, 340],
  };
  const answer = [point(0, 0, 0), point(0, 10, 40), point(20, 20, 60, hourly), point(100, 60, 80)];
  const now = Date.parse('2026-11-25T09:20:00Z');
  const field = cloudField(answer, lats, lngs, now);
  assert.equal(field.at, Date.parse('2026-11-25T09:15:00Z'));
  assert.deepEqual([field.low, field.mid, field.high], [[0, 0, 0.2, 1], [0, 0.1, 0.2, 0.6], [0, 0.4, 0.6, 0.8]]);
  // The winds aloft, at the hour nearest now, from the middle of the grid: the high layer on the jet stream, the low on a breeze.
  assert.deepEqual(field.aloft, [{ from: 275, speed: 42 }, { from: 305, speed: 21 }, { from: 335, speed: 9 }]);
  // An answer that does not fit the grid is no field; one without the winds aloft is one without them.
  assert.equal(cloudField(answer.slice(1), lats, lngs, now), null);
  assert.equal(cloudField([point(0, 0, 0), point(0, null, 0), point(0, 0, 0), point(0, 0, 0)], lats, lngs, now), null);
  assert.equal(cloudField(answer.map((one) => ({ ...one, hourly: undefined })), lats, lngs, now).aloft, null);
  // Between the readings the cover is read off the four round a place; beyond the grid, as at its edge.
  assert.deepEqual(fieldCover(field, 46.55, 24.5), { low: 0, mid: 0, high: 0 });
  assert.deepEqual(fieldCover(field, 46.9, 24.85), { low: 1, mid: 0.6, high: 0.8 });
  const middle = fieldCover(field, 46.725, 24.675);
  assert.ok(near(middle.low, 0.3, 1e-9) && near(middle.mid, 0.225, 1e-9) && near(middle.high, 0.45, 1e-9), JSON.stringify(middle));
  assert.deepEqual(fieldCover(field, 50, 30), fieldCover(field, 46.9, 24.85));
  assert.deepEqual([0, 1, 2].map((layer) => layerShare({ low: 0.1, mid: 0.2, high: 0.3 }, layer)), [0.3, 0.2, 0.1]);
  // Laid by the field: low cloud only where the field has it (the north-east), none over the clear south-west.
  const east = Math.cos((24.7 * Math.PI) / 180) * 111320;
  const coverAt = (layer, x, y) => layerShare(fieldCover(field, x / east, y / 111320), layer);
  const where = [46.725 * east, 24.675 * 111320];
  const clouds = cloudsNear(where, { low: 1, mid: 0.6, high: 0.8, seconds: 0, coverAt });
  const lowOnes = clouds.filter((cloud) => cloud.layer === 2);
  const at = (cloud) => fieldCover(field, cloud.x / east, cloud.y / 111320).low;
  assert.ok(lowOnes.length > 20 && lowOnes.every((cloud) => at(cloud) > 0.02 && cloud.cover === Math.min(at(cloud), 1)));
  // (More where there is more: the clouds stand where the cover is greater than it is on the average over the ground they could stand on.)
  let ground = 0;
  for (let k = 0; k < 4000; k += 1) {
    const [r, turn] = [Math.sqrt((k + 0.5) / 4000) * CLOUD_LAYERS[2].reach, k * 2.399963];
    ground += fieldCover(field, (where[0] + r * Math.sin(turn)) / east, (where[1] + r * Math.cos(turn)) / 111320).low / 4000;
  }
  const onClouds = lowOnes.reduce((sum, cloud) => sum + at(cloud), 0) / lowOnes.length;
  assert.ok(onClouds > ground * 1.15, `${onClouds} against ${ground}`);
  // (Where the low cloud is a whole deck, nothing is laid above it; elsewhere the higher layers are.)
  assert.ok(clouds.filter((cloud) => cloud.layer < 2).every((cloud) => at(cloud) < 0.97) && clouds.some((cloud) => cloud.layer === 0));
  // Each layer drifts on its own wind: the high one at 42 m/s from 275 degrees, not at four times the wind on the ground.
  const wind = { windFrom: 315, windSpeed: 4, aloft: field.aloft };
  assert.deepEqual(layerWind(0, wind), { from: 275, speed: 42 });
  assert.deepEqual(layerWind(2, { windFrom: 315, windSpeed: 4 }), { from: 315, speed: 8 });
  const drift = cloudDrift(0, wind, 100);
  assert.ok(near(Math.hypot(...drift), 4200, 1e-6) && drift[0] > 4100 && near(Math.atan2(drift[0], drift[1]) * 180 / Math.PI, 95, 1e-6), JSON.stringify(drift));
});
