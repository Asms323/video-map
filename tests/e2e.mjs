// End-to-end check of the app in a real (headless) browser.
//
//   node tests/e2e.mjs                     run the checks
//   SHOTS=some/folder node tests/e2e.mjs   also save screenshots there
//   RECORD=1 node tests/e2e.mjs            refresh the recorded map data (needs the internet)
//
// Needs Playwright with Chromium. The run is self-contained: the street map is
// replayed from a recording of the real OpenFreeMap service
// (tests/fixtures/map.har), and the other services (place details, search,
// weather, routes, satellite photos, YouTube) are answered by stand-ins below.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { listen } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const CLIP = path.join(FIXTURES, 'clip.webm');
const MAP_RECORDING = path.join(FIXTURES, 'map.har');
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

if (!RECORD && !existsSync(MAP_RECORDING)) {
  console.error('tests/fixtures/map.har is missing. Create it with: RECORD=1 node tests/e2e.mjs');
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

const asked = { overpass: [], weather: 0, route: 0 };

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
  if (text === 'offline') return route.abort();
  if (text === 'zzzz') return json(route, { type: 'FeatureCollection', features: [] });
  return json(route, SEARCH_ANSWER);
}

async function standIns(context, { recordMap = false, noMap = false } = {}) {
  await context.route(/^https:\/\/(server\.arcgisonline\.com|tile\.openstreetmap\.org)\//, (route) =>
    route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: TILE }),
  );

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
    asked.weather += 1;
    return json(route, { current: { time: '2026-11-21T12:00', temperature_2m: 23.4, weather_code: 0 } });
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
      return { loaded: live.loaded(), moving: live.isMoving(), tiles: live.areTilesLoaded(), style: live.isStyleLoaded(), zoom: live.getZoom(), pitch: live.getPitch(), waiting };
    });
    console.log(`  map not at rest: ${JSON.stringify(state)}`);
    throw error;
  }
}

const camera = (page) =>
  page.evaluate(() => {
    const live = window.__map;
    const centre = live.getCenter();
    return { lat: centre.lat, lng: centre.lng, zoom: live.getZoom(), bearing: live.getBearing(), pitch: live.getPitch() };
  });

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
// Followed flat, I am in the middle; followed at an angle, a little below it.
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

