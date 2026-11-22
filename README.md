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
  so long that parallel streets stay parallel. **Every building stands on its
  own outline**, a house at a time, with rows of windows on its walls: white
  with a window in each bay for ordinary buildings, bands of glass for towers,
  and the recorded colour where one is noted. They stand on the real ground,
  with grey roads at their real widths.
- **Riyadh's landmarks, modelled by hand.** Kingdom Centre with its arch and
  sky bridge, Al Faisaliah with its golden globe, the PIF Tower, Burj Rafal,
  the twisting Al Majdoul Tower, the TV Tower, the striped water tower and
  the KAFD metro station each have their own shape, built from reference
  photos on the building's real outline, in place of a plain block.
- **Bridges you can drive over.** Flyovers, interchange ramps and metro
  viaducts are built in 3D: a deck with parapets on piers, with the traffic
  and the trains up on it. The Wadi Laban Bridge on the Western Ring Road has
  its two masts and fans of cables.
- **Metro stations that look like stations.** A station building wears the
  golden screen and vaulted roof of the Riyadh Metro, with covered footbridges
  over the road to its entrances; an entrance to an underground station gets
  a glass pavilion with a sign.
- **Chain stores in their own colours.** A branch of a chain the app knows
  (some fifty: restaurants, cafés, supermarkets, fuel stations, banks, shops)
  wears that chain's colours: its own building painted and banded, a shop
  front under a coloured band where it shares a building, a canopy with pumps
  at a fuel station. Colours and shapes only; no logos or names are drawn.
- **Traffic on the real streets.** Cars, vans and lorries drive the streets:
  they keep to the lanes, drive on the right, obey one-way streets, queue
  behind each other, turn at junctions, disappear into tunnels, and are busier
  in the rush hours than at night. Cars stand parked along the kerbs of
  residential streets. This is a simulation to bring the model to life, **not
  live traffic**: where each vehicle is, is made up. It can be switched off
  under the map options.
- **Buses where buses run.** A bus only drives along a street that has a bus
  stop on the map (and on along the same street between stops), in the lane by
  the kerb, and pulls in at every stop on its side of the street, where a
  shelter stands. About one bus every ten minutes each way, from 05:00 to
  midnight, and none at night.
- **The metro on its lines, by its timetable's rhythm.** Trains run on the
  metro tracks the map shows: every four minutes in the rush hours and every
  seven and a half otherwise, from 05:30 to midnight (in Riyadh from 10:00 on
  Fridays), keeping to the right-hand track and standing at each station.
  Under ground a train is a faint blue mark that moves along the tunnel's
  trace. See the limits below for what this is and is not.
- **Trees where they really stand.** The app reads the satellite photo under
  the city for dark green crowns and stands a tree at each one, sized to its
  crown, with its shade on the ground. Never on a road, a track or a building.
- **Heights from shadows.** Few ordinary buildings have a height on record.
  The app looks up the day the satellite photo was taken, works out where the
  sun stood, measures each building's shadow in the photo and stands the
  building up to match. An estimate; see the limits below. Both readings can
  be switched off under the map options.
- **Roofs with something on them.** A stair head and a water tank on a house,
  rows of cooling plant on a large roof. Made up, like the windows; see below.
