// Blanc ad-block converter: pinned EasyList + EasyPrivacy -> WKContentRuleList
// JSON for the iOS/WebKit backend (see spec/blocking-backends.md).
//
//   node adblock/build.mjs           regenerate generated/{blocklist.json,blocklist.meta.json}
//   node adblock/build.mjs --check   verify the committed generated/ files still match what the
//                                    pinned sources produce. Exit 1 on drift (sources refreshed
//                                    without a rebuild). The adblock analogue of tokens/settings/
//                                    copy's substrate drift guards.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SOURCES = path.join(ROOT, 'sources');
const OUT = path.join(ROOT, 'generated');
const MAX_RULES = 150_000;

const RESOURCE_TYPE_MAP = {
  image: 'image',
  script: 'script',
  stylesheet: 'style-sheet',
  font: 'font',
  media: 'media',
  popup: 'popup',
};

const SUPPORTED_OPTIONS = new Set([
  'third-party', '~third-party',
  ...Object.keys(RESOURCE_TYPE_MAP),
]);

const skipped = { cosmetic: 0, unsupported: 0, unparseable: 0, empty: 0, comment: 0 };

function parseFilter(raw) {
  let line = raw.trim();
  if (!line || line.startsWith('[')) { skipped.empty++; return null; }
  if (line.startsWith('!')) { skipped.comment++; return null; }
  if (/##|#@#|#\?#/.test(line)) { skipped.cosmetic++; return null; }

  let isException = false;
  if (line.startsWith('@@')) {
    isException = true;
    line = line.slice(2);
  }

  // Regex filters (/regex/ or /regex/$opts) need special handling
  // beyond M5 scope — skip them (≈1.4% of rules)
  const regexClose = line.lastIndexOf('/');
  if (line.startsWith('/') && regexClose > 0
      && (regexClose === line.length - 1 || line[regexClose + 1] === '$')) {
    skipped.unsupported++;
    return null;
  }

  let pattern = line;
  let options = {};
  const dollarIdx = line.lastIndexOf('$');
  if (dollarIdx !== -1) {
    const optStr = line.slice(dollarIdx + 1);
    pattern = line.slice(0, dollarIdx);
    const opts = optStr.split(',');
    for (const opt of opts) {
      const o = opt.trim().toLowerCase();
      if (o.startsWith('domain=')) {
        const domain = parseDomainOption(o.slice('domain='.length));
        if (!domain) { skipped.unsupported++; return null; }
        if (domain.ifDomain) options.ifDomain = domain.ifDomain;
        else options.unlessDomain = domain.unlessDomain;
        continue;
      }
      if (!SUPPORTED_OPTIONS.has(o)) {
        skipped.unsupported++;
        return null;
      }
      if (o === 'third-party') options.thirdParty = true;
      else if (o === '~third-party') options.firstParty = true;
      else if (RESOURCE_TYPE_MAP[o]) {
        options.resourceTypes = options.resourceTypes || [];
        options.resourceTypes.push(RESOURCE_TYPE_MAP[o]);
      }
    }
  }

  if (!pattern) { skipped.unparseable++; return null; }

  let urlFilter;
  try {
    urlFilter = patternToRegex(pattern);
  } catch {
    skipped.unparseable++;
    return null;
  }

  if (!urlFilter) { skipped.unparseable++; return null; }

  const trigger = { 'url-filter': urlFilter };
  if (options.thirdParty) trigger['load-type'] = ['third-party'];
  else if (options.firstParty) trigger['load-type'] = ['first-party'];
  if (options.resourceTypes?.length) trigger['resource-type'] = options.resourceTypes;
  if (options.ifDomain?.length) trigger['if-domain'] = options.ifDomain;
  else if (options.unlessDomain?.length) trigger['unless-domain'] = options.unlessDomain;

  return {
    rule: { trigger, action: { type: isException ? 'ignore-previous-rules' : 'block' } },
    isException,
  };
}

// ABP's $domain=a.com|~b.com scopes a rule to (or away from) page domains. It
// maps to WKContentRuleList's if-domain / unless-domain: a leading `*` makes an
// entry match the domain and its subdomains, mirroring ABP's subdomain-inclusive
// semantics. WebKit can't mix inclusion and exclusion in one trigger, so a rule
// that lists both is left unsupported rather than silently narrowed.
function parseDomainOption(value) {
  const include = [];
  const exclude = [];
  for (const entry of value.split('|')) {
    let d = entry.trim();
    if (!d) continue;
    const negated = d.startsWith('~');
    if (negated) d = d.slice(1);
    // WebKit rejects the whole compiled list if any if/unless-domain entry
    // isn't a plain hostname, so skip rules carrying e.g. IPv6 literals
    // ([::1]) or IDNs that aren't already punycode.
    if (!isHostname(d)) return null;
    (negated ? exclude : include).push('*' + d);
  }
  if (include.length && exclude.length) return null;
  if (include.length) return { ifDomain: include };
  if (exclude.length) return { unlessDomain: exclude };
  return null;
}

function isHostname(d) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(d);
}

