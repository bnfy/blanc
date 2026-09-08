# Display-capture broker probes

Throwaway stock-Electron harnesses for the 2026-09-07 broker spec. Not Blanc
product code. After each run, delete the probe userData profile and raw logs;
keep the harness and dated `result.md` only.

Launch the Electron **binary**, not `electron .` through the npm wrapper, and
**unset `ELECTRON_RUN_AS_NODE`**. If that env is set, `require('electron')`
resolves to a string and `app` is undefined.

```sh
unset ELECTRON_RUN_AS_NODE
node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  experiments/display-capture-broker/admission-probe
```
