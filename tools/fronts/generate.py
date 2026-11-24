#!/usr/bin/env python3
"""Pictures of house fronts, made by an image generator: generate.py [prompts.json] [out folder]

Each is asked of FLUX.1 Krea dev (Black Forest Labs and Krea) as Hugging Face runs it at mcp-tools/FLUX.1-Krea-dev,
on the free allowance of the account whose token is used: some dozen pictures a day, shared with whatever else that
account asks of Hugging Face's ZeroGPU machines. It stops at the first refusal, which is the allowance used up: ask
again the next day. Do not work round it. A picture already made is not asked for again.

Needs: pip install gradio_client. The token is not read here: in a Claude cloud session it is a network secret of
the environment for the host mcp-tools-flux-1-krea-dev.hf.space; elsewhere, set HF_TOKEN and pass it to Client(…).
"""
import json
import os
import shutil
import sys
import time

from gradio_client import Client

jobs = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'prompts.json'))
out = sys.argv[2] if len(sys.argv) > 2 else 'pictures'
os.makedirs(out, exist_ok=True)
client = Client('https://mcp-tools-flux-1-krea-dev.hf.space', verbose=False)
for job in jobs:
    target = os.path.join(out, job['name'] + '.webp')
    if os.path.exists(target):
        print('have', job['name'])
        continue
    started = time.time()
    try:
        result = client.predict(prompt=job['prompt'], seed=job.get('seed', 1), randomize_seed=False, width=job.get('width', 1024), height=job.get('height', 768), guidance_scale=4.5, num_inference_steps=24, api_name='/infer')
    except Exception as error:
        print('refused at', job['name'], ':', str(error)[:300])
        break
    shutil.copy(result[0], target)
    print(f"{job['name']}: {time.time() - started:.0f} s", flush=True)
