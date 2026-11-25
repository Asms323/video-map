// The aircraft in the sky over Riyadh.
//
// What is wanted is the real thing: every aircraft where it really is, at
// the time it is really there. That is what a live feed of aircraft
// positions gives, and where one answers, it is used: each aircraft is
// shown where it last reported itself, moved on by its own speed and course
// until the next report.
//
// But the free feeds that anyone may read are fed by volunteers' receivers,
// and over Riyadh there are none: they have nothing to say about its sky.
// So when no live aircraft are known, the sky is flown as King Khalid
// International Airport flies it: as many arrivals and departures an hour
// as the airport really has at that hour (296,800 flights in 2025), on its
// two real runways, in the direction the real wind of the moment has them
// in use, down the real three-degree approach and out along the usual
// climb. Those aircraft are typical, not particular: they carry no flight
// number, and the app says which of the two it is showing.
//
// Nothing here touches the browser. Places are [lng, lat]; heights are
// metres above the ground at the airport; times are seconds since 1970.

const METERS_PER_DEGREE = 111320;

/** King Khalid International Airport: its two runways, end to end, as the street map has them. */
export const AIRPORT = {
  name: 'King Khalid International Airport',
  at: [46.69883, 24.95751],
  runways: [
    { id: '15R/33L', south: [46.69567, 24.93809], north: [46.6749, 24.97096] },
    { id: '15L/33R', south: [46.72271, 24.94412], north: [46.70202, 24.97688] },
  ],
  flightsAYear: 296800, // in 2025, by the General Authority for Statistics
  // How high its ground lies above the sea: 625 m (2,049 ft). The feeds give an aircraft's height above the
  // sea; the scene has it above the ground, which in Riyadh lies about as high as the airport's.
  elevation: 625,
};

// How busy each hour of the day is, against the average hour: quiet before dawn, fullest in the evening.
// (The airport publishes no count by the hour: this is the shape its timetable has.)
const HOURLY = [0.9, 0.7, 0.5, 0.4, 0.4, 0.6, 0.9, 1.2, 1.3, 1.2, 1.1, 1.1, 1.1, 1.1, 1.1, 1.2, 1.2, 1.2, 1.3, 1.3, 1.3, 1.3, 1.2, 1.1];
const HOURLY_SUM = HOURLY.reduce((sum, weight) => sum + weight, 0);

/** How many aircraft land and take off in an hour of the day (0 to 23, by the clock in Riyadh), all told. */
export function movementsInHour(hour) {
  return ((AIRPORT.flightsAYear / 365) * HOURLY[((Math.floor(hour) % 24) + 24) % 24]) / HOURLY_SUM;
}

/** A number from 0 to 1 that is always the same for the same two whole numbers. */
function chance(a, b) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const RADIANS = Math.PI / 180;
const squeezeAt = (lat) => Math.cos(lat * RADIANS) * METERS_PER_DEGREE;
/** A place so many metres east and north of another. */
const offset = ([lng, lat], east, north) => [lng + east / squeezeAt(lat), lat + north / METERS_PER_DEGREE];
/** The compass bearing from one place to another, in degrees. */
const bearingTo = (from, to) => ((Math.atan2((to[0] - from[0]) * squeezeAt(from[1]), (to[1] - from[1]) * METERS_PER_DEGREE) / RADIANS) % 360 + 360) % 360;

/** The way the runways run, northwards: 330 degrees. (Southwards it is that and a half turn.) */
export const RUNWAY_BEARING = bearingTo(AIRPORT.runways[0].south, AIRPORT.runways[0].north);

/**
 * Which way the runways are in use: aircraft land and take off into the
 * wind. windFrom: where the wind comes from, in degrees; without it, as
 * with the north-westerly that prevails, towards the north-west.
 * Returns the heading, 330 or 150.
 */
export function runwayHeading(windFrom) {
  if (!Number.isFinite(windFrom)) return RUNWAY_BEARING;
  const into = Math.cos((windFrom - RUNWAY_BEARING) * RADIANS);
  return into >= 0 ? RUNWAY_BEARING : (RUNWAY_BEARING + 180) % 360;
}

