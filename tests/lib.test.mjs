import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_RECENTS,
  addRecent,
  clamp,
  defaultSplit,
  formatSpeed,
  linkLabel,
  parseStartSeconds,
  parseVideoLink,
  youtubeEmbedUrl,
} from '../js/lib.js';

test('clamp keeps a number inside its range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test('parseStartSeconds reads YouTube time values', () => {
  assert.equal(parseStartSeconds('90'), 90);
  assert.equal(parseStartSeconds('90s'), 90);
  assert.equal(parseStartSeconds('1m30s'), 90);
  assert.equal(parseStartSeconds('1h2m3s'), 3723);
  assert.equal(parseStartSeconds('2m'), 120);
  assert.equal(parseStartSeconds(''), 0);
  assert.equal(parseStartSeconds(null), 0);
  assert.equal(parseStartSeconds('soon'), 0);
});

test('parseVideoLink recognises every common YouTube link shape', () => {
  const id = 'aqz-KE-bpKQ';
  const shapes = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&feature=share`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abcdef`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `youtu.be/${id}`,
    `  www.youtube.com/watch?v=${id}  `,
  ];
  for (const shape of shapes) {
    const link = parseVideoLink(shape);
    assert.equal(link.kind, 'youtube', shape);
    assert.equal(link.id, id, shape);
    assert.equal(link.start, 0, shape);
  }
});

test('parseVideoLink keeps the start time and the playlist', () => {
  assert.deepEqual(parseVideoLink('https://youtu.be/aqz-KE-bpKQ?t=1m5s'), {
    kind: 'youtube',
    id: 'aqz-KE-bpKQ',
    list: null,
    start: 65,
  });
  assert.deepEqual(
    parseVideoLink('https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=PL1234567890abcdef&start=30'),
    { kind: 'youtube', id: 'aqz-KE-bpKQ', list: 'PL1234567890abcdef', start: 30 },
  );
  assert.deepEqual(parseVideoLink('https://www.youtube.com/playlist?list=PL1234567890abcdef'), {
    kind: 'youtube',
    id: null,
    list: 'PL1234567890abcdef',
    start: 0,
  });
});

test('parseVideoLink rejects YouTube pages that are not a video', () => {
  assert.deepEqual(parseVideoLink('https://www.youtube.com/'), { kind: 'invalid', reason: 'not-a-link' });
  assert.deepEqual(parseVideoLink('https://www.youtube.com/@somechannel'), {
    kind: 'invalid',
    reason: 'not-a-link',
  });
  assert.deepEqual(parseVideoLink('https://youtu.be/too-short'), { kind: 'invalid', reason: 'not-a-link' });
});

test('parseVideoLink treats other links as direct video files', () => {
  assert.deepEqual(parseVideoLink('https://example.com/films/trip.mp4'), {
    kind: 'file',
    url: 'https://example.com/films/trip.mp4',
    hls: false,
  });
  assert.deepEqual(parseVideoLink('example.com/live/stream.m3u8?token=1'), {
    kind: 'file',
    url: 'https://example.com/live/stream.m3u8?token=1',
    hls: true,
  });
  assert.equal(parseVideoLink('http://192.168.1.20:8096/video.mp4').kind, 'file');
});

test('parseVideoLink explains what is wrong with bad input', () => {
  assert.deepEqual(parseVideoLink(''), { kind: 'invalid', reason: 'empty' });
  assert.deepEqual(parseVideoLink('   '), { kind: 'invalid', reason: 'empty' });
  assert.deepEqual(parseVideoLink(undefined), { kind: 'invalid', reason: 'empty' });
  assert.deepEqual(parseVideoLink('my holiday video'), { kind: 'invalid', reason: 'not-a-link' });
  assert.deepEqual(parseVideoLink('localhost'), { kind: 'invalid', reason: 'not-a-link' });
  assert.deepEqual(parseVideoLink('javascript:alert(1)'), { kind: 'invalid', reason: 'scheme' });
  assert.deepEqual(parseVideoLink('file:///private/video.mp4'), { kind: 'invalid', reason: 'scheme' });
});

