#!/usr/bin/env node
// Drafts a release's What's New page so it starts from the release notes, not a
// blank file (docs/superpowers/specs/2026-10-19-whats-new-page-design.md).
//
//   npm run site:whats-new -- --release 1.39 [--force]
//
// It reads the X.Y.0 release in site/src/data/releases.json and turns its
// "Added" bullets that lead with a bold feature name (the convention
// release-feature-names.json and the changelog rely on) into two to five
// highlights. Every word comes from the note; media are left as a TODO marker
// that site/src/lib/whats-new.mjs rejects, so neither the unit test nor
// site:build lets a draft deploy. It never replaces a page: --force replaces
// only a page that is still a draft. The owner signs off the final text and
// media before the page deploys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TODO_MEDIA_KIND, validateWhatsNew } from '../src/lib/whats-new.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_HIGHLIGHTS = 5;
const MIN_HIGHLIGHTS = 2;
// Words too common to pick a capture by ("tab" is in half their names).
const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'for', 'with', 'your', 'own', 'new', 'from', 'by', 'its', 'it', 'or', 'tab', 'blanc']);

const spansText = (spans = []) => spans.map((span) => span.value).join('');
const stem = (word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
const words = (text) => String(text).toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean).map(stem);
const slug = (text) => String(text).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The bullets under an "Added" heading whose first span is bold: the bold text
// names the feature and the rest of the bullet describes it.
export function featureBullets(release) {
  return (release.sections ?? [])
    .filter((section) => /^added$/i.test(String(section.heading ?? '').trim()))
    .flatMap((section) => section.blocks ?? [])
    .filter((block) => block.type === 'list')
    .flatMap((block) => block.items ?? [])
    .filter((item) => item.spans?.[0]?.type === 'strong')
    .map((item) => ({
      name: item.spans[0].value.trim().replace(/[.:;]+$/, ''),
      text: spansText(item.spans.slice(1)).trim(),
    }))
    .filter((bullet) => bullet.name);
}

