# The kit the houses are dressed from

Near the eye, each ordinary house of the map is dressed as a real house
looks: a front out of a kit, on the house's own plot and in its own measure
(`js/fronts.js`). This folder makes the kit: `models/fronts.jpg`, one
picture holding every front, and `js/kit.js`, where in it each lies and its
measures.

## What a front is

A picture of a house taken **straight on**, from across its street, with
nothing before it; measured into

- its **wall to the street**: which stretches are plain wall (they are laid
  as long as a house needs, again and again, every other time in mirror
  image), which are a gate, a pier or a lamp (they keep their true size),
  and which are a window or a second gate in the wall (kept where there is
  room);
- the **face of the house** over that wall: the pieces of the picture that
  are house and not sky, and how far each stands out (a block set forward,
  a balcony, a cornice stand out of the house as they do in the picture);
- a **plain piece** of its plaster or stone, for every wall no picture shows;
- its **windows**: set in the other walls of the house too, and lit by night
  (closed shutters are set there too, and never lit); its **lamps**, lit on
  every house; and, if it has one, its **crest**: the battlements of a
  Najdi house, which stand over the top of every wall of it, all round.

So a front is never stretched over a house. A wide house and a narrow one of
the same front are two different houses. (A face is drawn out by an eighth
at most, where that makes it cover the house's wall; beside a face that
does not, the wall is given windows of its own.) A house the map has whole
keeps its own outline: the face goes on the wall of it that looks to the
street, plain wall and windows along its other sides, whatever its shape.

Each front names the **styles** of house it is made for (`plaster`, `stone`,
`arched`, `modern`: see `HOUSE_STYLES` in `js/houses.js`, which gives each
district of Riyadh its mixture). Three in four houses of a style are given
a front made for it; of those, the nearer its colour to the house's paint
the likelier. Along a street, neighbours are not given the same.

## The pictures

- `pictures/reference.jpg`, `pictures/above.jpg`: two of the pictures of a
  new Riyadh villa that the app's owner made with an AI image generator as a
  reference for the look wanted. They are not photographs of a real house.
- `pictures/wood.webp`, `limestone.webp`, `white.webp`: made for this kit by
  FLUX.1 Krea dev (Black Forest Labs and Krea), run on Hugging Face at
  `mcp-tools/FLUX.1-Krea-dev` on the owner's account; `generate.py` asks.
  The free allowance is some dozen pictures a day at most, shared with the
  3D generator (`tools/models`): it stops at the first refusal.
  The model's licence (FLUX [dev] Non-Commercial License) is about the model;
  of its pictures it says, in the version read for this, that their maker
  claims no ownership of them and that they may be used. Read its current
  text at bfl.ai before the app is put to commercial use.
- `pictures/older.jpg`, `stone.jpg`, `najdi.jpg`, `grey.jpg`, `plain.jpg`,
  `slats.jpg`, `duplex.jpg`: made for this kit by Gamma's image generator
  (gamma.app), asked by hand through the owner's account on 25 November
  2026, as photographs 16 to 9; kept here at half their size (1376 by 768).
  Each cost 70 of the account's credits. Gamma's terms on the pictures it
  makes could not be read from where this was built: read them at
  gamma.app/terms before the app is put to commercial use. None of them
  shows a real house.

`prompts.json` has what was asked for each picture, of which generator.

## Adding a front

1. A picture as above. Ask for a house in Riyadh by its style, "perfectly
   frontal elevation photograph … orthographic straight-on view … no
   people, no cars, no trees, no text", with the gates closed and the
   boundary wall across the whole width of the picture. A sun that throws
   a shadow is no harm if the shadow is the house's own; a neighbour's
   shadow across the house is (leave that part of the picture out).
2. Measure it into `fronts.json` (places are in the picture's own spots,
   across then down): `styles`; `rare` (how much rarer such a house is than
   the others, 0 to 1); `scale` (the picture made smaller for the kit);
   `edits`, pieces copied or drawn out over what must go (a tree, an open
   gate, a plate with writing: nothing with a name on it goes into the
   app); `wall`: its `rows` (top, foot), its `height` in metres, its
   `pieces` from left to right (`plain`, `fixed`, `optional`; they need not
   touch: what lies between two is left out), its `lamps`; `house`:
   `perMetre` (spots to a metre on the house's own face, which stands
   further off than the wall and so shows smaller), `rects` (as many as its
   outline needs: what no rect covers is not drawn; a fifth number is how
   far that piece stands out before the wall, in metres: a block of the
   house set forward, a balcony, a cornice: it is built standing out, with
   sides and a top, and the windows and lamps in it go with it; a later
   rect lies over an earlier one where both are), `plain`, `plainScale`
   (plain plaster may be laid larger than life: fewer pieces), `even` (the
   plain piece's stains and shadows are taken out, so that they do not show
   in rows: `false` leaves them, a number is how broad a stain is in
   spots), `panes`, `dark` (closed shutters), `lamps`, `crest` (`row`: the
   row the merlons stand on; `merlon`: the boxes of one; `every`: from one
   to the next).
   `python3 check.py <name> <out.jpg>` draws all of it over the picture.
3. `python3 build.py` (in this folder; needs numpy and pillow). Look at
   `models/fronts.jpg`. Of each picture only the wall's strip, the box
   round the face and the plain piece are kept.
4. `npm test`: the kit is held to its measures (a gate that keeps its size,
   plain wall to lay, a face of a believable size, everything inside the
   picture, at least three fronts for every style).
5. Look at a street of houses in the app, by day and by night.

The kit's picture (4096 by 2048) is full with eleven fronts. For more, make
the largest pieces smaller (`scale`), or shorten the walls' plain pieces.
The plaster style has the fewest fronts (two, and the rare Najdi one).
