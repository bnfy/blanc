'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { extractFile } = require('@electron/asar');
const graphicsModes = Object.freeze({
  candidate: [],
  default: [],
  'software-compositing': ['--disable-gpu-compositing'],
  'software-decoding': ['--disable-accelerated-video-decode'],
  'software-rendering': ['--disable-gpu'],
  'gpu-ganesh': ['--disable-skia-graphite'],
  'gpu-copy-video': ['--disable-gpu-memory-buffer-video-frames'],
});
function graphicsArgs(mode = 'candidate') {
  if (!Object.hasOwn(graphicsModes, mode)) throw Error(`Unknown candidate graphics mode: ${mode}`);
  return [...graphicsModes[mode]];
}
async function run(appPath, { debug = false, graphics = 'candidate' } = {}) {
  const graphicsSwitches = graphicsArgs(graphics);
  const linux = process.platform === 'linux';
  if (!linux && process.platform !== 'darwin') throw Error('This isolated launcher supports macOS and Linux');
  const app = await fs.realpath(appPath);
  const metadata = JSON.parse(extractFile(path.join(app, linux ? 'resources/app.asar' : 'Contents/Resources/app.asar'), 'package.json'));
  if (metadata.name !== 'blanc-ecs-full-candidate' || metadata.blancEcsFullCandidate !== true) throw Error('Not a full isolated ECS candidate');
  if (!linux) execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  const staging = path.resolve(app, linux ? '../..' : '../../..');
  if (!path.basename(staging).startsWith('blanc-ecs-full-')) throw Error('Candidate is outside its isolated staging directory');
  const profile = path.join(staging, 'profile');
  await fs.mkdir(profile, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(profile)).isSymbolicLink()) throw Error('Profile must not be a symlink');
  const marker = path.join(profile, 'ecs-candidate-profile.json');
  if (!(await fs.stat(marker).catch(() => null))) {
    if ((await fs.readdir(profile)).length) throw Error('Refusing to adopt a non-empty unmarked profile');
    await fs.writeFile(marker, JSON.stringify({ candidate: true }), { mode: 0o600, flag: 'wx' });
  }
  const { ELECTRON_RUN_AS_NODE: ignored, BLANC_ECS_FULL_SMOKE: ignoredSmoke, BLANC_ECS_LOCAL_HTML: ignoredFile, ...env } = process.env;
  void ignored; void ignoredSmoke; void ignoredFile;
  console.log(`Isolated full candidate profile (retained for testing): ${profile}`);
  console.log(`Candidate-only graphics mode: ${graphics}`);
  const args = [`--user-data-dir=${profile}`, ...(graphics === 'candidate' ? [] : ['--blanc-ecs-original-graphics']), ...graphicsSwitches,
    ...(debug ? ['--remote-debugging-port=55824', '--remote-debugging-address=127.0.0.1'] : [])];
  if (typeof metadata.productName !== 'string' || path.basename(metadata.productName) !== metadata.productName) throw Error('Invalid candidate executable name');
  if (typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+-ecs\.\d+$/.test(metadata.version)) throw Error('Invalid candidate version');
  const executable = linux ? path.join(staging, 'dist', `Blanc-${metadata.version}.AppImage`) : path.join(app, 'Contents/MacOS', metadata.productName);
  const launchEnv = linux ? { APPIMAGE_EXTRACT_AND_RUN: '1', ...require('./ecs-linux-preload-env.cjs').linuxPreloadEnv(app, profile) } : {};
  const child = spawn(executable, args, {
    env: { ...env, ...launchEnv, BLANC_ECS_FULL_PROFILE: profile }, stdio: 'inherit',
  });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(Error(`Candidate exited ${code}`))); });
}
if (require.main === module) run(process.argv[2] || '', {
  debug: process.argv.includes('--debug'),
  graphics: process.argv.slice(3).find(arg => arg.startsWith('--graphics='))?.slice('--graphics='.length) || 'candidate',
}).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run, graphicsArgs };
