'use strict';
const {execFileSync} = require('node:child_process');
// Keep process failure evidence instead of collapsing timeout, exit and signal
// failures to "Error". This fixed output-only probe never receives credentials.
function nativeProbe(executable, exec = execFileSync) {
  try {
    return JSON.parse(exec(executable, [], {encoding:'utf8', timeout:20000, maxBuffer:65536}));
  } catch (error) {
    return {failure:error.name, code:error.code ?? null, status:error.status ?? null,
      signal:error.signal ?? null, stderr:String(error.stderr ?? '').slice(-2000)};
  }
}
module.exports = {nativeProbe};
