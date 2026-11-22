// Pure helpers shared by the app and its tests. Nothing in here touches the DOM.

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
  return { temperature: Math.round(temperature) || 0, text: found ? found[1] : '' };
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

/** A name for one building's polygon that stays the same each time the map hands it over: where its middle is. */
export function buildingKey(polygon) {
  const outline = polygon[0];
  let lng = 0;
  let lat = 0;
  const count = outline.length - 1;
  for (let i = 0; i < count; i += 1) {
    lng += outline[i][0];
    lat += outline[i][1];
  }
  return `${(lng / count).toFixed(5)},${(lat / count).toFixed(5)}`;
}

/**
 * Apply height estimates to building footprints.
 *
 * buildings: what footprintsIn() gives. heightOf(polygon): the estimated
 * height of one building in metres, or null. Only a building the map gives
 * the stand-in height (5 m, meaning "not recorded") is changed, and only
 * upwards: an estimate from a shadow can fall short, a record should not be
 * overruled.
 *
 * Returns { buildings, raised }: the same list with the estimates in, for
 * casting shadows, and the raised buildings alone as GeoJSON, for drawing.
 */
export function raisedBuildings(buildings, heightOf, standIn = 5) {
  const out = [];
  const features = [];
  for (const building of buildings) {
    if (building.height !== standIn || building.base > 0) {
      out.push(building);
      continue;
    }
    const unchanged = [];
    for (const polygon of building.polygons) {
      const estimate = heightOf(polygon);
      if (estimate > standIn + 1) {
        out.push({ height: estimate, base: 0, polygons: [polygon] });
        features.push({ type: 'Feature', properties: { h: estimate }, geometry: { type: 'Polygon', coordinates: polygon } });
      } else {
        unchanged.push(polygon);
      }
    }
    if (unchanged.length > 0) out.push({ ...building, polygons: unchanged });
  }
  return { buildings: out, raised: { type: 'FeatureCollection', features } };
}

// ── Building walls ────────────────────────────────────────────────────────

/**
 * Walls are drawn with rows of windows: a small picture of one window, repeated
 * along and up every wall. The pictures are sized in screen pixels of a whole
 * zoom level, so there is one set per level: a floor is 3 px at zoom 16 and
 * doubles with each step in, which keeps it about 3 m on the ground. Seen from
 * further out than zoom 16 the walls are plain.
 */
export const WALL_DETAILS = [
  null,
  { zoom: 16, floor: 3, bay: 4 },
  { zoom: 17, floor: 6, bay: 8 },
  { zoom: 18, floor: 12, bay: 16 },
];

/**
 * The two kinds of wall. "glass" is laid over the wall colour; "across" and
 * "up" say how much of a bay and of a floor the window takes.
 */
export const WALL_KINDS = {
  // Plaster and stone with a window in each bay.
  low: { colour: '#f3f1ec', glass: 'rgba(62, 84, 112, 0.34)', across: 0.64, up: 0.44 },
  // Towers: bands of glass with little wall between.
  tall: { colour: '#e6ebf0', glass: 'rgba(52, 84, 122, 0.46)', across: 0.84, up: 0.6 },
};
// Buildings from this height up are drawn as towers.
const TOWER_METERS = 60;

/** What a wall picture's name stands for, e.g. "vm-wall:2:tall": { detail, kind } or null. */
export function wallImage(id) {
  const match = /^vm-wall:(\d):([a-z]+)$/.exec(String(id ?? ''));
  if (!match || Number(match[1]) >= WALL_DETAILS.length || !Object.hasOwn(WALL_KINDS, match[2])) return null;
  return { detail: Number(match[1]), kind: match[2] };
}

// ── Map styles ────────────────────────────────────────────────────────────
// Every style is built on OpenFreeMap's vector data ("openmaptiles"), so the
// place markers and the road-name lookup work in all of them.