- **The ground in detail**: the satellite photo itself, shown stronger the
  closer you look, and from the map data tunnels as a faint trace, metro and
  railway lines, footpaths, lawns and playing fields.
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
| One outline for every building in the 3D city | [Overture Maps](https://overturemaps.org) buildings, which join OpenStreetMap with outlines traced from satellite photos by Esri's community, Google and Microsoft | Read a piece at a time, with [PMTiles](https://github.com/protomaps/PMTiles), out of the one archive file Overture publishes each month. The newest release is looked up once a day |
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

**Buses and metro: the real hours and rhythm, not the real minute.** Riyadh
publishes when its buses and metro run and how often, but no timetable or
live positions as open data (the city's open data site that might have held
one is no longer online). So the app keeps to what is published:

- Metro: 05:30 to midnight, from 10:00 on Fridays; a train every four minutes
  in the rush hours (06:30 to 09:30 and 16:00 to 20:00) and every seven and a
  half minutes otherwise. Every line is given the same rhythm.
- Buses: 05:00 to midnight, about one every ten minutes each way along a
  street. Bus routes are not in the map data, only the stops, so a bus follows
  the streets that have stops and is taken off the road when it strays from
  them.
- A given end of a line sends its trains at the same minutes past the hour
  every time you look, so the picture is steady, but those are not the minutes
  of the real trains. Do not catch a train by it.
- Other cities get the same hours, without the late Friday start.

The map is only as complete as its sources are where you are. Speed limits in
particular are missing on many roads. Bus stops are shown where OpenStreetMap
has them, which in Riyadh is many but not all.

Buildings. Their outlines are real: recorded by mappers, or traced from
satellite photos by machine, which is why a few are a little off. What the
outlines do not say is made up to look right:

- Height. Landmark towers have theirs on record. Other buildings get the usual
  height for their kind (a house about 7.5 m), varied a little from one to the
  next, unless their shadow in the photo shows them to be taller.
- Windows: one row for every 3 m of height.
- Roofs: all flat, with a stair head, a tank or cooling plant placed by chance,
  the same every time for the same building.
- A tower's special shape is not known, only its outline and height (the
  landmarks below are the exception). A building recorded in parts is drawn
  as its parts, and where the parts do not cover all of it the rest shows as
  the photo on the ground.

Landmarks. Eight of Riyadh's are modelled by hand, as stacks of thin slabs
that follow the building's shape: Kingdom Centre, Al Faisaliah Tower, the PIF
Tower, Burj Rafal, Al Majdoul Tower, the TV Tower, the water tower and the
KAFD metro station. Position, outline and height are the real ones; the shape
was worked out from photos on Wikimedia Commons and from what is published
about each building, and simplified: a model, not a survey. The water tower
was built from memory, with no photo to check it against. The other tall
buildings of the city (the towers of the financial district among them)
remain plain blocks.

Bridges. Which stretches of road and track are on a bridge, and which pass
over which, is real. How high a bridge is, is not recorded: a road deck is
taken to be 6.5 m up and a metro viaduct 8.5 m, each level above another
5.5 m more, with a ramp down to the ground at either end, and a pier every
30 m. The ground itself is flat in this model, so a bridge over a valley, as
at Wadi Laban, stands no higher than a flyover. The Wadi Laban Bridge's masts
and cables are set out from a photo and from its published span of 405 m.

Metro stations. Where a station building and its entrances are, is real. The
golden screen, the vaulted roof, the footbridges and the pavilions are the
typical Riyadh Metro look, the same for every station; only the KAFD station
has its own model. A footbridge runs straight from the station to an entrance
across the road, which is about right but not surveyed.

