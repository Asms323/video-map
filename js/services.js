// The open data services the map draws on. Each one is free, needs no account
// and is asked as rarely as possible: answers are kept and reused.
//
//   OpenFreeMap   map styles and tiles (OpenStreetMap data)
//   Overpass API  details of one place, posted speed limits, and where the city's traffic signals stand
//   Photon        finding places by name, and the address of a point
//   Open-Meteo    the weather where you are
//   OSRM          a driving route between two points
//   Esri          the satellite photo, and the day it was taken
//   Overture Maps one outline for every building

import {
  BUILDING_STORE,
  PHOTO_SURE_ZOOM,
  RIYADH,
  SIGNALS_KEPT_MS,
  buildingArchives,
  detailsQuery,
  distanceMeters,
  inRiyadh,
  packSignals,
  photoBlockOf,
  photoInBlock,
  photoTileOf,
  photonPlace,
  routeSummary,
  signalPoints,
  signalQuery,
  speedLimitQuery,
  speedLimitRoads,
  unpackSignals,
  weatherSummary,
} from './lib.js';
import { parseOpenSky } from './flights.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const PHOTON_URL = 'https://photon.komoot.io';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving/';
const PHOTO_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

/** Fetch JSON, giving up after `timeout` milliseconds. Rejects on any non-2xx answer. */
export async function fetchJson(url, { timeout = 12000, signal, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const forward = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forward, { once: true });
  }
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', forward);
  }
}

/** Fetch with a time limit. Resolves with the answer whatever its status. */
async function fetchSoon(url, timeout, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Buildings ─────────────────────────────────────────────────────────────

const ARCHIVE_KEY = 'vm.buildings';
const ARCHIVE_MAX_AGE_MS = 24 * 3600 * 1000;
let archive = null;

function savedArchive() {
  try {
    const saved = JSON.parse(localStorage.getItem(ARCHIVE_KEY));
    if (saved && typeof saved.url === 'string' && saved.url.startsWith(BUILDING_STORE) && Number.isFinite(saved.at)) return saved;
  } catch {
    // No storage, or something else is kept under the name.
  }
  return null;
}

async function findArchive() {
  const saved = savedArchive();
  if (saved && Date.now() - saved.at < ARCHIVE_MAX_AGE_MS && Date.now() >= saved.at) return saved.url;
  try {
    const listing = await fetchSoon(`${BUILDING_STORE}?list-type=2&prefix=tiles/&delimiter=/`, 7000);
    if (!listing.ok) throw new Error(`The buildings store answered ${listing.status}`);
    // The newest release whose archive is really there: a release is put up file by file.
    for (const url of buildingArchives(await listing.text()).slice(0, 3)) {
      const start = await fetchSoon(url, 7000, { headers: { Range: 'bytes=0-6' } }).catch(() => null);
      if (!start || !start.ok || new TextDecoder().decode(await start.arrayBuffer()) !== 'PMTiles') continue;
      try {
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify({ url, at: Date.now() }));
      } catch {
        // Looked up again next time.
      }
      return url;
    }
  } catch {
    // Offline, or the store is not answering.
  }
  return saved ? saved.url : null; // the one found last time, while it lasts
}

/**
 * The address of the archive that holds an outline for every building, or
 * null when it cannot be found. Overture publishes a release every month
 * and clears old ones away, so the address is looked up, at most once a day.
 */
export function buildingArchive() {
  if (!archive) {
    archive = findArchive();
    archive.then((url) => {
      if (!url) archive = null; // ask again next time
    });
  }
  return archive;
}

// ── Map styles ────────────────────────────────────────────────────────────

const styles = new Map();

/** One of OpenFreeMap's styles ("liberty", "fiord", …) as style JSON. */
export function loadStyle(name) {
  if (!styles.has(name)) {
    const pending = fetchJson(STYLE_URL + name, { timeout: 15000 }).catch((error) => {
      styles.delete(name); // let the next try ask again
      throw error;
    });
    styles.set(name, pending);
  }
  return styles.get(name);
}

