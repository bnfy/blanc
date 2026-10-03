# Exact signed Intel candidate intake — owner review

Native Intel CI passed the unsigned DMG-installed suite. The signed, notarized
x64 build 1273 passed Gatekeeper, strict-deep codesign and stapled-ticket checks
on the owner Mac, but its first Rosetta run failed with `ubo-startup-timeout`.
These separate observations do not prove the exact signed package on native
Intel. The private intake workflow above is prepared but has not run.

To close that gap without exporting an Apple key, the proposed transfer is:

1. Create an **unpublished draft** named `ubo-private-intel-1273-0872ed72`, bound
   to source `0872ed7225d3561e98fdee2f80cee1d12a72af09`. Upload only the reviewed
   `Blanc-1.27.0.dmg`; no updater metadata or public version tag is created.
2. Run `.github/workflows/ublock-origin.yml` with `installed_signed_intel=true` on the PR branch.
   Its native Intel runner authenticates the download and pins the exact DMG,
   executable and ASAR hashes. It installs from the read-only DMG, checks the
   pinned Developer ID, Gatekeeper, ticket, fuses and uBO bytes, then runs the
   production installed controls/restart/persistence/Quit and scripting suites.
3. Preserve sanitized observations in PR evidence. Remove the disposable draft,
   its uploaded asset and temporary tag after the run. The public release and
   updater feed remain unchanged throughout. No signing credential leaves the
   owner Mac; the binary already contains corresponding source and notices.

The DMG SHA-256 is
`58408120dc32ab25ab49ce76a98285fddfaa8991f69f8793bdee9b77ba34e38e`.
The exact installed binary SHA-256 is
`d7139aea0780fc823b5ca169199ca4c5bddeee8889841d440f647a0d7c3a2162`;
the ASAR SHA-256 is
`5c80d8702a062dd3e26f29dfdf48439e7d2dc690534da1eb667e5165b42064bf`.

The normal private-validation protocol deliberately never creates or modifies a
GitHub Release. This one-time transfer therefore needs the owner's explicit
exception before creating the draft. It does not authorize publication,
release tagging, CodeQL dismissal while draft, or platform enablement without
passing results. The first Rosetta failure remains recorded.

## Owner authorization

On October 3 the owner answered **“Yes—private transfer, test, and cleanup”**
to the exact question covering this temporary unpublished draft, native Intel
test and removal of the draft, asset and temporary tag. This supersedes the
normal no-release-object rule only for the transfer described above. Public
publication, CodeQL deferral and platform acceptance gates remain unchanged.

GitHub cannot dispatch a new workflow absent from the default branch. The
prepared job therefore uses the existing uBO workflow with a separate explicit
input. It retains the existing read-only repository token and has no publication
step. Draft visibility will be checked by the actual download.

The read-only intake [37163396194](https://github.com/bnfy/blanc/actions/runs/37163396194)
failed at draft download (`release not found`), before launching any app. On
October 3 the owner explicitly approved **“Yes—temporary job permission, test,
and remove”** for `contents: write` on this intake job only. This is required
for GitHub draft visibility and is removed after testing; the job still has no
publication step.