Chain stores. Which branch is where comes from the map's places; the colours
are each chain's own, most of them looked up with
[Brandfetch](https://brandfetch.com) and a few set from a photo or from
memory, so one or two may be a shade off. What a branch really looks like is
not known: every branch of a chain gets the same simple dress, and a chain
the app does not know stays a plain building. No logo, name or sign of any
brand is drawn.

Two kinds of outline are left out on purpose: what the data marks as
underground, and any building a street runs straight through. The second rule
is for metro stations under a street, which are often on record as ordinary
buildings and would otherwise stand in the middle of the road.

If Overture's archive cannot be reached, the city is drawn with the street
map's own buildings instead. Those weld neighbouring houses into whole blocks,
have no roof furniture and are not measured by their shadows.

Heights read from shadows are rough, and mostly on the low side:

- A shadow can only be measured where it ends on open ground. In a dense
  street it lands on the building next door, and all that can be said is "at
  least this tall". A building that cannot be measured is taken to be about
  as tall as the measured ones around it.
- The time of day of the photo is not published, only the day. The app
  assumes the usual pass of a photo satellite, an hour and a half before or
  after midday, and picks whichever fits the shadows.
- A recorded height is never overruled, and no building is made lower than
  the usual for its kind.

Trees are found by colour, so a dark green roof or awning can be mistaken for
one and a tree in deep shade can be missed. Anything green on a road is taken
to be something else, so a real tree on a narrow traffic island can be missed
too. Every tree is drawn as the same simple shape; palms and other kinds are
not told apart.

Parked cars are set out by chance along residential streets, the same way
every time for the same street. They are not the cars really parked there.

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

## Or put it online with Firebase

Firebase Hosting works as well, and can be done from a phone with Google Cloud
Shell, a command line in the browser that is already signed in to your Google
account.

1. In the [Firebase console](https://console.firebase.google.com), create a
   **new project** for this app and note its Project ID. Do not use a project
   that already serves a website: publishing would replace that website.
2. Open [Cloud Shell](https://shell.cloud.google.com/?show=terminal) with the
   same Google account, and allow it to use your account if it asks.
3. Paste this line, put your Project ID in place of `YOUR-PROJECT-ID`, and
   press Enter:

   ```bash
   rm -rf video-map && git clone --depth 1 -b claude/peaceful-tesla-y76kia https://github.com/Asms323/video-map.git && bash video-map/tools/firebase-deploy.sh YOUR-PROJECT-ID
   ```

4. When it says "Done", open `https://YOUR-PROJECT-ID.web.app` in Safari.

To bring a newer version online later, paste the same line again. The script
checks the address first: it publishes to an empty project or updates Video
Map, and stops and asks before replacing any other website.

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
js/life.js              the simulated traffic: street network, vehicles, trains,
                        and the bridges they cross
js/scene.js             the layer that draws the traffic into the 3D scene
js/landmarks.js         the landmarks modelled by hand, as stacks of slabs
js/dress.js             metro station footbridges and pavilions, chain stores
js/sight.js             reading the satellite photo: shadows to heights, trees
js/services.js          the open data services
js/lib.js               everything that needs no browser: parsing, distances,
                        road matching, place categories, map styles, the
                        sun's position and the shadows it casts
sw.js                   offline start
manifest.webmanifest    Home Screen name and icons
icons/                  made by tools/make_icons.py
firebase.json           what Firebase Hosting publishes, and how it is cached
tools/firebase-deploy.sh  publishes to Firebase, refusing to replace another site
vendor/maplibre/        MapLibre GL JS 5.24.1 and the right-to-left text add-on
vendor/pmtiles/         PMTiles 4.5.0, which reads the buildings archive
tests/                  unit tests, browser test, small local server
```

Run it locally (location needs `localhost` or HTTPS):

```bash
node tests/serve.mjs
```

Unit tests, with Node 22 or newer:

```bash
npm test
```

Browser test, which needs Playwright with Chromium installed:

```bash
node tests/e2e.mjs
```

The browser test needs no internet. The street map is replayed from
`tests/fixtures/map.har`, a recording of the real OpenFreeMap service around
the test route in Riyadh, and the buildings from `tests/fixtures/buildings.json`,
the pieces of Overture's archive that route needs; the other services are
answered by stand-ins in the test file. To refresh both recordings from the
live services:

```bash
RECORD=1 node tests/e2e.mjs
```

The test covers Chromium only; check changes on a real iPhone in Safari too.

When you change the app, raise `VERSION` in both `js/app.js` and `sw.js` so
phones drop their saved copy.

## Licenses of what is included

- MapLibre GL JS: BSD 3-Clause (`vendor/maplibre/LICENSE.txt`).
- mapbox-gl-rtl-text: BSD 2-Clause, with ICU (`vendor/maplibre/LICENSE-rtl-text.md`).
- PMTiles: BSD 3-Clause (`vendor/pmtiles/LICENSE.txt`).
- `tests/fixtures/map.har` holds map data © OpenStreetMap contributors (ODbL),
  as served by OpenFreeMap (© OpenMapTiles).
- `tests/fixtures/buildings.json` holds building outlines from Overture Maps
  (© OpenStreetMap contributors and Overture Maps Foundation, ODbL).