// ── Overpass ──────────────────────────────────────────────────────────────

async function overpass(query, { signal, timeout = 20000 } = {}) {
  const answer = await fetchJson(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
    timeout,
  });
  // A query that ran out of time or memory answers 200 with a remark and no data.
  if (answer.remark && (!Array.isArray(answer.elements) || answer.elements.length === 0)) {
    throw new Error(`Overpass: ${answer.remark}`);
  }
  return answer;
}

const details = new Map();

/** The OpenStreetMap tags of one element ({ type, id }), or null if it has none. */
export async function placeDetails(ref, { signal } = {}) {
  const key = `${ref.type}/${ref.id}`;
  if (details.has(key)) return details.get(key);
  const answer = await overpass(detailsQuery(ref), { signal, timeout: 12000 });
  const tags = answer.elements?.[0]?.tags ?? null;
  details.set(key, tags);
  return tags;
}

const LIMIT_RADIUS_M = 1200;
let limitArea = null; // { center, roads } of the last answer
let limitBusy = false;
let limitRetryAt = 0;

/**
 * Roads with a posted speed limit around a position: [{ limit, lines }].
 *
 * Answers from memory while the position stays well inside the area last
 * asked about; otherwise asks Overpass (never two questions at once, and
 * after a failure not again for a minute). Returns what is known meanwhile.
 */
export async function speedLimitsNear(position) {
  const known = limitArea ? limitArea.roads : [];
  if (limitArea && distanceMeters(limitArea.center, position) < LIMIT_RADIUS_M * 0.6) return known;
  if (limitBusy || Date.now() < limitRetryAt) return known;

  limitBusy = true;
  try {
    const answer = await overpass(speedLimitQuery(position, LIMIT_RADIUS_M));
    limitArea = { center: { lat: position.lat, lng: position.lng }, roads: speedLimitRoads(answer) };
    return limitArea.roads;
  } catch {
    limitRetryAt = Date.now() + 60000;
    return known;
  } finally {
    limitBusy = false;
  }
}

// The traffic signals OpenStreetMap marks, for the 3D city (see signals.js). One question for the whole
// of Riyadh, the same whoever asks it and wherever from, so nothing of where you are goes with it; and
// the answer is kept on the phone for a week.

const SIGNALS_KEY = 'vm.signals';
const SIGNALS_FAILED_AGAIN_MS = 5 * 60 * 1000;
let signalMarks = null; // { at, bounds, points } once known
let signalAsking = null;
let signalRetryAt = 0;

function savedSignals() {
  try {
    const kept = unpackSignals(JSON.parse(localStorage.getItem(SIGNALS_KEY)), Date.now());
    if (kept) return { at: kept.at, bounds: RIYADH.bounds, points: kept.points };
  } catch {
    // No storage, or something else is kept under the name.
  }
  return null;
}

async function askSignals() {
  try {
    const points = signalPoints(await overpass(signalQuery(), { timeout: 30000 }));
    signalMarks = { at: Date.now(), bounds: RIYADH.bounds, points };
    try {
      localStorage.setItem(SIGNALS_KEY, JSON.stringify(packSignals(points, signalMarks.at)));
    } catch {
      // Asked again next time.
    }
  } catch {
    signalRetryAt = Date.now() + SIGNALS_FAILED_AGAIN_MS;
  } finally {
    signalAsking = null;
  }
  return signalMarks;
}

/**
 * Find out where OpenStreetMap marks traffic signals in Riyadh, and tell of it: tell is called with
 * { at, bounds: { west, south, east, north } (the area the answer is for), points: [[lng, lat], …] }, at
 * once if anything is known, and once more when something newer is in. (The same thing is told every
 * time until there is something newer.) Overpass is asked once a week at most, never two questions at
 * once, and after a failure not again for five minutes; an older answer serves until the new one is in.
 */
