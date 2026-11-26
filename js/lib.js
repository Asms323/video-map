// Pure helpers shared by the app and its tests. Nothing in here touches the DOM.

import { landmarkSlabs } from './landmarks.js';

export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;
export const MAX_RECENTS = 8;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Turn a YouTube time value ("90", "90s", "1m30s", "1h2m3s") into whole seconds.
 * Returns 0 for anything it cannot read.
 */
export function parseStartSeconds(raw) {
  if (raw == null) return 0;
  const text = String(raw).trim().toLowerCase();
  if (text === '') return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match || match[0] === '') return 0;
  const [, h = 0, m = 0, s = 0] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/**
 * Work out what a pasted link is.
 *
 *   { kind: 'youtube', id, list, start }  a YouTube video and/or playlist
 *   { kind: 'file', url, hls }            a direct link to a video file or stream
 *   { kind: 'invalid', reason }           reason is 'empty', 'not-a-link' or 'scheme'
 */
export function parseVideoLink(input) {
  const text = String(input ?? '').trim();
  if (text === '') return { kind: 'invalid', reason: 'empty' };

  // People often paste links without the scheme ("youtu.be/…").
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  const candidate = hasScheme ? text : `https://${text}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { kind: 'invalid', reason: 'not-a-link' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { kind: 'invalid', reason: 'scheme' };
  }
  if (!url.hostname.includes('.')) return { kind: 'invalid', reason: 'not-a-link' };

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (YOUTUBE_HOSTS.has(host)) {
    const youtube = parseYouTube(url, host);
    if (youtube) return youtube;
    return { kind: 'invalid', reason: 'not-a-link' };
  }

  return { kind: 'file', url: url.href, hls: /\.m3u8$/i.test(url.pathname) };
}

function parseYouTube(url, host) {
  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;

  if (host === 'youtu.be') {
    id = parts[0] ?? null;
  } else if (parts[0] === 'watch') {
    id = url.searchParams.get('v');
  } else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
    id = parts[1] ?? null;
  }

  if (id === 'videoseries') id = null;
  if (id != null && !VIDEO_ID.test(id)) id = null;

  let list = url.searchParams.get('list');
  if (list != null && !LIST_ID.test(list)) list = null;

  if (!id && !list) return null;

  const start = parseStartSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { kind: 'youtube', id, list, start };
}

/** Address of YouTube's own embedded player for a parsed link. */
export function youtubeEmbedUrl({ id, list, start }) {
  const base = `https://www.youtube-nocookie.com/embed/${id ?? 'videoseries'}`;
  const params = new URLSearchParams({ playsinline: '1', rel: '0', autoplay: '1' });
  if (list) params.set('list', list);
  if (start > 0) params.set('start', String(start));
  return `${base}?${params}`;
}

/**
 * Speed for the on-map readout. `metersPerSecond` is what the Geolocation API
 * reports; it is null (or negative on some phones) when the speed is unknown.
 */
export function formatSpeed(metersPerSecond, unit) {
  const label = unit === 'mph' ? 'mph' : 'km/h';
  if (typeof metersPerSecond !== 'number' || !Number.isFinite(metersPerSecond) || metersPerSecond < 0) {
    return { value: '–', unit: label, known: false };
  }
  const factor = unit === 'mph' ? 2.2369363 : 3.6;
  return { value: String(Math.round(metersPerSecond * factor)), unit: label, known: true };
}

/** Short, readable name for a link in the recent list. */
export function linkLabel(link) {
  if (link.kind === 'youtube') {
    return link.id ? `YouTube · ${link.id}` : 'YouTube playlist';
  }
  try {
    const url = new URL(link.url);
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
    const host = url.hostname.replace(/^www\./, '');
    return last ? `${last} · ${host}` : host;
  } catch {
    return String(link.url ?? '');
  }
}

/** Newest first, no duplicates, capped. Returns a new array. */
export function addRecent(list, href, max = MAX_RECENTS) {
  const clean = Array.isArray(list) ? list.filter((item) => typeof item === 'string' && item !== href) : [];
  return [href, ...clean].slice(0, max);
}

/**
 * Share of the stage the video pane should take the first time the app runs,
 * before the person has dragged the divider. In portrait the pane is sized to
 * fit a 16:9 picture exactly; in landscape the two panes are roughly even.
 */
export function defaultSplit(stageWidth, stageHeight, barSize, landscape) {
  if (landscape) return 0.55;
  const usable = stageHeight - barSize;
  if (!(usable > 0) || !(stageWidth > 0)) return 0.4;
  return clamp(((stageWidth * 9) / 16) / usable, SPLIT_MIN, 0.6);
}

// ── Distances and directions ──────────────────────────────────────────────
// Positions are plain { lat, lng } objects, in degrees.

// ── Riyadh ────────────────────────────────────────────────────────────────
// The app is made for one city. The map opens on it and keeps to it, and places are looked for in it.

/**
 * Riyadh, as far as the app is concerned: where the map opens when it has
 * nowhere else to open (Olaya, by Kingdom Centre) and how close; and the
 * ground the city covers with what is growing round it, from Dir'iyah and the
 * edge of the plateau in the west to beyond the airport in the north.
 */
export const RIYADH = {
  name: 'Riyadh',
  centre: { lat: 24.7136, lng: 46.6753 },
  zoom: 15.6,
  bounds: { west: 46.25, south: 24.3, east: 47.15, north: 25.15 },
};

/** Whether a place { lat, lng } lies in Riyadh. */
export function inRiyadh(place) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
  const { west, south, east, north } = RIYADH.bounds;
  return place.lng >= west && place.lng <= east && place.lat >= south && place.lat <= north;
}

const EARTH_RADIUS_M = 6371008.8;
const METERS_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceMeters(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass direction of travel from a to b: 0 is north, 90 is east. */
export function bearingDegrees(a, b) {
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRadians(b.lat));
  const x =
    Math.cos(toRadians(a.lat)) * Math.sin(toRadians(b.lat)) -
    Math.sin(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest angle between two compass directions, 0 to 180. */
export function angleBetween(a, b) {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/**
 * Distance in metres from p to the straight line segment a–b. Treats the
 * ground as flat around p, which is accurate over the few hundred metres a
 * road is matched across.
 */
export function pointToSegmentMeters(p, a, b) {
  const shrink = Math.cos(toRadians(p.lat));
  const ax = (a.lng - p.lng) * shrink;
  const ay = a.lat - p.lat;
  const bx = (b.lng - p.lng) * shrink;
  const by = b.lat - p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : clamp(-(ax * dx + ay * dy) / lengthSquared, 0, 1);
  return Math.hypot(ax + along * dx, ay + along * dy) * METERS_PER_DEGREE;
}

/** A circle on the ground as one GeoJSON polygon ring of [lng, lat] points. */
export function circleRing(center, radiusMeters, steps = 48) {
  const ring = [];
  const dLat = radiusMeters / METERS_PER_DEGREE;
  const dLng = dLat / Math.max(Math.cos(toRadians(center.lat)), 0.01);
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + dLng * Math.sin(angle), center.lat + dLat * Math.cos(angle)]);
  }
  return ring;
}

