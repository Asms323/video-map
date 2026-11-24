#!/usr/bin/env python3
"""One picture in, one 3D model with its picture out: by TRELLIS (Microsoft Research, MIT licence), as it is run on
Hugging Face at trellis-community/TRELLIS, on that service's free allowance of the account whose token is used.

Usage: generate.py <cutout.png> <out.glb> [seed 1] [picture size 1024] [simplify 0.95]

The picture is the thing alone on a clear background (see cutout.py). It is sent to that service. The allowance of
a free account is about five models a day; a refusal says when it is renewed. Needs: pip install gradio_client. The
token is not read here: in a Claude cloud session it is a network secret of the environment for the host
trellis-community-trellis.hf.space; elsewhere, set HF_TOKEN and pass it to Client(…, hf_token=…).
"""
import shutil
import sys
import time

from gradio_client import Client, handle_file


def main(picture, out, seed=1, texture=1024, simplify=0.95):
    started = time.time()
    client = Client('https://trellis-community-trellis.hf.space', verbose=False)
    try:
        client.predict(api_name='/start_session')
    except Exception as error:  # (not every build of the Space needs it)
        print('start_session:', str(error)[:200])
    result = client.predict(
        image=handle_file(picture),
        multiimages=[],
        seed=seed,
        ss_guidance_strength=7.5,
        ss_sampling_steps=12,
        slat_guidance_strength=3.0,
        slat_sampling_steps=12,
        multiimage_algo='stochastic',
        mesh_simplify=simplify,
        texture_size=texture,
        api_name='/generate_and_extract_glb',
    )
    print('result:', str(result)[:600])
    glb = result[2] if isinstance(result, (list, tuple)) and len(result) > 2 else result[1]
    shutil.copy(glb, out)
    video = result[0].get('video') if isinstance(result[0], dict) else None
    if video:
        shutil.copy(video, out.replace('.glb', '.mp4'))
    print(f'saved {out} in {time.time() - started:.0f} s')


if __name__ == '__main__':
    a = sys.argv
    main(a[1], a[2], int(a[3]) if len(a) > 3 else 1, int(a[4]) if len(a) > 4 else 1024, float(a[5]) if len(a) > 5 else 0.95)
