import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const read = file => readFileSync(new URL('../blanc/' + file, import.meta.url), 'utf8');
const ui = read('browser/ui/blanc_prototype_ui.cc');
const desktop = '#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN) || BUILDFLAG(IS_LINUX)';

function precedingDirective(source, marker) {
  const offset = source.indexOf(marker);
  assert.notEqual(offset, -1, marker);
  return source.slice(0, offset).match(/^#.*$/gm)?.at(-1);
}

for (const marker of ['#include "blanc/browser/ui/tab_switch_keys.h"',
                      'if (message[1].GetString() == "postTabSwitchKey"',
                      'if (!IsIslandWindow(browser) ||']) {
  test('desktop tab switch guard for ' + marker, () => {
    const section = marker.startsWith('if (!IsIslandWindow')
      ? ui.slice(ui.indexOf('bool TabSwitchCommand(')) : ui;
    assert.equal(precedingDirective(section, marker), desktop);
  });
}

test('only the Linux Island creation path installs the watcher eagerly', () => {
  const create = ui.match(/std::unique_ptr<views::WebView> CreateIsland\([\s\S]+?^}/m)?.[0];
  assert.ok(create);
  assert.equal(precedingDirective(create, 'blanc::InstallTabSwitchWatcher();'), '#if BUILDFLAG(IS_LINUX)');
});

test('GN builds the aura watcher and platform entry points on their own targets', () => {
  const gn = read('ui.gni');
  for (const [source, condition] of [
    ['aura.cc', 'is_win || is_linux'], ['linux.cc', 'is_linux'],
    ['win.cc', 'is_win'], ['mac.mm', 'is_mac'],
  ]) {
    const filename = '"//blanc/browser/ui/tab_switch_keys_' + source + '"';
    assert.equal(gn.split(filename).length, 2, filename);
    const prefix = gn.slice(0, gn.indexOf(filename));
    const block = prefix.slice(prefix.lastIndexOf('\n  if (') + 1);
    assert.equal(block.split('\n')[0], '  if (' + condition + ') {');
    assert.doesNotMatch(block, /^  }/m, filename + ' outside its platform guard');
  }
});

test('the aura implementation keeps Win32 key polling in the Windows file', () => {
  for (const suffix of ['aura.h', 'aura.cc', 'linux.cc', 'win.cc']) {
    const src = read('browser/ui/tab_switch_keys_' + suffix);
    assert.doesNotMatch(src, /IS_POSIX/);
    if (suffix === 'win.cc') {
      for (const key of ['VK_CONTROL', 'VK_TAB', 'VK_MENU']) assert.ok(src.includes('::GetKeyState(' + key + ')'));
    } else {
      assert.doesNotMatch(src, /windows\.h|GetKeyState\(|\bVK_[A-Z]/);
    }
  }
});

const workflow = YAML.parse(readFileSync(new URL('../../.github/workflows/chromium-linux-candidate.yml', import.meta.url), 'utf8'));
const keysJob = workflow.jobs.keys;

function runKeysStep(name, dir, env, setup = '') {
  const step = keysJob.steps.find(step => step.name === name);
  assert.ok(step, 'missing keys job step: ' + name);
  return spawnSync('bash', ['-euo', 'pipefail', '-c', setup + '\n' + step.run], {cwd:dir, encoding:'utf8', env});
}

// Only x64 has a legacy archive. Exercise its refusal on every host.
const arch = 'x64';
const archive = 'blanc-linux-x64-candidate.tar.gz';
const approval = 'signed-candidate-x64.json';
for (const [reason, assets, key, deb, missing] of [
  ['unbuilt architecture', ['blanc-linux-arm64-candidate.tar.gz'], false, false, archive],
  ['legacy archive', ['blanc-linux-candidate.tar.gz'], false, false, archive],
  ['uncommitted owner key', [archive], false, true, 'chromium/linux/keys/blanc-repository.asc'],
  ['runtime-only tarball', [archive], true, false, '.deb'],
  ['unsigned package', [archive], true, true, approval],
  ['missing signature', [archive, approval], true, true, approval + '.asc'],
  ['packaged candidate with both approval files', [archive, approval, approval + '.asc'], true, true, null],
]) {
  test('keys job prerequisites: ' + reason, t => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blanc-keys-input-'));
    t.after(() => rmSync(dir, {recursive:true, force:true}));
    const env = {...process.env, ARCH:arch, ASSET:archive, APPROVAL:approval, DRAFT_TAG:'draft',
      GITHUB_JOB:'keys', GITHUB_REPOSITORY:'fixture', RUNNER_TEMP:dir, CANDIDATE_DIR:dir};
    if (!assets.includes(archive)) {
      writeFileSync(path.join(dir, 'release.json'), JSON.stringify({isDraft:true, assets:assets.map(name => ({name}))}));
      const result = runKeysStep('Download the candidate from the draft release', dir, env, 'gh() { cat release.json; }');
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes(missing), result.stderr);
      return;
    }
    writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify({platform:'linux', arch}));
    if (key) {
      mkdirSync(path.join(dir, 'chromium/linux/keys'), {recursive:true});
      writeFileSync(path.join(dir, 'chromium/linux/keys/blanc-repository.asc'), 'fixture');
    }
    if (deb) {
      mkdirSync(path.join(dir, 'packages'));
      writeFileSync(path.join(dir, 'packages/blanc-prototype.deb'), 'fixture');
    }
    let result = runKeysStep("Identify the runner's candidate", dir, env, 'node() { echo "$ARCH"; }');
    if (!result.status) {
      // gh can succeed when only one of several requested assets was present.
      mkdirSync(path.join(dir, 'candidate'));
      for (const file of assets.filter(name => name !== archive)) writeFileSync(path.join(dir, 'candidate', file), 'fixture');
      result = runKeysStep('Download the package approval from the draft', dir, env, 'gh() { return 0; }');
    }
    if (missing) {
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes(missing), result.stderr);
    } else assert.equal(result.status, 0, result.stderr);
  });
}

