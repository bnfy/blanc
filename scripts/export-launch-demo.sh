#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
INPUT=${1:-"$ROOT_DIR/export/product-demos/island-demo-raw.mov"}
OUTPUT_DIR=${2:-"$ROOT_DIR/export/product-demos"}
MP4="$OUTPUT_DIR/island-demo.mp4"
GIF="$OUTPUT_DIR/island-demo.gif"
MP4_TMP="$OUTPUT_DIR/.island-demo.mp4.tmp"
GIF_TMP="$OUTPUT_DIR/.island-demo.gif.tmp"
MAX_GIF_BYTES=$((8 * 1024 * 1024))

for tool in ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "STOP: $tool is required" >&2
    exit 1
  fi
done

if [ ! -f "$INPUT" ]; then
  echo "STOP: recording not found: $INPUT" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
trap 'rm -f "$MP4_TMP" "$GIF_TMP"' EXIT

probe_stream() {
  ffprobe -v error -select_streams v:0 \
    -show_entries "stream=$1" -of default=noprint_wrappers=1:nokey=1 "$INPUT"
}

duration=$(probe_stream duration)
color_space=$(probe_stream color_space)
color_transfer=$(probe_stream color_transfer)
color_primaries=$(probe_stream color_primaries)

if ! awk -v seconds="$duration" 'BEGIN { exit !(seconds >= 18 && seconds <= 24) }'; then
  echo "STOP: the final recording must be 18–24 seconds; found ${duration}s" >&2
  exit 1
fi

for value in "$color_space" "$color_transfer" "$color_primaries"; do
  if [ -z "$value" ] || [ "$value" = "unknown" ] || [ "$value" = "unspecified" ]; then
    echo "STOP: the recording has incomplete color metadata; do not guess the input color space" >&2
    exit 1
  fi
done

color_filter=""
if [ "$color_space" != "bt709" ] || [ "$color_transfer" != "bt709" ] || [ "$color_primaries" != "bt709" ]; then
  color_filter="colorspace=all=bt709:format=yuv420p,"
fi

echo "Exporting MP4 from ${duration}s source (${color_space}/${color_transfer}/${color_primaries})"
ffmpeg -hide_banner -loglevel error -y -i "$INPUT" \
  -vf "${color_filter}fps=30,scale='min(1920,iw)':-2:flags=lanczos,format=yuv420p" \
  -an -c:v libx264 -preset medium -crf 18 -movflags +faststart \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -f mp4 "$MP4_TMP"
mv -f "$MP4_TMP" "$MP4"

gif_ok=false
for preset in "960 10 128" "800 10 96" "720 8 80" "640 8 64"; do
  IFS=' ' read -r width fps colors <<< "$preset"
  echo "Trying GIF at ${width}px, ${fps} fps, ${colors} colors"
  ffmpeg -hide_banner -loglevel error -y -i "$INPUT" \
    -filter_complex "[0:v]${color_filter}fps=${fps},scale=${width}:-2:flags=lanczos,split[v0][v1];[v0]palettegen=max_colors=${colors}:stats_mode=diff[p];[v1][p]paletteuse=dither=bayer:bayer_scale=3" \
    -an -f gif "$GIF_TMP"
  gif_bytes=$(wc -c < "$GIF_TMP" | tr -d ' ')
  if [ "$gif_bytes" -lt "$MAX_GIF_BYTES" ]; then
    mv -f "$GIF_TMP" "$GIF"
    gif_ok=true
    break
  fi
  rm -f "$GIF_TMP"
done

if [ "$gif_ok" != true ]; then
  echo "STOP: no tested GIF preset produced a file under 8 MiB" >&2
  exit 1
fi

mp4_summary=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,pix_fmt,color_space,color_transfer,color_primaries \
  -show_entries format=duration,size -of default=noprint_wrappers=1 "$MP4")
gif_bytes=$(wc -c < "$GIF" | tr -d ' ')

echo "$mp4_summary"
echo "gif_size_bytes=$gif_bytes"
echo "PASS: $MP4"
echo "PASS: $GIF"
