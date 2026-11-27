#!/usr/bin/env bash
# Read NUL-delimited paths, including both sides of renames. Keep the Site
# inputs in sync with the push paths in .github/workflows/site.yml.
set -euo pipefail

website=false
other=false
while IFS= read -r -d '' path; do
  case "$path" in
    site/*|test/site/*)
      website=true
      ;;
    package.json|package-lock.json|scripts/generate-site-changelog.mjs|scripts/ci-apt-mirror.sh|assets/wordmark/*|assets/sunrise-mark.svg|.github/workflows/site.yml|.github/workflows/unit-tests.yml|scripts/ci-website-paths.sh)
      website=true
      other=true
      ;;
    *)
      other=true
      ;;
  esac
done

website_only=false
if [[ $website == true && $other == false ]]; then
  website_only=true
fi
printf 'website=%s\nwebsite_only=%s\n' "$website" "$website_only"