test('youtubeEmbedUrl builds the address of the embedded player', () => {
  const single = new URL(youtubeEmbedUrl({ id: 'aqz-KE-bpKQ', list: null, start: 0 }));
  assert.equal(single.origin, 'https://www.youtube-nocookie.com');
  assert.equal(single.pathname, '/embed/aqz-KE-bpKQ');
  assert.equal(single.searchParams.get('playsinline'), '1');
  assert.equal(single.searchParams.has('start'), false);
  assert.equal(single.searchParams.has('list'), false);

  const timed = new URL(youtubeEmbedUrl({ id: 'aqz-KE-bpKQ', list: 'PL1234567890abcdef', start: 65 }));
  assert.equal(timed.searchParams.get('start'), '65');
  assert.equal(timed.searchParams.get('list'), 'PL1234567890abcdef');

  const playlist = new URL(youtubeEmbedUrl({ id: null, list: 'PL1234567890abcdef', start: 0 }));
  assert.equal(playlist.pathname, '/embed/videoseries');
  assert.equal(playlist.searchParams.get('list'), 'PL1234567890abcdef');
});

test('formatSpeed converts metres per second for the readout', () => {
  assert.deepEqual(formatSpeed(0, 'kmh'), { value: '0', unit: 'km/h', known: true });
  assert.deepEqual(formatSpeed(27.78, 'kmh'), { value: '100', unit: 'km/h', known: true });
  assert.deepEqual(formatSpeed(27.78, 'mph'), { value: '62', unit: 'mph', known: true });
  assert.deepEqual(formatSpeed(33.33, 'kmh'), { value: '120', unit: 'km/h', known: true });
});

test('formatSpeed shows a dash when the phone does not know the speed', () => {
  for (const unknown of [null, undefined, Number.NaN, -1, '12']) {
    assert.deepEqual(formatSpeed(unknown, 'kmh'), { value: '–', unit: 'km/h', known: false });
  }
});

test('linkLabel gives recent links a short readable name', () => {
  assert.equal(linkLabel(parseVideoLink('https://youtu.be/aqz-KE-bpKQ')), 'YouTube · aqz-KE-bpKQ');
  assert.equal(
    linkLabel(parseVideoLink('https://www.youtube.com/playlist?list=PL1234567890abcdef')),
    'YouTube playlist',
  );
  assert.equal(
    linkLabel(parseVideoLink('https://www.example.com/films/road%20trip.mp4')),
    'road trip.mp4 · example.com',
  );
  assert.equal(linkLabel(parseVideoLink('https://example.com')), 'example.com');
});

