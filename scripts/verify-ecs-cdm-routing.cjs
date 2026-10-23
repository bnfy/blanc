'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function verify(app, runtime) {
  const exec = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const base = path.join(app, 'Contents/Frameworks');
  const ordinary = path.join(base, 'Blanc Helper.app/Contents/MacOS/Blanc Core Helper');
  const vendor = path.join(runtime, 'Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper');
  // Re-signing changes link-edit/signature data, but not the vendor's code.
  const instructions = binary => exec('otool', ['-s', '__TEXT', '__text', binary]).split('\n').slice(2).join('\n');
  assert.equal(hash(instructions(ordinary)), hash(instructions(vendor)), 'vendor helper machine code changed');
  const paths = [path.join(app, 'Contents/MacOS/Blanc'), ordinary,
    path.join(base, 'Blanc Helper.app/Contents/MacOS/Blanc Helper'),
    path.join(base, 'Blanc Helper (Renderer).app/Contents/MacOS/Blanc Helper (Renderer)'),
    path.join(base, 'Blanc Helper (GPU).app/Contents/MacOS/Blanc Helper (GPU)')];
  for (const binary of paths) {
    exec('codesign', ['--verify', '--strict', binary]);
    const entitlements = exec('codesign', ['-d', '--entitlements', ':-', '--xml', binary]);
    for (const key of ['disable-library-validation', 'allow-dyld-environment-variables', 'get-task-allow']) {
      assert.ok(!entitlements.includes(`<key>com.apple.security.${key.startsWith('get-') ? '' : 'cs.'}${key}</key>\n\t<true/>`), key);
      assert.ok(!new RegExp(`<key>com\\.apple\\.security\\.(?:cs\\.)?${key}</key>\\s*<true\\s*/>`).test(entitlements), key);
    }
  }
  const plugin = path.join(base, 'Blanc Helper (Plugin).app/Contents/MacOS/Blanc Helper (Plugin)');
  const entitlements = exec('codesign', ['-d', '--entitlements', ':-', '--xml', plugin]);
  assert.match(entitlements, /<key>com\.apple\.security\.cs\.disable-library-validation<\/key>\s*<true\s*\/>/);
  return { vendorCodeUnchanged: true, libraryValidationPreserved: paths.map(binary => path.basename(binary)),
    soleException: 'Blanc Helper (Plugin)', dyldEnvironmentNotAllowed: true, debuggerEntitlementNotAllowed: true };
}
if (require.main === module) console.log(JSON.stringify(verify(process.argv[2], process.argv[3]), null, 2));
module.exports = { verify };
