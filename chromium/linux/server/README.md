# Linux x64 and arm64 previews on the build server

Run setup as `blanc` on `blanc-android-build`, from its own clone of the repo,
`~/blanc-linux`. Never switch the branch of `~/blanc-desktop`: that clone is the
Windows work's. The Linux preview shares the Windows desktop lane's pinned
source, amd64 sysroot, depot_tools and applied source map.

Both platforms apply Blanc's source into the one checkout, and the last apply
wins. So apply from a commit that contains everything the Windows side last
applied (`chromium/next`, or a branch merged with it); otherwise the next
Windows build applies its own source back and rebuilds.

| Server path | Contents |
| --- | --- |
| `~/chromium-desktop/src` | Shared desktop Chromium checkout prepared by the Windows bootstrap |
| `~/chromium-desktop/src/out/BlancLinuxPrototype` | Native x64 preview |
| `~/chromium-desktop/src/out/BlancLinuxArm64Prototype` | Cross-compiled arm64 preview, with its own arguments, environment record and build cache |
| `~/chromium-desktop/.blanc-applied-source-map.json` | Source map from the last desktop apply |
| `~/blanc-evidence/linux/backups/` | Timestamped backups from applying desktop source |
| `~/blanc-evidence/linux/plans/` | Before and after guard logs for BlancWinPrototype and BlancWinBeta |

## Sharing the checkout

No Linux setup or build while a Windows build runs or a Windows candidate is
being prepared. Before each setup or build, check for a `chromium-beta-windows-*`
draft with `gh release list --repo bnfy/blanc` on the operator's Mac. Confirm
with the owner if it is unclear whether a release is between preflight and
publish. Pass `--windows-release-idle` to setup only after both checks clear.
An Android Siso build on this server also needs to finish first.

Linux setup, the Windows bootstrap and guarded desktop checks and builds take
`~/chromium-desktop/.blanc-checkout.lock` with an atomic `mkdir`. Each holder
releases the directory on exit. Setup runs both Windows checks before taking
the lock for sysroot installation (when requested), apply and GN generation,
then repeats them after releasing it.
A failed Windows check leaves its diagnostic in the timestamped log and setup
continues. If the guard left an old log in place, setup identifies it and skips
that output's comparison.

## Setup and rebuilds

```bash
cd ~/blanc-linux
bash chromium/linux/server/setup.sh --dry-run
bash chromium/linux/server/setup.sh --windows-release-idle
```

Both outputs require the Windows bootstrap's synced pin and installed amd64
sysroot for the x64 host. Setup defaults to `BlancLinuxPrototype`. For the
first arm64 setup, request the pinned sysroot explicitly:

```bash
bash chromium/linux/server/setup.sh --dry-run --install-arm64-sysroot
bash chromium/linux/server/setup.sh --windows-release-idle --install-arm64-sysroot
```

`--install-arm64-sysroot` selects `BlancLinuxArm64Prototype` and runs Chromium's
`install-sysroot.py --arch=arm64` under the checkout lock. The installer reads
`build/linux/sysroot_scripts/sysroots.json`, verifies the tarball's SHA-256,
and writes the full download URL to `build/linux/debian_bullseye_arm64-sysroot/.stamp`.
Subsequent arm64 setups reuse that installation:

```bash
bash chromium/linux/server/setup.sh --windows-release-idle --out=BlancLinuxArm64Prototype
```

Setup backs up source changes and generates the selected output using
`chromium/linux/args/prototype-x64.gn` or `prototype-arm64.gn`. A differing
installed `args.gn` needs manual review.

```bash
src="$HOME/chromium-desktop/src"
node="$src/third_party/node/linux/node-linux-x64/bin/node"
out=BlancLinuxArm64Prototype  # use BlancLinuxPrototype for x64
# First setup only, after reviewing the arguments and toolchain.
"$node" chromium/tools/build.mjs "$src" --record-environment "--out=$out"
# For each rebuild, inspect the plan before compiling.
"$node" chromium/tools/build.mjs "$src" --check "--out=$out"
"$node" chromium/tools/build.mjs "$src" --build "--out=$out"
```

The arm64 environment records both the amd64 host sysroot hash and the arm64
hash from the verified stamp. Once the owner's public repository key is in the
tree, the guard builds `chrome`, `chrome_sandbox` and
`chrome/installer/linux:prototype` (both the arm64 .deb and aarch64 .rpm for
the arm64 output). Before then, `--linux-packages` explicitly includes the
installer in a plan. Building packages requires that key and the pinned
blocker bundle.

If the guard stops on a large plan, inspect the selected output's
`blanc-build-plan.log`. Use `--allow-large-build` only for a reviewed,
intentional rebuild such as the approved first cold build.
