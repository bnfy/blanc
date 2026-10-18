import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { prepareMacIcon } from './mac-icon.mjs';
import { prepareComponent } from './ubo-component.mjs';
import { prepareDocumentTarget } from './ubo-document-target.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const chromium = path.resolve(process.argv[2] ?? '');
const expectedVersion = '157.0.8103.6';
const assetsOnly = process.argv.slice(3).includes('--assets-only');
if (process.argv.slice(3).some(arg => arg !== '--assets-only')) throw new Error('Unknown prepare option');

function fail(message) {
  console.error(`chromium spike: ${message}`);
  process.exit(1);
}

if (!process.argv[2]) fail('pass the Chromium src checkout as the first argument');
const versionFile = path.join(chromium, 'chrome', 'VERSION');
if (!fs.existsSync(versionFile)) fail(`${chromium} is not a complete Chromium checkout`);
const version = Object.fromEntries(
  fs.readFileSync(versionFile, 'utf8').trim().split('\n').map((line) => line.split('=')),
);
const actualVersion = `${version.MAJOR}.${version.MINOR}.${version.BUILD}.${version.PATCH}`;
if (actualVersion !== expectedVersion) {
  fail(`expected Chromium ${expectedVersion}, found ${actualVersion}; review anchors before changing the pin`);
}

// Read first and treat a missing file as changed, rather than checking
// existence and then reading (CodeQL js/file-system-race).
function writeIfChanged(target, value) {
  let current = null;
  try {
    current = fs.readFileSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!current || !current.equals(Buffer.from(value))) fs.writeFileSync(target, value);
}

const generated = path.join(here, 'generated');
fs.mkdirSync(path.join(generated, 'pages'), { recursive: true });

const assets = new Map();
const copies = [
  ['src/renderer/pages/newtab.html', 'pages/newtab.html'],
  ['src/renderer/pages/newtab.js', 'pages/newtab.js'],
  ['src/renderer/pages/close.svg', 'pages/close.svg'],
  ['src/renderer/pages/newtab-wallpaper.js', 'pages/newtab-wallpaper.js'],
  ['src/renderer/pages/start-site-name.js', 'pages/start-site-name.js'],
  ['src/renderer/pages/pages.css', 'pages/pages.css'],
  ['src/renderer/pages/i18n.js', 'pages/i18n.js'],
  ['src/renderer/pages/sunrise-mark.png', 'pages/sunrise-mark.png'],
  ['src/renderer/pages/icon-sunrise.png', 'pages/icon-sunrise.png'],
  ['src/renderer/pages/icon-sunrise-dark.png', 'pages/icon-sunrise-dark.png'],
  ['src/renderer/pages/onboarding-island-dark.png', 'pages/onboarding-island-dark.png'],
  ['src/renderer/pages/onboarding-island-light.png', 'pages/onboarding-island-light.png'],
  ['src/renderer/pages/start-page-sunrise.png', 'pages/start-page-sunrise.png'],
  ['src/renderer/pages/start-page-day.png', 'pages/start-page-day.png'],
  ['src/renderer/pages/start-page-dusk.png', 'pages/start-page-dusk.png'],
  ['src/renderer/pages/start-page-night.png', 'pages/start-page-night.png'],
  ['src/renderer/pages/caveat-latin.woff2', 'pages/caveat-latin.woff2'],
  ['src/renderer/pages/select-caret.svg', 'pages/select-caret.svg'],
  ['src/renderer/pages/select-caret-dark.svg', 'pages/select-caret-dark.svg'],
  ['src/renderer/pages/strings.en.js', 'pages/strings.js'],
  ['prototype/newtab-adapter.js', 'pages/newtab-adapter.js'],
  ['prototype/newtab-prototype.css', 'pages/newtab-prototype.css'],
  ['prototype/extensions.js', 'extensions.js'],
  ['prototype/extensions.css', 'extensions.css'],
  ...['search', 'settings', 'external-link', 'chevron-left'].map(name =>
    [`src/renderer/ublock-popup-icons/${name}.svg`, `icons/${name}.svg`]),
  ['prototype/host.html', 'host.html'],
  ['prototype/host.css', 'host.css'],
  ['prototype/host.js', 'host.js'],
  ['prototype/adapter.js', 'adapter.js'],
  ['prototype/prototype.css', 'prototype.css'],
  ['src/renderer/index.html', 'index.html'],
  ['src/renderer/overlay.html', 'overlay.html'],
  ['src/renderer/styles.css', 'styles.css'],
  ['src/renderer/renderer.js', 'renderer.js'],
  ['src/renderer/overlay.js', 'overlay.js'],
  ['src/renderer/tab-drag.js', 'tab-drag.js'],
  ['src/renderer/vertical-tabs.js', 'vertical-tabs.js'],
  ['src/renderer/space-identity.js', 'space-identity.js'],
  ['src/renderer/space-picker.js', 'space-picker.js'],
  ['src/renderer/workspace-ui.js', 'workspace-ui.js'],
  ['src/renderer/panel-left.svg', 'panel-left.svg'],
  ['src/renderer/sunrise-hero-mark.png', 'sunrise-hero-mark.png'],
  ['src/renderer/pages/type-to-open.js', 'pages/type-to-open.js'],
  ['src/renderer/pages/sunrise-favicon-mark.png', 'pages/sunrise-favicon-mark.png'],
  ['src/renderer/pages/inter-latin.woff2', 'pages/inter-latin.woff2'],
  ['src/renderer/pages/instrument-sans-latin-wdth-normal.woff2', 'pages/instrument-sans-latin-wdth-normal.woff2'],
  ['src/renderer/pages/jetbrains-mono-latin.woff2', 'pages/jetbrains-mono-latin.woff2'],
  ['src/renderer/pages/i18n.js', 'i18n.js'],
  ['src/renderer/pages/strings.en.js', 'strings.js'],
];

