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
  // On the ground: the soft rim at the foot of each building, then the cast shadows.
  assert.ok(at('city-road-big') < at('city-contact') && at('city-contact') < at('city-shadows'));
  assert.ok(at('city-shadows') < at('city-buildings'), 'buildings stand on their shadows');
  assert.ok(at('city-buildings') < at('city-roofs') && at('city-towers') < at('city-roofs') && at('city-painted') < at('city-roofs'));
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

  // Shadows are a flat 3D layer of their own, filled in by the app as the sun moves.
  const shadows = style.layers[at('city-shadows')];
  assert.equal(shadows.type, 'fill-extrusion');
  assert.equal(shadows.source, 'city-shade');
  assert.ok(shadows.paint['fill-extrusion-opacity'] < 1, 'one even shade where shadows cross');
  assert.deepEqual(style.sources['city-shade'], { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  // Walls have rows of windows: plain from afar, then one picture per zoom level from 16 in.
  assert.deepEqual(buildings.paint['fill-extrusion-pattern'], ['step', ['zoom'], 'vm-wall:0:low', 16, 'vm-wall:1:low', 17, 'vm-wall:2:low', 18, 'vm-wall:3:low']);
  assert.equal(buildings.paint['fill-extrusion-vertical-gradient'], true);
  // Towers are a layer of their own, with more glass.
  const towers = style.layers[at('city-towers')];
  assert.deepEqual(towers.paint['fill-extrusion-pattern'].slice(0, 5), ['step', ['zoom'], 'vm-wall:0:tall', 16, 'vm-wall:1:tall']);
  assert.deepEqual(buildings.filter.at(-1), ['<', ['coalesce', ['get', 'render_height'], 5], 60]);
  assert.deepEqual(towers.filter.at(-1), ['>=', ['coalesce', ['get', 'render_height'], 5], 60]);
  // A building keeps the colour mappers gave it, and is then drawn plain.
  const painted = style.layers[at('city-painted')];
  assert.deepEqual(painted.paint['fill-extrusion-color'], ['to-color', ['get', 'colour'], '#f3f1ec']);
  assert.equal(painted.paint['fill-extrusion-pattern'], undefined);
  assert.ok(JSON.stringify(painted.filter).includes('["has","colour"]') && JSON.stringify(buildings.filter).includes('["!",["has","colour"]]'));
  // A slab on each windowed building hides the windows that would run across its roof.
  const roofs = style.layers[at('city-roofs')];
  assert.deepEqual(roofs.paint['fill-extrusion-base'], ['coalesce', ['get', 'render_height'], 5]);
  assert.deepEqual(roofs.paint['fill-extrusion-height'], ['+', ['coalesce', ['get', 'render_height'], 5], 1.2]);
  assert.equal(roofs.minzoom, 16, 'only where there are windows to hide');

  // Tunnels are a faint trace under everything; bridges lie over the roads on the ground.
  assert.ok(at('city-tunnels') < at('city-road-service-edge'));
  assert.ok(at('city-road-marks') < at('city-bridge-shade') && at('city-bridge-shade') < at('city-bridge-edge') && at('city-bridge-edge') < at('city-bridge'));
  assert.ok(at('city-bridge') < at('city-contact'));
  const ground = JSON.stringify(style.layers[at('city-road-big')].filter);
  assert.ok(ground.includes('["match",["get","brunnel"],["bridge","tunnel"],false,true]'), 'ground roads leave out bridges and tunnels');
  assert.ok(JSON.stringify(style.layers[at('city-bridge')].filter).includes('["==",["get","brunnel"],"bridge"]'));
  assert.ok(JSON.stringify(style.layers[at('city-tunnels')].filter).includes('["==",["get","brunnel"],"tunnel"]'));
  // A bridge is as wide as the road it carries: 14 m for a motorway, 7 m for a side street.
  const bridgeWidth = JSON.stringify(style.layers[at('city-bridge')].paint['line-width']);
  assert.ok(bridgeWidth.includes('["motorway","trunk"],14') && bridgeWidth.includes('["minor","busway"],7'), bridgeWidth);
  // Also on the ground: rail with sleepers, footpaths, lawns and playing fields.
  for (const id of ['city-grass', 'city-pitch', 'city-paths', 'city-rail', 'city-rail-ties', 'city-rail-shade']) assert.ok(at(id) > 0, id);
  // From close by the app builds bridges and viaducts in 3D: their flat drawing fades out as that takes over, and the shade under them stays.
  for (const id of ['city-bridge', 'city-bridge-edge']) assert.deepEqual(style.layers[at(id)].paint['line-opacity'], ['interpolate', ['linear'], ['zoom'], 15.1, 1, 15.6, 0], id);
  assert.equal(style.layers[at('city-bridge-shade')].paint['line-opacity'], 0.28);
  assert.deepEqual(style.layers[at('city-rail')].paint['line-opacity'], ['interpolate', ['linear'], ['zoom'], 15.1, 1, 15.6, ['case', ['==', ['get', 'brunnel'], 'bridge'], 0, 1]]);
  assert.equal(at('city-bridge-marks'), -1, 'the lines on a bridge are painted on the deck itself');
  assert.ok(at('city-grass') < at('city-road-service-edge') && at('city-rail') < at('city-rail-ties'));
  assert.match(style.sources.imagery.attribution, /Esri/);
  assert.equal(style.sources[VECTOR_SOURCE], BASE_STYLE.sources[VECTOR_SOURCE]);
  // The app's own layers go on top of it like on any other style.
  assert.deepEqual(placeLayerIds(withOverlays(style, { categories: ['fuel'] })), ['poi_r1', 'vm-places']);
  assert.equal(BASE_STYLE.layers.length, 4);
});

