'use strict';
// Ephemeral hosted-runner credentials. Never emit contents or include these
// files in artifacts. GitHub's environment approval controls access upstream.
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.RUNNER_TEMP;
if (!root || !path.isAbsolute(root) || !process.env.GITHUB_ACTIONS) throw Error('Hosted CI runner required');
const directory = path.join(root, 'blanc-evs-credentials');
if (process.argv[2] === '--clean') {
  fs.rmSync(directory, { recursive: true, force: true });
} else {
  if (process.argv.length !== 2 || !process.env.GITHUB_ENV) throw Error('Invalid CI credential setup');
  const names = { EVS_CONFIG_JSON: 'config.json', EVS_CACHE_JSON: 'cache.json' };
  for (const key of Object.keys(names)) {
    const value = process.env[key];
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw Error('Both protected EVS secrets must be valid JSON'); }
    if (!parsed || typeof parsed !== 'object') throw Error('Both protected EVS secrets are required');
  }
  fs.mkdirSync(directory, { mode: 0o700 });
  for (const [key, file] of Object.entries(names)) fs.writeFileSync(path.join(directory, file), process.env[key], { flag: 'wx', mode: 0o600 });
  const python = path.join(root, 'evs-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  fs.appendFileSync(process.env.GITHUB_ENV, `EVS_CONFIG_FILE=${path.join(directory, 'config.json')}\nEVS_CACHE_FILE=${path.join(directory, 'cache.json')}\nBLANC_EVS_PYTHON=${python}\n`);
}