for (const [source, destination] of copies) {
  const sourcePath = source.startsWith('prototype/')
    ? path.join(here, source)
    : path.join(repo, source);
  const destinationPath = path.join(generated, destination);
  if (!fs.existsSync(sourcePath)) fail(`missing reviewed asset ${sourcePath}`);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  assets.set(destinationPath, fs.readFileSync(sourcePath));
}

for (const name of ['index.html', 'overlay.html']) {
  const target = path.join(generated, name);
  let html = assets.get(target).toString('utf8');
  const stylesheet = '<link rel="stylesheet" href="styles.css" />';
  if (!html.includes(stylesheet)) fail(`${name} stylesheet anchor changed`);
  html = html.replace(stylesheet, `${stylesheet}\n  <link rel="stylesheet" href="prototype.css" />`);
  const firstScript = '<script src="strings.js"></script>';
  if (!html.includes(firstScript)) fail(`${name} script anchor changed`);
  html = html.replace(firstScript, '<script src="adapter.js"></script>\n  ' + firstScript);
  if (name === 'index.html') {
    const anchor = '<div id="pillActions" class="pill-btns"></div>';
    if (!html.includes(anchor)) fail('Island actions anchor changed');
    // Keep the native slot in the same tightly spaced group as Reload and Close.
    html = html.replace(anchor, '<div id="pillActions" class="pill-btns"><span id="nativeExtensions" aria-hidden="true"></span></div>');
  }
  assets.set(target, html);
}

// Reuse the shipping new-tab document with a narrowly scoped Chromium adapter.
const newTabFile = path.join(generated, 'pages/newtab.html');
let newTabHtml = assets.get(newTabFile).toString('utf8');
newTabHtml = newTabHtml.replace('<script src="strings.js"></script>',
  '<script src="newtab-adapter.js"></script>\n  <script src="strings.js"></script>');
newTabHtml = newTabHtml.replace('<link rel="stylesheet" href="pages.css" />',
  '<link rel="stylesheet" href="pages.css" />\n  <link rel="stylesheet" href="newtab-prototype.css" />');
newTabHtml = newTabHtml.replace('  <script src="onboarding.js"></script>\n', '');
assets.set(newTabFile, newTabHtml);

// Give the copied resting favorite button a stable prototype-only selector.
const renderer = path.join(generated, 'renderer.js');
let rendererSource = assets.get(renderer).toString('utf8');
const favoriteAnchor = "  const favoriteBtn = pillButton('heart', blancI18n.t('pill.favorite'), () => window.browserAPI.toggleBookmark());";
if (rendererSource.split(favoriteAnchor).length !== 2) fail('favorite button anchor changed');
rendererSource = rendererSource.replace(favoriteAnchor, favoriteAnchor + "\n  favoriteBtn.id = 'pillHeart';");
assets.set(renderer, rendererSource);

// Only these copied slash commands have native implementations in this spike.
// /save, /favorites, /history and /clear ride the bookmark and history bridge;
// /pin, /mute, /group, /ungroup and /close-group ride TabStripModel;
// /clear is destructive and is tested only on a disposable profile.
const overlayScript = path.join(generated, 'overlay.js');
let overlaySource = assets.get(overlayScript).toString('utf8');
const commandsAnchor = '  ];\n\n  function runCommand(command) {';
if (overlaySource.split(commandsAnchor).length !== 2) fail('command list anchor changed');
overlaySource = overlaySource.replace(commandsAnchor,
  "  ].filter((command) => ['/downloads', '/new', '/close', '/save', '/favorites', '/history', '/clear', '/pin', '/mute', '/group', '/ungroup', '/close-group'].includes(command.cmd));\n\n  function runCommand(command) {");