// ── Sun and shadows ──────────────────────────────────────────────────────

import { buildingShadows, footprintsIn, shadowReach, sunLight, sunPosition } from '../js/lib.js';


test('sunPosition finds the sun in the sky', () => {
  const at = (iso, place) => sunPosition(new Date(iso), place.lat, place.lng);
  const close = (got, want, by, label) => assert.ok(Math.abs(got - want) <= by, `${label}: got ${got}, want ${want}`);

  // Midday at midsummer and midwinter: due south, 90° minus the gap between latitude and the sun's.
  const summer = at('2026-06-21T08:55:00Z', RIYADH);
  close(summer.altitude, 90 - (24.7136 - 23.44), 0.3, 'midsummer noon height');
  const winter = at('2026-12-21T08:51:30Z', RIYADH);
  close(winter.altitude, 90 - (24.7136 + 23.44), 0.3, 'midwinter noon height');
  close(winter.azimuth, 180, 0.5, 'midwinter noon direction');

  // At the equinox the sun is overhead on the equator, rises due east and sets due west.
  close(at('2026-03-20T12:07:30Z', { lat: 0, lng: 0 }).altitude, 90, 0.5, 'equinox noon on the equator');
  const sunrise = at('2026-03-20T03:00:00Z', RIYADH);
  close(sunrise.altitude, 0, 1, 'equinox sunrise height');
  close(sunrise.azimuth, 90, 1, 'equinox sunrise direction');
  const sunset = at('2026-03-20T15:02:00Z', RIYADH);
  close(sunset.altitude, 0, 1, 'equinox sunset height');
  close(sunset.azimuth, 270, 1, 'equinox sunset direction');

  // Afternoon: in the south-west. Midnight: below the horizon, in the north.
  const afternoon = at('2026-03-20T12:00:00Z', RIYADH);
  assert.ok(afternoon.azimuth > 225 && afternoon.azimuth < 270 && afternoon.altitude > 30 && afternoon.altitude < 50, JSON.stringify(afternoon));
  const midnight = at('2026-06-21T21:00:00Z', RIYADH);
  assert.ok(midnight.altitude < -35 && (midnight.azimuth < 20 || midnight.azimuth > 340), JSON.stringify(midnight));

  // A northern city at its own midsummer noon.
  close(at('2026-06-21T12:02:00Z', { lat: 51.5074, lng: -0.1278 }).altitude, 90 - 51.5074 + 23.44, 0.3, 'London');
});

test('shadowReach points shadows away from the sun and sizes them by its height', () => {
  const noonish = shadowReach({ azimuth: 135, altitude: 45 });
  assert.equal(noonish.bearing, 315);
  assert.ok(Math.abs(noonish.factor - 1) < 1e-9, 'at 45° a shadow is as long as the building is tall');
  assert.ok(Math.abs(shadowReach({ azimuth: 300, altitude: 60 }).factor - 1 / Math.sqrt(3)) < 1e-9);
  assert.equal(shadowReach({ azimuth: 300, altitude: 60 }).bearing, 120);

  // A low sun would throw shadows across the whole district: they stop at 3.5 times the height.
  assert.equal(shadowReach({ azimuth: 100, altitude: 5 }).factor, 3.5);
  // On the horizon or below it there are none.
  assert.equal(shadowReach({ azimuth: 100, altitude: 2 }), null);
  assert.equal(shadowReach({ azimuth: 0, altitude: -30 }), null);
  assert.equal(shadowReach(null), null);
});

