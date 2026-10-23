'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { withDiagnosticProfile } = require('../../scripts/drm-diagnostics.cjs');
const { candidatePaths } = require('./ecs-candidate-paths.cjs');
const { connect, targets, waitFor } = require('./ecs-local-html-smoke.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run(app, output) {
  const { full, executable } = candidatePaths(app);
  assert.equal(full, true);
  const report = { app, attempts: [] };
  try {
    await withDiagnosticProfile(async profile => {
      report.profile = profile;
      await fs.writeFile(path.join(profile, 'ecs-candidate-profile.json'), '{"candidate":true}');
      await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingVersion: 1, firstRunCompletedAt: Date.now(), usagePing: false, searchSuggestions: false }));
      for (const offline of [true, false]) {
        const attempt = { offline }; report.attempts.push(attempt);
        const { ELECTRON_RUN_AS_NODE: ignored, BLANC_ECS_LOCAL_HTML: ignoredHtml, ...env } = process.env;
        void ignored; void ignoredHtml;
        const port = 55826;
        const started = Date.now();
        const child = spawn(executable, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
          ...(offline ? ['--host-resolver-rules=MAP * ~NOTFOUND'] : [])], {
          env: { ...env, BLANC_ECS_FULL_PROFILE: profile, BLANC_ECS_FULL_SMOKE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let logs = '', chrome;
        child.stdout.on('data', data => { logs = (logs + data).slice(-3000); });
        child.stderr.on('data', data => { logs = (logs + data).slice(-3000); });
        const exited = new Promise(resolve => child.once('exit', (code, signal) => { attempt.exit = { code, signal }; resolve(); }));
        const readState = async () => JSON.parse(await fs.readFile(path.join(profile, 'ecs-runtime.json')));
        try {
          await waitFor(async () => {
            if (child.exitCode !== null) throw Error(`Candidate exited: ${logs}`);
            try { return (await readState()).browserReady; } catch { return false; }
          }, 'offline-safe browser readiness', 15000);
          attempt.startupMs = Date.now() - started;
          const target = await waitFor(async () => (await targets(port)).find(t => t.url === 'blanc-chrome://index/'), 'browser chrome');
          chrome = await connect(target);
          const id = await chrome.evaluate(() => window.browserAPI.createTab('blanc://newtab'));
          assert.ok(id);
          const settings = await waitFor(async () => (await targets(port)).find(t => t.url.startsWith('blanc://newtab')), 'working internal page');
          const page = await connect(settings);
          try { attempt.internalPageRendered = await waitFor(() => page.evaluate(() => (document.body?.innerText.length || 0) > 0), 'internal page render'); }
          finally { page.close(); }
          assert.equal(attempt.internalPageRendered, true);
          await waitFor(async () => {
            const state = await readState();
            return state.drm && state.drm.state !== 'preparing' && state;
          }, 'component attempt complete', 40000);
          attempt.runtime = await readState();
          if (offline) assert.ok(['installation-failed', 'timed-out'].includes(attempt.runtime.drm.state));
          else assert.equal(attempt.runtime.drm.state, 'ready');
          assert.equal(attempt.runtime.browserReady, true);
        } finally {
          attempt.logs = logs;
          if (chrome) chrome.close();
          if (child.exitCode === null) {
            await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
            await Promise.race([exited, delay(5000)]);
            if (child.exitCode === null) child.kill('SIGTERM');
            await Promise.race([exited, delay(3000)]);
            if (child.exitCode === null) child.kill('SIGKILL');
          }
          await exited;
        }
        assert.equal(attempt.exit.code, 0);
        // A new process must prove readiness, not reuse the previous marker.
        await fs.unlink(path.join(profile, 'ecs-runtime.json'));
      }
    });
    report.profileRemoved = await fs.stat(report.profile).then(() => false, () => true);
    assert.equal(report.profileRemoved, true);
    report.passed = true;
  } catch (error) { report.error = error.stack; throw error; }
  finally {
    report.profileRemoved = await fs.stat(report.profile).then(() => false, () => true);
    await fs.writeFile(output, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) run(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