test('addRecent puts the newest link first, without duplicates, up to the limit', () => {
  assert.deepEqual(addRecent([], 'a'), ['a']);
  assert.deepEqual(addRecent(['a', 'b'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(addRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.deepEqual(addRecent('not a list', 'a'), ['a']);
  assert.deepEqual(addRecent(['a', 42, null, 'b'], 'c'), ['c', 'a', 'b']);

  const full = Array.from({ length: MAX_RECENTS }, (_, i) => `link-${i}`);
  const next = addRecent(full, 'newest');
  assert.equal(next.length, MAX_RECENTS);
  assert.equal(next[0], 'newest');
  assert.equal(next.includes(`link-${MAX_RECENTS - 1}`), false);
});

test('defaultSplit fits a 16:9 picture in portrait and is near even in landscape', () => {
  // iPhone-sized portrait screen: 390 wide, 844 tall, 48 for the bar.
  const portrait = defaultSplit(390, 844, 48, false);
  assert.ok(Math.abs(portrait * (844 - 48) - (390 * 9) / 16) < 0.5, `got ${portrait}`);

  assert.equal(defaultSplit(844, 390, 48, true), 0.55);

  // Never outside the range the divider allows, whatever the screen.
  assert.equal(defaultSplit(1000, 600, 48, false), 0.6);
  assert.equal(defaultSplit(100, 2000, 48, false), 0.2);
  assert.equal(defaultSplit(0, 0, 48, false), 0.4);
});

// ── Map logic ─────────────────────────────────────────────────────────────

import {
  PLACE_CATEGORIES,
  VECTOR_SOURCE,
  angleBetween,
  bearingDegrees,
  categoryFilter,
  categoryIconExpression,
  categoryOf,
  circleRing,
  cityModelStyle,
  cleanCategories,
  describeTags,
  detailedStyle,
  detailsQuery,
  displayName,
  distanceMeters,
  formatDistance,
  formatDuration,
  formatSpeedLimit,
  isOverLimit,
  linesFromGeometry,
  nearestRoad,
  osmRefFromTileId,
  parseMaxspeed,
  photonPlace,
  placeKind,
  placeLayerIds,
  pointToSegmentMeters,
  routeSummary,
  satelliteStyle,
  speedLimitQuery,
  speedLimitRoads,
  weatherSummary,
  withOverlays,
} from '../js/lib.js';

const RIYADH = { lat: 24.7136, lng: 46.6753 };
const close = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} got ${actual}, wanted ${expected} ± ${tolerance}`);

test('distanceMeters measures along the ground', () => {
  assert.equal(distanceMeters(RIYADH, RIYADH), 0);
  // One degree of latitude is about 111.2 km everywhere.
  close(distanceMeters({ lat: 24, lng: 46 }, { lat: 25, lng: 46 }), 111195, 20);
  // Riyadh to Jeddah is roughly 846 km.
  close(distanceMeters(RIYADH, { lat: 21.4858, lng: 39.1925 }), 846000, 6000);
});

test('bearingDegrees gives the compass direction of travel', () => {
  close(bearingDegrees(RIYADH, { lat: 24.8, lng: 46.6753 }), 0, 0.01, 'north');
  close(bearingDegrees(RIYADH, { lat: 24.7136, lng: 46.8 }), 90, 0.1, 'east');
  close(bearingDegrees(RIYADH, { lat: 24.6, lng: 46.6753 }), 180, 0.01, 'south');
  close(bearingDegrees(RIYADH, { lat: 24.7136, lng: 46.5 }), 270, 0.1, 'west');
});

test('angleBetween is the short way round the compass', () => {
  assert.equal(angleBetween(10, 350), 20);
  assert.equal(angleBetween(350, 10), 20);
  assert.equal(angleBetween(0, 180), 180);
  assert.equal(angleBetween(90, 90), 0);
  assert.equal(angleBetween(725, 5), 0);
});

test('pointToSegmentMeters measures to the nearest point of a segment', () => {
  const west = { lat: 24.7136, lng: 46.67 };
  const east = { lat: 24.7136, lng: 46.68 };
  // 0.0001° of latitude is about 11.1 m.
  close(pointToSegmentMeters({ lat: 24.7137, lng: 46.675 }, west, east), 11.12, 0.05, 'beside the middle');
  close(pointToSegmentMeters({ lat: 24.7136, lng: 46.675 }, west, east), 0, 0.001, 'on the line');
  // Past the end, the distance is to the end point, not to the endless line.
  close(pointToSegmentMeters({ lat: 24.7136, lng: 46.681 }, west, east), distanceMeters(east, { lat: 24.7136, lng: 46.681 }), 0.2, 'past the end');
  close(pointToSegmentMeters({ lat: 24.7137, lng: 46.675 }, west, west), distanceMeters(west, { lat: 24.7137, lng: 46.675 }), 0.5, 'zero-length segment');
});

test('circleRing draws a closed circle of the right size', () => {
  const ring = circleRing(RIYADH, 50, 24);
  assert.equal(ring.length, 25);
  assert.deepEqual(ring[0], ring[24]);
  for (const [lng, lat] of ring) close(distanceMeters(RIYADH, { lat, lng }), 50, 0.2);
});

test('formatDistance reads naturally in both unit systems', () => {
  assert.equal(formatDistance(0, 'kmh'), '10 m');
  assert.equal(formatDistance(847, 'kmh'), '850 m');
  assert.equal(formatDistance(1240, 'kmh'), '1.2 km');
  assert.equal(formatDistance(12400, 'kmh'), '12 km');
  assert.equal(formatDistance(100, 'mph'), '330 ft');
  assert.equal(formatDistance(1609.344, 'mph'), '1.0 mi');
  assert.equal(formatDistance(32187, 'mph'), '20 mi');
  assert.equal(formatDistance(Number.NaN, 'kmh'), '');
  assert.equal(formatDistance(-5, 'kmh'), '');
});

test('formatDuration reads naturally', () => {
  assert.equal(formatDuration(20), 'under 1 min');
  assert.equal(formatDuration(153), '3 min');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(3900), '1 h 5 min');
  assert.equal(formatDuration(null), '');
});

test('parseMaxspeed understands OpenStreetMap speed limits', () => {
  assert.equal(parseMaxspeed('80'), 80);
  assert.equal(parseMaxspeed(' 120 '), 120);
  assert.equal(parseMaxspeed(50), 50);
  assert.equal(parseMaxspeed('30 mph'), 48);
  assert.equal(parseMaxspeed('30mph'), 48);
  assert.equal(parseMaxspeed('80;100'), 80);
  for (const notANumber of ['none', 'signals', 'variable', 'walk', 'SA:urban', '', '0', null, undefined, {}]) {
    assert.equal(parseMaxspeed(notANumber), null, String(notANumber));
  }
});

test('formatSpeedLimit shows the limit in the chosen unit', () => {
  assert.equal(formatSpeedLimit(80, 'kmh'), '80');
  assert.equal(formatSpeedLimit(80, 'mph'), '50');
  assert.equal(formatSpeedLimit(48, 'mph'), '30');
  assert.equal(formatSpeedLimit(null, 'kmh'), '');
});

test('isOverLimit allows a small margin', () => {
  assert.equal(isOverLimit(80 / 3.6, 80), false);
  assert.equal(isOverLimit(82.5 / 3.6, 80), false);
  assert.equal(isOverLimit(84 / 3.6, 80), true);
  assert.equal(isOverLimit(null, 80), false);
  assert.equal(isOverLimit(30, null), false);
});

// Two roads through one junction: one runs east–west, one north–south.
const EAST_WEST = { name: 'East–West Road', lines: [[{ lat: 24.7136, lng: 46.67 }, { lat: 24.7136, lng: 46.68 }]] };
const NORTH_SOUTH = { name: 'North–South Road', lines: [[{ lat: 24.71, lng: 46.675 }, { lat: 24.72, lng: 46.675 }]] };

test('nearestRoad picks the road the phone is on', () => {
  const onEastWest = { lat: 24.71362, lng: 46.672 };
  assert.equal(nearestRoad([EAST_WEST, NORTH_SOUTH], onEastWest).road, EAST_WEST);
  const onNorthSouth = { lat: 24.716, lng: 46.67502 };
  assert.equal(nearestRoad([EAST_WEST, NORTH_SOUTH], onNorthSouth).road, NORTH_SOUTH);
  close(nearestRoad([EAST_WEST], onEastWest).distance, 2.2, 0.2);
});

test('nearestRoad uses the direction of travel at a junction', () => {
  // A few metres from both roads, slightly nearer the north–south one.
  const atJunction = { lat: 24.71364, lng: 46.67502 };
  assert.equal(nearestRoad([EAST_WEST, NORTH_SOUTH], atJunction).road, NORTH_SOUTH);
  assert.equal(nearestRoad([EAST_WEST, NORTH_SOUTH], atJunction, 90).road, EAST_WEST, 'driving east');
  assert.equal(nearestRoad([EAST_WEST, NORTH_SOUTH], atJunction, 270).road, EAST_WEST, 'driving west');
  assert.equal(nearestRoad([EAST_WEST, NORTH_SOUTH], atJunction, 0).road, NORTH_SOUTH, 'driving north');
});

test('nearestRoad finds nothing when no road is close', () => {
  assert.equal(nearestRoad([EAST_WEST, NORTH_SOUTH], { lat: 24.718, lng: 46.672 }), null);
  assert.equal(nearestRoad([], RIYADH), null);
  // A long straight segment still matches in its middle, far from both ends.
  const long = { lines: [[{ lat: 24.7, lng: 46.6 }, { lat: 24.7, lng: 46.9 }]] };
  assert.equal(nearestRoad([long], { lat: 24.70005, lng: 46.75 }).road, long);
});

test('linesFromGeometry reads GeoJSON lines', () => {
  assert.deepEqual(linesFromGeometry({ type: 'LineString', coordinates: [[46.6, 24.7], [46.7, 24.8]] }), [
    [{ lat: 24.7, lng: 46.6 }, { lat: 24.8, lng: 46.7 }],
  ]);
  assert.equal(linesFromGeometry({ type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]], [[5, 6], [7, 8]]] }).length, 2);
  assert.deepEqual(linesFromGeometry({ type: 'Point', coordinates: [1, 2] }), []);
  assert.deepEqual(linesFromGeometry(null), []);
});

test('displayName prefers the Latin-script name and keeps the local one beside it', () => {
  assert.deepEqual(displayName({ name: 'العليا مول', 'name:latin': 'Olaya Mall', 'name:nonlatin': 'العليا مول' }), {
    title: 'Olaya Mall',
    alt: 'العليا مول',
  });
  assert.deepEqual(displayName({ name: 'Nift', 'name:latin': 'Nift' }), { title: 'Nift', alt: '' });
  assert.deepEqual(displayName({ name: 'جامع الراجحي', 'name:nonlatin': 'جامع الراجحي' }), { title: 'جامع الراجحي', alt: '' });
  assert.deepEqual(displayName({ name: 'مركز المملكة', 'name:en': 'Kingdom Centre', 'name:ar': 'مركز المملكة' }), {
    title: 'Kingdom Centre',
    alt: 'مركز المملكة',
  });
  assert.deepEqual(displayName({}), { title: '', alt: '' });
  assert.deepEqual(displayName(null), { title: '', alt: '' });
});

test('placeKind says what a place is', () => {
  assert.equal(placeKind('fuel', 'fuel'), 'Fuel station');
  assert.equal(placeKind('fuel', 'charging_station'), 'Charging station');
  assert.equal(placeKind('place_of_worship', 'muslim'), 'Mosque');
  assert.equal(placeKind('place_of_worship', 'place_of_worship'), 'Place of worship');
  assert.equal(placeKind('hospital', 'clinic'), 'Clinic');
  assert.equal(placeKind('car', 'car_repair'), 'Car repair');
  assert.equal(placeKind('shop', 'musical_instrument'), 'Musical instrument');
  assert.equal(placeKind('highway', 'primary'), 'Road');
  assert.equal(placeKind('building', 'yes'), 'Building');
  assert.equal(placeKind('amenity', 'fuel'), 'Fuel station');
  assert.equal(placeKind('place', 'city'), 'City');
});

test('every place category has a marker, a filter and a test that agree', () => {
  const ids = PLACE_CATEGORIES.map((category) => category.id);
  assert.equal(new Set(ids).size, ids.length);
  const cases = [
    ['fuel', 'fuel', 'fuel'],
    ['fuel', 'charging_station', 'charging'],
    ['parking', 'parking', 'parking'],
    ['restaurant', 'restaurant', 'food'],
    ['cafe', 'cafe', 'food'],
    ['place_of_worship', 'muslim', 'worship'],
    ['hospital', 'clinic', 'health'],
    ['pharmacy', 'pharmacy', 'health'],
    ['atm', 'atm', 'money'],
    ['grocery', 'supermarket', 'shops'],
    ['shop', 'mall', 'shops'],
    ['lodging', 'hotel', 'hotels'],
    ['shop', 'shoes', null],
    ['bus', 'bus_stop', null],
  ];
  for (const [className, subclass, expected] of cases) {
    assert.equal(categoryOf(className, subclass), expected, `${className}/${subclass}`);
  }
  const icons = categoryIconExpression();
  assert.equal(icons[0], 'case');
  assert.equal(icons.at(-1), 'vm-other');
  for (const id of ids) assert.ok(icons.includes(`vm-${id}`), id);
});

test('cleanCategories drops unknown ids and keeps the app order', () => {
  assert.deepEqual(cleanCategories(['parking', 'nonsense', 'fuel']), ['fuel', 'parking']);
  assert.deepEqual(cleanCategories('fuel'), []);
  assert.deepEqual(cleanCategories(undefined), []);
});

test('categoryFilter matches only the chosen categories', () => {
  assert.deepEqual(categoryFilter(['parking']), ['any', ['==', ['get', 'class'], 'parking']]);
  assert.equal(categoryFilter(['fuel', 'food']).length, 3);
  // With nothing chosen the filter is still valid and matches nothing.
  assert.deepEqual(categoryFilter([]), ['==', ['get', 'class'], '\u0000none']);
});

test('osmRefFromTileId recovers the OpenStreetMap element', () => {
  assert.deepEqual(osmRefFromTileId(6757546691), { type: 'node', id: 675754669 });
  assert.deepEqual(osmRefFromTileId(12987259442), { type: 'way', id: 1298725944 });
  assert.deepEqual(osmRefFromTileId(1234563), { type: 'relation', id: 123456 });
  for (const bad of [0, 7, 1234560, 12345.5, -11, '6757546691', undefined, null]) {
    assert.equal(osmRefFromTileId(bad), null, String(bad));
  }
});

test('describeTags lists the facts worth showing about a place', () => {
  const rows = describeTags({
    amenity: 'fuel',
    name: 'Al Daleel Station',
    brand: 'Aldrees',
    opening_hours: '24/7',
    phone: '+966 11 123 4567; +966 50 000 0000',
    website: 'www.aldrees.com/stations',
    'addr:street': 'King Fahd Road',
    'addr:housenumber': '12',
    'addr:city': 'Riyadh',
    'fuel:octane_91': 'yes',
    'fuel:octane_95': 'yes',
    'fuel:diesel': 'yes',
    'fuel:lpg': 'no',
    wheelchair: 'yes',
    wikipedia: 'en:Aldrees Petroleum',
  });
  assert.deepEqual(rows, [
    { label: 'Hours', value: 'Open 24 hours' },
    { label: 'Address', value: '12 King Fahd Road, Riyadh' },
    { label: 'Phone', value: '+966 11 123 4567', href: 'tel:+966111234567' },
    { label: 'Website', value: 'aldrees.com', href: 'https://www.aldrees.com/stations' },
    { label: 'Run by', value: 'Aldrees' },
    { label: 'Fuel', value: '91, 95, Diesel' },
    { label: 'Wheelchair', value: 'Yes' },
    { label: 'More', value: 'Wikipedia', href: 'https://en.wikipedia.org/wiki/Aldrees_Petroleum' },
  ]);
});

test('describeTags covers food, charging and parking, and ignores junk', () => {
  assert.deepEqual(describeTags({ amenity: 'restaurant', cuisine: 'arab;middle_eastern', opening_hours: 'Mo-Su 12:00-01:00' }), [
    { label: 'Hours', value: 'Mo-Su 12:00-01:00' },
    { label: 'Food', value: 'Arab, Middle eastern' },
  ]);
  assert.deepEqual(
    describeTags({ amenity: 'charging_station', 'socket:type2': '2', 'socket:type2_combo': '1', 'socket:chademo': 'no', capacity: '3', fee: 'yes' }),
    [
      { label: 'Plugs', value: 'CCS, Type 2' },
      { label: 'Spaces', value: '3' },
      { label: 'Fee', value: 'Yes' },
    ],
  );
  assert.deepEqual(describeTags({ amenity: 'parking', parking: 'multi-storey', fee: 'no', capacity: '400' }), [
    { label: 'Spaces', value: '400' },
    { label: 'Fee', value: 'No' },
    { label: 'Type', value: 'Multi-storey' },
  ]);
  // A website that is not a web address is dropped rather than turned into a link.
  assert.deepEqual(describeTags({ website: 'javascript:alert(1)', brand: 'Same', name: 'Same' }), []);
  assert.deepEqual(describeTags(null), []);
  assert.deepEqual(describeTags({}), []);
});

test('the Overpass questions are well formed', () => {
  assert.equal(detailsQuery({ type: 'node', id: 675754669 }), '[out:json][timeout:10];node(675754669);out tags;');
  assert.equal(
    speedLimitQuery(RIYADH, 1000),
    '[out:json][timeout:15];way["highway"]["maxspeed"](around:1000,24.71360,46.67530);out tags geom qt;',
  );
});

test('speedLimitRoads keeps the roads with a usable limit', () => {
  const roads = speedLimitRoads({
    elements: [
      { type: 'way', id: 1, tags: { highway: 'primary', maxspeed: '80' }, geometry: [{ lat: 24.7, lon: 46.6 }, { lat: 24.71, lon: 46.61 }] },
      { type: 'way', id: 2, tags: { highway: 'residential', maxspeed: 'SA:urban' }, geometry: [{ lat: 24.7, lon: 46.6 }, { lat: 24.71, lon: 46.6 }] },
      { type: 'way', id: 3, tags: { highway: 'trunk', maxspeed: '120' }, geometry: [{ lat: 24.7, lon: 46.6 }] },
      { type: 'node', id: 4, lat: 24.7, lon: 46.6 },
      { type: 'way', id: 5, tags: { highway: 'motorway', maxspeed: '70 mph' }, geometry: [{ lat: 51.5, lon: -0.1 }, null, { lat: 51.6, lon: -0.1 }] },
    ],
  });
  assert.deepEqual(roads, [
    { limit: 80, lines: [[{ lat: 24.7, lng: 46.6 }, { lat: 24.71, lng: 46.61 }]] },
    { limit: 113, lines: [[{ lat: 51.5, lng: -0.1 }, { lat: 51.6, lng: -0.1 }]] },
  ]);
  assert.deepEqual(speedLimitRoads({}), []);
  assert.deepEqual(speedLimitRoads(null), []);
});

test('photonPlace turns a search result into a place', () => {
  // A real answer from the Photon geocoder, trimmed.
  const feature = {
    type: 'Feature',
    properties: {
      osm_type: 'W',
      osm_id: 264745917,
      osm_key: 'shop',
      osm_value: 'mall',
      type: 'house',
      name: 'Kingdom Centre',
      street: 'King Fahd Road',
      district: 'Al `Ulayya',
      city: 'Riyadh',
      state: 'Riyadh',
      country: 'Saudi Arabia',
    },
    geometry: { type: 'Point', coordinates: [46.6743526, 24.7113804] },
  };
  assert.deepEqual(photonPlace(feature), {
    title: 'Kingdom Centre',
    alt: '',
    kind: 'Shopping mall',
    detail: 'King Fahd Road, Al `Ulayya, Riyadh, Saudi Arabia',
    lat: 24.7113804,
    lng: 46.6743526,
    osm: { type: 'way', id: 264745917 },
  });

  // A street: the street is the title, and is not repeated in the detail line.
  const street = photonPlace({
    properties: { osm_type: 'W', osm_id: 5, osm_key: 'highway', osm_value: 'primary', name: 'King Fahd Road', street: 'King Fahd Road', city: 'Riyadh', country: 'Saudi Arabia' },
    geometry: { type: 'Point', coordinates: [46.67, 24.71] },
  });
  assert.equal(street.kind, 'Road');
  assert.equal(street.detail, 'Riyadh, Saudi Arabia');

  assert.equal(photonPlace({ properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } }), null);
  assert.equal(photonPlace({ properties: { name: 'Nowhere' } }), null);
  assert.equal(photonPlace(null), null);
});

