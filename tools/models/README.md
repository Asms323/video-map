# Models made from photographs

Some things in the 3D city are not built by hand but made, each from one
photograph of the real thing, by a generator of 3D models. This folder holds
how. The models themselves are in `models/`; where each stands is in
`js/props.js`.

## The steps

1. **A photograph** in which the thing shows clearly: the more it fills the
   picture and the squarer it is seen, the better. Solid buildings work.
   Lattices and wheels do not (the tower of the Paris quarter came out a solid
   cone).
2. **Cut it out**: `python3 cutout.py <photo> <out.png> --outline "x,y x,y …"`
   draws a line round the thing and clears the rest. `--paint x0,y0,x1,y1`
   paints over a name, a number plate or a face first. Nothing with a name on
   it goes into the app.
3. **Generate**: `python3 generate.py <out.png> <thing.glb>` sends the picture
   to TRELLIS (Microsoft Research, MIT licence) as it is run on Hugging Face,
   and fetches a mesh with a picture laid over it. This is done on the free
   allowance of the account whose token is used: **about five models a day**.
   A refusal says when the allowance is renewed. Do not work round it.
4. **Look at it**: `node shot.mjs <thing.glb> <out.png> 4 16 "&unlit=1&bg=0b0d14"`
   takes pictures of it from four sides. `node pieces.mjs` and `node
   slices.mjs` measure it.
5. **Clean it**: `node clean.mjs <in.glb> <out.glb> [radius] [floor|none]
   [auto|box|crown]` drops what stood beside the thing in the photograph,
   stands it on the ground and puts its middle line at nought. `python3 cut.py
   <in.glb> <out.glb> <x from> <x until>` cuts a piece off and closes the cut
   (the Greek house is the low wing of the church).
6. **Thin it**: `node simplify.mjs <in.glb> <out.glb> <triangles>`. A landmark
   that stands once: thirty thousand triangles at most. A house that stands
   hundreds of times: six hundred, which shows no worse.
7. **Pack it**: `node pack.mjs <thing.glb> ../../models/<name>` writes
   `<name>.vmm` and `<name>.png`; save the picture again as `<name>.jpg`
   (quality 88) and delete the PNG. List the two files in `sw.js`.
8. **Stand it**: add it to `PROPS` in `js/props.js` (a thing that stands in its
   own place) or to `HOUSE_MODELS` there (a house that stands for every house
   of its sort near the eye).

`simplify.mjs` and `shot.mjs` need `npm i --no-save --no-package-lock
meshoptimizer@0.22.0 three@0.170.0` (anywhere in the project: it is not
added to the app); `generate.py` needs `pip install gradio_client`;
`shot.mjs` needs Playwright with its browser.

## Whose photographs

A model's picture is made out of its photograph, so the photograph's terms
come with it.

- `inputs/` holds cut-outs ready for the generator, with `inputs.json` saying
  for each which photograph it is cut from, who took it and when, and how it
  was cut. Those there now are from OpenStreetView-5M: street photographs by
  Mapillary contributors, **CC BY-SA 4.0**. A model made from one is to be
  credited to its photographer in the app's README and shared on the same
  terms.
- The models of Boulevard World in `models/` were made from photographs the
  app's owner sent. Who took each is not recorded: see the app's README.

## What stands where, and what is next

Made so far: the pagoda, the red hall, Egypt's gate tower and the Greek
church (with the house cut off it), all at Boulevard World.

Next, from `inputs/`: two villas, a neighbourhood mosque and a block of flats
of Riyadh. With the first villa in `HOUSE_MODELS`, the houses near the middle
of the view are drawn as it instead of as plain blocks; the app already does
the rest (`pickHouseModels` in `js/map.js`, `standMany` in `js/props.js`).
A photograph taken by day gives a model with `night: 0`: how such a house
shows its lamps by night is still to be written. The mosque and the block of
flats need one more thing: fitting a model to the outline of any building,
not only to a house the app laid out itself.
