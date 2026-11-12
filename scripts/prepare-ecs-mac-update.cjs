'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { extractFile } = require('@electron/asar');
async function main() {
  if (process.platform !== 'darwin') throw Error('macOS only');
  const app = await fs.realpath(process.argv[2]);
  const metadata = JSON.parse(extractFile(path.join(app, 'Contents/Resources/app.asar'), 'package.json'));
  if (metadata.blancEcsFullCandidate !== true || metadata.blancEcsQualification !== true) throw Error('Requires signed qualification candidate');
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  const output = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'blanc-ecs-staging-feed-'));
  const name = `Blanc-${metadata.version}-mac.zip`, archive = path.join(output, name);
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
  const bytes = await fs.readFile(archive);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const content = `version: ${metadata.version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${name}\nsha512: ${sha512}\n`;
  // Only the explicitly selected staging channel has metadata. No latest*.yml.
  await fs.writeFile(path.join(output, 'staging-mac.yml'), content, { flag: 'wx' });
  console.log(JSON.stringify({ output, archive, version: metadata.version, sha256: createHash('sha256').update(bytes).digest('hex') }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
