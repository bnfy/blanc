#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
// The normalized release data lands in the Astro site's src tree, where
// src/pages/changelog.astro and src/pages/changelog.xml.js render it.
// HTML/XML escaping happens there (Astro auto-escapes; the RSS renderer in
// site/src/lib/rss.mjs escapes itself) — this script only produces data.
// Each release carries `sections`, an ordered structure of headings, bullet
// lists, and paragraphs whose text is a list of typed inline spans; see
// parseGeneratedNotes below.
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'site', 'src', 'data');
const REPOSITORY_URL = 'https://github.com/bnfy/blanc';

// The app shipped as "Bowser" through v0.15.x, so old release notes still carry
// the former name and its `getbowser.com` domain. The marketing site must only
// ever present the current name — scrub the legacy name out of any release-note
// text before it reaches a visitor.
function scrubLegacyName(text) {
  return String(text)
    .replace(/getbowser\.com/gi, 'blancbrowser.com')
    .replace(/\bbowser\b/gi, 'Blanc');
}

// Accepts bnfy/blanc and bnfy/bowser: releases up to v0.15.x were published
// while the repo was still named "bowser", so their generated notes carry the
// old path. Rewrite it to the current name so no "bowser" URL ever reaches a
// visitor — GitHub 301s renamed-repo URLs and PR/tag numbers survive a rename,
// so the rewritten link resolves to the same place.
function blancGithubUrl(value, allowedKinds = ['pull', 'compare', 'releases']) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/bnfy\/(?:blanc|bowser)\/(pull|compare|releases)(?:\/|$)/);
    if (!match || !allowedKinds.includes(match[1])) return null;
    url.pathname = url.pathname.replace('/bnfy/bowser/', '/bnfy/blanc/');
    return url.href;
  } catch {
    return null;
  }
}

// `gh api --paginate` prints one JSON document per page. For the releases
// endpoint that can be either one array or several adjacent arrays, so parse a
// stream of complete JSON values instead of assuming a single document.
function parseJsonDocuments(input) {
  const documents = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (start === -1) {
      if (/\s/.test(char)) continue;
      if (char !== '[' && char !== '{') throw new Error(`Unexpected JSON token at offset ${i}`);
      start = i;
      depth = 1;
      continue;
    }

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;

    if (depth === 0) {
      documents.push(JSON.parse(input.slice(start, i + 1)));
      start = -1;
    }
  }

  if (start !== -1 || inString) throw new Error('Incomplete JSON returned by GitHub');
  return documents;
}