assets.set(overlayScript, overlaySource);

for (const [target, value] of assets) writeIfChanged(target, value);
if (assetsOnly) {
  console.log(`Updated prototype assets: ${generated}. Reload the page or relaunch the browser; no native files changed.`);
  process.exit(0);
}

prepareMacIcon(chromium);

for (const name of ['blanc_prototype_ui.h', 'blanc_prototype_ui.cc']) {
  writeIfChanged(path.join(chromium, 'chrome/browser/ui', name),
    fs.readFileSync(path.join(here, 'native', name), 'utf8'));
}

function edit(relative, edits) {
  const target = path.join(chromium, relative);
  let source = fs.readFileSync(target, 'utf8');
  for (const { anchor, replacement, present } of edits) {
    if (present && source.includes(present)) continue;
    const occurrences = source.split(anchor).length - 1;
    if (occurrences !== 1) fail(`${relative}: expected one anchor, found ${occurrences}: ${anchor.slice(0, 80)}`);
    source = source.replace(anchor, replacement);
  }
  writeIfChanged(target, source);
}

// Chromium 157 split BrowserView out of the former monolithic UI target.
// Keep the bridge implementation with BrowserView and expose its declarations
// through BrowserView's header target, avoiding an implementation dependency cycle.
edit('chrome/browser/ui/views/frame/BUILD.gn', [
  {
    anchor: '  public = [ "browser_view.h" ]\n',
    replacement: '  public = [ "browser_view.h", "//chrome/browser/ui/blanc_prototype_ui.h" ]\n',
    present: '"browser_view.h", "//chrome/browser/ui/blanc_prototype_ui.h"',
  },
  {
    anchor: '  sources = [ "browser_view.cc" ]\n',
    replacement: '  sources = [ "browser_view.cc", "//chrome/browser/ui/blanc_prototype_ui.cc" ]\n',
    present: '"browser_view.cc", "//chrome/browser/ui/blanc_prototype_ui.cc"',
  },
  {
    anchor: '  deps = [\n    ":app_menu_button",\n    ":browser_frame_view",\n',
    replacement: '  deps = [\n    "//chrome/browser/bookmarks",\n    "//chrome/browser/history",\n    "//components/bookmarks/browser",\n    "//components/bookmarks/common",\n    "//components/history/core/browser",\n    "//components/input",\n    "//components/keyed_service/core",\n    "//components/tab_groups",\n    "//components/viz/common",\n    ":app_menu_button",\n    ":browser_frame_view",\n',
    present: '  deps = [\n    "//chrome/browser/bookmarks",\n    "//chrome/browser/history",\n',
  },
]);

edit('chrome/browser/ui/webui/chrome_web_ui_configs.cc', [
  {
    anchor: '#include "chrome/browser/ui/webui/chrome_web_ui_configs.h"\n',
    replacement: '#include "chrome/browser/ui/webui/chrome_web_ui_configs.h"\n\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
  },
  {
    anchor: '  auto& map = content::WebUIConfigMap::GetInstance();\n',
    replacement: '  auto& map = content::WebUIConfigMap::GetInstance();\n  map.AddWebUIConfig(std::make_unique<blanc_prototype::Config>());\n',
    present: '  map.AddWebUIConfig(std::make_unique<blanc_prototype::Config>());\n',
  },
]);

const browserViewFile = path.join(chromium, 'chrome/browser/ui/views/frame/browser_view.cc');
writeIfChanged(browserViewFile, fs.readFileSync(browserViewFile, 'utf8')
  .replace('if (blanc_prototype::IsEnabled())\n    AddChildView', 'if (blanc_prototype::IsIslandWindow(browser_))\n    AddChildView')
  .replace('blanc_prototype::LayoutIsland(this, top_container_->bounds().bottom());', 'blanc_prototype::LayoutIsland(this, top_container_->y());'));

edit('chrome/browser/ui/views/frame/browser_view.cc', [
  {
    anchor: '#include "chrome/browser/ui/browser_commands.h"\n',
    replacement: '#include "chrome/browser/ui/browser_commands.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
  },
  {
    anchor: '  window_scrim_view_ = AddChildView(std::make_unique<ScrimView>());\n',
    replacement: '  window_scrim_view_ = AddChildView(std::make_unique<ScrimView>());\n  if (blanc_prototype::IsIslandWindow(browser_))\n    AddChildView(blanc_prototype::CreateIsland(browser_));\n',
    present: '    AddChildView(blanc_prototype::CreateIsland(browser_));\n',
  },
  {
    anchor: '  LayoutSuperclass<views::View>(this);\n',
    replacement: '  LayoutSuperclass<views::View>(this);\n  if (blanc_prototype::IsEnabled())\n    blanc_prototype::LayoutIsland(this, top_container_->y());\n',
    present: '    blanc_prototype::LayoutIsland(this, top_container_->y());\n',
  },
]);


