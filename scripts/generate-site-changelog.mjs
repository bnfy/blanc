#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'site');
const REPOSITORY_URL = 'https://github.com/bnfy/blanc';
const CHANGELOG_URL = 'https://blancbrowser.com/changelog';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function blancGithubUrl(value, allowedKinds = ['pull', 'compare', 'releases']) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/bnfy\/blanc\/(pull|compare|releases)(?:\/|$)/);
    if (!match || !allowedKinds.includes(match[1])) return null;
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

function parseGeneratedNotes(body = '') {
  const changes = [];
  const extraParagraphs = [];
  let compareUrl = null;

  for (const rawLine of String(body).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^#{1,6}\s+What(?:'|’)?s Changed$/i.test(line)) continue;

    const compare = line.match(/^\*\*Full Changelog\*\*:\s*(\S+)$/i);
    if (compare) {
      compareUrl = blancGithubUrl(compare[1], ['compare']);
      if (!compareUrl) extraParagraphs.push(line.replace(/\*\*/g, ''));
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const bullet = line.replace(/^[-*]\s+/, '');
      const generated = bullet.match(/^(.*?)\s+by\s+@[^\s]+\s+in\s+(https:\/\/\S+)$/i);
      if (generated) {
        changes.push({ text: generated[1].trim(), url: blancGithubUrl(generated[2], ['pull']) });
      } else {
        changes.push({ text: bullet, url: null });
      }
      continue;
    }

    extraParagraphs.push(line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, ''));
  }

  return { changes, compareUrl, extraParagraphs };
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
      return {
        tag,
        version: tag.replace(/^v/i, ''),
        name: String(release.name || tag),
        publishedAt: publishedAt.toISOString(),
        url: releaseUrl,
        anchor: tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        ...parseGeneratedNotes(release.body),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function humanDate(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(iso));
}

function releaseHtml(release) {
  const notes = release.changes.length
    ? `<ul class="release-changes">${release.changes.map((change) => {
        const text = escapeHtml(change.text);
        return `<li>${change.url ? `<a href="${escapeHtml(change.url)}" target="_blank" rel="noopener">${text}</a>` : text}</li>`;
      }).join('')}</ul>`
    : '';
  const extras = release.extraParagraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  const compare = release.compareUrl
    ? `<a href="${escapeHtml(release.compareUrl)}" target="_blank" rel="noopener">full changelog</a><span aria-hidden="true"> · </span>`
    : '';

  return `<article class="release" id="${escapeHtml(release.anchor)}">
  <div class="release-meta"><time datetime="${escapeHtml(release.publishedAt.slice(0, 10))}">${escapeHtml(humanDate(release.publishedAt))}</time></div>
  <div class="release-body">
    <h2><a href="#${escapeHtml(release.anchor)}">Blanc ${escapeHtml(release.version)}</a></h2>
    ${notes}${extras}
    <p class="release-links">${compare}<a href="${escapeHtml(release.url)}" target="_blank" rel="noopener">GitHub release</a></p>
  </div>
</article>`;
}

function renderChangelog(releases) {
  const items = releases.map(releaseHtml).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blanc Browser Changelog — What’s new</title>
<meta name="description" content="See what changed in each Blanc Browser release, from new features to security, privacy, and platform fixes.">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${CHANGELOG_URL}">
<link rel="alternate" type="application/rss+xml" title="Blanc Browser Changelog" href="/changelog.xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="stylesheet" href="styles.css?v=20260710-2">
</head>
<body data-page="changelog">
<main class="changelog-page">
  <header class="changelog-hero">
    <p class="section-kicker">shipping in public</p>
    <h1>Every Blanc release, in one place.</h1>
    <p>This page mirrors Blanc’s published GitHub releases, newest first. <a href="/changelog.xml">Subscribe via RSS</a>.</p>
  </header>
  <section class="release-list" aria-label="Blanc releases">
${items || '    <p>No published releases yet.</p>'}
  </section>
</main>
</body>
</html>
`;
}

function renderRss(releases) {
  const newest = releases[0]?.publishedAt;
  const items = releases.slice(0, 20).map((release) => {
    const summary = [
      ...release.changes.map((change) => change.text),
      ...release.extraParagraphs,
    ].join('\n');
    return `    <item>
      <title>${escapeXml(`Blanc ${release.version}`)}</title>
      <link>${escapeXml(release.url)}</link>
      <guid isPermaLink="true">${escapeXml(release.url)}</guid>
      <pubDate>${escapeXml(new Date(release.publishedAt).toUTCString())}</pubDate>
      <description>${escapeXml(summary)}</description>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Blanc Browser Changelog</title>
    <link>${CHANGELOG_URL}</link>
    <description>New features, fixes, and platform updates in Blanc Browser.</description>
    <language>en-us</language>${newest ? `
    <lastBuildDate>${escapeXml(new Date(newest).toUTCString())}</lastBuildDate>` : ''}
${items}
  </channel>
</rss>
`;
}

function outputPaths(outputDir = DEFAULT_OUTPUT_DIR) {
  return {
    html: path.join(outputDir, 'changelog.html'),
    rss: path.join(outputDir, 'changelog.xml'),
  };
}

function writeOutputs(releases, outputDir = DEFAULT_OUTPUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true });
  const paths = outputPaths(outputDir);
  fs.writeFileSync(paths.html, renderChangelog(releases));
  fs.writeFileSync(paths.rss, renderRss(releases));
  return paths;
}

function checkOutputs(releases, outputDir = DEFAULT_OUTPUT_DIR) {
  const paths = outputPaths(outputDir);
  const expected = new Map([
    [paths.html, renderChangelog(releases)],
    [paths.rss, renderRss(releases)],
  ]);
  const stale = [];
  for (const [file, contents] of expected) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) stale.push(file);
  }
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
      console.error(`Changelog output is stale or missing:\n${stale.map((file) => `- ${file}`).join('\n')}\nRun: npm run site:changelog`);
      return 1;
    }
    console.log(`Changelog is current (${releases.length} releases).`);
    return 0;
  }

  const paths = writeOutputs(releases, options.outputDir);
  console.log(`Rendered ${releases.length} releases to ${paths.html} and ${paths.rss}.`);
  return 0;
}

export {
  checkOutputs,
  escapeHtml,
  escapeXml,
  fetchReleases,
  normalizeReleases,
  parseGeneratedNotes,
  parseJsonDocuments,
  renderChangelog,
  renderRss,
  run,
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
