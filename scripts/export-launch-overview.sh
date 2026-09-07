#!/usr/bin/env bash
# Export an already edited/captioned overview master; never retime real actions.
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
INPUT=${1:-"$ROOT_DIR/output/product-demos/launch-overview-master.mov"}
OUTPUT_DIR=${2:-"$ROOT_DIR/output/product-demos/overview-review"}

for tool in ffmpeg ffprobe; do
  command -v "$tool" >/dev/null 2>&1 || { echo "STOP: $tool is required" >&2; exit 1; }
done
[ -f "$INPUT" ] || { echo "STOP: edited master not found: $INPUT" >&2; exit 1; }

probe() {
  ffprobe -v error -select_streams v:0 -show_entries "stream=$1" \
    -of default=noprint_wrappers=1:nokey=1 "$INPUT"
}
duration=$(probe duration)
width=$(probe width)
height=$(probe height)
if ! awk -v seconds="$duration" 'BEGIN { exit !(seconds >= 40 && seconds <= 44) }'; then
  echo "STOP: overview master must be 40–44 seconds; found ${duration}s" >&2
  exit 1
fi
if [ "$width" -lt 1920 ] || [ "$height" -lt 1200 ] || [ "$((width * 5))" -ne "$((height * 8))" ]; then
  echo "STOP: master must be 16:10 and at least 1920×1200, with captions already in its reserved margin" >&2
  exit 1
fi
space=$(probe color_space)
transfer=$(probe color_transfer)
primaries=$(probe color_primaries)
for value in "$space" "$transfer" "$primaries"; do
  case "$value" in
    ''|unknown|unspecified) echo "STOP: incomplete source color metadata; do not guess" >&2; exit 1 ;;
  esac
done
color_filter=""
if [ "$space/$transfer/$primaries" != "bt709/bt709/bt709" ]; then
  color_filter="colorspace=all=bt709:format=yuv420p,"
fi

mkdir -p "$OUTPUT_DIR"
MP4="$OUTPUT_DIR/blanc-launch-overview.mp4"
POSTER="$OUTPUT_DIR/blanc-launch-overview-poster.png"
if [ -e "$MP4" ] || [ -e "$POSTER" ]; then
  echo "STOP: review output already exists; use a new take directory" >&2
  exit 1
fi
TEMP_DIR=$(mktemp -d "$OUTPUT_DIR/.overview-export.XXXXXX")
trap 'rm -f "$TEMP_DIR/video.mp4" "$TEMP_DIR/poster.png"; rmdir "$TEMP_DIR"' EXIT
ffmpeg -hide_banner -loglevel error -nostdin -i "$INPUT" \
  -map 0:v:0 -vf "${color_filter}fps=30,scale=1920:1200:flags=lanczos,setsar=1,format=yuv420p" \
  -an -c:v libx264 -preset medium -crf 18 -movflags +faststart \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 "$TEMP_DIR/video.mp4"

# The opening frame must be the approved homepage-backed resting Island shot.
ffmpeg -hide_banner -loglevel error -nostdin -i "$TEMP_DIR/video.mp4" \
  -frames:v 1 -update 1 "$TEMP_DIR/poster.png"
summary=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,color_space,color_transfer,color_primaries \
  -of default=noprint_wrappers=1 "$TEMP_DIR/video.mp4")
for expected in codec_name=h264 width=1920 height=1200 pix_fmt=yuv420p r_frame_rate=30/1 color_space=bt709 color_transfer=bt709 color_primaries=bt709; do
  if ! printf '%s\n' "$summary" | grep -qx "$expected"; then
    echo "STOP: export verification failed: $expected" >&2; exit 1
  fi
done
audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$TEMP_DIR/video.mp4")
[ -z "$audio" ] || { echo "STOP: export contains audio" >&2; exit 1; }
out_duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TEMP_DIR/video.mp4")
awk -v seconds="$out_duration" 'BEGIN { exit !(seconds >= 40 && seconds <= 44) }' || {
  echo "STOP: exported duration outside 40–44 seconds" >&2; exit 1;
}
mv "$TEMP_DIR/video.mp4" "$MP4"
mv "$TEMP_DIR/poster.png" "$POSTER"
printf '%s\n' "$summary" "duration=$out_duration" "PASS: $MP4" "PASS: $POSTER" \
  'LOCAL REVIEW ONLY: inspect every action and caption; owner approval is required before upload.'
