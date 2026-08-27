#!/bin/sh
# MPI-633 M2 — synthesise a gallery-sized set of image assets.
# One 1280x800 master + today's 512px WebP thumb, copied to N distinct names so
# Chromium decodes each separately (it caches by URL).
set -e
FF="C:/AI/Mpi/Cubric-Vision/node_modules/ffmpeg-static/ffmpeg.exe"
SRC="C:/AI/Mpi/Cubric-Vision/comfy_workflows/display/flow-scribble.mp4"
OUT="${MPI633_SCRATCH:-$TEMP/mpi633}/m2"
N=120
rm -rf "$OUT"; mkdir -p "$OUT/master" "$OUT/thumb512"

"$FF" -y -hide_banner -loglevel error -ss 2 -i "$SRC" -frames:v 1 -vf scale=1280:800 "$OUT/base.png"
# Same encode the app uses today: extractImageThumb, 512 wide, libwebp q82.
"$FF" -y -hide_banner -loglevel error -i "$OUT/base.png" \
  -vf "scale='min(512,iw)':-2" -frames:v 1 -c:v libwebp -quality 82 "$OUT/base.thumb.webp"

i=0
while [ $i -lt $N ]; do
  cp "$OUT/base.png" "$OUT/master/a$i.png"
  cp "$OUT/base.thumb.webp" "$OUT/thumb512/a$i.webp"
  i=$((i + 1))
done

ls "$OUT/master" | wc -l
ls -la "$OUT/base.png" "$OUT/base.thumb.webp"