// Keep the browser's tab model and command support; replace only its visible chrome.
edit('chrome/browser/ui/views/frame/browser_view.cc', [
  ...['ShouldDrawTabStrip', 'IsToolbarVisible', 'IsBookmarkBarVisible'].map((name) => ({
    anchor: `bool BrowserView::${name}() const {\n`,
    replacement: `bool BrowserView::${name}() const {\n  if (blanc_prototype::IsIslandWindow(browser_)) return false;\n`,
    present: `bool BrowserView::${name}() const {\n  if (blanc_prototype::IsIslandWindow(browser_))`,
  })),
  {
    anchor: 'BrowserView::~BrowserView() {\n',
    replacement: 'BrowserView::~BrowserView() {\n  blanc_prototype::RestoreExtensions(this);\n',
    present: '  blanc_prototype::RestoreExtensions(this);\n',
  },
  {
    anchor: 'int BrowserView::NonClientHitTest(const gfx::Point& point) {\n',
    replacement: `int BrowserView::NonClientHitTest(const gfx::Point& point) {
  if (blanc_prototype::IsIslandWindow(browser_)) {
    gfx::Point local(point);
    views::View::ConvertPointToTarget(parent(), this, &local);
    if (blanc_prototype::IsCaption(this, local.x(), local.y())) return HTCAPTION;
    if (local.y() >= 0 && local.y() < 68) return HTCLIENT;
  }
`,
    present: '    if (blanc_prototype::IsCaption(this, local.x(), local.y())) return HTCAPTION;',
  },
]);
edit('chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.cc', [
  {
    anchor: '  return info;\n}\n\nBrowserViewTabbedLayoutImpl::SidePanelContentAnimation',
    replacement: `  if (blanc_prototype::HasIsland(views().browser_view)) {
    info.top_container_separator = false;
    info.multi_contents_separator = false;
  }
  return info;
}

BrowserViewTabbedLayoutImpl::SidePanelContentAnimation`,
    present: '    info.multi_contents_separator = false;',
  },
  {
    anchor: '#include "chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.h"\n',
    replacement: '#include "chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"',
  },
  {
    anchor: '  const int original_top = params.visual_client_area.y();\n',
    replacement: `  const int original_top = params.visual_client_area.y();
  if (blanc_prototype::HasIsland(views().browser_view)) {
    for (views::View* child : views().top_container->children())
      layout.AddChild(child, gfx::Rect(), false);
    return gfx::Rect(params.visual_client_area.x(), original_top,
                     params.visual_client_area.width(), 68);
  }
`,
    present: '  if (blanc_prototype::HasIsland(views().browser_view)) {',
  },
]);
// The Island owns fullscreen chrome too; do not move hidden Chromium controls
// into macOS's separate immersive toolbar window.
edit('chrome/browser/ui/window_feature_controller/window_feature_controller.cc', [
  {
    anchor: '#include "base/check.h"\n',
    replacement: '#include "base/check.h"\n#include "base/command_line.h"\n',
    present: '#include "base/command_line.h"',
  },
  ...['UsesImmersiveFullscreenMode', 'UsesImmersiveFullscreenTabbedMode'].map((name) => ({
    anchor: `bool WindowFeatureController::${name}() const {\n`,
    replacement: `bool WindowFeatureController::${name}() const {
  if (browser_type_ == BrowserWindowInterface::Type::TYPE_NORMAL &&
      base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-prototype-assets"))
    return false;
`,
    present: `bool WindowFeatureController::${name}() const {\n  if (browser_type_`,
  })),
]);

edit('chrome/browser/ui/views/frame/browser_native_widget_mac.mm', [
  {
    anchor: '#import "chrome/browser/ui/views/frame/browser_native_widget_mac.h"\n',
    replacement: '#import "chrome/browser/ui/views/frame/browser_native_widget_mac.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"',
  },
  {
    anchor: '    float* titlebar_height) {\n',
    replacement: `    float* titlebar_height) {
  if (browser_view_ && blanc_prototype::IsIslandWindow(browser_view_->browser())) {
    *override_titlebar_height = true;
    // Use inset native window controls, independent of the 68px Island header.
    *titlebar_height = 56;
    return;
  }
`,
    present: '    *titlebar_height = 56;',
  },
]);

