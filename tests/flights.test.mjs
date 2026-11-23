import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AIRPORT, Flights, RUNWAY_BEARING, movementsInHour, parseOpenSky, parseReceivers, runwayHeading, typicalFlights } from '../js/flights.js';

const METERS = 111320;
const east = (lat) => METERS * Math.cos((lat * Math.PI) / 180);
const apart = (a, b) => Math.hypot((a[0] - b[0]) * east(a[1]), (a[1] - b[1]) * METERS);
const near = (a, b, by) => Math.abs(a - b) <= by;
/** How far a place lies along the line of the runways from a place on it (northwards), and how far to its right. */
const along = (place, from) => {
  const [dx, dy] = [(place[0] - from[0]) * east(from[1]), (place[1] - from[1]) * METERS];
  const way = (RUNWAY_BEARING * Math.PI) / 180;
  return [dx * Math.sin(way) + dy * Math.cos(way), dx * Math.cos(way) - dy * Math.sin(way)];
};
// A Sunday afternoon in November: five past five in Riyadh.
const T0 = Date.UTC(2026, 10, 22, 14, 5, 0) / 1000;

test('the airport: two runways side by side, 4.2 km long, in use into the wind; and as busy as it really is, hour by hour', () => {
  assert.equal(AIRPORT.runways.length, 2);
  for (const runway of AIRPORT.runways) assert.ok(near(apart(runway.south, runway.north), 4210, 20), runway.id);
  assert.ok(near(RUNWAY_BEARING, 330.2, 0.3), `${RUNWAY_BEARING}`);
  // (The two lie 3 km apart, the terminals between them.)
  assert.ok(near(Math.abs(along(AIRPORT.runways[1].south, AIRPORT.runways[0].south)[1]), 3000, 400));
  // With the north-westerly that prevails, and with no wind known: towards the north-west. With a wind out of the south-east: the other way.
  assert.ok(near(runwayHeading(320), 330.2, 0.3) && near(runwayHeading(undefined), 330.2, 0.3) && near(runwayHeading(20), 330.2, 0.3));
  assert.ok(near(runwayHeading(140), 150.2, 0.3) && near(runwayHeading(200), 150.2, 0.3));
  // 296,800 flights a year: 813 a day, fewest before dawn, most in the evening.
  const day = Array.from({ length: 24 }, (_, hour) => movementsInHour(hour));
  assert.ok(near(day.reduce((sum, count) => sum + count, 0), 296800 / 365, 0.01));
  assert.ok(Math.min(...day) === day[3] && day[3] < 15 && Math.max(...day) === day[19] && day[19] > 40);
  assert.equal(movementsInHour(27), movementsInHour(3));
});

test('the typical traffic is the same for the same moment, and there is as much of it as the hour has', () => {
  const now = typicalFlights(T0, { windFrom: 330 });
  assert.deepEqual(typicalFlights(T0, { windFrom: 330 }), now);
  assert.ok(now.length >= 3 && now.length <= 24, `${now.length}`);
  for (const plane of now) {
    assert.ok(plane.kind === 'typical' && ['landing', 'takeoff', 'cruise'].includes(plane.phase) && plane.callsign === undefined, 'typical: it has no flight number');
    assert.ok(apart([plane.lng, plane.lat], AIRPORT.at) < 130000 && plane.alt >= 0 && plane.alt <= 12500 && plane.track >= 0 && plane.track < 360 && plane.speed >= 0 && plane.speed <= 260);
    assert.ok(plane.tail.length === 3 && plane.body.length === 3 && typeof plane.wide === 'boolean');
  }
  // Over a day: at seven in the evening there are three times as many coming and going as at four in the morning.
  const count = (hour) => {
    let total = 0;
    // (Looked at every minute and a half of that hour, on each of eight days.)
    for (let day = 0; day < 8; day += 1) for (let k = 0; k < 40; k += 1) total += typicalFlights(Date.UTC(2026, 10, 14 + day, hour - 3, 0, 0) / 1000 + k * 89, {}).filter((plane) => plane.phase !== 'cruise').length;
    return total / 320;
  };
  const [evening, small] = [count(19), count(4)];
  assert.ok(evening > small * 2 && evening > 5 && evening < 11 && small > 1 && small < 4, `${evening} against ${small}`);
  // (An arrival is in sight for eleven minutes and a departure for nine: at 43 movements an hour, some seven aloft at once.)
});