const containsPhrase = (haystack, phrase) => {
  if (!phrase.length) return false;
  for (let i = 0; i + phrase.length <= haystack.length; i++) {
    if (phrase.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
};

// A guide topic matches when its id (start-page → "start page") or a part of
// its label ("Start Page & Mahjong" → "start page", "mahjong") appears in the
// feature's name, or failing that when its id appears in the note (labels are
// too loose there: "Profiles & Windows" would match "Windows and Linux"). Only
// topics with a /features/<id> page are offered.
export function guessLearnMore(bullet, topics, featurePages) {
  const phrase = (text) => words(text).filter((word) => word !== 'the');
  const idPhrase = (topic) => phrase(topic.id.replace(/-/g, ' '));
  const labelPhrases = (topic) => String(topic.label).split(/[&,]/).map(phrase).filter((p) => p.length);
  const linkable = topics.filter((topic) => featurePages.has(topic.id));
  const name = words(bullet.name);
  const text = words(bullet.text);
  const topic = linkable.find((t) => [idPhrase(t), ...labelPhrases(t)].some((p) => containsPhrase(name, p)))
    ?? linkable.find((t) => containsPhrase(text, idPhrase(t)));
  return topic ? `/features/${topic.id}` : undefined;
}

// Captures whose file names share words with the feature's name (or its
// learnMore topic), best match first, newest version first among equals.
export function candidateCaptures(bullet, captures, learnMore) {
  const useful = (word) => !STOP_WORDS.has(word) && word.length > 2;
  // A word of the feature's name counts twice a word of its topic.
  const weight = new Map(learnMore ? words(learnMore.replace('/features/', '')).filter(useful).map((word) => [word, 1]) : []);
  for (const word of words(bullet.name).filter(useful)) weight.set(word, 2);
  const version = (file) => (/-v(\d+)\.(\d+)\.(\d+)/.exec(file) ?? [0, 0, 0, 0]).slice(1).map(Number);
  return captures
    .filter((file) => /\.(webp|mp4|webm)$/.test(file))
    .map((file) => ({ file, score: words(file.replace(/-v\d+\.\d+\.\d+.*$/, '')).reduce((sum, word) => sum + (weight.get(word) ?? 0), 0) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || version(b.file).reduce((d, n, i) => d || n - version(a.file)[i], 0) || a.file.localeCompare(b.file))
    .map((c) => `/feature-captures/${c.file}`);
}

function uniqueId(name, release, taken) {
  const base = slug(name) || 'highlight';
  let id = taken.has(base) ? `${base}-${release.replace('.', '-')}` : base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

// The draft page for a feature release ("1.39"), or throws when the notes
// cannot fill one.
export function draftPage(featureRelease, releases, { data = { pages: [] }, topics = [], featurePages = new Set(), captures = [] } = {}) {
  const release = releases.find((r) => r.version === `${featureRelease}.0`);
  if (!release) throw new Error(`${featureRelease}.0 is not in releases.json; run npm run site:changelog after the release is public.`);
  const bullets = featureBullets(release);
  if (bullets.length < MIN_HIGHLIGHTS) {
    throw new Error(`${featureRelease}.0 has ${bullets.length} bold-named "Added" bullet(s); a page needs ${MIN_HIGHLIGHTS}. Write the page by hand, or add "${featureRelease}" to noPage.`);
  }
  const taken = new Set((data.pages ?? []).filter((p) => p.release !== featureRelease).flatMap((p) => (p.highlights ?? []).map((h) => h.id)));
  const highlights = bullets.slice(0, MAX_HIGHLIGHTS).map((bullet) => {
    const learnMore = guessLearnMore(bullet, topics, featurePages);
    return {
      id: uniqueId(bullet.name, featureRelease, taken),
      tile: bullet.name,
      title: bullet.name,
      body: bullet.text || bullet.name,
      ...(learnMore ? { learnMore } : {}),
      media: {
        kind: TODO_MEDIA_KIND,
        todo: 'Choose an image, video or demo, and get the owner’s sign-off on it and on this text.',
        candidates: candidateCaptures(bullet, captures, learnMore),
      },
    };
  });
  return { page: { release: featureRelease, highlights }, skipped: bullets.slice(MAX_HIGHLIGHTS).map((b) => b.name) };
}

const isDraft = (page) => (page.highlights ?? []).some((h) => h.media?.kind === TODO_MEDIA_KIND);
const compareRelease = (a, b) => {
  const [a1, a2] = a.split('.').map(Number);
  const [b1, b2] = b.split('.').map(Number);
  return a1 - b1 || a2 - b2;
};

// The data with the draft added, pages kept newest first. Never replaces a
// page; with force, replaces one that is still a draft.
export function addDraft(data, page, { force = false } = {}) {
  if ((data.noPage ?? []).includes(page.release)) throw new Error(`${page.release} is in noPage; take it out first if it should have a page.`);
  const existing = (data.pages ?? []).find((p) => p.release === page.release);
  if (existing && !force) throw new Error(`${page.release} already has a page; it is never overwritten. Use --force to replace a draft.`);
  if (existing && !isDraft(existing)) throw new Error(`${page.release} already has a finished page (no TODO media); it is never overwritten, even with --force.`);
  const pages = [...(data.pages ?? []).filter((p) => p.release !== page.release), page]
    .sort((a, b) => compareRelease(b.release, a.release));
  return { ...data, pages };
}

export function run(argv, {
  site = SITE,
  log = console.log,
} = {}) {
  const at = argv.indexOf('--release');
  const featureRelease = at >= 0 ? argv[at + 1] : undefined;
  if (!/^\d+\.\d+$/.test(featureRelease ?? '')) throw new Error('Usage: npm run site:whats-new -- --release X.Y [--force]');
  const force = argv.includes('--force');
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(site, rel), 'utf8'));
  const dataPath = path.join(site, 'src/data/whats-new.json');
  const data = read('src/data/whats-new.json');
  const releases = read('src/data/releases.json');
  const topics = read('src/data/guide-topics.json');
  const featuresDir = path.join(site, 'src/pages/features');
  const featurePages = new Set(fs.existsSync(featuresDir) ? fs.readdirSync(featuresDir).filter((f) => f.endsWith('.astro')).map((f) => f.slice(0, -'.astro'.length)) : []);
  const capturesDir = path.join(site, 'public/feature-captures');
  const captures = fs.existsSync(capturesDir) ? fs.readdirSync(capturesDir) : [];

  const { page, skipped } = draftPage(featureRelease, releases, { data, topics, featurePages, captures });
  const next = addDraft(data, page, { force });
  fs.writeFileSync(dataPath, `${JSON.stringify(next, null, 2)}\n`);

  log(`Drafted the ${featureRelease} What's New page in site/src/data/whats-new.json:`);
  for (const h of page.highlights) {
    log(`\n  ${h.id}: ${h.title}${h.learnMore ? `  (learn more: ${h.learnMore})` : '  (no learn more guessed)'}`);
    log(h.media.candidates.length ? `    candidate captures:\n${h.media.candidates.map((c) => `      ${c}`).join('\n')}` : '    no matching captures under site/public/feature-captures/');
  }
  if (skipped.length) log(`\nLeft out (a page holds at most ${MAX_HIGHLIGHTS}): ${skipped.join(', ')}`);
  const remaining = validateWhatsNew(next, releases, { publicDir: path.join(site, 'public'), requireEveryRelease: false });
  log(`\nStill to fill before it validates (${remaining.length}):\n${remaining.map((e) => `  - ${e}`).join('\n')}`);
  log(`\nPreview: npm run site:dev, then open http://localhost:4321/whats-new/${featureRelease}`);
  log('Rewrite the text as needed (steps and note are optional) and replace every TODO media.');
  log('The owner must explicitly sign off the final text and media before this page deploys.');
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
