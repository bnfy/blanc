'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchMain, replaceExactly } = require('../../scripts/build-full-ecs-candidate.cjs');
const { graphicsArgs } = require('../../scripts/run-full-ecs-candidate.cjs');
const { applyCandidateGraphicsPolicy } = require('../../scripts/ecs-graphics-policy.cjs');
const root = path.resolve(__dirname, '../..');

test('packaged ECS graphics policy preserves acceleration and applies only to opted-in Mac candidates', () => {
  const flags = [];
  const app = { commandLine: { hasSwitch: () => false, appendSwitch: flag => flags.push(flag) } };
  const metadata = { blancEcsFullCandidate: true, blancEcsGraphicsPolicy: 'copy-video-frames' };
  assert.equal(applyCandidateGraphicsPolicy({ app, metadata, platform: 'darwin' }).applied, true);
  assert.deepEqual(flags, ['disable-gpu-memory-buffer-video-frames']);
  for (const platform of ['win32', 'linux']) assert.equal(applyCandidateGraphicsPolicy({ app, metadata, platform }).applied, false);
  assert.equal(applyCandidateGraphicsPolicy({ app, metadata: { blancEcsFullCandidate: true }, platform: 'darwin' }).applied, false);
  assert.throws(() => applyCandidateGraphicsPolicy({ app, metadata: {}, platform: 'darwin' }), /candidate identity/);
  const original = { commandLine: { ...app.commandLine, hasSwitch: () => true } };
  assert.equal(applyCandidateGraphicsPolicy({ app: original, metadata, platform: 'darwin' }).applied, false);
  assert.deepEqual(flags, ['disable-gpu-memory-buffer-video-frames']);
});

test('candidate graphics trials are opt-in and restrict switches to named modes', () => {
  assert.deepEqual(graphicsArgs(), []);
  assert.deepEqual(graphicsArgs('software-compositing'), ['--disable-gpu-compositing']);
  assert.deepEqual(graphicsArgs('software-decoding'), ['--disable-accelerated-video-decode']);
  assert.deepEqual(graphicsArgs('software-rendering'), ['--disable-gpu']);
  assert.deepEqual(graphicsArgs('gpu-ganesh'), ['--disable-skia-graphite']);
  assert.deepEqual(graphicsArgs('gpu-copy-video'), ['--disable-gpu-memory-buffer-video-frames']);
  assert.throws(() => graphicsArgs('--no-sandbox'), /Unknown candidate graphics mode/);
  assert.throws(() => graphicsArgs('__proto__'), /Unknown candidate graphics mode/);
  const flags = graphicsArgs('software-compositing'); flags.push('--no-sandbox');
  assert.deepEqual(graphicsArgs('software-compositing'), ['--disable-gpu-compositing']);
});

test('full ECS candidate patches staged startup, local documents and menu only', () => {
  const source = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  const result = patchMain(source);
  assert.notEqual(result, source);
  assert.ok(result.includes("await require('./ecs-full-bootstrap.cjs').ready;"));
  assert.ok(result.includes("require('./ecs-full-bootstrap.cjs').openLocalFiles(paths)"));
  assert.ok(result.includes('const admittedLocalFile = false;'));
  assert.ok(result.includes("require('./ecs-full-bootstrap.cjs').decorateMenu(template)"));
  assert.equal(fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8'), source);
  assert.throws(() => patchMain(result), /exactly once/);
});

test('staged replacements refuse missing or ambiguous source anchors', () => {
  assert.equal(replaceExactly('a+b', '+', '-', 'operator'), 'a-b');
  assert.throws(() => replaceExactly('a+b+c', '+', '-', 'operator'), /exactly once/);
  assert.throws(() => replaceExactly('abc', '+', '-', 'operator'), /exactly once/);
});

test('production does not load full candidate bootstrap and retains off file fuse', () => {
  const metadata = require('../../package.json');
  assert.equal(metadata.main, 'src/main/main.js');
  assert.equal(metadata.build.electronFuses.grantFileProtocolExtraPrivileges, false);
  assert.ok(!fs.existsSync(path.join(root, 'src/main/ecs-full-bootstrap.cjs')));
  assert.ok(!metadata.blancEcsFullCandidate);
  assert.ok(!metadata.blancEcsGraphicsPolicy);
  assert.ok(!fs.existsSync(path.join(root, 'src/main/ecs-graphics-policy.cjs')));
  assert.ok(!fs.existsSync(path.join(root, 'src/main/drm-runtime.js')));
  const { FileMatcher } = require('app-builder-lib/out/fileMatcher');
  const filter = new FileMatcher(root, '/unused', value => value, metadata.build.files).createFilter();
  for (const name of ['drm-runtime.js', 'ecs-full-bootstrap.cjs', 'ecs-local-html.cjs']) {
    const file = path.join(root, 'scripts', name);
    assert.equal(filter(file, fs.statSync(file)), false, `${name} excluded from production payload`);
  }
});
