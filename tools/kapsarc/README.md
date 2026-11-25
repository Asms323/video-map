# The cells of KAPSARC

The King Abdullah Petroleum Studies and Research Center (Zaha Hadid Architects, 2017) is a honeycomb: some
ninety cells, each an uneven hexagon with a courtyard in it, small at the middle of the campus and long at
its edge, fanning out like the seeds of a sunflower. The app builds every cell as a model (`js/famous.js`);
this folder holds their outlines and writes the file the app reads them from.

```
python3 build.py      # cells.json -> ../../js/kapsarc-data.js
```

## cells.json

One cell to an entry: `ring`, its outline, and `court`, the outline of its courtyard, or `null`; each a list
of [east, north] in metres from 46.7218° E, 24.87525° N, as the roofs lie in the satellite photo.

## Where the outlines come from

They were traced on the satellite photo the app shows (Esri World Imagery), at zoom 18, by a script
(OpenCV): the seams between the cells are lines a little darker than the roofs beside them, so each roof
they enclose is a cell; the dark inside a roof is its courtyard. Pieces of paving, facets of one roof
traced apart, and the dark of walls seen aslant were weeded out by rules; where the photo left a gap, a
courtyard found there was given the part of the roof nearest to it. Most cells match the photo to a metre
or two; a dozen at the south and east edges, filled in so, are good to some five.

The photo is taken at a slant, so the roofs lie north of where the cells stand: `build.py` moves them all
back south by 4 m, the slant of a roof some 16 m up. The heights of the cells are not in the photo: they
are judged (see `js/famous.js`).

## Tracing them again

The scripts in `trace/` (Python 3 with OpenCV, NumPy and Shapely) need a straight-down picture of the
campus as the app shows it with the satellite photo, north up, its middle at 46.7218° E, 24.87525° N, at
zoom 18 and two pixels to the point (2800 by 2800), and `trace/outline.json`, the buildings data's
outline of the campus in metres from that middle:

```
python3 trace/cells.py      photo.png 18 24.87525 trace/outline.json cells-raw.json check-1.jpg 31 10
python3 trace/courtyards.py photo.png 18 24.87525 trace/outline.json courts.json check-2.jpg
python3 trace/clean.py      cells-raw.json trace/outline.json cells-clean.json photo.png 18 24.87525 check-3.jpg
python3 trace/fill.py       cells-clean.json courts.json trace/outline.json cells.json photo.png 18 24.87525 check-4.jpg
```

Each draws what it found on the picture (`check-*.jpg`), to be looked at before going on. The photo is not
kept here.
