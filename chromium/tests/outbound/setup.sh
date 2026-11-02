#!/bin/sh
# Outbound-isolation check: prepares /Users/Shared/blanc-outbound from the
# owner's account, without root. The test user can't read ~/Documents, so it
# gets a local clone of this repository at HEAD (hard-linked objects), the one
# npm package the harness needs, the blocker assets and a runtime config for
# the current build. Usage: setup.sh [--refresh] runtime-config.json
# --refresh brings an existing folder to this repository's HEAD and the given
# build (after a rebuild the runner refuses the old candidate), keeping its
# state and results, so a running pf log is untouched.
set -eu
DIR=/Users/Shared/blanc-outbound
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
REFRESH=false
[ "${1:-}" != --refresh ] || { REFRESH=true; shift; }
CONFIG=${1:?Usage: setup.sh [--refresh] runtime-config.json}
if $REFRESH; then
  [ -d "$DIR/repo" ] || { echo "$DIR isn't set up; run without --refresh." >&2; exit 1; }
  git -C "$DIR/repo" fetch -q "$REPO" HEAD
  git -C "$DIR/repo" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
  rm -rf "$DIR/blocker-assets"
else
  [ ! -e "$DIR" ] || { echo "$DIR exists; remove it, or use --refresh." >&2; exit 1; }
  mkdir -p "$DIR/state" "$DIR/results"
  chmod 755 "$DIR"
  chmod 700 "$DIR/state"
  chmod 1777 "$DIR/results"
  git clone -q --local "$REPO" "$DIR/repo"
  git -C "$DIR/repo" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
fi
# The one npm package the harness needs, with every dependency it pulls in.
for dep in $(/usr/local/bin/node -e "
const seen=new Set(),walk=n=>{if(seen.has(n))return;seen.add(n);
  for(const d of Object.keys(require('$REPO/node_modules/'+n+'/package.json').dependencies||{}))walk(d);};
walk('@cucumber/cucumber-expressions');console.log([...seen].join(' '))"); do
  mkdir -p "$DIR/repo/node_modules/$(dirname "$dep")"
  rm -rf "$DIR/repo/node_modules/$dep"
  cp -R "$REPO/node_modules/$dep" "$DIR/repo/node_modules/$dep"
done
BLOCKER=$(/usr/local/bin/node -e "console.log(require('$CONFIG').blockerAssets)")
cp -R "$BLOCKER" "$DIR/blocker-assets"
/usr/local/bin/node -e "
const c=require('$CONFIG');c.evidence='$DIR/results';c.blockerAssets='$DIR/blocker-assets';
require('fs').writeFileSync('$DIR/runtime-config.json',JSON.stringify(c,null,2)+'\n');"
chmod -R a+rX "$DIR/repo" "$DIR/blocker-assets" "$DIR/runtime-config.json"
echo "Ready: $DIR (repo at $(git -C "$DIR/repo" rev-parse --short HEAD), candidate $(/usr/local/bin/node -e "console.log(require('$CONFIG').candidate)"))"