test('weatherSummary reads the current weather', () => {
  assert.deepEqual(weatherSummary({ temperature_2m: 33.6, weather_code: 0 }), { temperature: 34, text: 'Clear' });
  assert.deepEqual(weatherSummary({ temperature_2m: 18.2, weather_code: 63 }), { temperature: 18, text: 'Rain' });
  assert.deepEqual(weatherSummary({ temperature_2m: -0.4, weather_code: 999 }), { temperature: 0, text: '' });
  assert.equal(weatherSummary({ weather_code: 3 }), null);
  assert.equal(weatherSummary(null), null);
});

test('routeSummary reads a driving route', () => {
  // The shape the OSRM demo server answers with.
  const answer = {
    code: 'Ok',
    routes: [{ distance: 1244.7, duration: 153, geometry: { type: 'LineString', coordinates: [[46.675293, 24.71363], [46.675076, 24.710277]] } }],
  };
  assert.deepEqual(routeSummary(answer), {
    distance: 1244.7,
    duration: 153,
    coordinates: [[46.675293, 24.71363], [46.675076, 24.710277]],
  });
  assert.equal(routeSummary({ code: 'NoRoute', routes: [] }), null);
  assert.equal(routeSummary({ code: 'Ok', routes: [{ geometry: { coordinates: [[1, 2]] } }] }), null);
  assert.equal(routeSummary(undefined), null);
});

