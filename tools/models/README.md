# Models made from photographs

Some things in the 3D city are not built by hand but made, each from one
photograph of the real thing, by a generator of 3D models. This folder holds
how. The models themselves are in `models/`; where each stands is in
`js/props.js`.

## The steps

1. **A photograph** in which the whole thing shows clearly, by day, with
   nothing in front of it. Best is one taken from above and from a corner (a
   roof or a window across the street): it shows the roof and two sides at
   once, and what a photograph does not show the generator must guess. Solid
   buildings work. Lattices and wheels do not (the tower of the Paris quarter
   came out a solid cone).
2. **Cut it out**: `python3 cutout.py <photo> <out.png> --outline "x,y x,y …"`
   draws a line round the thing and clears the rest. `--paint x0,y0,x1,y1`
   paints over a name, a number plate or a face first. Nothing with a name on
   it goes into the app.
3. **Generate**: `python3 generate.py <thing.glb> <cutout.png>` sends the
   picture to TRELLIS (Microsoft Research, MIT licence) as it is run on
   Hugging Face, and fetches a mesh with a picture laid over it. This is done
   on the free allowance of the account whose token is used: **about five
   models a day**. A refusal says when the allowance is renewed. Do not work
   round it.
   The picture is first made ready as the generator wants it (a square, the
   thing in the middle, black where it is clear), and what is sent is kept
   beside the model as `<thing>-sent-1.png`: look at it. `--ready` does only
   that and sends nothing.
   **Several photographs of the same thing** can be given at once, each cut
   out: `python3 generate.py <thing.glb> <above.png> <front.png> <left.png>`.
   The first leads, so it is the one that shows the whole thing best. The
   generator was not taught this way and its makers call it an experiment:
   whether it does better than the best single photograph is to be seen each
   time.
4. **Look at it**: `node shot.mjs <thing.glb> <out.png> 4 16 "&unlit=1&bg=0b0d14"`
   takes pictures of it from four sides. `node pieces.mjs` and `node
   slices.mjs` measure it. Hold it against the photograph: is it as wide for
   its height as the thing is?
5. **Clean it**: `node clean.mjs <in.glb> <out.glb> [radius] [floor|none]
   [auto|box|crown]` drops what stood beside the thing in the photograph,
   stands it on the ground and puts its middle line at nought. `python3 cut.py
   <in.glb> <out.glb> <x from> <x until>` cuts a piece off and closes the cut
   (the Greek house is the low wing of the church).
6. **Thin it**: `node simplify.mjs <in.glb> <out.glb> <triangles>`: thirty
   thousand triangles at most for a landmark, fewer for a small thing that
   stands many times.
7. **Pack it**: `node pack.mjs <thing.glb> ../../models/<name>` writes
   `<name>.vmm` and `<name>.png`; save the picture again as `<name>.jpg`
   (quality 88) and delete the PNG. List the two files in `sw.js`.
8. **Stand it**: add it to `PROPS` in `js/props.js`, at its own place: where
   the thing really stands.

`simplify.mjs` and `shot.mjs` need `npm i --no-save --no-package-lock
meshoptimizer@0.22.0 three@0.170.0` (anywhere in the project: it is not
added to the app); `generate.py` needs `pip install gradio_client numpy
pillow`; `shot.mjs` needs Playwright with its browser.

## A mistake that was made, and its mending

Until 24 November 2026 `generate.py` sent a cut-out as it was. The generator
makes every picture a square before it looks at it, so a cut-out that was not
square reached it stretched, and the model came out as much too wide for its
height: the pagoda, cut tall and narrow, by two thirds; Egypt's gate tower by
a quarter; the Greek church and its house by three tenths; the red hall,
nearly square, hardly at all. The five models in `models/` have had their
footprints brought back (`node footprint.mjs <models/name.vmm> <the cut-out's
width over its height>`), and `generate.py` now sends every picture ready
made, exactly as the generator's own page prepares an upload (the two were
compared, spot for spot).

And `pack.mjs` wrote every triangle the wrong way round, so the app took each
surface to look inwards: by day the sun lit the sides turned from it. The five
models have been turned (the tests now hold every model to it), and `pack.mjs`
leaves the triangles as the generator wound them.

## Ordinary houses are not models

A model made here is of one thing that really stands somewhere: a landmark.
The ordinary houses of the map are dressed from a kit of fronts instead,
each on its own plot: see `tools/fronts`. (A villa was once built here by
measure from the owner's reference pictures and stood in place of every
house near the eye. That was wrong, and is gone: the houses of a city are not
one house.)

## Whose photographs

A model's picture is made out of its photograph, so the photograph's terms
come with it.

- `inputs/` holds cut-outs ready for the generator, with `inputs.json` saying
  for each which photograph it is cut from, who took it and when, and how it
  was cut. Those there now are from OpenStreetView-5M: street photographs by
  Mapillary contributors, **CC BY-SA 4.0**. A model made from one is to be
  credited to its photographer in the app's README and shared on the same
  terms.
- `inputs/villa-corner-above.png`, `villa-corner-front.png`,
  `villa-corner-left.png`, `villa-straight.png`, `villa-modern-1.png` and
  `villa-modern-2.png` are cut from five of six pictures of a new Riyadh
  villa that the app's owner made with an AI image generator, as a reference
  for the look wanted. They are not photographs: there is no such house, and
  no place where it stands.
- The models of Boulevard World in `models/` were made from photographs the
  app's owner sent. Who took each is not recorded: see the app's README.

## What stands where, and what is next

Made so far: the pagoda, the red hall, Egypt's gate tower and the Greek
church (with the house cut off it), all at Boulevard World, by the generator.

Next, from `inputs/` (`inputs.json` has each one's recipe), as the daily
allowance lasts, which is shared with the pictures asked for in `tools/fronts`:

1. `mosque`, then `flats`: real buildings, from small, hazy street
   photographs.
2. `villa-corner-above` alone, then `villa-corner-above`, `villa-corner-front`
   and `villa-corner-left` together: the same villa from three sides, to learn
   whether several pictures do better than one.
3. Later: the Paris block if its cut-out is still to hand, and the two older
   villas `villa-a` and `villa-b`.

The villa cut-outs are of the owner's reference villa: a model the generator
makes of them is only a test of the generator, not a house for the map. The
mosque, the flats and the two older villas are from street photographs of
real buildings: `inputs.json` says where each stands, and a good model of one
is to stand on that building, found on the satellite photo and turned as it
is turned. That needs one more thing: fitting a model to the outline of any
building, not only to a house the app laid out itself.
A photograph taken by day gives a model with `night: 0`: by night it has no
lit windows of its own yet (a mesh can say which of its corners are windows
and lamps, see `readProp` in `js/props.js`, but the generator's meshes do
not).
