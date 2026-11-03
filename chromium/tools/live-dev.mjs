#!/usr/bin/env node
// The owner's live dev instance (owner, 2026-11-03): after each native
// build, the newest candidate runs in its own window with a persistent
// profile, so progress shows as it lands.
//   node chromium/tools/live-dev.mjs <runtime-config.json>
// It copies the build out of out/BlancPrototype (every build rewrites it),
// quits only the live instance it started before (SIGTERM, which saves the
// session), and reopens with that profile, restoring its tabs. Production
// behaviour: no test hooks, proxy or mock Keychain. It never touches any
// other Blanc process or profile, including earlier dev instances.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const LIVE = path.join(os.homedir(), 'Projects/BlancChromium158/live');
const record = path.join(LIVE, 'live.json');

// Live instances this tool started: their executable is inside LIVE.
export function liveProcesses(listing) {
  return listing.split('\n').map(line => /^\s*(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .filter(([, , command]) => command.startsWith(LIVE + '/') && command.includes('.app/Contents/MacOS/') && !command.includes(' Helper'))
    .map(([, pid, command]) => ({pid: Number(pid), command}));
}

// The copy the last launch ran, read in one step (no check-then-read race).
function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync(record, 'utf8')).app ?? null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const list = () => liveProcesses(execFileSync('ps', ['-axo', 'pid=,command='], {encoding: 'utf8'}));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main(configFile) {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const source = config.executable.replace(/\/Contents\/MacOS\/[^/]+$/, '');
  if (!source.endsWith('.app') || !config.candidate || !config.blockerAssets) throw Error('Runtime config needs executable, candidate and blockerAssets');
  fs.mkdirSync(path.join(LIVE, 'profile'), {recursive: true, mode: 0o700});
  const app = path.join(LIVE, `${config.candidate}.app`);
  if (!fs.existsSync(app)) execFileSync('ditto', [source, app]);
  for (const {pid} of list()) {
    process.kill(pid, 'SIGTERM');
    for (let i = 0; i < 60 && list().some(p => p.pid === pid); i++) await sleep(250);
    if (list().some(p => p.pid === pid)) throw Error(`Live instance ${pid} did not quit; left running`);
  }
  // LaunchServices starts it, so it never belongs to this process tree.
  execFileSync('open', ['-n', '-a', app, '--args', `--user-data-dir=${path.join(LIVE, 'profile')}`,
    `--blanc-blocker-assets=${config.blockerAssets}`, '--no-first-run', '--no-default-browser-check', '--restore-last-session']);
  let running = [];
  for (let i = 0; i < 40 && !running.length; i++) { await sleep(250); running = list().filter(p => p.command.startsWith(app + '/')); }
  if (!running.length) throw Error('The live instance did not start');
  // Keep the running copy and the one before it.
  const previous = readPrevious();
  fs.writeFileSync(record, JSON.stringify({candidate: config.candidate, app, previous: previous !== app ? previous : null,
    pid: running[0].pid, startedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const name of fs.readdirSync(LIVE).filter(name => name.endsWith('.app'))) {
    const copy = path.join(LIVE, name);
    if (copy !== app && copy !== previous) fs.rmSync(copy, {recursive: true, force: true});
  }
  console.log(`Live instance ${config.candidate} running: PID ${running[0].pid}`);
}

if (process.argv[1]?.endsWith('live-dev.mjs')) {
  if (!process.argv[2]) throw Error('Usage: live-dev.mjs <runtime-config.json>');
  await main(process.argv[2]);
}