// The approach: three degrees down the line of the runway from 18 km out, slowing to 72 m/s (140 knots)
// over the threshold; before that, 45 km in towards that line from whichever way the flight comes.
const GLIDE = Math.tan(3 * RADIANS);
const FINAL_METERS = 18000;
const FINAL_SPEEDS = [72, 85]; // over the threshold, and 18 km out
const FINAL_SECONDS = (2 * FINAL_METERS) / (FINAL_SPEEDS[0] + FINAL_SPEEDS[1]);
const LEG_METERS = 45000;
const LEG_SPEEDS = [85, 125];
const LEG_SECONDS = (2 * LEG_METERS) / (LEG_SPEEDS[0] + LEG_SPEEDS[1]);
const LEG_TOP_METERS = 3300; // how high a flight is where it comes into sight
const ROLL_SECONDS = 35; // on the runway, after landing and before taking off
const ARRIVAL_SECONDS = FINAL_SECONDS + LEG_SECONDS;
// From which side a flight joins the line of the runway: degrees off the line, as seen looking back along it.
const JOINS = [-100, -60, -30, 0, 30, 60, 100];
// The climb: along the runway for nine kilometres, then away towards wherever it is bound.
const STRAIGHT_METERS = 9000;
const DEPARTURE_SECONDS = 560;
const BOUND = [280, 110, 330, 200, 60, 250, 20]; // Jeddah, the Gulf, the north, the south-west, Kuwait…
// Those that only pass over: high, straight and fast.
const CROSSINGS = [305, 125, 20, 200, 80, 260];
const CROSSING_SECONDS = 300; // either side of its nearest
const SLOT_SECONDS = 75; // no two landings closer together than this (and they take the two runways by turns)
const CROSSING_SLOT_SECONDS = 240;
const RIYADH_HOURS_EAST = 3;

// The tails most often seen at Riyadh, and how much of the traffic each has.
const AIRLINES = [
  { name: 'Saudia', tail: [22, 110, 84], body: [238, 232, 216], share: 0.4 },
  { name: 'flynas', tail: [0, 150, 160], body: [246, 247, 248], share: 0.24 },
  { name: 'flyadeal', tail: [122, 56, 148], body: [247, 247, 247], share: 0.14 },
  { name: 'Riyadh Air', tail: [78, 62, 150], body: [202, 196, 226], share: 0.05 },
  { name: null, tail: [176, 28, 40], body: [245, 245, 245], share: 0.09 },
  { name: null, tail: [96, 20, 48], body: [232, 232, 234], share: 0.08 },
];
// A live aircraft's airline, told by the letters its call sign begins with.
const CALL_SIGNS = { SVA: 0, KNE: 1, XY: 1, FAD: 2, RXI: 3, UAE: 4, QTR: 5 };

function airlineFor(part) {
  let upTo = 0;
  for (const airline of AIRLINES) {
    upTo += airline.share;
    if (part < upTo) return airline;
  }
  return AIRLINES[0];
}

