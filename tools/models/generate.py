#!/usr/bin/env python3
"""Pictures of one thing in, one 3D model with its picture out: by TRELLIS (Microsoft Research, MIT licence), as it
is run on Hugging Face at trellis-community/TRELLIS, on that service's free allowance of the account whose token is
used.

Usage: generate.py <out.glb> <cutout.png> [more cutouts of the same thing …]
                   [--seed 1] [--texture 1024] [--simplify 0.95] [--mix stochastic|multidiffusion] [--ready]

Each picture is the thing alone on a clear background (see cutout.py). Before it is sent it is made ready the way
the generator wants it, and as its own page does on an upload: a square, the thing in the middle with a margin of a
tenth on every side, 518 spots a side, black where the picture is clear. (Sent as it is, a picture that is not
square is stretched to one, and the model comes out too wide or too narrow by as much.) What is sent is kept beside
the model, as <out>-sent-1.png and so on, to look at.

Several pictures are several views of the same thing: the first leads (it is the one the first, coarsest step
follows), so it is the one that shows the whole thing best. --mix says how they are joined: stochastic takes them
in turn, a step each (no dearer than one picture); multidiffusion follows all of them at every step (dearer by the
number of pictures). The generator was not taught with several pictures: its makers call this an experiment.

--ready makes the pictures ready and sends nothing.

The pictures are sent to that service. The allowance of a free account is about five models a day; a refusal says
when it is renewed. Needs: pip install gradio_client numpy pillow. The token is not read here: in a Claude cloud
session it is a network secret of the environment for the host trellis-community-trellis.hf.space; elsewhere, set
HF_TOKEN and pass it to Client(…, hf_token=…).
"""
import argparse
import shutil
import time

import numpy as np
from PIL import Image

SPACE = 'https://trellis-community-trellis.hf.space'
SIDE = 518
MARGIN = 1.2


def ready(picture):
    """The picture as the generator wants it: see above. (After preprocess_image of TRELLIS' own pipeline.)"""
    image = Image.open(picture).convert('RGBA')
    alpha = np.asarray(image)[:, :, 3]
    if np.all(alpha == 255):
        raise SystemExit(f'{picture}: nothing of it is clear. Cut the thing out first (cutout.py).')
    rows, columns = np.nonzero(alpha > 0.8 * 255)
    left, top, right, bottom = columns.min(), rows.min(), columns.max(), rows.max()
    middle = (left + right) / 2, (top + bottom) / 2
    size = int(max(right - left, bottom - top) * MARGIN)
    box = (middle[0] - size // 2, middle[1] - size // 2, middle[0] + size // 2, middle[1] + size // 2)
    piece = image.crop(tuple(int(round(v)) for v in box)).resize((SIDE, SIDE), Image.LANCZOS)
    spots = np.asarray(piece).astype(np.float32) / 255
    return Image.fromarray((spots[:, :, :3] * spots[:, :, 3:4] * 255).astype(np.uint8))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('pictures', nargs='+')
    parser.add_argument('--seed', type=int, default=1)
    parser.add_argument('--texture', type=int, default=1024)
    parser.add_argument('--simplify', type=float, default=0.95)
    parser.add_argument('--mix', choices=['stochastic', 'multidiffusion'], default='stochastic')
    parser.add_argument('--ready', action='store_true')
    args = parser.parse_args()

    sent = []
    for i, picture in enumerate(args.pictures):
        name = args.out.replace('.glb', f'-sent-{i + 1}.png')
        ready(picture).save(name)
        sent.append(name)
        print('ready:', name)
    if args.ready:
        return

    from gradio_client import Client, handle_file

    started = time.time()
    client = Client(SPACE, verbose=False)
    try:
        client.predict(api_name='/start_session')
    except Exception as error:  # (not every build of the Space needs it)
        print('start_session:', str(error)[:200])
    several = len(sent) > 1
    # The page keeps which of its two tabs is open, one picture or several, and the generator asks it: the calls
    # below are the tabs being opened.
    client.predict(api_name='/lambda_1' if several else '/lambda')
    result = client.predict(
        image=handle_file(sent[0]),
        multiimages=[{'image': handle_file(name), 'caption': None} for name in sent] if several else [],
        seed=args.seed,
        ss_guidance_strength=7.5,
        ss_sampling_steps=12,
        slat_guidance_strength=3.0,
        slat_sampling_steps=12,
        multiimage_algo=args.mix,
        mesh_simplify=args.simplify,
        texture_size=args.texture,
        api_name='/generate_and_extract_glb',
    )
    print('result:', str(result)[:600])
    glb = result[2] if isinstance(result, (list, tuple)) and len(result) > 2 else result[1]
    shutil.copy(glb, args.out)
    video = result[0].get('video') if isinstance(result[0], dict) else None
    if video:
        shutil.copy(video, args.out.replace('.glb', '.mp4'))
    print(f'saved {args.out} in {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
