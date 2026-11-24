#!/usr/bin/env python3
"""Cut one thing out of a photograph, for the generator of 3D models: the thing alone, the rest clear.

Usage: cutout.py <photo> <out.png> --outline "x,y x,y …" [--paint "x0,y0,x1,y1" …] [--scale 2] [--lift]

  --outline  the corners of a line drawn round the thing, in the photograph's own spots
  --paint    a box to paint over first in the colour beside it (a shop's name, a number plate, a face);
             a fifth field, l or r, takes the colour from the left or the right of the box alone
  --scale    how many times to enlarge the piece (the generator works at about 500 spots a side)
  --lift     stretch the piece's light and dark to the full range first (for a hazy photograph)
"""
import argparse

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('photo')
    parser.add_argument('out')
    parser.add_argument('--outline', required=True)
    parser.add_argument('--paint', action='append', default=[])
    parser.add_argument('--scale', type=float, default=1)
    parser.add_argument('--lift', action='store_true')
    args = parser.parse_args()

    image = Image.open(args.photo).convert('RGB')
    spots = np.asarray(image).copy()
    for box in args.paint:
        fields = box.split(',')
        x0, y0, x1, y1 = (int(v) for v in fields[:4])
        side = fields[4] if len(fields) > 4 else ''
        for y in range(y0, y1):
            left = spots[y, max(x0 - 8, 0):x0].astype(np.float32).mean(axis=0)
            right = spots[y, x1:x1 + 8].astype(np.float32).mean(axis=0) if x1 + 2 < spots.shape[1] else left
            # (Something else stands hard beside the box on one side: the colour is taken from the other side alone.)
            if side == 'r':
                left = right
            elif side == 'l':
                right = left
            for x in range(x0, x1):
                t = (x - x0) / max(x1 - x0 - 1, 1)
                spots[y, x] = (left * (1 - t) + right * t).astype(np.uint8)
    image = Image.fromarray(spots)
    outline = [tuple(float(v) for v in corner.split(',')) for corner in args.outline.split()]
    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).polygon(outline, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    xs = [x for x, _ in outline]
    ys = [y for _, y in outline]
    box = (max(int(min(xs)) - 8, 0), max(int(min(ys)) - 8, 0), min(int(max(xs)) + 8, image.width), min(int(max(ys)) + 8, image.height))
    piece = image.crop(box)
    if args.lift:
        piece = ImageOps.autocontrast(piece, cutoff=0.5)
    piece = piece.convert('RGBA')
    piece.putalpha(mask.crop(box))
    if args.scale != 1:
        piece = piece.resize((round(piece.width * args.scale), round(piece.height * args.scale)), Image.LANCZOS)
    piece.save(args.out)
    print(args.out, piece.size)


if __name__ == '__main__':
    main()
