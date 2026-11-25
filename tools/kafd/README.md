# The outlines of the King Abdullah Financial District

The app builds every building of the financial district as a model on its
own outline (`js/kafd.js`). This folder holds those outlines and makes the
file the app reads them from.

```
python3 build.py      # outlines.json -> ../../js/kafd-data.js
```

## outlines.json

One building to a line:

- `n`: its number. The numbers are this list's own: nobody else's. They are
  what `js/kafd.js` goes by when it says how each building is built.
- `at`: where its middle stands, in metres east and north of 46.64° E,
  24.7625° N (a point in the middle of the district).
- `ring`: its outline, anticlockwise, in metres from that middle.
- `height`: in metres. `known`: whether that height is on record.
- `area`: of its outline, in square metres. `traced`: see below.

### Where the outlines come from

From the buildings data the app's own map draws: Overture Maps (which joins
OpenStreetMap with outlines traced from satellite photos; © OpenStreetMap
contributors and Overture Maps Foundation, ODbL), as read in November 2026.
They were taken out of the running app, which hands them over a map tile at
a time; a building that lies across the edge of two tiles came in two
pieces and was joined again. Of what stands inside the district's ring road,
everything of 250 square metres or more was kept, but for

- the PIF Tower and the metro station, which were built by hand before
  (`js/landmarks.js`);
- two plots with nothing built on them yet, and the gardens and canopies of
  the wadi, which the data has as buildings;
- three low halls that the map draws well enough itself.

Where the data had an outline doubling back on itself (a spike with nothing
in it), the spike was taken out.

**Two buildings the data does not have** were traced from the satellite photo
the app shows (Esri World Imagery): the great faceted hall north of the PIF
Tower (90) and the block east of it (91). Their corners were read off the
photo to about a metre. The data lacks others as well, mostly in the west
and the north of the district; those are not built.

### Where the heights come from

For 34 buildings the data has a height. It is the height of the building's
highest point: of the tip of its spire, if it has one.

For the other 36 the height was read off the satellite photo. The photo is
taken at a slant: the roof of a building lies north-north-west of its foot,
by 0.48 of its height (0.150 west and 0.454 north for every metre: measured
on the PIF Tower, whose 385 m are known). The outline of each building was
slid along that line until it lay on the building's roof. A height read so
is good to some ten metres; where a building stood in the shadow or behind
the top of a taller one it is a guess, and low.

The same was done for the buildings whose height is on record, as a check.
It agreed for all but two: the tower of 231 m is that tall to the tip of its
mast, and its roof is at some 187 m; and the tower of 200 m has a crown that
the photo shows reaching some 250 m. `js/kafd.js` builds them so.
