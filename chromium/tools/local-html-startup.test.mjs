// #1630, Local HTML files (N15) on Windows and Linux: a file the system asks
// Blanc to open goes through Blanc's grant path (OpenExternalLink), as the
// Mac's app controller hands it over (patch 0066). Left as a Chromium startup
// tab, the local file gate refuses it and the tab stays a blank New Tab.
// Source-level: the reconstructed desktop lane (patch 0120), no Chromium build.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-local-html-startup-'));
after(() => fs.rmSync(staging, {recursive: true, force: true}));
const lane = JSON.parse(fs.readFileSync(path.join(root, 'chromium/lanes/desktop.json')));
fs.cpSync(path.join(root, 'chromium/upstream'), staging, {recursive: true});
for (const patch of lane.patches) execFileSync('git', ['apply', path.join(root, 'chromium', patch)], {cwd: staging});
const source = fs.readFileSync(path.join(staging, 'chrome/browser/ui/startup/startup_browser_creator_impl.cc'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'chromium/blanc/browser/ui/blanc_prototype_ui.cc'), 'utf8');
const between = (from, to) => {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `missing ${from}`);
  return source.slice(start, source.indexOf(to, start + from.length));
};

test('the hand-off runs on Windows and Linux only, through OpenExternalLink', () => {
  const helper = between('bool HandOffLocalFiles(StartupTabs& tabs)', '}  // namespace');
  assert.match(helper, /tab\.url\.SchemeIsFile\(\) && blanc_prototype::OpenExternalLink\(tab\.url\)/);
  const guard = source.lastIndexOf('#if', source.indexOf('bool HandOffLocalFiles('));
  assert.equal(source.slice(guard, source.indexOf('\n', guard)), '#if !BUILDFLAG(IS_MAC)');
  assert.match(source, /#include "blanc\/browser\/ui\/blanc_prototype_ui\.h"/);
});

test('every startup takes local files out of Chromium\'s own tabs', () => {
  const body = between('StartupBrowserCreatorImpl::DetermineStartupTabs(\n    const StartupTabProvider& provider,', 'LaunchResult launch_result');
  const given = body.indexOf('provider.GetCommandLineTabs(');
  const handOff = body.indexOf('HandOffLocalFiles(tabs);');
  assert.ok(given > 0 && handOff > given, 'handed off right after the command-line tabs are read');
});

test('a second launch naming only local files opens no other window', () => {
  const body = between('void StartupBrowserCreatorImpl::DetermineURLsAndLaunch(', 'auto result = DetermineStartupTabs(');
  const early = body.indexOf('process_startup == chrome::startup::IsProcessStartup::kNo');
  assert.ok(early > 0, 'only when Blanc is already running');
  const rest = body.slice(early);
  assert.match(rest, /std::ranges::all_of\(given, \[\]\(const StartupTab& tab\) \{\s*return tab\.url\.SchemeIsFile\(\);/);
  assert.match(rest, /HandOffLocalFiles\(given\)\) \{\s*return;/);
});

test('OpenExternalLink still sends every local file to the grant path', () => {
  const body = ui.slice(ui.indexOf('\nbool OpenExternalLink(const GURL& url, bool startup_complete, bool trusted) {'), ui.indexOf('\nbase::DictValue RouteActiveSite('));
  assert.match(body, /if \(url\.SchemeIsFile\(\) && IsEnabled\(\)\) \{ OpenLocalHtmlFile\(url\); return true; \}/);
});