/** Where a landing aircraft is, so many seconds before it touches down (after it has: less than nothing). */
function arrivalAt(before, slot, heading) {
  const runway = AIRPORT.runways[Math.abs(slot) % 2];
  const threshold = heading === RUNWAY_BEARING ? runway.south : runway.north;
  const along = [Math.sin(heading * RADIANS), Math.cos(heading * RADIANS)];
  if (before <= 0) {
    // On the runway: slowing down.
    const t = Math.min(-before, ROLL_SECONDS);
    const run = FINAL_SPEEDS[0] * t - (FINAL_SPEEDS[0] / (2 * ROLL_SECONDS)) * t * t;
    return { at: offset(threshold, along[0] * (300 + run), along[1] * (300 + run)), alt: 0, speed: FINAL_SPEEDS[0] * (1 - t / ROLL_SECONDS), climb: 0 };
  }
  if (before <= FINAL_SECONDS) {
    // Down the three degrees. (It touches down 300 m past the threshold.)
    const speed = FINAL_SPEEDS[0] + ((FINAL_SPEEDS[1] - FINAL_SPEEDS[0]) * before) / FINAL_SECONDS;
    const out = FINAL_SPEEDS[0] * before + ((FINAL_SPEEDS[1] - FINAL_SPEEDS[0]) / FINAL_SECONDS) * before * before * 0.5;
    return { at: offset(threshold, along[0] * (300 - out), along[1] * (300 - out)), alt: out * GLIDE, speed, climb: -speed * GLIDE };
  }
  // In towards the line of the runway.
  const since = Math.min(before - FINAL_SECONDS, LEG_SECONDS);
  const join = JOINS[Math.floor(chance(slot, 11) * JOINS.length)];
  const from = (heading + 180 + join) * RADIANS;
  const out = LEG_SPEEDS[0] * since + ((LEG_SPEEDS[1] - LEG_SPEEDS[0]) / LEG_SECONDS) * since * since * 0.5;
  const fix = offset(threshold, along[0] * (300 - FINAL_METERS), along[1] * (300 - FINAL_METERS));
  const top = FINAL_METERS * GLIDE;
  const speed = LEG_SPEEDS[0] + ((LEG_SPEEDS[1] - LEG_SPEEDS[0]) * since) / LEG_SECONDS;
  return { at: offset(fix, Math.sin(from) * out, Math.cos(from) * out), alt: top + ((LEG_TOP_METERS - top) * out) / LEG_METERS, speed, climb: (-speed * (LEG_TOP_METERS - top)) / LEG_METERS };
}

/** Where a departing aircraft is, so many seconds after it began its run. */
function departureAt(since, slot, heading) {
  const runway = AIRPORT.runways[Math.abs(slot + 1) % 2];
  const start = heading === RUNWAY_BEARING ? runway.south : runway.north;
  const along = [Math.sin(heading * RADIANS), Math.cos(heading * RADIANS)];
  // How far it has come: 35 s to 80 m/s on the runway, then on up to 140 m/s over the next two and a half minutes, and to 200 m/s after.
  let far;
  let speed;
  if (since <= ROLL_SECONDS) {
    speed = (80 * since) / ROLL_SECONDS;
    far = (speed * since) / 2;
  } else if (since <= ROLL_SECONDS + 150) {
    const t = since - ROLL_SECONDS;
    speed = 80 + 0.4 * t;
    far = 1400 + 80 * t + 0.2 * t * t;
  } else {
    const t = since - ROLL_SECONDS - 150;
    speed = Math.min(140 + 0.16 * t, 200);
    const until = Math.min(t, 375);
    far = 1400 + 80 * 150 + 0.2 * 150 * 150 + 140 * until + 0.08 * until * until + 200 * Math.max(t - 375, 0);
  }
  // How high: off the ground at 35 s, 13 m/s up for three minutes, 9 m/s after.
  const up = Math.max(since - ROLL_SECONDS, 0);
  const alt = Math.min(13 * Math.min(up, 180) + 9 * Math.max(up - 180, 0), 9000);
  const climb = up <= 0 ? 0 : up < 180 ? 13 : alt < 9000 ? 9 : 0;
  if (far <= STRAIGHT_METERS) return { at: offset(start, along[0] * far, along[1] * far), alt, speed, climb };
  const bound = BOUND[Math.floor(chance(slot, 23) * BOUND.length)] * RADIANS;
  const turn = offset(start, along[0] * STRAIGHT_METERS, along[1] * STRAIGHT_METERS);
  return { at: offset(turn, Math.sin(bound) * (far - STRAIGHT_METERS), Math.cos(bound) * (far - STRAIGHT_METERS)), alt, speed, climb };
}

/** Where an aircraft that only passes over is, so many seconds from when it is nearest (before: less than nothing). */
function crossingAt(from, slot) {
  const course = CROSSINGS[Math.floor(chance(slot, 31) * CROSSINGS.length)];
  const aside = (chance(slot, 37) - 0.5) * 90000; // how far to one side of the city it passes
  const speed = 228 + chance(slot, 41) * 24;
  const way = [Math.sin(course * RADIANS), Math.cos(course * RADIANS)];
  const city = [46.68, 24.71];
  return { at: offset(city, way[1] * aside + way[0] * speed * from, -way[0] * aside + way[1] * speed * from), alt: 10000 + Math.floor(chance(slot, 43) * 5) * 500, speed, climb: 0, track: course };
}

