const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const baseline = (file) =>
  execFileSync(
    "git",
    ["show", `a3e4a9dbf166730856b6f5fc87417770c7886d7b:${file}`],
    { cwd: root, encoding: "utf8" },
  );
// Compare checked-in prose only; this helper never produces renderable HTML.
const comparisonText = (html) =>
  html
    .replace(/<[^>]*(?:>|$)/g, "")
    .replace(/\s+/g, "")
    .trim();
test("prose comparison handles complete and incomplete markup", () => {
  for (const markup of [
    "<p>Reviewed <strong>evidence</strong></p>",
    "Reviewed evidence<script",
    "Reviewed evidence<<script>",
  ])
    assert.equal(comparisonText(markup), "Reviewedevidence");
});
test("the October 2 transparency answers survive consolidation verbatim", () => {
  const original = JSON.parse(
    baseline("site/src/pages/faq.astro").match(
      /const QUESTIONS = (\[[\s\S]*?\]);/,
    )[1],
  );
  const current = JSON.parse(read("site/src/data/support-questions.json"));
  assert.deepEqual(
    current,
    original,
    "All engine, privacy, AI, audit, licensing and Patron answers must survive.",
  );
  assert.match(read("site/src/pages/support.astro"), /questions\.map/);
});
test("release evidence, audit status and known Sync findings stay visible outside disclosures", () => {
  const original = baseline("site/src/pages/features/security.astro");
  const evidence = read("site/src/components/ReleaseEvidence.astro");
  for (const id of ["release-verification-title", "security-audit-title"]) {
    const section = original.match(
      new RegExp(`<section[^>]*aria-labelledby="${id}"[\\s\\S]*?</section>`),
    )[0];
    assert.ok(
      comparisonText(evidence).includes(comparisonText(section)),
      `${id} loses reviewed evidence`,
    );
  }
  const page = read("site/src/pages/trust.astro");
  assert.match(page, /<ReleaseEvidence \/>/);
  assert.doesNotMatch(evidence, /<details/);
  assert.match(
    read("site/src/pages/download.astro"),
    /Synced provider passkeys, including iCloud Keychain, are not supported/,
  );
});
test("home keeps product limits and links to detailed ownership, licensing and audit disclosures", () => {
  const home = read("site/src/pages/index.astro").replace(/\s+/g, " ");
  for (const phrase of [
    "Chromium + Electron",
    "How they fit together",
    "chromiumMark",
    "electronMark",
    "Fresh setup preselects search suggestions and usage measurement",
    "only after you save",
    "optional Google Analytics mirror",
    "Built by Bananify.",
    "MIT for Blanc’s own code",
    "Renaming and removing existing workspaces",
    "Earlier one-time supporters",
    "Off by default; requires the installed 1Password app",
  ])
    assert.ok(home.includes(phrase), phrase);
  assert.match(home, /href="\/trust#engine"/);
  assert.match(home, /href="\/trust#release-verification-title"/);
  assert.match(home, /href="\/about"/);
  assert.match(home, /href="\/trust"/);
  assert.match(home, /href="\/support#open-source"/);
  const about = read("site/src/pages/about.astro");
  assert.ok(about.includes("AI assists implementation and security review"));
  assert.ok(about.includes("remains accountable for product decisions and release approval"));
  assert.ok(about.includes("No independent external security audit has been completed"));
});
test("all prior guide fragment names survive in the rendered consolidated topics", () => {
  const topics = JSON.parse(read("site/src/data/guide-topics.json"));
  for (const topic of topics) {
    const old = baseline(`site/src/pages/features/${topic.id}.astro`);
    const current =
      read(`site/src/components/guides/${topic.id}.astro`) +
      (topic.id === "security"
        ? read("site/src/components/ReleaseEvidence.astro")
        : "");
    for (const match of old.matchAll(/\bid="([^"]+)"/g))
      assert.ok(
        current.includes(`id="${match[1]}"`),
        `${topic.id} lost #${match[1]}`,
      );
  }
});
test("a reproducible missed-ad reporting path remains available", () => {
  const guide = read("site/src/components/guides/ad-blocking.astro");
  for (const phrase of [
    "template=ad_blocking.yml",
    "page URL, Blanc version, operating system, blocker settings",
    "reproduction and verification evidence",
    "support@blancbrowser.com",
  ])
    assert.ok(guide.includes(phrase));
});
