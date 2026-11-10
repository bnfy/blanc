// Exercise the installed, lockfile-pinned stable updater and real site normalizer.
// Every HTTP response is a fixture; unexpected requests fail rather than reaching a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { normalizeReleases, renderReleasesJson } from '../../scripts/generate-site-changelog.mjs';
import { validateRelease, payloadNames } from './policy.mjs';
const require=createRequire(import.meta.url);
const {GitHubProvider}=require('electron-updater/out/providers/GitHubProvider.js');
const {AppUpdater}=require('electron-updater/out/AppUpdater.js');
const {resolveUpdaterPolicy}=require('../../src/main/updater-policy.js');
const pkg=require('../../package.json');
const beta=JSON.parse(fs.readFileSync(new URL('./fixtures/release.json',import.meta.url)));
const release=(tag,prerelease)=>({tag_name:tag,prerelease,draft:false,published_at:'2026-11-09T00:00:00Z',name:tag,body:'Fixture'});
test('fork beta is excluded from the real releases.json normalization and changelog data',()=>{
  validateRelease(beta);
  const raw=[release(beta.tag,true),release(`v${pkg.version}`,false)];
  const normalized=normalizeReleases(raw);
  assert.deepEqual(normalized.map(r=>r.tag),[`v${pkg.version}`]);
  assert.ok(!renderReleasesJson(normalized).includes(beta.tag));
  // Record the real boundary: tag spelling alone is NOT a site filter.
  assert.equal(normalizeReleases([release(beta.tag,false)]).length,1);
  assert.throws(()=>validateRelease({...beta,prerelease:false}));
  assert.ok(!payloadNames(beta).some(n=>/^(latest|beta).*\.ya?ml$/.test(n)));
  for(const file of ['changelog.astro','changelog.xml.js'])assert.match(fs.readFileSync(new URL(`../../site/src/pages/${file}`,import.meta.url),'utf8'),/releases\.json/);
});
test('stable GitHubProvider ignores newer beta Atom entry and requests only stable latest-mac.yml',async()=>{
  const policy=resolveUpdaterPolicy({isPackaged:true,env:{}});assert.equal(policy.allowPrerelease,false);
  const updater=new AppUpdater(null,{version:pkg.version});assert.equal(updater.allowPrerelease,false);
  const requests=[],stableTag=`v${pkg.version}`;
  const entry=tag=>`<entry><title>${tag}</title><link href="https://github.com/bnfy/blanc/releases/tag/${tag}"/><content>fixture</content></entry>`;
  const responses=new Map([
    ['/bnfy/blanc/releases.atom',`<feed>${entry(beta.tag)}${entry(stableTag)}</feed>`],
    // GitHub's /latest contract excludes releases marked prerelease; publication
    // must use --prerelease --latest=false (not an assertion about tag spelling).
    ['/bnfy/blanc/releases/latest',JSON.stringify({tag_name:stableTag})],
    [`/bnfy/blanc/releases/download/${stableTag}/latest-mac.yml`,`version: ${pkg.version}\nfiles:\n  - url: Blanc-stable.zip\n    sha512: fixture\npath: Blanc-stable.zip\nsha512: fixture\n`],
  ]);
  const executor={request:async options=>{requests.push(options.path);assert.equal(options.hostname,'github.com');assert.ok(responses.has(options.path),`unexpected request ${options.path}`);return responses.get(options.path);}};
  const provider=new GitHubProvider({provider:'github',owner:'bnfy',repo:'blanc'},updater,{platform:'darwin',executor});
  const result=await provider.getLatestVersion();assert.equal(result.tag,stableTag);assert.equal(result.version,pkg.version);
  assert.ok(requests.includes(`/bnfy/blanc/releases/download/${stableTag}/latest-mac.yml`));
  assert.ok(!requests.some(p=>p.includes(beta.tag)));
});