test('an arrival comes down three degrees along the line of the runway, slows to 140 knots, and lands on it', () => {
  // One that is still far out, followed down every ten seconds.
  let first = null;
  let from = T0;
  for (let t = 0; t < 1800 && !first; t += 20) {
    first = typicalFlights(T0 + t, { windFrom: 330 }).find((plane) => plane.phase === 'landing' && plane.alt > 3000) ?? null;
    from = T0 + t;
  }
  assert.ok(first, 'one on its way in');
  const path = [];
  for (let t = 0; t < 800; t += 10) {
    const now = typicalFlights(from + t, { windFrom: 330 }).find((plane) => plane.id === first.id);
    if (!now) break;
    path.push({ t, ...now });
  }
  const last = path.at(-1);
  assert.ok(path.length > 30 && last.alt === 0, `${path.length} steps, ending at ${last.alt} m`);
  // Down all the way; never faster than 250 knots, slower and slower.
  for (let i = 1; i < path.length; i += 1) {
    assert.ok(path[i].alt <= path[i - 1].alt + 1e-6 && path[i].speed <= path[i - 1].speed + 1e-6 && path[i].speed <= 126);
    // (And no leaps: each step is as long as its speed makes it, or a little shorter where it rounds the corner onto the line of the runway.)
    const step = apart([path[i].lng, path[i].lat], [path[i - 1].lng, path[i - 1].lat]);
    const due = ((path[i].speed + path[i - 1].speed) / 2) * 10;
    assert.ok(step <= due + 90 && step >= due * 0.45, `step ${i}: ${step} m for ${due} m`);
  }
  // On the ground it is on one of the runways, rolling north-west.
  const runway = AIRPORT.runways.find((one) => Math.abs(along([last.lng, last.lat], one.south)[1]) < 30);
  assert.ok(runway, 'on a runway');
  const [run] = along([last.lng, last.lat], runway.south);
  assert.ok(run > 250 && run < 2300 && near(last.track, 330.2, 2), `${run} m along it`);
  // The last three minutes: on the line of that runway, three degrees up from where it touches down, at 140 to 165 knots.
  const down = path.findIndex((step) => step.alt === 0);
  for (const step of path.slice(down - 18, down - 1)) {
    const [out, aside] = along([step.lng, step.lat], runway.south);
    assert.ok(Math.abs(aside) < 40 && near(step.track, 330.2, 1.5), `${aside} m off the line`);
    assert.ok(near(step.alt, (300 - out) * Math.tan((3 * Math.PI) / 180), 12), `${step.alt} m at ${out} m`);
    assert.ok(step.speed >= 72 && step.speed <= 85 && near(step.climb, -step.speed * Math.tan((3 * Math.PI) / 180), 0.01));
  }
  // With the wind out of the south-east the runways are used the other way: it lands heading south-east, at their northern end.
  const other = typicalFlights(T0, { windFrom: 140 }).filter((plane) => plane.phase === 'landing' && plane.alt < 600 && plane.alt > 0);
  assert.ok(other.length > 0 && other.every((plane) => near(plane.track, 150.2, 2) && plane.lat > 24.96));
});