export function riyadhSignals(tell) {
  signalMarks ??= savedSignals();
  const had = signalMarks;
  if (had) tell(had);
  if (had && Date.now() - had.at < SIGNALS_KEPT_MS) return;
  if (signalAsking || Date.now() < signalRetryAt) return;
  signalAsking = askSignals();
  signalAsking.then((marks) => {
    if (marks && marks !== had) tell(marks);
  });
}

// ── Photon ────────────────────────────────────────────────────────────────

// Photon answers in the place's own language unless asked for one of these.
const PHOTON_LANGUAGES = ['en', 'de', 'fr'];

function photonLanguage() {
  const wanted = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return PHOTON_LANGUAGES.includes(wanted) ? wanted : null;
}

/**
 * Places in Riyadh matching what was typed, nearest to `near` first (or to
 * the middle of the city, if `near` is not in it). Nothing outside the city
 * is looked for, and nothing outside it is given back.
 */
export async function searchPlaces(text, near, { signal } = {}) {
  const around = inRiyadh(near) ? near : RIYADH.centre;
  const { west, south, east, north } = RIYADH.bounds;
  const params = new URLSearchParams({ q: text, limit: '8', lat: around.lat.toFixed(4), lon: around.lng.toFixed(4), bbox: `${west},${south},${east},${north}` });
  const lang = photonLanguage();
  if (lang) params.set('lang', lang);
  const answer = await fetchJson(`${PHOTON_URL}/api/?${params}`, { signal, timeout: 10000 });
  return (answer.features ?? []).map(photonPlace).filter((place) => place && inRiyadh(place));
}

/** What is at a point: the nearest named place or address, or null. */
export async function placeAt(position, { signal } = {}) {
  const params = new URLSearchParams({ lat: position.lat.toFixed(6), lon: position.lng.toFixed(6) });
  const lang = photonLanguage();
  if (lang) params.set('lang', lang);
  const answer = await fetchJson(`${PHOTON_URL}/reverse?${params}`, { signal, timeout: 10000 });
  return photonPlace(answer.features?.[0]);
}

// ── Open-Meteo ────────────────────────────────────────────────────────────

const WEATHER_MAX_AGE_MS = 30 * 60 * 1000;
const WEATHER_MAX_DRIFT_M = 15000;
let weather = null; // { at, position, summary }
let weatherBusy = false;
let weatherRetryAt = 0;
// What is asked of the weather: how warm, what kind of weather, how much cloud, the wind. And for the sky
// over the 3D city: how much cloud at each of three heights, and how far one can see. (Should the service
// ever refuse to say that, it is asked without from then on.)
const WEATHER_NOW = 'temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m';
const WEATHER_SKY = 'cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility';
let weatherSky = true;

/** The weather at a position as { temperature (°C), text }, or null if unknown. */
export async function weatherAt(position) {
  const fresh =
    weather &&
    Date.now() - weather.at < WEATHER_MAX_AGE_MS &&
    distanceMeters(weather.position, position) < WEATHER_MAX_DRIFT_M;
  if (fresh || weatherBusy || Date.now() < weatherRetryAt) return weather ? weather.summary : null;

  weatherBusy = true;
  try {
    const ask = (current) => {
      const params = new URLSearchParams({ latitude: position.lat.toFixed(3), longitude: position.lng.toFixed(3), current, wind_speed_unit: 'ms' });
      return fetchJson(`${WEATHER_URL}?${params}`, { timeout: 10000 });
    };
    let answer;
    try {
      answer = await ask(weatherSky ? `${WEATHER_NOW},${WEATHER_SKY}` : WEATHER_NOW);
    } catch (error) {
      // (400 is the service saying it does not know something it was asked.)
      if (!weatherSky || !/ answered 400$/.test(String(error?.message))) throw error;
      weatherSky = false;
      answer = await ask(WEATHER_NOW);
    }
    const summary = weatherSummary(answer.current);
    if (summary) weather = { at: Date.now(), position: { lat: position.lat, lng: position.lng }, summary };
    return weather ? weather.summary : null;
  } catch {
    weatherRetryAt = Date.now() + 5 * 60 * 1000;
    return weather ? weather.summary : null;
  } finally {
    weatherBusy = false;
  }
}

