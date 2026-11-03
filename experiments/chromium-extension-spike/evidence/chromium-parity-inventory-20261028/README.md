# Chromium parity preparation

Extracted 48 current product contracts from spec/parity-matrix.md into contracts.json. Desktop status describes the reference and does not establish Chromium parity. No browser run or build was performed.

L12 Mac-preview evaluation is accepted; feature parity remains open. The reference is bound below. Continue to compare the latest shipping Electron artifact and source, then map each contract to native implementation and existing evidence. Start with Island and persistent Split View: current migration notes explicitly leave full Glance conversion and whole-split cross-window drag unresolved. Preserve accepted L5 input/accessibility checks; repeat only changed interactions. Next assess tabs/groups, Spaces and Sync against their full contracts. This inventory is preparation, not a claim that these are the only missing features.

## Verified asset delta

prepare.mjs lines126–131 actually selects the reviewed1.38 files for manifest entries and validates their hashes. renderer-delta.json compares these exact pins against shipping1.44.1 source3b0c000b. The reviewed adapter has no keepGlanceAsSplit binding. This is source-level gap evidence; no runtime parity result is claimed. Port current UI with explicit bridge review rather than replacing pinned files blindly.

## Bridge trace

The actual API is prototype/host.js (adapter.js delegates to it). host.js exposes only previewGlancePair/previewGlanceClose for Glance; it lacks keepGlanceAsSplit. The native createSplit handler rejects tabs already belonging to a split, while temporary Glance currently uses AddToNewSplit. Therefore wiring Keep directly to createSplit would fail: conversion needs an explicit validated transition, preserving tab identity and protection while changing temporary membership to persistent membership. The current host also returns empty listRemoteTabs and listWorkspaces, plus empty searchSuggestions; these are additional feature parity gaps to map, not accepted implementations.

## Signature compatibility finding

The existing resizeSplit API is incompatible with the new renderer: native host accepts (tabPair, ratio), while1.44.1 calls (splitId, dividerIndex, axis, screenPoint). The new renderer also requires onSplitLayout geometry before creating interactive dividers. Reusing the name without translating coordinates and validating current split identity would break resizing. Preserve the working native divider until the full geometry event and action contract are ported. selectTab is multi-selection (clear/toggle/range/extend), not ordinary tab activation, so it must not be aliased to switchTab.

## Implemented bridge progress

Native Glance conversion and host selection are now implemented; resetSplit and coordinate-based resize support current two-pane columns. Production-blocker fixtures confirm loaded-page selection and divider behavior (28 assertions total). The new1.44.1 renderer remains staged, not active. onSplitLayout geometry now has a tested two-pane bridge; floating Glance, multi-pane layouts and other new APIs still require integration. The prior bridge trace describes the initial gap, not current absence of these implemented APIs.
