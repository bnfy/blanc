#!/usr/bin/env bash
# Refresh the shared Blanc end-card mark in the two retained pre-final motion
# cuts. Their interaction footage remains historical; only the brand tile is
# replaced from the current canonical website export.
set -euo pipefail

cd "$(dirname "$0")"
logo=../../../site/public/logo.png

for video in \
  quiet-tabs-vertical-quiet-highlight-v3-1080x1920.mp4 \
  quiet-tabs-vertical-expanded-island-v2-1080x1920.mp4
do
  output="${video%.mp4}.brand-refresh.mp4"
  duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$video")"
  ffmpeg -loglevel error -y \
    -i "$video" -loop 1 -i "$logo" \
    -filter_complex "[1:v]scale=190:190[mark];[0:v][mark]overlay=420:1210:enable='gte(t,12)'" \
    -c:v h264_videotoolbox -b:v 4M -maxrate 6M -bufsize 8M \
    -pix_fmt yuv420p -an -t "$duration" "$output"
  mv "$output" "$video"
  echo "updated $video"
done