/** "850 m", "1.2 km", "12 km" — or feet and miles. */
export function formatDistance(meters, unit) {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return '';
  if (unit === 'mph') {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.max(Math.round((meters * 3.28084) / 10) * 10, 10)} ft`;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.max(Math.round(meters / 10) * 10, 10)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** "under 1 min", "18 min", "1 h 5 min". */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

// ── Roads ─────────────────────────────────────────────────────────────────

/**
 * An OpenStreetMap "maxspeed" value as km/h, or null when it is not a plain
 * number ("none", "signals", "SA:urban", …). "30 mph" is converted.
 */
export function parseMaxspeed(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const match = /^(\d+(?:\.\d+)?)\s*(mph|knots)?/.exec(String(raw).trim().toLowerCase());
  if (!match) return null;
  const value = Number(match[1]);
  if (!(value > 0) || value > 400) return null;
  if (match[2] === 'mph') return Math.round(value * 1.609344);
  if (match[2] === 'knots') return Math.round(value * 1.852);
  return Math.round(value);
}

/** A speed limit for the sign: km/h as posted, or the nearest 5 in mph. */
export function formatSpeedLimit(kmh, unit) {
  if (typeof kmh !== 'number' || !Number.isFinite(kmh) || kmh <= 0) return '';
  return String(unit === 'mph' ? Math.round(kmh / 1.609344 / 5) * 5 : Math.round(kmh));
}

/** True when a speed (m/s, as the phone reports it) is clearly over a limit in km/h. */
export function isOverLimit(metersPerSecond, limitKmh) {
  if (typeof metersPerSecond !== 'number' || !Number.isFinite(metersPerSecond)) return false;
  if (typeof limitKmh !== 'number' || !(limitKmh > 0)) return false;
  return metersPerSecond * 3.6 > limitKmh + 3;
}

/**
 * The road the phone is most likely on.
 *
 * `roads` is a list of { lines: [[{lat, lng}, …], …], … }. Returns
 * { road, distance } for the best match within `maxDistance` metres, or null.
 * When the direction of travel is known, roads running that way win over
 * roads that merely cross nearby.
 */
export function nearestRoad(roads, position, heading, maxDistance = 30) {
  const useHeading = typeof heading === 'number' && Number.isFinite(heading);
  const latMargin = maxDistance / METERS_PER_DEGREE;
  const lngMargin = latMargin / Math.max(Math.cos(toRadians(position.lat)), 0.01);
  let best = null;

  for (const road of roads) {
    for (const line of road.lines) {
      for (let i = 1; i < line.length; i += 1) {
        const a = line[i - 1];
        const b = line[i];
        if (
          position.lat < Math.min(a.lat, b.lat) - latMargin ||
          position.lat > Math.max(a.lat, b.lat) + latMargin ||
          position.lng < Math.min(a.lng, b.lng) - lngMargin ||
          position.lng > Math.max(a.lng, b.lng) + lngMargin
        ) {
          continue;
        }
        const distance = pointToSegmentMeters(position, a, b);
        if (distance > maxDistance) continue;
        let score = distance;
        if (useHeading) {
          // A road can be driven both ways, so compare with the nearer direction.
          const along = bearingDegrees(a, b);
          const off = Math.min(angleBetween(heading, along), angleBetween(heading, (along + 180) % 360));
          score += (off / 90) * 25;
        }
        if (best === null || score < best.score) best = { road, distance, score };
      }
    }
  }
  return best === null ? null : { road: best.road, distance: best.distance };
}

/** GeoJSON line geometry (LineString or MultiLineString) as lists of { lat, lng }. */
export function linesFromGeometry(geometry) {
  if (!geometry) return [];
  const toLine = (coordinates) => coordinates.map(([lng, lat]) => ({ lat, lng }));
  if (geometry.type === 'LineString') return [toLine(geometry.coordinates)];
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map(toLine);
  return [];
}

// ── Names ─────────────────────────────────────────────────────────────────

/**
 * The name to show for a map feature or an OpenStreetMap element: the
 * Latin-script name first, with the local-script name beside it when the two
 * differ. Returns { title, alt }; both are '' when there is no name.
 */
export function displayName(properties) {
  const p = properties ?? {};
  const title = p['name:en'] || p['name:latin'] || p.name || p['name:nonlatin'] || '';
  const alt = [p['name:nonlatin'], p['name:ar'], p.name].find((value) => value && value !== title) || '';
  return { title, alt };
}

const prettify = (value) => {
  const text = String(value ?? '').replace(/[_:]+/g, ' ').trim();
  return text === '' ? '' : text[0].toUpperCase() + text.slice(1);
};

const KIND_LABELS = {
  atm: 'ATM',
  bakery: 'Bakery',
  bank: 'Bank',
  bus_station: 'Bus station',
  bus_stop: 'Bus stop',
  cafe: 'Café',
  car_repair: 'Car repair',
  car_wash: 'Car wash',
  charging_station: 'Charging station',
  christian: 'Church',
  clinic: 'Clinic',
  convenience: 'Convenience store',
  dentist: 'Dentist',
  department_store: 'Department store',
  doctors: 'Doctor',
  fast_food: 'Fast food',
  fuel: 'Fuel station',
  hospital: 'Hospital',
  hotel: 'Hotel',
  ice_cream: 'Ice cream',
  mall: 'Shopping mall',
  marketplace: 'Market',
  motel: 'Motel',
  muslim: 'Mosque',
  parking: 'Parking',
  pharmacy: 'Pharmacy',
  place_of_worship: 'Place of worship',
  police: 'Police',
  restaurant: 'Restaurant',
  school: 'School',
  subway: 'Metro station',
  supermarket: 'Supermarket',
  toilets: 'Toilets',
  university: 'University',
};

/** What kind of place this is, in words, from its map class and subclass (or OSM key and value). */
export function placeKind(className, subclass) {
  if (subclass && KIND_LABELS[subclass]) return KIND_LABELS[subclass];
  if (className && KIND_LABELS[className]) return KIND_LABELS[className];
  if (className === 'highway') return 'Road';
  if (className === 'building' && (!subclass || subclass === 'yes')) return 'Building';
  if (subclass && subclass !== 'yes') return prettify(subclass);
  return prettify(className);
}

// ── Places shown on the map ───────────────────────────────────────────────
// These read the "poi" layer of the OpenMapTiles data the map is drawn from,
// so turning a category on needs no extra download.

const isClass = (...names) =>
  names.length === 1
    ? ['==', ['get', 'class'], names[0]]
    : ['in', ['get', 'class'], ['literal', names]];
const isSubclass = (...names) =>
  names.length === 1
    ? ['==', ['get', 'subclass'], names[0]]
    : ['in', ['get', 'subclass'], ['literal', names]];

export const PLACE_CATEGORIES = [
  {
    id: 'fuel',
    label: 'Fuel',
    color: '#e8590c',
    filter: ['all', isClass('fuel'), ['!=', ['get', 'subclass'], 'charging_station']],
    test: (c, s) => c === 'fuel' && s !== 'charging_station',
  },
  {
    id: 'charging',
    label: 'Charging',
    color: '#0ca678',
    filter: isSubclass('charging_station'),
    test: (c, s) => s === 'charging_station',
  },
  {
    id: 'parking',
    label: 'Parking',
    color: '#1971c2',
    filter: isClass('parking'),
    test: (c) => c === 'parking',
  },
  {
    id: 'food',
    label: 'Food & coffee',
    color: '#d9480f',
    filter: isClass('restaurant', 'fast_food', 'cafe', 'bakery', 'ice_cream'),
    test: (c) => ['restaurant', 'fast_food', 'cafe', 'bakery', 'ice_cream'].includes(c),
  },
  {
    id: 'worship',
    label: 'Mosques & worship',
    color: '#5f3dc4',
    filter: isClass('place_of_worship'),
    test: (c) => c === 'place_of_worship',
  },
  {
    id: 'health',
    label: 'Health',
    color: '#e03131',
    filter: isClass('hospital', 'pharmacy', 'dentist', 'doctors'),
    test: (c) => ['hospital', 'pharmacy', 'dentist', 'doctors'].includes(c),
  },
  {
    id: 'money',
    label: 'Banks & ATMs',
    color: '#2b8a3e',
    filter: isClass('bank', 'atm'),
    test: (c) => c === 'bank' || c === 'atm',
  },
  {
    id: 'shops',
    label: 'Shopping',
    color: '#c2255c',
    filter: ['any', isClass('grocery'), isSubclass('mall', 'convenience', 'department_store')],
    test: (c, s) => c === 'grocery' || ['mall', 'convenience', 'department_store'].includes(s),
  },
  {
    id: 'hotels',
    label: 'Hotels',
    color: '#0b7285',
    filter: isClass('lodging'),
    test: (c) => c === 'lodging',
  },
];

/** Keep only real category ids, in the order the app lists them. */
export function cleanCategories(ids) {
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  return PLACE_CATEGORIES.filter((category) => wanted.has(category.id)).map((category) => category.id);
}

/** Which category a place belongs to, or null. */
export function categoryOf(className, subclass) {
  const found = PLACE_CATEGORIES.find((category) => category.test(className, subclass));
  return found ? found.id : null;
}

/** Map filter that keeps the places of the chosen categories. */
export function categoryFilter(ids) {
  const chosen = PLACE_CATEGORIES.filter((category) => ids.includes(category.id));
  if (chosen.length === 0) return ['==', ['get', 'class'], '\u0000none'];
  return ['any', ...chosen.map((category) => category.filter)];
}

/** Map expression that picks each place's marker image ("vm-fuel", "vm-parking", …). */
export function categoryIconExpression() {
  const cases = PLACE_CATEGORIES.flatMap((category) => [category.filter, `vm-${category.id}`]);
  return ['case', ...cases, 'vm-other'];
}

/**
 * The OpenStreetMap element behind a map-tile feature. The tiles number their
 * features as the OSM id times ten, plus 1 for a node, 2 for a way and 3 for
 * a relation.
 */
export function osmRefFromTileId(id) {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 10) return null;
  const type = { 1: 'node', 2: 'way', 3: 'relation' }[id % 10];
  return type ? { type, id: Math.floor(id / 10) } : null;
}

// ── Details of one place, from its OpenStreetMap tags ─────────────────────

const FUEL_NAMES = {
  adblue: 'AdBlue',
  cng: 'CNG',
  diesel: 'Diesel',
  e10: 'E10',
  e85: 'E85',
  lpg: 'LPG',
  octane_91: '91',
  octane_92: '92',
  octane_95: '95',
  octane_98: '98',
  octane_100: '100',
};

const SOCKET_NAMES = {
  chademo: 'CHAdeMO',
  tesla_supercharger: 'Tesla',
  type1: 'Type 1',
  type1_combo: 'CCS 1',
  type2: 'Type 2',
  type2_cable: 'Type 2',
  type2_combo: 'CCS',
};

const YES_NO = { yes: 'Yes', no: 'No', limited: 'Limited', designated: 'Yes' };

function httpLink(value) {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const listValue = (value) =>
  String(value)
    .split(';')
    .map((part) => prettify(part))
    .filter(Boolean)
    .join(', ');

/**
 * The useful facts about a place as rows of { label, value, href? }, read
 * from its OpenStreetMap tags. Unknown or empty tags are left out.
 */
export function describeTags(tags) {
  const t = tags ?? {};
  const rows = [];
  const add = (label, value, href) => {
    if (value) rows.push(href ? { label, value, href } : { label, value });
  };

  const hours = t.opening_hours;
  add('Hours', hours === '24/7' ? 'Open 24 hours' : hours);

  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const area = t['addr:district'] || t['addr:suburb'] || t['addr:neighbourhood'];
  add('Address', [street, area, t['addr:city']].filter(Boolean).join(', '));

  const phone = t.phone || t['contact:phone'] || t['contact:mobile'];
  if (phone) {
    const first = String(phone).split(';')[0].trim();
    add('Phone', first, `tel:${first.replace(/[^\d+]/g, '')}`);
  }

  const site = httpLink(t.website || t['contact:website'] || t.url);
  if (site) add('Website', new URL(site).hostname.replace(/^www\./, ''), site);

  const brand = t.brand || t.operator;
  if (brand && brand !== t.name && brand !== t['name:en']) add('Run by', brand);

  if (t.cuisine) add('Food', listValue(t.cuisine));

  const fuels = Object.keys(t)
    .filter((key) => key.startsWith('fuel:') && t[key] === 'yes')
    .map((key) => FUEL_NAMES[key.slice(5)] ?? prettify(key.slice(5)));
  add('Fuel', fuels.sort().join(', '));

  const sockets = Object.keys(t)
    .filter((key) => /^socket:[a-z0-9_]+$/.test(key) && t[key] !== 'no')
    .map((key) => SOCKET_NAMES[key.slice(7)] ?? prettify(key.slice(7)));
  add('Plugs', [...new Set(sockets)].sort().join(', '));

  if (t.amenity === 'parking' || t.amenity === 'charging_station') {
    add('Spaces', t.capacity);
    add('Fee', YES_NO[t.fee] ?? '');
    if (t.amenity === 'parking') add('Type', t.parking ? prettify(t.parking) : '');
  }

  if (t.stars) add('Stars', String(t.stars));
  if (t.religion && t.religion !== 'muslim') add('Religion', prettify(t.religion));
  add('Wheelchair', YES_NO[t.wheelchair] ?? '');

  if (t.wikipedia && /^[a-z-]{2,12}:.+/.test(t.wikipedia)) {
    const [lang, ...rest] = t.wikipedia.split(':');
    const article = rest.join(':');
    add('More', 'Wikipedia', `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, '_'))}`);
  }

  return rows;
}

// ── Open data services: what to ask, and how to read the answers ──────────

/** Overpass query for one OpenStreetMap element's tags. */
export function detailsQuery(ref) {
  return `[out:json][timeout:10];${ref.type}(${ref.id});out tags;`;
}

/** Overpass query for the roads with a posted speed limit around a point. */
export function speedLimitQuery(position, radiusMeters) {
  const lat = position.lat.toFixed(5);
  const lng = position.lng.toFixed(5);
  return `[out:json][timeout:15];way["highway"]["maxspeed"](around:${Math.round(radiusMeters)},${lat},${lng});out tags geom qt;`;
}

/**
 * Overpass query for every traffic signal OpenStreetMap marks in Riyadh. The same whoever asks, and
 * wherever from: nothing of where you are goes with it.
 */
export function signalQuery() {
  const { west, south, east, north } = RIYADH.bounds;
  return `[out:json][timeout:25];node["highway"="traffic_signals"](${south},${west},${north},${east});out skel qt;`;
}

/** Where the traffic signals of an Overpass answer stand: [[lng, lat], …], to the metre, those in Riyadh only. */
export function signalPoints(answer) {
  const elements = Array.isArray(answer?.elements) ? answer.elements : [];
  const points = [];
  for (const element of elements) {
    if (element?.type !== 'node' || !inRiyadh({ lat: element.lat, lng: element.lon })) continue;
    points.push([Math.round(element.lon * 1e5) / 1e5, Math.round(element.lat * 1e5) / 1e5]);
  }
  return points;
}

/** How long an answer about the city's signals is kept: a week. They are not moved about. */
export const SIGNALS_KEPT_MS = 7 * 24 * 3600 * 1000;

/** The signals of signalPoints() as they are kept on the phone: { at (when they were asked for, ms), places: [lng, lat, lng, lat, …] }. */
export function packSignals(points, at) {
  return { at, places: points.flat() };
}

/**
 * The signals kept by packSignals(), as { at, points: [[lng, lat], …] }; or null if what was kept is
 * not that (something else under the name, a list cut short, a place outside the city, a time yet to come).
 */
export function unpackSignals(kept, now) {
  if (!kept || !Number.isFinite(kept.at) || kept.at > now || !Array.isArray(kept.places) || kept.places.length % 2 !== 0) return null;
  const points = [];
  for (let i = 0; i < kept.places.length; i += 2) {
    const [lng, lat] = [kept.places[i], kept.places[i + 1]];
    if (!inRiyadh({ lat, lng })) return null;
    points.push([lng, lat]);
  }
  return { at: kept.at, points };
}

/** Roads with a usable speed limit from an Overpass answer: [{ limit, lines }]. */
export function speedLimitRoads(answer) {
  const elements = Array.isArray(answer?.elements) ? answer.elements : [];
  const roads = [];
  for (const element of elements) {
    if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
    const limit = parseMaxspeed(element.tags?.maxspeed);
    if (limit === null) continue;
    const line = element.geometry
      .filter((point) => point && typeof point.lat === 'number' && typeof point.lon === 'number')
      .map((point) => ({ lat: point.lat, lng: point.lon }));
    if (line.length >= 2) roads.push({ limit, lines: [line] });
  }
  return roads;
}

/** One search result from the Photon geocoder as a place the app can show. */
export function photonPlace(feature) {
  const p = feature?.properties ?? {};
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const title = p.name || street || p.city || p.county || p.state || p.country || '';
  if (title === '') return null;
  const detail = [street, p.district, p.city, p.state, p.country]
    .filter((part, index, all) => part && part !== title && all.indexOf(part) === index)
    .join(', ');

  const type = { N: 'node', W: 'way', R: 'relation' }[p.osm_type];
  return {
    title,
    alt: '',
    kind: placeKind(p.osm_key, p.osm_value),
    detail,
    lat,
    lng,
    osm: type && Number.isSafeInteger(p.osm_id) ? { type, id: p.osm_id } : null,
  };
}

// WMO weather codes, as Open-Meteo reports them.
const WEATHER_TEXT = [
  [[0], 'Clear'],
  [[1], 'Mostly clear'],
  [[2], 'Partly cloudy'],
  [[3], 'Cloudy'],
  [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'Snow'],
  [[95, 96, 99], 'Thunderstorm'],
];

/** Open-Meteo's "current" block as { temperature, text } — or null if it is not usable. */
export function weatherSummary(current) {
  const temperature = current?.temperature_2m;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return null;
  const found = WEATHER_TEXT.find(([codes]) => codes.includes(current.weather_code));
  // "|| 0" turns the -0 that rounding -0.4 gives into a plain 0.
  const summary = { temperature: Math.round(temperature) || 0, text: found ? found[1] : '' };
  // For the sky: how much of it is covered (0 to 1), and the wind: where from, in degrees, and how fast, in m/s.
  if (Number.isFinite(current.cloud_cover)) summary.cloud = clamp(current.cloud_cover / 100, 0, 1);
  // (And the same for each layer of cloud: under 3 km, from 3 to 8, and over 8; and how far one can see, in metres.)
  if (Number.isFinite(current.cloud_cover_low)) summary.cloudLow = clamp(current.cloud_cover_low / 100, 0, 1);
  if (Number.isFinite(current.cloud_cover_mid)) summary.cloudMid = clamp(current.cloud_cover_mid / 100, 0, 1);
  if (Number.isFinite(current.cloud_cover_high)) summary.cloudHigh = clamp(current.cloud_cover_high / 100, 0, 1);
  if (Number.isFinite(current.visibility) && current.visibility > 0) summary.visibility = current.visibility;
  if (Number.isFinite(current.wind_direction_10m)) summary.windFrom = current.wind_direction_10m;
  if (Number.isFinite(current.wind_speed_10m)) summary.windSpeed = current.wind_speed_10m;
  return summary;
}

/**
 * The clouds round a place as the weather service has them at a grid of points, for the sky over the 3D
 * city: { at (the moment the reading is for, ms), lats (the grid's rows, south to north), lngs (its
 * columns, west to east), low, mid, high (how much of the sky each layer covers at each point, 0 to 1,
 * row by row from the south-west), aloft ([{ from, speed }] for the high, middle and low layers: where
 * the wind blows from at their heights, in degrees, and how fast, in m/s; or null) }.
 *
 * answer: the service's answer for the points, asked row by row from the south-west (a list, or one
 * answer for one point); lats, lngs: the grid's lines as asked; now: the time, to pick the hour of the
 * winds aloft. Null if the answer does not fit the grid.
 */
export function cloudField(answer, lats, lngs, now = Date.now()) {
  const list = Array.isArray(answer) ? answer : [answer];
  if (list.length !== lats.length * lngs.length) return null;
  const share = (value) => (Number.isFinite(value) ? clamp(value / 100, 0, 1) : null);
  const field = { at: NaN, lats: [...lats], lngs: [...lngs], low: [], mid: [], high: [], aloft: null };
  for (const one of list) {
    const current = one?.current;
    const [low, mid, high] = [share(current?.cloud_cover_low), share(current?.cloud_cover_mid), share(current?.cloud_cover_high)];
    if (low === null || mid === null || high === null) return null;
    field.low.push(low);
    field.mid.push(mid);
    field.high.push(high);
    const at = Date.parse(`${current.time}Z`);
    if (Number.isFinite(at)) field.at = Number.isFinite(field.at) ? Math.max(field.at, at) : at;
  }
  if (!Number.isFinite(field.at)) field.at = now;
  // The winds aloft, where they were asked: from the middle of the grid, at the hour nearest now.
  const hourly = list[Math.floor(list.length / 2)]?.hourly;
  if (Array.isArray(hourly?.time) && hourly.time.length > 0) {
    const times = hourly.time.map((time) => Date.parse(`${time}Z`));
    let nearest = 0;
    times.forEach((time, k) => {
      if (Math.abs(time - now) < Math.abs(times[nearest] - now)) nearest = k;
    });
    const wind = (level) => {
      const [speed, from] = [hourly[`wind_speed_${level}hPa`]?.[nearest], hourly[`wind_direction_${level}hPa`]?.[nearest]];
      return Number.isFinite(speed) && Number.isFinite(from) ? { from, speed } : null;
    };
    const aloft = [wind(250), wind(500), wind(700)];
    if (aloft.every(Boolean)) field.aloft = aloft;
  }
  return field;
}

/** The first route of an OSRM answer as { distance, duration, coordinates } — or null. */
export function routeSummary(answer) {
  const route = answer?.code === 'Ok' && Array.isArray(answer.routes) ? answer.routes[0] : null;
  const coordinates = route?.geometry?.coordinates;
  if (!route || !Array.isArray(coordinates) || coordinates.length < 2) return null;
  return { distance: route.distance, duration: route.duration, coordinates };
}

// ── Sun, light and shadows ────────────────────────────────────────────────

/**
 * Where the sun is in the sky, as { azimuth, altitude } in degrees. Azimuth is
 * the compass direction to the sun (0 north, 90 east); altitude is its height
 * above the horizon, negative at night. Good to a fraction of a degree, which
 * is plenty for lighting a map.
 */
export function sunPosition(date, lat, lng) {
  const days = date.getTime() / 86400000 - 0.5 + 2440588 - 2451545; // days since 1 Jan 2000, noon
  const anomaly = toRadians(357.5291 + 0.98560028 * days);
  const centre = toRadians(
    1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly),
  );
  const longitude = anomaly + centre + toRadians(102.9372) + Math.PI; // along the ecliptic
  const tilt = toRadians(23.4397);
  const declination = Math.asin(Math.sin(longitude) * Math.sin(tilt));
  const rightAscension = Math.atan2(Math.sin(longitude) * Math.cos(tilt), Math.cos(longitude));
  const hourAngle = toRadians(280.16 + 360.9856235 * days) + toRadians(lng) - rightAscension;
  const phi = toRadians(lat);
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle),
  );
  // This angle is measured from south, turning west; shift it onto the compass.
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(phi) - Math.tan(declination) * Math.cos(phi),
  );
  return { azimuth: (toDegrees(fromSouth) + 540) % 360, altitude: toDegrees(altitude) };
}

// Below this the sun is on the horizon or gone: no shadows, and an even light.
const SUN_UP_DEGREES = 3;
// A low sun would stretch shadows across the whole district; stop at this many metres per metre of height.
const LONGEST_SHADOW = 3.5;

/**
 * How shadows fall for a sun position: { bearing, factor }, the compass
 * direction they point in and their length for each metre of height. Null
 * when the sun is too low to cast any.
 */
export function shadowReach(sun) {
  if (!sun || !(sun.altitude > SUN_UP_DEGREES)) return null;
  return {
    bearing: (sun.azimuth + 180) % 360,
    factor: Math.min(1 / Math.tan(toRadians(sun.altitude)), LONGEST_SHADOW),
  };
}

// With the sun this far below the horizon it is night. Between sunset and then the light goes little by little.
const NIGHT_DEGREES = -6;

/**
 * How dark it is for a sun position: 0 while the sun is up, 1 by night, and
 * in between at dusk and at dawn.
 */
export function darkness(sun) {
  if (!sun || !Number.isFinite(sun.altitude)) return 0;
  return clamp((SUN_UP_DEGREES - sun.altitude) / (SUN_UP_DEGREES - NIGHT_DEGREES), 0, 1);
}

/**
 * How far the lamps are on for a darkness of 0 (day) to 1 (night): they come
 * on as the light goes, and are full on well before it is quite dark.
 */
export function lampsLit(night) {
  const t = clamp(((Number(night) || 0) - 0.1) / 0.4, 0, 1);
  return t * t * (3 - 2 * t);
}

const hexMix = (from, to, amount) => {
  const part = (hex, at) => parseInt(hex.slice(at, at + 2), 16);
  const blend = (at) => Math.round(part(from, at) + (part(to, at) - part(from, at)) * amount);
  return `#${[1, 3, 5].map((at) => blend(at).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * The map's light for a sun position, in MapLibre's terms. By day the light
 * comes from where the sun really is, white at midday and warmer towards
 * sunrise and sunset. At night there is a soft even light from the viewer's side.
 */
