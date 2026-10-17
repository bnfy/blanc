# Spike B: MV2/uBlock Origin source audit

October 17, 2026. Pinned Chromium 157.0.8103.6, pristine commit
`41520584daa68d0040db7746ae562a0ff82187f6`. Read-only source checkpoint;
no extension-system patch, uBO loading, native build or latency run performed.
Paths and lines below refer to this pin, not Chromium main.

## Findings

| Surface | Source | Finding / possible change |
| --- | --- | --- |
| Manifest parser | `extensions/common/extension.cc:60`, `:98` | Minimum supported manifest is still 2; ordinary MV2 parses. No parser restoration indicated. |
| Deprecation stages / switches | `extensions/browser/manifest_v2_handler.cc:111` | `ShouldDisableLegacyExtensions()` returns true unless the process-wide test override is set. This implementation has no staged feature or user flag branch. Old flag recipes cannot be inferred to work. |
| Installation and enablement | same file `:157`, `:171` | Affected extensions are blocked on installation/enablement. Changing this handler would modify extension-system behavior and needs assessment against Spike B's core-patch stop rule. |
| Startup and updates | same file `:196`, `:203`, `:255`, `:331` | Startup disables affected enabled extensions; re-enable logic checks the same gate, including installed/updated extension handling. Merely bypassing initial install is insufficient. |
| Test override | same file `:343` | `AllowMV2ExtensionsForTesting` requires the scoped test-enabler pass key. It is test infrastructure, not a supported production option. No test override was used. |
| Component exception | `extensions/browser/manifest_v2_util.cc:21`, `:38` | MV3 and non-extension types are excluded; component locations are explicitly unaffected. Policy-installed ordinary MV2 extensions are not exempted here. |
| Component admission | `chrome/browser/extensions/component_loader.cc:373` | Ordinary component addition checks the allowlist. `AddOrReplace` at `:389` bypasses it for developer testing. This is a potential separate packaging route to audit, not permission to grant uBO component privileges or claim normal extension support. |
| Enterprise policy | `components/policy/resources/templates/policy_definitions/Extensions/ExtensionManifestV2Availability.yaml:21` | Policy metadata is deprecated and supported only through 138. Its old description does not establish a functioning 157 exception. |
| Blocking API permission | `extensions/common/api/_permission_features.json:870` | MV2 extension/legacy-app blocking permission remains declared. The MV3 branch is policy-only. |
| Blocking listener enforcement | `extensions/browser/api/web_request/web_request_api.cc:574`, `:1397` | Blocking listener paths still check `kWebRequestBlocking`; no API removal established by this audit. Permission declaration alone is not runtime proof. |
| Store install status | `extensions/browser/api/webstore_private/extension_install_status.cc:170` | Store status checks the MV2 handler's installation gate. A component load would not prove Chrome Web Store distribution or updates. Server-side Store availability is outside this source audit. |
| Payload | `ublock/pinned.json`, `ublock/upstream/manifest.json:91`, `:107` in Blanc | Pinned uBO 1.75.0 uses manifest 2 and requests webRequestBlocking. Source/license/platform review remains required before adoption. |

## Decision and remaining audit work

Ordinary MV2 loading has a hard deprecation gate, while the parser and blocking
API remain. There is no evidence for a simple public flag or enterprise-policy
solution. Do not patch the deprecation handler or extension core as a routine
next step: that could trigger the approved Spike B stop condition.

The component exception means this checkpoint cannot yet conclude that every
packaged-provider route requires a core patch. Next trace component allowlisting,
privilege differences, background-page creation, update ownership, and the pinned
uBO package's API dependencies. Record whether a supported browser-owned provider
route is possible within scope; otherwise stop Spike B with the audit artifact.
An exhaustive gate inventory, runtime load, blocking/cosmetic parity, list-reload
hold, patch cost and runtime persistence are still pending. Spike B is in progress,
not passed or stopped. No production baseline or Decision 2 change follows.
