// End-to-end check of the app in a real (headless) browser.
//
//   node tests/e2e.mjs                     run the checks
//   SHOTS=some/folder node tests/e2e.mjs   also save screenshots there
//   RECORD=1 node tests/e2e.mjs            refresh the recorded map data (needs the internet)
//
// Needs Playwright with Chromium. The run is self-contained: the street map is
// replayed from a recording of the real OpenFreeMap service
// (tests/fixtures/map.har), the buildings from a recording of the parts of
// Overture's archive the map reads (tests/fixtures/buildings.json), and the
// other services (place details, search, weather, routes, satellite photos,
// YouTube) are answered by stand-ins below.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { bearingDegrees, sunPosition } from '../js/lib.js';
import { listen } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const CLIP = path.join(FIXTURES, 'clip.webm');
const MAP_RECORDING = path.join(FIXTURES, 'map.har');
const BUILDINGS_RECORDING = path.join(FIXTURES, 'buildings.json');
const BUILDINGS_HAR = path.join(FIXTURES, 'buildings.har'); // only while recording
const BUILDINGS_STORE = /^https:\/\/overturemaps-extras-us-west-2\.s3\.us-west-2\.amazonaws\.com\//;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const RECORD = process.env.RECORD === '1';

// A real driving route through Riyadh, and a real search answer, saved from the live services.
const ROUTE_ANSWER = JSON.parse(readFileSync(path.join(FIXTURES, 'route.json'), 'utf8'));
const SEARCH_ANSWER = JSON.parse(readFileSync(path.join(FIXTURES, 'search.json'), 'utf8'));
const ROUTE_LINE = ROUTE_ANSWER.routes[0].geometry.coordinates;

const PLACE_TAGS = {
  amenity: 'restaurant',
  opening_hours: '24/7',
  phone: '+966 11 211 2222',
  cuisine: 'burger;chicken',
  wheelchair: 'yes',
};

if (!RECORD && (!existsSync(MAP_RECORDING) || !existsSync(BUILDINGS_RECORDING))) {
  console.error('tests/fixtures/map.har or buildings.json is missing. Create them with: RECORD=1 node tests/e2e.mjs');
  process.exit(1);
}

// ── Stand-in picture tile (satellite photos, classic OpenStreetMap) ───────

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** A plain 256×256 tile with a faint grid, so picture layers visibly draw something. */
function makeTile() {
  const size = 256;
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = y * (size * 3 + 1) + 1 + x * 3;
      const line = x % 64 === 0 || y % 64 === 0;
      rows[at] = line ? 96 : 118;
      rows[at + 1] = line ? 104 : 126;
      rows[at + 2] = line ? 92 : 108;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const TILE = makeTile();
const CORS = { 'access-control-allow-origin': '*' };
const YOUTUBE_STUB =
  '<!doctype html><title>stub</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#fff;font:16px sans-serif">YouTube player (stand-in)</body>';

// ── Stand-ins for the data services ───────────────────────────────────────

const asked = { overpass: [], weather: 0, weatherAt: [], clouds: 0, aircraft: 0, route: 0, photoDay: 0, archive: 0, photoTiles: {}, photoMaps: {}, search: [] };
// The sharpest level the stand-in for the photo service has: as in a town, one short of what a big city gets.
const PHOTO_SHARPEST = 18;

const json = (route, body) =>
  route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });

function answerOverpass(route) {
  const query = decodeURIComponent((route.request().postData() ?? '').replace(/^data=/, ''));
  asked.overpass.push(query);
  const one = /^\[out:json\]\[timeout:10\];(node|way|relation)\((\d+)\);out tags;$/.exec(query);
  if (one) return json(route, { elements: [{ type: one[1], id: Number(one[2]), tags: PLACE_TAGS }] });
  if (/^\[out:json\]\[timeout:15\];way\["highway"\]\["maxspeed"\]\(around:\d+,[\d.-]+,[\d.-]+\);out tags geom qt;$/.test(query)) {
    // The whole test route is one road with a 60 km/h limit.
    const geometry = ROUTE_LINE.map(([lon, lat]) => ({ lat, lon }));
    return json(route, { elements: [{ type: 'way', id: 1, tags: { highway: 'primary', maxspeed: '60' }, geometry }] });
  }
  return route.fulfill({ status: 400, headers: CORS, body: 'unexpected query' });
}

function answerPhoton(route) {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/reverse')) {
    return json(route, {
      features: [
        {
          type: 'Feature',
          properties: { osm_type: 'W', osm_id: 77, osm_key: 'building', osm_value: 'yes', name: 'Olaya Towers', street: 'Al Olaya Street', city: 'Riyadh', country: 'Saudi Arabia' },
          geometry: { type: 'Point', coordinates: [Number(url.searchParams.get('lon')), Number(url.searchParams.get('lat'))] },
        },
      ],
    });
  }
  const text = url.searchParams.get('q');
  asked.search.push(Object.fromEntries(url.searchParams));
  if (text === 'offline') return route.abort();
  // (A place by that name in another city: the app is to leave it out.)
  if (text === 'jeddah') {
    return json(route, {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { osm_type: 'N', osm_id: 5, osm_key: 'place', osm_value: 'city', name: 'Jeddah', country: 'Saudi Arabia' }, geometry: { type: 'Point', coordinates: [39.1925, 21.4858] } },
        { type: 'Feature', properties: { osm_type: 'W', osm_id: 6, osm_key: 'highway', osm_value: 'primary', name: 'Jeddah Road', city: 'Riyadh', country: 'Saudi Arabia' }, geometry: { type: 'Point', coordinates: [46.62, 24.63] } },
      ],
    });
  }
  if (text === 'zzzz') return json(route, { type: 'FeatureCollection', features: [] });
  return json(route, SEARCH_ANSWER);
}

// The buildings archive is one file of 180 GB, read a piece at a time. The
// recording holds the pieces the map asks for along the test route:
// { release, size, pieces: [[where it starts, its bytes in base64], …] }.
let archive = null;
function buildingsArchive() {
  if (!archive) {
    const saved = JSON.parse(readFileSync(BUILDINGS_RECORDING, 'utf8'));
    archive = { ...saved, pieces: saved.pieces.map(([start, bytes]) => ({ start, bytes: Buffer.from(bytes, 'base64') })) };
  }
  return archive;
}

/** Answer for Overture's store: 'recorded' as recorded, 'gone' with a list but no archive behind it. */
function answerBuildings(route, how) {
  const request = route.request();
  const url = new URL(request.url());
  const { release, size, pieces } = buildingsArchive();
  if (url.searchParams.has('list-type')) {
    const listing = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Prefix>tiles/</Prefix><CommonPrefixes><Prefix>tiles/${release}/</Prefix></CommonPrefixes></ListBucketResult>`;
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/xml', body: listing });
  }
  const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers().range ?? '');
  if (!range || url.pathname !== `/tiles/${release}/buildings.pmtiles`) return route.fulfill({ status: 404, headers: CORS });
  const start = Number(range[1]);
  const end = Number(range[2]);
  const headers = { ...CORS, 'access-control-expose-headers': 'ETag, Content-Length, Content-Range, Accept-Ranges', 'content-range': `bytes ${start}-${end}/${size}`, etag: '"recorded"' };
  // The first few bytes say what kind of file it is; the app looks at them before it trusts the release.
  if (how === 'gone' && end > 6) return route.fulfill({ status: 206, headers, contentType: 'application/octet-stream', body: Buffer.alloc(end - start + 1) });
  asked.archive += 1;
  const piece = pieces.find((one) => one.start <= start && one.start + one.bytes.length > end);
  // A piece that was not recorded (a tile beyond the test route) comes back blank: to the map, a tile that cannot be read.
  const body = piece ? piece.bytes.subarray(start - piece.start, end - piece.start + 1) : Buffer.alloc(end - start + 1);
  return route.fulfill({ status: 206, headers, contentType: 'application/octet-stream', body });
}

/**
 * Turn a fresh recording of the store (a HAR file, as the browser test tool
 * writes it) into the compact one the replay reads.
 */
function tidyBuildings() {
  const har = JSON.parse(readFileSync(BUILDINGS_HAR, 'utf8'));
  const pieces = new Map();
  let release = null;
  let size = 0;
  for (const entry of har.log.entries) {
    const header = (list, name) => list.find((one) => one.name.toLowerCase() === name)?.value ?? '';
    const range = /^bytes=(\d+)-(\d+)$/.exec(header(entry.request.headers, 'range'));
    const whole = /\/(\d+)$/.exec(header(entry.response.headers, 'content-range'));
    const name = /\/tiles\/([^/]+)\/buildings\.pmtiles$/.exec(new URL(entry.request.url).pathname);
    const content = entry.response.content;
    if (entry.response.status !== 206 || !range || !whole || !name || !content?.text || content.encoding !== 'base64') continue;
    const bytes = Buffer.from(content.text, 'base64');
    if (bytes.length !== Number(range[2]) - Number(range[1]) + 1) continue; // cut short: the map had moved on
    release = name[1];
    size = Number(whole[1]);
    pieces.set(`${range[1]}-${range[2]}`, [Number(range[1]), content.text]);
  }
  if (!release) throw new Error('The recording holds nothing of the buildings archive');
  const sorted = [...pieces.values()].sort((a, b) => a[0] - b[0]);
  writeFileSync(BUILDINGS_RECORDING, JSON.stringify({ release, size, pieces: sorted }));
  rmSync(BUILDINGS_HAR);
  archive = null;
  console.log(`  recorded ${sorted.length} pieces of the buildings archive (${release}), ${Math.round(sorted.reduce((sum, piece) => sum + piece[1].length, 0) / 1024)} kB`);
}

/** buildings: 'recorded' (the default), 'record', 'none' (the store cannot be reached) or 'gone' (it lists a release whose archive is not there). */
async function standIns(context, { recordMap = false, noMap = false, buildings = 'recorded' } = {}) {
  if (noMap || buildings === 'none') await context.route(BUILDINGS_STORE, (route) => route.abort());
  else if (buildings === 'record') await context.routeFromHAR(BUILDINGS_HAR, { url: BUILDINGS_STORE, update: true, updateContent: 'embed' });
  else await context.route(BUILDINGS_STORE, (route) => answerBuildings(route, buildings));

  await context.route(/^https:\/\/(server\.arcgisonline\.com|tile\.openstreetmap\.org)\//, (route) => {
    // The photo service is also asked which day a photo was taken.
    if (route.request().url().includes('/identify')) {
      asked.photoDay += 1;
      return json(route, { results: [{ layerName: 'World Imagery', attributes: { 'DATE (YYYYMMDD)': '20251208', DESCRIPTION: 'GE01' } }] });
    }
    const url = route.request().url();
    // And, a square of tiles at a time, whether the photo comes at a level.
    const square = /\/tilemap\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(url);
    if (square) {
      const [z, top, left, width, height] = square.slice(1).map(Number);
      asked.photoMaps[z] = (asked.photoMaps[z] ?? 0) + 1;
      return json(route, { valid: true, location: { left, top, width, height }, data: new Array(width * height).fill(z <= PHOTO_SHARPEST ? 1 : 0) });
    }
    const tile = /\/World_Imagery\/MapServer\/tile\/(\d+)\/\d+\/\d+$/.exec(url);
    if (tile) asked.photoTiles[tile[1]] = (asked.photoTiles[tile[1]] ?? 0) + 1;
    return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: TILE });
  });

  if (noMap) {
    await context.route(/^https:\/\/tiles\.openfreemap\.org\//, (route) => route.abort());
  } else if (recordMap) {
    await context.routeFromHAR(MAP_RECORDING, { url: /^https:\/\/tiles\.openfreemap\.org\//, update: true, updateContent: 'embed' });
  } else {
    // Anything the recording lacks (a tile just outside the recorded area): an empty answer.
    await context.route(/^https:\/\/tiles\.openfreemap\.org\//, (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname.endsWith('.png')) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: TILE });
      if (pathname.endsWith('.pbf')) return route.fulfill({ status: 204, headers: CORS });
      return route.fulfill({ status: 404, headers: CORS });
    });
    await context.routeFromHAR(MAP_RECORDING, { url: /^https:\/\/tiles\.openfreemap\.org\//, notFound: 'fallback' });
  }

  await context.route(/^https:\/\/overpass-api\.de\//, answerOverpass);
  await context.route(/^https:\/\/photon\.komoot\.io\//, answerPhoton);
  await context.route(/^https:\/\/api\.open-meteo\.com\//, (route) => {
    const where = new URL(route.request().url()).searchParams;
    // The clouds round the city, place by place (see cloudFieldAround in services.js): a clear sky at all 25.
    if (where.get('latitude').includes(',')) {
      asked.clouds += 1;
      const lats = where.get('latitude').split(',');
      return json(route, lats.map(() => ({ current: { time: '2026-11-21T12:00', cloud_cover_low: 0, cloud_cover_mid: 0, cloud_cover_high: 0 } })));
    }
    asked.weather += 1;
    asked.weatherAt.push([Number(where.get('latitude')), Number(where.get('longitude'))]);
    return json(route, { current: { time: '2026-11-21T12:00', temperature_2m: 23.4, weather_code: 0 } });
  });
  // The live aircraft (see aircraftOverRiyadh in services.js): none over the city just now.
  await context.route(/^https:\/\/opensky-network\.org\//, (route) => {
    asked.aircraft += 1;
    return json(route, { time: Math.floor(Date.now() / 1000), states: null });
  });
  await context.route(/^https:\/\/router\.project-osrm\.org\//, (route) => {
    asked.route += 1;
    return json(route, ROUTE_ANSWER);
  });
  await context.route(/^https:\/\/www\.youtube-nocookie\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: YOUTUBE_STUB }),
  );
}

/**
 * Keep one complete answer per address in a fresh recording, and only what a
 * replay needs of it. The map drops downloads it no longer needs when the view
 * moves on; those half-finished ones must go, or a replay waits on them forever.
 */
function tidyRecording() {
  const har = JSON.parse(readFileSync(MAP_RECORDING, 'utf8'));
  const seen = new Set();
  const entries = [];
  for (const entry of har.log.entries) {
    const { url, method } = entry.request;
    if (entry.response.status !== 200 || seen.has(url)) continue;
    seen.add(url);
    const keep = new Set(['content-type', 'access-control-allow-origin']);
    entries.push({
      request: { method, url, headers: [] },
      response: {
        status: 200,
        statusText: 'OK',
        headers: entry.response.headers.filter((header) => keep.has(header.name.toLowerCase())),
        content: entry.response.content,
      },
    });
  }
  writeFileSync(MAP_RECORDING, JSON.stringify({ log: { version: '1.2', creator: { name: 'video-map tests', version: '1' }, entries } }));
  console.log(`  recorded ${entries.length} map files`);
}

// A phone on the test route. The test moves it: window.__gps.travelled is the
// distance covered in metres, window.__gps.speed what the phone reports (m/s).
function gpsOnRoute(route) {
  const rad = (d) => (d * Math.PI) / 180;
  const meters = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos(rad(a[1])), b[1] - a[1]) * 111195;
  const bearing = (a, b) => ((Math.atan2((b[0] - a[0]) * Math.cos(rad(a[1])), b[1] - a[1]) * 180) / Math.PI + 360) % 360;
  let listener = null;
  let timer = null;
  const gps = {
    travelled: 30,
    speed: 13.9,
    fix() {
      let left = gps.travelled;
      let i = 0;
      while (i < route.length - 2 && left > meters(route[i], route[i + 1])) {
        left -= meters(route[i], route[i + 1]);
        i += 1;
      }
      const a = route[i];
      const b = route[i + 1];
      const t = Math.min(left / Math.max(meters(a, b), 0.01), 1);
      return {
        coords: {
          latitude: a[1] + (b[1] - a[1]) * t,
          longitude: a[0] + (b[0] - a[0]) * t,
          accuracy: 6,
          altitude: 612,
          altitudeAccuracy: null,
          heading: bearing(a, b),
          speed: gps.speed,
        },
        timestamp: Date.now(),
      };
    },
    emit() {
      if (listener) listener(gps.fix());
    },
  };
  window.__gps = gps;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition(success) {
        listener = success;
        success(gps.fix());
        timer = setInterval(() => success(gps.fix()), 500); // phones repeat themselves when nothing changes
        return 1;
      },
      clearWatch() {
        clearInterval(timer);
        listener = null;
      },
      getCurrentPosition(success) {
        success(gps.fix());
      },
    },
  });
}

// Lets the checks look at the live map (window.__map) without the app exposing it.
function keepMapHandle() {
  let library;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get: () => library,
    set: (value) => {
      const Original = value.Map;
      value.Map = class extends Original {
        constructor(...args) {
          super(...args);
          window.__map = this;
        }
      };
      library = value;
    },
  });
}

// ── Small test harness ────────────────────────────────────────────────────

const failures = [];
let passed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const metersApart = (a, b) =>
  Math.hypot((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 111195;
const turn = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

async function box(page, selector) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

const saved = (page, key) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(`video-map:${k}`) ?? 'null'), key);
const text = async (page, selector) => ((await page.textContent(selector)) ?? '').trim();
const isOpen = (page, id) => page.locator(`#${id}`).evaluate((el) => el.open);

/** Wait until the map has drawn everything it was asked to and has stopped moving. */
async function mapAtRest(page) {
  try {
    await page.waitForFunction(() => window.__map && window.__map.loaded() && !window.__map.isMoving(), null, { timeout: 45000 });
  } catch (error) {
    // Say what the map was still busy with, then fail as before.
    const state = await page.evaluate(() => {
      const live = window.__map;
      if (!live) return 'no map';
      const caches = live.style.sourceCaches ?? live.style.tileManagers ?? {};
      const waiting = {};
      for (const [id, cache] of Object.entries(caches)) {
        const tiles = Object.values(cache._tiles ?? {}).filter((tile) => tile.state === 'loading' || tile.state === 'reloading');
        if (tiles.length > 0) waiting[id] = tiles.map((tile) => `${tile.tileID.canonical.z}/${tile.tileID.canonical.x}/${tile.tileID.canonical.y}`).slice(0, 8);
      }
      // Whether it comes to rest at all between its pictures, and what is still being worked on.
      const sources = {};
      for (const [id, cache] of Object.entries(caches)) if (!cache.loaded()) sources[id] = false;
      return {
        loaded: live.loaded(),
        moving: live.isMoving(),
        tiles: live.areTilesLoaded(),
        style: live.isStyleLoaded(),
        zoom: live.getZoom(),
        pitch: live.getPitch(),
        waiting,
        dirty: [live._styleDirty, live._sourcesDirty],
        updating: Object.keys(live.style._updatedSources ?? {}),
        sources,
        scene: live.getLayer('city-life')?.implementation.counts?.().busy ?? null,
      };
    });
    console.log(`  map not at rest: ${JSON.stringify(state)}`);
    throw error;
  }
}

const camera = (page) =>
  page.evaluate(() => {
    const live = window.__map;
    const centre = live.getCenter();
    return { lat: centre.lat, lng: centre.lng, zoom: live.getZoom(), bearing: live.getBearing(), pitch: live.getPitch(), lens: live.getVerticalFieldOfView() };
  });
// The 3D city is seen isometric: from the south-west, at the angle where a cube's edges all measure the same, through a long lens.
const isometric = (view) => near(view.pitch, 54.7, 0.3) && near(view.bearing, 45, 0.5) && near(view.lens, 6, 0.01);

const phone = (page) =>
  page.evaluate(() => {
    const { latitude, longitude, heading } = window.__gps.fix().coords;
    return { lat: latitude, lng: longitude, heading };
  });

/** Where my position is drawn in the map pane, as fractions of its width and height. */
const whereAmI = (page) =>
  page.evaluate(() => {
    const { latitude, longitude } = window.__gps.fix().coords;
    const point = window.__map.project([longitude, latitude]);
    const pane = window.__map.getContainer();
    return { x: point.x / pane.clientWidth, y: point.y / pane.clientHeight };
  });
// Followed without turning, I am in the middle; turned the way I travel, a little below it.
const inTheMiddle = (spot) => near(spot.x, 0.5, 0.02) && near(spot.y, 0.5, 0.02);
const belowTheMiddle = (spot) => near(spot.x, 0.5, 0.02) && near(spot.y, 0.7, 0.03);

// While a new style is still loading, the map has no layer list yet.
const layerIds = (page) => page.evaluate(() => (window.__map.getStyle()?.layers ?? []).map((layer) => layer.id));
const drawn = (page, source, sourceLayer) =>
  page.evaluate(([id, layer]) => window.__map.querySourceFeatures(id, layer ? { sourceLayer: layer } : undefined).length, [source, sourceLayer]);
/** Changes to the pin and the route reach the screen a moment after they are made. */
const drawnBecomes = (page, source, some) =>
  page.waitForFunction(([id, wanted]) => window.__map.querySourceFeatures(id).length > 0 === wanted, [source, some]);

/** Move the phone along the route and wait until the map has followed it there. */
async function drive(page, meters) {
  const from = await camera(page);
  await page.evaluate((m) => {
    window.__gps.travelled += m;
    window.__gps.emit();
  }, meters);
  await page.waitForFunction(
    ([lat, lng, far]) => {
      const centre = window.__map.getCenter();
      return Math.hypot(centre.lat - lat, (centre.lng - lng) * 0.91) * 111195 > far;
    },
    [from.lat, from.lng, meters * 0.6],
  );
  await mapAtRest(page);
}

/** The simulated traffic as it is being drawn: how many triangle corners, and a fingerprint of where they are. */
const trafficNow = (page) =>
  page.evaluate(() => {
    const mesh = window.__map.getLayer('city-life')?.implementation.parts.get('traffic')?.mesh;
    if (!mesh) return { corners: 0, where: '' };
    return { corners: mesh.count, where: Array.from(mesh.positions.subarray(0, Math.min(mesh.count * 3, 600))).map((value) => value.toFixed(1)).join(',') };
  });

/** What the 3D scene holds: { life, photo, buildings }, as the app counts them. */
const sceneCounts = (page) => page.evaluate(() => window.__map.getLayer('city-life')?.implementation.counts() ?? null);
/** How many triangle corners a named part of the 3D scene has. */
const sceneCorners = (page, part) => page.evaluate((name) => window.__map.getLayer('city-life')?.implementation.parts.get(name)?.mesh?.count ?? 0, part);

/**
 * How the 3D city is lit right now: how dark it is and how far the lamps are
 * on, as the app counts them; what the map itself draws for the dark; and
 * what in the scene gives light.
 */
const lightNow = (page) =>
  page.evaluate(() => {
    const live = window.__map;
    const sceneLayer = live.getLayer('city-life')?.implementation;
    const corners = (name) => sceneLayer?.parts.get(name)?.mesh?.count ?? 0;
    const last = (value) => (Array.isArray(value) ? value.at(-1) : value);
    return {
      ...(sceneLayer?.counts().night ?? {}),
      scene: sceneLayer?.night,
      day: sceneLayer?.day,
      veil: live.getPaintProperty('city-night', 'background-opacity'),
      glow: last(live.getPaintProperty('city-glow', 'line-opacity')),
      dots: live.getPaintProperty('city-lamps', 'line-opacity')[6],
      pools: live.getPaintProperty('city-night-pools', 'fill-opacity'),
      block: live.getPaintProperty('city-buildings', 'fill-extrusion-color'),
      names: live.getPaintProperty('vm-places', 'text-color'),
      streetNames: live.getPaintProperty('highway-name-major', 'text-color'),
      streetEdges: [live.getPaintProperty('highway-name-major', 'text-halo-color') ?? null, live.getPaintProperty('highway-name-major', 'text-halo-width') ?? null],
      sky: live.getSky()?.['sky-color'],
      anchor: live.getLight().anchor,
      shadows: live.getSource('city-shade').serialize().data.features.length,
      posts: corners('lampposts'),
      lamplight: corners('lamplight'),
      headlights: corners('lights'),
      spill: corners('spill'),
      glowing: [...(sceneLayer?.parts ?? [])].filter(([, part]) => part.glow).map(([name]) => name).sort(),
    };
  });

/**
 * What the map looks like as a picture: how bright it is on the whole (0 to
 * 255), what share of it is dark, what share is bright, and what share has
 * the amber of lamplight (lit, and with far more red in it than blue).
 */
const pictureOfMap = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const live = window.__map;
        live.once('render', () => {
          const gl = live.painter.context.gl;
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let sum = 0;
          let dark = 0;
          let bright = 0;
          let amber = 0;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4 * 7) {
            const light = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
            sum += light;
            count += 1;
            if (light < 70) dark += 1;
            if (light > 150) bright += 1;
            if (pixels[i] >= 90 && pixels[i] >= 1.4 * pixels[i + 2]) amber += 1;
          }
          resolve({ mean: sum / count, dark: dark / count, bright: bright / count, amber: amber / count });
        });
        live.triggerRepaint();
      }),
  );

