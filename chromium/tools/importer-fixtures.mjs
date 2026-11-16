// Synthetic v1.49.1 Electron userData and a source-shaped import answer key.
// Rules: docs/chromium-replacement/2026-10-30-desktop-replacement-spec.md §7.
// No Electron, source checkout, clock, random generator or environment needed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// v1.49.1:src/main/history.js:6-15 (newest first, cap, store defaults).
const HISTORY_CAP = 5000;
// v1.49.1:src/main/session-workspace.js:11; local-profile-model.js:7-9;
// profile-deletions.js:5; document-policy.js:19.
const SESSION_VERSION = 2;
const PROFILE_VERSION = 1;
const DELETION_VERSION = 1;
const DOCUMENT_POLICY_VERSION = 1;
const PERSONAL_ID = 'default'; // The oracle calls this profile "personal".
const NAMED_ID = 'profile_22222222222242228222222222222222';
const DELETING_ID = 'profile_33333333333343338333333333333333';
const DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const PEER_ID = '55555555-5555-4555-8555-555555555555';
const ACCOUNT_ID = '6666666666666666666666666666666666666666666666666666666666666666';
const AT = 1794614400000;
const EARLIER = 1794528000000;

// Invented solid pixels, not copied artwork. v1.49.1:src/main/tabicons-model.js:
// 14-16,63-83 accepts this 32×32 PNG for Favorites/history/session/Sync icons.
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAO0lEQVR4nO3RQREAMAjEwKPaqrae8FIJ4cMvK+CYCdXvZtNZXY8HBvwBMhEyETIRMhEyETIRMhEyUcgHS9wCC/yDPqQAAAAASUVORK5CYII=';
// v1.49.1:src/main/wallpaper.js:23-24,79-89 stores JPEG bytes, not base64.
// A Latin-1 string represents those bytes in the string-only `files` API.
const WALLPAPER = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDrqKKK+KPeP//Z', 'base64').toString('latin1');

// v1.49.1:src/main/settings.js:196-397,458: complete defaults, device scope.
// Referenced defaults: chrome-layout.js:7; mouse-gestures.js:7;
// settings.js:92,96. Null Patron/supporter records contain no licence data.
const SETTINGS_DEFAULTS = {
  searchEngine: 'duckduckgo', searchEngineTemplate: '', searchSuggestions: true,
  bangsEnabled: true, customBangs: [], recentBangs: [], adblockEnabled: true,
  adblockProvider: 'blanc', homePage: '', theme: 'system', newtabLayout: 'billboard',
  newtabDynamicWallpaper: false, newtabColorWallpaper: false,
  newtabWallpaperColor: 'sage', newtabWallpaperFill: 'gradient',
  newtabFollowSpaceColor: false, newtabClockFont: 'instrument',
  newtabClockWeight: 500, newtabClockColor: 'auto', newtabClockTone: 50,
  newtabClockStyle: 'solid', newtabClockHeight: 100, newtabCustomWallpaper: false,
  newtabWallpaperWash: 100, newtabWallpaperStyle: 'auto', tabLayout: 'island',
  islandSiteColors: true, islandHoverOpen: false, islandTabIcons: false,
  launchSunrise: false, searchPriorityResults: false, islandAutoHide: false,
  islandAutoHideStyle: 'float', tabSwitchOrder: 'recent', reuseNewTab: true,
  surfaceStyle: 'sunrise', glanceFrame: null, linkRoutes: [], linkRoutesInApp: false,
  verticalTabsWidth: 248, verticalTabsTextSize: 'default', miniWindowShortcut: 'off',
  islandSize: 'default', pageZoom: 100, tabSleep: '1h', tabArchive: 'off',
  uiLanguage: 'system', mouseGesturesEnabled: false,
  mouseGestureMapping: {L: 'back', R: 'forward', U: 'newTab', D: 'closeTab'},
  appIcon: 'sunrise', presentationDefaultsResetVersion: 1, groupNamesRecasedVersion: 1,
  adblockExceptions: [], darkWebsites: false, darkWebsitesExceptions: [],
  webrtcPolicy: 'standard', webrtcAudioBuffer: 'automatic', secureDns: 'auto',
  secureDnsTemplate: '', onePasswordEnabled: false, onePasswordAccount: '',
  usagePing: true, onboardingVersion: 0, firstRunCompletedAt: 0,
  migrationChecklistDismissed: false, syncMigrationCompleted: false,
  tabImportCompleted: false, spaceMigrationCompleted: false, spaceChecklistIntroduced: false,
  defaultBrowserMigrationCompleted: false, defaultChecklistIntroduced: false,
  defaultBrowserReminderShown: false, iphoneMigrationCompleted: false,
  iphoneChecklistIntroduced: false, patronCalloutDismissedAt: 0,
  lastRunVersion: '', whatsNewVersion: '', whatsNewSince: 0,
  whatsNewPageVersion: '', whatsNewTabRelease: '', supporter: null, patron: null,
  deviceNames: {}, _syncMeta: {}, _syncTieBreakers: {},
};

