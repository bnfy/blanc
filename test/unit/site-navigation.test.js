const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(ROOT,name),'utf8');
const topics = JSON.parse(read('site/src/data/guide-topics.json'));
const routes = JSON.parse(read('site/src/data/legacy-routes.json'));
test('all sixteen former feature guides remain reachable through Support or Trust', () => {
 assert.equal(topics.length,16);
 assert.equal(new Set(topics.map(topic=>topic.id)).size,16);
 for(const topic of topics){
  assert.ok(read(`site/src/components/guides/${topic.id}.astro`).length>1000);
  assert.equal(routes[`/features/${topic.id}`],`/${topic.page}?topic=${topic.id}`);
  assert.ok(read(`site/src/pages/${topic.page}.astro`).includes(`<GuideTopics page="${topic.page}"`));
 }
 assert.equal(routes['/faq'],'/support');assert.equal(routes['/how-it-works'],'/trust');
 assert.equal(routes['/private'],'/trust?topic=private-tabs');
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
 const {directLinks}=await import(path.join(ROOT,'site/src/data/navigation.mjs'));
 assert.deepEqual(directLinks.map(link=>link.label),['Features','Privacy','Patron','About','Support']);
 const footer=read('site/src/components/Footer.astro');
 for(const route of ['/support','/trust','/about','/press','/ambassadors','/download','/changelog','/privacy','/terms'])assert.ok(footer.includes(`href="${route}"`),route);
 assert.match(footer,/data-consent-open/);assert.match(footer,/Bananify/);
 assert.match(read('site/src/components/NewsletterForm.astro'),/Updates from Blanc\./);
});
test('immutable release note links resolve to current destinations without losing fragments',async()=>{
 const {currentWebsiteLink}=await import(path.join(ROOT,'site/src/lib/website-routes.mjs'));
 assert.equal(currentWebsiteLink('https://blancbrowser.com/features/security#security-audit-title'),'/trust#security-audit-title');
 assert.equal(currentWebsiteLink('/features/quiet-tabs'),'/support#quiet-tabs');
 assert.equal(currentWebsiteLink('https://github.com/bnfy/blanc/releases'),'https://github.com/bnfy/blanc/releases');
});