/**
 * The airport's typical traffic at a moment: every aircraft that is on its
 * way in, on its way out or passing over. seconds: the time; windFrom:
 * where the wind comes from, in degrees (it settles which way the runways
 * are in use). The same moment always gives the same aircraft.
 *
 * Returns [{ id, kind: 'typical', phase: 'landing' | 'takeoff' | 'cruise',
 * lng, lat, alt, track, speed, climb, wide, airline, tail, body }].
 */
export function typicalFlights(seconds, { windFrom } = {}) {
  const heading = runwayHeading(windFrom);
  const planes = [];
  /** An aircraft at a moment and a little after, for the way it is heading; and its paint. */
  const fly = (id, phase, placeAt, slot) => {
    // (Three moments weighed together round off the corner where it turns.)
    const blend = (t) => {
      const [a, b, c] = [placeAt(t - 6), placeAt(t), placeAt(t + 6)];
      return { at: [(a.at[0] + 2 * b.at[0] + c.at[0]) / 4, (a.at[1] + 2 * b.at[1] + c.at[1]) / 4], alt: b.alt, speed: b.speed, climb: b.climb, track: b.track };
    };
    const now = phase === 'cruise' ? placeAt(0) : blend(0);
    const next = phase === 'cruise' ? placeAt(4) : blend(4);
    const airline = airlineFor(chance(slot, 53));
    planes.push({
      id,
      kind: 'typical',
      phase,
      lng: now.at[0],
      lat: now.at[1],
      alt: now.alt,
      track: now.track ?? bearingTo(now.at, next.at),
      speed: now.speed,
      climb: now.climb,
      wide: chance(slot, 59) < 0.25,
      airline: airline.name,
      tail: airline.tail,
      body: airline.body,
    });
  };
  const hourAt = (time) => (((time / 3600 + RIYADH_HOURS_EAST) % 24) + 24) % 24;
  // Landings: one to a slot at the most, by the luck of the slot.
  for (let slot = Math.floor((seconds - ROLL_SECONDS) / SLOT_SECONDS); slot <= Math.ceil((seconds + ARRIVAL_SECONDS) / SLOT_SECONDS); slot += 1) {
    const down = slot * SLOT_SECONDS + chance(slot, 3) * 40;
    if (chance(slot, 5) >= (movementsInHour(hourAt(down)) / 2) * (SLOT_SECONDS / 3600)) continue;
    const before = down - seconds;
    if (before > ARRIVAL_SECONDS || before < -ROLL_SECONDS) continue;
    fly(`in${slot}`, 'landing', (t) => arrivalAt(before - t, slot, heading), slot);
  }
  // Take-offs: in the gaps between them.
  for (let slot = Math.floor((seconds - DEPARTURE_SECONDS) / SLOT_SECONDS); slot <= Math.ceil(seconds / SLOT_SECONDS); slot += 1) {
    const off = slot * SLOT_SECONDS + 37 + chance(slot, 7) * 30;
    if (chance(slot, 13) >= (movementsInHour(hourAt(off)) / 2) * (SLOT_SECONDS / 3600)) continue;
    const since = seconds - off;
    if (since < 0 || since > DEPARTURE_SECONDS) continue;
    fly(`out${slot}`, 'takeoff', (t) => departureAt(Math.max(since + t, 0), slot, heading), slot + 100000);
  }
  // And those on their way from somewhere else to somewhere else, eleven kilometres up.
  for (let slot = Math.floor((seconds - CROSSING_SECONDS) / CROSSING_SLOT_SECONDS); slot <= Math.ceil((seconds + CROSSING_SECONDS) / CROSSING_SLOT_SECONDS); slot += 1) {
    if (chance(slot, 17) >= 0.5) continue;
    const nearest = slot * CROSSING_SLOT_SECONDS + chance(slot, 19) * 200;
    const from = seconds - nearest;
    if (Math.abs(from) > CROSSING_SECONDS) continue;
    fly(`over${slot}`, 'cruise', (t) => crossingAt(from + t, slot), slot + 200000);
  }
  return planes;
}

