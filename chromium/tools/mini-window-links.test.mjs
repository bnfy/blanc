// Mini window: links from other apps open in one (#1734 part 3, shipping
// bnfy/blanc#1792). Settings strings are fork strings until the Settings pin
// moves past #1792.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FORK_STRINGS} from './settings-strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const patch = read('patches/0121-blanc-mini-window-links.patch');
const lane = JSON.parse(read('lanes/desktop.json'));
const ui = read('blanc/browser/ui/blanc_prototype_ui.cc');
const mini = read('blanc/browser/ui/mini_window_controller.inc');
const handler = read('blanc/browser/ui/chromium_settings_handler.inc');
const between = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, start);
  return text.slice(from, text.indexOf(end, from + start.length));
};

test('the setting is device-wide, off, with its switch under the mini window shortcut', () => {
  assert.ok(lane.patches.includes('patches/0121-blanc-mini-window-links.patch'));
  assert.match(patch, /^\+  registry->RegisterBooleanPref\("blanc\.mini_window\.links", false\);$/m);
  assert.match(mini, /constexpr char kMiniLinksPref\[\] = "blanc\.mini_window\.links";/);
  // Only the Mac hands OpenExternalLink web links from other apps.
  assert.match(patch, /^\+<if expr="is_macosx">\n\+    <!-- Only the Mac hands Blanc links from other apps itself \(#1734\)\. -->\n\+    <div class="cr-row" id="blancMiniLinksRow">$/m);
  assert.match(patch, /\$i18n\{blancMiniLinks\}.*\$i18n\{blancMiniLinksHint\}/);
  assert.match(patch, /^\+  miniLinks: \(on: boolean\|null = null\) => sendWithPromise<boolean>\('blancMiniWindowLinks', on === null \? '' : on \? 'on' : 'off'\),$/m);
  assert.match(handler, /bind\("blancMiniWindowLinks", &ChromiumSettingsHandler::HandleMiniWindowLinks\);/);
  assert.match(between(handler, 'void HandleMiniWindowLinks(', '\n  }\n'),
    /if \(choice == "on" \|\| choice == "off"\) \{ prefs->SetBoolean\(kMiniLinksPref, choice == "on"\); prefs->CommitPendingWrite\(\); \}/);
  const names = new Map(FORK_STRINGS);
  assert.equal(names.get('blancMiniLinks'), 'settings.general.miniWindowLinks.label');
  assert.equal(names.get('blancMiniLinksHint'), 'settings.general.miniWindowLinks.hint');
  const own = JSON.parse(read('blanc/fork-strings.json'));
  assert.equal(own['settings.general.miniWindowLinks.label'].en, 'Open links from other apps in a mini window');
  assert.equal(own['settings.general.miniWindowLinks.hint'].en, 'Links that match a rule still go where the rule says.');
});

test('rules first, then the mini window, then the frontmost ordinary window', () => {
  const body = between(ui, '\nbool OpenExternalLink(const GURL& url, bool startup_complete, bool trusted) {', '\nbool ClaimStartupLink(');
  const rule = body.indexOf('MatchingLinkRoute(url)'), miniAt = body.indexOf('OpenLinkInMiniWindow(url)'), ordinary = body.indexOf('OpenRoutedURL(browser, url, false, false)');
  assert.ok(rule > 0 && miniAt > rule && ordinary > miniAt, 'rule, mini window, ordinary window');
  // Before Chromium's own startup window exists, no mini window precedes it.
  // and a link stripped of a chromium: scheme never opens one.
  assert.match(body, /if \(trusted && \(startup_complete \|\| browser\) && OpenLinkInMiniWindow\(url\)\) return true;/);
  const claim = between(ui, '\nbool ClaimStartupLink(const GURL& url) {', '\nbase::DictValue RouteActiveSite(');
  assert.match(claim, /rule && BeginLinkRoute\(url, \*rule, nullptr, false\)\) return true;\s*return OpenLinkInMiniWindow\(url\);/);
});

test('a link joins the profile\'s most recent mini window, or a new one opens on it', () => {
  const open = between(mini, 'bool OpenLinkInMiniWindow(const GURL& url) {', '\nbool KeepMiniWindow(');
  assert.match(open, /if \(!g_browser_process->local_state\(\)->GetBoolean\(kMiniLinksPref\)\) return false;/);
  // By last use, never a closing window: activation order misses a window
  // opened for the previous link that is not active yet.
  assert.doesNotMatch(open, /Order::kActivation/);
  assert.match(open, /if \(!state->browser \|\| state->closing \|\| state->used <= latest \|\| browser->IsDeleteScheduled\(\) \|\|\s*browser->GetProfile\(\) != profile \|\| DesktopBrowserWindowCapabilities::From\(browser\)->IsAttemptingToCloseBrowser\(\)\) continue;/);
  assert.match(open, /MiniState\(mini\)->used = NextMiniUse\(\);/);
  assert.match(mini, /state->closing = true;\n    browser->GetWindow\(\)->Close\(\);/);
  assert.match(mini, /if \(browser->GetWindow\(\)->IsActive\(\)\) state->used = NextMiniUse\(\);/);
  assert.match(mini, /state->browser = browser->GetWeakPtr\(\);state->used = NextMiniUse\(\);/);
  assert.match(open, /if \(!mini\) return CreateMiniWindow\(url\) != nullptr;/);
  assert.match(open, /MiniWindowFocusChanged\(mini\);/);
  // A new mini window opens on the link alone, with no start page beside it.
  const create = between(mini, 'BrowserWindowInterface* CreateMiniWindow(const GURL& first', '\nbool OpenLinkInMiniWindow(');
  assert.match(create, /if \(first == GURL\("chrome:\/\/newtab\/"\)\) chrome::AddTabAt\(browser, first, -1, true\);\s*else \{/);
});

test('the Mac offers links that arrived before startup again, trusted ones only', () => {
  assert.match(patch, /^\+    return !tab\.is_untrusted_launch && blanc_prototype::ClaimStartupLink\(tab\.url\);$/m);
  assert.match(patch, /^\+  std::erase_if\(startupTabs, \[&\]\(const auto& tab\) \{return blanc_prototype::OpenExternalLink\(tab\.url, blancStartupComplete, !tab\.is_untrusted_launch\);\}\);$/m);
  assert.match(patch, /^-  std::erase_if\(startupTabs, \[\]\(const auto& tab\) \{return blanc_prototype::OpenExternalLink\(tab\.url\);\}\);$/m);
});

test('the native check reaches the Mac\'s own open-URL delivery', () => {
  const mac = read('blanc/browser/ui/app_menus_mac.mm');
  assert.match(mac, /\[delegate application:NSApp openURLs:@\[ url \]\];/);
  assert.match(ui, /if \(quiet_method == "systemOpenURL" && quiet_args\.size\(\) == 1 && quiet_args\[0\]\.is_string\(\)\) \{/);
  assert.match(read('tests/native-mini-links.mjs'), /process\.platform==='darwin'\?'systemOpenURL':'externalLink'/);
});
