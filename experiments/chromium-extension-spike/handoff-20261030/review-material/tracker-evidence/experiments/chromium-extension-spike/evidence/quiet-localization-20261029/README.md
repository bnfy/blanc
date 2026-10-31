# Native Quiet Settings localization

Shipping v1.45.1 source85883b1afa11375e1300130914d6f40c5388af21 reverified before work. generate-quiet-strings.mjs extracts9existing published keys from6selectable catalogs; generated header/provenance are under native/. --check and standalone locale fallback checks pass (de-AT, pt-PT, FR-ca, unsupported).

The native dialog now uses released title, label, hint, options, Save and Cancel copy. Locale comes from Chromium application locale; this does not implement Blanc's in-app language picker, OS-region formatting or full F44.

Candidatev37 built under8workers/7500cap (max1208), normal zero guard passed. Framework49b25ce10ef94d20f2dee38594bd7568a00fd67000647f655214def66e40f35b. Outer evidence/quiet-localization-20261029 contains raw build logs, preimages and receipt.

French native CUA inspection confirms translated title, control label, hint, four choices, Enregistrer/Annuler and readable wrapping without clipping. Native Save6h and canceled Off readback pass; owned browser exits0. Result ../custom-tab-name-20261029/browser-quiet-settings-ui-fr-v1.json. Test-only AppleLanguages argument also produced a literal(fr) startup navigation, blocked by the fixture proxy; no system preference or development profile was changed. This is scoped dialog verification, not full language/keyboard/screen-reader/platform acceptance.

Development browser remains on the prior verified copy; combined promotion is held by separate selected-search isolation qualification.
