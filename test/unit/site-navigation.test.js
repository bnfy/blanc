const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(ROOT,name),'utf8');
const topics = JSON.parse(read('site/src/data/guide-topics.json'));
const routes = JSON.parse(read('site/src/data/legacy-routes.json'));
test('all sixteen feature pages remain alongside the Support and Trust guides', () => {
 assert.equal(topics.length,16);
 assert.equal(new Set(topics.map(topic=>topic.id)).size,16);
 for(const topic of topics){
  assert.ok(read(`site/src/components/guides/${topic.id}.astro`).length>1000);
  assert.equal(routes[`/features/${topic.id}`],undefined);
  assert.ok(read(`site/src/pages/features/${topic.id}.astro`).includes(`path="/features/${topic.id}"`));
  assert.ok(read(`site/src/pages/${topic.page}.astro`).includes(`<GuideTopics page="${topic.page}"`));
 }
 assert.equal(routes['/faq'],'/support');assert.equal(routes['/how-it-works'],'/trust');
 assert.equal(routes['/private'],'/features/private-tabs');
 assert.equal(routes['/features'],undefined);
 assert.match(read('site/src/components/GuideTopics.astro'), /href=\{`\/features\/\$\{topic.id\}`\}/);
});
test('retained feature pages preserve their search metadata, prose and anchors from the pre-revamp site', () => {
 const revision = '358cc02df00f10d184b84dbfdae6f6bfdfa6a790';
 const files = ['site/src/pages/features.astro', ...topics.map(topic => `site/src/pages/features/${topic.id}.astro`)];
 const prose = source => [...source.matchAll(/<(?:h[1-6]|p|figcaption)\b[^>]*>([\s\S]*?)<\/(?:h[1-6]|p|figcaption)>/g)].map(match => match[1].replace(/<[^>]*(?:>|$)/g, '').replace(/\s+/g, ' ').trim());
 for (const file of files) {
  const before = execFileSync('git', ['show', `${revision}:${file}`], {cwd: ROOT, encoding: 'utf8'});
  const approved = JSON.parse(read('docs/website-revamp-claims-v1.27.json')).retainedFeaturePages.reviewedCopyUpdates.filter(update => update.source === file);
  let reviewedBefore = before;
  for (const {before: oldCopy, after: newCopy} of approved.flatMap(update => update.replacements)) {
   assert.ok(reviewedBefore.includes(oldCopy), `${file}: obsolete review exception`);
   reviewedBefore = reviewedBefore.replace(oldCopy, newCopy);
  }
  const after = read(file);
  for (const property of ['title', 'description', 'path']) {
   // Search metadata changes only through a recorded, reviewed copy update.
   const value = reviewedBefore.match(new RegExp(`\\b${property}=(\\{?"[^"]+"\\}?)`))[0];
   assert.ok(after.includes(value), `${file}: changed ${property}`);
  }
  assert.deepEqual(prose(after), prose(reviewedBefore), `${file}: lost existing content outside reviewed copy corrections`);
  for (const [, id] of before.matchAll(/\bid="([^"]+)"/g)) assert.ok(after.includes(`id="${id}"`), `${file}: lost #${id}`);
  assert.match(after, /<main id="main-content"/);
 }
});
test('every consolidated destination exists and every old route has a direct 301',()=>{
 const redirects=read('site/public/_redirects');
 for(const [from,to] of Object.entries(routes)){
  const target=to.split(/[?#]/)[0];
  assert.ok(fs.existsSync(path.join(ROOT,`site/src/pages/${target==='/'?'index':target.slice(1)}.astro`)));
  assert.ok(redirects.includes(`${from} ${to} 301\n`));assert.ok(redirects.includes(`${from}/ ${to} 301\n`));
  assert.ok(!routes[target],`${from} must not create a redirect chain`);
 }
});
test('primary navigation and footer keep supporting pages and trust one click away',async()=>{
 const {directLinks}=await import(pathToFileURL(path.join(ROOT,'site/src/data/navigation.mjs')).href);
 assert.deepEqual(directLinks.map(link=>link.label),['Features','Privacy & Security','Patron','About','Support','Mail']);
 const footer=read('site/src/components/Footer.astro');
 for(const route of ['/mail','/features','/support','/trust','/about','/media','/ambassadors','/download','/changelog','/roadmap','/privacy','/terms'])assert.ok(footer.includes(`href="${route}"`),route);
 assert.equal(directLinks.find(link=>link.key==='features').href,'/features');
 assert.equal(directLinks.find(link=>link.key==='privacy').href,'/trust');
 assert.ok(footer.includes('href="/features/security"'));
 assert.match(footer, /Security guide/);
 assert.match(footer, /Privacy &amp; Security/);
 assert.match(footer,/data-consent-open/);assert.match(footer,/Bananify/);
 assert.match(read('site/src/components/NewsletterForm.astro'),/Updates from Blanc\./);
});
test('immutable release note links resolve to current destinations without losing fragments',async()=>{
 const {currentWebsiteLink}=await import(pathToFileURL(path.join(ROOT,'site/src/lib/website-routes.mjs')).href);
 assert.equal(currentWebsiteLink('https://blancbrowser.com/features/security#security-audit-title'),'https://blancbrowser.com/features/security#security-audit-title');
 assert.equal(currentWebsiteLink('/features/quiet-tabs'),'/features/quiet-tabs');
 assert.equal(currentWebsiteLink('/faq#bookmark-import'),'/support#bookmark-import');
 assert.equal(currentWebsiteLink('/private'),'/features/private-tabs');
 assert.equal(currentWebsiteLink('https://github.com/bnfy/blanc/releases'),'https://github.com/bnfy/blanc/releases');
});