// ── Aircraft ──────────────────────────────────────────────────────────────

// The sky over Riyadh and its airport: one fixed box, the same whoever asks and wherever in the city they
// are, so that nothing about the asker goes with the question.
const AIRCRAFT_URL = 'https://opensky-network.org/api/states/all';
const AIRCRAFT_BOX = { lamin: '24.2', lomin: '45.9', lamax: '25.6', lomax: '47.5' };
const AIRCRAFT_AGAIN_MS = 40 * 1000; // while there are aircraft to follow
const AIRCRAFT_EMPTY_AGAIN_MS = 10 * 60 * 1000; // the feed has few receivers here: an empty sky is not asked about again at once
const AIRCRAFT_FAILED_AGAIN_MS = 30 * 60 * 1000;
let aircraftBusy = false;
let aircraftRetryAt = 0;

/**
 * The aircraft in the air over Riyadh right now, from the OpenSky Network's
 * open feed: { planes, seconds, source }, or null when it is not to be had
 * (or was asked for too lately: it is asked every 40 s at the most, and far
 * less often while it has nothing or does not answer).
 */
export async function aircraftOverRiyadh() {
  if (aircraftBusy || Date.now() < aircraftRetryAt) return null;
  aircraftBusy = true;
  try {
    const answer = await fetchJson(`${AIRCRAFT_URL}?${new URLSearchParams(AIRCRAFT_BOX)}`, { timeout: 12000, credentials: 'omit', referrerPolicy: 'no-referrer' });
    const planes = parseOpenSky(answer);
    aircraftRetryAt = Date.now() + (planes.length > 0 ? AIRCRAFT_AGAIN_MS : AIRCRAFT_EMPTY_AGAIN_MS);
    return { planes, seconds: Number(answer?.time) || Date.now() / 1000, source: 'The OpenSky Network' };
  } catch {
    aircraftRetryAt = Date.now() + AIRCRAFT_FAILED_AGAIN_MS;
    return null;
  } finally {
    aircraftBusy = false;
  }
}

// ── OSRM ──────────────────────────────────────────────────────────────────

/** A driving route as { distance (m), duration (s), coordinates [[lng, lat], …] }, or null. */
export async function drivingRoute(from, to, { signal } = {}) {
  const points = `${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}`;
  const answer = await fetchJson(`${ROUTE_URL}${points}?overview=full&geometries=geojson`, {
    signal,
    timeout: 15000,
  });
  return routeSummary(answer);
}

// ── The satellite photo, as sharp as it comes ─────────────────────────────

// Where the photo does not come as sharp as asked, the service sends a grey card saying so in place of a
// picture, always the same one. It is known by its size.
const PHOTO_CARD_BYTES = 2521;
const PHOTO_BLOCKS_KEPT = 600;
const photoBlocks = new Map(); // "level/left/top" → a promise of the service's answer about that square of tiles, or of null

const notThere = () => Object.assign(new Error('The photo does not come this sharp here'), { status: 404 });

/**
 * Whether the photo is there for a tile at a level: true, false, or null when
 * the service does not say. Asked for a square of tiles at a time, and each
 * square only once.
 */
export async function photoThere(z, x, y) {
  if (z <= PHOTO_SURE_ZOOM) return true;
  const block = photoBlockOf(z, x, y);
  const key = `${block.z}/${block.left}/${block.top}`;
  if (!photoBlocks.has(key)) {
    if (photoBlocks.size >= PHOTO_BLOCKS_KEPT) photoBlocks.delete(photoBlocks.keys().next().value);
    photoBlocks.set(
      key,
      fetchJson(`${PHOTO_URL}/tilemap/${block.z}/${block.top}/${block.left}/${block.size}/${block.size}?f=json`).catch(() => {
        photoBlocks.delete(key); // asked again another time
        return null;
      }),
    );
  }
  return photoInBlock(await photoBlocks.get(key), x, y);
}