export const VECTOR_SOURCE = 'openmaptiles';
const IMAGERY_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Satellite photos with the street map's names and icons drawn on top. */
export function satelliteStyle(base) {
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
      imagery: {
        type: 'raster',
        tiles: [IMAGERY_TILES],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#10141a' } },
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
 * The city as a white scale model: every building a white block standing on
 * earth-coloured ground, with grey roads drawn at their real widths. Meant to
 * be looked at tilted, from above.
 */
export function cityModelStyle(base) {
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
  // Widest last, so main roads are drawn over the side streets that meet them.
  const roads = [
    { id: 'service', classes: ['service', 'track'], meters: 4, minzoom: 14 },
    { id: 'minor', classes: ['minor', 'busway'], meters: 7, minzoom: 12 },
    { id: 'mid', classes: ['secondary', 'tertiary'], meters: 9.5, minzoom: 9 },
    { id: 'main', classes: ['primary'], meters: 12, minzoom: 7 },
    { id: 'big', classes: ['motorway', 'trunk'], meters: 14, minzoom: 5 },
  ];
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
  const widthOfAny = (extra = 0) => [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    11,
    ['+', ['max', ['/', metersOf, 1.1 * 32], 0.5], extra],
    16,
    ['+', ['/', metersOf, 1.1], extra],
    20,
    ['+', ['*', ['/', metersOf, 1.1], 16], extra],
  ];
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
  const isRail = ['match', ['get', 'class'], ['rail', 'transit'], true, false];
  // On a bridge the wider road is drawn last, on top.
  const bridgeLayout = { ...round, 'line-sort-key': metersOf };

  // Buildings: the white model with windows, plain below zoom 16 and finer with
  // each zoom step in. The app draws each wall picture when the map first asks for it.
  const height = ['coalesce', ['get', 'render_height'], 5];
  const standing = ['!', ['has', 'hide_3d']]; // "hide_3d" marks an outline whose separate parts are drawn instead
  const unpainted = ['!', ['has', 'colour']];
  const wallPicture = (kind) => [
    'step',
    ['zoom'],
    `vm-wall:0:${kind}`,
    ...WALL_DETAILS.flatMap((detail, index) => (detail ? [detail.zoom, `vm-wall:${index}:${kind}`] : [])),
  ];
  const blocks = (id, kind, filter) => ({
    id,
    type: 'fill-extrusion',
    source: VECTOR_SOURCE,
    'source-layer': 'building',
    minzoom: 13,
    filter: ['all', standing, unpainted, filter],
    paint: {
      'fill-extrusion-color': WALL_KINDS[kind].colour,
      'fill-extrusion-pattern': wallPicture(kind),
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-height': height,
      // Walls a shade darker than roofs, and darker still towards the foot of a tower.
      'fill-extrusion-vertical-gradient': true,
    },
  });

  return {
    version: 8,
    name: '3D City',
    glyphs: base.glyphs,
    sprite: base.sprite,
    // The app replaces this with the real sun for the time and place (see sunLight).
    light: { anchor: 'viewport', position: [1.5, 215, 35], color: '#ffffff', intensity: 0.28 },
    sky: {
      'sky-color': '#dfe6ec',
      'horizon-color': '#e9ecee',
      'fog-color': '#e3e6e8',
      'fog-ground-blend': 0.7,
      'horizon-fog-blend': 0.9,
      'sky-horizon-blend': 0.9,
      'atmosphere-blend': 0,
    },
    sources: {
      [VECTOR_SOURCE]: base.sources[VECTOR_SOURCE],
      imagery: {
        type: 'raster',
        tiles: [IMAGERY_TILES],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      },
      // The shadows the buildings cast; the app fills this in as the sun and the view move.
      'city-shade': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      // Buildings whose height was read from the satellite photo, at that height.
      'city-raised': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#d9d2c5' } },
      // Real ground, paled so it reads as sunlit earth under the model and shadows show on it.
      {
        id: 'city-ground',
        type: 'raster',
        source: 'imagery',
        paint: { 'raster-opacity': 0.6, 'raster-saturation': -0.45, 'raster-contrast': -0.05, 'raster-brightness-min': 0.32 },
      },
      {
        id: 'city-green',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'park',
        filter: ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false],
        paint: { 'fill-color': '#8f9b78', 'fill-opacity': 0.45 },
      },
      // Lawns, gardens and woods, and the playing fields and playgrounds among them.
      {
        id: 'city-grass',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'landcover',
        filter: ['all', isArea, ['match', ['get', 'class'], ['grass', 'wood', 'farmland'], true, false]],
        paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#7f9470', '#9bab82'], 'fill-opacity': 0.5 },
      },
      {
        id: 'city-pitch',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'landuse',
        filter: ['all', isArea, ['match', ['get', 'class'], ['pitch', 'playground', 'cemetery'], true, false]],
        paint: { 'fill-color': ['match', ['get', 'class'], 'cemetery', '#a3ad95', '#8fae7c'], 'fill-opacity': 0.5 },
      },
      {
        id: 'city-water',
        type: 'fill',
        source: VECTOR_SOURCE,
        'source-layer': 'water',
        paint: { 'fill-color': '#8fa7b8' },
      },
      // Roads underground: only a faint broken trace of where they run.
      lineLayer(
        'city-tunnels',
        [inTunnel, isDriven],
        { 'line-color': '#7d828c', 'line-opacity': 0.3, 'line-width': widthOfAny(), 'line-dasharray': [1.2, 1.2] },
        { minzoom: 13 },
      ),
      ...roads.map((road) => roadLayer(road, '-edge', { 'line-color': '#e4e0d8', 'line-width': widthOf(road.meters, 2) })),
      ...roads.map((road) => roadLayer(road, '', { 'line-color': '#737882', 'line-width': widthOf(road.meters) })),
      {
        id: 'city-road-marks',
        type: 'line',
        source: VECTOR_SOURCE,
        'source-layer': 'transportation',
        minzoom: 16,
        filter: ofClass('motorway', 'trunk', 'primary', 'secondary'),
        paint: {
          'line-color': 'rgba(255, 255, 255, 0.7)',
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 16, 0.7, 20, 5],
          'line-dasharray': [6, 9],
        },
      },
      // Footpaths and squares for walking.
      lineLayer(
        'city-paths',
        [['!', inTunnel], ['==', ['get', 'class'], 'path']],
        { 'line-color': '#efebe3', 'line-width': widthOf(2.2), 'line-opacity': 0.9 },
        { minzoom: 15, layout: round },
      ),
      // Railway and metro above ground: a dark line with pale sleepers across it.
      lineLayer(
        'city-rail',
        [['!', inTunnel], isRail],
        { 'line-color': '#5c616b', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 12, 0.8, 16, 3, 20, 14] },
        { minzoom: 12 },
      ),
      lineLayer(
        'city-rail-ties',
        [['!', inTunnel], isRail],
        {
          'line-color': '#e2ded5',
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 0.5, 16, 1.6, 20, 8],
          'line-dasharray': [1.5, 2.5],
        },
        { minzoom: 14 },
      ),
      // Bridges and flyovers lie over whatever passes beneath, with a soft shade under the deck.
      lineLayer(
        'city-bridge-shade',
        [onBridge, isDriven],
        { 'line-color': '#141a28', 'line-opacity': 0.28, 'line-width': widthOfAny(7), 'line-blur': 5 },
        { minzoom: 13, layout: bridgeLayout },
      ),
      lineLayer('city-bridge-edge', [onBridge, isDriven], { 'line-color': '#eceae4', 'line-width': widthOfAny(2.5) }, { minzoom: 12, layout: bridgeLayout }),
      lineLayer('city-bridge', [onBridge, isDriven], { 'line-color': '#7c818b', 'line-width': widthOfAny() }, { minzoom: 12, layout: bridgeLayout }),
      lineLayer(
        'city-bridge-marks',
        [onBridge, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false]],
        {
          'line-color': 'rgba(255, 255, 255, 0.7)',
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 16, 0.7, 20, 5],
          'line-dasharray': [6, 9],
        },
        { minzoom: 16 },
      ),
      // A soft dark rim on the ground where each building stands, the way corners
      // gather shade even on the sunny side.
      {
        id: 'city-contact',
        type: 'line',
        source: VECTOR_SOURCE,
        'source-layer': 'building',
        minzoom: 15,
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
          'fill-extrusion-opacity': 0.42,
          'fill-extrusion-vertical-gradient': false,
        },
      },
      blocks('city-buildings', 'low', ['<', height, TOWER_METERS]),
      blocks('city-towers', 'tall', ['>=', height, TOWER_METERS]),
      // A building whose colour mappers recorded is drawn in that colour, plain.
      {
        id: 'city-painted',
        type: 'fill-extrusion',
        source: VECTOR_SOURCE,
        'source-layer': 'building',
        minzoom: 13,
        filter: ['all', standing, ['has', 'colour']],
        paint: {
          'fill-extrusion-color': ['to-color', ['get', 'colour'], WALL_KINDS.low.colour],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-height': height,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      // The same building again, taller, where the photo shows it to be: it swallows the low block from the map.
      {
        id: 'city-raised',
        type: 'fill-extrusion',
        source: 'city-raised',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': WALL_KINDS.low.colour,
          'fill-extrusion-pattern': wallPicture('low'),
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'city-raised-roofs',
        type: 'fill-extrusion',
        source: 'city-raised',
        minzoom: 16,
        paint: {
          'fill-extrusion-color': '#e9e6de',
          'fill-extrusion-base': ['get', 'h'],
          'fill-extrusion-height': ['+', ['get', 'h'], 1.2],
          'fill-extrusion-vertical-gradient': false,
        },
      },
      // The windows would run across the roofs too. A plain slab on top of each
      // building covers them, and stands a little proud like a roof's parapet.
      {
        id: 'city-roofs',
        type: 'fill-extrusion',
        source: VECTOR_SOURCE,
        'source-layer': 'building',
        minzoom: 16,
        filter: ['all', standing, unpainted],
        paint: {
          'fill-extrusion-color': '#e9e6de',
          'fill-extrusion-base': height,
          'fill-extrusion-height': ['+', height, 1.2],
          'fill-extrusion-vertical-gradient': false,
        },
      },
      // The names and icons of the street map, without the route-number badges
      // that repeat along every main road.
      ...base.layers.filter((layer) => layer.type === 'symbol' && !layer.id.includes('shield')),
    ],
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
