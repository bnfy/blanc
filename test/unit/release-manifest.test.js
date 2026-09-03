const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const verify = path.join(root, 'scripts/verify-release-manifest.mjs');
const checksums = path.join(root, 'scripts/create-checksums.mjs');
const version = '1.0.0-rc.1';
const macFiles = [
  `Blanc-${version}-arm64-mac.zip`,
  `Blanc-${version}-arm64-mac.zip.blockmap`,
  `Blanc-${version}-arm64.dmg`,
  `Blanc-${version}-arm64.dmg.blockmap`,
  `Blanc-${version}-mac.zip`,
  `Blanc-${version}-mac.zip.blockmap`,
  `Blanc-${version}.dmg`,
  `Blanc-${version}.dmg.blockmap`,
  'latest-mac.yml',
];
const linuxFiles = [`Blanc-${version}.AppImage`, 'latest-linux.yml'];
const windowsInstaller = `Blanc-Setup-${version}.exe`;
const windowsFiles = [
  windowsInstaller,
  `${windowsInstaller}.blockmap`,
  'latest.yml',
  'windows-signature.json',
];
const armMacFiles = macFiles.filter((name) => name === 'latest-mac.yml' || name.includes('arm64'));

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-release-manifest-'));
  for (const file of files) fs.writeFileSync(path.join(dir, file), `fixture:${file}`);
  if (files.includes('windows-signature.json')) {
    const digest = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(path.join(dir, windowsInstaller)))
      .digest('hex');
    fs.writeFileSync(path.join(dir, 'windows-signature.json'), JSON.stringify({
      schemaVersion: 1,
      artifact: windowsInstaller,
      sha256: digest,
      signed: true,
      status: 'Valid',
      publisher: 'CN=Blanc Browser',
      signerThumbprint: '00',
      timestampAuthority: 'CN=Timestamp Authority',
    }));
  }
  return dir;
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

function addReleaseMetadata(dir) {
  fs.writeFileSync(path.join(dir, `Blanc-${version}.cdx.json`), JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    metadata: { component: { name: 'Blanc', version } },
    components: [{ type: 'library', name: 'fixture', version: '1.0.0' }],
  }));
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.sigstore.json'), '{"mediaType":"application/vnd.dev.sigstore.bundle+json;version=0.3"}');
}