/**
 * How the map fetches a photo tile ("photo://level/row/column"). Where the
 * photo does not come that sharp the tile is reported as not found: the map
 * then shows the coarser one it has, stretched, and says nothing.
 */
export async function photoProtocol(request, abortController) {
  const tile = photoTileOf(request.url);
  if (!tile) throw new Error(`Not a photo tile: ${request.url}`);
  if ((await photoThere(tile.z, tile.x, tile.y)) === false) throw notThere();
  const response = await fetch(`${PHOTO_URL}/tile/${tile.z}/${tile.y}/${tile.x}`, { signal: abortController?.signal });
  if (!response.ok) throw Object.assign(new Error(`The photo service answered ${response.status}`), { status: response.status });
  const data = await response.arrayBuffer();
  if (tile.z > PHOTO_SURE_ZOOM && data.byteLength === PHOTO_CARD_BYTES) throw notThere(); // the card, where the service did not say beforehand
  return { data, cacheControl: response.headers.get('Cache-Control'), expires: response.headers.get('Expires') };
}

// ── The satellite photo, to look at rather than to show ──────────────────────

const photoTiles = new Map(); // "zoom/x/y" → a promise of its pixels
const PHOTO_TILES_KEPT = 160;

/**
 * The pixels of one satellite photo tile: { width, height, data }, or null if
 * it could not be had. These are the tiles the map itself shows, so the browser
 * usually has them already.
 */
export function photoTile(zoom, x, y) {
  const key = `${zoom}/${x}/${y}`;
  if (!photoTiles.has(key)) {
    if (photoTiles.size >= PHOTO_TILES_KEPT) photoTiles.delete(photoTiles.keys().next().value);
    photoTiles.set(
      key,
      (async () => {
        try {
          const response = await fetch(`${PHOTO_URL}/tile/${zoom}/${y}/${x}`);
          if (!response.ok) return null;
          const picture = await createImageBitmap(await response.blob());
          const canvas = document.createElement('canvas');
          canvas.width = picture.width;
          canvas.height = picture.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(picture, 0, 0);
          const pixels = ctx.getImageData(0, 0, picture.width, picture.height);
          return { width: pixels.width, height: pixels.height, data: pixels.data };
        } catch {
          photoTiles.delete(key); // try again another time
          return null;
        }
      })(),
    );
  }
  return photoTiles.get(key);
}

const photoDays = new Map(); // a patch of ground → a promise of the day its photo was taken

/** The day the satellite photo of a place was taken, as a Date, or null when the service does not say. */
export function photoDate(position) {
  // One photo covers many kilometres; ask once for each patch of about two.
  const key = `${(position.lat * 50).toFixed(0)},${(position.lng * 50).toFixed(0)}`;
  if (!photoDays.has(key)) {
    const span = 0.002;
    const query = new URLSearchParams({
      f: 'json',
      geometryType: 'esriGeometryPoint',
      geometry: `${position.lng},${position.lat}`,
      sr: '4326',
      layers: 'all',
      tolerance: '2',
      returnGeometry: 'false',
      imageDisplay: '400,400,96',
      mapExtent: `${position.lng - span},${position.lat - span},${position.lng + span},${position.lat + span}`,
    });
    photoDays.set(
      key,
      fetchJson(`${PHOTO_URL}/identify?${query}`)
        .then((answer) => {
          for (const result of answer?.results ?? []) {
            const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(result?.attributes?.['DATE (YYYYMMDD)'] ?? ''));
            if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
          }
          return null;
        })
        .catch(() => {
          photoDays.delete(key);
          return null;
        }),
    );
  }
  return photoDays.get(key);
}