test('sunLight lights the map from the sun by day and evenly by night', () => {
  const day = sunLight({ azimuth: 135.04, altitude: 50 });
  assert.equal(day.anchor, 'map', 'fixed to the ground, not to the screen');
  assert.deepEqual(day.position, [1.5, 135, 40]);
  assert.equal(day.color, '#ffffff');

  // A low sun still comes from its own direction, a little warm, but never from below 35° up.
  const evening = sunLight({ azimuth: 250, altitude: 8 });
  assert.deepEqual(evening.position, [1.5, 250, 55]);
  assert.match(evening.color, /^#ff[ef][0-9a-f]{3}$/);
  assert.notEqual(evening.color, '#ffffff');
  // Straight overhead is kept a touch off the vertical so walls still catch some light.
  assert.equal(sunLight({ azimuth: 180, altitude: 89 }).position[2], 10);

  const night = sunLight({ azimuth: 0, altitude: -20 });
  assert.equal(night.anchor, 'viewport');
  assert.ok(night.intensity < day.intensity);
  assert.deepEqual(sunLight(null), night);
});

// A 20 m square block with its south-west corner at (46.67, 24.7).
const blockRing = (lng = 46.67, lat = 24.7, size = 20) => {
  const dLat = size / 111320;
  const dLng = size / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat], [lng, lat + dLat], [lng, lat]];
};
const inMeters = ([lng, lat]) => [
  Math.round((lng - 46.67) * 111320 * Math.cos((24.7 * Math.PI) / 180) * 10) / 10,
  Math.round((lat - 24.7) * 111320 * 10) / 10,
];
const AROUND = { west: 46.66, east: 46.68, south: 24.69, north: 24.71 };

test('footprintsIn takes apart the grouped buildings of a map tile', () => {
  const far = blockRing(46.9, 24.9);
  const features = [
    { properties: { render_height: 12 }, geometry: { type: 'MultiPolygon', coordinates: [[blockRing()], [far]] } },
    { properties: { render_height: 30, render_min_height: 20 }, geometry: { type: 'Polygon', coordinates: [blockRing()] } },
    // Left out: an outline whose parts are drawn instead, no height, nothing but air, not an area.
    { properties: { render_height: 40, hide_3d: true }, geometry: { type: 'Polygon', coordinates: [blockRing()] } },
    { properties: {}, geometry: { type: 'Polygon', coordinates: [blockRing()] } },
    { properties: { render_height: 5, render_min_height: 5 }, geometry: { type: 'Polygon', coordinates: [blockRing()] } },
    { properties: { render_height: 9 }, geometry: { type: 'LineString', coordinates: blockRing() } },
    { properties: { render_height: 9 }, geometry: { type: 'Polygon', coordinates: [far] } },
    null,
  ];
  const found = footprintsIn(features, AROUND);
  assert.equal(found.length, 2);
  assert.deepEqual(found[0], { height: 12, base: 0, polygons: [[blockRing()]] });
  assert.deepEqual([found[1].height, found[1].base], [30, 20]);
  assert.deepEqual(footprintsIn([], AROUND), []);
});