export function sunLight(sun) {
  if (!sun || !(sun.altitude > SUN_UP_DEGREES)) {
    return { anchor: 'viewport', position: [1.5, 215, 35], color: '#dfe6f5', intensity: 0.2 };
  }
  const lowness = clamp((25 - sun.altitude) / 25, 0, 1);
  return {
    anchor: 'map',
    // [distance, compass direction to the light, angle down from straight overhead].
    // The direction is the sun's own. The height is kept above 35°: under a real
    // sky flat roofs stay bright even when the sun is low.
    position: [1.5, Math.round(sun.azimuth * 10) / 10, Math.round(clamp(90 - sun.altitude, 10, 55) * 10) / 10],
    color: hexMix('#ffffff', '#fff6ea', lowness),
    intensity: 0.35,
  };
}

/**
 * Building footprints from map-tile features, for the buildings that reach
 * into a box { west, south, east, north }: [{ height, base, polygons }], with
 * heights in metres and each polygon a list of rings, the outline first and
 * then any courtyards. The tiles group many buildings of one height into a
 * single feature; a group stays together here, minus the ones outside the box.
 */
export function footprintsIn(features, box) {
  const buildings = [];
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    const height = Number(properties.render_height);
    const base = Math.max(Number(properties.render_min_height) || 0, 0);
    // "hide_3d" marks an outline whose separate parts are drawn instead.
    if (!(height > base) || 'hide_3d' in properties) continue;
    const geometry = feature.geometry; // read last: unpacking the shape is the costly part
    let all = [];
    if (geometry?.type === 'Polygon') all = [geometry.coordinates];
    else if (geometry?.type === 'MultiPolygon') all = geometry.coordinates;
    const polygons = all.filter((polygon) => {
      const outline = polygon[0];
      return (
        Array.isArray(outline) &&
        outline.length >= 4 &&
        outline.some(([lng, lat]) => lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north)
      );
    });
    if (polygons.length > 0) buildings.push({ height, base, polygons });
  }
  return buildings;
}

/**
 * The shadows that flat-roofed buildings cast on level ground, as GeoJSON.
 *
 * buildings: what footprintsIn() gives; reach: what shadowReach() gives;
 * shortest: leave out shadows shorter than this many metres (too small to see).
 *
 * A block's shadow is its footprint slid along the ground, away from the sun.
 * The ground it covers on the way is exactly the strips swept by the walls
 * that face away from the sun, so those strips are all that is drawn: the
 * building itself hides its own footprint. A part that starts above the
 * ground (a bridge between towers) has its shadow start further out, and
 * that one is drawn whole. Drawn in one translucent layer, the pieces merge
 * into a single even shade.
 */
