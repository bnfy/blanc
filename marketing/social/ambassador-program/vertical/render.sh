#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
SOURCE="$ROOT/output/playwright/ambassador-vertical/ambassador-live-scroll-vertical.webm"
OUT="$ROOT/marketing/social/ambassador-program/vertical/blanc-ambassador-pilot-1080x1920.mp4"
TEXT_DIR="$ROOT/marketing/social/ambassador-program/vertical"

test -f "$SOURCE"

for frame in 1 2 3; do
  /opt/homebrew/bin/rsvg-convert \
    -w 1080 \
    -h 1920 \
    "$TEXT_DIR/overlay-$frame.svg" \
    -o "$TEXT_DIR/overlay-$frame.png"
done

/opt/homebrew/bin/ffmpeg -y -loglevel error \
  -i "$SOURCE" \
  -loop 1 -framerate 30 -i "$TEXT_DIR/overlay-1.png" \
  -loop 1 -framerate 30 -i "$TEXT_DIR/overlay-2.png" \
  -loop 1 -framerate 30 -i "$TEXT_DIR/overlay-3.png" \
  -filter_complex "[0:v]trim=start=8.4:duration=9,setpts=PTS-STARTPTS,scale=1080:1920:flags=lanczos[base];[base][1:v]overlay=0:0:enable='between(t,0,2.999)'[one];[one][2:v]overlay=0:0:enable='between(t,3,5.999)'[two];[two][3:v]overlay=0:0:enable='between(t,6,9)',fade=t=in:st=0:d=0.2,fade=t=out:st=8.7:d=0.3[outv]" \
  -map "[outv]" \
  -an \
  -t 9 \
  -r 30 \
  -c:v libx264 \
  -preset medium \
  -crf 18 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUT"

echo "$OUT"
