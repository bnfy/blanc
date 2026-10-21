# Windows no-script fixture readiness

Current-head Windows job 119413974340 failed at the first active-control URL discovery, before protection assertions. The five-second generic lookup reported undefined. Underlying Windows scheduling cause remains unproven.

The fixture now waits up to 30 seconds for the returned tab identity to commit the authored URL, rejecting disappearance and Blanc error navigation and retaining state/hit diagnostics. Playwright attachment is a separate bounded step. It does not retry navigation, disable protection, or weaken active/protected/off assertions.

Validation: normal local desktop suite and a disposable copy with a 6500ms active-control HTTP response delay both pass. The delayed copy is retained as evidence, not a production test entrypoint. Syntax and scoped ESLint pass. These Mac runs do not qualify Windows acceptance; new-head CI must confirm. No native/Electron build or latency run. Permanent profiles untouched.