const FEET = 0.3048;
const KNOTS = 0.514444;

/**
 * Live aircraft out of an answer from the OpenSky Network (its "states"):
 * [{ id, callsign, lng, lat, alt, track, speed, climb, ground, seen }], seen
 * being when each last gave its place, in seconds since 1970. Those without
 * a place are left out.
 */
export function parseOpenSky(answer) {
  const planes = [];
  for (const state of answer?.states ?? []) {
    if (!Array.isArray(state) || !Number.isFinite(state[5]) || !Number.isFinite(state[6])) continue;
    planes.push({
      id: String(state[0] ?? '').trim(),
      callsign: String(state[1] ?? '').trim(),
      lng: state[5],
      lat: state[6],
      alt: state[8] === true ? 0 : Math.max((Number.isFinite(state[13]) ? state[13] : Number.isFinite(state[7]) ? state[7] : AIRPORT.elevation) - AIRPORT.elevation, 0),
      ground: state[8] === true,
      speed: Number.isFinite(state[9]) ? state[9] : 0,
      track: Number.isFinite(state[10]) ? state[10] : 0,
      climb: Number.isFinite(state[11]) ? state[11] : 0,
      seen: Number.isFinite(state[3]) ? state[3] : Number.isFinite(state[4]) ? state[4] : answer.time ?? 0,
    });
  }
  return planes;
}

/**
 * The same out of an answer in the form the open receivers' networks give
 * (adsb.lol, adsb.fi and others: feet, knots and feet a minute).
 */
export function parseReceivers(answer) {
  const planes = [];
  const list = answer?.ac ?? answer?.aircraft ?? [];
  // (Some give the time in seconds, some in thousandths of one.)
  const now = Number(answer?.now) > 1e11 ? Number(answer.now) / 1000 : Number(answer?.now) || 0;
  for (const one of list) {
    if (!one || !Number.isFinite(one.lat) || !Number.isFinite(one.lon)) continue;
    const ground = one.alt_baro === 'ground';
    const feet = Number.isFinite(one.alt_geom) ? one.alt_geom : Number.isFinite(one.alt_baro) ? one.alt_baro : 0;
    planes.push({
      id: String(one.hex ?? '').trim(),
      callsign: String(one.flight ?? '').trim(),
      type: one.t ?? null,
      lng: one.lon,
      lat: one.lat,
      alt: ground ? 0 : Math.max(feet * FEET - AIRPORT.elevation, 0),
      ground,
      speed: Number.isFinite(one.gs) ? one.gs * KNOTS : 0,
      track: Number.isFinite(one.track) ? one.track : 0,
      climb: Number.isFinite(one.baro_rate) ? (one.baro_rate * FEET) / 60 : Number.isFinite(one.geom_rate) ? (one.geom_rate * FEET) / 60 : 0,
      seen: now - (Number.isFinite(one.seen_pos) ? one.seen_pos : 0),
    });
  }
  return planes;
}

// The aircraft with two aisles, by the type each gives: they are drawn larger.
const WIDE_TYPES = /^(A3[3-8]|A35|B74|B76|B77|B78|IL96|MD11)/;
const LIVE_FOR_SECONDS = 150; // a report older than this says nothing about now
const MOVED_ON_MOST_SECONDS = 90; // an aircraft is moved on from its last report no longer than this
// The receivers that hear Riyadh's sky stand far off, round the Gulf: they hear an aircraft high over the city,
// but not one low over the airport. Should a report have any aircraft so low and so near the airport, the
// receivers hear the airport, and its own traffic needs nothing added.
const HEARD_LOW_METERS = 3000;
const HEARD_NEAR_AIRPORT_METERS = 60000;
// The phone's clock is trusted, unless it is further off the feed's than this. (The feed's own clock gives
// the moment its report is for, which is some seconds before it is had: that much is no fault of the phone.)
const CLOCK_TRUSTED_SECONDS = 30;