// Match the inset AppKit titlebar used by Blanc's Electron window. These
// remain real NSWindow buttons, including hover, minimize and fullscreen.
edit('components/remote_cocoa/app_shim/browser_native_widget_window_mac.mm', [
  {
    anchor: '#include "base/mac/mac_util.h"\n',
    replacement: '#include "base/mac/mac_util.h"\n#include "base/command_line.h"\n',
    present: '#include "base/command_line.h"',
  },
  {
    anchor: '- (CGFloat)_minXTitlebarWidgetInset {\n',
    replacement: `- (CGFloat)_minXTitlebarWidgetInset {
  if (!_inFullScreen && base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-prototype-assets"))
    return 21.0;
`,
    present: '    return 21.0;',
  },
]);
edit('chrome/browser/ui/views/frame/browser_frame_view_mac.mm', [
  {
    anchor: '#include "base/command_line.h"\n',
    replacement: '#include "base/command_line.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"',
  },
  {
    anchor: '  // LINT.IfChange(MacTabStripInsets)\n',
    replacement: `  if (blanc_prototype::IsIslandWindow(GetBrowserView()->browser())) {
    result.bounds = gfx::RectF(20, 20, 62, 16);
    result.margins = gfx::OutsetsF::VH(20, 20);
    return result;
  }

  // LINT.IfChange(MacTabStripInsets)
`,
    present: '    result.bounds = gfx::RectF(20, 20, 62, 16);',
  },
]);

// Retire the first controller-switch hooks: Chromium's ActionItem path bypasses
// that switch. The shared command functions below serve both dispatch paths.
const controllerFile = path.join(chromium, 'chrome/browser/ui/browser_command_controller.cc');
let controllerSource = fs.readFileSync(controllerFile, 'utf8');
controllerSource = controllerSource
  .replace('      if (blanc_prototype::IsEnabled())\n        blanc_prototype::OpenIsland(browser_, true);\n', '')
  .replace('      if (blanc_prototype::IsEnabled() && blanc_prototype::OpenIsland(browser_))\n        break;\n', '');
writeIfChanged(controllerFile, controllerSource);
// The Island is the effective location bar, including in browser fullscreen.
edit('chrome/browser/ui/browser_command_controller.cc', [
  {
    anchor: '#include "chrome/browser/ui/browser_command_controller.h"\n',
    replacement: '#include "chrome/browser/ui/browser_command_controller.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"',
  },
  {
    anchor: 'bool BrowserCommandController::IsShowingLocationBar() {\n',
    replacement: 'bool BrowserCommandController::IsShowingLocationBar() {\n  if (blanc_prototype::IsIslandWindow(browser_)) return true;\n',
    present: 'bool BrowserCommandController::IsShowingLocationBar() {\n  if (blanc_prototype::IsIslandWindow(browser_))',
  },
]);
edit('chrome/browser/ui/views/frame/browser_view.cc', [{
  anchor: 'bool BrowserView::IsLocationBarVisible() const {\n',
  replacement: 'bool BrowserView::IsLocationBarVisible() const {\n  if (blanc_prototype::IsIslandWindow(browser_)) return true;\n',
  present: 'bool BrowserView::IsLocationBarVisible() const {\n  if (blanc_prototype::IsIslandWindow(browser_))',
}]);


edit('chrome/browser/ui/browser_commands.cc', [
  {
    anchor: '#include "chrome/browser/ui/browser_commands.h"\n',
    replacement: '#include "chrome/browser/ui/browser_commands.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
  },
  {
    anchor: '    return *AddAndReturnTabAt(browser, GURL(), -1, /*foreground=*/true,\n                              std::nullopt, /*pinned=*/false, window_action);\n',
    replacement: '    auto* contents = AddAndReturnTabAt(browser, GURL(), -1, /*foreground=*/true,\n                                       std::nullopt, /*pinned=*/false, window_action);\n    if (context == NewTabTypes::kNewTabCommand && blanc_prototype::IsEnabled())\n      blanc_prototype::OpenIsland(browser, true);\n    return *contents;\n',
    present: '      blanc_prototype::OpenIsland(browser, true);\n',
  },
  {
    anchor: 'void FocusLocationBar(BrowserWindowInterface* browser) {\n',
    replacement: 'void FocusLocationBar(BrowserWindowInterface* browser) {\n  if (blanc_prototype::IsEnabled() && blanc_prototype::OpenIsland(browser))\n    return;\n',
    present: '  if (blanc_prototype::IsEnabled() && blanc_prototype::OpenIsland(browser))\n',
  },
]);