function patternToRegex(pattern) {
  let p = pattern;

  let prefix = '';
  let suffix = '';

  if (p.startsWith('||')) {
    prefix = '^[^:]+:(//)?([^/?#]*\\.)?';
    p = p.slice(2);
  } else if (p.startsWith('|')) {
    prefix = '^';
    p = p.slice(1);
  }

  if (p.endsWith('|')) {
    suffix = '$';
    p = p.slice(0, -1);
  }

  const escaped = p
    .replace(/[.+?{}()[\]\\|]/g, '\\$&')
    .replace(/\^/g, '[^a-zA-Z0-9_.%-]')
    .replace(/\*/g, '.*');

  const result = prefix + escaped + suffix;
  if (!result) return null;

  new RegExp(result);
  return result;
}

const files = ['easylist.txt', 'easyprivacy.txt'];
const OUT_JSON = path.join(OUT, 'blocklist.json');
const OUT_META = path.join(OUT, 'blocklist.meta.json');

// Parse the pinned sources into the exact artifact strings that get written to
// disk, so build() and check() produce/compare byte-identical output.
function generate() {
  const blockRules = [];
  const exceptionRules = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(SOURCES, file), 'utf8');
    for (const line of content.split('\n')) {
      const parsed = parseFilter(line);
      if (!parsed) continue;
      if (parsed.isException) exceptionRules.push(parsed.rule);
      else blockRules.push(parsed.rule);
    }
  }
  const rules = [...blockRules, ...exceptionRules];
  const json = JSON.stringify(rules, null, 2);
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 8);
  const pinned = JSON.parse(fs.readFileSync(path.join(SOURCES, 'pinned.json'), 'utf8'));
  const metaJson = JSON.stringify(
    { version: hash, ruleCount: rules.length, sourceDate: pinned.date },
    null,
    2
  );
  return { rules, blockRules, exceptionRules, json, metaJson, hash };
}

function build() {
  const g = generate();
  console.log(`Block rules:     ${g.blockRules.length}`);
  console.log(`Exception rules: ${g.exceptionRules.length}`);
  console.log(`Total rules:     ${g.rules.length}`);
  console.log(`Skipped:`);
  console.log(`  Cosmetic:      ${skipped.cosmetic}`);
  console.log(`  Unsupported:   ${skipped.unsupported}`);
  console.log(`  Unparseable:   ${skipped.unparseable}`);
  console.log(`  Comments:      ${skipped.comment}`);
  console.log(`  Empty/header:  ${skipped.empty}`);

  if (g.rules.length > MAX_RULES) {
    console.error(`FATAL: ${g.rules.length} rules exceeds the ${MAX_RULES} ceiling.`);
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT_JSON, g.json);
  fs.writeFileSync(OUT_META, g.metaJson);
  console.log(`\nWrote ${g.rules.length} rules to generated/blocklist.json (version: ${g.hash})`);
}

// Verify the committed blocklist is what the pinned sources currently produce —
// the adblock analogue of tokens/settings/copy's --check drift guards. Exit 1 if
// generated/ is stale (someone refreshed the sources without rebuilding).
function check() {
  const g = generate();
  let failed = false;

  if (g.rules.length > MAX_RULES) {
    failed = true;
    console.error(`FATAL: ${g.rules.length} rules exceeds the ${MAX_RULES} ceiling.`);
  }

  for (const [rel, content] of [['blocklist.json', g.json], ['blocklist.meta.json', g.metaJson]]) {
    const p = path.join(OUT, rel);
    const onDisk = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (onDisk !== content) {
      failed = true;
      console.error(`STALE: adblock/generated/${rel} — run \`npm run adblock:build\``);
    }
  }

  if (failed) { console.error('\nadblock:check failed.'); process.exit(1); }
  console.log(`adblock:check OK — generated blocklist matches the pinned sources (${g.rules.length} rules).`);
}

process.argv.includes('--check') ? check() : build();
