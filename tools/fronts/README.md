# The kit the houses are dressed from

Near the eye, each ordinary house of the map is dressed as a real house
looks: a front out of a kit, on the house's own plot and in its own measure
(`js/fronts.js`). This folder makes the kit: `models/fronts.jpg`, one
picture holding every front, and `js/kit.js`, where in it each lies and its
measures.

## What a front is

A picture of a house taken **straight on**, from across its street, in even
light, with nothing before it; measured into

- its **wall to the street**: which stretches are plain wall (they are laid
  as long as a house needs, again and again, every other time in mirror
  image), which are a gate, a pier or a lamp (they keep their true size),
  and which are a window in the wall (kept where there is room);
- the **face of the house** over that wall: the pieces of the picture that
  are house and not sky;
- a **plain piece** of its plaster or stone, for every wall no picture shows;
- its **windows**: set in the other walls of the house too, and lit by night.

So a front is never stretched over a house. A wide house and a narrow one of
the same front are two different houses.

## The pictures

- `pictures/reference.jpg`, `pictures/above.jpg`: two of the pictures of a
  new Riyadh villa that the app's owner made with an AI image generator as a
  reference for the look wanted. They are not photographs of a real house.
- `pictures/wood.webp`, `limestone.webp`, `white.webp`: made for this kit by
  FLUX.1 Krea dev (Black Forest Labs and Krea), run on Hugging Face at
  `mcp-tools/FLUX.1-Krea-dev` on the owner's account. `prompts.json` has
  what was asked for each, and what is to be asked next; `generate.py` asks.
  The free allowance is some dozen pictures a day at most, shared with the
  3D generator (`tools/models`): it stops at the first refusal.
  The model's licence (FLUX [dev] Non-Commercial License) is about the model;
  of its pictures it says, in the version read for this, that their maker
  claims no ownership of them and that they may be used. Read its current
  text at bfl.ai before the app is put to commercial use.

## Adding a front

1. A picture as above. Ask for a house in Riyadh by its style, "perfectly
   frontal elevation photograph … orthographic view … no people, no cars, no
   trees, no text", with the gates closed and the boundary wall across the
   whole picture.
2. Measure it into `fronts.json` (places are in the picture's own spots,
   across then down): `crop`, the part kept; `edits`, pieces copied or drawn
   out over what must go (a tree, an open gate, a plate with writing: nothing
   with a name on it goes into the app); `wall`: its `rows` (top, foot), its
   `height` in metres, its `pieces` from left to right, its `lamps`; `house`:
   `perMetre` (spots to a metre on the house's own face, which stands
   further off than the wall and so shows smaller), `rects`, `plain`,
   `plainScale` (plain plaster may be laid larger than life: fewer pieces),
   `panes`.
3. `python3 build.py` (in this folder; needs numpy and pillow). Look at
   `models/fronts.jpg`.
4. `npm test`: the kit is held to its measures (a gate that keeps its size,
   plain wall to lay, a face of a believable size, everything inside the
   picture).
5. Look at a street of houses in the app, by day and by night.

Two columns of the kit's picture are filled so far to about three quarters:
there is room for some three more fronts; after that a second picture.
