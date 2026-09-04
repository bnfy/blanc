const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/* The masthead's mega menus and the mobile sheet are both fed by
 * site/src/data/navigation.mjs. These checks keep that module honest: every
 * feature page is reachable, each description is the page's own headline, and
 * every href points at a page that exists. */

const pageHeadline = href => {
  const source = fs.readFileSync(path.join(ROOT, `site/src/pages${href}.astro`), 'utf8');
  return source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
};

test('every feature page is reachable from the features menu with its own headline', async () => {
  const { menus } = await import(path.join(ROOT, 'site/src/data/navigation.mjs'));
  const features = menus.find(menu => menu.key === 'features');
  const links = features.groups.flatMap(group => group.links);
  const pages = fs.readdirSync(path.join(ROOT, 'site/src/pages/features')).filter(f => f.endsWith('.astro')).map(f => `/features/${f.replace('.astro', '')}`);
  assert.deepEqual(links.map(l => l.href).sort(), pages.sort(), 'one link per feature page, no more');
  for (const link of links) {
    assert.equal(link.description, pageHeadline(link.href), `${link.href} description is the page headline`);
  }
  assert.equal(features.groups.map(g => g.title).join(','), 'Interface,Privacy,Workflow');
  assert.equal(features.spotlight.image, '/feature-island.png');
  assert.ok(fs.existsSync(path.join(ROOT, 'site/public/feature-island.png')), 'spotlight image is a stable public asset');
});

test('resources and direct links point at pages that exist', async () => {
  const { menus, directLinks } = await import(path.join(ROOT, 'site/src/data/navigation.mjs'));
  const exists = href => {
    if (href.startsWith('http')) return true;
    const [pathname] = href.split('#');
    if (pathname === '/' || pathname === '') return true;
    return fs.existsSync(path.join(ROOT, `site/src/pages${pathname}.astro`));
  };
  const resources = menus.find(menu => menu.key === 'resources');
  for (const link of [...resources.groups.flatMap(g => g.links), ...directLinks, { href: resources.spotlight.href }, { href: resources.foot.href }, { href: menus[0].foot.href }]) {
    assert.ok(exists(link.href), `${link.href} exists`);
  }
  assert.deepEqual(directLinks.map(l => l.key), ['changelog', 'download']);
  const newsletter = resources.groups.flatMap(g => g.links).find(l => l.label === 'Newsletter');
  const form = fs.readFileSync(path.join(ROOT, 'site/src/components/NewsletterForm.astro'), 'utf8');
  assert.ok(form.includes(`id="${newsletter.href.replace('#', '')}"`), 'the newsletter link targets an id on the footer form');
});
