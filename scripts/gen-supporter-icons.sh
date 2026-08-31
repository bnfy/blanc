#!/usr/bin/env bash
# Compatibility wrapper. The canonical brand builder now owns every free and
# supporter colorway so one mark change cannot leave a subset behind.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-brand-assets.js
