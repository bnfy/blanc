// `first | second` without a shell: each program gets its arguments as an
// array, and the first one's whole output becomes the second one's input.
// Package archives fit in memory (a Blanc Beta package unpacks to well under
// 2 GiB), and a failure in either program throws, as `set -o pipefail` would.
import {spawnSync} from 'node:child_process';

const MAX = 2 ** 31 - 1;

function finished(result, program) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${program}: ${result.stderr?.toString().trim() || result.signal || result.status}`);
  }
  return result.stdout;
}

export function pipeSync([program, args], [nextProgram, nextArgs], {cwd} = {}) {
  const input = finished(spawnSync(program, args, {cwd, maxBuffer: MAX}), program);
  return finished(spawnSync(nextProgram, nextArgs, {cwd, input, maxBuffer: MAX}), nextProgram);
}
