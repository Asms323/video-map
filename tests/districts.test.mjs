import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHARACTERS, characterAt, districtAt, districtCount, kindByPlace } from '../js/districts.js';
import { DISTRICT_AREAS, DISTRICT_SPOTS } from '../js/districts-data.js';

test('every kind of district has its look: colours for its walls, its lamps, and how many houses are walled', () => {
  assert.deepEqual(Object.keys(CHARACTERS).sort(), ['business', 'campus', 'centre', 'diplomatic', 'east', 'heritage', 'industrial', 'midcentury', 'north', 'old', 'open', 'park', 'south', 'villa', 'wadi']);
  for (const [kind, look] of Object.entries(CHARACTERS)) {
    assert.ok(look.walls.length >= 2 && look.walls.every((colour) => /^#[0-9a-f]{6}$/.test(colour)), kind);
    assert.equal(typeof look.led, 'boolean', kind);
    assert.ok(look.fenced >= 0 && look.fenced <= 1 && /^#[0-9a-f]{6}$/.test(look.fence), kind);
  }
  // The new north has the white lamps and nearly every house behind a wall; the old town neither.
  assert.ok(CHARACTERS.north.led && CHARACTERS.north.fenced >= 0.8 && !CHARACTERS.old.led && CHARACTERS.old.fenced < 0.3);
  // The mud-brick quarters are the colour of earth: redder than they are blue by far.
  for (const colour of CHARACTERS.heritage.walls) assert.ok(parseInt(colour.slice(1, 3), 16) - parseInt(colour.slice(5, 7), 16) > 60, colour);
});

test('the table of districts: some 160 areas and 60 places, each of a known kind or of none', () => {
  assert.deepEqual(districtCount(), { areas: DISTRICT_AREAS.length, spots: DISTRICT_SPOTS.length });
  assert.ok(DISTRICT_AREAS.length > 140 && DISTRICT_SPOTS.length > 40);
  for (const [name, ar, kind, wide, rings] of DISTRICT_AREAS) {
    assert.ok(name && ar && (kind === null || Object.hasOwn(CHARACTERS, kind)) && (wide === 0 || wide === 1), name);
    for (const ring of rings) {
      assert.ok(ring.length >= 8 && ring.length % 2 === 0 && ring.every(Number.isInteger), name);
      // In Riyadh: between 46.25 and 47.2 E, 24.25 and 25.2 N.
      for (let i = 0; i < ring.length; i += 2) assert.ok(ring[i] > 2500 && ring[i] < 12000 && ring[i + 1] > 2500 && ring[i + 1] < 12000, name);
    }
  }
  for (const [name, ar, kind, east, north] of DISTRICT_SPOTS) assert.ok(name && ar && (kind === null || Object.hasOwn(CHARACTERS, kind)) && Number.isInteger(east) && Number.isInteger(north), name);
  assert.ok(DISTRICT_AREAS.filter((row) => row[2] === null).length + DISTRICT_SPOTS.filter((row) => row[2] === null).length < 8, 'nearly every district has its kind by name');
});

test('districtAt: the district a place lies in, and what kind of place that is', () => {
  const places = [
    ['the PIF Tower', 46.6415, 24.7637, 'business', 'KAFD'],
    ['the Diplomatic Quarter', 46.624, 24.681, 'diplomatic', null],
    ['Al Malaz', 46.734, 24.663, 'midcentury', 'Al Malaz'],
    ['Hittin', 46.599, 24.762, 'north', 'Hittin'],
    ['As-Suwaidi', 46.673, 24.592, 'south', 'As-Suwaidi'],
    ['Al Bujairi in Ad Diriyah', 46.575, 24.736, 'heritage', 'Albujairi'],
    ['Al Faisaliah, in Al Olaya', 46.685, 24.6902, 'centre', null],
    ['the Masmak', 46.7134, 24.6312, 'old', null],
    ['Al Yasmin', 46.644, 24.823, 'north', 'Al Yasmin'],
    ['Al Rawdah', 46.766, 24.734, 'east', 'Al Rawdah'],
    ['the old industrial quarter', 46.748, 24.642, 'industrial', null],
    ['King Saud University', 46.624, 24.725, 'campus', 'King Saud University'],
    ['Al Murabba', 46.71, 24.66, 'midcentury', null],
    ['Ash Shifa', 46.696, 24.562, 'south', 'Ash Shifa'],
  ];
  for (const [what, lng, lat, kind, name] of places) {
    const found = districtAt(lng, lat);
    assert.equal(found.kind, kind, `${what}: ${JSON.stringify(found)}`);
    if (name) assert.equal(found.name, name, what);
    assert.equal(characterAt(lng, lat), CHARACTERS[kind]);
  }
  // A place in a district is that district's, not the wide area's that holds the district too.
  assert.ok(!/Municipality|بلدية/.test(`${districtAt(46.644, 24.823).name} ${districtAt(46.644, 24.823).ar}`));
  // Ground no district claims goes by where it lies: the old town round the Masmak, then the four quarters.
  assert.deepEqual(districtAt(46.3, 25.1), { name: null, ar: null, kind: 'north' });
  assert.equal(kindByPlace(46.715, 24.635), 'old');
  assert.equal(kindByPlace(46.9, 24.7), 'east');
  assert.equal(kindByPlace(46.7, 24.5), 'south');
  assert.equal(kindByPlace(46.5, 24.7), 'open');
  assert.equal(kindByPlace(46.68, 24.71), 'villa');
});
