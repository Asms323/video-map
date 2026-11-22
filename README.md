# Video Map

Video and a live, detailed map of where you are, on one screen. A web app for
the phone: no App Store, no Apple developer account, no Mac.

## What it does

**Video**

- From the phone (Photos or Files), from a YouTube link, or from a direct link
  to a video file or stream (`.mp4`, `.m3u8`, …).

**Map**

- A real map of the whole world, with street and place names in the local
  script and in Latin letters.
- **3D City**, the look it opens with: the city as an **isometric** scale
  model. It is seen corner-on from the classic isometric angle, through a lens
  so long that parallel streets stay parallel. Every building is a block of
  its recorded height with rows of windows on its walls and a plain roof:
  white with a window in each bay for ordinary buildings, bands of glass for
  towers, and the recorded colour where mappers noted one. They stand on the
  real ground, with grey roads at their real widths.
- **Moving traffic.** Cars, vans, lorries and buses drive the streets, and
  trains run on the tracks above ground. They keep to the real lanes, drive on
  the right, obey one-way streets, queue behind each other, disappear into
  tunnels, and are busier in the rush hours than at night. This is a
  simulation to bring the model to life, **not live traffic**: where each
  vehicle is, is made up. It can be switched off under the map options.
- **Trees where they really stand.** The app reads the satellite photo under
  the city for dark green crowns and stands a tree at each one, sized to its
  crown, with its shade on the ground.
- **Heights from shadows.** Most ordinary buildings have no height on record
  and would all be drawn 5 m tall. The app looks up the day the satellite
  photo was taken, works out where the sun stood, measures each building's
  shadow in the photo and stands the building up to match. An estimate; see
  the limits below. Both readings can be switched off under the map options.
- **The ground in detail**, all from the map data: bridges and flyovers lying
  over the roads beneath them, tunnels as a faint trace, metro and railway
  lines, footpaths, lawns and playing fields.
- **Real sunlight.** The model is lit from where the sun actually is at that
  place and time, and every building casts the shadow it casts right now:
  long in the morning and evening, short at noon, none after sunset.
- Four more looks: **Streets** (colours and icons), **Night**, **Satellite**
  (real photos with the names on top) and **Detailed** (the classic
  OpenStreetMap picture). **Auto** shows 3D City by day and Night when the
  phone is in dark mode.
- Your position, direction of travel and speed. The round button switches
  between a view that does not turn (isometric in the 3D city, north-up in
  the other looks) and a **driving view** where the road ahead points up.
- The **name of the road** you are on, and its **speed limit** where
  OpenStreetMap has one. The speed turns red when you are over it.
- **Places** you choose to mark: fuel, charging, parking, food and coffee,
  mosques and other places of worship, health, banks and ATMs, shopping, hotels.
- **Tap any place** for what is known about it: opening hours, phone, website,
  address, fuel types, charging plugs, parking fee and more.
- **Search** by name or address. **Press and hold** the map to drop a pin.
- **Route** to a place: the line on the map, the distance and the driving
  time. "Open in Maps" hands the place to the phone's own maps app for
  turn-by-turn directions.
- The **weather** where you are. Tap your own dot for your coordinates,
  altitude and the nearest address.

**Screen**

- One bar between video and map: show video, map or both, and drag it to
  resize. Upright the two are stacked; sideways they sit side by side.
- Keeps the screen on, remembers your choices, and opens without a connection
  once it has been opened before (the map and online video still need the
  internet).

## Where the information comes from

Everything is free and needs no account or key.