test('a departure runs along the runway, lifts off after half a minute, climbs straight ahead for nine kilometres and turns away', () => {
  // The first to start after the moment: found by looking a little later, and followed from its start.
  let id = null;
  let start = 0;
  for (let t = 0; t < 900 && !id; t += 5) {
    const found = typicalFlights(T0 + t, { windFrom: 330 }).find((plane) => plane.phase === 'takeoff' && plane.alt === 0 && plane.speed < 12);
    if (found) [id, start] = [found.id, T0 + t];
  }
  assert.ok(id, 'one beginning its run');
  const at = (t) => typicalFlights(start + t, { windFrom: 330 }).find((plane) => plane.id === id);
  const runway = AIRPORT.runways.find((one) => Math.abs(along([at(0).lng, at(0).lat], one.south)[1]) < 30);
  assert.ok(runway && along([at(0).lng, at(0).lat], runway.south)[0] < 60, 'at the southern end of a runway');
  // Twenty seconds on: still on the ground, faster. A minute on: in the air over the far end, heading 330.
  assert.ok(at(20).alt === 0 && at(20).speed > at(5).speed + 25);
  const up = at(60);
  assert.ok(up.alt > 200 && up.alt < 500 && near(up.track, 330.2, 2) && Math.abs(along([up.lng, up.lat], runway.south)[1]) < 40);
  // Three minutes on: past its turn, two kilometres up, on its way somewhere.
  const away = at(200);
  assert.ok(away.alt > 1900 && away.alt < 2400 && away.speed > 130 && along([away.lng, away.lat], runway.south)[0] > 8000);
  assert.ok(near(at(400).climb, 9, 0.01) && at(400).alt > at(200).alt + 1500);
  // Nine minutes after it began it is out of sight.
  assert.equal(at(570), undefined);
});

test('others only pass over: eleven kilometres up, straight and fast', () => {
  const seen = new Map();
  for (let t = 0; t < 7200; t += 60) for (const plane of typicalFlights(T0 + t, {}).filter((one) => one.phase === 'cruise')) seen.set(plane.id, [...(seen.get(plane.id) ?? []), plane]);
  assert.ok(seen.size >= 6 && seen.size <= 30, `${seen.size} in two hours`);
  for (const steps of seen.values()) {
    assert.ok(steps.every((step) => step.alt >= 10000 && step.alt <= 12000 && step.alt === steps[0].alt && step.track === steps[0].track && step.speed >= 228 && step.speed <= 252 && step.climb === 0));
    if (steps.length > 1) assert.ok(near(apart([steps[1].lng, steps[1].lat], [steps[0].lng, steps[0].lat]), steps[0].speed * 60, 250));
  }
});

test('live aircraft are read out of what the feeds answer', () => {
  // The OpenSky Network: one list to an aircraft. (The second has no place; the third is on the ground.)
  const sky = parseOpenSky({
    time: 1507203250,
    states: [
      ['c04049', 'SVA1023 ', 'Saudi Arabia', 1507203246, 1507203249, 46.73, 24.83, 1280.2, false, 82.5, 330.2, -4.2, null, 1310.6, '1000', false, 0],
      ['abc123', 'KNE55   ', 'Saudi Arabia', null, 1507203249, null, null, null, false, null, null, null, null, null, null, false, 0],
      ['710105', 'FAD301  ', 'Saudi Arabia', 1507203240, 1507203249, 46.7, 24.95, null, true, 6.1, 150, null, null, null, null, false, 0],
    ],
  });
  assert.deepEqual(sky, [
    { id: 'c04049', callsign: 'SVA1023', lng: 46.73, lat: 24.83, alt: 1310.6, ground: false, speed: 82.5, track: 330.2, climb: -4.2, seen: 1507203246 },
    { id: '710105', callsign: 'FAD301', lng: 46.7, lat: 24.95, alt: 0, ground: true, speed: 6.1, track: 150, climb: 0, seen: 1507203240 },
  ]);
  assert.deepEqual(parseOpenSky({ time: 1, states: null }), []);
  assert.deepEqual(parseOpenSky(null), []);
  // The receivers' networks: feet, knots, feet a minute; the time in thousandths of a second, or in seconds.
  const answer = {
    now: 1795465533501,
    ac: [
      { hex: '400982', flight: 'SHT9Q   ', r: 'G-EUUG', t: 'A320', lat: 51.479919, lon: -0.815586, alt_baro: 4075, alt_geom: 4400, gs: 195.1, track: 118.14, baro_rate: -768, seen_pos: 0.5 },
      { hex: '42592e', flight: 'SQB09   ', lat: 51.281147, lon: -0.773682, alt_baro: 'ground', gs: 0.0, seen_pos: 4.111 },
      { hex: 'nowhere', flight: 'X' },
    ],
  };
  const [air, ground] = parseReceivers(answer);
  assert.equal(parseReceivers(answer).length, 2);
  assert.ok(air.id === '400982' && air.callsign === 'SHT9Q' && air.type === 'A320' && !air.ground);
  assert.ok(near(air.alt, 4400 * 0.3048, 0.01) && near(air.speed, 195.1 * 0.514444, 0.01) && air.track === 118.14 && near(air.climb, (-768 * 0.3048) / 60, 0.001) && near(air.seen, 1795465533.001, 0.001));
  assert.ok(ground.ground && ground.alt === 0 && ground.speed === 0 && ground.climb === 0);
  const other = parseReceivers({ now: 1795465534.0, aircraft: [{ hex: '896219', flight: 'UAE1CL  ', t: 'B77W', lat: 25.594345, lon: 54.719187, alt_baro: 12750, gs: 273.5, track: 82.23, baro_rate: -768, seen_pos: 0.402 }] });
  assert.ok(other.length === 1 && other[0].callsign === 'UAE1CL' && near(other[0].alt, 12750 * 0.3048, 0.01) && near(other[0].seen, 1795465533.598, 0.001));
});

