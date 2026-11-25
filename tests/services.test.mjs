import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// The feed of live aircraft, asked with a clock and a network of the test's own.
test("the live aircraft: asked every 15 s while there are any, every 2 minutes while none, and never past the day's allowance", async () => {
  const start = Date.UTC(2026, 10, 25, 20, 0, 0); // eleven at night in Riyadh
  mock.timers.enable({ apis: ['Date'], now: start });
  const stored = new Map();
  const realFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) };
  const asked = [];
  let answer = null;
  let status = 200;
  globalThis.fetch = async (url) => {
    asked.push(new URL(String(url)));
    return { ok: status === 200, status, json: async () => answer };
  };
  try {
    const { aircraftFeed, aircraftOverRiyadh } = await import('../js/services.js');
    const at = () => Date.now() / 1000;
    const flying = () => ({ time: Math.floor(at()) - 4, states: [['7104c1', 'KNE423  ', 'Saudi Arabia', Math.floor(at()) - 5, Math.floor(at()) - 4, 46.6, 24.6, 10900, false, 230, 300, 0, null, 11000, null, false, 0]] });
    assert.equal(aircraftFeed().heard, null);

    // Asked: one aircraft, at its height above Riyadh's ground; for a box no larger than one question pays for.
    answer = flying();
    const first = await aircraftOverRiyadh();
    assert.ok(first.planes.length === 1 && first.planes[0].callsign === 'KNE423' && first.planes[0].alt === 11000 - 625 && first.source === 'The OpenSky Network');
    const box = Object.fromEntries(asked[0].searchParams);
    const square = (box.lamax - box.lamin) * (box.lomax - box.lomin);
    assert.ok(square <= 25 && box.lamin <= 24.71 - 1.3 && box.lamax >= 24.71 + 1.3, `${square} square degrees`);
    assert.ok(aircraftFeed().heard === 'aircraft' && aircraftFeed().asked === 1);
    // Not again at once; again 15 s on.
    assert.equal(await aircraftOverRiyadh(), null);
    mock.timers.tick(14000);
    assert.equal(await aircraftOverRiyadh(), null);
    mock.timers.tick(1000);
    assert.ok((await aircraftOverRiyadh()).planes.length === 1 && asked.length === 2);

    // An empty sky: not asked about again for two minutes.
    mock.timers.tick(15000);
    answer = { time: Math.floor(at()), states: null };
    assert.equal((await aircraftOverRiyadh()).planes.length, 0);
    assert.equal(aircraftFeed().heard, 'none');
    mock.timers.tick(60000);
    assert.equal(await aircraftOverRiyadh(), null);
    mock.timers.tick(60000);
    answer = flying();
    assert.equal((await aircraftOverRiyadh()).planes.length, 1);
    assert.equal(asked.length, 4);

    // The day's allowance: 380 questions (of the 400 the feed gives one with no account), counted on the
    // phone so that a reload does not forget them; then none until the next day, by the clock in Greenwich.
    stored.set('video-map:aircraft-asked', JSON.stringify({ day: '2026-11-25', count: 379 }));
    mock.timers.tick(15000);
    assert.ok(await aircraftOverRiyadh());
    assert.equal(asked.length, 5);
    mock.timers.tick(15000);
    assert.equal(await aircraftOverRiyadh(), null);
    assert.equal(asked.length, 5, 'not asked: the allowance is spent');
    assert.ok(aircraftFeed().heard === 'spent' && aircraftFeed().again === Date.UTC(2026, 10, 26));
    mock.timers.tick(Date.UTC(2026, 10, 26, 0, 0, 1) - Date.now());
    answer = flying();
    assert.ok(await aircraftOverRiyadh());
    assert.ok(asked.length === 6 && aircraftFeed().asked === 1, 'a new day: counted afresh');

    // The feed says the allowance is spent (429): not asked again until the next day.
    mock.timers.tick(15000);
    status = 429;
    assert.equal(await aircraftOverRiyadh(), null);
    assert.ok(aircraftFeed().heard === 'spent' && aircraftFeed().again === Date.UTC(2026, 10, 27));
    // Otherwise not answering: asked again in ten minutes.
    mock.timers.tick(Date.UTC(2026, 10, 27, 0, 0, 1) - Date.now());
    status = 503;
    assert.equal(await aircraftOverRiyadh(), null);
    assert.ok(aircraftFeed().heard === 'failed' && aircraftFeed().again === Date.now() + 10 * 60 * 1000);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.localStorage;
    mock.timers.reset();
  }
});

test('with a relay of its own set, the live aircraft come from adsb.fi through it, every 5 s, round the place asked about', async () => {
  const start = Date.UTC(2026, 10, 25, 20, 0, 0);
  mock.timers.enable({ apis: ['Date'], now: start });
  const realFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return { ok: true, status: 200, json: async () => ({ now: Date.now(), ac: [{ hex: '7104c1', flight: 'KNE423  ', t: 'A20N', r: 'HZ-NS41', lat: 24.6, lon: 46.6, alt_baro: 36000, gs: 450, track: 297, seen_pos: 1 }] }) };
  };
  try {
    const { aircraftFeed, liveAircraft, setFlightServer } = await import('../js/services.js?relay');
    // (Only an address that begins with https:// is taken; a trailing slash is dropped.)
    assert.equal(setFlightServer('http://example.org'), null);
    assert.equal(setFlightServer('https://relay.example/'), 'https://relay.example');
    const found = await liveAircraft({ lat: 25.123, lng: 47.456, wide: true });
    assert.equal(asked[0], 'https://relay.example/v3/lat/25.12/lon/47.46/dist/250');
    assert.ok(found.source === 'adsb.fi' && found.planes[0].registration === 'HZ-NS41' && aircraftFeed().source === 'adsb.fi');
    assert.equal(await liveAircraft(), null, 'not again at once');
    mock.timers.tick(5000);
    assert.ok(await liveAircraft());
    assert.equal(asked.length, 2);
    // Without it, the OpenSky Network again, for a box as wide as the radar shows (one question's worth: under 25 square degrees).
    setFlightServer('');
    await liveAircraft({ lat: 25.123, lng: 47.456, wide: true });
    const box = Object.fromEntries(new URL(asked.at(-1)).searchParams);
    assert.ok(asked.at(-1).startsWith('https://opensky-network.org/') && (box.lamax - box.lamin) * (box.lomax - box.lomin) <= 25 && box.lamin === '22.9' && box.lomax === '50.1', JSON.stringify(box));
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.localStorage;
    mock.timers.reset();
  }
});
