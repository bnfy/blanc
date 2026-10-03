'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AppImageTarget = require('app-builder-lib/out/targets/appimage/AppImageTarget').default;
const { LinuxTargetHelper } = require('app-builder-lib/out/targets/LinuxTargetHelper');
const { verifyLinuxDesktopEntry } = require('../../scripts/verify-linux-desktop-entry');
const pkg = require('../../package.json');

const unsafeSwitches = [
  'no-sandbox', 'no-zygote-sandbox', 'disable-setuid-sandbox',
  'disable-gpu-sandbox', 'disable-namespace-sandbox',
  'disable-seccomp-filter-sandbox', 'disable-webnn-compiler-sandbox',
];
const unsafeArguments = unsafeSwitches.flatMap((name) => ['-', '--'].flatMap((prefix) => [
  `${prefix}${name}`, `"${prefix}${name}"`, `${prefix}${name}=true`,
]));

// Exercise the installed builder's desktop generation without downloading or
// packaging Electron. An empty array must override the legacy default, rather
// than being treated as an absent value by a future builder update.
async function generatedDesktopEntry(config) {
  const packager = {
    config,
    platformSpecificBuildOptions: config.linux,
    executableName: pkg.name,
    fileAssociations: [],
    info: { metadata: { desktopName: pkg.name } },
    appInfo: {
      productName: pkg.productName,
      buildVersion: pkg.version,
      description: pkg.description,
    },
  };
  const target = new AppImageTarget('AppImage', packager, new LinuxTargetHelper(packager), 'unused');
  return target.desktopEntry.value;
}

function entryFile(t, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-appimage-entry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'blanc.desktop');
  fs.writeFileSync(file, source);
  return file;
}

test('Blanc generates an AppImage menu command with no sandbox-disabling arguments', async (t) => {
  const source = await generatedDesktopEntry(structuredClone(pkg.build));
  assert.match(source, /^Exec=AppRun %U$/m);
  assert.doesNotThrow(() => verifyLinuxDesktopEntry(entryFile(t, source)));
});

test('the verifier rejects the legacy builder default if both protections are lost', async (t) => {
  const config = structuredClone(pkg.build);
  delete config.appImage.executableArgs;
  delete config.toolsets;
  const source = await generatedDesktopEntry(config);
  assert.match(source, /^Exec=AppRun --no-sandbox %U$/m);
  assert.throws(() => verifyLinuxDesktopEntry(entryFile(t, source)), /must not disable Chromium sandboxing/);
});

test('the static runtime also generates a safe desktop command without the explicit argument override', async (t) => {
  const config = structuredClone(pkg.build);
  delete config.appImage.executableArgs;
  const source = await generatedDesktopEntry(config);
  assert.match(source, /^Exec=AppRun %U$/m);
  assert.doesNotThrow(() => verifyLinuxDesktopEntry(entryFile(t, source)));
});

test('desktop commands reject both switch prefixes, including quoted and assigned forms', async (t) => {
  const source = await generatedDesktopEntry(structuredClone(pkg.build));
  for (const args of unsafeArguments) {
    const unsafe = source.replace('Exec=AppRun %U', `Exec=AppRun ${args} %U`);
    assert.throws(() => verifyLinuxDesktopEntry(entryFile(t, unsafe)),
      /must not disable Chromium sandboxing/, args);
  }
});

test('generated desktop actions cannot bypass the sandbox command check', async (t) => {
  for (const args of unsafeArguments) {
    const config = structuredClone(pkg.build);
    config.linux.desktop = {
      entry: { Actions: 'NewWindow;' },
      desktopActions: { NewWindow: { Name: 'New window', Exec: `AppRun ${args} %U` } },
    };
    const source = await generatedDesktopEntry(config);
    assert.match(source, /^Exec=AppRun %U$/m, 'the primary command remains safe');
    assert.throws(() => verifyLinuxDesktopEntry(entryFile(t, source)),
      /must not disable Chromium sandboxing/, args);
  }
});

test('benign switch names containing a sandbox substring are accepted', async (t) => {
  const source = await generatedDesktopEntry(structuredClone(pkg.build));
  for (const args of ['--no-sandbox-helper', '--disable-seccomp-filter-sandbox-helper', '--sandbox-enabled']) {
    const safe = source.replace('Exec=AppRun %U', `Exec=AppRun ${args} %U`);
    assert.doesNotThrow(() => verifyLinuxDesktopEntry(entryFile(t, safe)), args);
  }
});

test('the primary desktop entry must have a nonempty launch command', async (t) => {
  const source = await generatedDesktopEntry(structuredClone(pkg.build));
  for (const command of ['', 'Exec=', 'Exec=   ']) {
    const invalid = source.replace('Exec=AppRun %U', command);
    const action = '\n[Desktop Action NewWindow]\nExec=AppRun %U\n';
    assert.throws(() => verifyLinuxDesktopEntry(entryFile(t, invalid + action)), /Exec is missing or empty/);
  }
});

test('Windows line endings preserve desktop command verification', async (t) => {
  const source = (await generatedDesktopEntry(structuredClone(pkg.build))).replace(/\n/g, '\r\n');
  assert.doesNotThrow(() => verifyLinuxDesktopEntry(entryFile(t, source)));
});