test('buildingShadows sweeps the walls that face away from the sun', () => {
  const block = [{ height: 10, base: 0, polygons: [[blockRing()]] }];
  // Sun in the south-west, 45° up: a 10 m block throws 10 m of shadow to the north-east.
  const reach = shadowReach({ azimuth: 225, altitude: 45 });
  const shade = buildingShadows(block, reach);
  assert.equal(shade.type, 'FeatureCollection');
  assert.equal(shade.features.length, 1);
  assert.equal(shade.features[0].geometry.type, 'MultiPolygon');
  const pieces = shade.features[0].geometry.coordinates.map((polygon) => polygon[0].map(inMeters));
  // Only the east and north walls have their backs to the sun; each sweeps a strip 7.1 m east and north.
  assert.deepEqual(pieces, [
    [[20, 0], [20, 20], [27.1, 27.1], [27.1, 7.1], [20, 0]],
    [[20, 20], [0, 20], [7.1, 27.1], [27.1, 27.1], [20, 20]],
  ]);

  // The same block drawn the other way round casts the same shadow.
  const backwards = [{ height: 10, base: 0, polygons: [[[...blockRing()].reverse()]] }];
  assert.equal(buildingShadows(backwards, reach).features[0].geometry.coordinates.length, 2);

  // Sun due south: only the north wall counts, and the strip runs straight north.
  const north = buildingShadows(block, shadowReach({ azimuth: 180, altitude: 45 })).features[0].geometry.coordinates;
  assert.deepEqual(north.map((polygon) => polygon[0].map(inMeters)), [[[20, 20], [0, 20], [0, 30], [20, 30], [20, 20]]]);

  // A courtyard: its sunward wall shades the yard too.
  const yard = blockRing(46.67 + 5 / (111320 * Math.cos((24.7 * Math.PI) / 180)), 24.7 + 5 / 111320, 10);
  const withYard = buildingShadows([{ height: 10, base: 0, polygons: [[blockRing(), yard]] }], shadowReach({ azimuth: 180, altitude: 45 }));
  const yardPieces = withYard.features[0].geometry.coordinates.map((polygon) => polygon[0].map(inMeters));
  assert.equal(yardPieces.length, 2);
  assert.deepEqual(yardPieces[1].slice(0, 2).map(([, y]) => y), [5, 5], "the strip starts at the yard's south wall");

  // A part that starts 20 m up (a bridge between towers) drops its shadow further out, drawn whole.
  const bridge = buildingShadows([{ height: 30, base: 20, polygons: [[blockRing()]] }], shadowReach({ azimuth: 180, altitude: 45 }));
  const bridgePieces = bridge.features[0].geometry.coordinates.map((polygon) => polygon[0].map(inMeters));
  assert.deepEqual(bridgePieces[0], [[0, 20], [20, 20], [20, 40], [0, 40], [0, 20]], 'the footprint, 20 m to the north');
  assert.deepEqual(bridgePieces[1], [[20, 40], [0, 40], [0, 50], [20, 50], [20, 40]], 'and 10 m more for its own height');

  // Too small to see, no sun, nothing to shade: no shadows.
  assert.deepEqual(buildingShadows(block, reach, 25).features, []);
  assert.deepEqual(buildingShadows(block, null).features, []);
  assert.deepEqual(buildingShadows([], reach).features, []);
});

// ── Building walls ───────────────────────────────────────────────────────

import { WALL_DETAILS, WALL_KINDS, wallImage } from '../js/lib.js';

