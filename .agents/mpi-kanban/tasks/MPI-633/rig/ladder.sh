#!/bin/sh
# MPI-633 M1 — build a resolution ladder from one shipped clip.
# Same content, same codec/preset/GOP, only the pixel count changes.
set -e
FF="C:/AI/Mpi/Cubric-Vision/node_modules/ffmpeg-static/ffmpeg.exe"
SRC="C:/AI/Mpi/Cubric-Vision/comfy_workflows/display/flow-scribble.mp4"
OUT="${MPI633_SCRATCH:-$TEMP/mpi633}/ladder"
mkdir -p "$OUT"

enc() { # $1=name $2=filter
  "$FF" -y -hide_banner -loglevel error -i "$SRC" -vf "$2" \
    -c:v libx264 -preset veryfast -crf 20 -g 48 -pix_fmt yuv420p -an \
    "$OUT/$1.mp4"
  echo "built $1"
}

enc r480  "scale=768:480"
enc r720  "scale=1152:720"
enc r800  "scale=1280:800"
enc r1080 "scale=1728:1080"
enc r1280w "scale=3000:-2,crop=3000:1280"

ls -la "$OUT"
for f in "$OUT"/*.mp4; do
  echo -n "$(basename $f): "
  "$FF" -hide_banner -i "$f" 2>&1 | grep -o "[0-9]*x[0-9]*" | head -1
done
