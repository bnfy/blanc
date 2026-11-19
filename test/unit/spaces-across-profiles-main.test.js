'use strict';

// Spaces across profiles (spec 2026-11-19 §5): main opens and creates a Space
// in another profile through link routing's one path, and the calls that must
// stay inside this window's profile never read a profileId.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fn = (name) => {
  const source = main.match(new RegExp(`\\nfunction ${name}\\([^)]*\\)[^\\n]*\\{[\\s\\S]*?\\n\\}\\n`))?.[0];
  assert.ok(source, `${name} not found in main.js`);
  return source;
};
const handler = (channel) => {
  const start = main.indexOf(`chromeHandle('${channel}'`);
  assert.ok(start > 0, `${channel} handler not found`);
  const end = main.indexOf('\n  chrome', start + 10);
  return main.slice(start, end);
};

test('one function opens a Space in another profile', () => {
  assert.ok(!main.includes('openSpaceForRoutedLink'), 'link routing and the menu share openSpaceInProfile');
  const open = fn('openSpaceInProfile');
  assert.match(open, /withLocalProfile\(profileId, \(\) => workspaceController\.open\(caller, spaceId, \{ newWindow: true \}\)\)/);
  assert.match(fn('routedExternalRuntime'), /openSpace: \(target\) => openSpaceInProfile\(target, \{ background \}\)\.runtime \?\? null,/);
  assert.match(handler('chrome:workspaces-open'), /openSpaceInProfile\(/);
  assert.match(handler('chrome:workspaces-create-blank'), /createSpaceInProfile\(/);
});

test("this window's own profileId takes today's path", () => {
  for (const channel of ['chrome:workspaces-open', 'chrome:workspaces-create-blank']) {
    assert.match(handler(channel), /otherProfileTarget\(opts\)/, `${channel} asks whether the profile is another one`);
  }
  const helper = fn('otherProfileTarget');
  assert.match(helper, /profileId !== rt\(\)\.profileId/);
  assert.match(handler('chrome:workspaces-open'), /switchWindowToWorkspace\(rt\(\), id,/);
  assert.match(handler('chrome:workspaces-create-blank'), /createBlankWorkspaceAndSwitch\(rt\(\), name,/);
});

test('save-as and the this-profile-only calls never read a profileId', () => {
  for (const channel of ['chrome:workspaces-save-as', 'chrome:workspaces-update', 'chrome:workspaces-remove', 'chrome:workspaces-undo-remove']) {
    // rt().profileId (this window's own) is fine; a profileId from the renderer is not.
    assert.ok(!handler(channel).replaceAll('rt().profileId', '').includes('profileId'), `${channel} must stay in this window's profile`);
  }
});

test("a profile that isn't live is refused before any window opens", () => {
  for (const name of ['openSpaceInProfile', 'createSpaceInProfile']) {
    const source = fn(name);
    const guard = source.indexOf('linkRouteLiveness.isLiveProfile(profileId)');
    assert.ok(guard > 0, `${name} checks the profile is live`);
    assert.ok(guard < source.indexOf('workspaceController'), `${name} checks before the controller`);
    assert.match(source, /error: 'profile-unavailable'/);
  }
});

test('a mini window is refused before either path', () => {
  for (const channel of ['chrome:workspaces-open', 'chrome:workspaces-create-blank']) {
    const source = handler(channel);
    assert.ok(source.indexOf("rt().mini") >= 0 && source.indexOf("rt().mini") < source.indexOf('InProfile('), channel);
  }
});

test('the projection adds other profiles only through the allowlisting module', () => {
  const projection = fn('workspacesProjection');
  assert.match(projection, /otherProfileSpaces\(\{/);
  assert.match(projection, /otherProfiles: otherProfiles\.length \? otherProfiles : undefined,/);
  assert.match(projection, /profileName: otherProfiles\.length \? /);
});

// Review fixes (2026-11-19).
test('a Space created in another profile credits that profile, not the calling window', () => {
  assert.match(fn('createSpaceInProfile'), /noteSpaceCreated\(profileId\)/);
  assert.match(fn('noteSpaceCreated'), /function noteSpaceCreated\(profileId = rt\(\)\.profileId\)/);
});

test('creating, renaming or deleting a profile refreshes every Spaces menu', () => {
  assert.match(main, /create: \(\.\.\.args\) => afterProfileChange\(createNamedLocalProfileWindow\(\.\.\.args\)\),/);
  assert.match(main, /rename: \(\.\.\.args\) => afterProfileChange\(renameNamedLocalProfile\(\.\.\.args\)\),/);
  assert.match(main, /remove: \(\.\.\.args\) => afterProfileChange\(deleteNamedLocalProfile\(\.\.\.args\)\),/);
  assert.match(fn('afterProfileChange'), /broadcastWorkspacesUpdated\(\)/);
});

// Found on the Mac Studio (F41-86): bringing another window forward and then
// closing this window's menu the usual way handed focus back to this page.
test('a Space opened in another window closes this menu without taking focus back', () => {
  const open = handler('chrome:workspaces-open');
  const create = handler('chrome:workspaces-create-blank');
  for (const source of [open, create]) assert.match(source, /settleElsewhere\(/);
  const settle = fn('settleElsewhere');
  assert.match(settle, /result\?\.ok && result\.windowId && result\.windowId !== String\(rt\(\)\.id\)/);
  assert.match(settle, /hideOverlay\(\{ refocusContent: false \}\)/);
});