/** How far a place is from the airport, in metres. */
const fromAirport = ([lng, lat]) => Math.hypot((lng - AIRPORT.at[0]) * squeezeAt(AIRPORT.at[1]), (lat - AIRPORT.at[1]) * METERS_PER_DEGREE);

/**
 * The aircraft in the sky. The live ones, wherever a feed of them has any, each where it really is, with
 * its call sign. Where the feed hears no aircraft low near the airport (and the receivers it has round
 * Riyadh do not), the airport's own landings and take-offs are added as it flies them at this hour:
 * typical, not particular. With no live aircraft known at all, that typical traffic, and the airliners
 * that typically pass over, are all there is.
 */
export class Flights {
  constructor() {
    this.live = [];
    this.reportedAt = 0;
    this.source = null;
    this.skew = 0; // how far the feed's clock is ahead of the phone's, where the phone's is not to be trusted
  }

  /**
   * Take a report of live aircraft (as parseOpenSky() or parseReceivers()
   * gives them), for a moment by the feed's clock, from a source by name.
   * Those on the ground are left out. now: when the report was had, by the
   * phone's clock: should the two clocks be more than half a minute apart,
   * the feed's is the one kept, or every aircraft would be shown where it
   * was so long ago (or, the phone's clock being behind, not at all).
   */
  report(planes, seconds, source, { now } = {}) {
    this.live = (planes ?? []).filter((plane) => !plane.ground && plane.alt > 30);
    this.reportedAt = seconds;
    this.source = source ?? null;
    this.skew = Number.isFinite(now) && Math.abs(seconds - now) > CLOCK_TRUSTED_SECONDS ? seconds - now : 0;
  }

  /**
   * The sky at a moment: { kind: 'live' | 'typical', source, planes, live (how many of them are live),
   * typical (how many are the airport's typical traffic) }. Live while a report no older than two and a
   * half minutes has aircraft in it: each is moved on from where it last was, by its speed and course.
   */
  at(seconds, { windFrom } = {}) {
    const feed = seconds + this.skew; // the moment by the feed's clock
    if (this.live.length > 0 && feed - this.reportedAt <= LIVE_FOR_SECONDS && feed >= this.reportedAt - CLOCK_TRUSTED_SECONDS) {
      const planes = this.live.map((plane) => {
        const since = Math.min(Math.max(feed - plane.seen, 0), MOVED_ON_MOST_SECONDS);
        const course = plane.track * RADIANS;
        const [lng, lat] = offset([plane.lng, plane.lat], Math.sin(course) * plane.speed * since, Math.cos(course) * plane.speed * since);
        const airline = AIRLINES[CALL_SIGNS[plane.callsign.slice(0, 3)] ?? CALL_SIGNS[plane.callsign.slice(0, 2)] ?? 4];
        const alt = Math.max(plane.alt + plane.climb * since, 0);
        return {
          id: plane.id,
          kind: 'live',
          phase: alt > 7500 ? 'cruise' : plane.climb < -1 ? 'landing' : 'takeoff',
          callsign: plane.callsign,
          lng,
          lat,
          alt,
          track: plane.track,
          speed: plane.speed,
          climb: plane.climb,
          wide: WIDE_TYPES.test(plane.type ?? ''),
          airline: airline.name,
          tail: airline.tail,
          body: airline.body,
        };
      });
      // (Where no receiver hears the airport, its own landings and take-offs as it flies them at this hour;
      // the airliners that typically pass over are not wanted: the real ones are there.)
      const hearsAirport = planes.some((plane) => plane.alt < HEARD_LOW_METERS && fromAirport([plane.lng, plane.lat]) < HEARD_NEAR_AIRPORT_METERS);
      const added = hearsAirport ? [] : typicalFlights(seconds, { windFrom }).filter((plane) => plane.phase !== 'cruise');
      return { kind: 'live', source: this.source, planes: [...planes, ...added], live: planes.length, typical: added.length };
    }
    const planes = typicalFlights(seconds, { windFrom });
    return { kind: 'typical', source: null, planes, live: 0, typical: planes.length };
  }
}
