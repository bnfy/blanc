# Narrow unsafe-buffer compiler repair

The 158 build failed on `modules/custom_template.cc:52`: Chromium's unsafe-buffers plugin rejected indexing the raw `char` array used for uppercase percent-encoding. The reviewed, isolated candidate changes only its declaration to `constexpr std::string_view hex = "0123456789ABCDEF";`; the indices and encoding semantics are unchanged. The staged file remains untouched.

- Original staged SHA-256: `ccc6ce6e98fd7c75a0bf5980d7d47f60068bd57c032dae8d46e81e9d2f8ca4e0`.
- Isolated repaired SHA-256: `cfecac0516a96d6eb62f9ed0f0171dccb3f9ac12747a652fc600a7c516277c0c`.
- `chromium-syntax.log` records zero exit with the failed full translation unit's actual Clang flags and unsafe-buffers plugin, replacing only the isolated translation unit path and using `-fsyntax-only`. This does not establish a successful object build or runtime behavior.
- Recompiled the repaired standalone module and linked existing checked objects; `run.log` records `selected-shipping-checks=106 failures=0`, including the 75 vectors generated from the current verified shipping release's provider table. Exact commands, working directories, and statuses are in `commands.json`.
- An initial link attempt used the wrong working directory and failed to find cached libraries; `link-wrong-cwd.log` and `commands-wrong-cwd.json` preserve that failure. The corrected link used the existing 158 output directory and succeeded.

To stage, verify the old hash, apply exactly this line change to the existing 158 module and preserve the matching durable module source/manifest before running the normal incremental build guard. Do not clear caches, change toolchains or treat this syntax test as a successful build. Full affected browser checks remain required.

## Prepared single-file transaction and strengthened fixture

`stage-single-module.py` is a review draft and has **not** been executed. It stages only the 158 `custom_template.cc`, after checking exact old/new hashes, creating a durable byte-for-byte backup and journal, and verifying the replacement. Its rollback refuses unexpected hashes or a leftover temporary file. It has only been AST-checked; review and test with disposable paths before actual use. A stopped process can leave a journal or temporary file requiring inspection, and concurrent writers/builds must be stopped. The 158 checkout requires appropriate write access.

`browser-fixture.modules-candidate.mjs` is a separate syntax-checked draft of the browser fixture; the prior fixture and its evidence remain intact. In addition to its existing executable/framework hashes and build/zero-action flags, it requires `moduleSha256` to contain exactly the seven listed reviewed hashes, hashes each actual 158 staged module and UI source, and refuses mismatches before any browser launch. This is a source/receipt consistency check; it cannot by itself prove the recorded binary was built from those source bytes. The incomplete `native-receipt.template.json` sets the framework to null and both build flags to false. Only populate a separate actual receipt after the successful build and zero-action guard, recording real source/module/framework hashes and evidence; do not treat the template or prior syntax test as build success. The updated fixture has not been run.