async function newPhone({ width = 390, height = 844, dark = false, location = true, recordMap = false, noMap = false, workers = 'block' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: dark ? 'dark' : 'light',
    permissions: location ? ['geolocation'] : [],
    serviceWorkers: workers,
  });
  await standIns(context, { recordMap, noMap });
  await context.addInitScript(keepMapHandle);
  if (location) await context.addInitScript(gpsOnRoute, ROUTE_LINE);
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
  const { context, page, errors } = await newPhone({ recordMap: RECORD });
  await page.goto(`${base}/`);
  await page.waitForSelector('.me');
  await styleHas(page, 'city-buildings');
  await page.waitForFunction(() => window.__map.getPitch() > 59.5);
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
  check('follows me, north up', (await page.getAttribute('#followBtn', 'aria-pressed')) === 'true' && (await page.getAttribute('#followBtn', 'data-mode')) === 'north');
  check('speed readout shows the speed', (await text(page, '#speedValue')) === '50' && (await text(page, '#speedUnit')) === 'km/h');
  check('arrow shows the way I am travelling', await page.locator('.me').evaluate((el) => el.classList.contains('has-heading')));
  let view = await camera(page);
  let me = await phone(page);
  let spot = await whereAmI(page);
  check('the city is seen from an angle, north up, with me a little below the middle', near(view.pitch, 60, 0.5) && near(view.bearing, 0, 0.5) && view.zoom >= 16 && belowTheMiddle(spot), JSON.stringify({ view, spot }));

  await page.waitForFunction(() => document.getElementById('roadName').textContent.trim() !== '');
  check('names the road I am on, from the map data', (await text(page, '#roadName')) === 'Al Olaya Street', await text(page, '#roadName'));
  check('the map is built from the real street data', (await layerIds(page)).includes('city-buildings') && (await drawn(page, 'openmaptiles', 'transportation')) > 100);
  const model = await page.evaluate(() => {
    const live = window.__map;
    return {
      kind: live.getLayer('city-buildings').type,
      color: live.getPaintProperty('city-buildings', 'fill-extrusion-color'),
      height: JSON.stringify(live.getPaintProperty('city-buildings', 'fill-extrusion-height')),
      blocks: live.queryRenderedFeatures({ layers: ['city-buildings'] }).length,
      roads: live.queryRenderedFeatures({ layers: ['city-road-minor', 'city-road-mid', 'city-road-main'] }).length,
      ground: live.getLayer('city-ground').type,
    };
  });
  check('3D City: every building is a white block of its real height', model.kind === 'fill-extrusion' && model.color === '#f4f4f1' && model.height.includes('render_height') && model.blocks > 0, JSON.stringify(model));
  check('3D City: grey roads on the real ground', model.roads > 20 && model.ground === 'raster');

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
  await page.waitForTimeout(1300); // the phone repeats the same position a few times
  check('standing still leaves the map at rest', await page.evaluate(() => !window.__map.isMoving()));
  const speedAsks = asked.overpass.filter((query) => query.includes('maxspeed')).length;
  check('one question covers the speed limits of the whole area', speedAsks === 1, `asked ${speedAsks} times`);
  check('the weather is asked for once', asked.weather === 1);

  await drive(page, 120);
  me = await phone(page);
  spot = await whereAmI(page);
  check('map moves with me', belowTheMiddle(spot), JSON.stringify(spot));
  await shot(page, 'map-city.png');

  // Driving view: the way I travel is up.
  await page.click('#followBtn');
  await page.waitForFunction(() => window.__map.getPitch() > 61.5);
  await mapAtRest(page);
  view = await camera(page);
  check('driving view turns the map my way', (await page.getAttribute('#followBtn', 'data-mode')) === 'heading' && near(view.pitch, 62, 0.5) && turn(view.bearing, me.heading) < 2, `map ${view.bearing.toFixed(1)}°, me ${me.heading.toFixed(1)}°`);
  spot = await whereAmI(page);
  check('driving view shows the road ahead', belowTheMiddle(spot), JSON.stringify(spot));
  await shot(page, 'map-driving.png');
  await page.click('#followBtn');
  await page.waitForFunction(() => Math.abs(window.__map.getBearing()) < 0.5 && window.__map.getPitch() < 60.5);
  await mapAtRest(page);
  view = await camera(page);
  check('tapping again goes back to north up', (await page.getAttribute('#followBtn', 'data-mode')) === 'north' && near(view.bearing, 0, 0.5) && near(view.pitch, 60, 0.5));
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
  check('dragging the map stops following', spot.x > 0.65 && spot.y > 0.75, JSON.stringify(spot));
  await page.click('#followBtn');
  await page.waitForFunction(() => document.getElementById('followBtn').getAttribute('aria-pressed') === 'true');
  await mapAtRest(page);
  spot = await whereAmI(page);
  check('the button brings the map back to me', belowTheMiddle(spot), JSON.stringify(spot));

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
  check('the map goes to the place', metersApart(view, { lat: 24.7113804, lng: 46.6743526 }) < 5 && near(view.pitch, 60, 0.5));
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
  check('Streets: the coloured street map, seen from straight above', (await overlaysKept()) && inTheMiddle(spot), JSON.stringify(spot));
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

  await pickType('detailed');
  await hasLayer('osm');
  await mapAtRest(page);
  check('Detailed: the classic OpenStreetMap picture', (await overlaysKept()) && !(await layerIds(page)).includes('building-3d'));
  await drive(page, 60);
  check('Detailed: road names still work', (await text(page, '#roadName')) !== '');

  await pickType('city');
  await hasLayer('city-buildings');
  await page.waitForFunction(() => window.__map.getPitch() > 59.5);
  await mapAtRest(page);
  check('3D City can be chosen by name, and tilts the map again', (await overlaysKept()) && (await saved(page, 'settings')).mapType === 'city');

  await pickType('auto');
  await hasLayer('city-buildings');
  check('Auto: the 3D city by day', await overlaysKept());
  await page.emulateMedia({ colorScheme: 'dark' });
  await nightMapUp();
  check('Auto: the night map when the phone goes dark', true);
  await page.emulateMedia({ colorScheme: 'light' });
  await hasLayer('city-buildings');
  await mapAtRest(page);
  check('the map type is remembered', (await saved(page, 'settings')).mapType === 'auto');

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
  await context.close(); // in a recording run, this writes tests/fixtures/map.har
  if (RECORD) tidyRecording();

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
  await side.page.waitForFunction(() => document.getElementById('followBtn').dataset.mode === 'heading' && window.__map.getPitch() > 61.5);
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

  // ── 3. A small phone, in the dark ───────────────────────────────────────
  console.log('\nSmall phone, dark mode');
  const small = await newPhone({ width: 320, height: 568, dark: true });
  await small.page.goto(`${base}/`);
  await small.page.waitForSelector('.me');
  await small.page.waitForFunction(() => {
    const layers = window.__map.getStyle()?.layers ?? [];
    return layers.some((l) => l.id === 'vm-places') && !layers.some((l) => l.id === 'city-buildings' || l.id === 'building-3d');
  });
  check('Auto starts with the night map on a dark phone', true);
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
  await denied.page.click('#placeRoute');
  await denied.page.waitForFunction(() => document.getElementById('placeNote').textContent.startsWith('Turn on your location'));
  check('a route without location says what is missing', asked.route === routesBefore);
  await denied.context.close();

  // ── 5. No connection ────────────────────────────────────────────────────
  console.log('\nNo connection');
  const offline = await newPhone({ location: false, workers: 'allow', noMap: true });
  await offline.page.goto(`${base}/`);
  await offline.page.evaluate(() => navigator.serviceWorker.ready);
  await offline.page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await offline.context.setOffline(true);
  await offline.page.reload();
  await offline.page.waitForFunction(() => document.getElementById('version')?.textContent === '1.2.0');
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