| What | From | Notes |
| --- | --- | --- |
| Street map, names, places, road names | [OpenFreeMap](https://openfreemap.org), built from [OpenStreetMap](https://www.openstreetmap.org/copyright) | Drawn on the phone by [MapLibre](https://maplibre.org) |
| Satellite photos, and the ground under the 3D city | Esri World Imagery | © Esri, Maxar, Earthstar Geographics. Also read on the phone for trees and shadows, and asked once per area for the day the photo was taken |
| Detailed map picture | OpenStreetMap tile servers | [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/) |
| Place details, speed limits | [Overpass API](https://overpass-api.de) (OpenStreetMap data) | One small question per place tapped; one per area for limits |
| Search, nearest address | [Photon](https://photon.komoot.io) (OpenStreetMap data) | |
| Routes | [OSRM](https://project-osrm.org) demo server (OpenStreetMap data) | |
| Weather | [Open-Meteo](https://open-meteo.com) | Asked at most every half hour |

These public services are run for light, fair use, which one person's app is.
They can be slow or briefly unavailable; the app then simply leaves that piece
of information out and carries on.

Not included, because no open source for it exists: live traffic. The moving
vehicles in the 3D city are a simulation on the real street network and say
nothing about the real traffic on a road.

The map is only as complete as OpenStreetMap is where you are. Speed limits in
particular are missing on many roads. Building heights are recorded for
landmark towers but for few ordinary buildings; those without one are drawn as
low blocks, and a tower's special shape is not known, only its outline and
height.

The windows are drawn, not recorded: one row for every 3 m of height, because
the map data does not say how many floors or windows a building really has.

Heights read from shadows are rough, and mostly on the low side:

- A shadow can only be measured where it ends on open ground. In a dense
  street it lands on the building next door, and all that can be said is "at
  least this tall". A building that cannot be measured is taken to be about
  as tall as the measured ones around it, or left at 5 m if there are none.
- The time of day of the photo is not published, only the day. The app
  assumes the usual pass of a photo satellite, an hour and a half before or
  after midday, and picks whichever fits the shadows.
- Where the map draws a whole block as one building, as in many residential
  districts of Riyadh, there is no single building to measure.
- A height someone recorded in OpenStreetMap is never overruled, and no
  building is made lower than the map has it.

Trees are found by colour, so a dark green roof or awning can be mistaken for
one and a tree in deep shade can be missed. Every tree is drawn as the same
simple shape; palms and other kinds are not told apart.

The sunlight is worked out on the phone from the date, the time and the place;
nothing is downloaded for it. Shadows are those of flat-roofed blocks on level
ground: they fall on streets and open ground, not across the walls and roofs
of other buildings, and clouds are not taken into account.

## Put it online (free, from a phone)

The app is plain files, so GitHub Pages can host it.

1. Open this repository on github.com in the phone's browser.
2. **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   pick the branch that holds these files and the folder `/ (root)`, then
   **Save**.
4. After a minute the page shows the address, like
   `https://YOUR-NAME.github.io/REPOSITORY/`.

GitHub Pages is free for public repositories. Anyone with the address can open
the app, but it holds nothing personal: your position, settings and recent
links stay on your own phone. Your position is sent only as part of the
questions above (the weather, speed limits and addresses near you).

## Put it on the iPhone Home Screen

1. Open the address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the new icon. It runs full screen, like an app.
4. Tap **Show my location** and allow location when the phone asks.

## Using it in the car

This is a phone app. It does **not** appear as an app on the CarPlay screen:
Apple only allows that for approved apps built with a paid developer account,
and does not allow video and a map together in one CarPlay app.

What works:

- **Phone in a holder.** Turn it sideways for video and map side by side.
- **A screen-mirroring app.** If you use an app that mirrors the iPhone screen
  to the car display, it shows this app like anything else on the phone.
- **AirPlay.** Some new cars can show video from the phone on the car display
  while parked.

Watch video only when parked, or let a passenger watch.

## Limits

- A link has to be YouTube or point straight at a video file or stream. Pages
  from other sites, and films from services such as Netflix, cannot be played.
- Some YouTube videos do not allow playing outside youtube.com.
- A video picked from the phone has to be chosen again the next time the app
  opens; web apps are not allowed to remember files.
- Speed and direction come from the phone's GPS. Indoors, or standing still,
  the speed shows a dash.
- The route is an overview, not navigation: it does not follow you or re-plan.

## For developers

No build step. The folder is the site.

```
index.html              the page
css/app.css             styles
js/app.js               the app: layout, video, location, search, place details
js/map.js               the map: styles, markers, following, taps
js/life.js              the simulated traffic: street network, vehicles, trains
js/scene.js             the layer that draws the traffic into the 3D scene
js/sight.js             reading the satellite photo: shadows to heights, trees
js/services.js          the open data services
js/lib.js               everything that needs no browser: parsing, distances,
                        road matching, place categories, map styles, the
                        sun's position and the shadows it casts
sw.js                   offline start
manifest.webmanifest    Home Screen name and icons
icons/                  made by tools/make_icons.py
vendor/maplibre/        MapLibre GL JS 5.24.1 and the right-to-left text add-on
tests/                  unit tests, browser test, small local server
```

Run it locally (location needs `localhost` or HTTPS):

```bash
node tests/serve.mjs
```

Unit tests, with Node 22 or newer:

```bash
node --test tests/lib.test.mjs
```

Browser test, which needs Playwright with Chromium installed:

```bash
node tests/e2e.mjs
```

The browser test needs no internet. The street map is replayed from
`tests/fixtures/map.har`, a recording of the real OpenFreeMap service around
the test route in Riyadh; the other services are answered by stand-ins in the
test file. To refresh the recording from the live service:

```bash
RECORD=1 node tests/e2e.mjs
```

The test covers Chromium only; check changes on a real iPhone in Safari too.

When you change the app, raise `VERSION` in both `js/app.js` and `sw.js` so
phones drop their saved copy.

## Licenses of what is included

- MapLibre GL JS: BSD 3-Clause (`vendor/maplibre/LICENSE.txt`).
- mapbox-gl-rtl-text: BSD 2-Clause, with ICU (`vendor/maplibre/LICENSE-rtl-text.md`).
- `tests/fixtures/map.har` holds map data © OpenStreetMap contributors (ODbL),
  as served by OpenFreeMap (© OpenMapTiles).