/** Wait until the map shows a given layer: the sign that a map type has arrived. */
const styleHas = (page, id) =>
  page.waitForFunction((layer) => (window.__map?.getStyle()?.layers ?? []).some((l) => l.id === layer), id, { timeout: 45000 });

async function shot(page, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log(`  shot ${name}`);
}

// ── The checks ────────────────────────────────────────────────────────────

const { server, url: base } = await listen(0);
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
  // Only a recording run talks to the internet.
  proxy: RECORD && proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined,
});

// The city is lit by the real sun, so the checks pick the time of day: mid-morning in Riyadh at
// the March equinox by default. The clock keeps running from there.
const MORNING = '2026-03-20T07:00:00Z';
const MIDNIGHT = '2026-03-20T21:00:00Z';
function clockFrom(iso) {
  const RealDate = Date;
  const shift = new RealDate(iso).getTime() - RealDate.now();
  window.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + shift);
      else super(...args);
    }
    static now() {
      return RealDate.now() + shift;
    }
  };
}

async function newPhone({ width = 390, height = 844, dark = false, location = true, recordMap = false, noMap = false, buildings = 'recorded', workers = 'block', time = MORNING, route = ROUTE_LINE, kept = null } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: dark ? 'dark' : 'light',
    permissions: location ? ['geolocation'] : [],
    serviceWorkers: workers,
  });
  await standIns(context, { recordMap, noMap, buildings });
  await context.addInitScript(clockFrom, time);
  await context.addInitScript(keepMapHandle);
  if (location) await context.addInitScript(gpsOnRoute, route);
  // What the app kept on this phone the last time it was open: { settings, mapView, … }.
  if (kept) {
    await context.addInitScript((values) => {
      for (const [key, value] of Object.entries(values)) {
        if (localStorage.getItem(`video-map:${key}`) === null) localStorage.setItem(`video-map:${key}`, JSON.stringify(value));
      }
    }, kept);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    // A request the app itself gave up on (a newer search, a style swap) is not a fault.
    if (!reason.includes('ERR_ABORTED')) errors.push(`failed request: ${request.url()} (${reason})`);
  });
  return { context, page, errors };
}

