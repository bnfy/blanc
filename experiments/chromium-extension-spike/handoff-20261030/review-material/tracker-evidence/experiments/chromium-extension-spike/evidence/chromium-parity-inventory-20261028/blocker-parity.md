# Blocker parity audit

The native production integration includes Blanc Blocker request decisions, cosmetics, procedural filtering and scriptlets. The live development launcher now supplies the production blocker assets; omitting them caused blank pages. The accepted signed candidate and this mutable development launch are separate identities.

The earlier uBO implementation still exists in ubo-component.mjs, ubo-upstream-delivery.js, readiness/reload and cosmetic replay fixtures. prepare.mjs still imports component and document/renderer-target preparation, and Chromium158 component_loader.cc retains the explicit blanc-ubo-component-probe admission. This is not evidence of a removed production provider: the code requires offline probe, explicit profile, proxy and resolver flags, with private component admission disabled. Do not turn it on for the normal dev profile as a shortcut.

Shipping Electron settings expose provider choice, readiness/recovery, enablement and site exceptions. Native host does not implement those full settings contracts. The snapshot also hardcoded adblockEnabled=false despite an active engine; a narrow correction now derives configured enablement from the same production asset flag, while blockerHealth remains the separate readiness signal. This does not add provider selection or site exceptions.

Remaining: recover the verified research mechanisms into a reviewed production provider lifecycle, integrate truthful settings and per-site controls, retain private Blanc Blocker protection, and verify startup/reload/failure behavior before exposing uBO. No claim that earlier research fixtures were a complete shipping experience. Full visual/feature parity remains open.
