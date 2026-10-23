'use strict';
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
async function inspectLinuxCdm(rootPid) {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')
    .map(row => row.trim().split(/\s+/).map(Number));
  const owned = new Set([rootPid]);
  for (let pass = 0; pass < 8; pass++) for (const [pid, ppid] of rows) if (owned.has(ppid)) owned.add(pid);
  const read = async (pid, name) => {
    assert.ok(Number.isSafeInteger(pid) && pid > 0 && owned.has(pid));
    try { return await fs.readFile(`/proc/${pid}/${name}`, 'utf8'); }
    catch { return execFileSync('sudo', ['-n', 'cat', `/proc/${pid}/${name}`], { encoding: 'utf8' }); }
  };
  const found = [];
  const roles = [];
  for (const pid of owned) {
    let command;
    try { command = await read(pid, 'cmdline'); } catch { continue; }
    const args = command.split('\0');
    if (!args.includes('--type=utility') && !args.includes('--type=renderer')) continue;
    const status = await read(pid, 'status');
    roles.push({ role: args.includes('--type=renderer') ? 'renderer' : args.find(arg => arg.startsWith('--utility-sub-type='))?.split('=')[1],
      sandboxType: args.find(arg => arg.startsWith('--service-sandbox-type='))?.split('=')[1],
      seccomp: Number(status.match(/^Seccomp:\s*(\d+)/m)?.[1]), noNewPrivs: Number(status.match(/^NoNewPrivs:\s*(\d+)/m)?.[1]),
      noSandboxFlag: args.includes('--no-sandbox') });
    if (!command.includes('media.mojom.CdmServiceBroker')) continue;
    const maps = await read(pid, 'maps');
    if (!maps.includes('libwidevinecdm.so')) continue;
    const seccomp = Number(status.match(/^Seccomp:\s*(\d+)/m)?.[1]);
    const noNewPrivs = Number(status.match(/^NoNewPrivs:\s*(\d+)/m)?.[1]);
    const namespace = kind => execFileSync('sudo', ['-n', 'readlink', `/proc/${pid}/ns/${kind}`], { encoding: 'utf8' }).trim();
    const parentNamespace = kind => execFileSync('sudo', ['-n', 'readlink', `/proc/${rootPid}/ns/${kind}`], { encoding: 'utf8' }).trim();
    const isolatedUserNamespace = namespace('user') !== parentNamespace('user');
    const isolatedPidNamespace = namespace('pid') !== parentNamespace('pid');
    found.push({ loadedWidevine: true, seccomp, noNewPrivs, isolatedUserNamespace, isolatedPidNamespace,
      sandboxType: roles.at(-1).sandboxType, noSandboxFlag: roles.at(-1).noSandboxFlag });
  }
  try {
    assert.equal(found.length, 1, 'exactly one owned sandboxed CDM service must load Widevine');
    assert.equal(found[0].seccomp, 2); assert.equal(found[0].noNewPrivs, 1);
    assert.ok(found[0].isolatedUserNamespace && found[0].isolatedPidNamespace, 'CDM must have separate user and PID namespaces');
    assert.equal(found[0].noSandboxFlag, false);
  } catch (error) { error.sandboxEvidence = { cdm: found, roles }; throw error; }
  return found[0];
}
module.exports = { inspectLinuxCdm };
