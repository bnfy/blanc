#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT="$SCRIPT_DIR/tab-count-confession-tiktok-1080x1920.mp4"

node "$SCRIPT_DIR/render-tiktok.js"

ffmpeg -y -v error \
  -loop 1 -t 0.80 -i "$SCRIPT_DIR/tab-count-confession-tiktok-1.png" \
  -loop 1 -t 0.48 -i "$SCRIPT_DIR/tab-count-confession-tiktok-2.png" \
  -loop 1 -t 0.48 -i "$SCRIPT_DIR/tab-count-confession-tiktok-3.png" \
  -loop 1 -t 0.48 -i "$SCRIPT_DIR/tab-count-confession-tiktok-4.png" \
  -loop 1 -t 0.72 -i "$SCRIPT_DIR/tab-count-confession-tiktok-5.png" \
  -loop 1 -t 1.55 -i "$SCRIPT_DIR/tab-count-confession-tiktok-6.png" \
  -loop 1 -t 1.75 -i "$SCRIPT_DIR/tab-count-confession-tiktok-7.png" \
  -loop 1 -t 1.10 -i "$SCRIPT_DIR/tab-count-confession-tiktok-8.png" \
  -filter_complex "[0:v]fps=30,scale=1080:1920,zoompan=z='min(zoom+0.0016,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920,trim=duration=0.80,setpts=PTS-STARTPTS,setsar=1[v0];[1:v]fps=30,scale=1080:1920,trim=duration=0.48,setpts=PTS-STARTPTS,setsar=1[v1];[2:v]fps=30,scale=1080:1920,trim=duration=0.48,setpts=PTS-STARTPTS,setsar=1[v2];[3:v]fps=30,scale=1080:1920,trim=duration=0.48,setpts=PTS-STARTPTS,setsar=1[v3];[4:v]fps=30,scale=1080:1920,trim=duration=0.72,setpts=PTS-STARTPTS,setsar=1[v4];[5:v]fps=30,scale=1080:1920,zoompan=z='min(zoom+0.0007,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920,trim=duration=1.55,setpts=PTS-STARTPTS,setsar=1[v5];[6:v]fps=30,scale=1080:1920,zoompan=z='min(zoom+0.0006,1.030)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920,trim=duration=1.75,setpts=PTS-STARTPTS,setsar=1[v6];[7:v]fps=30,scale=1080:1920,trim=duration=1.10,setpts=PTS-STARTPTS,setsar=1[v7];[v0][v1][v2][v3][v4][v5][v6][v7]concat=n=8:v=1:a=0,format=yuv420p[outv]" \
  -map "[outv]" \
  -c:v libx264 \
  -preset medium \
  -crf 18 \
  -pix_fmt yuv420p \
  -r 30 \
  -movflags +faststart \
  "$OUTPUT"

printf '%s\n' "$OUTPUT"