test('while live aircraft are known they are what is shown, each moved on from where it last was; otherwise the typical traffic', () => {
  const flights = new Flights();
  assert.equal(flights.at(T0, { windFrom: 330 }).kind, 'typical');
  assert.deepEqual(flights.at(T0, { windFrom: 330 }).planes, typicalFlights(T0, { windFrom: 330 }));
  flights.report(
    [
      { id: 'a1', callsign: 'SVA1023', type: 'B77W', lng: 46.73, lat: 24.83, alt: 1300, ground: false, speed: 80, track: 330, climb: -4, seen: T0 - 2 },
      { id: 'a2', callsign: 'KNE55', type: 'A320', lng: 46.5, lat: 24.6, alt: 9000, ground: false, speed: 220, track: 90, climb: 0, seen: T0 - 1 },
      { id: 'a3', callsign: 'FAD301', lng: 46.7, lat: 24.95, alt: 0, ground: true, speed: 6, track: 150, climb: 0, seen: T0 },
    ],
    T0,
    'The OpenSky Network',
  );
  const now = flights.at(T0 + 28);
  assert.ok(now.kind === 'live' && now.source === 'The OpenSky Network' && now.planes.length === 2, 'the one on the ground is left out');
  const [first, second] = now.planes;
  // Thirty seconds after it gave its place: 2.4 km further along its course, 120 m lower.
  assert.ok(first.kind === 'live' && first.callsign === 'SVA1023' && first.airline === 'Saudia' && first.wide && first.phase === 'landing');
  assert.ok(near(apart([first.lng, first.lat], [46.73, 24.83]), 2400, 5) && first.lat > 24.83 && first.lng < 46.73 && near(first.alt, 1180, 0.01));
  assert.ok(second.airline === 'flynas' && !second.wide && second.phase === 'cruise' && near(apart([second.lng, second.lat], [46.5, 24.6]), 220 * 29, 5) && near(second.lat, 24.6, 1e-6));
  // No report for two and a half minutes: nothing is known of them any more.
  assert.equal(flights.at(T0 + 100).kind, 'live');
  assert.equal(flights.at(T0 + 151).kind, 'typical');
  // An empty report: the typical traffic again.
  flights.report([], T0 + 200, 'The OpenSky Network');
  assert.equal(flights.at(T0 + 201).kind, 'typical');
});