function fetchReleases() {
  const stdout = execFileSync(
    'gh',
    ['api', '--paginate', 'repos/bnfy/blanc/releases?per_page=100'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
  return parseJsonDocuments(stdout).flatMap((document) => Array.isArray(document) ? document : [document]);
}

// Inline markdown a release body may use. Most releases carry GitHub's
// auto-generated "What's Changed" notes (plain bullets), but a hand-written
// body — v1.0.0 was the first — uses **bold**, `code`, and [text](url), which
// must render as elements instead of showing their markup as literal text.
//
// Inline markup becomes *typed spans* rather than an HTML string: bullet text
// comes from contributor-supplied PR titles, so the renderer maps each span
// onto a real element and lets Astro escape the value. Release-note text can
// never introduce markup of its own — see the injection test in
// test/unit/site-changelog.test.js.
const INLINE_MARKDOWN = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

// Inline link targets are maintainer-authored, but the scheme is still pinned
// to https/mailto so a `javascript:`/`data:` href can never reach an anchor.
// Legacy names are rewritten here too (the generic scrub would capitalize the
// "bowser" inside a URL path, which is why span text and hrefs scrub apart).
function inlineLinkUrl(value) {
  const github = blancGithubUrl(value);
  if (github) return github;
  try {
    const url = new URL(String(value).replace(/(^|\/\/|\.)getbowser\.com\b/gi, '$1blancbrowser.com'));
    if (url.protocol === 'https:' || url.protocol === 'mailto:') return url.href;
  } catch { /* not a URL we can vouch for */ }
  return null;
}

function pushText(spans, value) {
  if (!value) return;
  const previous = spans[spans.length - 1];
  if (previous && previous.type === 'text') previous.value += value;
  else spans.push({ type: 'text', value });
}

function parseInline(raw) {
  const text = String(raw);
  const spans = [];
  let index = 0;
  INLINE_MARKDOWN.lastIndex = 0;
  for (let match = INLINE_MARKDOWN.exec(text); match; match = INLINE_MARKDOWN.exec(text)) {
    pushText(spans, scrubLegacyName(text.slice(index, match.index)));
    const [, code, strong, linkText, linkHref] = match;
    if (code !== undefined) spans.push({ type: 'code', value: scrubLegacyName(code) });
    else if (strong !== undefined) spans.push({ type: 'strong', value: scrubLegacyName(strong) });
    else {
      const url = inlineLinkUrl(linkHref);
      // An unvouched target keeps its label as plain prose rather than dropping
      // the words the release actually shipped.
      if (url) spans.push({ type: 'link', value: scrubLegacyName(linkText), url });
      else pushText(spans, scrubLegacyName(linkText));
    }
    index = match.index + match[0].length;
  }
  pushText(spans, scrubLegacyName(text.slice(index)));
  return spans;
}

function spansToText(spans = []) {
  return spans.map((span) => span.value).join('');
}

// A bullet that already links to its PR wraps all of its text in that anchor,
// so any inline link inside it would nest an <a> in an <a>. Flatten to prose.
function withoutLinks(spans) {
  const flattened = [];
  for (const span of spans) {
    if (span.type === 'link') pushText(flattened, span.value);
    else flattened.push(span);
  }
  return flattened;
}

// Release bodies are parsed into ordered sections so the page can render them
// in the order they were written: an intro paragraph belongs above the bullets
// it introduces, not below them, and each heading keeps its own list.
function parseGeneratedNotes(body = '') {
  const sections = [];
  let compareUrl = null;

  if (!body) return { compareUrl, sections };

  let current = null;
  let list = null;
  let seenContent = false;

  const openSection = () => {
    if (!current) sections.push(current = { heading: null, blocks: [] });
    return current;
  };
  const addBlock = (block) => {
    openSection().blocks.push(block);
    seenContent = true;
    return block;
  };
  // A blank line does not end a list (markdown's own "loose list"); only a
  // heading or a paragraph does.
  const endList = () => { list = null; };

  for (const rawLine of String(body).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      endList();
      const title = spansToText(parseInline(heading[2].trim()));
      // GitHub's generated headings label the boilerplate below them; the list
      // itself is the section, so the label carries nothing on this page.
      if (/^(?:What(?:'|’)?s Changed|New Contributors)$/i.test(title)) continue;
      // A leading H1 restates the release title, which the entry already
      // renders as its own heading.
      if (heading[1].length === 1 && !seenContent) continue;
      sections.push(current = { heading: title, blocks: [] });
      seenContent = true;
      continue;
    }

    const compare = line.match(/^\*\*Full Changelog\*\*:\s*(\S+)$/i);
    if (compare) {
      endList();
      compareUrl = blancGithubUrl(compare[1], ['compare']);
      // An off-repo compare link is not rendered as the entry's compare action,
      // but the line it came from is still shown.
      if (!compareUrl) addBlock({ type: 'paragraph', spans: parseInline(line) });
      seenContent = true;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const bullet = line.replace(/^[-*]\s+/, '');
      const generated = bullet.match(/^(.*?)\s+by\s+@[^\s]+\s+in\s+(https:\/\/\S+)$/i);
      const contributor = bullet.match(/^(@[^\s]+) made their first contribution in (https:\/\/\S+)$/i);
      let item;
      if (generated) {
        item = { spans: parseInline(generated[1].trim()), url: blancGithubUrl(generated[2], ['pull']) };
      } else if (contributor) {
        item = { spans: parseInline(`${contributor[1]} made their first contribution`), url: blancGithubUrl(contributor[2], ['pull']) };
      } else {
        item = { spans: parseInline(bullet), url: null };
      }
      if (item.url) item.spans = withoutLinks(item.spans);
      if (!list) list = addBlock({ type: 'list', items: [] });
      list.items.push(item);
      continue;
    }

    endList();
    addBlock({ type: 'paragraph', spans: parseInline(line) });
  }

  // A heading whose body turned out to be boilerplate would otherwise render as
  // a label with nothing under it.
  return { compareUrl, sections: sections.filter((section) => section.blocks.length > 0) };
}

function normalizeReleases(raw) {
  const flattened = Array.isArray(raw) ? raw.flatMap((item) => Array.isArray(item) ? item : [item]) : [];
  return flattened
    .filter((release) => release && !release.draft && !release.prerelease && release.published_at)
    .map((release) => {
      const tag = String(release.tag_name || '').trim();
      if (!tag) return null;
      const publishedAt = new Date(release.published_at);
      if (Number.isNaN(publishedAt.getTime())) return null;
      const releaseUrl = blancGithubUrl(release.html_url, ['releases'])
        || `${REPOSITORY_URL}/releases/tag/${encodeURIComponent(tag)}`;
      const publishedIso = publishedAt.toISOString();
      return {
        tag,
        version: tag.replace(/^v/i, ''),
        name: String(release.name || tag),
        publishedAt: publishedIso,
        humanDate: humanDate(publishedIso),
        machineDate: machineDate(publishedIso),
        url: releaseUrl,
        anchor: tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        ...parseGeneratedNotes(release.body),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

// Releases are cut by the maker in New York, but GitHub's published_at is UTC — an
// evening-EDT release lands on the next UTC day, so a UTC-rendered date reads as
// "tomorrow". Render changelog dates in the project's home timezone so they match
// the date the release was actually cut (America/New_York handles EDT/EST for us).
const RELEASE_TZ = 'America/New_York';

function humanDate(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: RELEASE_TZ, year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(iso));
}

// Machine-readable YYYY-MM-DD for <time datetime>, in the same timezone as humanDate
// so the two never disagree (en-CA yields ISO-style YYYY-MM-DD).
function machineDate(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RELEASE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

function renderReleasesJson(releases) {
  return JSON.stringify(releases, null, 2) + '\n';
}

function outputPaths(outputDir = DEFAULT_OUTPUT_DIR) {
  return { json: path.join(outputDir, 'releases.json') };
}

function writeOutputs(releases, outputDir = DEFAULT_OUTPUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true });
  const paths = outputPaths(outputDir);
  fs.writeFileSync(paths.json, renderReleasesJson(releases));
  return paths;
}

function checkOutputs(releases, outputDir = DEFAULT_OUTPUT_DIR) {
  const paths = outputPaths(outputDir);
  const expected = renderReleasesJson(releases);
  const stale = [];
  if (!fs.existsSync(paths.json) || fs.readFileSync(paths.json, 'utf8') !== expected) stale.push(paths.json);
  return stale;
}

function parseArgs(argv) {
  const options = { check: false, input: null, outputDir: DEFAULT_OUTPUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--input') options.input = argv[++i];
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
    if ((arg === '--input' || arg === '--output-dir') && !argv[i]) throw new Error(`${arg} requires a value`);
  }
  return options;
}

function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const raw = options.input
    ? JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'))
    : fetchReleases();
  const releases = normalizeReleases(raw);

  if (options.check) {
    const stale = checkOutputs(releases, options.outputDir);
    if (stale.length) {
      console.error(`Release data is stale or missing:\n${stale.map((file) => `- ${file}`).join('\n')}\nRun: npm run site:changelog`);
      return 1;
    }
    console.log(`Release data is current (${releases.length} releases).`);
    return 0;
  }

  const paths = writeOutputs(releases, options.outputDir);
  console.log(`Rendered ${releases.length} releases to ${paths.json}.`);
  return 0;
}

export {
  checkOutputs,
  fetchReleases,
  normalizeReleases,
  parseGeneratedNotes,
  parseInline,
  parseJsonDocuments,
  renderReleasesJson,
  run,
  scrubLegacyName,
  spansToText,
  writeOutputs,
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(`Could not generate the Blanc changelog: ${error.message}`);
    process.exitCode = 1;
  }
}
