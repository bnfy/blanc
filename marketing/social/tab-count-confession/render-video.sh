#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

ffmpeg -y -v error \
  -loop 1 -t 2.1 -i "$SCRIPT_DIR/tab-count-confession-motion-1.png" \
  -loop 1 -t 2.1 -i "$SCRIPT_DIR/tab-count-confession-motion-2.png" \
  -loop 1 -t 2.1 -i "$SCRIPT_DIR/tab-count-confession-motion-3.png" \
  -loop 1 -t 2.1 -i "$SCRIPT_DIR/tab-count-confession-motion-4.png" \
  -filter_complex "[0:v]fps=30,format=yuv420p[v0];[1:v]fps=30,format=yuv420p[v1];[2:v]fps=30,format=yuv420p[v2];[3:v]fps=30,format=yuv420p[v3];[v0][v1]xfade=transition=fade:duration=0.25:offset=1.85[x1];[x1][v2]xfade=transition=fade:duration=0.25:offset=3.70[x2];[x2][v3]xfade=transition=fade:duration=0.25:offset=5.55[outv]" \
  -map "[outv]" \
  -c:v libx264 \
  -preset medium \
  -crf 20 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$SCRIPT_DIR/tab-count-confession-motion-1080x1920.mp4"

printf '%s\n' "$SCRIPT_DIR/tab-count-confession-motion-1080x1920.mp4"
