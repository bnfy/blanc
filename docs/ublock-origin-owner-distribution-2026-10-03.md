# Owner-directed uBO distribution decision — October 3, 2026

The owner directed continuing toward shipment without waiting for outside
licensing clearance. This records that product/distribution decision and the
engineering evidence supporting the uBO payload. It is not FSF approval,
legal counsel's opinion, or a claim that an external reviewer signed off.
The FSF acknowledgment remains an acknowledgment only.

Owner direction in this task: “This seems like a self imposed blocker. Move
forward with the rest of the work required to ship the new build today!”
The subsequent owner-supplied record states that uBO may ship without outside
licensing clearance, on the owner's authority. No payment was authorized.

## Distribution boundary and retained terms

The modified uBO extension is distributed under GPL-3.0-or-later. Its LGPLv3
diff component and other third-party material retain their individual terms.
Blanc-owned source keeps its MIT grant; MIT permits recipients to use that
source with the GPL-covered extension. This decision does not relicense
third-party code, weaken copyleft, or represent the entire repository as MIT.

The distribution proceeds on the basis that the separately licensed browser
runtime, independently invoked 1Password utility/SDK, and identity artwork are
separate components. The SDK is not required to build, load or filter with uBO.
Its preferred native Rust source has not been obtained. The artwork now remains
in Blanc resources, outside the adapted extension; moving the image does not
prove a legal boundary. Whether the bespoke host makes a broader combined work
is the remaining architectural licensing judgment accepted for this decision,
not a technical fact established by process isolation. The earlier assessment
and that limitation remain available for review.

## Source and notice delivery checked

The covered uBO implementation, host modifications and their build inputs are
supplied in source form:

- The official 1.75.0 package remains byte-exact, with 658 hash-pinned files.
  Its matching source-tag archive contains the readable JS, WAT, HTML/CSS,
  interfaces and upstream build scripts.
- CSS Tree, js-beautify and HSLuv preferred project sources and build definitions
  are pinned in separate archives. Swatinem's original readable diff source is
  supplied alongside uBO's readable modified implementation. WAT source and
  compiler instructions accompany all four WASM modules.
- Both immutable uAssets snapshots and preferred filter templates are supplied;
  every separately fetched release input is accounted for. Font, icon and
  filter data retain their adjacent upstream license/attribution files.
- Blanc's complete host JS source, dated adaptation patch, input/output hashes
  and offline adaptation instructions ship with the payload. The full Blanc
  checkout, including build scripts and lockfile, is also available at the exact
  candidate commit and, for a release, its immutable version tag.
- The actual internal ASAR was checked against every pinned source input.
  Full unmodified GPLv3 and LGPLv3 texts are retained inside the ASAR and in
  `ThirdPartyLicenses/`; all 39 packaged license records passed verification.
  Copyright and change notices are retained. See the durable
  [packaged input record](evidence/ublock-brand-packaging-2026-10-03/packaged-inputs.json).

Byte-identical compiler reconstruction of HSLuv and optimized LZ4 was not run;
that is not presented as missing preferred program source or as a successful
rebuild. Independently licensed font sources and upstream EasyList assembly
history have not been rebuilt. Their exact supplied input bytes and notices
remain available. The source determination here covers the uBO implementation
and adaptation under the boundary above; it does not certify unavailable native
SDK source or resolve a different combined-work interpretation.

## Recipient source access and running modifications

For a candidate, the Actions run's immutable head SHA identifies the complete
checkout: `https://github.com/bnfy/blanc/tree/<candidate-head-sha>` and its
`https://github.com/bnfy/blanc/archive/<candidate-head-sha>.tar.gz` archive.
For a public release, use its immutable `v<version>` tag and GitHub's Source code
archive, alongside the bundled `ublock/sources/` archives and `adaptation.*`.
A moving branch alone is not the source offering. Each candidate/release record
must identify the exact SHA that supplied its packaged bytes.

The modification/build path uses ordinary Node and official Electron. From the
full checkout, `npm ci`, `npm start` and the dedicated real-blocking suite need
no Blanc signing key or upstream private extension key. The manifest key is
public. The source permits replacing the reserved artwork and choosing a fork's
own signing/provisioning identity. Blanc's release-only signing and hash checks
are build policy; source recipients can change that policy in their own build.
The offline adaptation command is documented in `ublock/README.md`.

## Gates this decision clears and gates it does not

`ublock/distribution.json` records an owner-directed assessment plus the source
and notice review above. It clears the distribution hold on this basis, rather
than waiting for an outside sign-off. It must be revisited when the covered
payload, source inventory, licensing boundary or third-party terms change.

All public platform enablement flags remain false until their required installed
candidate acceptance. This does not waive sandbox, signing, notarization,
updater, persistence, lifecycle or platform testing. CodeQL scanning stays on.
The 39 approved alert dispositions remain deferred until PR #490 leaves draft;
this decision does not authorize earlier dismissals, a merge or publication.