test('wall pictures keep a floor about 3 m tall at every zoom', () => {
  assert.equal(WALL_DETAILS[0], null, 'plain from afar');
  const levels = WALL_DETAILS.slice(1);
  assert.deepEqual(levels.map((level) => level.zoom), [16, 17, 18]);
  // A picture pixel covers half as much ground at each zoom step in, so the picture doubles.
  for (let i = 1; i < levels.length; i += 1) {
    assert.equal(levels[i].floor, levels[i - 1].floor * 2);
    assert.equal(levels[i].bay, levels[i - 1].bay * 2);
  }
  assert.equal(levels[0].floor, 3);
  for (const kind of Object.values(WALL_KINDS)) {
    assert.match(kind.colour, /^#[0-9a-f]{6}$/);
    // A window in the wall, or (a station's screen) a lattice over all of it.
    assert.ok(kind.lattice ? kind.across === 1 && kind.up === 1 : kind.across > 0 && kind.across < 1 && kind.up > 0 && kind.up < 1);
  }
  assert.ok(WALL_KINDS.tall.across > WALL_KINDS.low.across, 'towers are mostly glass');
  assert.deepEqual(Object.keys(WALL_KINDS), ['low', 'tall', 'station']);
  assert.deepEqual(wallImage('vm-wall:2:station'), { detail: 2, kind: 'station' });
});

test('wallImage reads the name of a wall picture', () => {
  assert.deepEqual(wallImage('vm-wall:0:low'), { detail: 0, kind: 'low' });
  assert.deepEqual(wallImage('vm-wall:3:tall'), { detail: 3, kind: 'tall' });
  for (const other of ['vm-wall:4:low', 'vm-wall:1:brick', 'vm-wall:1:toString', 'vm-fuel', 'wall:1:low', 'vm-wall:1:low:x', '', null, undefined]) {
    assert.equal(wallImage(other), null, String(other));
  }
});

// ── Map tiles ────────────────────────────────────────────────────────────

import { clipLine, groundWidth, tileBox } from '../js/lib.js';

test('tileBox gives the edges of a map tile', () => {
  assert.deepEqual(tileBox(0, 0, 0), { west: -180, east: 180, north: 85.05112877980659, south: -85.05112877980659 });
  // The tile that holds Al Olaya Street in Riyadh, and the one east of it: they share an edge exactly.
  const tile = tileBox(14, 10316, 7031);
  assert.ok(tile.west < 46.67693 && tile.east > 46.67693 && tile.south < 24.7 && tile.north > 24.7);
  assert.equal(tileBox(14, 10317, 7031).west, tile.east);
  assert.equal(tileBox(14, 10316, 7032).north, tile.south);
  assert.ok(Math.abs((tile.east - tile.west) * 111320 * Math.cos((24.7 * Math.PI) / 180) - 2222) < 5, 'about 2.2 km wide');
});

test('clipLine keeps the parts of a line inside a box, cut at its edges', () => {
  const box = { west: 0, south: 0, east: 10, north: 10 };
  // A road that runs through: cut where it enters and where it leaves.
  assert.deepEqual(clipLine([[-5, 5], [5, 5], [15, 5]], box), [[[0, 5], [5, 5], [10, 5]]]);
  assert.deepEqual(clipLine([[-5, 5], [15, 5]], box), [[[0, 5], [10, 5]]]);
  // All inside: as it was. All outside: nothing.
  assert.deepEqual(clipLine([[2, 2], [4, 4], [6, 2]], box), [[[2, 2], [4, 4], [6, 2]]]);
  assert.deepEqual(clipLine([[-5, -5], [-1, 20]], box), []);
  assert.deepEqual(clipLine([[11, -5], [11, 15]], box), []);
  // Out and back in again: two pieces.
  assert.deepEqual(clipLine([[5, 5], [5, 15], [7, 15], [7, 5]], box), [[[5, 5], [5, 10]], [[7, 10], [7, 5]]]);
  // Across a corner, and only touching one.
  assert.deepEqual(clipLine([[-2, 12], [12, -2]], box), [[[0, 10], [10, 0]]]);
  assert.deepEqual(clipLine([[-3, 13], [3, 7]], { west: 0, south: 10, east: 10, north: 20 }), []);
  // The two halves of a road cut at the edge between two tiles meet at the same point.
  const west = clipLine([[8, 3], [12, 5]], box);
  const east = clipLine([[8, 3], [12, 5]], { west: 10, south: 0, east: 20, north: 10 });
  assert.deepEqual(west[0].at(-1), east[0][0]);
  assert.deepEqual(west[0].at(-1), [10, 4]);
});

test('groundWidth is how much ground a line of the street map takes up', () => {
  assert.deepEqual(['service', 'minor', 'busway', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'].map(groundWidth), [4, 7, 7, 9.5, 9.5, 12, 14, 14]);
  assert.deepEqual(['rail', 'transit', 'path'].map(groundWidth), [5, 5, 2.2]);
  assert.deepEqual(['ferry', 'aerialway', undefined].map(groundWidth), [0, 0, 0]);
  // The roads are drawn to the same widths.
  const style = cityModelStyle(BASE_STYLE);
  const width = style.layers.find((layer) => layer.id === 'city-road-main').paint['line-width'];
  assert.ok(Math.abs(width[width.indexOf(16) + 1] - groundWidth('primary') / 1.1) < 1e-9);
});

// ── Buildings ────────────────────────────────────────────────────────────

import { BUILDING_SOURCE, BUILDING_STORE, HEIGHT_SPREAD, STATION_HEIGHT, USUAL_HEIGHT, USUAL_HEIGHTS, buildingArchives, buildingFootprints, buildingHeight, buildingsOnStreets } from '../js/lib.js';

/** A square outline, `size` metres wide, with its south-west corner `east` and `north` metres from 46.67°E 24.7°N. */
const SQUEEZE = 111195 * Math.cos((24.7 * Math.PI) / 180);
const at = (east, north) => [46.67 + east / SQUEEZE, 24.7 + north / 111195];
const square = (east, north, size) => [[at(east, north), at(east + size, north), at(east + size, north + size), at(east, north + size), at(east, north)]];
const feature = (id, properties, polygon) => ({ id, properties, geometry: { type: 'Polygon', coordinates: polygon } });
const EVERYWHERE = { west: -180, south: -90, east: 180, north: 90 };

test('buildingArchives lists the releases on offer, newest first', () => {
  const listing =
    '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Prefix>tiles/</Prefix><CommonPrefixes><Prefix>tiles/2026-09-23.0/</Prefix></CommonPrefixes>' +
    '<CommonPrefixes><Prefix>tiles/2026-11-18.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>tiles/2026-09-23.1/</Prefix></CommonPrefixes>' +
    '<CommonPrefixes><Prefix>tiles/2026-10-21.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>tiles/2026-09-23.10/</Prefix></CommonPrefixes>' +
    '<CommonPrefixes><Prefix>tiles/latest-notes/</Prefix></CommonPrefixes></ListBucketResult>';
  assert.deepEqual(
    buildingArchives(listing).map((url) => url.slice(BUILDING_STORE.length)),
    ['tiles/2026-11-18.0/buildings.pmtiles', 'tiles/2026-10-21.0/buildings.pmtiles', 'tiles/2026-09-23.10/buildings.pmtiles', 'tiles/2026-09-23.1/buildings.pmtiles', 'tiles/2026-09-23.0/buildings.pmtiles'],
  );
  assert.ok(BUILDING_STORE.startsWith('https://') && BUILDING_STORE.endsWith('/'));
  assert.deepEqual(buildingArchives('<Error><Code>AccessDenied</Code></Error>'), []);
  assert.deepEqual(buildingArchives(undefined), []);
});

test('buildingHeight reads a height from the record, or falls back on the usual for its kind', () => {
  assert.deepEqual(buildingHeight({ height: 41.5, num_floors: 3 }), { height: 41.5, base: 0, known: true });
  assert.deepEqual(buildingHeight({ num_floors: 4 }), { height: 13.2, base: 0, known: true });
  // A part that starts above the ground: a bridge between two towers.
  assert.deepEqual(buildingHeight({ height: 180, min_height: 150 }), { height: 180, base: 150, known: true });
  assert.deepEqual(buildingHeight({ num_floors: 2, min_height: 10 }), { height: 16.6, base: 10, known: true });
  // Nobody recorded it: the usual for what it is used for, or for a building of no stated use.
  assert.deepEqual(buildingHeight({ subtype: 'residential' }), { height: USUAL_HEIGHTS.residential, base: 0, known: false });
  assert.deepEqual(buildingHeight({ subtype: 'spaceport' }), { height: USUAL_HEIGHT, base: 0, known: false });
  assert.deepEqual(buildingHeight({}), { height: USUAL_HEIGHT, base: 0, known: false });
  assert.deepEqual(buildingHeight(undefined), { height: USUAL_HEIGHT, base: 0, known: false });
  assert.deepEqual(buildingHeight({ height: 0, num_floors: 0 }), { height: USUAL_HEIGHT, base: 0, known: false });
  // The usual height varies a little from one building to the next, always the same for the same building.
  assert.deepEqual([0, 1, 2, 3, 4, 5, 12].map((id) => buildingHeight({ subtype: 'residential' }, id).height), [...HEIGHT_SPREAD, HEIGHT_SPREAD[0], HEIGHT_SPREAD[2]].map((factor) => USUAL_HEIGHTS.residential * factor));
  assert.ok(Math.min(...HEIGHT_SPREAD) > 0.8 && Math.max(...HEIGHT_SPREAD) < 1.5 && HEIGHT_SPREAD.includes(1));
  assert.equal(buildingHeight({ height: 20 }, 4).height, 20, 'a recorded height is left as it is');
  assert.equal(buildingHeight({ subtype: 'residential' }, 9007199254740991).known, false, 'a very large number is a number too');
  // A station is a hall over its platforms, whichever number it has.
  assert.deepEqual(buildingHeight({ subtype: 'transportation', class: 'train_station' }, 4), { height: STATION_HEIGHT, base: 0, known: false });
  assert.deepEqual(buildingHeight({ subtype: 'transportation', class: 'train_station', height: 20 }, 4), { height: 20, base: 0, known: true });
});

test('buildingFootprints takes the buildings above ground, with the heights read from the photo', () => {
  const features = [
    feature(10, { subtype: 'residential' }, square(0, 0, 20)),
    feature(11, { height: 30 }, square(100, 0, 20)),
    feature(12, { subtype: 'transportation', is_underground: true }, square(200, 0, 60)), // a station under the street
    feature(13, { height: 90, has_parts: true }, square(300, 0, 40)), // drawn as its parts instead
    feature(14, { subtype: 'commercial' }, square(5000, 0, 20)), // far away
    { id: 15, properties: { subtype: 'religious' }, geometry: { type: 'MultiPolygon', coordinates: [square(400, 0, 20), square(6000, 0, 20)] } },
    { id: 16, properties: {}, geometry: { type: 'Point', coordinates: at(0, 0) } },
    feature(17, { subtype: 'residential' }, square(500, 0, 20)),
  ];
  const box = { west: at(-10, 0)[0], east: at(1000, 0)[0], south: at(0, -10)[1], north: at(0, 100)[1] };
  const estimates = new Map([[10, 14.5], [11, 55], [17, USUAL_HEIGHTS.residential * HEIGHT_SPREAD[2] + 0.5]]);
  const found = buildingFootprints(features, box, estimates);
  assert.ok(found.every((building) => building.kind === undefined), 'none of them a station');
  assert.equal(buildingFootprints([feature(30, { class: 'train_station' }, square(0, 0, 20))], box)[0].kind, 'station');
  assert.deepEqual(
    found.map((building) => [building.id, Math.round(building.height * 100) / 100, building.base, building.known, building.polygons.length]),
    [
      [10, 14.5, 0, false, 1], // read from its shadow: taller than the usual 7.5 × 0.86
      [11, 30, 0, true, 1], // on record: the estimate is not needed
      [15, USUAL_HEIGHTS.religious * HEIGHT_SPREAD[0], 0, false, 1], // only the piece inside the box
      [17, USUAL_HEIGHTS.residential * HEIGHT_SPREAD[2], 0, false, 1], // estimated barely above the usual: left as it is
    ],
  );
  assert.equal(found[0].polygons[0], features[0].geometry.coordinates);
  // Without estimates, and with a list of buildings to leave out.
  assert.deepEqual(buildingFootprints(features, box, null, new Set([10, 15])).map((building) => [building.id, building.known]), [[11, true], [17, false]]);
  assert.deepEqual(buildingFootprints([], box), []);
});

test('buildingsOnStreets finds the buildings a street runs straight through', () => {
  const buildings = buildingFootprints(
    [
      feature(1, {}, square(0, 0, 60)), // a station box under the main street
      feature(2, {}, square(100, 10, 30)), // beside the street
      feature(3, {}, [[at(200, -3), at(221, 18), at(200, 39), at(179, 18), at(200, -3)]]), // only its corner reaches over the street's middle line, for 6 m
      feature(4, { min_height: 6, height: 12 }, square(300, -20, 40)), // a bridge between two buildings, over the street
      { id: 5, properties: {}, geometry: { type: 'Polygon', coordinates: [square(400, -40, 80)[0], square(410, -30, 60)[0]] } }, // the street crosses its courtyard
      { id: 6, properties: {}, geometry: { type: 'MultiPolygon', coordinates: [square(600, 30, 20), square(640, -30, 60)] } }, // one of its two pieces is on the street
      feature(undefined, {}, square(800, -30, 60)), // a building with no number cannot be left out
    ],
    EVERYWHERE,
  );
  const street = [at(-100, 0), at(250, 0), at(1000, 0)];
  // 15 m of street inside is enough. (5: the street is inside it for 20 m, 10 m of building on either side of the courtyard.)
  assert.deepEqual([...buildingsOnStreets(buildings, [street])].sort(), [1, 5, 6]);
  assert.deepEqual([...buildingsOnStreets(buildings, [street], 30)].sort(), [1, 6]);
  assert.deepEqual([...buildingsOnStreets(buildings, [street], 5)].sort(), [1, 3, 5, 6]);
  // Two short streets add up; no streets, no buildings: nothing found.
  assert.deepEqual([...buildingsOnStreets(buildings, [[at(-100, 50), at(10, 50)], [at(50, 50), at(200, 50)]])], [1]);
  assert.equal(buildingsOnStreets(buildings, []).size, 0);
  assert.equal(buildingsOnStreets([], [street]).size, 0);
});

test('cityModelStyle draws one building per outline when it is given the buildings archive', () => {
  const archive = `${BUILDING_STORE}tiles/2026-11-18.0/buildings.pmtiles`;
  const style = cityModelStyle(BASE_STYLE, { buildings: archive });
  const ids = style.layers.map((layer) => layer.id);
  const layer = (id) => style.layers[ids.indexOf(id)];
  assert.equal(style.sources[BUILDING_SOURCE].type, 'vector');
  assert.equal(style.sources[BUILDING_SOURCE].url, `pmtiles://${archive}`);
  assert.match(style.sources[BUILDING_SOURCE].attribution, /Overture Maps Foundation/);
  const drawn = style.layers.filter((item) => item.source === BUILDING_SOURCE).map((item) => `${item.id}:${item['source-layer']}`);
  assert.deepEqual(drawn, ['city-contact:building', 'city-buildings:building', 'city-towers:building', 'city-painted:building', 'city-stations:building', 'city-parts:building_part', 'city-parts-painted:building_part', 'city-roofs:building', 'city-parts-roofs:building_part']);
  assert.ok(ids.indexOf('city-shadows') < ids.indexOf('city-buildings') && ids.indexOf('city-parts-roofs') < ids.indexOf('poi_r1'));
  // A metro station is drawn in its own dress, a screen of pale gold, 12 m tall, and by no other layer.
  const station = layer('city-stations');
  assert.deepEqual(station.paint['fill-extrusion-pattern'].slice(0, 5), ['step', ['zoom'], 'vm-wall:0:station', 16, 'vm-wall:1:station']);
  assert.ok(JSON.stringify(station.filter).includes('["==",["get","class"],"train_station"]'));
  for (const id of ['city-buildings', 'city-towers', 'city-painted']) assert.ok(JSON.stringify(layer(id).filter).includes('["!",["==",["get","class"],"train_station"]]'), id);
  assert.ok(JSON.stringify(station.paint['fill-extrusion-height']).includes('["case",["==",["get","class"],"train_station"],12,'));

  // What is underground is left out everywhere, and a building with parts is drawn as its parts.
  for (const id of ['city-contact', 'city-buildings', 'city-towers', 'city-painted', 'city-stations', 'city-parts', 'city-parts-painted', 'city-roofs', 'city-parts-roofs']) {
    assert.ok(JSON.stringify(layer(id).filter).includes('["!=",["get","is_underground"],true]'), id);
  }
  for (const id of ['city-buildings', 'city-towers', 'city-painted', 'city-roofs']) assert.ok(JSON.stringify(layer(id).filter).includes('["!=",["get","has_parts"],true]'), id);

  // Height: the one the app read from the photo if there is one, else the record, else the usual, varied by the building's number.
  const height = layer('city-buildings').paint['fill-extrusion-height'];
  assert.deepEqual(height.slice(0, 3), ['case', ['!=', ['feature-state', 'h'], null], ['to-number', ['feature-state', 'h'], 0]]);
  const recorded = JSON.stringify(height[3]);
  assert.ok(recorded.includes('["get","height"]') && recorded.includes('["get","num_floors"]') && recorded.includes('"residential",7.5') && recorded.includes('["%",["abs",["id"]],5]'), recorded);
  assert.deepEqual(layer('city-buildings').paint['fill-extrusion-base'], ['to-number', ['get', 'min_height'], 0]);
  assert.deepEqual(layer('city-roofs').paint['fill-extrusion-base'], height);
  assert.deepEqual(layer('city-roofs').paint['fill-extrusion-height'], ['+', height, 1.2]);
  // Which buildings are towers is settled by the record, so it can be a filter.
  assert.ok(!JSON.stringify(layer('city-towers').filter).includes('feature-state'));
  assert.deepEqual(layer('city-towers').filter.at(-1).slice(0, 1), ['>=']);
  assert.deepEqual(layer('city-buildings').paint['fill-extrusion-pattern'].slice(0, 3), ['step', ['zoom'], 'vm-wall:0:low']);
  assert.deepEqual(layer('city-painted').paint['fill-extrusion-color'], ['to-color', ['get', 'facade_color'], '#f3f1ec']);

  // Without the archive the street map's own buildings are drawn, and nothing asks for the archive.
  const plain = cityModelStyle(BASE_STYLE);
  assert.equal(plain.sources[BUILDING_SOURCE], undefined);
  assert.ok(plain.layers.every((item) => item.source !== BUILDING_SOURCE));
  assert.equal(plain.layers.find((item) => item.id === 'city-parts'), undefined);
});

test('cityModelStyle traces the metro under ground and shows more of the photo close up', () => {
  const style = cityModelStyle(BASE_STYLE);
  const ids = style.layers.map((layer) => layer.id);
  const under = style.layers[ids.indexOf('city-rail-under')];
  // Over the streets it runs beneath, under the buildings; broken, and faint.
  assert.ok(ids.indexOf('city-road-big') < ids.indexOf('city-rail-under') && ids.indexOf('city-rail-under') < ids.indexOf('city-contact'));
  assert.ok(JSON.stringify(under.filter).includes('["==",["get","brunnel"],"tunnel"]') && JSON.stringify(under.filter).includes('["!",["has","service"]]'));
  assert.ok(under.paint['line-opacity'] < 0.5 && Array.isArray(under.paint['line-dasharray']));
  assert.ok(JSON.stringify(style.layers[ids.indexOf('city-rail')].filter).includes('["!",["==",["get","brunnel"],"tunnel"]]'));
  const ground = style.layers[ids.indexOf('city-ground')].paint;
  assert.deepEqual(ground['raster-opacity'], ['interpolate', ['linear'], ['zoom'], 15.5, 0.6, 17.5, 0.82]);
  assert.ok(ground['raster-saturation'].at(-1) > ground['raster-saturation'].at(-3));
});
