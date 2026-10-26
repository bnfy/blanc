import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

// Linux Electron can stay alive after app.exit(), as in pdf-viewer-smoke.mjs.
// Only allow controlled cleanup after a complete successful report; a crash,
// incomplete report, failed assertion, or pre-report timeout remains a failure.
export async function collectDriverResult({ child, resultFile, expectedChecks,
  platform = process.platform, timeoutMs = 90000, graceMs = 3000,
  stop = () => child.kill('SIGKILL') }) {
  let spawnError;
  const onError = error => { spawnError = error; };
  child.once('error', onError);
  let onExit;
  const exited = new Promise(resolve => {
    onExit = (code, signal) => resolve({ code, signal });
    if (child.exitCode !== null || child.signalCode !== null) onExit(child.exitCode, child.signalCode);
    else child.once('exit', onExit);
  });
  const waitForExit = async ms => {
    let timer;
    try { return await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })]); }
    finally { clearTimeout(timer); }
  };
  try {
    const deadline = Date.now() + timeoutMs;
    while (!fs.existsSync(resultFile)) {
      if (spawnError) throw new Error(`Reader smoke could not start: ${spawnError.message}`);
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Reader smoke exited before reporting');
      if (Date.now() >= deadline) throw new Error('Reader smoke timed out before reporting');
      await sleep(50);
    }
    const report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    if (report.error || report.completed !== true || !Array.isArray(report.checks) || report.checks.length !== expectedChecks) {
      throw new Error(`Reader smoke did not complete all checks: ${report.error || 'incomplete report'}`);
    }
    const exit = await waitForExit(graceMs);
    if (!exit && platform !== 'linux') throw new Error('Reader smoke did not exit after reporting');
    if (exit && (exit.code !== 0 || exit.signal)) throw new Error(`Reader smoke exited unexpectedly: ${exit.signal || exit.code}`);
    return { ...report, controlledLinuxCleanup: !exit };
  } finally {
    if (child.exitCode === null && child.signalCode === null) { try { stop(); } catch {} }
    await waitForExit(2000);
    child.removeListener('error', onError);
    child.removeListener('exit', onExit);
  }
}
