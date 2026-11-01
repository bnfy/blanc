#!/bin/sh
# Outbound-isolation check: prepares /Users/Shared/blanc-outbound from the
# owner's account, without root. The test user can't read ~/Documents, so it
# gets a local clone of this repository at HEAD (hard-linked objects), the one
# npm package the harness needs, the blocker assets and a runtime config for
# the current build. Usage: setup.sh runtime-config.json
set -eu
DIR=/Users/Shared/blanc-outbound
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
CONFIG=${1:?Usage: setup.sh runtime-config.json}
[ ! -e "$DIR" ] || { echo "$DIR exists; remove it or reuse it." >&2; exit 1; }
mkdir -p "$DIR/state" "$DIR/results"
chmod 755 "$DIR"
chmod 700 "$DIR/state"
chmod 1777 "$DIR/results"
git clone -q --local "$REPO" "$DIR/repo"
git -C "$DIR/repo" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
mkdir -p "$DIR/repo/node_modules/@cucumber"
cp -R "$REPO/node_modules/@cucumber/cucumber-expressions" "$DIR/repo/node_modules/@cucumber/"
for dep in $(/usr/local/bin/node -e "console.log(Object.keys(require('$REPO/node_modules/@cucumber/cucumber-expressions/package.json').dependencies||{}).join(' '))"); do
  cp -R "$REPO/node_modules/$dep" "$DIR/repo/node_modules/"
done
BLOCKER=$(/usr/local/bin/node -e "console.log(require('$CONFIG').blockerAssets)")
cp -R "$BLOCKER" "$DIR/blocker-assets"
/usr/local/bin/node -e "
const c=require('$CONFIG');c.evidence='$DIR/results';c.blockerAssets='$DIR/blocker-assets';
require('fs').writeFileSync('$DIR/runtime-config.json',JSON.stringify(c,null,2)+'\n');"
chmod -R a+rX "$DIR/repo" "$DIR/blocker-assets" "$DIR/runtime-config.json"
echo "Ready: $DIR (repo at $(git -C "$DIR/repo" rev-parse --short HEAD), candidate $(/usr/local/bin/node -e "console.log(require('$CONFIG').candidate)"))"
