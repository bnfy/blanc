// Runs the full shipping inventory (f0) or a development subset under X11.
// --installed-sha256 comes from verifying the approved .deb in the workflow.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { suiteArguments } from '../windows/run-suite.mjs';
import { runtimeConfig } from './candidate.mjs';
import { sliceReport } from '../tests/slice-report.mjs';
import { sessionEnvironment } from '../tests/lib/linux-seed.mjs';

export { suiteArguments };

export function writeSuiteReport(directory, baseline) {
  if (baseline.developmentSubset || baseline.incomplete) throw Error('A subset or incomplete run cannot produce an S1 report');
  if (baseline.platform !== 'linux' || !['x64','arm64'].includes(baseline.arch)) throw Error('Expected a Linux baseline with its architecture');
  const {report, junit} = sliceReport(baseline, 'S1');
  const prefix = path.join(directory, 's1-linux-' + baseline.arch);
  fs.writeFileSync(prefix + '.json', JSON.stringify(report,null,1) + '\n', {flag:'wx'});
  fs.writeFileSync(prefix + '-junit.xml', junit, {flag:'wx'});
}

export function compareLayoutRuns(standard,scaled) {
  if (standard.platform !== 'linux' || scaled.platform !== 'linux' ||
      standard.candidate !== scaled.candidate || standard.arch !== scaled.arch ||
      standard.deviceScaleFactor !== 1 || scaled.deviceScaleFactor !== 2)
    throw Error('Expected 1x and 2x Linux runs of the same architecture and candidate');
  const results = new Map(standard.scenarios.flatMap(s=>s.cases.map(c=>[c.id,c.result])));
  const changes = [];
  let compared = 0;
  for (const scenario of scaled.scenarios) for (const c of scenario.cases) {
    if (c.result === 'not-run') continue;
    const at1x = results.get(c.id);
    if (!at1x || at1x === 'not-run') throw Error('No 1x result for '+c.id);
    compared++;
    if (at1x !== c.result) changes.push({id:c.id,at1x,at2x:c.result});
  }
  if (!compared) throw Error('No layout cases were rerun');
  return {candidate:standard.candidate,arch:standard.arch,compared,changes};
}

// Start the bus after isolating its activation environment. The keyring and
// every browser in this inventory (including relaunches and peers) share it.
export function runSuiteSession(args, parent = process.env, run = execFileSync) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-suite-session-'));
  try {
    const env = sessionEnvironment(path.join(scratch, 'home'), parent);
    if (parent.LC_ALL === undefined) delete env.LC_ALL;
    else env.LC_ALL = parent.LC_ALL;
    if (env.DISPLAY && !env.XAUTHORITY && parent.HOME) env.XAUTHORITY = path.join(parent.HOME, '.Xauthority');
    if (env.WAYLAND_DISPLAY && !path.isAbsolute(env.WAYLAND_DISPLAY) && parent.XDG_RUNTIME_DIR) {
      env.WAYLAND_DISPLAY = path.join(parent.XDG_RUNTIME_DIR, env.WAYLAND_DISPLAY);
    }
    run('dbus-run-session', ['--', process.execPath, fileURLToPath(import.meta.url), '--private-session', ...args],
      {env, stdio: 'inherit'});
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}

export function unlockSuiteKeyring(run = execFileSync) {
  const options = {encoding: 'utf8', timeout: 15000};
  run('gnome-keyring-daemon', ['--unlock', '--components=secrets'], {...options, input: 'disposable session only'});
  run('gnome-keyring-daemon', ['--start', '--components=secrets'], options);
  const attribute = ['blanc-suite', 'readiness'];
  run('secret-tool', ['store', '--label=Blanc suite check', ...attribute], {...options, input: 'ready'});
  if (run('secret-tool', ['lookup', ...attribute], options).trim() !== 'ready') {
    throw Error('Secret Service did not return the suite keyring probe');
  }
}

function main([candidateFolder, resultsFolder, ...options]) {
  if (!candidateFolder || !resultsFolder) throw Error('Usage: run-suite.mjs CANDIDATE_DIR RESULTS_DIR --slice=f0 [--only=text] [--installed-sha256=SHA256] [--scale=2]');
  const installed = options.find(arg => /^--installed-sha256=[a-f0-9]{64}$/.test(arg));
  if (installed) options.splice(options.indexOf(installed),1);
  const scaled = options.indexOf('--scale=2');
  if (scaled !== -1) options.splice(scaled,1);
  const extra = suiteArguments(options);
  if (extra.length) {
    const inventory = JSON.parse(fs.readFileSync(new URL('../scenarios/inventory.json',import.meta.url)));
    const ids = inventory.scenarios.flatMap(s=>s.cases.map(c=>c.id));
    const filters = extra[0].slice('--only='.length).split(',');
    if (filters.some(filter=>!filter || !ids.some(id=>id.includes(filter)))) throw Error('No suite case matches one or more filters');
  }
  if (scaled !== -1 && !extra.length) throw Error('The 2x layout rerun needs a case filter');
  const directory = path.resolve(candidateFolder);
  const out = path.resolve(resultsFolder);
  if (fs.existsSync(out)) throw Error('Refusing to overwrite prior results');
  const candidate = JSON.parse(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8'));
  if ((candidate.arch ?? 'x64') !== process.arch) throw Error('Linux candidate architecture does not match runner');
  const config = runtimeConfig(directory, candidate, installed?.split('=')[1]);
  config.developmentCandidate = extra.length > 0;
  config.deviceScaleFactor = scaled === -1 ? 1 : 2;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-linux-suite-'));
  try {
    const configFile = path.join(scratch, 'runtime-config.json');
    fs.writeFileSync(configFile, JSON.stringify(config));
    if (installed && !extra.length) {
      const probe = fileURLToPath(new URL('../tests/linux-import.test.mjs', import.meta.url));
      const result = spawnSync(process.execPath, ['--test',probe], {stdio:'inherit',env:{...process.env, BLANC_LINUX_IMPORT_CONFIG:configFile}});
      if (result.status !== 0) throw result.error ?? Error('Linux synthetic browser-home test failed');
    }
    const runner = fileURLToPath(new URL('../tests/runner.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [runner, configFile, out, ...extra], {stdio:'inherit'});
    if (run.error) throw run.error;
    // A completed inventory with failing or undefined cases remains L2 evidence.
    const baselineFile = path.join(out, 'baseline.json');
    if (![0, 1].includes(run.status) || !fs.existsSync(baselineFile)) throw Error('The runner did not complete (exit ' + (run.status ?? run.signal) + ')');
    if (!extra.length) writeSuiteReport(out, JSON.parse(fs.readFileSync(baselineFile)));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--private-session') {
      const {HOME, XDG_RUNTIME_DIR, XDG_DATA_HOME, DBUS_SESSION_BUS_ADDRESS} = process.env;
      if (!DBUS_SESSION_BUS_ADDRESS || !HOME || XDG_RUNTIME_DIR !== path.join(HOME, 'runtime') ||
          XDG_DATA_HOME !== path.join(HOME, '.local/share')) throw Error('Expected the disposable suite session');
      unlockSuiteKeyring();
      main(args.slice(1));
    } else {
      runSuiteSession(args);
    }
  } catch (error) { console.error('run-suite: ' + error.message); process.exitCode = 1; }
}