export function buildingShadows(buildings, reach, shortest = 0) {
  const features = [];
  if (!reach) return { type: 'FeatureCollection', features };
  const direction = toRadians(reach.bearing);
  const north = Math.cos(direction);
  const east = Math.sin(direction);

  for (const building of buildings) {
    const base = building.base > 0 ? building.base : 0;
    const near = base * reach.factor; // where the shadow starts, metres from the wall
    const length = (building.height - base) * reach.factor;
    if (!(length > 0) || near + length < shortest) continue;
    const pieces = [];

    for (const polygon of building.polygons) {
      const squeeze = Math.max(Math.cos(toRadians(polygon[0][0][1])), 0.01); // a degree of longitude is shorter than one of latitude
      const slide = (meters) => {
        const dLng = (meters * east) / (METERS_PER_DEGREE * squeeze);
        const dLat = (meters * north) / METERS_PER_DEGREE;
        return ([lng, lat]) => [lng + dLng, lat + dLat];
      };
      const toNear = slide(near);
      const toFar = slide(length);
      const rings = near > 0 ? polygon.map((ring) => ring.map(toNear)) : polygon;
      if (near > 0) pieces.push(rings);

      rings.forEach((ring, index) => {
        if (ring.length < 4) return;
        // Which way round the ring runs tells which side of each wall is outdoors.
        let turning = 0;
        for (let i = 1; i < ring.length; i += 1) {
          turning += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
        }
        const outdoors = (turning > 0 ? 1 : -1) * (index === 0 ? 1 : -1); // a courtyard's ring is the other way round
        for (let i = 1; i < ring.length; i += 1) {
          const a = ring[i - 1];
          const b = ring[i];
          const alongEast = (b[0] - a[0]) * squeeze;
          const alongNorth = b[1] - a[1];
          // Only a wall whose outdoor side faces away from the sun throws a shadow outwards.
          if ((alongNorth * east - alongEast * north) * outdoors > 0) {
            pieces.push([[a, b, toFar(b), toFar(a), a]]);
          }
        }
      });
    }
    if (pieces.length > 0) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: pieces } });
    }
  }
  return { type: 'FeatureCollection', features };
}

// ── Map tiles ─────────────────────────────────────────────────────────────

/** The edges of a map tile, in degrees: { west, south, east, north }. */
export function tileBox(z, x, y) {
  const across = 2 ** z;
  const latitude = (row) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / across))) * 180) / Math.PI;
  return { west: (x / across) * 360 - 180, east: ((x + 1) / across) * 360 - 180, north: latitude(y), south: latitude(y + 1) };
}

/**
 * The parts of a line that lie inside a box { west, south, east, north }, cut
 * at its edges: a list of lines, each [[lng, lat], …].
 *
 * A map tile holds its roads a little way past its own edge, so the same
 * stretch of road comes with two neighbouring tiles. Cut to their own tiles,
 * the pieces meet end to end and nothing is there twice.
 */
export function clipLine(coordinates, box) {
  const pieces = [];
  let piece = null;
  for (let i = 1; i < coordinates.length; i += 1) {
    const [x0, y0] = coordinates[i - 1];
    const dx = coordinates[i][0] - x0;
    const dy = coordinates[i][1] - y0;
    // How much of this stretch is inside: from t0 to t1 of the way along it.
    let t0 = 0;
    let t1 = 1;
    for (const [step, room] of [[-dx, x0 - box.west], [dx, box.east - x0], [-dy, y0 - box.south], [dy, box.north - y0]]) {
      if (step === 0) {
        if (room < 0) t1 = -1; // runs along the outside of this edge
      } else if (step < 0) {
        t0 = Math.max(t0, room / step);
      } else {
        t1 = Math.min(t1, room / step);
      }
    }
    if (t0 > t1) {
      piece = null;
      continue;
    }
    if (!piece || t0 > 0) {
      piece = [[x0 + dx * t0, y0 + dy * t0]];
      pieces.push(piece);
    }
    piece.push([x0 + dx * t1, y0 + dy * t1]);
    if (t1 < 1) piece = null; // it left the box here
  }
  // A line that only touches a corner leaves a piece with no length.
  return pieces.filter((points) => points.some(([lng, lat]) => lng !== points[0][0] || lat !== points[0][1]));
}

// ── Buildings ─────────────────────────────────────────────────────────────

/**
 * The map source with one outline for every building: Overture Maps, which
 * joins OpenStreetMap with outlines traced from satellite photos. The street
 * map's own tiles weld neighbouring buildings into whole blocks.
 */
export const BUILDING_SOURCE = 'overture';

/** Where Overture keeps its map tiles: one folder for each monthly release, the older ones cleared away in time. */
export const BUILDING_STORE = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/';

/**
 * The addresses of the buildings archives on offer, newest release first,
 * from the store's own list of its release folders (XML). A release is named
 * by its date and a counter, e.g. "2026-11-18.0".
 */
export function buildingArchives(listing) {
  const releases = [];
  for (const match of String(listing ?? '').matchAll(/<Prefix>tiles\/(\d{4}-\d{2}-\d{2})\.(\d+)\/<\/Prefix>/g)) {
    releases.push({ day: match[1], counter: Number(match[2]) });
  }
  releases.sort((a, b) => (a.day === b.day ? b.counter - a.counter : a.day < b.day ? 1 : -1));
  return releases.map((release) => `${BUILDING_STORE}tiles/${release.day}.${release.counter}/buildings.pmtiles`);
}

// How tall a building is drawn when nobody recorded its height, by what it is
// used for, in metres. A guess that suits a low-rise city; a recorded height or
// a number of floors always wins, and so does a height read from a shadow.
export const USUAL_HEIGHTS = {
  residential: 7.5,
  commercial: 9,
  industrial: 7,
  religious: 8,
  education: 8,
  medical: 9,
  civic: 9,
  entertainment: 9,
  service: 5,
  transportation: 6,
  military: 6,
  agricultural: 4,
  outbuilding: 3,
};
export const USUAL_HEIGHT = 6;
export const STATION_HEIGHT = 12; // a metro station building: a hall over its platforms
const FLOOR_METERS = 3.3;
// No street is built to one height. The usual height is varied a little from
// building to building by the building's number in the map data, so a row of
// houses does not come out as one slab: by this much for a number that leaves
// 0, 1, 2, 3 or 4 when divided by five.
export const HEIGHT_SPREAD = [0.86, 1, 1, 1.14, 1.42];

/**
 * How tall a building is from its record: { height, base, known }. known is
 * false when the height is the usual one for its kind. id: the building's
 * number in the map data, if it has one.
 */
export function buildingHeight(properties, id) {
  const base = Math.max(Number(properties?.min_height) || 0, 0);
  const recorded = Number(properties?.height);
  if (recorded > base) return { height: recorded, base, known: true };
  const floors = Number(properties?.num_floors);
  if (floors > 0) return { height: base + floors * FLOOR_METERS, base, known: true };
  if (properties?.class === 'train_station') return { height: base + STATION_HEIGHT, base, known: false };
  const usual = Object.hasOwn(USUAL_HEIGHTS, properties?.subtype) ? USUAL_HEIGHTS[properties.subtype] : USUAL_HEIGHT;
  const spread = typeof id === 'number' && Number.isFinite(id) ? HEIGHT_SPREAD[Math.abs(id) % HEIGHT_SPREAD.length] : 1;
  return { height: base + usual * spread, base, known: false };
}

/**
 * Building footprints from Overture map-tile features, for the buildings that
 * reach into a box { west, south, east, north }:
 * [{ id, height, base, known, kind, use, usual, polygons }], each polygon a list of rings.
 * kind is 'station' for a metro or railway station building and 'mosque' for
 * a mosque; use is what the data says the building is for, where it says so
 * ('residential', 'commercial', 'religious', …); usual is the height the
 * building would have had without the estimate, where one was used; colour
 * is the colour of its walls, where one is on record; tile is the map tile
 * [z, x, y] the building was read from, where that is known.
 *
 * Left out: what is underground (a metro station under a street is recorded
 * as a building too), and a building whose separate parts are given, which
 * come as features of their own. estimates: Map of feature id → metres read
 * from the satellite photo, used where no height is on record and the
 * estimate is the taller. skip: a Set of feature ids to leave out as well
 * (see buildingsOnStreets).
 */
export function buildingFootprints(features, box, estimates, skip) {
  const buildings = [];
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    if (properties.is_underground === true || properties.has_parts === true || skip?.has(feature.id)) continue;
    const size = buildingHeight(properties, feature.id);
    const estimate = size.known ? undefined : estimates?.get(feature.id);
    if (estimate > size.height + 1) {
      size.usual = size.height;
      size.height = estimate;
    }
    const geometry = feature.geometry; // read last: unpacking the shape is the costly part
    let all = [];
    if (geometry?.type === 'Polygon') all = [geometry.coordinates];
    else if (geometry?.type === 'MultiPolygon') all = geometry.coordinates;
    const polygons = all.filter((polygon) => {
      const outline = polygon[0];
      return (
        Array.isArray(outline) &&
        outline.length >= 4 &&
        outline.some(([lng, lat]) => lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north)
      );
    });
    if (polygons.length > 0) {
      const kind = properties.class === 'train_station' ? 'station' : properties.class === 'mosque' ? 'mosque' : undefined;
      buildings.push({
        id: feature.id,
        ...size,
        kind,
        ...(properties.subtype ? { use: properties.subtype } : {}),
        ...(properties.facade_color ? { colour: properties.facade_color } : {}),
        ...(properties.roof_color ? { roofColour: properties.roof_color } : {}),
        // Which map tile this copy of the building came with: one that lies across the edge of a tile comes with both.
        ...(Number.isInteger(feature._z) ? { tile: [feature._z, feature._x, feature._y] } : {}),
        polygons,
      });
    }
  }
  return buildings;
}

// ── Roads ─────────────────────────────────────────────────────────────────

// How wide each kind of road is drawn in the 3D city, in metres. Widest last,
// so main roads are drawn over the side streets that meet them.
const CITY_ROADS = [
  { id: 'service', classes: ['service', 'track'], meters: 4, minzoom: 14 },
  { id: 'minor', classes: ['minor', 'busway'], meters: 10.5, minzoom: 12 },
  { id: 'mid', classes: ['secondary', 'tertiary'], meters: 9.5, minzoom: 9 },
  { id: 'main', classes: ['primary'], meters: 12, minzoom: 7 },
  { id: 'big', classes: ['motorway', 'trunk'], meters: 14, minzoom: 5 },
];
const TRACK_METERS = 5; // a railway line with its bed
const PATH_METERS = 2.2;
/**
 * A pavement runs along both sides of every street people walk beside: how
 * wide, in metres, by kind of road (see CITY_ROADS). None along a motorway, a
 * service lane or a track. The map data seldom has pavements of its own; these
 * are laid by rule, the same along every street of a kind.
 */
// (A house street has none: its asphalt runs to a raised strip at the foot of the plot walls, which the app lays itself. See streetAprons in houses.js.)
export const PAVEMENT_METERS = { minor: 0, mid: 3.5, main: 4.5 };
const PAVING = '#e2dfd8'; // paving stones: paler and greyer than the bare ground beside them
const PAVING_EDGE = '#9f9a8e'; // where the pavement ends against the plots
const KERB = '#f1eee8'; // the kerb stone between the pavement and the road

/**
 * How wide a line of the street map is on the ground in the 3D city, in
 * metres: a road as it is drawn, a railway, a footpath. 0 for anything that
 * takes up no ground (a ferry line, a line with no kind).
 */
export function groundWidth(className) {
  const road = CITY_ROADS.find((kind) => kind.classes.includes(className));
  if (road) return road.meters;
  if (className === 'rail' || className === 'transit') return TRACK_METERS;
  if (className === 'path') return PATH_METERS;
  return 0;
}

/**
 * The buildings a street runs straight through: the ids of those with at
 * least `least` metres of a street's middle line inside their outline.
 *
 * A station under a street is often on record as an ordinary building, and
 * drawn as one it would stand in the middle of the road. A street that really
 * passes through a building is recorded as a tunnel, and tunnels are not
 * among the streets given here.
 *
 * buildings: what buildingFootprints() gives. streets: [[[lng, lat], …], …],
 * the middle lines of the streets on the ground.
 */
