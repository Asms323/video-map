# A relay for the flight radar

The flight radar of the app hears live aircraft from the OpenSky Network,
which a web page may ask directly. It has few receivers over Saudi Arabia,
and allows a phone without an account about 400 questions a day.

adsb.fi, another network of volunteers' receivers, hears many more aircraft
round the Gulf. But a web page may not ask it: its answers do not say that
other sites may read them. This relay asks it for the app. Each answer is
kept for 5 seconds and given to everyone who asks about the same place
meanwhile.

**adsb.fi's terms:** its data is for personal, non-commercial use only, and
is to be credited to adsb.fi with a link to its home page
(https://adsb.fi). The app credits it on every flight it shows from it.
Its public questions are limited to one a second; the relay asks it at most
once every 5 seconds for any one place.

Neither network hears the aircraft low over King Khalid International
Airport: none has a receiver in Riyadh. (A receiver at home, a small
computer and a radio stick with an aerial, would hear them, and could feed
adsb.fi.)

## Setting it up (free, about ten minutes)

1. Make a free account at Cloudflare: https://dash.cloudflare.com/sign-up
2. In the dashboard: **Workers & Pages**, then **Create**, then **Create
   Worker**. Give it a name, such as `flights`, and **Deploy**.
3. **Edit code**: replace all the code there with the whole of `worker.js`
   from this folder, and **Deploy** again.
4. Its address is shown on its page, such as
   `https://flights.your-name.workers.dev`. Open
   `https://flights.your-name.workers.dev/v3/lat/24.71/lon/46.68/dist/250`
   in a browser: a page of aircraft (JSON) means it works.
5. In the app: **Settings**, then **Live flights relay**: paste the address
   (without anything after `.dev`). The radar now hears its flights from
   adsb.fi, every 5 seconds.

Cloudflare's free plan allows 100,000 requests a day: a phone asks the relay
every 5 seconds while the radar is shown, so some 720 an hour.