// ⌘D (IDC_BOOKMARK_THIS_TAB) toggles the Island's Favorite instead of opening
// Chromium's star bubble, which has no toolbar to anchor to in Island windows.
// The shared command function serves both dispatch paths; its parameter type
// differs between Chromium pins, so accept either exact signature.
const commandsFile = path.join(chromium, 'chrome/browser/ui/browser_commands.cc');
const commandsSource = fs.readFileSync(commandsFile, 'utf8');
const bookmarkAnchor = [
  'void BookmarkCurrentTab(BrowserWindowInterface* browser) {\n',
  'void BookmarkCurrentTab(Browser* browser) {\n',
].find((anchor) => commandsSource.split(anchor).length === 2);
if (!bookmarkAnchor) fail('BookmarkCurrentTab anchor changed');
edit('chrome/browser/ui/browser_commands.cc', [{
  anchor: bookmarkAnchor,
  replacement: `${bookmarkAnchor}  if (blanc_prototype::ToggleFavoriteFromIsland(browser))\n    return;\n`,
  present: '  if (blanc_prototype::ToggleFavoriteFromIsland(browser))\n',
}]);

edit('chrome/browser/search/search.cc', [
  {
    anchor: '#include "base/check_deref.h"\n',
    replacement: '#include "base/check_deref.h"\n#include "base/command_line.h"\n',
    present: '#include "base/command_line.h"',
  },
  {
    anchor: '    const bool default_is_google = DefaultSearchProviderIsGoogle(profile);\n',
    replacement: `    if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-prototype-assets"))
      return NewTabURLDetails(GURL("chrome://blanc-prototype/pages/newtab.html"),
                              NEW_TAB_URL_VALID);

    const bool default_is_google = DefaultSearchProviderIsGoogle(profile);
`,
    present: 'return NewTabURLDetails(GURL("chrome://blanc-prototype/pages/newtab.html"),',
  },
]);

// Use a distinct catalog identity so the Dock does not reuse Chromium's
// AppIcon rendition when upgrading this local bundle without a version bump.
// Keep the original seven-character length: Chromium embeds the source plist's
// byte size in libbase; changing it triggers unrelated generated dependents.
edit('chrome/app/app-Info.plist', [{
  anchor: '<key>CFBundleIconName</key>\n\t<string>AppIcon</string>',
  replacement: '<key>CFBundleIconName</key>\n\t<string>BlancDK</string>',
  present: '<key>CFBundleIconName</key>\n\t<string>BlancDK</string>',
}]);

// Refresh the runtime icon as well as the bundle resources: macOS can retain
// Chromium's old Dock tile for a locally rebuilt app with the same identity.
edit('chrome/browser/app_controller_mac.mm', [{
  anchor: '  [self setUpdateCheckInterval];',
  replacement: `  [self setUpdateCheckInterval];

  if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-prototype-assets")) {
    NSImage* blancIcon = [NSWorkspace.sharedWorkspace
        iconForFile:NSRunningApplication.currentApplication.bundleURL.path];
    NSApp.applicationIconImage = blancIcon;
  }`,
  present: 'NSApp.applicationIconImage = blancIcon;',
}]);

edit('chrome/app/theme/chromium/BRANDING', [
  { anchor: 'PRODUCT_FULLNAME=Chromium\n', replacement: 'PRODUCT_FULLNAME=Blanc Prototype\n', present: 'PRODUCT_FULLNAME=Blanc Prototype\n' },
  { anchor: 'PRODUCT_SHORTNAME=Chromium\n', replacement: 'PRODUCT_SHORTNAME=Blanc Prototype\n', present: 'PRODUCT_SHORTNAME=Blanc Prototype\n' },
  { anchor: 'PRODUCT_INSTALLER_FULLNAME=Chromium Installer\n', replacement: 'PRODUCT_INSTALLER_FULLNAME=Blanc Prototype Installer\n', present: 'PRODUCT_INSTALLER_FULLNAME=Blanc Prototype Installer\n' },
  { anchor: 'PRODUCT_INSTALLER_SHORTNAME=Chromium Installer\n', replacement: 'PRODUCT_INSTALLER_SHORTNAME=Blanc Prototype Installer\n', present: 'PRODUCT_INSTALLER_SHORTNAME=Blanc Prototype Installer\n' },
  { anchor: 'MAC_BUNDLE_ID=org.chromium.Chromium\n', replacement: 'MAC_BUNDLE_ID=day.blanc.prototype\n', present: 'MAC_BUNDLE_ID=day.blanc.prototype\n' },
]);

