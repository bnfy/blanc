#!/usr/bin/env bash
# Compatibility wrapper retained for older tooling. The canonical brand builder
# owns current and archived icon artwork so one mark change cannot leave a subset behind.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-brand-assets.js
