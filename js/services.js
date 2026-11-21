// The open data services the map draws on. Each one is free, needs no account
// and is asked as rarely as possible: answers are kept and reused.
//
//   OpenFreeMap   map styles and tiles (OpenStreetMap data)
//   Overpass API  details of one place, and posted speed limits
//   Photon        finding places by name, and the address of a point
//   Open-Meteo    the weather where you are
//   OSRM          a driving route between two points

import {
  detailsQuery,
  distanceMeters,
  photonPlace,
  routeSummary,
  speedLimitQuery,
  speedLimitRoads,
  weatherSummary,
} from './lib.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const PHOTON_URL = 'https://photon.komoot.io';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving/';

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

// ── Photon ────────────────────────────────────────────────────────────────

// Photon answers in the place's own language unless asked for one of these.
const PHOTON_LANGUAGES = ['en', 'de', 'fr'];

function photonLanguage() {
  const wanted = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return PHOTON_LANGUAGES.includes(wanted) ? wanted : null;
}

/** Places matching what was typed, nearest to `near` first. */
export async function searchPlaces(text, near, { signal } = {}) {
  const params = new URLSearchParams({ q: text, limit: '8' });
  if (near) {
    params.set('lat', near.lat.toFixed(4));
    params.set('lon', near.lng.toFixed(4));
  }
  const lang = photonLanguage();
  if (lang) params.set('lang', lang);
  const answer = await fetchJson(`${PHOTON_URL}/api/?${params}`, { signal, timeout: 10000 });
  return (answer.features ?? []).map(photonPlace).filter(Boolean);
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

/** The weather at a position as { temperature (°C), text }, or null if unknown. */
export async function weatherAt(position) {
  const fresh =
    weather &&
    Date.now() - weather.at < WEATHER_MAX_AGE_MS &&
    distanceMeters(weather.position, position) < WEATHER_MAX_DRIFT_M;
  if (fresh || weatherBusy || Date.now() < weatherRetryAt) return weather ? weather.summary : null;

  weatherBusy = true;
  try {
    const params = new URLSearchParams({
      latitude: position.lat.toFixed(3),
      longitude: position.lng.toFixed(3),
      current: 'temperature_2m,weather_code',
    });
    const answer = await fetchJson(`${WEATHER_URL}?${params}`, { timeout: 10000 });
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
