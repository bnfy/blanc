const FEATURE_HEADING = /^(?:added|features?|new features?|what (?:is|['’]s) new(?:\s+in\s+.+)?)$/i;
const FEATURE_LEAD = /^(?:feat(?:\([^)]*\))?:|add(?:s|ed|ing)?\b|introduc(?:e|es|ed|ing)\b|import(?:s|ed|ing)?\b|ship(?:s|ped|ping)?\b|launch(?:es|ed|ing)?\b|support(?:s|ed|ing)?\b)/i;
const MAINTENANCE_LEAD = /^(?:build|chore|ci|docs|fix|refactor|release|site|test)(?:\([^)]*\))?(?::|\b)/i;

function spansToText(spans = []) {
  return spans.map((span) => span.value).join('').trim();
}

function releaseNotes(release) {
  return (release.sections || []).flatMap((section) =>
    (section.blocks || []).flatMap((block) => {
      if (block.type === 'paragraph') return [spansToText(block.spans)];
      if (block.type === 'list') return (block.items || []).map((item) => spansToText(item.spans));
      return [];
    })
  ).filter(Boolean);
}

function uniqueNames(names = []) {
  return [...new Set(names.map((name) => String(name).trim().replace(/[.:;]+$/, '')).filter(Boolean))];
}

/**
 * New release notes can supply their own display names by starting bullets in
 * an Added/Features section with a bold lead: `- **Glance.** Keep...`. The
 * editorial map passed by the page supplies names for older notes that predate
 * that convention.
 */
function featureNamesForRelease(release, namesByVersion = {}) {
  const version = String(release.version || release.tag || '').replace(/^v/i, '');
  const curated = namesByVersion[version];
  if (Array.isArray(curated) && curated.length) return uniqueNames(curated);

  const inferred = (release.sections || [])
    .filter((section) => FEATURE_HEADING.test(String(section.heading || '').trim()))
    .flatMap((section) => section.blocks || [])
    .filter((block) => block.type === 'list')
    .flatMap((block) => block.items || [])
    .map((item) => item.spans?.[0])
    .filter((span) => span?.type === 'strong')
    .map((span) => span.value);
  return uniqueNames(inferred);
}

/**
 * Current hand-written notes label product additions explicitly. Older
 * GitHub-generated notes did not, so feature-shaped PR titles and substantive
 * non-patch builds provide a conservative legacy fallback. This deliberately
 * avoids a version allowlist that would need hand-maintaining after release.
 */
function hasNewFeatures(release) {
  const sections = release.sections || [];
  if (sections.some((section) => FEATURE_HEADING.test(String(section.heading || '').trim()))) return true;

  const notes = releaseNotes(release);
  if (notes.some((note) => !MAINTENANCE_LEAD.test(note) && FEATURE_LEAD.test(note))) return true;

  const version = String(release.version || release.tag || '').match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i);
  if (!version || Number(version[3]) !== 0) return false;
  return notes.some((note) => !MAINTENANCE_LEAD.test(note));
}

export { featureNamesForRelease, hasNewFeatures, releaseNotes };