// v1.49.1:src/main/settings.js:119.
export const SYNCED_KEYS = ['searchEngine', 'searchEngineTemplate', 'adblockEnabled', 'homePage', 'theme', 'adblockExceptions', 'newtabLayout', 'newtabDynamicWallpaper', 'newtabColorWallpaper', 'newtabWallpaperColor', 'newtabWallpaperFill', 'newtabFollowSpaceColor', 'newtabClockFont', 'newtabClockWeight', 'newtabClockColor', 'newtabClockTone', 'newtabClockStyle', 'newtabClockHeight', 'bangsEnabled', 'customBangs', 'deviceNames'];
// Settings the importer leaves in the Electron folder, each with its reason.
export const SETTINGS_LEFT_BEHIND = {
  _syncMeta: 'Owner, 2026-11-16: Sync clocks describe the Electron store; the fork keeps its own.',
  _syncTieBreakers: 'Owner, 2026-11-16: Sync tie-breakers describe the Electron store; the fork keeps its own.',
  supporter: 'The fork has no supporter store yet.',
  patron: 'The fork has no Patron licence store yet; the licence stays with the Electron app.',
};

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const copy = value => structuredClone(value);

// v1.49.1:src/main/main.js:6836-6867; session-workspace.js:54-85,188-204:
// saved windows, zipped tab columns and the focused window's rollback mirror.
// Groups: group-color.js:18-24; palette: src/renderer/space-identity.js:12-20.
// Splits: split-model.js:97-112; layout: split-layout.js:37-40.
// Meta: session-snapshot.js:50-73. No private bit exists in the saved columns;
// persistableEntries (session-snapshot.js:100-107) excludes private tabs first.
function windowEntry(profileId, primary) {
  const prefix = primary ? 'personal' : 'named';
  const urls = primary
    ? ['https://example.com/home', 'https://example.com/left', 'https://example.com/right']
    : ['https://named.example.com/page'];
  return {
    id: primary ? 'primary' : 'window_named', profileId, workspaceId: null,
    urls, activeIndex: primary ? 1 : 0,
    groups: primary ? [{id: 'group_fixture', name: 'Reading', collapsed: false, color: '#426c4c'}] : [],
    groupIds: primary ? [null, 'group_fixture', 'group_fixture'] : [null],
    pinned: primary ? [true, false, false] : [false],
    meta: urls.map((url, index) => ({
      title: `${prefix} page ${index + 1}`, favicon: ICON, lastViewedAt: AT,
      ...(primary && index === 0 ? {pinnedHomeUrl: url, customTitle: 'Home fixture'} : {}),
    })),
    ...(primary ? {
      splits: [{id: 'split_fixture', layout: {kind: 'columns', widths: [0.5, 0.5]}, focusedIndex: 1}],
      splitIds: [null, 'split_fixture', 'split_fixture'],
    } : {}),
    documentPolicy: DOCUMENT_POLICY_VERSION,
    inheritsDocumentPolicy: urls.map(() => false), sectionOrder: true,
  };
}

