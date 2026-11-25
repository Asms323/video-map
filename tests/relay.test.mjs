import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import relay from '../tools/relay/worker.js';

// The relay for the flight radar (tools/relay), with adsb.fi answered by a stand-in here.
test('the relay asks adsb.fi round the place asked about, once in five seconds for everyone, and lets the app read the answer', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 25, 13, 0, 0) });
  const realFetch = globalThis.fetch;
  const asked = [];
  let fails = false;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    if (fails) throw new Error('no answer');
    return new Response(JSON.stringify({ ac: [{ hex: '7104c1', flight: 'KNE423  ', lat: 24.6, lon: 46.6, alt_baro: 36000 }], now: Date.now() }), { status: 200 });
  };
  try {
    const ask = (path, method = 'GET') => relay.fetch(new Request(`https://relay.example${path}`, { method }));
    const first = await ask('/v3/lat/24.71/lon/46.68/dist/250');
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('access-control-allow-origin'), '*', 'readable by the app');
    assert.equal((await first.json()).ac[0].flight, 'KNE423  ');
    // (The place to a tenth of a degree.)
    assert.deepEqual(asked, ['https://opendata.adsb.fi/api/v3/lat/24.7/lon/46.7/dist/250']);
    // Asked again about much the same place within five seconds: the same answer, adsb.fi not asked again.
    mock.timers.tick(3000);
    assert.equal((await ask('/v3/lat/24.72/lon/46.69/dist/250')).status, 200);
    assert.equal(asked.length, 1);
    // Five seconds on: asked afresh. No further than 250 nautical miles.
    mock.timers.tick(2500);
    await ask('/v3/lat/24.7/lon/46.7/dist/900');
    assert.equal(asked.at(-1), 'https://opendata.adsb.fi/api/v3/lat/24.7/lon/46.7/dist/250');
    assert.equal(asked.length, 2);
    // Anything else is turned away (and still readable, so the app can tell why); a check before a question is answered.
    const wrong = await ask('/anything');
    assert.ok(wrong.status === 404 && wrong.headers.get('access-control-allow-origin') === '*');
    assert.equal((await ask('/v3/lat/24.7/lon/46.7/dist/250', 'OPTIONS')).status, 204);
    assert.equal((await ask('/v3/lat/99.0/lon/46.7/dist/250')).status, 400);
    // adsb.fi not answering: a 502, and nothing kept.
    mock.timers.tick(6000);
    fails = true;
    assert.equal((await ask('/v3/lat/24.7/lon/46.7/dist/250')).status, 502);
  } finally {
    globalThis.fetch = realFetch;
    mock.timers.reset();
  }
});