export function buildingsOnStreets(buildings, streets, least = 15) {
  const found = new Set();
  if (buildings.length === 0 || streets.length === 0) return found;
  const first = buildings[0].polygons[0][0][0];
  const squeeze = Math.max(Math.cos(toRadians(first[1])), 0.01) * METERS_PER_DEGREE;
  const x = (lng) => (lng - first[0]) * squeeze;
  const y = (lat) => (lat - first[1]) * METERS_PER_DEGREE;

  // Each outline in metres, filed under the squares of ground its bounding box covers.
  const CELL = 60;
  const outlines = [];
  const grid = new Map();
  for (const building of buildings) {
    if (building.id === undefined || building.id === null || building.base > 0) continue; // a part held up above the street is no obstacle
    for (const polygon of building.polygons) {
      const rings = polygon.map((ring) => ring.map(([lng, lat]) => [x(lng), y(lat)]));
      let west = Infinity;
      let east = -Infinity;
      let south = Infinity;
      let north = -Infinity;
      for (const [px, py] of rings[0]) {
        west = Math.min(west, px);
        east = Math.max(east, px);
        south = Math.min(south, py);
        north = Math.max(north, py);
      }
      const index = outlines.push({ id: building.id, rings, box: [west, south, east, north], inside: 0 }) - 1;
      for (let cellX = Math.floor(west / CELL); cellX <= Math.floor(east / CELL); cellX += 1) {
        for (let cellY = Math.floor(south / CELL); cellY <= Math.floor(north / CELL); cellY += 1) {
          const key = `${cellX},${cellY}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(index);
        }
      }
    }
  }
  const within = (ring, px, py) => {
    let inside = false;
    for (let i = 1; i < ring.length; i += 1) {
      const [x0, y0] = ring[i - 1];
      const [x1, y1] = ring[i];
      if (y0 > py !== y1 > py && px < x0 + ((py - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
    }
    return inside;
  };

  // Walk each street in steps and count the steps that fall inside an outline.
  const STEP = 3;
  for (const street of streets) {
    for (let i = 1; i < street.length; i += 1) {
      const x0 = x(street[i - 1][0]);
      const y0 = y(street[i - 1][1]);
      const x1 = x(street[i][0]);
      const y1 = y(street[i][1]);
      const steps = Math.max(Math.ceil(Math.hypot(x1 - x0, y1 - y0) / STEP), 1);
      const stride = Math.hypot(x1 - x0, y1 - y0) / steps;
      for (let step = 0; step < steps; step += 1) {
        const px = x0 + ((x1 - x0) * (step + 0.5)) / steps;
        const py = y0 + ((y1 - y0) * (step + 0.5)) / steps;
        for (const index of grid.get(`${Math.floor(px / CELL)},${Math.floor(py / CELL)}`) ?? []) {
          const outline = outlines[index];
          if (px < outline.box[0] || px > outline.box[2] || py < outline.box[1] || py > outline.box[3]) continue;
          // Inside the outline and not in one of its courtyards.
          if (within(outline.rings[0], px, py) && !outline.rings.slice(1).some((ring) => within(ring, px, py))) outline.inside += stride;
        }
      }
    }
  }
  // A building in several pieces (one for each map tile it lies in) is judged by its worst piece.
  for (const outline of outlines) if (outline.inside >= least) found.add(outline.id);
  return found;
}

// ── Building walls ────────────────────────────────────────────────────────

/**
 * Walls are drawn with rows of windows: a small picture of one window, repeated
 * along and up every wall. The pictures are sized in screen pixels of a whole
 * zoom level, so there is one set per level: a floor is 3 px at zoom 16 and
 * doubles with each step in, which keeps it about 3 m on the ground. Seen from
 * further out than zoom 15 the walls are plain.
 *
 * (The level is that of the map tile a building comes with. In a tilted view
 * the far part of the picture is drawn from tiles a level coarser than the
 * near part: the picture for zoom 15 is what keeps the windows on there.)
 */
export const WALL_DETAILS = [
  null,
  { zoom: 15, floor: 1.5, bay: 2 },
  { zoom: 16, floor: 3, bay: 4 },
  { zoom: 17, floor: 6, bay: 8 },
  { zoom: 18, floor: 12, bay: 16 },
];

/**
 * The kinds of wall. "glass" is laid over the wall colour; "across" and
 * "up" say how much of a bay and of a floor the window takes; "scale" makes
 * the whole picture so many times larger.
 */
export const WALL_KINDS = {
  // Plaster and stone with a window in each bay.
  low: { colour: '#f3f1ec', glass: 'rgba(62, 84, 112, 0.34)', across: 0.64, up: 0.44 },
  // Towers: bands of glass with little wall between, two floors to a band, so that a tower still shows
  // its bands from across the city, where single floors would run together into grey.
  tall: { colour: '#e6ebf0', glass: 'rgba(52, 84, 122, 0.5)', across: 0.84, up: 0.62, scale: 2 },
  // Metro stations: a screen of pale gold metal, pierced in a pattern of triangles.
  station: { colour: '#cfb37e', glass: 'rgba(96, 72, 30, 0.34)', across: 1, up: 1, lattice: true },
};
// Buildings from this height up are drawn as towers.
const TOWER_METERS = 60;

/**
 * Plaster and stone come in many shades. An ordinary building's is picked by
 * its number in the map data, so a house is the same shade every time, and
 * next-door neighbours seldom match. (Seven of them: the numbers are so large
 * that only an odd count is spread evenly.) What colour a wall really is,
 * no source says.
 */
export const WALL_TINTS = ['#f1eee7', '#ece4d4', '#e6dac4', '#e3ded4', '#efe2d2', '#dcd5c7', '#e9e7e2'];

/** What a wall picture's name stands for, e.g. "vm-wall:2:tall" or "vm-wall:1:low4": { detail, kind, tint } or null. */
export function wallImage(id) {
  const match = /^vm-wall:(\d):([a-z]+)(\d?)$/.exec(String(id ?? ''));
  if (!match || Number(match[1]) >= WALL_DETAILS.length || !Object.hasOwn(WALL_KINDS, match[2])) return null;
  if (match[3] !== '' && (match[2] !== 'low' || Number(match[3]) >= WALL_TINTS.length)) return null;
  return { detail: Number(match[1]), kind: match[2], tint: match[3] === '' ? null : Number(match[3]) };
}

// ── Map styles ────────────────────────────────────────────────────────────
// Every style is built on OpenFreeMap's vector data ("openmaptiles"), so the
// place markers and the road-name lookup work in all of them.

export const VECTOR_SOURCE = 'openmaptiles';

// ── The satellite photo ───────────────────────────────────────────────────

// What the 3D city says of the photo it reads but does not show.
export const PHOTO_READ_CREDIT = 'Trees, heights and colours read from imagery © Esri, Maxar, Earthstar Geographics';
// The photo reaches the map by a way of the app's own ("photo://level/row/column"), which knows how
// sharp the photo comes for each stretch of ground (see photoProtocol in services.js).
const PHOTO_TILES = 'photo://{z}/{y}/{x}';
// Everywhere there is a photo it comes at least this sharp; in cities it comes up to three levels sharper.
export const PHOTO_SURE_ZOOM = 16;
export const PHOTO_MOST_ZOOM = 19;
// Whether a level is there is asked of the service for a square of this many tiles a side at a time.
export const PHOTO_BLOCK_TILES = 32;

/**
 * The satellite photo as a source for the map.
 *
 * A map shows a photo tile at one photo pixel to one of its own pixels. A
 * phone's screen has two or three real pixels to each of the map's, so shown
 * like that the photo is stretched and looks soft. pixelRatio: how many real
 * pixels the screen has to one of the map's; from it, how much smaller the
 * tiles are to be shown, which makes the map fetch finer ones: one level finer
 * at 2, two levels at 3. (A level finer is four times the pictures to fetch.)
 */
export function photoSource(pixelRatio = 1) {
  const tileSize = pixelRatio >= 2.5 ? 64 : pixelRatio >= 1.5 ? 128 : 256;
  return {
    type: 'raster',
    tiles: [PHOTO_TILES],
    tileSize,
    maxzoom: PHOTO_MOST_ZOOM,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  };
}

/**
 * The same photo as coarse as a map asks for it on its own: a few tiles, soon
 * there. It lies under the sharp one while that comes in, tile by tile, so
 * that the ground is never bare. Null where the sharp one is no sharper.
 */
export function photoUnderlay(pixelRatio = 1) {
  if (photoSource(pixelRatio).tileSize === 256) return null;
  return { ...photoSource(1), maxzoom: PHOTO_SURE_ZOOM + 1 };
}

/** What a photo tile's address stands for: "photo://19/224905/330117" → { z, x, y }, or null. */
export function photoTileOf(url) {
  const match = /^photo:\/\/(\d{1,2})\/(\d+)\/(\d+)$/.exec(String(url ?? ''));
  if (!match) return null;
  const tile = { z: Number(match[1]), y: Number(match[2]), x: Number(match[3]) };
  return tile.x < 2 ** tile.z && tile.y < 2 ** tile.z ? tile : null;
}

/** The square of tiles a tile's level is asked about with: { z, left, top, size }. */
export function photoBlockOf(z, x, y) {
  const size = Math.min(PHOTO_BLOCK_TILES, 2 ** z);
  return { z, left: x - (x % size), top: y - (y % size), size };
}

/**
 * Read the service's answer about a square of tiles: whether the photo is
 * there for one of them. answer: { valid, location: { left, top, width,
 * height }, data: [1, 0, …] }, a row at a time from the top. True, false, or
 * null when the answer does not say.
 */
export function photoInBlock(answer, x, y) {
  const place = answer?.location;
  if (!answer || answer.valid === false || !Array.isArray(answer.data) || !place) return null;
  const column = x - place.left;
  const row = y - place.top;
  if (!(column >= 0 && column < place.width && row >= 0 && row < place.height)) return null;
  const cell = answer.data[row * place.width + column];
  return cell === 1 ? true : cell === 0 ? false : null;
}

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Satellite photos with the street map's names and icons drawn on top. pixelRatio: see photoSource. */
export function satelliteStyle(base, { pixelRatio = 1 } = {}) {
  const labels = base.layers
    .filter((layer) => layer.type === 'symbol')
    .map((layer) => ({
      ...layer,
      paint: {
        ...layer.paint,
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0, 0, 0, 0.8)',
        'text-halo-width': 1.4,
        'text-halo-blur': 0.3,
      },
    }));
  return {
    version: 8,
    name: 'Satellite',
    glyphs: base.glyphs,
    sprite: base.sprite,
    sources: {
      [VECTOR_SOURCE]: base.sources[VECTOR_SOURCE],
      // (The coarse photo first: a map fetches for its sources in the order they are named.)
      ...(photoUnderlay(pixelRatio) ? { 'imagery-base': photoUnderlay(pixelRatio) } : {}),
      imagery: photoSource(pixelRatio),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#10141a' } },
      ...(photoUnderlay(pixelRatio) ? [{ id: 'imagery-base', type: 'raster', source: 'imagery-base' }] : []),
      { id: 'imagery', type: 'raster', source: 'imagery' },
      ...labels,
    ],
  };
}

/** The classic, very detailed OpenStreetMap picture tiles. */
export function detailedStyle(base) {
  return {
    version: 8,
    name: 'Detailed',
    glyphs: base.glyphs,
    sprite: base.sprite,
    sources: {
      [VECTOR_SOURCE]: base.sources[VECTOR_SOURCE],
      osm: {
        type: 'raster',
        tiles: [OSM_TILES],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f2efe9' } },
      { id: 'osm', type: 'raster', source: 'osm' },
    ],
  };
}

/**
 * The ground of the 3D city. All of it is drawn; none of it is a photo. Bare
 * ground between the buildings is the colour of the sand and dust it is in a
 * desert city, and whatever the map knows more about has a colour of its own:
 * lawns and gardens, dry scrub, sand, the grounds of a school or a hospital,
 * the yards of works and warehouses, the forecourts of shops, paved squares,
 * playing fields, water, and the swimming pools in the gardens.
 */
export const GROUND = {
  plot: '#d1c5aa',
  shops: '#dbd4c6',
  works: '#cdc6b8',
  campus: '#dcd1ba',
  lawn: '#a6bf8c',
  scrub: '#bcbd95',
  wood: '#8fab7b',
  fields: '#c3c698',
  sand: '#e3d7b6',
  rock: '#cbc5b9',
  pitch: '#97bb84',
  playground: '#d6c79e',
  track: '#c58f72',
  cemetery: '#b7bca4',
  water: '#8fb4cc',
  pool: '#62c0d8',
  poolRim: '#f2efe8',
};

// ── The 3D city by night ──────────────────────────────────────────────────
// The dark that is laid over the ground, and how much of the ground it leaves.
const NIGHT_VEIL = '#070a13';
const NIGHT_VEIL_MOST = 0.88;
const NIGHT_VEIL_POWER = 0.55; // how early the dark comes over the ground: half of it is there a fifth of the way into dusk
/**
 * How the light the lamps throw on the ground grows with the dark: as this
 * power of it. (A lamp shows as soon as it is on; what it throws on the road
 * counts for little while the sky is still light.)
 */
export const LAMP_THROW_POWER = 2.5;
// What a block the map draws is left with by night: its own colour, most of the way to this.
const NIGHT_BLOCK = '#080b16';
const NIGHT_BLOCK_DEPTH = 0.86;
const NIGHT_BLOCK_STEPS = 4;
const NIGHT_ROOF_DEPTH = 0.88;
const NIGHT_TEXT = '#ece8df';
const NIGHT_TEXT_EDGE = 'rgba(7, 9, 15, 0.85)';
/**
 * The colour of the street lamps' light, by kind of road. Riyadh's lamps
 * have been changed for white ones: more than half a million of them,
 * across all the city's municipalities, in the years to 2023. So its great
 * roads are lit a cool white and its avenues a neutral one, as they show in
 * any photograph of the city by night now; the amber of the old sodium
 * lamps is left to the side streets of the districts that have not had the
 * new ones (led: what a side street has where it has).
 */
export const LAMP_LIGHT = { big: '#eef1fb', main: '#fff0dc', side: '#ffb163', led: '#fff0dc' };
// The roads that have lamps along them.
const LAMP_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'busway'];
const GLOW_SPILL_METERS = 4.5; // how far the lamps' light reaches past the edge of the road
const GLOW_FAR = 0.85; // how strong it is from across the city, where it is all there is to see of the lamps
const GLOW_MOST = 0.3; // from nearer, where the lamps begin to stand in it one by one
const GLOW_NEAR = 0.1; // and from close by, where each lamp's own pool lights the road: only what they spill between them

// The sky by day, at the height of dusk and by night: overhead, and where it meets the ground.
const SKY = { day: ['#86addb', '#e4eaef'], dusk: ['#4c5c92', '#f4bd8e'], night: ['#060a17', '#3d2d2a'] };

const SKY_GREYS_MOST = 0.55; // how far the sky goes to grey under a covered sky

/**
 * The colours of the sky for a darkness of 0 (day) to 1 (night): { overhead,
 * horizon }. Half-way, with the sun just down, it is dusk. sunlight: how
 * much of the sun gets through the clouds, 1 (a clear sky) to 0.
 */
export function skyColours(night, sunlight = 1) {
  const dark = clamp(Number(night) || 0, 0, 1);
  const [from, to, part] = dark < 0.5 ? [SKY.day, SKY.dusk, dark / 0.5] : [SKY.dusk, SKY.night, (dark - 0.5) / 0.5];
  // Under cloud the sky loses its colour: the more of the sun the clouds keep back, the greyer it is.
  // (Not while most of the sun still gets through: between a few clouds the sky is as blue as ever.)
  const dull = clamp((0.75 - clamp(Number.isFinite(sunlight) ? sunlight : 1, 0, 1)) / 0.6, 0, 1) * SKY_GREYS_MOST;
  const greyed = (colour) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
    const light = 0.3 * r + 0.59 * g + 0.11 * b;
    const grey = `#${[0.96, 0.99, 1.06].map((tint) => Math.round(clamp(light * tint, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
    return dull > 0 ? hexMix(colour, grey, dull) : colour;
  };
  return { overhead: greyed(hexMix(from[0], to[0], part)), horizon: greyed(hexMix(from[1], to[1], part)) };
}

/**
 * The city as a scale model: every building standing on its own outline on
 * drawn ground, with grey roads at their real widths. Meant to be looked at
 * tilted, from above.
 *
 * night: how dark it is, 0 (day) to 1 (night): see darkness(). By night a
 * dark is laid over the ground, the street lamps light the roads, playing
 * fields and pools are lit, and the names are written light on dark.
 *
 * sunlight: how much of the sun gets through the clouds, 1 (a clear sky) to
 * 0: the shadows on the ground are as much fainter.
 */
export function cityModelStyle(base, { buildings = null, night = 0, sunlight = 1 } = {}) {
  // How dark it is, and how far the lamps are on. What can change little by little does (the dark over the
  // ground, the lamps, the sky); what cannot (the colour of a block, of a name) changes over half-way through dusk.
  const dark = clamp(Number(night) || 0, 0, 1);
  const lamps = lampsLit(dark);
  // (A lamp shows as soon as it is on; the light it throws on the road counts for little until it is dark.)
  const thrown = lamps * dark ** LAMP_THROW_POWER;
  const byNight = dark >= 0.5;
  // (The blocks go dark in four steps: each step has the map lay its buildings out afresh.)
  const dusk = Math.round(dark * NIGHT_BLOCK_STEPS) / NIGHT_BLOCK_STEPS;
  /** A colour that comes with each building, as the dark leaves it. */
  const dimmed = (colour, by = NIGHT_BLOCK_DEPTH) => (dusk > 0 ? ['interpolate', ['linear'], by * dusk, 0, colour, 1, NIGHT_BLOCK] : colour);
  /** A fixed colour, as the dark leaves it. */
  const dimmedHex = (colour, by = NIGHT_BLOCK_DEPTH) => (dusk > 0 ? hexMix(colour, NIGHT_BLOCK, by * dusk) : colour);
  const isLine = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
  const isArea = ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false];
  // Roads in tunnels and on bridges are drawn apart from the ones on the ground.
  const onGround = ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true];
  const onBridge = ['==', ['get', 'brunnel'], 'bridge'];
  const inTunnel = ['==', ['get', 'brunnel'], 'tunnel'];
  const ofClass = (...names) => ['all', isLine, onGround, ['match', ['get', 'class'], names, true, false]];
  // Metres on the ground to pixels on screen: a pixel is about 1.1 m at zoom 16,
  // and half that at each zoom step in.
  const widthOf = (meters, extra = 0) => {
    const atSixteen = meters / 1.1;
    return [
      'interpolate',
      ['exponential', 2],
      ['zoom'],
      11,
      Math.max(atSixteen / 32, 0.5) + extra,
      16,
      atSixteen + extra,
      20,
      atSixteen * 16 + extra,
    ];
  };
  const round = { 'line-cap': 'round', 'line-join': 'round' };
  const roads = CITY_ROADS;
  const roadLayer = (road, suffix, paint) => ({
    id: `city-road-${road.id}${suffix}`,
    type: 'line',
    source: VECTOR_SOURCE,
    'source-layer': 'transportation',
    minzoom: road.minzoom,
    filter: ofClass(...road.classes),
    layout: round,
    paint,
  });
  // The same widths for layers that hold roads of every size at once.
  const driven = roads.flatMap((road) => road.classes);
  const metersOf = ['match', ['get', 'class'], ...roads.flatMap((road) => [road.classes, road.meters]), 4];
  const widthOfAny = (extra = 0, meters = metersOf) => [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    11,
    ['+', ['max', ['/', meters, 1.1 * 32], 0.5], extra],
    16,
    ['+', ['/', meters, 1.1], extra],
    20,
    ['+', ['*', ['/', meters, 1.1], 16], extra],
  ];
  // The streets with a pavement along them, and how wide each is with its two pavements.
  const paved = roads.filter((road) => PAVEMENT_METERS[road.id] > 0);
  const isPaved = ['match', ['get', 'class'], paved.flatMap((road) => road.classes), true, false];
  const pavedMeters = ['match', ['get', 'class'], ...paved.flatMap((road) => [road.classes, road.meters + 2 * PAVEMENT_METERS[road.id]]), 0];
  const fromClose = ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, 1];
  const lineLayer = (id, filter, paint, more = {}) => ({
    id,
    type: 'line',
    source: VECTOR_SOURCE,
    'source-layer': 'transportation',
    filter: ['all', isLine, ...filter],
    paint,
    ...more,
  });
  const isDriven = ['match', ['get', 'class'], driven, true, false];
  // How wide the street lamps' light lies along a road, times a factor.
  const glowMeters = ['+', metersOf, GLOW_SPILL_METERS * 2];
  const glowThread = ['match', ['get', 'class'], ['motorway', 'trunk'], 2.6, ['primary'], 2, ['secondary', 'tertiary'], 1.3, 0.7];
  const glowWidth = (factor) => [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    11,
    ['*', glowThread, factor],
    14,
    ['*', ['max', ['/', glowMeters, 4.4], glowThread], factor],
    16,
    ['*', ['/', glowMeters, 1.1], factor],
    20,
    ['*', ['/', glowMeters, 1.1], 16 * factor],
  ];
  const isRail = ['match', ['get', 'class'], ['rail', 'transit'], true, false];
  // On a bridge the wider road is drawn last, on top.
  const bridgeLayout = { ...round, 'line-sort-key': metersOf };
  // From close by a bridge is built in 3D by the app: its flat drawing fades as that one appears.
  const untilBuilt = (opacity = 1) => ['interpolate', ['linear'], ['zoom'], 15.1, opacity, 15.6, 0];

  // Buildings: the white model with windows, plain below zoom 16 and finer with
  // each zoom step in. The app draws each wall picture when the map first asks for it.
  // (An ordinary building's picture is also in one of seven shades of plaster, by the building's number.)
  const tint = ['case', ['==', ['typeof', ['id']], 'number'], ['to-string', ['%', ['abs', ['id']], WALL_TINTS.length]], '0'];
  const pictureName = (index, kind) => (kind === 'low' ? ['concat', `vm-wall:${index}:low`, tint] : `vm-wall:${index}:${kind}`);
  const wallPicture = (kind) => [
    'step',
    ['zoom'],
    pictureName(0, kind),
    ...WALL_DETAILS.flatMap((detail, index) => (detail ? [detail.zoom, pictureName(index, kind)] : [])),
  ];
  const ROOF = '#e9e6de';
  /** The areas of some kinds in one of the street map's layers, filled with a colour picked by kind. */
  const areaLayer = (id, layer, kinds, colour) => ({
    id,
    type: 'fill',
    source: VECTOR_SOURCE,
    'source-layer': layer,
    filter: ['all', isArea, ['match', ['get', 'class'], kinds, true, false]],
    paint: { 'fill-color': colour },
  });
  /** Walls with windows for the features of one map layer that pass a filter. */
  const walls = (id, kind, source, layer, filter, height, floor) => ({
    id,
    type: 'fill-extrusion',
    source,
    'source-layer': layer,
    minzoom: 13,
    filter,
    paint: {
      'fill-extrusion-color': dimmedHex(WALL_KINDS[kind].colour),
      'fill-extrusion-pattern': wallPicture(kind),
      'fill-extrusion-base': floor,
      'fill-extrusion-height': height,
      // Walls a shade darker than roofs, and darker still towards the foot of a tower.
      'fill-extrusion-vertical-gradient': true,
    },
  });
  /** A building in its recorded colour, plain. */
  const painted = (id, source, layer, filter, colour, height, floor) => ({
    id,
    type: 'fill-extrusion',
    source,
    'source-layer': layer,
    minzoom: 13,
    filter,
    paint: {
      'fill-extrusion-color': dimmed(['to-color', colour, WALL_KINDS.low.colour]),
      'fill-extrusion-base': floor,
      'fill-extrusion-height': height,
      'fill-extrusion-vertical-gradient': true,
    },
  });
  /**
   * The windows would run across the roofs too. A plain slab on top of each
   * building covers them, and stands a little proud like a roof's parapet.
   */
  const roofs = (id, source, layer, filter, height, colour = dimmedHex(ROOF, NIGHT_ROOF_DEPTH)) => ({
    id,
    type: 'fill-extrusion',
    source,
    'source-layer': layer,
    // (From a level further out than the windows: in a tilted view the far tiles are a level coarser than the
    // near ones, and are drawn with the windows of the next level in. Without its slab such a roof has windows.)
    minzoom: WALL_DETAILS[1].zoom - 1,
    filter,
    paint: {
      'fill-extrusion-color': colour,
      'fill-extrusion-base': height,
      // (A block laid flat, for the app's own houses to stand in its place, has no slab either: see houses.js.)
      'fill-extrusion-height': ['+', height, ['case', ['boolean', ['feature-state', 'flat'], false], 0, 1.2]],
      'fill-extrusion-vertical-gradient': false,
    },
  });

  /** Blocks that say for themselves where they start (b), where they end (t) and what colour they are (c). */
  const slabLayer = (id, source, minzoom) => ({
    id,
    type: 'fill-extrusion',
    source,
    minzoom,
    paint: {
      // (By night: the colour it is lit in (n), if it is lit; else what the dark leaves of its own.)
      'fill-extrusion-color': dusk > 0 ? ['case', ['has', 'n'], ['interpolate', ['linear'], dusk, 0, ['to-color', ['get', 'c']], 1, ['to-color', ['get', 'n']]], dimmed(['to-color', ['get', 'c']])] : ['get', 'c'],
      'fill-extrusion-base': ['get', 'b'],
      'fill-extrusion-height': ['get', 't'],
      'fill-extrusion-vertical-gradient': false,
    },
  });

  let buildingLayers;
  if (buildings) {
    // One outline per building, from Overture. Height: read from its shadow by
    // the app (kept as the feature's state), else recorded, else by floors, else
    // the usual for its kind, varied a little from one building to the next.
    const spread = [
      'case',
      ['==', ['typeof', ['id']], 'number'],
      ['match', ['%', ['abs', ['id']], HEIGHT_SPREAD.length], ...HEIGHT_SPREAD.flatMap((factor, left) => (left > 0 ? [left, factor] : [])), HEIGHT_SPREAD[0]],
      1,
    ];
    const isStation = ['==', ['get', 'class'], 'train_station'];
    const usual = ['case', isStation, STATION_HEIGHT, ['*', ['match', ['get', 'subtype'], ...Object.entries(USUAL_HEIGHTS).flat(), USUAL_HEIGHT], spread]];
    const floor = ['to-number', ['get', 'min_height'], 0];
    const recorded = [
      'case',
      ['>', ['to-number', ['get', 'height'], 0], floor],
      ['to-number', ['get', 'height'], 0],
      ['>', ['to-number', ['get', 'num_floors'], 0], 0],
      ['+', floor, ['*', ['to-number', ['get', 'num_floors'], 0], FLOOR_METERS]],
      ['+', floor, usual],
    ];
    // (A block the app has divided into houses of its own lies flat: see houses.js.)
    const height = ['case', ['boolean', ['feature-state', 'flat'], false], floor, ['!=', ['feature-state', 'h'], null], ['to-number', ['feature-state', 'h'], 0], recorded];
    // A metro station under a street is on record as a building too: leave what is underground out.
    const aboveGround = ['!=', ['get', 'is_underground'], true];
    const whole = ['all', aboveGround, ['!=', ['get', 'has_parts'], true]]; // one with parts is drawn as its parts
    const plain = ['all', ['!', ['has', 'facade_color']], ['!', isStation]];
    const roofByDay = ['case', ['has', 'roof_color'], ['to-color', ['get', 'roof_color'], ROOF], ROOF];
    const roofColour = dimmed(roofByDay, NIGHT_ROOF_DEPTH);
    buildingLayers = [
      walls('city-buildings', 'low', BUILDING_SOURCE, 'building', ['all', whole, plain, ['<', recorded, TOWER_METERS]], height, floor),
      walls('city-towers', 'tall', BUILDING_SOURCE, 'building', ['all', whole, plain, ['>=', recorded, TOWER_METERS]], height, floor),
      painted('city-painted', BUILDING_SOURCE, 'building', ['all', whole, ['has', 'facade_color'], ['!', isStation]], ['get', 'facade_color'], height, floor),
      // Metro stations in their own dress: golden screens all round.
      walls('city-stations', 'station', BUILDING_SOURCE, 'building', ['all', whole, isStation], height, floor),
      walls('city-parts', 'tall', BUILDING_SOURCE, 'building_part', ['all', aboveGround, plain], height, floor),
      painted('city-parts-painted', BUILDING_SOURCE, 'building_part', ['all', aboveGround, ['has', 'facade_color']], ['get', 'facade_color'], height, floor),
      roofs('city-roofs', BUILDING_SOURCE, 'building', ['all', whole, ['!', ['has', 'facade_color']]], height, roofColour),
      roofs('city-parts-roofs', BUILDING_SOURCE, 'building_part', ['all', aboveGround, plain], height, roofColour),
    ];
  } else {
    // Without Overture: the street map's own buildings, neighbours welded into blocks.
    const height = ['coalesce', ['get', 'render_height'], 5];
    const floor = ['coalesce', ['get', 'render_min_height'], 0];
    const standing = ['!', ['has', 'hide_3d']]; // "hide_3d" marks an outline whose separate parts are drawn instead
    const unpainted = ['!', ['has', 'colour']];
    buildingLayers = [
      walls('city-buildings', 'low', VECTOR_SOURCE, 'building', ['all', standing, unpainted, ['<', height, TOWER_METERS]], height, floor),
      walls('city-towers', 'tall', VECTOR_SOURCE, 'building', ['all', standing, unpainted, ['>=', height, TOWER_METERS]], height, floor),
      painted('city-painted', VECTOR_SOURCE, 'building', ['all', standing, ['has', 'colour']], ['get', 'colour'], height, floor),
      roofs('city-roofs', VECTOR_SOURCE, 'building', ['all', standing, unpainted], height),
    ];
  }

  return {
    version: 8,
    name: '3D City',
    glyphs: base.glyphs,
    sprite: base.sprite,
    // The app replaces this with the real sun for the time and place (see sunLight).
    light: { anchor: 'viewport', position: [1.5, 215, 35], color: '#ffffff', intensity: 0.28 },
    // The sky, for the views that reach the horizon: blue by day and pale where it meets the ground; at dusk
    // deep blue over a band of orange; by night dark, with the glow a city of lamps throws into the dust above it.
    sky: {
      'sky-color': skyColours(dark, sunlight).overhead,
      'horizon-color': skyColours(dark, sunlight).horizon,
      'fog-color': skyColours(dark, sunlight).horizon,
      'fog-ground-blend': 0.7,
      'horizon-fog-blend': 0.9,
      'sky-horizon-blend': 0.75,
      'atmosphere-blend': 0,
    },
    sources: {
      [VECTOR_SOURCE]: base.sources[VECTOR_SOURCE],
      // The shadows the buildings cast; the app fills this in as the sun and the view move.
      // (The photo is not shown, but it is read: for the trees, for heights and for colours. Its makers are named for that.)
      'city-shade': { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: PHOTO_READ_CREDIT },
      // The landmark towers, modelled by hand as stacks of slabs.
      'city-landmarks': { type: 'geojson', data: landmarkSlabs() },
      // Built by the app around what the map shows: the footbridges and pavilions of metro stations, the fronts of chain stores.
      'city-extras': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      // One outline per building, read straight out of Overture's archive in the cloud.
      ...(buildings
        ? { [BUILDING_SOURCE]: { type: 'vector', url: `pmtiles://${buildings}`, attribution: 'Buildings © <a href="https://overturemaps.org">Overture Maps Foundation</a>' } }
        : {}),
    },
    layers: [
      // Bare ground: sand and dust.
      { id: 'background', type: 'background', paint: { 'background-color': GROUND.plot } },
      // What the ground is used for, where the map says: the forecourts of shops and offices, the yards of
      // works, the grounds of schools and hospitals. (Where people live it is left as bare ground.)
      areaLayer('city-land', 'landuse', ['commercial', 'retail', 'industrial', 'garages', 'railway', 'bus_station', 'quarry', 'school', 'university', 'college', 'kindergarten', 'library', 'hospital'], [
        'match',
        ['get', 'class'],
        ['commercial', 'retail'],
        GROUND.shops,
        ['industrial', 'garages', 'railway', 'bus_station', 'quarry'],
        GROUND.works,
        GROUND.campus,
      ]),
      // A nature reserve or a great park: a wash of green over all of it.
      {
        id: 'city-green',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'park',
        filter: isArea,
        paint: { 'fill-color': GROUND.lawn, 'fill-opacity': 0.35 },
      },
      // What grows on the ground, or does not: lawns and gardens, dry scrub, woods, fields, open sand, rock.
      areaLayer('city-grass', 'landcover', ['grass', 'wood', 'farmland', 'sand', 'rock', 'wetland'], [
        'match',
        ['get', 'class'],
        'wood',
        GROUND.wood,
        'farmland',
        GROUND.fields,
        'sand',
        GROUND.sand,
        'rock',
        GROUND.rock,
        ['match', ['get', 'subclass'], ['scrub', 'shrubbery', 'grassland', 'heath'], GROUND.scrub, GROUND.lawn],
      ]),
      // Playing fields and running tracks, playgrounds, graveyards.
      areaLayer('city-pitch', 'landuse', ['pitch', 'playground', 'track', 'cemetery'], ['match', ['get', 'class'], 'cemetery', GROUND.cemetery, 'playground', GROUND.playground, 'track', GROUND.track, GROUND.pitch]),
      // Squares and other paved ground for walking on.
      {
        id: 'city-squares',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'transportation',
        filter: ['all', isArea, ['!', inTunnel], ['match', ['get', 'class'], ['path', 'pier'], true, false]],
        paint: { 'fill-color': PAVING, 'fill-outline-color': PAVING_EDGE },
      },
      {
        id: 'city-water',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'water',
        filter: ['!=', ['get', 'class'], 'swimming_pool'],
        paint: { 'fill-color': GROUND.water },
      },
      // The swimming pools in the gardens: bright water in a pale rim.
      {
        id: 'city-pools',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'water',
        minzoom: 14,
        filter: ['==', ['get', 'class'], 'swimming_pool'],
        paint: { 'fill-color': GROUND.pool },
      },
      {
        id: 'city-pool-rims',
        type: 'line',
        source: VECTOR_SOURCE,
        'source-layer': 'water',
        minzoom: 15.5,
        filter: ['==', ['get', 'class'], 'swimming_pool'],
        paint: { 'line-color': GROUND.poolRim, 'line-width': widthOf(0.7) },
      },
      // Roads underground: only a faint broken trace of where they run.
      lineLayer(
        'city-tunnels',
        [inTunnel, isDriven],
        { 'line-color': '#7d828c', 'line-opacity': 0.3, 'line-width': widthOfAny(), 'line-dasharray': [1.2, 1.2] },
        { minzoom: 13 },
      ),
      // Pavements: a band of paving under each street, wider than the street by a pavement either side, with a
      // dark line where it ends. They lie under every road, so that a side street runs through the pavement of
      // the road it meets.
      lineLayer('city-pavement-edge', [onGround, isPaved], { 'line-color': PAVING_EDGE, 'line-width': widthOfAny(1.6, pavedMeters), 'line-opacity': fromClose }, { minzoom: 15, layout: round }),
      lineLayer('city-pavement', [onGround, isPaved], { 'line-color': PAVING, 'line-width': widthOfAny(0, pavedMeters), 'line-opacity': fromClose }, { minzoom: 15, layout: round }),
      // The kerb, a pale line along both edges of a road; then the road itself.
      ...roads.map((road) => roadLayer(road, '-edge', { 'line-color': KERB, 'line-width': widthOf(road.meters, 2) })),
      ...roads.map((road) => roadLayer(road, '', { 'line-color': '#737882', 'line-width': widthOf(road.meters) })),
      // (The lines on the roads and the crossings are painted by the app, lane by lane: see drawMarks in life.js.)
      // Footpaths and squares for walking.
      lineLayer(
        'city-paths',
        [['!', inTunnel], ['==', ['get', 'class'], 'path']],
        { 'line-color': '#efebe3', 'line-width': widthOf(PATH_METERS), 'line-opacity': 0.9 },
        { minzoom: 15, layout: round },
      ),
      // The metro under ground: a broken trace over the streets it runs beneath, for its trains to be followed along.
      lineLayer(
        'city-rail-under',
        [inTunnel, isRail, ['!', ['has', 'service']]],
        {
          'line-color': '#1f2a44',
          'line-opacity': 0.34,
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 12, 0.8, 16, 2.2, 20, 11],
          'line-dasharray': [2.2, 1.8],
        },
        { minzoom: 13 },
      ),
      // Railway and metro above ground: a dark line with pale sleepers across it.
      // (On a viaduct the track is built in 3D from close by, like a road bridge: there the flat line fades.)
      lineLayer(
        'city-rail',
        [['!', inTunnel], isRail],
        {
          'line-color': '#5c616b',
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 12, 0.8, 16, 3, 20, 14],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 15.1, 1, 15.6, ['case', onBridge, 0, 1]],
        },
        { minzoom: 12 },
      ),
      lineLayer(
        'city-rail-ties',
        [['!', inTunnel], isRail],
        {
          'line-color': '#e2ded5',
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 0.5, 16, 1.6, 20, 8],
          'line-dasharray': [1.5, 2.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 15.1, 1, 15.6, ['case', onBridge, 0, 1]],
        },
        { minzoom: 14 },
      ),
      // The shade under a viaduct.
      lineLayer(
        'city-rail-shade',
        [onBridge, isRail],
        { 'line-color': '#141a28', 'line-opacity': 0.24, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 13, 2, 16, 9, 20, 110], 'line-blur': 4 },
        { minzoom: 13 },
      ),
      // Bridges and flyovers lie over whatever passes beneath, with a soft shade under the deck.
      lineLayer(
        'city-bridge-shade',
        [onBridge, isDriven],
        { 'line-color': '#141a28', 'line-opacity': 0.28, 'line-width': widthOfAny(7), 'line-blur': 5 },
        { minzoom: 13, layout: bridgeLayout },
      ),
      lineLayer('city-bridge-edge', [onBridge, isDriven], { 'line-color': '#eceae4', 'line-width': widthOfAny(2.5), 'line-opacity': untilBuilt() }, { minzoom: 12, layout: bridgeLayout }),
      lineLayer('city-bridge', [onBridge, isDriven], { 'line-color': '#7c818b', 'line-width': widthOfAny(), 'line-opacity': untilBuilt() }, { minzoom: 12, layout: bridgeLayout }),
      // ── By night ──
      // The dark itself, laid over the ground and all that is painted on it. (The buildings, and what the app
      // builds, are darkened where they are drawn.)
      // (The ground goes dark early: at dusk, with the sky still bright, the streets are already in shadow.)
      { id: 'city-night', type: 'background', paint: { 'background-color': NIGHT_VEIL, 'background-opacity': NIGHT_VEIL_MOST * dark ** NIGHT_VEIL_POWER } },
      // Playing fields under their floodlights, and swimming pools lit from within.
      {
        id: 'city-night-pitch',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'landuse',
        minzoom: 13,
        filter: ['all', isArea, ['==', ['get', 'class'], 'pitch']],
        paint: { 'fill-color': '#4c9a5c', 'fill-opacity': 0.8 * lamps },
      },
      {
        id: 'city-night-pools',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'water',
        minzoom: 14,
        filter: ['==', ['get', 'class'], 'swimming_pool'],
        paint: { 'fill-color': '#3cc8e2', 'fill-opacity': 0.9 * lamps },
      },
      // The street lamps, as they show from above: their light lying along every street, widest and whitest
      // on the great roads, the amber of sodium lamps on the side streets; ...
      lineLayer(
        'city-glow',
        [['!', inTunnel], isDriven],
        {
          'line-color': ['match', ['get', 'class'], ['motorway', 'trunk'], LAMP_LIGHT.big, ['primary', 'secondary'], LAMP_LIGHT.main, LAMP_LIGHT.side],
          // (From across the city a street's light is a thread, thicker for the great roads; from close by it
          // is as wide as the road and what the lamps reach beyond it. Soft from the middle outwards.)
          'line-width': glowWidth(1),
          'line-blur': glowWidth(0.5),
          // (Close by, an even wash over the whole road would make it white as snow: there the asphalt is dark
          // between the pools of the lamps, as it is in Riyadh.)
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, GLOW_FAR * thrown, 14, 0.55 * thrown, 15.5, GLOW_MOST * thrown, 17, GLOW_NEAR * thrown],
        },
        { minzoom: 9, layout: round },
      ),
      // ... and the lamps themselves, a point of light every so many metres, until from close by the app
      // stands them along the streets one by one (see lights.js). (Soft-edged, and gone before the app's own
      // stand: the map lies flat in a tilted view, and near the eye a dot of the map would be drawn as wide as
      // the road, a pale disc on it.)
      lineLayer(
        'city-lamps',
        [['!', inTunnel], ['match', ['get', 'class'], LAMP_CLASSES, true, false]],
        {
          'line-color': '#fff2e0',
          'line-width': widthOfAny(0, ['match', ['get', 'class'], ['motorway', 'trunk'], 4.2, ['primary'], 3.8, ['secondary', 'tertiary'], 3.4, 3]),
          'line-blur': widthOfAny(0, ['match', ['get', 'class'], ['motorway', 'trunk'], 2.5, ['primary'], 2.3, ['secondary', 'tertiary'], 2, 1.8]),
          // (A dash of no length with a round end is a dot: one to every ten widths of the line.)
          'line-dasharray': [0, 10],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.5 * lamps, 14, 0.9 * lamps, 14.4, 0.9 * lamps, 14.9, 0],
        },
        { minzoom: 12, layout: round },
      ),
      // A soft dark rim on the ground where each building stands, the way corners
      // gather shade even on the sunny side.
      {
        id: 'city-contact',
        type: 'line',
        source: buildings ? BUILDING_SOURCE : VECTOR_SOURCE,
        'source-layer': 'building',
        minzoom: 15,
        ...(buildings ? { filter: ['!=', ['get', 'is_underground'], true] } : {}),
        paint: {
          'line-color': '#1a2030',
          'line-opacity': 0.2,
          'line-width': widthOf(7),
          'line-blur': widthOf(4.5),
        },
      },
      // Cast shadows, lying flat on the ground. As a 3D layer its overlapping
      // pieces are blended as one, so the shade is even where shadows cross.
      {
        id: 'city-shadows',
        type: 'fill-extrusion',
        source: 'city-shade',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': '#141a28',
          'fill-extrusion-height': 0.1,
          // (Under cloud the sun throws a weaker shadow, and under a covered sky next to none.)
          'fill-extrusion-opacity': 0.42 * clamp(Number.isFinite(sunlight) ? sunlight : 1, 0, 1),
          'fill-extrusion-vertical-gradient': false,
        },
      },
      ...buildingLayers,
      // The landmarks: each slab a block from its own bottom to its own top, in its own colour.
      slabLayer('city-landmarks', 'city-landmarks', 11),
      slabLayer('city-extras', 'city-extras', 14),
      // The names and icons of the street map, without the route-number badges
      // that repeat along every main road. (By night the names are written light on dark.)
      ...base.layers.filter((layer) => layer.type === 'symbol' && !layer.id.includes('shield')).map((layer) => (byNight ? nightLabel(layer) : layer)),
    ],
  };
}

