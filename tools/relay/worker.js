// A relay for the app's live flights. It asks adsb.fi (https://adsb.fi) for the aircraft round a place,
// and hands the answer on to the app, which may not ask adsb.fi itself: a web page may read another site's
// answers only where that site says so, and adsb.fi's do not. Each answer is kept for 5 seconds and given
// to everyone who asks about that place meanwhile, so that adsb.fi is asked once for all of them.
//
// adsb.fi's data is for personal, non-commercial use only, and is to be credited to adsb.fi with a link to
// its home page (the app does both). Its public questions are limited to one a second.
//
// It runs on Cloudflare Workers, on the free plan: see README.md beside this file.

const UPSTREAM = 'https://opendata.adsb.fi/api/v3';
const KEEP_MS = 5000;
const MOST_NM = 250; // the furthest adsb.fi looks round a place
const HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'cache-control': 'public, max-age=5',
  'content-type': 'application/json',
};
const kept = new Map(); // the answers kept, by what was asked: { at, status, body }

/** An answer of the relay's own: words in a little JSON, with a status. */
const say = (status, error) => new Response(JSON.stringify({ error }), { status, headers: HEADERS });

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    if (request.method !== 'GET') return say(405, 'Only GET');
    const asked = /^\/v3\/lat\/(-?\d{1,2}(?:\.\d+)?)\/lon\/(-?\d{1,3}(?:\.\d+)?)\/dist\/(\d{1,3})\/?$/.exec(new URL(request.url).pathname);
    if (!asked) return say(404, 'Ask /v3/lat/<latitude>/lon/<longitude>/dist/<nautical miles, up to 250>');
    // The place to a tenth of a degree, so that those who ask about much the same place share one answer.
    const lat = Math.round(Number(asked[1]) * 10) / 10;
    const lon = Math.round(Number(asked[2]) * 10) / 10;
    const dist = Math.min(Math.max(Number(asked[3]), 1), MOST_NM);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return say(400, 'No such place');
    const upstream = `${UPSTREAM}/lat/${lat}/lon/${lon}/dist/${dist}`;
    const now = Date.now();
    for (const [key, one] of kept) if (now - one.at > KEEP_MS) kept.delete(key);
    let answer = kept.get(upstream);
    if (!answer) {
      try {
        const reply = await fetch(upstream, { headers: { accept: 'application/json' }, cf: { cacheTtl: 5, cacheEverything: true } });
        answer = { at: now, status: reply.ok ? 200 : reply.status, body: await reply.text() };
      } catch {
        return say(502, 'adsb.fi did not answer');
      }
      if (answer.status === 200) kept.set(upstream, answer);
    }
    return new Response(answer.body, { status: answer.status, headers: HEADERS });
  },
};