function profileFiles(profileId, label) {
  const base = `https://${label}.example.com`;
  // v1.49.1:src/main/bookmarks.js:8-10,55,62: ordered items and URL tombstones.
  const bookmarks = {
    items: [
      {id: `${label}_favorite_z`, url: `${base}/zeta`, title: 'Zeta', favicon: ICON, addedAt: EARLIER, updatedAt: AT, folder: 'Reading'},
      {id: `${label}_favorite_a`, url: `${base}/alpha`, title: 'Alpha', favicon: null, addedAt: AT, updatedAt: AT, folder: null},
    ],
    tombstones: [{url: `${base}/removed`, deletedAt: AT}],
  };
  // v1.49.1:src/main/history.js:7,14-16,42-45,119-124. The over-cap
  // input is intentionally adversarial but uses the writer's exact schema.
  const history = {
    entries: Array.from({length: HISTORY_CAP + 1}, (_, index) => ({
      url: `https://example.com/${label}/visit-${index}`, title: `Visit ${index}`,
      visitedAt: AT - index,
    })),
    siteIcons: [{key: 'example.com', favicon: ICON}],
  };
  // v1.49.1:src/main/downloads.js:12-14,79-90,108-135. Metadata only;
  // the invented absolute savePath is not a file to create or move.
  const downloads = {items: [{
    id: `${label}_download`, url: `${base}/fixture.txt`, filename: 'fixture.txt',
    savePath: `/synthetic-downloads/${label}/fixture.txt`, state: 'completed',
    canResume: false, receivedBytes: 12, totalBytes: 12,
    startedAt: EARLIER, finishedAt: AT, private: false,
  }]};
  // v1.49.1:src/main/permissions.js:18,28-30; permission-decisions.js:5-8,21-26.
  // clipboard-read is an intentional unsupported-type input, never a grant.
  const permissions = {decisions: {
    [`${base}|media|audio`]: 'allow', [`${base}|media|video`]: 'deny',
    [`${base}|geolocation`]: 'deny', [`${base}|notifications`]: 'allow',
    [`${base}|clipboard-read`]: 'allow',
  }};
  // v1.49.1:src/main/start-page-pins.js:20-22,30-42,115-120.
  const pins = {version: 1, pins: [{url: `${base}/pin`, title: 'Pinned fixture'}], clock: AT, tie: '77777777-7777-4777-8777-777777777777'};
  // v1.49.1:src/main/archive.js:11-13,65-69; tab-archive.js:91-106.
  const archive = {version: 1, entries: [{
    id: `arch-${AT}-${label === 'personal' ? 1 : 2}`, url: `${base}/archived`,
    title: 'Archived fixture', favicon: ICON, archivedAt: AT, lastViewedAt: EARLIER,
    documentPolicy: DOCUMENT_POLICY_VERSION, inheritsDocumentPolicy: false,
    customTitle: 'Saved reading', spaceName: 'Fixture space',
  }], notice: {state: 'done'}};
  // v1.49.1:src/main/workspaces.js:13; workspaces-model.js:21,33,73-102,
  // 148-153,214-218 (profile, revision, capture columns, color and symbol).
  const window = windowEntry(profileId, false);
  const {id: unusedId, workspaceId: unusedBinding, ...capture} = window;
  const workspaces = {version: 2, groupNamesRecased: 1, workspaces: [{
    id: `${label}_workspace`, name: 'Fixture space', ...capture,
    createdAt: EARLIER, updatedAt: AT, revision: 0, color: '#426c4c', symbol: 'book',
  }], deleted: []};
  // v1.49.1:src/main/shared-spaces.js:8-11. A complete unpaired default
  // record exercises schema-for-schema import without credentials/protocol data.
  const sharedSpaces = {
    accountId: '', enabled: false, index: {v: 1, spaces: {}}, knownIndex: {},
    blobs: {}, pending: {}, windows: {}, recoveries: {}, recoveryDone: {},
    sidecar: {devices: {}}, dormantIds: [], draftIds: [], draftPlans: {},
    askedDeviceIds: [], pairingBaseline: null, knownWorkspaceIds: null,
    recoveryNoticeSeen: false, requestLog: [], nextClass: 'I', cursors: {},
  };
  // v1.49.1:src/main/synced-closed.js:6,26-31;
  // synced-closed-model.js:9-13,21-30 (no private/page-state fields persisted).
  const closed = {accountId: ACCOUNT_ID, devices: {[DEVICE_ID]: {
    name: 'Fixture desktop', platform: 'darwin', updatedAt: AT,
    items: [{id: `${label}_closed`, url: `${base}/closed`, title: 'Closed fixture', closedAt: AT, spaceId: null}],
  }}, dismissed: {}};
  // v1.49.1:src/main/reader-mode.js:25; reader-model.js:5,10-16.
  const reader = {theme: 'system', font: 'serif', size: 20, width: 'comfortable'};
  return {
    'bookmarks.json': bookmarks, 'history.json': history, 'downloads.json': downloads,
    'site-permissions.json': permissions, 'start-page-pins.json': pins,
    'archive.json': archive, 'workspaces.json': workspaces,
    'shared-spaces.json': sharedSpaces, 'synced-closed.json': closed,
    'reader-appearance.json': reader,
  };
}