const aura = read('browser/ui/tab_switch_keys_aura.cc');
test('Linux consumes repeated W before a second close can reach the host', () => {
  assert.match(aura, /if \(!event->is_repeat\(\)\)\s*(?:\{\s*)?Run\("closePick"\)/);
});

test('Linux disarms both terminal keyboard cancellation paths', () => {
  assert.match(aura, /swallow_escape = watching_ && code == ui::VKEY_ESCAPE;\s*CancelKeyboardSwitch\(\*event\);\s*if \(swallow_escape\) event->StopPropagation\(\)/);
  assert.match(aura, /if \(!watching_\) return;\s*#if BUILDFLAG\(IS_LINUX\)\s*Stop\(\);\s*#endif\s*Run\("cancel"\)/);
});

test('the Linux close chord matches only Control among shortcut modifiers', () => {
  assert.match(aura, /(?:MaskOutKeyEventFlags\(event\.flags\(\)\)|\(event\.flags\(\) & [\w:]+\)) == ui::EF_CONTROL_DOWN/);
});

test('Linux disarms on mouse-down and resolves the old click before a new step', () => {
  const mouse = aura.slice(aura.indexOf('void OnMouseEvent'), aura.indexOf('// views::WidgetObserver:'));
  assert.match(mouse, /Stop\(\);[\s\S]*click_cancel_\.Start\(/);
  assert.match(aura, /click_cancel_\.FireNow\(\)/);
  const step = ui.slice(ui.indexOf('bool TabSwitchCommand('));
  assert.ok(step.indexOf('PrepareTabSwitchStep()') >= 0 &&
            step.indexOf('PrepareTabSwitchStep()') < step.indexOf('ExecuteJavaScript('));
});

test('Linux classifies the dispatched accelerator even after a fullscreen renderer round trip', () => {
  const linux = read('browser/ui/tab_switch_keys_linux.cc');
  assert.doesNotMatch(linux, /return CurrentAuraTabSwitchKey\(\)/);
  assert.match(linux, /AutoReset<base::TimeTicks>[\s\S]*browser\.AcceleratorPressed\(accelerator\)/);
  for (const [name, modifiers] of [['kForward', 'ui::EF_CONTROL_DOWN'],
    ['kReverse', 'ui::EF_CONTROL_DOWN | ui::EF_SHIFT_DOWN']]) {
    assert.ok(linux.includes(name + '(ui::VKEY_TAB, ' + modifiers + ')'));
    assert.ok(linux.includes('island.AddAccelerator(' + name + ')'));
  }
  assert.equal(precedingDirective(ui, 'blanc::RegisterTabSwitchAccelerators(*view)'), '#if BUILDFLAG(IS_LINUX)');
  assert.equal(precedingDirective(aura, 'BindOnce(&TabSwitchKeyState::ClearCurrent'), '#if BUILDFLAG(IS_WIN)');
});

test('a late accelerator older than a click or keyboard cancellation cannot re-arm or step by position', () => {
  const linux = read('browser/ui/tab_switch_keys_linux.cc');
  assert.match(linux, /AutoReset<base::TimeTicks>[\s\S]*accelerator\.time_stamp\(\)/);
  assert.match(aura, /TabSwitchPressTime\(\) <= cancelled_through_/);
  assert.match(ui, /if \(!blanc::PrepareTabSwitchStep\(\)\) return true;/);
});
