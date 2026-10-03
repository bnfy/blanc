# uBlock Origin distribution assessment — 2026-10-02

**Public distribution is blocked.** The current integration is an internal
candidate. Loading an optional extension in a separate sandboxed renderer does
not, by itself, establish that this is legally mere aggregation.

The concrete boundary uses native extension ports for ordinary browser API
records, and dedicated IPC for request decisions and CSS. It also calls uBO's
internal page-store methods for site controls. The adapter is injected into uBO
pages and several upstream host/lifecycle files are changed. Thus the adapted
extension is GPL-covered. Whether the purpose-built host plus browser form one
combined work remains unresolved; the assessment must cover semantics as well
as process boundaries. [GNU's aggregation guidance](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation)
and [GPLv3 sections 1, 5 and 6](https://www.gnu.org/licenses/gpl-3.0.html)
are the references, rather than an assumption that IPC avoids copyleft.

Blanc-owned files retain MIT. MIT permits inclusion in a GPL-governed combined
distribution, but it does not remove that distribution's GPL obligations.
Reserved Sunrise/Blanc identity material and third-party terms remain separate
and must be assessed against the concrete distributed combination. No upstream
exception, endorsement, trademark permission, or relicensing is assumed.

The candidate preserves the official 1.75.0 package verbatim, its license, a
hash-pinned source-tag archive, the reproducible host adaptation, dated patch,
and all host JavaScript source. Before clearing the gate:

1. Resolve the combined-work boundary and compatible distribution terms for the
   actual host, dependencies, and reserved identity assets.
2. Inventory every upstream bundled library/font/filter asset against the
   preferred source and individual notices. The source-tag tarball alone is
   insufficient evidence: upstream's build also copies/fetches assets.
3. Provide complete corresponding source, including necessary interface files,
   host changes, scripts and reproducible build instructions, alongside the
   exact candidate/release. Bind it to the released bytes and authenticated
   manifest. A link to moving branches or only the upstream tag is insufficient.
4. Review modified-file notices, package GPL text, installation information
   obligations where applicable, and the download-page/source offering.

`scripts/check-ublock-distribution.cjs` fails closed. Public release workflows
must pass it; platform acceptance flags must remain disabled meanwhile. Internal
owner validation is permitted, and must not publish a release or updater feed.
No first-party license or asset grant is changed by this candidate.

## Concrete source and notice findings

The offline `scripts/audit-ublock-sources.py` audit maps **644/658** release
files byte-for-byte to the pinned source archive. Common-platform API files,
the Norwegian locale rename, filtering engine, scriptlet source and WAT source
are accounted for. The remaining files are the transformed Chromium manifest
and thirteen separately fetched filter/metadata/license assets (EasyList,
EasyPrivacy, Peter Lowe, Public Suffix List, URLhaus and uAssets). Their exact
shipped bytes and adjacent notices are preserved in the pinned official ZIP
inventory, but their preferred-source/build input history is not yet bound to
this release. See `ublock/source-audit.json` for every file and match.

Additionally, matching a minified file inside the upstream source archive does
not prove that file is its preferred form for modification. The packaged
CSS Tree 2.2.1, js-beautify 1.14.7 and HSLuv 0.1.0 builds need their matching
preferred sources and build records. The embedded WAT sources include upstream
compilation instructions, but their compiler versions and output reproduction
still need verification. Font sources and complete component notices also need
review; notably the adapted Swatinem diff code identifies LGPLv3 in its header.
Existing upstream licenses/readmes are retained; these findings are not a grant
to relicense those components.

All modified upstream JS/HTML files carry a Blanc change notice dated
2026-10-02. The exact upstream package, source-tag archive, GPL text, adaptation
patch, output hashes and host source are included in the candidate payload and
checked after packing. The host adapter and browser exchange structured
request/tab records and call internal uBO page-store operations. This is enough
coupling to require a combined-work assessment, rather than certifying
aggregation from process separation. A complete combined-work analysis would
also have to cover the browser's runtime dependencies and native SDK boundary.

**Assessment result: do not distribute this candidate publicly yet.** The
available evidence does not establish the required source/notice completeness
or resolve the combined-work terms. Clearing the gate requires a reviewed
distribution determination and the specific missing source/build/notice inputs
above. No runtime fork, first-party license change or identity-asset waiver is
an authorized shortcut. Public releases and ordinary packaging fail closed;
an internal package created solely for owner inspection is explicitly marked
by its build command, and is not a release or updater artifact.
