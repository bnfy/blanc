'use strict';
// Filesystem activation probes only. These are not vendor-signed CDM updates
// or protected playback with an older CDM binary; never report them as such.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { linuxPreloadEnv } = require('../../scripts/ecs-linux-preload-env.cjs');
const id = 'oimompecagnajdejgnnjijobebaeigek';
function run() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-cdm-cache-qualification-')));
  const app = path.join(root, 'app'), profile = path.join(root, 'profile');
  const report = { scope: 'synthetic cache activation only; no CDM binary executed', cases: [] };
  try {
    fs.mkdirSync(app); fs.mkdirSync(profile);
    fs.writeFileSync(path.join(app, 'blanc-cdm-preload.so'), 'synthetic shim marker');
    fs.writeFileSync(path.join(profile, 'ecs-candidate-profile.json'), '{"candidate":true}');
    for (const version of ['4.10.10.0', '4.10.11.0']) {
      const dir = path.join(profile, 'WidevineCdm', version);
      fs.mkdirSync(path.join(dir, '_platform_specific/linux_x64'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version }));
      fs.writeFileSync(path.join(dir, '_platform_specific/linux_x64/libwidevinecdm.so'), 'synthetic; never loaded');
    }
    for (const [name, selected] of [['registered-update', '4.10.11.0'], ['registered-rollback', '4.10.10.0']]) {
      fs.writeFileSync(path.join(profile, 'Local State'), JSON.stringify({ updateclientdata: { apps: { [id]: { pv: selected, max_pv: '4.10.11.0' } } } }));
      const actual = linuxPreloadEnv(app, profile).BLANC_ECS_CDM_PRELOAD_PATH;
      report.cases.push({ name, expected: selected, actual: path.basename(path.dirname(path.dirname(path.dirname(actual)))),
        passed: actual.includes(`/WidevineCdm/${selected}/`) });
    }
    report.passed = report.cases.every(item => item.passed);
    return report;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
if (require.main === module) {
  const result = run();
  fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
module.exports = { run };
