"""Draw the Video Map icon (play triangle | map pin) and export the sizes the app needs."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(sys.argv[1])
S = 2048  # draw large, then shrink for smooth edges


def render(scale):
    """scale > 1 enlarges the artwork around the centre (the maskable icon keeps it small)."""
    k = S / 1024

    def px(v):
        return int(round((512 + (v - 512) * scale) * k))

    img = Image.new("RGB", (S, S))
    draw = ImageDraw.Draw(img)

    # Background: soft vertical gradient, dark slate to near-black.
    top, bottom = (27, 34, 42), (11, 13, 16)
    for y in range(S):
        t = y / (S - 1)
        draw.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))

    # Divider between the two halves, like the bar in the app.
    draw.rounded_rectangle([px(505), px(322), px(519), px(702)], radius=int(7 * scale * k), fill=(58, 70, 84))

    # Left: play triangle (video).
    draw.polygon([(px(262), px(388)), (px(262), px(636)), (px(448), px(512))], fill=(255, 178, 36))

    # Right: map pin (location).
    blue = (47, 140, 255)
    cx, cy, r = 682, 462, 100
    draw.polygon([(px(cx - 86), px(cy + 52)), (px(cx + 86), px(cy + 52)), (px(cx), px(cy + 216))], fill=blue)
    draw.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=blue)
    draw.ellipse([px(cx - 38), px(cy - 38), px(cx + 38), px(cy + 38)], fill=(255, 255, 255))
    return img


out.mkdir(parents=True, exist_ok=True)
full = render(1.32)      # home-screen icons: artwork fills the square
masked = render(1.0)     # maskable: artwork stays inside the safe zone
for name, size, img in [
    ("icon-180.png", 180, full),
    ("icon-192.png", 192, full),
    ("icon-512.png", 512, full),
    ("icon-maskable-512.png", 512, masked),
]:
    img.resize((size, size), Image.LANCZOS).save(out / name, optimize=True)
    print(name, (out / name).stat().st_size, "bytes")