// A cut-down street style of the shape OpenFreeMap serves.
const BASE_STYLE = {
  version: 8,
  glyphs: 'https://tiles.example/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.example/sprites/ofm',
  sources: { [VECTOR_SOURCE]: { type: 'vector', url: 'https://tiles.example/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'road', type: 'line', source: VECTOR_SOURCE, 'source-layer': 'transportation', paint: { 'line-color': '#999' } },
    { id: 'poi_r1', type: 'symbol', source: VECTOR_SOURCE, 'source-layer': 'poi', layout: { 'text-field': '{name}' }, paint: { 'text-color': '#333' } },
    { id: 'road-name', type: 'symbol', source: VECTOR_SOURCE, 'source-layer': 'transportation_name', layout: { 'text-field': '{name}' } },
  ],
};

test('satelliteStyle puts the map names on top of the photos', () => {
  const style = satelliteStyle(BASE_STYLE);
  assert.deepEqual(style.layers.map((layer) => layer.id), ['background', 'imagery', 'poi_r1', 'road-name']);
  assert.equal(style.sources.imagery.type, 'raster');
  assert.match(style.sources.imagery.attribution, /Esri/);
  assert.equal(style.sources[VECTOR_SOURCE], BASE_STYLE.sources[VECTOR_SOURCE]);
  assert.equal(style.layers[2].paint['text-color'], '#ffffff');
  assert.equal(style.glyphs, BASE_STYLE.glyphs);
  // The street style it was built from is left as it was.
  assert.equal(BASE_STYLE.layers[2].paint['text-color'], '#333');
});

test('detailedStyle shows the OpenStreetMap picture tiles and keeps the map data', () => {
  const style = detailedStyle(BASE_STYLE);
  assert.deepEqual(style.layers.map((layer) => layer.id), ['background', 'osm']);
  assert.match(style.sources.osm.tiles[0], /^https:\/\/tile\.openstreetmap\.org\//);
  assert.match(style.sources.osm.attribution, /OpenStreetMap/);
  assert.ok(style.sources[VECTOR_SOURCE]);
});

test('withOverlays adds the app drawings on top of any style', () => {
  const pin = { type: 'Feature', geometry: { type: 'Point', coordinates: [46.67, 24.71] }, properties: {} };
  const style = withOverlays(BASE_STYLE, { categories: ['fuel', 'parking'], dark: true, pin });
  const ids = style.layers.map((layer) => layer.id);
  assert.deepEqual(ids.slice(0, 4), ['background', 'road', 'poi_r1', 'road-name']);
  for (const id of ['vm-road-names', 'vm-route', 'vm-accuracy', 'vm-places', 'vm-pin']) assert.ok(ids.includes(id), id);
  assert.ok(ids.indexOf('vm-route') < ids.indexOf('vm-places'), 'markers are drawn above the route');

  const places = style.layers.find((layer) => layer.id === 'vm-places');
  assert.equal(places.layout.visibility, 'visible');
  assert.deepEqual(places.filter, categoryFilter(['fuel', 'parking']));
  assert.equal(places.paint['text-color'], '#ffffff');
  assert.equal(style.sources['vm-pin'].data, pin);
  assert.deepEqual(style.sources['vm-route'].data, { type: 'FeatureCollection', features: [] });

  // Nothing chosen: the layer stays in the style, hidden.
  const none = withOverlays(BASE_STYLE, {});
  assert.equal(none.layers.find((layer) => layer.id === 'vm-places').layout.visibility, 'none');
  // The original is not changed.
  assert.equal(BASE_STYLE.layers.length, 4);
  assert.equal(Object.keys(BASE_STYLE.sources).length, 1);
});

test('placeLayerIds lists every layer whose features are places', () => {
  assert.deepEqual(placeLayerIds(withOverlays(BASE_STYLE, { categories: ['fuel'] })), ['poi_r1', 'vm-places']);
  assert.deepEqual(placeLayerIds(withOverlays(detailedStyle(BASE_STYLE), {})), ['vm-places']);
});

test('cityModelStyle draws the city as a white model on its real ground', () => {
  const style = cityModelStyle(BASE_STYLE);
  const ids = style.layers.map((layer) => layer.id);
  const at = (id) => ids.indexOf(id);

  // Ground first, then roads, then the buildings standing on them, then the names.
  assert.equal(ids[0], 'background');
  assert.ok(at('city-ground') < at('city-road-minor'));
  assert.ok(at('city-road-minor-edge') < at('city-road-minor'), 'kerbs lie under the road surface');
  assert.ok(at('city-road-minor') < at('city-road-big'), 'main roads are drawn over side streets');
  assert.ok(at('city-road-big') < at('city-shadows') && at('city-shadows') < at('city-buildings'));
  assert.deepEqual(ids.slice(-2), ['poi_r1', 'road-name'], 'the map names stay on top');

  const buildings = style.layers[at('city-buildings')];
  assert.equal(buildings.type, 'fill-extrusion');
  assert.equal(buildings['source-layer'], 'building');
  assert.deepEqual(buildings.paint['fill-extrusion-height'], ['coalesce', ['get', 'render_height'], 5]);

  // A 7 m street is about 6.4 px wide at zoom 16 and doubles with every zoom step.
  const width = style.layers[at('city-road-minor')].paint['line-width'];
  assert.deepEqual(width.slice(0, 3), ['interpolate', ['exponential', 2], ['zoom']]);
  assert.ok(Math.abs(width[width.indexOf(16) + 1] - 7 / 1.1) < 1e-9);
  assert.ok(Math.abs(width[width.indexOf(20) + 1] - (7 / 1.1) * 16) < 1e-9);

  assert.equal(style.light.anchor, 'viewport');
  assert.equal(buildings.paint['fill-extrusion-vertical-gradient'], false);
  assert.match(style.sources.imagery.attribution, /Esri/);
  assert.equal(style.sources[VECTOR_SOURCE], BASE_STYLE.sources[VECTOR_SOURCE]);
  // The app's own layers go on top of it like on any other style.
  assert.deepEqual(placeLayerIds(withOverlays(style, { categories: ['fuel'] })), ['poi_r1', 'vm-places']);
  assert.equal(BASE_STYLE.layers.length, 4);
});