try {
  // ── 1. The map while driving ────────────────────────────────────────────
  console.log(`\nMap, driving through Riyadh${RECORD ? ' (recording the live map)' : ''}`);
  const { context, page, errors } = await newPhone({ recordMap: RECORD, buildings: RECORD ? 'record' : 'recorded' });
  await page.goto(`${base}/`);
  await page.waitForSelector('.me');
  await styleHas(page, 'city-buildings');
  await page.waitForFunction(() => window.__map.getPitch() > 54);
  await mapAtRest(page);

  let video = await box(page, '#videoPane');
  let bar = await box(page, '#bar');
  let map = await box(page, '#mapPane');
  check('video pane fits a 16:9 picture', near(video.height, (390 * 9) / 16, 1), `height ${video.height}`);
  check('bar sits between the panes', near(bar.y, video.height, 1) && near(bar.height, 48, 0.5));
  check('map takes the rest of the screen', near(map.y + map.height, 844, 1) && near(map.width, 390, 0.5));
  check(
    'the map fills its pane',
    await page.evaluate(() => {
      const canvas = window.__map.getCanvas().getBoundingClientRect();
      const pane = document.getElementById('mapPane').getBoundingClientRect();
      return Math.abs(canvas.width - pane.width) < 1 && Math.abs(canvas.height - pane.height) < 1;
    }),
  );

  check('shows where I am', await page.locator('.me .me-dot').isVisible());
  check('follows me without turning the map', (await page.getAttribute('#followBtn', 'aria-pressed')) === 'true' && (await page.getAttribute('#followBtn', 'data-mode')) === 'north');
  check('the button says the view is isometric', /isometric view/.test(await page.getAttribute('#followBtn', 'aria-label')), await page.getAttribute('#followBtn', 'aria-label'));
  check('speed readout shows the speed', (await text(page, '#speedValue')) === '50' && (await text(page, '#speedUnit')) === 'km/h');
  check('arrow shows the way I am travelling', await page.locator('.me').evaluate((el) => el.classList.contains('has-heading')));
  let view = await camera(page);
  let me = await phone(page);
  let spot = await whereAmI(page);
  check('the city is drawn isometric, with me in the middle', isometric(view) && view.zoom >= 16 && inTheMiddle(spot), JSON.stringify({ view, spot }));

  // Lit by the real sun, with the shadows that go with it.
  const sun = sunPosition(new Date(MORNING), me.lat, me.lng);
  let light = await page.evaluate(() => window.__map.getLight());
  check(
    'the city is lit from where the sun is',
    light.anchor === 'map' && turn(light.position[1], sun.azimuth) < 1 && near(light.position[2], 90 - sun.altitude, 1),
    `light ${JSON.stringify(light.position)}, sun ${sun.azimuth.toFixed(1)}° round, ${sun.altitude.toFixed(1)}° up`,
  );
  await page.waitForFunction(() => window.__map.querySourceFeatures('city-shade').length > 0, null, { timeout: 15000 });
  await mapAtRest(page);
  const shade = await page.evaluate(() => {
    const pieces = window.__map.getSource('city-shade').serialize().data.features.flatMap((feature) => feature.geometry.coordinates);
    // Each piece is the strip a wall sweeps: wall end, wall end, and the same two slid along the ground.
    const [a, , , slid] = pieces[0][0];
    return { pieces: pieces.length, from: a, to: slid, onScreen: window.__map.queryRenderedFeatures({ layers: ['city-shadows'] }).length };
  });
  const fall = bearingDegrees({ lng: shade.from[0], lat: shade.from[1] }, { lng: shade.to[0], lat: shade.to[1] });
  check('buildings cast shadows on the ground', shade.pieces > 20 && shade.onScreen > 0, JSON.stringify({ pieces: shade.pieces, onScreen: shade.onScreen }));
  check('shadows fall away from the sun', turn(fall, sun.azimuth + 180) < 1.5, `shadows point ${fall.toFixed(1)}°, sun is at ${sun.azimuth.toFixed(1)}°`);

  // Cars, buses and trains: a simulation on the real streets.
  await page.waitForFunction(() => (window.__map.getLayer('city-life')?.implementation.parts.get('traffic')?.mesh.count ?? 0) > 0, null, { timeout: 15000 });
  const trafficBefore = await trafficNow(page);
  await page.waitForTimeout(800);
  const trafficAfter = await trafficNow(page);
  // A vehicle is at least three boxes of five faces: 90 corners.
  check('the streets carry traffic', trafficBefore.corners >= 90 * 10, `${trafficBefore.corners} corners`);
  check('the traffic moves', trafficBefore.where !== trafficAfter.where);
  check('the traffic is drawn in the 3D scene, under the names', await page.evaluate(() => {
    const order = window.__map.getLayersOrder();
    const firstName = window.__map.getStyle().layers.find((layer) => layer.type === 'symbol').id;
    return order.indexOf('city-life') > order.indexOf('city-roofs') && order.indexOf('city-life') < order.indexOf(firstName);
  }));

  await page.waitForFunction(() => document.getElementById('roadName').textContent.trim() !== '');
  check('names the road I am on, from the map data', (await text(page, '#roadName')) === 'Al Olaya Street', await text(page, '#roadName'));
  check('the map is built from the real street data', (await layerIds(page)).includes('city-buildings') && (await drawn(page, 'openmaptiles', 'transportation')) > 100);
  const model = await page.evaluate(() => {
    const live = window.__map;
    const walls = live.getPaintProperty('city-buildings', 'fill-extrusion-pattern');
    return {
      kind: live.getLayer('city-buildings').type,
      walls: JSON.stringify(walls),
      // The wall picture for this zoom has been drawn and handed to the map.
      // (An ordinary building's is in one of seven shades of plaster, by the building's number.)
      wallDrawn: [0, 1, 2, 3, 4, 5, 6].filter((shade) => live.hasImage(`vm-wall:${Math.min(Math.max(Math.floor(live.getZoom()) - 14, 0), 4)}:low${shade}`)).length,
      height: JSON.stringify(live.getPaintProperty('city-buildings', 'fill-extrusion-height')),
      blocks: live.queryRenderedFeatures({ layers: ['city-buildings', 'city-towers', 'city-painted'] }).length,
      roofs: live.queryRenderedFeatures({ layers: ['city-roofs'] }).length,
      painted: JSON.stringify(live.getPaintProperty('city-painted', 'fill-extrusion-color')),
      roads: live.queryRenderedFeatures({ layers: ['city-road-minor', 'city-road-mid', 'city-road-main'] }).length,
      // The ground is drawn, every part of it: no photo is among the map's layers, nor among what it draws from.
      ground: live.getPaintProperty('background', 'background-color'),
      drawn: ['city-land', 'city-grass', 'city-pitch', 'city-squares', 'city-water', 'city-pools'].every((id) => live.getLayer(id)?.type === 'fill'),
      photo: (live.getStyle().layers ?? []).some((layer) => layer.type === 'raster') || Object.values(live.getStyle().sources).some((source) => source.type === 'raster'),
    };
  });
  check('3D City: every building is a block of its own height', model.kind === 'fill-extrusion' && model.height.includes('"num_floors"') && model.height.includes('feature-state') && model.blocks > 0, JSON.stringify(model));
  check('3D City: walls have rows of windows, in several shades of plaster', model.walls.includes('vm-wall:1:low') && model.wallDrawn >= 3 && model.roofs > 0, JSON.stringify(model));
  check('3D City: a building with a recorded colour keeps it', model.painted.includes('"facade_color"'), model.painted);
  check('3D City: grey roads on drawn ground, and no satellite photo anywhere in the picture', model.roads > 20 && model.drawn && !model.photo && /^#[0-9a-f]{6}$/.test(model.ground), JSON.stringify({ roads: model.roads, drawn: model.drawn, photo: model.photo, ground: model.ground }));

  // One outline for every building, read out of Overture's archive a piece at a time.
  const houses = await page.evaluate(() => {
    const live = window.__map;
    const all = live.querySourceFeatures('overture', { sourceLayer: 'building' });
    return { source: live.getLayer('city-buildings').source, address: live.getSource('overture')?.url ?? '', outlines: new Set(all.map((feature) => feature.id)).size, numbered: all.every((feature) => typeof feature.id === 'number') };
  });
  check('3D City: one outline for every building, from the archive', houses.source === 'overture' && /^pmtiles:\/\/https:\/\/.+\/buildings\.pmtiles$/.test(houses.address) && houses.outlines > 500 && houses.numbered && (RECORD || asked.archive > 2), JSON.stringify({ ...houses, asked: asked.archive }));
  // No building stands in the street: the ones a street runs straight through (stations under it) are left out.
  // (Left out with them: the blocks that a hand-made landmark or a chain store's own building stands in for.)
  const clear = await page.evaluate(async () => {
    const lib = await import(new URL('js/lib.js', document.baseURI).href);
    const live = window.__map;
    const filter = JSON.stringify(live.getFilter('city-buildings'));
    const left = /\["in",\["id"\],\["literal",\[([\d,]*)\]\]\]/.exec(filter);
    const out = new Set(left ? left[1].split(',').filter(Boolean).map(Number) : []);
    const everywhere = { west: -180, south: -90, east: 180, north: 90 };
    const streets = [];
    for (const feature of live.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' })) {
      const { class: kind, brunnel } = feature.properties;
      if (!['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'].includes(kind) || brunnel === 'tunnel' || brunnel === 'bridge') continue;
      if (feature.geometry.type === 'LineString') streets.push(feature.geometry.coordinates);
      else if (feature.geometry.type === 'MultiLineString') streets.push(...feature.geometry.coordinates);
    }
    const features = live.querySourceFeatures('overture', { sourceLayer: 'building' });
    const found = lib.buildingsOnStreets(lib.buildingFootprints(features, everywhere), streets);
    const counted = live.getLayer('city-life').implementation.counts().buildings;
    return {
      leftOut: out.size,
      found: found.size,
      missed: [...found].filter((id) => !out.has(id)).length,
      counted: { onStreets: counted.onStreets, replaced: counted.replaced, dressed: counted.extras?.dressed ?? 0 },
      stillThere: lib.buildingsOnStreets(lib.buildingFootprints(features, everywhere, null, out), streets).size,
      sameOnEveryLayer: ['city-towers', 'city-painted', 'city-roofs', 'city-contact'].every((id) => JSON.stringify(live.getFilter(id)).includes(left ? left[0] : '"is_underground"')),
    };
  });
  check('3D City: no building is left standing across a street', clear.stillThere === 0 && clear.found > 0 && clear.missed === 0 && clear.leftOut >= clear.found && clear.leftOut <= clear.counted.onStreets + clear.counted.replaced + clear.counted.dressed && clear.sameOnEveryLayer, JSON.stringify(clear));

  // What stands still: the furniture of the roofs, the parked cars, a shelter at every bus stop.
  await page.waitForFunction(() => {
    const parts = window.__map.getLayer('city-life')?.implementation.parts;
    return (parts?.get('roofs')?.mesh?.count ?? 0) > 0 && (parts?.get('street')?.mesh?.count ?? 0) > 0;
  }, null, { timeout: 15000 });
  const scene = await sceneCounts(page);
  // Every building has a roof of its own, modelled: laid just above the building, in the colour the photo
  // shows its real roof in. (Nothing of the photo is drawn. In this test the photo is one dull green-grey all over.)
  await page.waitForFunction(() => {
    const sceneLayer = window.__map.getLayer('city-life')?.implementation;
    return (sceneLayer?.roofs.mesh?.count ?? 0) > 0 && sceneLayer.counts().photo.coloured > 300 && (sceneLayer.parts.get('roofshade')?.mesh?.count ?? 0) > 0;
  }, null, { timeout: 30000 });
  await mapAtRest(page);
  const roofs = await page.evaluate(async () => {
    const live = window.__map;
    const sceneLayer = live.getLayer('city-life').implementation;
    const made = await import(new URL('js/roofs.js', document.baseURI).href);
    const mesh = sceneLayer.roofs.mesh;
    let low = Infinity;
    let high = -Infinity;
    let odd = 0;
    const tints = {};
    const coverings = {};
    for (let i = 0; i < mesh.count; i += 1) {
      low = Math.min(low, mesh.positions[i * 3 + 2]);
      high = Math.max(high, mesh.positions[i * 3 + 2]);
      // Each corner knows where on its roof it is: metres along the building and across it.
      if (!(Math.abs(mesh.lays[i * 2]) < 600 && Math.abs(mesh.lays[i * 2 + 1]) < 600)) odd += 1;
      const tint = `${mesh.tints[i * 4]},${mesh.tints[i * 4 + 1]},${mesh.tints[i * 4 + 2]}`;
      tints[tint] = (tints[tint] ?? 0) + 1;
      const covering = made.ROOFINGS[mesh.tints[i * 4 + 3] >> 6];
      coverings[covering] = (coverings[covering] ?? 0) + 1;
    }
    const counts = sceneLayer.counts();
    const part = (name) => sceneLayer.parts.get(name);
    return {
      ...counts.buildings.roofs,
      deckCorners: mesh.count,
      low,
      high,
      odd,
      coverings,
      photoTint: made.roofTone([118, 126, 108]),
      ofThePhoto: tints[made.roofTone([118, 126, 108]).join()] ?? 0,
      shades: Object.keys(tints).length,
      coloured: counts.photo.coloured,
      walls: counts.detail.walls?.walls ?? 0,
      shadeCorners: part('roofshade').mesh.count,
      parapetCorners: part('parapets').mesh.count,
      lifted: [part('roofs').lifted, part('roofshade').lifted, part('parapets').lifted],
      program: live.painter.context.gl.isProgram(sceneLayer.roofProgram),
    };
  });
  check('3D City: every building has a roof of its own, laid just above it', roofs.program && roofs.decks > 300 && roofs.deckCorners >= roofs.decks * 3 && roofs.low > 3 && roofs.odd === 0, JSON.stringify(roofs));
  check('3D City: a tall building has a roof too, of gravel; the others of slabs, or of sheet on a store', roofs.high > 60 && roofs.coverings.slabs > 0 && roofs.coverings.gravel > 0 && roofs.coverings.sheet > 0, JSON.stringify({ high: roofs.high, coverings: roofs.coverings }));
  check("3D City: a roof is in the colour the photo shows its real roof in; where that is not known, in one of the usual shades", roofs.ofThePhoto > roofs.deckCorners * 0.4 && roofs.shades >= 3, JSON.stringify({ ofThePhoto: roofs.ofThePhoto, of: roofs.deckCorners, shades: roofs.shades, coloured: roofs.coloured }));
  check('3D City: every parapet has a top and an inner side, and throws a strip of shade on its roof', roofs.walls > 1000 && roofs.parapetCorners === roofs.walls * 12 && roofs.strips > 300 && roofs.shadeCorners >= roofs.strips * 3 && roofs.lifted.join() === '1,2,1', JSON.stringify({ walls: roofs.walls, parapetCorners: roofs.parapetCorners, strips: roofs.strips, shadeCorners: roofs.shadeCorners, lifted: roofs.lifted }));
  // What is on screen where a roof is: the roof's own colour under the sun and the sky. Looked at on the
  // slab roofs that are in the photo's colour, where no neighbour's shadow falls. (A slab is a little lighter or
  // darker than the next, and things stand on a roof: most of the places looked at are close to the sum.)
  const shown = await page.evaluate(async (tint) => {
    const live = window.__map;
    const shade = await import(new URL('js/shade.js', document.baseURI).href);
    return new Promise((resolve) => {
      live.once('render', () => {
        const sceneLayer = live.getLayer('city-life').implementation;
        const gl = live.painter.context.gl;
        const { casters, using } = sceneLayer.shadow;
        const mesh = sceneLayer.roofs.mesh;
        const m = sceneLayer.matrix;
        const pixel = new Uint8Array(4);
        const seen = [];
        const clear = Math.max(((using.box[2] - using.box[0]) / using.size) * 2, 1.5);
        const round = [[0, 0], [clear, 0], [-clear, 0], [0, clear], [0, -clear]];
        for (let i = 0; i + 2 < mesh.count && seen.length < 80; i += 3) {
          if (mesh.tints[i * 4] !== tint[0] || mesh.tints[i * 4 + 1] !== tint[1] || mesh.tints[i * 4 + 2] !== tint[2] || mesh.tints[i * 4 + 3] >> 6 !== 0) continue;
          // The middle of a triangle of roof, where it falls on screen.
          let x = 0;
          let y = 0;
          let z = 0;
          for (let k = 0; k < 3; k += 1) {
            x += mesh.positions[(i + k) * 3] / 3;
            y += mesh.positions[(i + k) * 3 + 1] / 3;
            z += mesh.positions[(i + k) * 3 + 2] / 3;
          }
          const w = m[3] * x + m[7] * y + m[11] * z + m[15];
          const across = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
          const up = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
          if (Math.abs(across) > 0.85 || Math.abs(up) > 0.85) continue;
          if (round.some(([dx, dy]) => shade.shadowed(casters, using.fall, [x + dx, y + dy, z], 0.5))) continue;
          gl.readPixels(Math.round((across * 0.5 + 0.5) * gl.drawingBufferWidth), Math.round((up * 0.5 + 0.5) * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          seen.push([pixel[0], pixel[1], pixel[2]]);
        }
        resolve(seen);
      });
      live.triggerRepaint();
    });
  }, roofs.photoTint);
  // The light on a flat roof: the sky, and the sun by how high it stands (it is kept at least 35° up, and is all but white when high).
  const sunUp = Math.sin((Math.max(sun.altitude, 35) * Math.PI) / 180);
  const lightOnRoofs = [0.63 + 0.5 * sunUp, 0.66 + 0.5 * 0.95 * sunUp, 0.73 + 0.5 * 0.86 * sunUp];
  const inTheSun = roofs.photoTint.map((part, i) => Math.min(part * lightOnRoofs[i], 255));
  const asSummed = shown.filter((colour) => colour.every((part, i) => Math.abs(part - inTheSun[i]) <= 16)).length;
  check('3D City: a roof is drawn in its own colour, lit by the sun and the sky', shown.length >= 20 && asSummed >= shown.length * 0.6, `${asSummed} of ${shown.length} places looked at are near ${JSON.stringify(inTheSun.map(Math.round))}: ${JSON.stringify(shown.slice(0, 6))}`);
  // The walls: laid over the map's blocks by the app itself, and worked out point by point as they are drawn.
  const walls = await page.evaluate(() => {
    const sceneLayer = window.__map.getLayer('city-life').implementation;
    const mesh = sceneLayer.walls.mesh;
    let odd = 0;
    const kinds = {};
    for (let i = 0; i < mesh.count; i += 1) {
      const [along, up, span, tall] = mesh.surfaces.subarray(i * 4, i * 4 + 4);
      const facing = Math.hypot(mesh.normals[i * 2], mesh.normals[i * 2 + 1]);
      if (!(up >= -0.001 && up <= tall + 0.001 && along >= -0.01 && along <= span + 0.01 && Math.abs(facing - 1) < 0.01 && tall > 1)) odd += 1;
      const kind = mesh.tints[i * 4 + 3] >> 6;
      kinds[kind] = (kinds[kind] ?? 0) + 1;
    }
    const gl = window.__map.painter.context.gl;
    return { ...sceneLayer.counts().detail, corners: mesh.count, odd, kinds, top: sceneLayer.wallTop, day: sceneLayer.day, light: sceneLayer.sun, eye: sceneLayer.eye, pixel: sceneLayer.pixel, program: gl.isProgram(sceneLayer.wallProgram) };
  });
  check(
    "3D City: every building has walls of the app's own, each corner knowing its place on its wall",
    walls.on && walls.program && walls.walls.buildings > 300 && walls.walls.walls >= walls.walls.buildings * 3 && walls.corners === walls.walls.walls * 6 && walls.odd === 0 && near(walls.top, 1.2 + 0.3 + 0.6, 1e-6),
    JSON.stringify({ ...walls, shadows: undefined }),
  );
  check('3D City: houses, blocks, shops and towers each have their own kind of front', Object.keys(walls.kinds).length >= 3 && walls.kinds[2] > 0, JSON.stringify(walls.kinds));
  // Lit from where the sun is: the same sun the map's own light comes from, kept at least 35° up.
  const up = Math.max(sun.altitude, 35) * (Math.PI / 180);
  const towards = [Math.sin((sun.azimuth * Math.PI) / 180) * Math.cos(up), Math.cos((sun.azimuth * Math.PI) / 180) * Math.cos(up), Math.sin(up)];
  check('3D City: the walls are lit from where the sun is, and drawn for where the eye is', walls.day === 1 && walls.light.every((part, i) => near(part, towards[i], 0.02)) && near(Math.hypot(...walls.eye), 1, 1e-6) && walls.eye[2] > 0.5 && walls.pixel > 0.3 && walls.pixel < 1.2, JSON.stringify({ light: walls.light, towards, eye: walls.eye, pixel: walls.pixel }));
  check("3D City: a wall's colour is worked out from the colour of its roof in the photo", walls.coloured > 300, `${walls.coloured} buildings`);
  check('the photo is fetched only to be read, at one level, and never for the screen', Object.keys(asked.photoTiles).join() === '17' && asked.photoTiles[17] > 0 && Object.keys(asked.photoMaps).length === 0, JSON.stringify({ tiles: asked.photoTiles, maps: asked.photoMaps }));
  // The shadows on walls and roofs are read from a picture of the buildings as the sun sees them.
  const shadows = await page.evaluate(() => {
    const sceneLayer = window.__map.getLayer('city-life').implementation;
    const gl = window.__map.painter.context.gl;
    const { ready, able, using, target, drawn } = sceneLayer.shadow;
    return { ...sceneLayer.counts().detail.shadows, ready, able, drawn, picture: ready && gl.isTexture(target.picture) && gl.isFramebuffer(target.frame), used: using?.size, fall: using?.fall };
  });
  const falls = [Math.sin(((sun.azimuth + 180) * Math.PI) / 180) / Math.tan((sun.altitude * Math.PI) / 180), Math.cos(((sun.azimuth + 180) * Math.PI) / 180) / Math.tan((sun.altitude * Math.PI) / 180)];
  check(
    '3D City: the buildings are drawn as the sun sees them, for the shadows on walls and roofs to be read from',
    shadows.ready && shadows.able && shadows.picture && [512, 1024, 2048].includes(shadows.size) && shadows.used === shadows.size && shadows.corners > 3000 && shadows.top > 100 && shadows.fall.every((part, i) => near(part, falls[i], 0.02)),
    JSON.stringify({ ...shadows, falls }),
  );
  // What is on screen agrees with the sum done the slow way: of the roofs looked at, those the sum says are in
  // a neighbour's shadow are darker than those it says are in the sun. (Roofs are of many colours: each place
  // is measured by how bright it is on screen for the colour its roof was given.)
  const shaded = await page.evaluate(async () => {
    const live = window.__map;
    const shade = await import(new URL('js/shade.js', document.baseURI).href);
    return new Promise((resolve) => {
      live.once('render', () => {
        const sceneLayer = live.getLayer('city-life').implementation;
        const gl = live.painter.context.gl;
        const { casters, using } = sceneLayer.shadow;
        const mesh = sceneLayer.roofs.mesh;
        const m = sceneLayer.matrix;
        const pixel = new Uint8Array(4);
        const groups = { sun: [], shadow: [] };
        // The edge of a shadow is soft over a spot or two of the picture: only places well inside a shadow or
        // well clear of one are looked at.
        const clear = Math.max(((using.box[2] - using.box[0]) / using.size) * 2, 1.5);
        const round = [[clear, 0], [-clear, 0], [0, clear], [0, -clear]];
        for (let i = 0; i + 2 < mesh.count && groups.shadow.length < 40; i += 3) {
          const given = mesh.tints[i * 4] + mesh.tints[i * 4 + 1] + mesh.tints[i * 4 + 2];
          // Four places on each triangle of roof: its middle, and half-way from there to each corner.
          const corners = [0, 1, 2].map((k) => [mesh.positions[(i + k) * 3], mesh.positions[(i + k) * 3 + 1], mesh.positions[(i + k) * 3 + 2]]);
          const centre = [0, 1, 2].map((axis) => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3);
          for (const [x, y, z] of [centre, ...corners.map((corner) => corner.map((part, axis) => (part + centre[axis]) / 2))]) {
            const w = m[3] * x + m[7] * y + m[11] * z + m[15];
            const across = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
            const up = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
            if (Math.abs(across) > 0.85 || Math.abs(up) > 0.85) continue;
            const dark = shade.shadowed(casters, using.fall, [x, y, z], 0.5);
            if (!dark && groups.sun.length >= 80) continue; // most roofs are in the sun: enough of those
            if (round.some(([dx, dy]) => shade.shadowed(casters, using.fall, [x + dx, y + dy, z], 0.5) !== dark)) continue;
            gl.readPixels(Math.round((across * 0.5 + 0.5) * gl.drawingBufferWidth), Math.round((up * 0.5 + 0.5) * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            groups[dark ? 'shadow' : 'sun'].push((pixel[0] + pixel[1] + pixel[2]) / given);
          }
        }
        const middle = (list) => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? null;
        resolve({ sun: groups.sun.length, shadow: groups.shadow.length, sunBright: middle(groups.sun), shadowBright: middle(groups.shadow), clear });
      });
      live.triggerRepaint();
    });
  });
  // In the sun a roof is about as bright as its colour, or a little brighter; in shadow it has the light of the sky alone, some two thirds of that.
  check(
    "3D City: a roof in a neighbour's shadow is darker than one in the sun",
    shaded.sun >= 10 && shaded.shadow >= 5 && shaded.sunBright > 0.92 && shaded.sunBright < 1.15 && shaded.shadowBright > 0.5 && shaded.shadowBright < shaded.sunBright * 0.8,
    JSON.stringify(shaded),
  );
  const pavements = await page.evaluate(() => ({ drawn: window.__map.queryRenderedFeatures({ layers: ['city-pavement'] }).length, edges: window.__map.queryRenderedFeatures({ layers: ['city-pavement-edge'] }).length }));
  check('3D City: the streets have a pavement along them', pavements.drawn > 20 && pavements.edges > 20, JSON.stringify(pavements));
  check('3D City: the roofs have their furniture: stair heads, tanks, cooling plant', roofs.furnished > 300 && roofs.furnished <= roofs.of && (await sceneCorners(page, 'roofs')) >= roofs.furnished * 30, JSON.stringify({ furnished: roofs.furnished, of: roofs.of, corners: await sceneCorners(page, 'roofs') }));
  const parking = (await sceneCounts(page)).life;
  check('3D City: cars are parked along the side streets', parking.parked > 20 && (await sceneCorners(page, 'street')) >= parking.parked * 90, `${parking.parked} parked`);
  check('3D City: and in rows beside the lanes of the car parks, where there is room', parking.bays > 0 && parking.bays < parking.parked, `${parking.bays} of ${parking.parked} in bays`);
  // Buses: only as many as the streets with stops call for, one every ten minutes each way; none without a stop on the map.
  check('3D City: the bus stops on the map have shelters', scene.life.busStops > 0 && scene.life.shelters > 0 && scene.life.shelters <= scene.life.busStops, JSON.stringify(scene.life));
  check('3D City: buses are few, and only where there are stops', scene.life.busKm > 0 && scene.life.buses <= Math.ceil(scene.life.busKm / 4.2) + 1 && scene.life.buses < scene.life.vehicles / 20, JSON.stringify(scene.life));

  // The landmarks: modelled by hand as stacks of slabs, standing where the map's own plain block is left out.
  const marks = await page.evaluate(async () => {
    const live = window.__map;
    const { LANDMARKS, STAYED_BRIDGES } = await import(new URL('js/landmarks.js', document.baseURI).href);
    const slabs = live.getSource('city-landmarks').serialize().data.features;
    const kingdom = slabs.filter((slab) => slab.properties.landmark === 'kingdom-centre');
    const order = live.getLayersOrder();
    return {
      known: LANDMARKS.map((one) => one.id).join(),
      stayed: STAYED_BRIDGES.map((one) => one.id).join(),
      slabs: slabs.length,
      kingdom: kingdom.length,
      top: Math.max(...kingdom.map((slab) => slab.properties.t)),
      kind: live.getLayer('city-landmarks')?.type,
      height: JSON.stringify(live.getPaintProperty('city-landmarks', 'fill-extrusion-height')),
      base: JSON.stringify(live.getPaintProperty('city-landmarks', 'fill-extrusion-base')),
      colour: JSON.stringify(live.getPaintProperty('city-landmarks', 'fill-extrusion-color')),
      inOrder: order.indexOf('city-landmarks') > order.indexOf('city-roofs') && order.indexOf('city-extras') > order.indexOf('city-landmarks') && order.indexOf('city-life') > order.indexOf('city-extras'),
      seen: [...new Set(live.queryRenderedFeatures({ layers: ['city-landmarks'] }).map((feature) => feature.properties.landmark))].join(),
    };
  });
  check(
    '3D City: the landmark towers are modelled by hand',
    marks.known === 'kingdom-centre,al-faisaliah,pif-tower,burj-rafal,al-majdoul,tv-tower,water-tower,kafd-station' && marks.stayed === 'wadi-laban' && marks.slabs > 800 && marks.kind === 'fill-extrusion' && marks.height === '["get","t"]' && marks.base === '["get","b"]' && marks.colour === '["get","c"]' && marks.inOrder,
    JSON.stringify({ ...marks, known: undefined }),
  );
  check('3D City: Kingdom Centre stands 302 m tall in place of its plain block', marks.kingdom > 60 && marks.top === 302 && marks.seen.includes('kingdom-centre') && scene.buildings.replaced >= 1, JSON.stringify({ kingdom: marks.kingdom, top: marks.top, seen: marks.seen, replaced: scene.buildings.replaced }));
  // Around what the map shows: chain stores in their colours, a pavilion at each metro entrance, bridges built in 3D.
  await page.waitForFunction(() => window.__map.getLayer('city-life')?.implementation.counts().buildings.extras !== null, null, { timeout: 15000 });
  const dressing = await page.evaluate(() => {
    const live = window.__map;
    const kinds = {};
    for (const feature of live.getSource('city-extras').serialize().data.features) kinds[feature.properties.kind] = (kinds[feature.properties.kind] ?? 0) + 1;
    const counts = live.getLayer('city-life').implementation.counts();
    return { kinds, extras: counts.buildings.extras, bridges: counts.life.bridges, stayed: counts.life.stayed, corners: live.getLayer('city-life').implementation.parts.get('bridges')?.mesh?.count ?? 0 };
  });
  check('3D City: what is built around the map is counted and drawn as blocks', dressing.extras.slabs === Object.values(dressing.kinds).reduce((sum, count) => sum + count, 0), JSON.stringify(dressing));
  check('3D City: a pavilion with its sign stands at each metro entrance', dressing.extras.entrances > 0 && dressing.kinds.pavilion >= 2 && dressing.kinds.pavilion <= dressing.extras.entrances * 2 && dressing.kinds.sign === dressing.kinds.pavilion, JSON.stringify(dressing));
  check('3D City: chain stores wear their own colours', dressing.extras.stores > 0 && dressing.extras.dressed > 0 && dressing.extras.dressed <= dressing.extras.stores && dressing.kinds.store > 0 && dressing.kinds.front > 0, JSON.stringify(dressing));
  check('3D City: bridges are built in 3D, deck and piers', dressing.bridges > 0 && dressing.corners > dressing.bridges * 100, JSON.stringify({ bridges: dressing.bridges, corners: dressing.corners }));
  console.log(`  (extras here: ${JSON.stringify(dressing.extras)})`);
  check('3D City: mosques have a dome and a minaret', dressing.extras.mosques > 0 && dressing.kinds.dome === dressing.extras.mosques * 8 && dressing.kinds.minaret >= dressing.extras.mosques * 9, JSON.stringify({ mosques: dressing.extras.mosques, dome: dressing.kinds.dome, minaret: dressing.kinds.minaret }));
  check('3D City: the shops of no chain have a front each', dressing.extras.locals > 0 && dressing.kinds.local >= 3 && dressing.kinds.local % 3 === 0 && dressing.kinds.local <= dressing.extras.locals * 3, JSON.stringify({ locals: dressing.extras.locals, slabs: dressing.kinds.local }));
  const paint = await page.evaluate(() => ({ marks: window.__map.getLayer('city-life').implementation.counts().life.marks, corners: window.__map.getLayer('city-life').implementation.parts.get('marks')?.mesh?.count ?? 0, flat: (window.__map.getStyle().layers ?? []).some((layer) => layer.id === 'city-road-marks') }));
  check('3D City: the main roads have their lanes painted, and side streets a crossing where they meet one', paint.marks.lines > 5 && paint.marks.crossings > 0 && paint.corners > paint.marks.lines * 6 && !paint.flat, JSON.stringify(paint));
  check('3D City: the cable-stayed bridge is drawn only where it stands', dressing.stayed === 0);

  await page.waitForSelector('#weather:not([hidden])');
  check('shows the weather', (await text(page, '#weather')) === '23° Clear', await text(page, '#weather'));
  await page.waitForSelector('#limit:not([hidden])');
  check('shows the speed limit of this road', (await text(page, '#limit')) === '60');
  check('under the limit: speed is not flagged', !(await page.locator('#speed').evaluate((el) => el.classList.contains('over'))));
  await page.evaluate(() => {
    window.__gps.speed = 20;
    window.__gps.emit();
  });
  await page.waitForFunction(() => document.getElementById('speed').classList.contains('over'));
  check('over the limit: speed turns red', (await text(page, '#speedValue')) === '72');
  await page.evaluate(() => {
    window.__gps.speed = 13.9;
    window.__gps.emit();
  });
  await page.waitForFunction(() => !document.getElementById('speed').classList.contains('over'));

  await mapAtRest(page);
  // Each time the circle round my position is handed to the map, the map works it out afresh and draws itself again.
  await page.evaluate(() => {
    window.__circles = 0;
    window.__map.on('sourcedataloading', (event) => {
      if (event.sourceId === 'vm-accuracy') window.__circles += 1;
    });
  });
  await page.waitForTimeout(1300); // the phone repeats the same position a few times
  check('standing still leaves the map at rest', await page.evaluate(() => !window.__map.isMoving()));
  check('a position that only repeats itself gives the map nothing to do', (await page.evaluate(() => window.__circles)) === 0, `${await page.evaluate(() => window.__circles)} times`);
  const speedAsks = asked.overpass.filter((query) => query.includes('maxspeed')).length;
  check('one question covers the speed limits of the whole area', speedAsks === 1, `asked ${speedAsks} times`);
  check('the weather is asked for once', asked.weather === 1);

  await drive(page, 120);
  me = await phone(page);
  spot = await whereAmI(page);
  check('map moves with me', inTheMiddle(spot), JSON.stringify(spot));
  check('and the circle round my position with it', (await page.evaluate(() => window.__circles)) >= 1, `${await page.evaluate(() => window.__circles)} times`);
  await shot(page, 'map-city.png');

  // Driving view: the way I travel is up.
  await page.click('#followBtn');
  await page.waitForFunction((heading) => Math.abs(((window.__map.getBearing() - heading + 540) % 360) - 180) < 2, me.heading);
  await mapAtRest(page);
  view = await camera(page);
  check('driving view turns the map my way', (await page.getAttribute('#followBtn', 'data-mode')) === 'heading' && near(view.pitch, 54.7, 0.3) && turn(view.bearing, me.heading) < 2, `map ${view.bearing.toFixed(1)}°, me ${me.heading.toFixed(1)}°`);
  spot = await whereAmI(page);
  check('driving view shows the road ahead', belowTheMiddle(spot), JSON.stringify(spot));
  await shot(page, 'map-driving.png');
  await page.click('#followBtn');
  await page.waitForFunction(() => Math.abs(window.__map.getBearing() - 45) < 0.5);
  await mapAtRest(page);
  view = await camera(page);
  check('tapping again goes back to the isometric view', (await page.getAttribute('#followBtn', 'data-mode')) === 'north' && isometric(view), JSON.stringify(view));
  check('the choice is remembered', (await saved(page, 'settings')).follow === 'north');

  // Dragging the map stops following; the button brings it back.
  map = await box(page, '#mapPane');
  const middle = { x: map.x + map.width / 2, y: map.y + map.height / 2 };
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 90, middle.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => document.getElementById('followBtn').getAttribute('aria-pressed') === 'false');
  await mapAtRest(page);
  spot = await whereAmI(page);
  check('dragging the map stops following', spot.x > 0.65 && spot.y > 0.55, JSON.stringify(spot));
  await page.click('#followBtn');
  await page.waitForFunction(() => document.getElementById('followBtn').getAttribute('aria-pressed') === 'true');
  await mapAtRest(page);
  spot = await whereAmI(page);
  check('the button brings the map back to me', inTheMiddle(spot), JSON.stringify(spot));

  // ── Places on the map ───────────────────────────────────────────────────
  console.log('\nPlaces');
  await page.click('.map-btn[data-open="map"]');
  check('map options open', await isOpen(page, 'sheet-map'));
  const chips = () => page.locator('#placeToggles input:checked').evaluateAll((boxes) => boxes.map((b) => b.value));
  check('fuel and parking are shown to begin with', (await chips()).join() === 'fuel,parking');
  await page.locator('#placeToggles input[value="food"]').check({ force: true });
  check('choosing a kind of place is remembered', (await saved(page, 'settings')).places.join() === 'fuel,parking,food');
  await shot(page, 'map-options.png');
  await page.click('#sheet-map [data-close]');
  await mapAtRest(page);

  const places = await page.evaluate(() => {
    const live = window.__map;
    const pane = live.getContainer();
    return live.queryRenderedFeatures({ layers: ['vm-places'] }).map((feature) => {
      const point = live.project(feature.geometry.coordinates);
      return {
        name: feature.properties['name:latin'] || feature.properties.name || '',
        kind: feature.properties.class,
        x: point.x,
        y: point.y,
        // Clear of the buttons that sit on top of the map.
        free: point.x > 70 && point.x < pane.clientWidth - 70 && point.y > 70 && point.y < pane.clientHeight - 110,
      };
    });
  });
  const food = places.filter((place) => ['restaurant', 'fast_food', 'cafe'].includes(place.kind));
  check('places to eat are marked on the map', food.length >= 3, `${food.length} marked`);
  check('only the chosen kinds are marked', places.every((place) => ['restaurant', 'fast_food', 'cafe', 'bakery', 'ice_cream', 'fuel', 'parking'].includes(place.kind)));

  const target = food.find((place) => place.free && place.name) ?? food[0];
  await page.mouse.click(map.x + target.x, map.y + target.y);
  await page.waitForSelector('#place:not([hidden])');
  const nearby = food.filter((place) => Math.hypot(place.x - target.x, place.y - target.y) <= 20).map((place) => place.name);
  check('tapping a place opens its details', nearby.includes(await text(page, '#placeTitle')), `${await text(page, '#placeTitle')} not in ${nearby.join(', ')}`);
  await page.waitForFunction(() => document.querySelectorAll('#placeRows dt').length > 0);
  const rows = await page.locator('#placeRows').evaluate((list) => {
    const out = {};
    for (const label of list.querySelectorAll('dt')) out[label.textContent] = label.nextElementSibling.textContent;
    return out;
  });
  check('details come from OpenStreetMap', rows.Hours === 'Open 24 hours' && rows.Phone === '+966 11 211 2222' && rows.Food === 'Burger, Chicken' && rows.Wheelchair === 'Yes', JSON.stringify(rows));
  check('the phone number can be dialled', (await page.getAttribute('#placeRows a', 'href')) === 'tel:+966112112222');
  check('the right place was looked up', asked.overpass.some((query) => /^\[out:json\]\[timeout:10\];(node|way)\(\d+\);out tags;$/.test(query)));
  check('says what the place is and how far', /^(Restaurant|Fast food|Café) · \d+0 m away$/.test(await text(page, '#placeKind')), await text(page, '#placeKind'));
  await drawnBecomes(page, 'vm-pin', true);
  check('marks the place with a pin', true);
  check("offers the phone's own maps app for directions", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=24\.7\d+,46\.6\d+&travelmode=driving$/.test(await page.getAttribute('#placeMaps', 'href')));
  await shot(page, 'place.png');

  await page.click('#placeRoute');
  await page.waitForFunction(() => document.getElementById('placeRoute').textContent === 'Clear route');
  await mapAtRest(page);
  check('shows the route, its length and the driving time', /· 1\.2 km by road · 3 min$/.test(await text(page, '#placeKind')), await text(page, '#placeKind'));
  await drawnBecomes(page, 'vm-route', true);
  check('draws the route on the map', asked.route === 1);
  check('the map stops following so the route can be seen', (await page.getAttribute('#followBtn', 'aria-pressed')) === 'false');
  await shot(page, 'route.png');
  await page.click('#placeRoute');
  await page.waitForFunction(() => document.getElementById('placeRoute').textContent === 'Show route');
  await drawnBecomes(page, 'vm-route', false);
  check('the route can be cleared', true);
  await page.click('#placeClose');
  await drawnBecomes(page, 'vm-pin', false);
  check('closing the details removes the pin', await page.locator('#place').isHidden());

  // ── Search ──────────────────────────────────────────────────────────────
  console.log('\nSearch');
  await page.click('.map-btn[data-open="search"]');
  check('search opens', await isOpen(page, 'sheet-search'));
  await page.fill('#searchInput', 'kingdom');
  await page.waitForSelector('.result'); // searches by itself shortly after typing stops
  check('lists the places found', (await page.locator('.result').count()) === 3 && (await text(page, 'li:first-child .result-title')) === 'Kingdom Centre');
  check('says what and where each one is', (await text(page, 'li:first-child .result-detail')) === 'Shopping mall · King Fahd Road, Al `Ulayya, Riyadh, Saudi Arabia', await text(page, 'li:first-child .result-detail'));
  await page.fill('#searchInput', 'zzzz');
  await page.click('#searchForm button[type="submit"]');
  await page.waitForFunction(() => document.getElementById('searchNote').textContent.startsWith('No places found'));
  check('says so when nothing is found', (await page.locator('.result').count()) === 0);
  check('no errors in the page so far', errors.length === 0, errors.join(' | '));
  await page.fill('#searchInput', 'offline');
  await page.click('#searchForm button[type="submit"]');
  await page.waitForFunction(() => document.getElementById('searchNote').textContent.startsWith("Search isn't available"));
  check('says so when search cannot be reached', true);
  errors.length = 0; // that search was made to fail on purpose
  await page.fill('#searchInput', 'kingdom');
  await page.click('#searchForm button[type="submit"]');
  await page.waitForSelector('.result');
  await shot(page, 'search.png');
  await page.click('li:first-child .result');
  await page.waitForSelector('#place:not([hidden])');
  check('choosing a result closes search and shows the place', !(await isOpen(page, 'sheet-search')) && (await text(page, '#placeTitle')) === 'Kingdom Centre');
  await page.waitForFunction(() => {
    const centre = window.__map.getCenter();
    return Math.hypot(centre.lat - 24.7113804, centre.lng - 46.6743526) < 0.00004;
  });
  await mapAtRest(page);
  view = await camera(page);
  await drawnBecomes(page, 'vm-pin', true);
  check('the map goes to the place', metersApart(view, { lat: 24.7113804, lng: 46.6743526 }) < 5 && isometric(view), JSON.stringify(view));
  check('says how far it is and where', /^Shopping mall · \d+0 m away · King Fahd Road/.test(await text(page, '#placeKind')), await text(page, '#placeKind'));
  await page.click('#placeClose');

  // Press and hold drops a pin (a right-click does the same with a mouse).
  await page.mouse.click(map.x + 150, map.y + 200, { button: 'right' });
  await page.waitForFunction(() => document.getElementById('placeKind').textContent.includes('Near '));
  check('press and hold drops a pin and says what is near', (await text(page, '#placeTitle')) === 'Dropped pin' && /Near Olaya Towers, Al Olaya Street, Riyadh, Saudi Arabia$/.test(await text(page, '#placeKind')), await text(page, '#placeKind'));
  await page.click('#placeClose');

  // Tapping my own dot.
  await page.click('#followBtn');
  await mapAtRest(page);
  await page.click('.me');
  await page.waitForFunction(() => document.getElementById('placeKind').textContent.includes('Near '));
  const mine = await page.locator('#placeRows').evaluate((list) => {
    const out = {};
    for (const label of list.querySelectorAll('dt')) out[label.textContent] = label.nextElementSibling.textContent;
    return out;
  });
  check(
    'tapping my dot says where I am',
    (await text(page, '#placeTitle')) === 'You are here' &&
      /^24\.7\d{4}, 46\.6\d{4}$/.test(mine.Position) &&
      mine.Accuracy === 'within 10 m' &&
      mine.Altitude === '612 m' &&
      mine.Weather === '23° Clear',
    JSON.stringify(mine),
  );
  check('no route buttons for my own position', await page.locator('#placeActions').isHidden());
  await page.click('#placeClose');

  // ── Map types ───────────────────────────────────────────────────────────
  console.log('\nMap types');
  const pickType = async (type) => {
    await page.click('.map-btn[data-open="map"]');
    await page.locator(`input[name="mapType"][value="${type}"]`).check({ force: true });
    await page.click('#sheet-map [data-close]');
  };
  const hasLayer = (id) => page.waitForFunction((layer) => (window.__map.getStyle()?.layers ?? []).some((l) => l.id === layer), id);
  const nightMapUp = () =>
    page.waitForFunction(() => {
      const layers = window.__map.getStyle()?.layers ?? [];
      return layers.some((l) => l.id === 'vm-places') && !layers.some((l) => ['city-buildings', 'building-3d', 'imagery', 'osm'].includes(l.id));
    });
  const overlaysKept = async () => {
    const ids = await layerIds(page);
    const filter = JSON.stringify(await page.evaluate(() => window.__map.getFilter('vm-places')));
    return ids.includes('vm-places') && ids.includes('vm-route') && filter.includes('restaurant') && filter.includes('parking');
  };

  await pickType('streets');
  await hasLayer('building-3d');
  await page.waitForFunction(() => window.__map.getPitch() < 1);
  await mapAtRest(page);
  spot = await whereAmI(page);
  view = await camera(page);
  check('Streets: the coloured street map, seen from straight above', (await overlaysKept()) && inTheMiddle(spot) && near(view.bearing, 0, 0.5), JSON.stringify(spot));
  check('Streets: back to the ordinary lens, with no sun or shadows of its own', near(view.lens, 36.87, 0.01) && !(await layerIds(page)).includes('city-shadows'), `lens ${view.lens}`);
  check('Streets: the button says north is up', /north up/.test(await page.getAttribute('#followBtn', 'aria-label')), await page.getAttribute('#followBtn', 'aria-label'));
  check('Streets: no simulated traffic outside the 3D city', !(await page.evaluate(() => window.__map.getLayersOrder())).includes('city-life'));
  await shot(page, 'map-streets.png');

  await pickType('night');
  await nightMapUp();
  await mapAtRest(page);
  check('Night: a dark street map', await overlaysKept());
  check('Night: place names turn light', (await page.evaluate(() => window.__map.getPaintProperty('vm-places', 'text-color'))) === '#ffffff');
  await shot(page, 'map-night.png');

  await pickType('satellite');
  await hasLayer('imagery');
  await mapAtRest(page);
  check('Satellite: photos with the street names on top', (await overlaysKept()) && (await layerIds(page)).includes('highway-name-major'));
  check('Satellite: road names still work', (await text(page, '#roadName')) !== '');
  // The photo is fetched as sharp as the screen shows it. This phone has two real pixels to each of the map's:
  // one level finer than a map asks for on its own, which at this zoom is level 18.
  const sharp = await page.evaluate(() => ({ tileSize: window.__map.getSource('imagery').tileSize, most: window.__map.getSource('imagery').maxzoom, zoom: window.__map.getZoom(), ratio: window.devicePixelRatio, way: window.__map.getSource('imagery').tiles[0] }));
  check(
    'Satellite: the photo is fetched a level finer for a sharp screen',
    sharp.ratio === 2 && sharp.tileSize === 128 && sharp.most === 19 && sharp.way === 'photo://{z}/{y}/{x}' && sharp.zoom >= 16 && sharp.zoom < 17 && asked.photoTiles[18] > 4 && asked.photoMaps[18] >= 1 && !asked.photoTiles[19],
    JSON.stringify({ ...sharp, tiles: asked.photoTiles, asked: asked.photoMaps }),
  );
  // Under the sharp photo lies the coarse one, which is there at once: the ground is never bare while the sharp one comes in.
  const under = await page.evaluate(() => {
    const order = window.__map.getLayersOrder();
    const base = window.__map.getSource('imagery-base');
    return { rightUnder: order.indexOf('imagery-base') === order.indexOf('imagery') - 1, tileSize: base?.tileSize, most: base?.maxzoom };
  });
  check('Satellite: under the sharp photo lies the coarse one, there at once', under.rightUnder && under.tileSize === 256 && under.most === 17 && asked.photoTiles[17] > 0, JSON.stringify({ ...under, tiles: asked.photoTiles }));
  // Closer in the map asks for a level the photo does not come at here. It is told so without fetching a
  // single tile of it, and shows the level it has.
  await page.evaluate(() => window.__map.setZoom(17.3));
  await page.waitForFunction(() => window.__map.getZoom() > 17.2 && window.__map.loaded());
  await page.waitForFunction((maps) => maps > 0, asked.photoMaps[19] ?? 0).catch(() => {});
  await page.waitForTimeout(1500);
  check('Satellite: where the photo does not come as sharp as asked, the level it has is shown, and nothing is fetched in vain', (asked.photoMaps[19] ?? 0) >= 1 && !asked.photoTiles[19] && asked.photoTiles[18] > 4 && errors.length === 0, JSON.stringify({ tiles: asked.photoTiles, asked: asked.photoMaps, errors }));
  await page.evaluate(() => window.__map.setZoom(16));
  await page.waitForFunction(() => window.__map.getZoom() < 16.1 && window.__map.loaded());
  // The sharp photo takes more to download: it can be switched off.
  await page.click('.map-btn[data-open="map"]');
  check('the sharp photo switch says what it costs', /mobile data/i.test(await text(page, '.setting:has(#optSharp) .setting-note')), await text(page, '.setting:has(#optSharp) .setting-note'));
  await page.locator('#optSharp').uncheck();
  await page.waitForFunction(() => window.__map.getSource('imagery')?.tileSize === 256, null, { timeout: 45000 });
  check('the sharp photo can be turned off', (await saved(page, 'settings')).sharp === false && !(await layerIds(page)).includes('imagery-base'));
  await page.locator('#optSharp').check();
  await page.waitForFunction(() => window.__map.getSource('imagery')?.tileSize === 128, null, { timeout: 45000 });
  check('and on again', (await saved(page, 'settings')).sharp === true);
  await page.click('#sheet-map [data-close]');
  await mapAtRest(page);

  await pickType('detailed');
  await hasLayer('osm');
  await mapAtRest(page);
  check('Detailed: the classic OpenStreetMap picture', (await overlaysKept()) && !(await layerIds(page)).includes('building-3d'));
  await drive(page, 60);
  check('Detailed: road names still work', (await text(page, '#roadName')) !== '');

  await pickType('city');
  await hasLayer('city-buildings');
  await page.waitForFunction(() => window.__map.getPitch() > 54);
  await mapAtRest(page);
  view = await camera(page);
  check('3D City can be chosen by name, and is isometric again', (await overlaysKept()) && (await saved(page, 'settings')).mapType === 'city' && isometric(view), JSON.stringify(view));
  await page.waitForFunction(() => window.__map.querySourceFeatures('city-shade').length > 0, null, { timeout: 15000 });
  light = await page.evaluate(() => window.__map.getLight());
  check('3D City: the sun and the shadows come back with it', light.anchor === 'map');

  check('the 3D city is the look the app opens with, and the old "Auto" is gone', (await page.locator('input[name="mapType"]').count()) === 5 && (await page.locator('input[name="mapType"][value="auto"]').count()) === 0);
  // A phone in dark mode gets the same map: the 3D city has a night of its own, which goes by the sun.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(400);
  check('the phone going dark does not change the map', (await layerIds(page)).includes('city-buildings'));
  await page.emulateMedia({ colorScheme: 'light' });
  check('the map type is remembered', (await saved(page, 'settings')).mapType === 'city');

  // ── The light of the 3D city ────────────────────────────────────────────
  console.log('\nDay and night in the 3D city');
  const pickLight = async (mode) => {
    await page.click('.map-btn[data-open="map"]');
    await page.locator(`input[name="light"][value="${mode}"]`).check({ force: true });
    await page.click('#sheet-map [data-close]');
  };
  await page.click('.map-btn[data-open="map"]');
  const lightNote = await text(page, '.setting:has(input[name="light"]) .setting-note');
  check('the light can be left to the real sun over Riyadh, or set to day or to night', /sun over Riyadh/.test(lightNote) && /whatever the hour/.test(lightNote) && (await page.locator('input[name="light"]:checked').getAttribute('value')) === 'sun', lightNote);
  await page.click('#sheet-map [data-close]');
  await mapAtRest(page);
  let lit = await lightNow(page);
  let picture = await pictureOfMap(page);
  check(
    'by day: no dark over the city, no lamp lit, the sun and its shadows',
    lit.mode === 'sun' && lit.night === 0 && lit.scene === 0 && lit.day === 1 && lit.veil === 0 && lit.glow === 0 && lit.dots === 0 && lit.pools === 0 && lit.anchor === 'map' && lit.shadows > 20 && lit.headlights === 0,
    JSON.stringify(lit),
  );
  check('by day the lamp posts stand along the streets all the same, unlit', lit.streetLamps > 100 && lit.lampWays > 20 && lit.posts >= lit.streetLamps * 24 && lit.lamplight > 0, JSON.stringify({ lamps: lit.streetLamps, ways: lit.lampWays, posts: lit.posts, light: lit.lamplight }));
  check('by day the picture is a bright one, with next to nothing in it the colour of lamplight', picture.mean > 140 && picture.dark < 0.2 && picture.amber < 0.04, JSON.stringify(picture));
  const byDay = picture;
  const namesByDay = [lit.streetNames, lit.streetEdges];

  await pickLight('night');
  await page.waitForFunction(() => window.__map.getLayer('city-life')?.implementation.night === 1 && window.__map.getPaintProperty('city-night', 'background-opacity') > 0.8 && window.__map.getSource('city-shade').serialize().data.features.length === 0, null, { timeout: 30000 });
  await page.waitForFunction(() => (window.__map.getLayer('city-life')?.implementation.parts.get('lights')?.mesh.count ?? 0) > 0, null, { timeout: 15000 });
  await mapAtRest(page);
  lit = await lightNow(page);
  check(
    'Night: in the middle of the morning the city is shown by night: a dark over the ground, the lamps\' light along the roads, no sun and no shadows',
    lit.mode === 'night' && lit.night === 1 && lit.lamps === 1 && lit.styled === 1 && lit.scene === 1 && lit.day === 0 && lit.veil > 0.8 && lit.veil < 0.95 && lit.glow > 0.2 && lit.dots > 0.8 && lit.pools > 0.5 && lit.anchor === 'viewport' && lit.shadows === 0,
    JSON.stringify(lit),
  );
  check(
    'Night: street lamps with their pools of light, headlights, the light from shop windows and the lamps left on up on the roofs are drawn, over everything else',
    lit.lamplight >= lit.streetLamps * 30 && lit.headlights > 200 && lit.spill > 0 && JSON.stringify(lit.glowing) === '["lamplight","lights","rooflights","spill"]' && lit.roofLamps > 20,
    JSON.stringify({ lamps: lit.streetLamps, light: lit.lamplight, headlights: lit.headlights, spill: lit.spill, glowing: lit.glowing, roofLamps: lit.roofLamps }),
  );
  check('Night: the names are written light on dark, the app\'s own and the street map\'s', lit.names === '#ffffff' && lit.streetNames === '#ece8df' && lit.walls === 1, JSON.stringify({ names: lit.names, streets: lit.streetNames, walls: lit.walls }));
  const brightOf = (hex) => Math.max(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  check('Night: the blocks the map draws and the sky are dark', brightOf(lit.block) < 70 && brightOf(lit.sky) < 40, `${lit.block} ${lit.sky}`);
  picture = await pictureOfMap(page);
  check(
    'Night: the picture is a dark one, its streets in the amber of lamplight, with points of bright light in it',
    picture.mean < byDay.mean * 0.5 && picture.mean < 80 && picture.dark > 0.6 && picture.bright > 0.002 && picture.bright < 0.25 && picture.amber > 0.05 && picture.amber > byDay.amber * 3,
    `${JSON.stringify(picture)} (by day ${JSON.stringify(byDay)})`,
  );
  check('Night: no errors', errors.length === 0, errors.join(' | '));
  await shot(page, 'map-city-night.png');
  // The lights of the traffic move with it.
  const lightsBefore = await page.evaluate(() => Array.from(window.__map.getLayer('city-life').implementation.parts.get('lights').mesh.positions.subarray(0, 300)).map((value) => value.toFixed(1)).join(','));
  await page.waitForTimeout(800);
  const lightsAfter = await page.evaluate(() => Array.from(window.__map.getLayer('city-life').implementation.parts.get('lights').mesh.positions.subarray(0, 300)).map((value) => value.toFixed(1)).join(','));
  check('Night: the headlights move with the traffic', lightsBefore !== lightsAfter);
  check('Night: the choice is remembered', (await saved(page, 'settings')).light === 'night');
  // Seen from across the city the lamps are dots of light along the roads, and the app's own are gone.
  await page.evaluate(() => window.__map.jumpTo({ zoom: 14.2 }));
  await mapAtRest(page);
  const far = await page.evaluate(() => ({ dots: window.__map.queryRenderedFeatures({ layers: ['city-lamps'] }).length, glow: window.__map.queryRenderedFeatures({ layers: ['city-glow'] }).length, scene: window.__map.getLayer('city-life').implementation.opacity }));
  picture = await pictureOfMap(page);
  check('Night: from across the city the lamps are dots of light along the glowing roads', far.dots > 50 && far.glow > 50 && far.scene === 0 && picture.mean < 80 && picture.dark > 0.7 && picture.amber > 0.02, `${JSON.stringify(far)} ${JSON.stringify(picture)}`);
  await shot(page, 'map-city-night-far.png');
  await page.evaluate(() => window.__map.jumpTo({ zoom: 16.5 }));
  await mapAtRest(page);

  await pickLight('day');
  await page.waitForFunction(() => window.__map.getLayer('city-life')?.implementation.night === 0 && window.__map.getPaintProperty('city-night', 'background-opacity') === 0 && window.__map.getSource('city-shade').serialize().data.features.length > 0, null, { timeout: 30000 });
  await mapAtRest(page);
  lit = await lightNow(page);
  // (In the morning the real sun stands high enough to do for "day": the light is the same as by the clock.)
  light = await page.evaluate(() => window.__map.getLight());
  check('Day: the dark lifts, the lamps go out, the sun and its shadows are back', lit.mode === 'day' && lit.night === 0 && lit.veil === 0 && lit.glow === 0 && lit.anchor === 'map' && lit.shadows > 20 && lit.headlights === 0 && lit.names !== '#ffffff' && lit.walls === 0 && turn(light.position[1], sun.azimuth) < 3, JSON.stringify(lit));
  check('Day: the names are written as they were before the night, dark with their light edge', JSON.stringify([lit.streetNames, lit.streetEdges]) === JSON.stringify(namesByDay) && lit.streetNames !== '#ece8df', `${JSON.stringify([lit.streetNames, lit.streetEdges])} against ${JSON.stringify(namesByDay)}`);
  picture = await pictureOfMap(page);
  check('Day: the picture is as bright as it was', Math.abs(picture.mean - byDay.mean) < 12, `${picture.mean} against ${byDay.mean}`);
  await pickLight('sun');
  await page.waitForFunction(() => window.__map.getLayer('city-life')?.implementation.counts().night.mode === 'sun');
  await mapAtRest(page);
  check('Real time: back to the light of the hour', (await saved(page, 'settings')).light === 'sun' && (await lightNow(page)).night === 0);

  // Switches.
  await page.click('.map-btn[data-open="map"]');
  await page.locator('#optRoad').uncheck();
  check('road name and speed limit can be turned off', (await page.locator('#road').isHidden()) && (await page.locator('#limit').isHidden()));
  await page.locator('#optRoad').check();
  await page.waitForSelector('#road:not([hidden])');
  await page.waitForSelector('#limit:not([hidden])');
  await page.locator('#optWeather').uncheck();
  check('weather can be turned off', await page.locator('#weather').isHidden());
  await page.locator('#optWeather').check();
  await page.waitForSelector('#weather:not([hidden])');
  check('the traffic switch says it is a simulation', /simulation, not live traffic/i.test(await text(page, '.setting:has(#optTraffic) .setting-note')), await text(page, '.setting:has(#optTraffic) .setting-note'));
  await page.locator('#optTraffic').uncheck();
  await page.waitForFunction(() => (window.__map.getLayer('city-life')?.implementation.parts.get('traffic')?.mesh.count ?? 0) === 0, null, { timeout: 15000 });
  check('moving traffic can be turned off, and the parked cars go with it', (await sceneCorners(page, 'street')) === 0 && (await sceneCorners(page, 'roofs')) > 0 && (await saved(page, 'settings')).traffic === false);
  await page.locator('#optTraffic').check();
  await page.waitForFunction(() => (window.__map.getLayer('city-life')?.implementation.parts.get('traffic')?.mesh.count ?? 0) > 0, null, { timeout: 15000 });
  check('and on again', (await saved(page, 'settings')).traffic === true);
  // Reading the satellite photo: the stand-in photo is featureless, so it yields nothing, quietly.
  check('the photo switch says its results are an estimate', /an estimate/i.test(await text(page, '.setting:has(#optPhoto) .setting-note')), await text(page, '.setting:has(#optPhoto) .setting-note'));
  check('the photo was asked for its date once', asked.photoDay === 1, `asked ${asked.photoDay} times`);
  check('a photo that shows nothing raises no buildings and plants no trees', (await sceneCounts(page)).photo.heights === 0 && (await sceneCorners(page, 'trees')) === 0);
  await page.locator('#optPhoto').uncheck();
  check('reading the photo can be turned off', (await saved(page, 'settings')).photo === false);
  // Without the photo the roofs are still there, in the usual shades instead of the colours it showed.
  const photoTint = roofs.photoTint;
  const roofShades = () =>
    page.evaluate((tint) => {
      const sceneLayer = window.__map.getLayer('city-life').implementation;
      const mesh = sceneLayer.roofs.mesh;
      const tints = new Set();
      let ofThePhoto = 0;
      for (let i = 0; i < mesh.count; i += 1) {
        const [red, green, blue] = mesh.tints.subarray(i * 4, i * 4 + 3);
        tints.add(`${red},${green},${blue}`);
        if (red === tint[0] && green === tint[1] && blue === tint[2]) ofThePhoto += 1;
      }
      return { corners: mesh.count, ofThePhoto, shades: tints.size, furnished: sceneLayer.counts().buildings.roofs?.furnished ?? 0, on: sceneLayer.counts().photo.on };
    }, photoTint);
  await page.waitForFunction(
    (tint) => {
      const mesh = window.__map.getLayer('city-life')?.implementation.roofs.mesh;
      if (!mesh || mesh.count === 0) return false;
      for (let i = 0; i < mesh.count; i += 1) if (mesh.tints[i * 4] === tint[0] && mesh.tints[i * 4 + 1] === tint[1] && mesh.tints[i * 4 + 2] === tint[2]) return false;
      return true;
    },
    photoTint,
    { timeout: 20000 },
  );
  const plainRoofs = await roofShades();
  check('without the photo the roofs are in the usual shades, with their made-up furniture', plainRoofs.on === false && plainRoofs.corners > 900 && plainRoofs.ofThePhoto === 0 && plainRoofs.shades >= 5 && plainRoofs.furnished > 300, JSON.stringify(plainRoofs));
  await page.locator('#optPhoto').check();
  check('and on again', (await saved(page, 'settings')).photo === true);
  await page.waitForFunction(
    (tint) => {
      const mesh = window.__map.getLayer('city-life')?.implementation.roofs.mesh;
      let ofThePhoto = 0;
      for (let i = 0; i < (mesh?.count ?? 0); i += 1) if (mesh.tints[i * 4] === tint[0] && mesh.tints[i * 4 + 1] === tint[1] && mesh.tints[i * 4 + 2] === tint[2]) ofThePhoto += 1;
      return ofThePhoto > 900;
    },
    photoTint,
    { timeout: 30000 },
  );
  const readRoofs = await roofShades();
  check("and the roofs take the photo's colours again", readRoofs.on === true && readRoofs.ofThePhoto > readRoofs.corners * 0.4, JSON.stringify(readRoofs));
  await mapAtRest(page);
  // Drawing every wall window by window is work for the phone with every picture: it can be switched off.
  await page.waitForFunction(() => (window.__map.getLayer('city-life')?.implementation.walls.mesh?.count ?? 0) > 0 && window.__map.getLayer('city-life').implementation.shadow.ready, null, { timeout: 30000 });
  check('the switch for detailed walls says when to turn it off', /slowly/i.test(await text(page, '.setting:has(#optDetail) .setting-note')), await text(page, '.setting:has(#optDetail) .setting-note'));
  await page.locator('#optDetail').uncheck();
  await page.waitForFunction(() => {
    const sceneLayer = window.__map.getLayer('city-life').implementation;
    return sceneLayer.walls.mesh.count === 0 && !sceneLayer.shadow.ready;
  }, null, { timeout: 20000 });
  const plain = (await sceneCounts(page)).detail;
  const plainTops = await page.evaluate(() => {
    const sceneLayer = window.__map.getLayer('city-life').implementation;
    return { ...sceneLayer.counts().buildings.roofs, parapetCorners: sceneLayer.parts.get('parapets').mesh.count };
  });
  check(
    "detailed walls and shadows can be turned off: the walls are the map's own again, and the roofs stay",
    (await saved(page, 'settings')).detail === false && plain.on === false && plain.walls === null && plain.shadows === null && plainTops.decks > 300 && plainTops.strips === 0 && plainTops.parapetCorners === 0 && plainTops.furnished > 300,
    JSON.stringify({ ...plain, roofs: plainTops }),
  );
  await page.locator('#optDetail').check();
  await page.waitForFunction(() => {
    const sceneLayer = window.__map.getLayer('city-life').implementation;
    return sceneLayer.walls.mesh.count > 0 && sceneLayer.shadow.ready;
  }, null, { timeout: 20000 });
  check('and on again', (await saved(page, 'settings')).detail === true && (await sceneCounts(page)).detail.walls.buildings > 300);
  await page.click('#sheet-map [data-close]');

  // Units.
  await page.click('#speed');
  check(
    'miles: speed, limit and weather all change',
    (await text(page, '#speedValue')) === '31' && (await text(page, '#speedUnit')) === 'mph' && (await text(page, '#limit')) === '35' && (await text(page, '#weather')) === '73° Clear',
    `${await text(page, '#speedValue')} ${await text(page, '#limit')} ${await text(page, '#weather')}`,
  );
  await page.click('#speed');
  check('and back to kilometres', (await text(page, '#speedValue')) === '50' && (await text(page, '#limit')) === '60');

  // ── Video ───────────────────────────────────────────────────────────────
  console.log('\nVideo');
  check('starts with no video', await page.locator('#videoEmpty').isVisible());

  await page.click('.seg-btn[data-layout="video"]');
  video = await box(page, '#videoPane');
  check('video only: video fills the screen', near(video.height, 844 - 48, 1) && (await page.locator('#mapPane').isHidden()));
  await page.click('.seg-btn[data-layout="map"]');
  video = await box(page, '#videoPane');
  map = await box(page, '#mapPane');
  check('map only: map fills the screen', near(video.height, 0, 0.5) && near(map.height, 844 - 48, 1));
  await mapAtRest(page);
  check('map only: the map redraws at full size', near(await page.evaluate(() => window.__map.getCanvas().getBoundingClientRect().height), 844 - 48, 1));
  await page.click('.seg-btn[data-layout="both"]');
  video = await box(page, '#videoPane');
  check('both: back to the split screen', near(video.height, 219, 1.5));

  const grip = await box(page, '#grip');
  const gripCentre = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(gripCentre.x, gripCentre.y);
  await page.mouse.down();
  await page.mouse.move(gripCentre.x, gripCentre.y + 100, { steps: 5 });
  await page.mouse.up();
  const resized = await box(page, '#videoPane');
  check('dragging the bar resizes the panes', near(resized.height, video.height + 100, 2), `height ${resized.height}`);
  await mapAtRest(page);
  check('the map redraws at its new size', near(await page.evaluate(() => window.__map.getCanvas().getBoundingClientRect().height), 844 - 48 - resized.height, 1));

  await page.click('.bar-btn[data-open="source"]');
  check('video chooser opens', await isOpen(page, 'sheet-source'));
  await page.click('#linkForm button[type="submit"]');
  check('empty link is refused', (await text(page, '#linkError')) === 'Paste a link first.');
  await page.fill('#linkInput', 'my holiday video');
  await page.click('#linkForm button[type="submit"]');
  check('nonsense link is refused', (await text(page, '#linkError')) === "That doesn't look like a video link.");

  await page.fill('#linkInput', 'https://youtu.be/aqz-KE-bpKQ?t=1m5s');
  await page.click('#linkForm button[type="submit"]');
  await page.waitForSelector('#embed iframe');
  const frameSrc = new URL(await page.getAttribute('#embed iframe', 'src'));
  check(
    'YouTube link opens the YouTube player',
    frameSrc.origin === 'https://www.youtube-nocookie.com' &&
      frameSrc.pathname === '/embed/aqz-KE-bpKQ' &&
      frameSrc.searchParams.get('start') === '65' &&
      frameSrc.searchParams.get('playsinline') === '1',
    frameSrc.href,
  );
  check('chooser closes after picking', !(await isOpen(page, 'sheet-source')));
  check('YouTube player fills the video pane', near((await box(page, '#embed iframe')).height, resized.height, 1));

  // The link box only accepts real-looking addresses, so use the numeric form of localhost.
  const clipUrl = `${base.replace('localhost', '127.0.0.1')}/tests/fixtures/clip.webm`;
  await page.click('.bar-btn[data-open="source"]');
  check('recent links lists the YouTube video', (await page.locator('.recent-play').allTextContents()).join('|') === 'YouTube · aqz-KE-bpKQ');
  await page.fill('#linkInput', clipUrl);
  await page.click('#linkForm button[type="submit"]');
  await page.waitForFunction(() => {
    const el = document.getElementById('player');
    return !el.hidden && el.readyState >= 2 && !el.paused && el.currentTime > 0.2;
  });
  check('direct video link plays', true);
  check('the YouTube player is gone', (await page.locator('#embed iframe').count()) === 0);
  await page.evaluate(() => {
    document.getElementById('player').loop = true;
  });
  await shot(page, 'video-and-map.png');

  await page.click('.bar-btn[data-open="source"]');
  check(
    'newest link is first in recent links',
    (await page.locator('.recent-play').allTextContents()).join('|') === 'clip.webm · 127.0.0.1|YouTube · aqz-KE-bpKQ',
  );
  check('the link box is emptied after playing', (await page.inputValue('#linkInput')) === '');

  // A very long link name must be shortened, not push the sheet wider than the screen.
  await page.click('#sheet-source [data-close]');
  const longLink = `https://media.example.com/films/${'a-very-long-file-name-'.repeat(6)}final.mp4`;
  await page.evaluate((href) => {
    const key = 'video-map:recents';
    localStorage.setItem(key, JSON.stringify([href, ...JSON.parse(localStorage.getItem(key))]));
  }, longLink);
  await page.click('.bar-btn[data-open="source"]');
  const sheetFit = await page.locator('#sheet-source .sheet-body').evaluate((el) => ({
    scrolls: el.scrollWidth > el.clientWidth,
    left: el.getBoundingClientRect().left,
    right: el.getBoundingClientRect().right,
    title: document.getElementById('sourceTitle').getBoundingClientRect().left,
  }));
  check(
    'a long link name does not widen the chooser',
    !sheetFit.scrolls && sheetFit.left >= 0 && sheetFit.right <= 390 && sheetFit.title >= 16,
    JSON.stringify(sheetFit),
  );
  await page.click('.recent-item:nth-child(1) .recent-remove');
  await page.click('.recent-item:nth-child(2) .recent-remove');
  check('a recent link can be removed', (await page.locator('.recent-play').count()) === 1);
  await page.click('#stopVideo');
  check('closing the video returns to the empty state', (await page.locator('#videoEmpty').isVisible()) && (await page.locator('#player').isHidden()));

  await page.setInputFiles('#filePickerMain', CLIP);
  await page.waitForFunction(() => {
    const el = document.getElementById('player');
    return !el.hidden && el.src.startsWith('blob:') && el.readyState >= 2 && el.currentTime > 0.2;
  });
  check('a video file from the phone plays', true);

  await page.click('.bar-btn[data-open="source"]');
  await page.setInputFiles('#filePickerSheet', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a video') });
  await page.waitForSelector('#videoError:not([hidden])');
  check('a file that is not a video gets a clear message', (await text(page, '#videoErrorText')).startsWith("This phone can't play that file."));
  await page.click('#videoError button');
  check('"Choose another video" reopens the chooser', await isOpen(page, 'sheet-source'));
  await page.click('#sheet-source [data-close]');

  // ── Settings ────────────────────────────────────────────────────────────
  console.log('\nSettings');
  await page.click('.bar-btn[data-open="menu"]');
  check('settings open', await isOpen(page, 'sheet-menu'));
  check('Home Screen tip is shown in the browser', await page.locator('#installHint').isVisible());
  check(
    'credits name every data source',
    await page.locator('.about').evaluate((el) => ['OpenStreetMap', 'OpenFreeMap', 'Esri', 'Photon', 'Overpass', 'OSRM', 'Open-Meteo', 'MapLibre'].every((name) => el.textContent.includes(name))),
  );
  await shot(page, 'settings.png');
  await page.locator('input[name="unit"][value="mph"]').check({ force: true });
  check('units change to miles', (await text(page, '#speedUnit')) === 'mph');
  await page.locator('input[name="unit"][value="kmh"]').check({ force: true });
  check('keep-screen-on switch reflects the setting', await page.locator('#optAwake').evaluate((el) => el.disabled || el.checked));
  await page.locator('#optSwap').check();
  video = await box(page, '#videoPane');
  map = await box(page, '#mapPane');
  check('"Map first" puts the map on top', map.y < video.y && near(map.y, 0, 0.5));
  await page.locator('#optSwap').uncheck();
  await page.click('#sheet-menu [data-close]');
  const settings = await saved(page, 'settings');
  check('settings are saved', settings.unit === 'kmh' && settings.swap === false && settings.layout === 'both' && settings.roadInfo === true && settings.weather === true);

  await page.reload();
  await page.waitForSelector('.me');
  await styleHas(page, 'city-buildings');
  await mapAtRest(page);
  check('the size is remembered', near((await box(page, '#videoPane')).height, resized.height, 1));
  check('following restarts by itself after reopening', (await page.getAttribute('#followBtn', 'aria-pressed')) === 'true');
  check('the chosen places are still shown', (await chips()).join() === 'fuel,parking,food');

  check('no errors in the page', errors.length === 0, errors.join(' | '));
  await context.close(); // in a recording run, this writes tests/fixtures/map.har and buildings.har
  if (RECORD) {
    tidyRecording();
    tidyBuildings();
  }

  // ── 2. Phone sideways ───────────────────────────────────────────────────
  console.log('\nPhone sideways');
  const side = await newPhone({ width: 844, height: 390 });
  await side.page.goto(`${base}/`);
  await side.page.waitForSelector('.me');
  await styleHas(side.page, 'city-buildings');
  await mapAtRest(side.page);
  video = await box(side.page, '#videoPane');
  bar = await box(side.page, '#bar');
  map = await box(side.page, '#mapPane');
  check('panes sit side by side', near(video.y, 0, 0.5) && near(map.y, 0, 0.5) && near(video.height, 390, 0.5) && near(map.height, 390, 0.5));
  check('video takes a little over half', near(video.width, Math.round((844 - 48) * 0.55), 0.5), `width ${video.width}`);
  check('bar stands upright between them', near(bar.width, 48, 0.5) && near(bar.x, video.width, 1) && near(map.x + map.width, 844, 1));
  await side.page.waitForSelector('#road:not([hidden])');
  const overlaps = await side.page.evaluate(() => {
    const names = ['.map-tools', '#road', '.maplibregl-ctrl-top-right .maplibregl-ctrl-group', '.map-gauges', '#followBtn'];
    const parts = names.map((selector) => document.querySelector(selector).getBoundingClientRect());
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const clashes = [];
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        if (hit(parts[i], parts[j])) clashes.push(`${names[i]} with ${names[j]}`);
      }
    }
    return clashes;
  });
  check('nothing on the narrow map overlaps', overlaps.length === 0, overlaps.join('; '));
  const sideGrip = await box(side.page, '#grip');
  await side.page.mouse.move(sideGrip.x + sideGrip.width / 2, sideGrip.y + sideGrip.height / 2);
  await side.page.mouse.down();
  await side.page.mouse.move(sideGrip.x + sideGrip.width / 2 - 120, sideGrip.y + sideGrip.height / 2, { steps: 5 });
  await side.page.mouse.up();
  check('dragging the bar sideways resizes the panes', near((await box(side.page, '#videoPane')).width, video.width - 120, 2));
  await side.page.click('#followBtn');
  await side.page.waitForFunction(() => document.getElementById('followBtn').dataset.mode === 'heading' && Math.abs(window.__map.getBearing() - 45) > 5);
  await side.page.setInputFiles('#filePickerMain', CLIP);
  await side.page.evaluate(() => {
    document.getElementById('player').loop = true;
  });
  await side.page.waitForFunction(() => document.getElementById('player').currentTime > 0.5);
  await mapAtRest(side.page);
  await shot(side.page, 'sideways-driving.png');

  await side.page.setViewportSize({ width: 390, height: 844 });
  await side.page.waitForTimeout(700);
  const upright = await box(side.page, '#mapPane');
  check('turning the phone upright rearranges the screen without reloading', near(upright.width, 390, 0.5) && near(upright.y + upright.height, 844, 1));
  check('the video keeps playing through the turn', await side.page.evaluate(() => !document.getElementById('player').paused));

  await side.page.setViewportSize({ width: 844, height: 390 });
  await side.page.click('.bar-btn[data-open="menu"]');
  const sideSheet = await box(side.page, '#sheet-menu');
  check('settings fit on the sideways screen', sideSheet.y >= 0 && near(sideSheet.y + sideSheet.height, 390, 0.5) && sideSheet.width <= 844);
  check('no errors in the page', side.errors.length === 0, side.errors.join(' | '));
  await side.context.close();

  // ── 3. The 3D city at night, and a small phone in the dark ──────────────
  console.log('\n3D city after dark');
  const late = await newPhone({ time: MIDNIGHT });
  await late.page.goto(`${base}/`);
  await late.page.waitForSelector('.me');
  await styleHas(late.page, 'city-buildings');
  await late.page.waitForFunction(() => window.__map.getPitch() > 54);
  await mapAtRest(late.page);
  await late.page.waitForTimeout(1500); // longer than the pause before shadows are laid
  const dark = await late.page.evaluate(() => ({
    light: window.__map.getLight(),
    shadows: window.__map.getSource('city-shade').serialize().data.features.length,
  }));
  check('with the sun down the city has an even light and no shadows', dark.light.anchor === 'viewport' && dark.shadows === 0, JSON.stringify(dark));
  // And it is night there: by the clock alone, with nothing chosen.
  await late.page.waitForFunction(() => (window.__map.getLayer('city-life')?.implementation.parts.get('lights')?.mesh.count ?? 0) > 0, null, { timeout: 15000 });
  const lateLight = await lightNow(late.page);
  check(
    'at midnight the city is dark and lit by its lamps, of its own accord',
    lateLight.mode === 'sun' && lateLight.night === 1 && lateLight.styled === 1 && lateLight.veil > 0.8 && lateLight.glow > 0.2 && lateLight.names === '#ffffff' && lateLight.walls === 1 && lateLight.streetLamps > 100 && lateLight.headlights > 0,
    JSON.stringify(lateLight),
  );
  const latePicture = await pictureOfMap(late.page);
  check('at midnight the picture is a dark one with the amber of lamplight in it', latePicture.mean < 80 && latePicture.dark > 0.6 && latePicture.bright > 0.002 && latePicture.amber > 0.05, JSON.stringify(latePicture));
  // (It started that way: the city was never drawn by day first.)
  check('a city opened by night starts by night', (await late.page.evaluate(() => window.__view?.busy?.night ?? window.__map.getLayer('city-life').implementation.counts().busy.night)) === 0, 'the dark was laid with the style, not after it');
  await shot(late.page, 'city-midnight.png');
  // Shown by day at midnight: a sun is put in the sky for it.
  await late.page.click('.map-btn[data-open="map"]');
  await late.page.locator('input[name="light"][value="day"]').check({ force: true });
  await late.page.click('#sheet-map [data-close]');
  await late.page.waitForFunction(() => window.__map.getLayer('city-life')?.implementation.night === 0 && window.__map.getSource('city-shade').serialize().data.features.length > 0, null, { timeout: 30000 });
  await mapAtRest(late.page);
  const shownByDay = await lightNow(late.page);
  const shownSun = await late.page.evaluate(() => window.__map.getLight().position);
  check('Day at midnight: the city is shown under a morning sun from the south-east', shownByDay.night === 0 && shownByDay.veil === 0 && shownByDay.anchor === 'map' && shownByDay.shadows > 20 && near(shownSun[1], 128, 0.5) && near(shownSun[2], 46, 0.5), JSON.stringify({ ...shownByDay, sun: shownSun }));
  await late.page.click('.map-btn[data-open="map"]');
  await late.page.locator('input[name="light"][value="sun"]').check({ force: true });
  await late.page.click('#sheet-map [data-close]');
  await late.page.waitForFunction(() => window.__map.getLayer('city-life')?.implementation.night === 1 && window.__map.getPaintProperty('city-night', 'background-opacity') > 0.8, null, { timeout: 30000 });
  await mapAtRest(late.page);
  // Midnight in Riyadh: the last bus and the last train have gone, the cars have not.
  await late.page.waitForFunction(() => (window.__map.getLayer('city-life')?.implementation.parts.get('traffic')?.mesh.count ?? 0) > 0, null, { timeout: 15000 });
  const night = (await sceneCounts(late.page)).life;
  check('after midnight no bus and no train is running', night.buses === 0 && night.trains === 0 && night.vehicles > 10 && night.busStops > 0, JSON.stringify(night));
  check('no errors in the page', late.errors.length === 0, late.errors.join(' | '));
  await late.context.close();

  // Dusk: the sun on the horizon over Riyadh. (At the March equinox that is at six in the evening there, three by Greenwich.)
  const dusk = await newPhone({ time: '2026-03-20T15:00:00Z' });
  await dusk.page.goto(`${base}/`);
  await dusk.page.waitForSelector('.me');
  await styleHas(dusk.page, 'city-buildings');
  await mapAtRest(dusk.page);
  const half = await lightNow(dusk.page);
  check(
    'at dusk the light goes little by little: the city is half dark, and the lamps are coming on',
    half.night > 0.15 && half.night < 0.5 && half.veil > 0.1 && half.veil < 0.5 && Math.abs(half.veil - 0.88 * half.styled) < 0.01 && half.lamps > 0.1 && half.lamps < 1 && half.glow > 0 && half.glow < 0.36 && half.names !== '#ffffff' && half.anchor === 'viewport' && half.shadows === 0,
    JSON.stringify(half),
  );
  const duskPicture = await pictureOfMap(dusk.page);
  check('at dusk the picture is neither a day\'s nor a night\'s', duskPicture.mean > 45 && duskPicture.mean < 150, JSON.stringify(duskPicture));
  // A quarter of an hour on it is darker: the app follows the sun as it sinks.
  await dusk.page.evaluate(() => {
    const Shifted = window.Date;
    const by = 15 * 60 * 1000;
    window.Date = class extends Shifted {
      constructor(...args) {
        if (args.length === 0) super(Shifted.now() + by);
        else super(...args);
      }
      static now() {
        return Shifted.now() + by;
      }
    };
    window.__map.fire('moveend'); // the app looks at the sun when the map comes to rest, and once a minute
  });
  await dusk.page.waitForFunction((before) => window.__map.getLayer('city-life').implementation.night > before + 0.2, half.night, { timeout: 15000 });
  await mapAtRest(dusk.page);
  const later = await lightNow(dusk.page);
  check('a quarter of an hour later it is darker, the lamps are full on, and the map has followed: the names are light now', later.night > half.night + 0.2 && later.night < 1 && later.veil > half.veil + 0.15 && Math.abs(later.styled - later.night) < 0.05 && later.walls > half.walls && later.lamps === 1 && later.glow === 0.36 && later.names === '#ffffff' && later.streetNames === '#ece8df', JSON.stringify(later));
  check('no errors in the page', dusk.errors.length === 0, dusk.errors.join(' | '));
  await dusk.context.close();

  // ── The phone takes the graphics memory away ────────────────────────────
  console.log('\nBack from the background');
  const back = await newPhone();
  await back.page.goto(`${base}/`);
  await back.page.waitForSelector('.me');
  await styleHas(back.page, 'city-buildings');
  const sceneReady = () => {
    const live = window.__map;
    const sceneLayer = live.getLayer('city-life')?.implementation;
    const gl = live.painter.context.gl;
    if (!sceneLayer || gl.isContextLost()) return false;
    const shadow = sceneLayer.shadow;
    return (
      gl.isProgram(sceneLayer.program) &&
      gl.isProgram(sceneLayer.roofProgram) &&
      gl.isProgram(sceneLayer.wallProgram) &&
      (sceneLayer.roofs.mesh?.count ?? 0) > 0 &&
      (sceneLayer.walls.mesh?.count ?? 0) > 0 &&
      (sceneLayer.parts.get('roofshade')?.mesh?.count ?? 0) > 0 &&
      shadow.ready &&
      gl.isTexture(shadow.target.picture) &&
      (sceneLayer.parts.get('traffic')?.mesh.count ?? 0) > 0
    );
  };
  await back.page.waitForFunction(sceneReady, null, { timeout: 30000 });
  // A phone does this to a page that has been in the background for a while; here it is done by hand.
  const taken = await back.page.evaluate(async () => {
    const gl = window.__map.painter.context.gl;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (!lose) return null;
    const sceneLayer = window.__map.getLayer('city-life').implementation;
    lose.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const gone = gl.isContextLost() && !gl.isProgram(sceneLayer.program);
    lose.restoreContext();
    return gone;
  });
  if (taken === null) {
    console.log('  (this browser cannot take the graphics memory away: not checked)');
  } else {
    await back.page.waitForFunction(sceneReady, null, { timeout: 30000 });
    check('when the phone hands the graphics memory back empty, the city is built again: walls, roofs, shadows, traffic and all', taken && (await sceneCounts(back.page)).buildings.roofs.decks > 300);
    check('no errors in the page', back.errors.length === 0, back.errors.join(' | '));
  }
  await back.context.close();

  // ── The buildings archive out of reach ──────────────────────────────────
  console.log('\n3D city without the buildings archive');
  const bare = await newPhone({ buildings: 'none' });
  await bare.page.goto(`${base}/`);
  await bare.page.waitForSelector('.me');
  await styleHas(bare.page, 'city-buildings');
  await mapAtRest(bare.page);
  await bare.page.waitForFunction(() => window.__map.querySourceFeatures('city-shade').length > 0, null, { timeout: 15000 });
  const blocks = await bare.page.evaluate(() => {
    const live = window.__map;
    return {
      source: live.getLayer('city-buildings').source,
      archive: Boolean(live.getSource('overture')),
      height: JSON.stringify(live.getPaintProperty('city-buildings', 'fill-extrusion-height')),
      drawn: live.queryRenderedFeatures({ layers: ['city-buildings', 'city-towers', 'city-painted'] }).length,
      parts: Boolean(live.getLayer('city-parts')),
    };
  });
  check('the street map\'s own buildings are drawn instead', blocks.source === 'openmaptiles' && !blocks.archive && !blocks.parts && blocks.height.includes('render_height') && blocks.drawn > 0, JSON.stringify(blocks));
  check('they cast shadows too, and the streets have their traffic', (await sceneCorners(bare.page, 'traffic')) > 0 && (await sceneCounts(bare.page)).buildings.source === 'streets');
  await bare.context.close();

  const gone = await newPhone({ buildings: 'gone' });
  await gone.page.goto(`${base}/`);
  await gone.page.waitForSelector('.me');
  // The store lists a release, but its archive cannot be read: the city starts on it, then falls back.
  await gone.page.waitForFunction(() => window.__map?.getStyle()?.layers?.some((layer) => layer.id === 'city-buildings' && layer.source === 'openmaptiles'), null, { timeout: 45000 });
  await mapAtRest(gone.page);
  check('an archive that cannot be read is given up for the street map\'s buildings', (await gone.page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['city-buildings', 'city-towers', 'city-painted'] }).length)) > 0 && !(await gone.page.evaluate(() => Boolean(window.__map.getSource('overture')))));
  await gone.context.close();

  console.log('\nSmall phone, dark mode');
  // (This phone still has "Auto" kept as its map type, from a version in which that was a look of its own.)
  const small = await newPhone({ width: 320, height: 568, dark: true, kept: { settings: { mapType: 'auto' } } });
  await small.page.goto(`${base}/`);
  await small.page.waitForSelector('.me');
  await styleHas(small.page, 'city-buildings');
  check('a phone in dark mode that had "Auto" kept gets the 3D city, lit by the hour', (await small.page.evaluate(() => window.__map.getLayer('city-life')?.implementation.counts().night.mode)) === 'sun' && (await small.page.locator('input[name="mapType"]:checked').getAttribute('value')) === 'city');
  const smallFit = await small.page.evaluate(() => {
    const strip = document.getElementById('bar');
    const inside = [...strip.children].every((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth && r.width > 0;
    });
    return { inside, scrolls: strip.scrollWidth > strip.clientWidth, grip: document.getElementById('grip').getBoundingClientRect().width };
  });
  check('the bar fits on a small phone', smallFit.inside && !smallFit.scrolls && smallFit.grip >= 44, JSON.stringify(smallFit));
  await small.page.click('.map-btn[data-open="map"]');
  const mapSheet = await small.page.locator('#sheet-map .sheet-body').evaluate((el) => ({ scrolls: el.scrollWidth > el.clientWidth, width: el.getBoundingClientRect().width }));
  check('map options fit on a small phone', !mapSheet.scrolls && mapSheet.width <= 320, JSON.stringify(mapSheet));
  await shot(small.page, 'small-phone-options.png');
  await small.context.close();

  // ── 4. Location not allowed ─────────────────────────────────────────────
  console.log('\nLocation not allowed');
  const denied = await newPhone({ location: false });
  await denied.page.goto(`${base}/`);
  await denied.page.waitForSelector('#locPrompt:not([hidden])');
  check('asks before using location', (await text(denied.page, '#locPromptText')) === 'See where you are on the map.');
  check(
    'no follow button, speed or road name before location is on',
    (await denied.page.locator('#followBtn').isHidden()) && (await denied.page.locator('#speed').isHidden()) && (await denied.page.locator('#road').isHidden()),
  );
  check('the map and its buttons are there anyway', (await denied.page.locator('.map-btn[data-open="search"]').isVisible()) && (await denied.page.evaluate(() => Boolean(window.__map))));
  // The map is of Riyadh: it opens on the city, close enough for the 3D city to be built, and keeps to it.
  await styleHas(denied.page, 'city-buildings');
  const opened = await camera(denied.page);
  check('with nothing to go by the map opens on Riyadh, by Kingdom Centre, in the isometric view', near(opened.lat, 24.7136, 0.0005) && near(opened.lng, 46.6753, 0.0005) && near(opened.zoom, 15.6, 0.01) && isometric(opened), JSON.stringify(opened));
  await denied.page.waitForSelector('#weather:not([hidden])');
  check('the weather over Riyadh shows before the phone says where it is', (await text(denied.page, '#weather')) === '23° Clear' && near(asked.weatherAt.at(-1)[0], 24.714, 0.001) && near(asked.weatherAt.at(-1)[1], 46.675, 0.001), JSON.stringify(asked.weatherAt.at(-1)));
  const kept = await denied.page.evaluate(() => {
    const live = window.__map;
    const out = {};
    live.jumpTo({ center: [39.1925, 21.4858] }); // Jeddah
    out.west = live.getCenter().toArray();
    live.jumpTo({ center: [55.27, 25.2] }); // Dubai
    out.east = live.getCenter().toArray();
    live.jumpTo({ center: [46.6753, 24.7136], zoom: 1 });
    out.drawnBack = live.getZoom();
    out.bounds = live.getMaxBounds().toArray();
    live.jumpTo({ center: [46.6753, 24.7136], zoom: 15.6 });
    return out;
  });
  const inCity = ([lng, lat]) => lng >= 46.25 && lng <= 47.15 && lat >= 24.3 && lat <= 25.15;
  check('the map cannot be moved off Riyadh, nor drawn back until the city is a dot', inCity(kept.west) && inCity(kept.east) && kept.drawnBack >= 8 && JSON.stringify(kept.bounds) === '[[46.25,24.3],[47.15,25.15]]', JSON.stringify(kept));
  await denied.page.click('#locButton');
  await denied.page.waitForFunction(() => document.getElementById('locButtonLabel').textContent === 'Try again');
  check('explains what to do when location is refused', (await text(denied.page, '#locPromptText')).startsWith('Location is turned off for this app.'));
  check('video still works without location', await denied.page.locator('#videoEmpty').isVisible());

  // Search still works; the route needs a start.
  const routesBefore = asked.route;
  await denied.page.click('.map-btn[data-open="search"]');
  await denied.page.fill('#searchInput', 'kingdom');
  await denied.page.click('#searchForm button[type="submit"]');
  await denied.page.waitForSelector('.result');
  await denied.page.click('li:first-child .result');
  await denied.page.waitForSelector('#place:not([hidden])');
  check('search works without location', (await text(denied.page, '#placeTitle')) === 'Kingdom Centre' && !(await text(denied.page, '#placeKind')).includes('away'));
  // Places are looked for in Riyadh, and nowhere else: the question says so, and an answer from elsewhere is left out.
  const question = asked.search.at(-1);
  check('the search is for places in Riyadh, nearest the middle of the map first', question.q === 'kingdom' && question.bbox === '46.25,24.3,47.15,25.15' && near(Number(question.lat), 24.7136, 0.01) && near(Number(question.lon), 46.6753, 0.01), JSON.stringify(question));
  check('the search says it is of Riyadh', (await text(denied.page, '#searchTitle')) === 'Find a place in Riyadh');
  await denied.page.click('#placeClose');
  await denied.page.click('.map-btn[data-open="search"]');
  await denied.page.fill('#searchInput', 'jeddah');
  await denied.page.click('#searchForm button[type="submit"]');
  await denied.page.waitForFunction(() => document.querySelectorAll('.result').length === 1 && document.querySelector('.result-title').textContent === 'Jeddah Road');
  check('a place in another city is not offered; a street in Riyadh by that name is', (await denied.page.locator('.result').count()) === 1);
  await denied.page.click('li:first-child .result');
  await denied.page.waitForSelector('#place:not([hidden])');
  await denied.page.click('#placeRoute');
  await denied.page.waitForFunction(() => document.getElementById('placeNote').textContent.startsWith('Turn on your location'));
  check('a route without location says what is missing', asked.route === routesBefore);
  await denied.context.close();

  // ── Away from Riyadh ────────────────────────────────────────────────────
  console.log('\nA phone far from Riyadh');
  // On the road out of Jeddah. (And the map was last looked at in London, in a version that showed the world.)
  const away = await newPhone({ route: [[39.1925, 21.4858], [39.2025, 21.4958], [39.2125, 21.5058]], kept: { locationOn: true, mapView: { lat: 51.5, lng: -0.12, zoom: 12 } } });
  await away.page.goto(`${base}/`);
  await away.page.waitForFunction(() => !document.getElementById('mapStatus').hidden && /outside Riyadh/.test(document.getElementById('mapStatus').textContent), null, { timeout: 30000 });
  await styleHas(away.page, 'city-buildings');
  const afar = await camera(away.page);
  check('away from the city the map stays on Riyadh, and says so', near(afar.lat, 24.7136, 0.0005) && near(afar.lng, 46.6753, 0.0005) && (await text(away.page, '#mapStatus')) === 'You are outside Riyadh. The map covers Riyadh only.', JSON.stringify(afar));
  check('there is nothing to follow anyone on: no follow button', (await away.page.locator('#followBtn').isHidden()) && (await away.page.getAttribute('#followBtn', 'aria-pressed')) !== 'true');
  check('the speed still shows', (await text(away.page, '#speedValue')) === '50');
  // The phone moves on; the map does not go after it.
  await away.page.evaluate(() => {
    window.__gps.travelled += 800;
    window.__gps.emit();
  });
  await away.page.waitForTimeout(1500);
  const still = await camera(away.page);
  check('the map does not go after a phone outside the city', near(still.lat, afar.lat, 0.00001) && near(still.lng, afar.lng, 0.00001));
  check('the weather shown is Riyadh\'s', near(asked.weatherAt.at(-1)[0], 24.714, 0.001), JSON.stringify(asked.weatherAt.at(-1)));
  check('no errors in the page', away.errors.length === 0, away.errors.join(' | '));
  await away.context.close();

  // ── 5. No connection ────────────────────────────────────────────────────
  console.log('\nNo connection');
  const offline = await newPhone({ location: false, workers: 'allow', noMap: true });
  await offline.page.goto(`${base}/`);
  await offline.page.evaluate(() => navigator.serviceWorker.ready);
  await offline.page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await offline.context.setOffline(true);
  await offline.page.reload();
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  await offline.page.waitForFunction((wanted) => document.getElementById('version')?.textContent === wanted, version);
  check('opens with no connection', (await offline.page.title()) === 'Video Map');
  check('the map library is available offline', await offline.page.evaluate(() => typeof window.maplibregl === 'object' && document.querySelector('.maplibregl-canvas') !== null));
  await offline.page.waitForFunction(() => !document.getElementById('mapStatus').hidden);
  check('says the map needs a connection', (await text(offline.page, '#mapStatus')) === "The map couldn't load. Check your connection.");
  check('video is still offered', await offline.page.locator('#videoEmpty').isVisible());
  await offline.context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.map((name) => `  - ${name}`).join('\n'));
  process.exitCode = 1;
}