// This Chromium pin's pruned WebUI npm archive intentionally omits transitive
// declaration files referenced by @types/node. Avoid traversing those external
// declarations while still type-checking the ESLint tool's own sources.
const eslintBuild = path.join(chromium, 'ui/webui/resources/tools/eslint/BUILD.gn');
let eslintBuildSource = fs.readFileSync(eslintBuild, 'utf8');
eslintBuildSource = eslintBuildSource.replace(
  '  definitions = [ "//third_party/node/node_modules/@types/node/buffer.d.ts" ]\n\n',
  '',
);
eslintBuildSource = eslintBuildSource.replace(
  '  definitions = [ "//third_party/node/node_modules/buffer/index.d.ts" ]\n\n', '',
);
if (!eslintBuildSource.includes('  path_mappings = [\n')) fail('ESLint path mappings anchor changed');
eslintBuildSource = eslintBuildSource.replace('  path_mappings = [\n',
  '  definitions = [ "//third_party/node/node_modules/buffer/index.d.ts" ]\n\n  path_mappings = [\n');
writeIfChanged(eslintBuild, eslintBuildSource);
const bufferStub = path.join(chromium, 'third_party/node/node_modules/buffer/index.d.ts');
fs.mkdirSync(path.dirname(bufferStub), { recursive: true });
writeIfChanged(bufferStub, 'export {};\n');
edit('ui/webui/resources/tools/eslint/tsconfig_base.json', [{
  anchor: '    "types": ["node", "trusted-types"]\n',
  replacement: '    "types": ["node", "trusted-types"],\n    "skipLibCheck": true\n',
  present: '    "skipLibCheck": true\n',
}]);


