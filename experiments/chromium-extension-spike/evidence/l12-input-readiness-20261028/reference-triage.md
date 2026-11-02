# Remaining reference mismatches: Chromium triage

All 44 retained mismatches are native=true/reference=false: 11 distinct outcomes, each observed in two regular and two private reference sessions. There is no native=false/reference=true case in this comparison. This audit reuses observations and does not rerun acceptance.

- timer target defused: 4 retained observations; native passes.
- initial text: 4 retained observations; native passes.
- initial styled: 4 retained observations; native passes.
- initial upward: 4 retained observations; native passes.
- initial xpath: 4 retained observations; native passes.
- moved upward follows leaf: 4 retained observations; native passes.
- timer mutation rematches text: 4 retained observations; native passes.
- timer mutation rematches styled: 4 retained observations; native passes.
- timer mutation rematches upward: 4 retained observations; native passes.
- timer mutation rematches xpath: 4 retained observations; native passes.
- inserted subtree evaluated: 4 retained observations; native passes.

Source mapping: native/blocker/bundle.mjs enables loadExtendedSelectors; native/blocker/prepare.mjs inserts BlancDocumentStart at RunScriptsAtDocumentStart; native/blocker/procedural_renderer.mjs observes mutations. The retained reference diagnostic records loadExtendedSelectors=false and first-inline timer failure. No Chromium repair is indicated by these mismatches. Disabling native procedural coverage or delaying its scriptlets would weaken protection and is rejected.

These findings do not establish broader real-page parity or close L12. Reference execution/repair remains paused. No comparator substitution, waiver, build, signing or test rerun occurred.
