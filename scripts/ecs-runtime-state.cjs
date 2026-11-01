'use strict';
const fs = require('node:fs');
// Readers in the isolated diagnostics process must never observe half a JSON
// document while the candidate updates component status.
function writeRuntimeState(file, state) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
module.exports = { writeRuntimeState };