test('verifies the exact selected platform set and generated checksums', () => {
  const dir = fixture([...macFiles, ...linuxFiles]);
  addReleaseMetadata(dir);
  assert.equal(run(checksums, [dir]).status, 0);
  const result = run(verify, [
    '--dir', dir,
    '--version', version,
    '--platforms', 'mac,linux',
  ]);
  assert.equal(result.status, 0, result.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fails closed on a missing, stale, or unexpected artifact', () => {
  const missing = fixture(macFiles.slice(1));
  assert.equal(run(verify, [
    '--dir', missing,
    '--version', version,
    '--platforms', 'mac',
  ]).status, 1);

  const unexpected = fixture([...macFiles, 'old-release.dmg']);
  assert.equal(run(verify, [
    '--dir', unexpected,
    '--version', version,
    '--platforms', 'mac',
  ]).status, 1);

  fs.rmSync(missing, { recursive: true, force: true });
  fs.rmSync(unexpected, { recursive: true, force: true });
});

test('an explicit arm64-only release rejects unselected Intel assets', () => {
  const armOnly = fixture(armMacFiles);
  assert.equal(run(verify, [
    '--dir', armOnly,
    '--version', version,
    '--platforms', 'mac',
    '--mac-arches', 'arm64',
  ]).status, 0);

  fs.writeFileSync(path.join(armOnly, `Blanc-${version}.dmg`), 'unexpected Intel');
  assert.equal(run(verify, [
    '--dir', armOnly,
    '--version', version,
    '--platforms', 'mac',
    '--mac-arches', 'arm64',
  ]).status, 1);
  fs.rmSync(armOnly, { recursive: true, force: true });
});

test('detects checksum tampering', () => {
  const dir = fixture(macFiles);
  addReleaseMetadata(dir);
  assert.equal(run(checksums, [dir]).status, 0);
  fs.appendFileSync(path.join(dir, macFiles[0]), 'tampered');
  assert.notEqual(run(verify, [
    '--dir', dir,
    '--version', version,
    '--platforms', 'mac',
  ]).status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Windows releases fail closed and carry a verified signature attestation', () => {
  const releaseScript = fs.readFileSync(path.join(root, 'scripts/release.sh'), 'utf8');
  const packageConfig = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  const releaseWorkflow = fs.readFileSync(
    path.join(root, '.github/workflows/release-windows-linux.yml'),
    'utf8'
  );
  const allWorkflows = fs.readdirSync(path.join(root, '.github/workflows'))
    .filter((name) => name.endsWith('.yml'))
    .map((name) => fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'))
    .join('\n');

  const rootInstall = releaseScript.indexOf('npm ci\n');
  const siteInstall = releaseScript.indexOf('npm ci --prefix site');
  const pressGate = releaseScript.indexOf('npm run release:verify:press');
  assert.ok(rootInstall >= 0, 'release must install locked app dependencies');
  assert.ok(siteInstall > rootInstall, 'release must install locked site dependencies');
  assert.ok(siteInstall < pressGate, 'site dependencies must exist before the press gate');
  assert.ok(releaseScript.indexOf('--draft') < releaseScript.indexOf('--draft=false'));
  const sourceTagPush = releaseScript.indexOf('git push origin "refs/tags/$TAG"');
  const draftCreate = releaseScript.indexOf('gh "${CREATE_ARGS[@]}"');
  const nativeDispatch = releaseScript.indexOf('gh workflow run release-windows-linux.yml');
  assert.ok(sourceTagPush >= 0, 'release must publish the immutable source tag');
  assert.ok(sourceTagPush < draftCreate, 'source tag must exist before the draft is created');
  assert.ok(sourceTagPush < nativeDispatch, 'native builders must be able to fetch the tag');
  assert.match(releaseScript, /verify-release-manifest\.mjs/);
  assert.match(releaseScript, /SHA256SUMS/);
  assert.doesNotMatch(releaseWorkflow, /building an UNSIGNED installer/);
  assert.match(releaseWorkflow, /Public releases never fall back to unsigned artifacts/);
  assert.match(releaseWorkflow, /WINDOWS_EXPECTED_PUBLISHER must contain the exact/);
  assert.match(releaseWorkflow, /Unexpected Windows publisher/);
  assert.match(releaseWorkflow, /has no trusted Authenticode timestamp/);
  assert.match(releaseWorkflow, /windows-signature\.json/);
  assert.match(releaseWorkflow, /Get-AuthenticodeSignature/);
  assert.match(releaseWorkflow, /verify-electron-fuses\.mjs/);
  assert.match(releaseWorkflow, /Verify packaged blocker inputs\s+run: npm run adblock:check/);
  assert.equal(
    (releaseWorkflow.match(/Verify dependency compliance inputs/g) ?? []).length,
    2,
    'Windows and Linux must verify deterministic compliance inputs'
  );
  assert.equal(
    (releaseWorkflow.match(/Verify packaged blocker payload/g) ?? []).length,
    2,
    'Windows and Linux must both inspect the packaged app.asar blocker payload'
  );
  assert.match(releaseScript, /Verifying byte-identical blocker payloads in packaged apps/);
  assert.match(releaseScript, /verify-packaged-adblock\.js/);
  assert.match(releaseScript, /verify-packaged-compliance\.js/);
  assert.equal(
    (releaseWorkflow.match(/Verify packaged compliance payload/g) ?? []).length,
    2,
    'Windows and Linux must verify packaged notices, licenses, and runtime SBOM'
  );
  assert.match(releaseScript, /-f mode=release/);
  assert.match(releaseWorkflow, /default: release/);
  assert.match(releaseWorkflow, /inputs\.mode == 'release' && inputs\.tag \|\| github\.ref/);
  assert.match(releaseWorkflow, /Upload private signed Windows validation artifact/);
  assert.match(releaseWorkflow, /Upload private Linux validation artifact/);
  assert.match(releaseWorkflow, /Blanc-Linux-\$\{\{ github\.run_id \}\}-validation/);
  assert.match(releaseWorkflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(releaseWorkflow, /retention-days: 3/);
  assert.equal(
    (releaseWorkflow.match(/Verify 1Password macOS-only boundary/g) ?? []).length,
    2,
    'Windows and Linux native candidates must prove the 1Password broker is unavailable'
  );
  assert.match(releaseWorkflow, /run: npm run test:onepassword:utility/);
  assert.match(releaseWorkflow, /run: xvfb-run -a npm run test:onepassword:utility/);
  assert.equal(
    (releaseWorkflow.match(/Verify tag matches package version\s+if: \$\{\{ inputs\.mode == 'release' \}\}/g) ?? []).length,
    2,
    'Windows and Linux tag/version checks must be skipped for tagless validation builds'
  );
  assert.match(releaseWorkflow, /if: \$\{\{ inputs\.mode == 'release' \}\}\s+shell: bash\s+env:\s+GH_TOKEN:/);
  assert.match(releaseWorkflow, /if: \$\{\{ inputs\.mode == 'validation' \}\}\s+uses: actions\/upload-artifact/);
  assert.match(releaseWorkflow, /\(inputs\.mode == 'release' \|\| inputs\.mode == 'validation'\) && \(inputs\.platform == 'all' \|\| inputs\.platform == 'linux'\)/);
  assert.match(releaseWorkflow, /ref: \$\{\{ inputs\.mode == 'release' && inputs\.tag \|\| github\.ref \}\}/);
  assert.match(releaseScript, /verify-electron-fuses\.mjs/);
  assert.deepEqual(packageConfig.build.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false,
  });
  assert.deepEqual(packageConfig.build.mac.target, ['dmg', 'zip']);
  assert.match(releaseScript, /MAC_BUILD_ARGS=\(\)/);
  assert.match(releaseScript, /MAC_BUILD_ARGS\+=\(--arm64\)/);
  assert.match(releaseScript, /MAC_BUILD_ARGS\+=\(--x64\)/);
  assert.doesNotMatch(allWorkflows, /uses:\s+[^\n]+@[vV]\d+(?:\s|$)/);
  assert.match(allWorkflows, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(allWorkflows, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(releaseScript, /cp compliance\/runtime-sbom\.cdx\.json "\$VERIFY_DIR\/Blanc-\$VERSION\.cdx\.json"/);
  assert.doesNotMatch(releaseScript, /npm sbom/);
  assert.match(releaseScript, /cosign sign-blob/);
  assert.match(releaseScript, /cosign verify-blob/);
  assert.match(releaseScript, /SHA256SUMS\.sigstore\.json/);
});

test('release authentication uses an explicit interactive operator, 1Password desktop auth, and Safari', () => {
  const releasePath = path.join(root, 'scripts/release.sh');
  const releaseScript = fs.readFileSync(releasePath, 'utf8');
  const safariOpenerPath = path.join(root, 'scripts/release-bin/open');
  const safariOpener = fs.readFileSync(safariOpenerPath, 'utf8');
  const agentInstructions = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const claudeInstructions = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  const releaseRunbook = fs.readFileSync(path.join(root, 'docs/release-verification.md'), 'utf8');

  assert.equal(spawnSync('bash', ['-n', releasePath]).status, 0);
  assert.match(releaseScript, /TERM_PROGRAM:-.*Apple_Terminal/);
  assert.match(releaseScript, /BLANC_RELEASE_OPERATOR:-terminal/);
  assert.match(releaseScript, /BLANC_RELEASE_OPERATOR must be terminal or agent/);
  assert.match(releaseScript, /Agent mode requires an interactive PTY/);
  assert.match(releaseScript, /interactive unsandboxed PTY/);
  const opSignin = releaseScript.indexOf('OP_BIOMETRIC_UNLOCK_ENABLED=true op signin');
  const opRun = releaseScript.indexOf('op run --env-file=.env.1password');
  assert.ok(opSignin >= 0, 'release must authenticate through the 1Password desktop app');
  assert.ok(opSignin < opRun, '1Password desktop authentication must precede secret injection');
  assert.doesNotMatch(releaseScript, /Run: gh auth login/);
  assert.match(releaseScript, /complete release is running outside the agent sandbox/);
  assert.match(
    releaseScript,
    /OP_BIOMETRIC_UNLOCK_ENABLED=true\s+\\\s*\n\s*op run --env-file=\.env\.1password/
  );
  for (const instructions of [agentInstructions, claudeInstructions, releaseRunbook]) {
    assert.match(instructions, /OP_BIOMETRIC_UNLOCK_ENABLED=true op signin/);
    assert.match(instructions, /BLANC_RELEASE_OPERATOR=agent/);
    assert.match(instructions, /outside (?:the|its) (?:agent )?sandbox/);
    assert.match(instructions, /gh auth status/);
    assert.match(instructions, /before asking the user to reauthenticate|Do not ask the user to run `gh auth login`/);
  }
  assert.ok(releaseScript.includes('${BLANC_MIGRATION_BASE_VERSION:-1.15.0}'));
  assert.ok(releaseScript.includes('${BLANC_COSIGN_REDIRECT_PORT:-49197}'));
  assert.ok(releaseScript.includes('http://127.0.0.1:$COSIGN_REDIRECT_PORT/auth/callback'));
  assert.match(releaseScript, /Sigstore callback port \$COSIGN_REDIRECT_PORT is already in use/);
  assert.match(releaseScript, /scripts\/release-bin:\$PATH.*cosign sign-blob/);
  assert.match(safariOpener, /exec \/usr\/bin\/open -a Safari "\$@"/);
  assert.notEqual(fs.statSync(safariOpenerPath).mode & 0o111, 0);
});

test('Windows manifest requires a valid signed-artifact attestation', () => {
  const dir = fixture([...macFiles, ...windowsFiles]);
  addReleaseMetadata(dir);
  assert.equal(run(checksums, [dir]).status, 0);
  assert.equal(run(verify, [
    '--dir', dir,
    '--version', version,
    '--platforms', 'mac,windows',
  ]).status, 0);

  const attestationPath = path.join(dir, 'windows-signature.json');
  const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8'));
  attestation.signed = false;
  fs.writeFileSync(attestationPath, JSON.stringify(attestation));
  assert.notEqual(run(verify, [
    '--dir', dir,
    '--version', version,
    '--platforms', 'mac,windows',
  ]).status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