// Blanc exposes extension actions in the expanded Island, never as pinned icons.
edit('chrome/browser/ui/views/extensions/extensions_toolbar_button.h', [
  { anchor: "  int GetIconSize() const override;",
    replacement: "  int GetIconSize() const override;\n  SkColor GetForegroundColor(ButtonState state) const override;",
    present: "  SkColor GetForegroundColor(ButtonState state) const override;" },
]);
edit('chrome/browser/ui/views/extensions/extensions_toolbar_button.cc', [
  { anchor: "    const views::SizeBounds& available_size) const {\n  return extensions_toolbar_->GetToolbarActionSize();",
    replacement: "    const views::SizeBounds& available_size) const {\n  if (blanc_prototype::IsIslandWindow(browser_)) return gfx::Size(26, 26);\n  return extensions_toolbar_->GetToolbarActionSize();",
    present: "if (blanc_prototype::IsIslandWindow(browser_)) return gfx::Size(26, 26);" },
  { anchor: "#include \"ui/views/accessibility/view_accessibility.h\"\n",
    replacement: "#include \"ui/views/accessibility/view_accessibility.h\"\n#include \"ui/native_theme/native_theme.h\"\n#include \"ui/views/animation/ink_drop.h\"\n#include \"ui/views/animation/ink_drop_highlight.h\"\n#include \"ui/views/animation/flood_fill_ink_drop_ripple.h\"\n#include \"ui/views/controls/highlight_path_generator.h\"\n",
    present: "#include \"ui/views/animation/ink_drop_highlight.h\"" },
  { anchor: "  GetViewAccessibility().SetHasPopup(ax::mojom::HasPopup::kMenu);",
    replacement: "  if (blanc_prototype::IsIslandWindow(browser_)) {\n    // Match Blanc's 26px circular action hover while retaining the native anchor.\n    views::InstallFixedSizeCircleHighlightPathGenerator(this, 13);\n    views::InkDrop::Get(this)->SetCreateHighlightCallback(base::BindRepeating(\n        [](views::View* host) {\n          const bool dark = host->GetNativeTheme()->preferred_color_scheme() == ui::NativeTheme::PreferredColorScheme::kDark;\n          const SkColor ink = dark ? SkColorSetRGB(245, 245, 245)\n                                   : SkColorSetRGB(17, 17, 17);\n          auto highlight = std::make_unique<views::InkDropHighlight>(\n              gfx::SizeF(host->size()), ink);\n          highlight->set_visible_opacity(dark ? 0.12f : 0.08f);\n          return highlight;\n        }, this));\n    views::InkDrop::Get(this)->SetCreateRippleCallback(base::BindRepeating(\n        [](views::View* host) -> std::unique_ptr<views::InkDropRipple> {\n          const bool dark = host->GetNativeTheme()->preferred_color_scheme() == ui::NativeTheme::PreferredColorScheme::kDark;\n          return std::make_unique<views::FloodFillInkDropRipple>(\n              views::InkDrop::Get(host), host->size(),\n              host->GetLocalBounds().CenterPoint(),\n              dark ? SkColorSetRGB(245, 245, 245) : SkColorSetRGB(17, 17, 17),\n              dark ? 0.12f : 0.08f);\n        }, this));\n  }\n\n  GetViewAccessibility().SetHasPopup(ax::mojom::HasPopup::kMenu);",
    present: "// Match Blanc's 26px circular action hover" },
  { anchor: "int ExtensionsToolbarButton::GetIconSize() const {\n",
    replacement: "SkColor ExtensionsToolbarButton::GetForegroundColor(ButtonState state) const {\n  if (!blanc_prototype::IsIslandWindow(browser_) || state == STATE_DISABLED)\n    return ToolbarChipButton::GetForegroundColor(state);\n  const bool dark = GetNativeTheme()->preferred_color_scheme() == ui::NativeTheme::PreferredColorScheme::kDark;\n  if (state == STATE_HOVERED || state == STATE_PRESSED)\n    return dark ? SkColorSetRGB(245, 245, 245) : SkColorSetRGB(17, 17, 17);\n  return dark ? SkColorSetRGB(156, 156, 156) : SkColorSetRGB(107, 107, 107);\n}\n\nint ExtensionsToolbarButton::GetIconSize() const {\n",
    present: "SkColor ExtensionsToolbarButton::GetForegroundColor(ButtonState state) const {" },
  { anchor: '#include "chrome/browser/ui/views/extensions/extensions_toolbar_button.h"\n',
    replacement: '#include "chrome/browser/ui/views/extensions/extensions_toolbar_button.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"' },
  { anchor: 'int ExtensionsToolbarButton::GetIconSize() const {\n',
    replacement: 'int ExtensionsToolbarButton::GetIconSize() const {\n  // Match the Island\'s 14px icons at 1.15 zoom, retaining native hit bounds.\n  if (blanc_prototype::IsIslandWindow(browser_)) return 16;\n',
    present: 'if (blanc_prototype::IsIslandWindow(browser_)) return 16;' },
  { anchor: 'void ExtensionsToolbarButton::ToggleExtensionsMenu() {\n',
    replacement: 'void ExtensionsToolbarButton::ToggleExtensionsMenu() {\n  if (blanc_prototype::OpenExtensions(browser_)) return;\n',
    present: 'if (blanc_prototype::OpenExtensions(browser_)) return;' },
]);
edit('chrome/browser/ui/views/extensions/extensions_toolbar_desktop.cc', [
  { anchor: '#include "chrome/browser/ui/views/extensions/extensions_toolbar_desktop.h"\n',
    replacement: '#include "chrome/browser/ui/views/extensions/extensions_toolbar_desktop.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n',
    present: '#include "chrome/browser/ui/blanc_prototype_ui.h"' },
  { anchor: '  // Popped out action uses a flex rule',
    replacement: '  if (blanc_prototype::IsIslandWindow(browser_)) {\n    GetAnimatingLayoutManager()->FadeOut(action_view);\n    return;\n  }\n\n  // Popped out action uses a flex rule',
    present: 'blanc_prototype::IsIslandWindow(browser_)) {\n    GetAnimatingLayoutManager()->FadeOut(action_view);' },
  { anchor: '  icon->SetVisible(ToolbarActionsModel::CanShowActionsInToolbar(*browser_) &&',
    replacement: '  icon->SetVisible(!blanc_prototype::IsIslandWindow(browser_) &&\n                   ToolbarActionsModel::CanShowActionsInToolbar(*browser_) &&',
    present: 'icon->SetVisible(!blanc_prototype::IsIslandWindow(browser_)' },
  { anchor: '  return model_->IsActionPinned(action_id) || ShouldForceVisibility(action_id);',
    replacement: '  return !blanc_prototype::IsIslandWindow(browser_) &&\n      (model_->IsActionPinned(action_id) || ShouldForceVisibility(action_id));',
    present: 'return !blanc_prototype::IsIslandWindow(browser_) &&' },
  { anchor: '  UpdateExtensionsButton(*web_contents);\n  UpdateRequestAccessButton(*web_contents);\n}',
    replacement: '  UpdateExtensionsButton(*web_contents);\n  UpdateRequestAccessButton(*web_contents);\n  if (blanc_prototype::IsIslandWindow(browser_))\n    request_access_button_->SetVisible(false);\n}',
    present: 'request_access_button_->SetVisible(false);' },
  { anchor: '  ToolbarActionView* view = GetViewForId(action_id);\n  return view ? view->GetReferenceButtonForPopup()',
    replacement: '  if (blanc_prototype::IsIslandWindow(browser_)) return GetExtensionsButtonAnchor();\n  ToolbarActionView* view = GetViewForId(action_id);\n  return view ? view->GetReferenceButtonForPopup()',
    present: 'if (blanc_prototype::IsIslandWindow(browser_)) return GetExtensionsButtonAnchor();' },
]);

prepareComponent(edit);
prepareDocumentTarget(edit);
console.log(`Prepared Blanc Chromium prototype from ${expectedVersion}`);
console.log(`Assets: ${generated}`);