export function buildFixture() {
  const files = {};
  const expected = {
    schema: 1, source: 'v1.49.1', profiles: {}, device: {}, notImported: [],
    // Both earlier questions were answered by the owner on 2026-11-16 (plan
    // docs/superpowers/plans/2026-11-16-electron-profile-importer.md): the
    // synced settings go to Personal only, and every Sync field but the keys
    // moves so Sync stays on as the same device.
    undecided: [],
  };
  // v1.49.1:src/main/store.js:33-36,54-59: Personal root, named subfolder;
  // unscoped stores are device-wide. Do not manufacture named settings/session.
  for (const [profileId, label] of [[PERSONAL_ID, 'personal'], [NAMED_ID, 'named']]) {
    const prefix = profileId === PERSONAL_ID ? 'userData' : `userData/profiles/${profileId}`;
    const input = profileFiles(profileId, label);
    const answer = copy(input);
    answer['bookmarks.json'].tombstones = [];
    answer['history.json'].entries = answer['history.json'].entries.slice(0, HISTORY_CAP);
    const unsupported = Object.keys(answer['site-permissions.json'].decisions).find(name => name.endsWith('|clipboard-read'));
    delete answer['site-permissions.json'].decisions[unsupported];
    expected.profiles[profileId === PERSONAL_ID ? 'personal' : profileId] = answer;
    for (const [name, content] of Object.entries(input)) files[`${prefix}/${name}`] = json(content);
    expected.notImported.push(
      {source: `${prefix}/bookmarks.json#/tombstones`, reason: 'Section 7: deletion tombstones are dropped; live Favorites retain their order.'},
      {source: `${prefix}/history.json#/entries/${HISTORY_CAP}`, reason: 'Section 7: oldest overflow visit exceeds the shipping history cap.'},
      {source: `${prefix}/site-permissions.json#/decisions/${unsupported.replaceAll('~', '~0').replaceAll('/', '~1')}`, reason: 'Section 7: clipboard-read is not a shipping-promptable permission type.'},
    );
  }

  // v1.49.1:src/main/settings.js:88-96,119,334-339,390-396,458.
  // Complete defaults with invented preferences/clocks; no Patron/Sync secrets.
  const settings = {...copy(SETTINGS_DEFAULTS), theme: 'dark', tabLayout: 'vertical',
    homePage: 'https://example.com/start', usagePing: false, onboardingVersion: 1,
    firstRunCompletedAt: EARLIER, lastRunVersion: '1.49.1',
    _syncMeta: {theme: AT}, _syncTieBreakers: {theme: '88888888-8888-4888-8888-888888888888'}};
  // v1.49.1:src/main/main.js:6738,6876-6885 (one device-wide session).
  const windows = [windowEntry(PERSONAL_ID, true), windowEntry(NAMED_ID, false)];
  const {urls, activeIndex, groups, groupIds, pinned} = windows[0];
  const session = {version: SESSION_VERSION, activeWindowId: 'primary', windows,
    urls, activeIndex, groups, groupIds, pinned};
  // v1.49.1:src/main/local-profiles.js:48-54,86;
  // local-profile-model.js:21-41,71-72. The deleted folder is already gone,
  // but the registry/marker remain: a crash between main.js:14777 and 14786.
  const profiles = {version: PROFILE_VERSION, profiles: [
    {id: PERSONAL_ID, name: 'Personal', createdAt: 0},
    {id: NAMED_ID, name: 'Fixture profile', createdAt: EARLIER},
    {id: DELETING_ID, name: 'Removed fixture', createdAt: EARLIER},
  ]};
  // v1.49.1:src/main/profile-deletions.js:5,30-32,42-44,58-61.
  const deletions = {version: DELETION_VERSION, profileIds: [DELETING_ID]};
  // v1.49.1:src/main/sync.js:71-76,101-110. Both secret fields (key and
  // protectedKey) are absent; these invented IDs are not credentials.
  const sync = {enabled: false, handle: '', accountId: ACCOUNT_ID, lastSyncedAt: AT,
    lastError: null, erasurePending: false, deviceId: DEVICE_ID, syncTabs: false,
    syncSpaces: false, origin: '', recoveryPromptDismissed: false};
  // v1.49.1:src/main/tabsync.js:13; tabsync-model.js:43-54,110-111.
  const tabSync = {accountId: ACCOUNT_ID, devices: {[DEVICE_ID]: {
    name: 'Fixture desktop', platform: 'darwin', updatedAt: AT,
    tabs: [{url: 'https://example.com/synced', title: 'Synced fixture', groupId: 'group_fixture', pinned: false}],
    groups: [{id: 'group_fixture', name: 'Reading'}],
  }}};
  // v1.49.1:src/main/tabicons.js:41; tabicons-model.js:321-325,341-347.
  const tabIcons = {accountId: ACCOUNT_ID, devices: {[DEVICE_ID]: {
    updatedAt: AT, icons: [{url: 'https://example.com/synced', data: ICON}],
  }}};
  // v1.49.1:src/main/sends.js:12; sends-model.js:37-47,62-70.
  const sends = {accountId: ACCOUNT_ID, devices: {[DEVICE_ID]: {
    name: 'Fixture desktop', platform: 'darwin', updatedAt: AT,
    items: [{id: 'fixture_send', to: PEER_ID, url: 'https://example.com/sent', title: 'Sent fixture', sentAt: AT}],
  }}, dismissed: {}};
  // v1.49.1:src/main/telemetry.js:31-44,63-66: disk field is `id`, not installId.
  const install = {id: '99999999-9999-4999-8999-999999999999', createdAt: EARLIER,
    day1Default: false, day1Browsed: true};
  // v1.49.1:src/main/wallpaper.js:16,22-24,87-89: device-scoped source;
  // §7's profile-local destination still receives the exact same downscaled file.
  const wallpaper = {version: 1, hash: '16940a4b07f7246c', width: 1, height: 1, updatedAt: AT};
  const deviceInput = {
    'settings.json': settings, 'session.json': session, 'profiles.json': profiles,
    'profile-deletions.json': deletions, 'sync.json': sync, 'tab-sync.json': tabSync,
    'tab-icons.json': tabIcons, 'sends.json': sends, 'install.json': install,
    'wallpaper.json': wallpaper,
  };
  for (const [name, content] of Object.entries(deviceInput)) {
    files[`userData/${name}`] = json(content);
    if (name !== 'settings.json') expected.device[name] = copy(content);
  }
  // Settings split (owner, 2026-11-16): shipping's SYNCED_KEYS go to the
  // Personal profile only; the rest stay with the device. Sync's own clocks
  // describe Electron's store, and the fork has no Patron or supporter store.
  expected.profiles.personal['settings.json'] = Object.fromEntries(SYNCED_KEYS.map(key => [key, copy(settings[key])]));
  expected.device['settings.json'] = Object.fromEntries(Object.entries(copy(settings))
    .filter(([key]) => !SYNCED_KEYS.includes(key) && !SETTINGS_LEFT_BEHIND[key]));
  for (const [key, reason] of Object.entries(SETTINGS_LEFT_BEHIND)) {
    expected.notImported.push({source: `userData/settings.json#/${key}`, reason});
  }
  expected.device['profiles.json'].profiles = profiles.profiles.filter(profile => profile.id !== DELETING_ID);
  expected.device['profile-deletions.json'].profileIds = [];
  expected.notImported.push(
    {source: 'userData/profiles.json#/profiles/2', reason: 'Section 7: finish pending profile deletion before import; never recreate this identity.'},
    {source: 'userData/profile-deletions.json#/profileIds/0', reason: 'Section 7: completed deletion leaves no pending marker in the imported state; Electron source remains read-only.'},
  );
  files['userData/wallpaper/current.jpg'] = WALLPAPER;
  expected.device['wallpaper/current.jpg'] = WALLPAPER;
  return {files, expected};
}

export function writeFixture(dir) {
  if (typeof dir !== 'string' || !dir || /[\r\n\0]/.test(dir)) throw new Error('output directory must be a non-empty single-line path');
  const {files, expected} = buildFixture();
  // An atomic mkdir refuses existing files/directories/symlinks without
  // overwriting anything. Only create children after owning the new directory.
  fs.mkdirSync(path.dirname(dir), {recursive: true});
  fs.mkdirSync(dir);
  for (const [relative, content] of Object.entries({...files, 'expected.json': json(expected)})) {
    const destination = path.join(dir, relative);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, content, {encoding: relative.endsWith('.jpg') ? 'latin1' : 'utf8', flag: 'wx', mode: 0o600});
  }
  return {out: dir, files: Object.keys(files).length + 1};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('-')) {
      throw new Error('usage: node chromium/tools/importer-fixtures.mjs --out <new-directory>');
    }
    console.log(JSON.stringify(writeFixture(args[1])));
  } catch (error) {
    console.error(String(error.message).replace(/[\r\n]+/g, ' '));
    process.exitCode = 1;
  }
}
