#!/bin/bash
# Blanc's Sunrise art for the Windows beta's online installer and updater
# (W3 Task E1; owner, 2026-11-19: "A, Sunrise"). Made from the Sunrise master,
# assets/sunrise-mark-4096.png, with ImageMagick, as 24-bit BMPs the size of
# Chromium's art they replace. The middle of each background stays flat
# Blanc White (#F8F2E8) or Sunrise dark (#17130F), with the gold glow in the
# bottom corners only, because the window draws the logo and error art opaque.
# Writes the files and their hashes (art.lock.json), which
# chromium/tools/windows-updater-art.test.mjs checks.
#
#   bash chromium/tools/windows-updater-art.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARK="$ROOT/assets/sunrise-mark-4096.png"
ART="$ROOT/chromium/blanc/branding/win-beta/updater"
SERVED="$ROOT/cloudflare/update-worker/assets"
mkdir -p "$ART" "$SERVED"
# bmp OUT ARGS…: render ARGS as a 24-bit BMP3 to OUT.
bmp() { local out="$1"; shift; magick "$@" -alpha off -type TrueColor "BMP3:$out"; }
for theme in light dark; do
  if [ "$theme" = light ]; then BG='#F8F2E8'; GLOW='#E3B865'; OP=0.55; DIM='#6B6257'; else BG='#17130F'; GLOW='#D4AD66'; OP=0.40; DIM='#B5A38F'; fi
  glow() { echo "( -size 520x520 -define gradient:radii=260,200 radial-gradient:$GLOW-none -channel A -evaluate multiply $OP +channel ) -geometry $1 -composite"; }
  # The window's background: flat in the middle, a soft gold glow in each bottom corner.
  bmp "$ART/background_$theme.bmp" -size 496x282 "xc:$BG" $(glow -260+122) $(glow +236+122)
  # The error art: the Sunrise mark, muted.
  suffix=$([ "$theme" = light ] && echo '' || echo '_dark')
  bmp "$ART/error$suffix.bmp" -size 100x60 "xc:$BG" \( "$MARK" -resize 44x44 -fill "$DIM" -colorize 100 \) -gravity center -composite
  # The beta's logo, served by the update Worker (48×48 square, progress_wnd.cc).
  bmp "$SERVED/logo_$theme.bmp" -size 48x48 "xc:$BG" \( "$MARK" -resize 40x40 \) -gravity center -composite
done
# The setup's splash (120×120, splash_wnd.cc).
bmp "$ART/splash.bmp" -size 120x120 'xc:#F8F2E8' \( "$MARK" -resize 96x96 \) -gravity center -composite
node --input-type=module -e "
import fs from 'node:fs'; import crypto from 'node:crypto';
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const root = process.argv[1], files = {};
for (const rel of ['background_light.bmp', 'background_dark.bmp', 'error.bmp', 'error_dark.bmp', 'splash.bmp'])
  files['blanc/branding/win-beta/updater/' + rel] = sha(root + '/chromium/blanc/branding/win-beta/updater/' + rel);
for (const rel of ['logo_light.bmp', 'logo_dark.bmp']) files['../cloudflare/update-worker/assets/' + rel] = sha(root + '/cloudflare/update-worker/assets/' + rel);
fs.writeFileSync(root + '/chromium/blanc/branding/win-beta/updater/art.lock.json',
  JSON.stringify({source: sha(root + '/assets/sunrise-mark-4096.png'), files}, null, 2) + '\n');
" "$ROOT"
echo "Wrote the updater art and art.lock.json."
