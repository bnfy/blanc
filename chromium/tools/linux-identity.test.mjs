// Linux L1 uses the installed desktop id, profile and keyring of its own channel.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import peers from '../tests/android/support/sync-peer.cjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const patch = 'patches/0113-blanc-linux-identity.patch';

function table() {
  const rows = read('linux/identity.md').split('\n').filter(line => line.startsWith('|'));
  const columns = line => line.slice(1, -1).split('|').map(cell => cell.trim().replaceAll('`', ''));
  assert.deepEqual(columns(rows[0]), ['Name', 'Preview', 'Beta', 'Written by']);
  return new Map(rows.slice(2).map(row => {
    const [name, preview, beta, writer] = columns(row);
    assert.ok(writer, name);
    return [name, [preview, beta]];
  }));
}

test('Linux identity table and GN agree for preview and beta', async () => {
  const rows = table();
  const {FORBIDDEN} = await import('../linux/identity.mjs');
  const config = read('blanc/config.gni');
  const flags = read('blanc/BUILD.gn');
  for (const [column, channel, label] of [[0, 'prototype', 'Blanc Prototype'], [1, 'beta', 'Blanc Beta']]) {
    const pkg = 'blanc-' + channel;
    const expected = {
      Package: pkg, 'Install folder': '/opt/bnfy/' + pkg, Launcher: '/usr/bin/' + pkg,
      'Desktop file': pkg + '.desktop', 'X11 WM_CLASS': pkg, 'Wayland app id': pkg,
      'Menu name': label, 'Data folder': '~/.config/' + pkg, 'Keyring application': pkg,
      'Key name': label + ' Safe Storage', 'KWallet folder': label + ' Keys',
    };
    for (const [name, value] of Object.entries(expected)) assert.equal(rows.get(name)?.[column], value, name);
    for (const values of rows.values()) assert.ok(!FORBIDDEN.includes(values[column]), values[column]);
    assert.ok(config.includes('blanc_linux_package = "' + pkg + '"'));
    assert.ok(config.includes('blanc_linux_menu_name = "' + label + '"'));
  }
  assert.match(config, /blanc_linux_keyring_label = blanc_linux_menu_name/);
  assert.match(config, /if \(blanc_beta_channel\) \{\s*blanc_linux_package = "blanc-beta"/);
  for (const [name, arg] of [['PACKAGE', 'package'], ['KEYRING_LABEL', 'keyring_label']]) {
    assert.ok(flags.includes('BLANC_LINUX_' + name + '=\\"$blanc_linux_' + arg + '\\"'));
  }
});

test('GN rejects the release channel for Linux targets, including cross-builds', () => {
  assert.match(read('blanc/config.gni'), /^assert\(target_os != "linux" \|\| blanc_channel != "release",/m,
    'reject Linux release targets independently of the current toolchain');
});

// Evaluate guard nesting in the complete postimage, including guards above a hunk.
function linuxLines(source) {
  const nesting = [];
  return source.split('\n').map(line => {
    if (/^#if(?:def|ndef)?\b/.test(line)) nesting.push(/^#if BUILDFLAG\(IS_LINUX\)(?:\s*$| &&)/.test(line));
    if (/^#(?:else|elif)\b/.test(line)) nesting[nesting.length - 1] = false;
    if (/^#endif\b/.test(line)) nesting.pop();
    return nesting.includes(true);
  });
}

function applyIdentityPatch(t) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-linux-identity-'));
  t.after(() => fs.rmSync(stage, {recursive: true, force: true}));
  const files = [...read(patch).matchAll(/^\+\+\+ b\/(.+)$/gm)].map(match => match[1]);
  for (const file of files) {
    const dest = path.join(stage, file);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.copyFileSync(path.join(root, 'upstream', file), dest);
  }
  execFileSync('git', ['apply', path.join(root, patch)], {cwd: stage});
  return stage;
}

test('0113 scopes added C++ to Linux and wires profile, desktop, class and keyring', t => {
  const diff = read(patch);
  assert.ok(JSON.parse(read('lanes/desktop.json')).patches.includes(patch));
  const stage = applyIdentityPatch(t);
  let file, guards, line;
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ b/')) {
      file = row.slice(6);
      guards = linuxLines(fs.readFileSync(path.join(stage, file), 'utf8'));
    } else if (row.startsWith('@@ ')) {
      line = Number(/ \+(\d+)/.exec(row)[1]) - 1;
    } else if (row.startsWith('+') || row.startsWith(' ')) {
      if (row.startsWith('+') && /\.(cc|h)$/.test(file) && row.slice(1).trim() &&
          !/^\+#(?:if|else|elif|endif)/.test(row) && !row.startsWith('+#include "build/build_config.h"')) {
        assert.ok(guards[line], file + ' outside Linux: ' + row);
      }
      line++;
    }
  }
  const source = file => fs.readFileSync(path.join(stage, file), 'utf8');
  assert.match(source('chrome/common/chrome_paths_linux.cc'), /config_dir.Append\(BUILDFLAG\(BLANC_LINUX_PACKAGE\)\)/);
  assert.match(source('chrome/common/channel_info_posix.cc'), /GetVar\("CHROME_DESKTOP"\)[\s\S]*?return name.value\(\);[\s\S]*?BLANC_LINUX_PACKAGE[^;]*"\.desktop"/);
  assert.match(source('chrome/browser/shell_integration_linux.cc'), /GetProgramClassClass\([^}]+kWmClass[^}]+desktop_base_name == BUILDFLAG\(BLANC_LINUX_PACKAGE\)\) \{\s*return desktop_base_name;/);
  const fdo = source('components/os_crypt/async/browser/freedesktop_secret_key_provider.h');
  assert.match(fdo, /kAppName\[\] = BUILDFLAG\(BLANC_LINUX_PACKAGE\)/);
  assert.match(fdo, /kKeyName\[\] = BUILDFLAG\(BLANC_LINUX_KEY_NAME\)/);
  assert.match(fdo, /kKWalletFolder\[\] = BUILDFLAG\(BLANC_LINUX_KWALLET_FOLDER\)/);
  assert.match(read('blanc/browser/sync/desktop_sync_platform.cc'), /config.Set\("storageBackend",/);
  assert.match(fdo, /kwallet_proxy_ \? "kwallet" : "gnome_libsecret"/);
  assert.match(source('chrome/browser/browser_process_impl.cc'), /password_store, BUILDFLAG\(BLANC_LINUX_KEYRING_LABEL\), nullptr/);
  const selection = source('components/os_crypt/async/browser/os_crypt_async.cc');
  assert.match(selection, /if \(key.has_value\(\)\) \{[^}]*if \(\(\*current\)->UseForEncryption\(\)\) \{[^}]*GetLinuxStorageBackend\(\)/);
});

test('Blanc and Chromium register distinct MIME files for the same app in Default', t => {
  const stage = applyIdentityPatch(t);
  const file = 'chrome/browser/shell_integration_linux.cc';
  // Compile the filename construction from each tree. These ASCII test inputs
  // need no escaping in the sanitization step that follows it.
  function construction(source) {
    const method = /base::FilePath GetMimeTypesRegistrationFilename\(.*?\n\}/s.exec(source)?.[0];
    const body = /CHECK\(.*?;\n(.*?)\n  \/\/ Replace illegal characters/s.exec(method)?.[1];
    assert.ok(body, 'expected MIME registration filename construction');
    return body;
  }
  const before = construction(read('upstream/' + file));
  const after = construction(fs.readFileSync(path.join(stage, file), 'utf8'));
  const harness = `#include <cstdio>
#include <filesystem>
#include <iostream>
#include <string>
#define BUILDFLAG(flag) flag
#define IS_LINUX 1
namespace chrome { constexpr char kBrowserProcessExecutableName[] = "chrome"; }
namespace base {
template<typename... Args>
std::string StringPrintf(const char* format, Args... args) {
  char output[256];
  std::snprintf(output, sizeof(output), format, args...);
  return output;
}
}
struct FilePath {
  std::filesystem::path path;
  FilePath BaseName() const { return {path.filename()}; }
  std::string value() const { return path.string(); }
};
std::string chromium(const FilePath& profile_path, const std::string& app_id) {
  ${before}
  return filename;
}
std::string blanc(const FilePath& profile_path, const std::string& app_id) {
  ${after}
  return filename;
}
int main() {
  std::cout << chromium({"/config/chromium/Default"}, "app") << '\\n'
            << blanc({"/config/" BLANC_LINUX_PACKAGE "/Default"}, "app") << '\\n';
}`;
  const binary = path.join(stage, 'mime-names');
  for (const pkg of table().get('Package')) {
    execFileSync('c++', ['-std=c++20', `-DBLANC_LINUX_PACKAGE="${pkg}"`, '-x', 'c++', '-', '-o', binary],
      {input: harness});
    assert.deepEqual(execFileSync(binary, {encoding: 'utf8'}).trimEnd().split('\n'),
      ['chrome-app-Default.xml', `${pkg}-app-Default.xml`]);
  }
});

test('bundled Linux shim reports the selected credential store', () => {
  const {context} = peers.peer('Linux', 'http://127.0.0.1:1', {platform: 'linux'});
  const storage = context.__require('shim:electron').safeStorage;
  for (const backend of ['gnome_libsecret', 'kwallet', 'basic_text', 'xdg_secret_portal']) {
    context.__host.storageBackend = backend;
    assert.equal(storage.getSelectedStorageBackend(), backend);
  }
});

test('bundled Sync refuses a Linux key before calling the basic store', () => {
  const {context} = peers.peer('No keyring', 'http://127.0.0.1:1', {platform: 'linux'});
  context.__host.protect = () => assert.fail('basic encryption reached');
  const storage = context.__require('shim:electron').safeStorage;
  const {protectSyncKey} = context.__require('src/main/sync-key-storage.js');
  for (const backend of ['basic_text', undefined]) {
    context.__host.storageBackend = backend;
    assert.throws(() => protectSyncKey(storage, context.Buffer.alloc(32)),
      {code: 'store-unavailable', message: 'A secure OS credential store is unavailable'});
  }
});
