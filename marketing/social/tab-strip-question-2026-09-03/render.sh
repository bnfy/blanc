#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUTPUT="$ROOT/marketing/social/tab-strip-question-2026-09-03/feed-1080x1350.png"
CAPTURE="$ROOT/site/public/press/blanc-island-product-capture-v2.png"
FONT="/System/Library/Fonts/SFNS.ttf"
WORK="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

magick "$CAPTURE" \
  -resize '984x646^' \
  -gravity center \
  -extent 984x646 \
  "$WORK/capture.png"

magick -size 984x646 xc:none \
  -fill white \
  -draw 'roundrectangle 0,0 983,645 28,28' \
  "$WORK/mask.png"

magick "$WORK/capture.png" "$WORK/mask.png" \
  -alpha set \
  -compose DstIn \
  -composite \
  "$WORK/capture-rounded.png"

magick -size 1080x1350 xc:'#080808' \
  -font "$FONT" \
  -gravity northwest \
  -fill '#9a9a9a' \
  -pointsize 24 \
  -weight 600 \
  -kerning 7 \
  -annotate +54+80 'A DIFFERENT BROWSER DECISION' \
  -fill white \
  -pointsize 69 \
  -weight 600 \
  -kerning -2 \
  -interline-spacing 8 \
  -annotate +54+155 $'Moving the tab strip\nstill leaves a tab strip.' \
  -fill '#b8b8b8' \
  -pointsize 32 \
  -weight 400 \
  -kerning -0.5 \
  -interline-spacing 8 \
  -annotate +54+348 $'Blanc keeps tabs within reach inside the Island,\nso the page stays in front.' \
  -colorspace sRGB \
  -type TrueColor \
  "$WORK/base.png"

magick "$WORK/base.png" "$WORK/capture-rounded.png" \
  -geometry +48+476 \
  -composite \
  -stroke '#3a3a3a' \
  -strokewidth 2 \
  -fill none \
  -draw 'roundrectangle 48,476 1031,1121 28,28' \
  -stroke '#303030' \
  -strokewidth 1 \
  -draw 'line 54,1196 1026,1196' \
  -font "$FONT" \
  -gravity northwest \
  -stroke none \
  -fill white \
  -pointsize 30 \
  -weight 600 \
  -annotate +54+1231 'Blanc Browser' \
  -gravity northeast \
  -fill '#a5a5a5' \
  -pointsize 27 \
  -weight 400 \
  -annotate +54+1234 'blancbrowser.com' \
  -colorspace sRGB \
  -type TrueColor \
  -strip \
  "$OUTPUT"