/** A layer of names as it is written by night: light letters with a dark edge. */
function nightLabel(layer) {
  return {
    ...layer,
    paint: { ...layer.paint, 'text-color': NIGHT_TEXT, 'text-halo-color': NIGHT_TEXT_EDGE, 'text-halo-width': layer.paint?.['text-halo-width'] ?? 1.2 },
  };
}

const EMPTY = { type: 'FeatureCollection', features: [] };

/**
 * Add the app's own drawings to a style: the place markers, the route line,
 * the dropped pin and the "how sure is the phone" circle.
 *
 * overlays: { categories: [ids], dark: boolean, accuracy, pin, route } where
 * accuracy, pin and route are GeoJSON or null.
 */
export function withOverlays(style, overlays) {
  const { categories = [], dark = false, accuracy = null, pin = null, route = null } = overlays ?? {};
  const name = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name'], ''];

  return {
    ...style,
    sources: {
      ...style.sources,
      'vm-accuracy': { type: 'geojson', data: accuracy ?? EMPTY },
      'vm-route': { type: 'geojson', data: route ?? EMPTY },
      'vm-pin': { type: 'geojson', data: pin ?? EMPTY },
    },
    layers: [
      ...style.layers,
      // Drawn invisibly so the road names are loaded even in styles that do not show them.
      {
        id: 'vm-road-names',
        type: 'line',
        source: VECTOR_SOURCE,
        'source-layer': 'transportation_name',
        paint: { 'line-opacity': 0 },
      },
      {
        id: 'vm-route-edge',
        type: 'line',
        source: 'vm-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b3d91', 'line-width': 9, 'line-opacity': 0.85 },
      },
      {
        id: 'vm-route',
        type: 'line',
        source: 'vm-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#4dabf7', 'line-width': 5 },
      },
      {
        id: 'vm-accuracy',
        type: 'fill',
        source: 'vm-accuracy',
        paint: { 'fill-color': '#2f8cff', 'fill-opacity': 0.14 },
      },
      {
        id: 'vm-accuracy-edge',
        type: 'line',
        source: 'vm-accuracy',
        paint: { 'line-color': '#2f8cff', 'line-width': 1, 'line-opacity': 0.5 },
      },
      {
        id: 'vm-places',
        type: 'symbol',
        source: VECTOR_SOURCE,
        'source-layer': 'poi',
        minzoom: 11,
        filter: categoryFilter(categories),
        layout: {
          visibility: categories.length > 0 ? 'visible' : 'none',
          'icon-image': categoryIconExpression(),
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 0.85, 18, 1],
          'icon-allow-overlap': true,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
          'text-field': ['step', ['zoom'], '', 15, name],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 1.05],
          'text-max-width': 8,
          'text-optional': true,
        },
        paint: {
          'text-color': dark ? '#ffffff' : '#1d2630',
          'text-halo-color': dark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.95)',
          'text-halo-width': 1.3,
        },
      },
      {
        id: 'vm-pin-halo',
        type: 'circle',
        source: 'vm-pin',
        paint: { 'circle-radius': 12, 'circle-color': '#ffffff', 'circle-opacity': 0.95 },
      },
      {
        id: 'vm-pin',
        type: 'circle',
        source: 'vm-pin',
        paint: { 'circle-radius': 8, 'circle-color': '#fa5252' },
      },
    ],
  };
}

/** Style layers whose features are places a person can tap. */
export function placeLayerIds(style) {
  return style.layers
    .filter((layer) => layer.source === VECTOR_SOURCE && layer['source-layer'] === 'poi')
    .map((layer) => layer.id);
}
