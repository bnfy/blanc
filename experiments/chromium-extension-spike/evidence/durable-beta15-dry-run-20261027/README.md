# Durable .15 preparation and dry-run scope — October 27

Staged source is `/Users/anthonyjloria/Projects/BlancChromium157Recovery/src`, pinned upstream `1aa07b638799e59656559ae6c6649d4b197f555e` (157.0.8103.15). The original .6 checkout/output is preserved. All 19 added native sources and every published upstream patch hash match the signed source baseline; inventory77files/186hunks with151clean Git dependencies passes. Compiler and argument hashes match recorded inputs.

**Final dry run:57,677scheduled actions,47,083clang compile commands,10,594other scheduled actions,zero pending buildflag generators.** Count is the measured current graph, not a guaranteed final execution count. The1000-action normal guard refused compilation as designed. 121metadata-only actions ran separately, including a module-map preprocessor operation; no C++ object compilation or linking occurred. Metadata generator and response-file failures were retained in the durable raw records.

354GiBfree was observed. Proposed8local workers; actual memory pressure should control any graceful pause/resume. No large-build authorization has been received. All raw plans and logs remain in `/Users/anthonyjloria/Projects/BlancChromium157Recovery/records/20261027`; final raw plan remains in `src/out/BlancPrototype/blanc-build-plan.log`, with its hash in build-scope.json.

Reconstruction found and corrected a duplicate startup guard and nondeterministic icon-resource rebuild using the reviewed patch/signed resource. Final all-patch hash equality confirms those corrections. Generated revision metadata was restored from pinned Git data; no hooks or toolchain upgrades. Staged dependency changes were fetched only from recorded official URLs. Node preparation dependencies were restored with lifecycle scripts disabled; Electron was not built.

Next, only after owner approval: one recovery build on this graph, normal zero-action guard and source/version checks. Recovery UI remains a separate incremental delta afterward. No runtime suite rerun, signing, launch-gate acceptance, merge or release in this checkpoint. Google baseline separate, Electron paused, latency deferred.
