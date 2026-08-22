"""MPI-600 - make a 1-bit mask for the localised-edit scenario (wf_type 5).

    python make_mask.py out.png 1024 1024 --ellipse 180,210,400,900

White = where the edit happens, black = untouched. The inpaint branch reads channel `red`
(node 296), crops around the mask, green-fills the masked region, and stitches the result back -
so the mask shape is what the seam has to survive.

ponytail: PIL draws it in one call, no mask editor, no dependency added (bench python has PIL).
"""

import argparse

from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("width", type=int)
ap.add_argument("height", type=int)
ap.add_argument("--ellipse", action="append", default=[], help="x0,y0,x1,y1")
ap.add_argument("--rect", action="append", default=[], help="x0,y0,x1,y1")
a = ap.parse_args()

img = Image.new("L", (a.width, a.height), 0)
d = ImageDraw.Draw(img)
for spec in a.ellipse:
    d.ellipse([int(v) for v in spec.split(",")], fill=255)
for spec in a.rect:
    d.rectangle([int(v) for v in spec.split(",")], fill=255)

img.convert("RGB").save(a.out)
white = sum(1 for p in img.get_flattened_data() if p > 127)
print("%s  %dx%d  white %d px (%.1f%% of frame)"
      % (a.out, a.width, a.height, white, 100.0 * white / (a.width * a.height)))
