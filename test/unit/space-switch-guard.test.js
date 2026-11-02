'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_REPORTED, blockingReason, blockingPages } = require('../../src/main/space-switch-guard');

const facts = (over = {}) => ({
  popupCount: () => 0,
  mainFrameLoading: () => false,
  openerConnected: () => false,
  label: (tab) => tab.title,
  ...over,
});

test('an idle page never blocks a space switch', () => {
  assert.equal(blockingReason({ id: 'a' }, facts()), null);
});

test('loading inside a frame does not block; the page document loading does (#1140)', () => {
  const tab = { id: 'a', isLoading: true };
  assert.equal(blockingReason(tab, facts()), null);
  assert.equal(blockingReason(tab, facts({ mainFrameLoading: () => true })), 'loading');
  assert.equal(blockingReason({ id: 'a', isLoading: false }, facts({ mainFrameLoading: () => true })), null);
});

test('a page-opened tab blocks only while its opener is still connected (#1140)', () => {
  const tab = { id: 'child', openerTabId: 'opener' };
  assert.equal(blockingReason(tab, facts()), null, 'opener closed or quiet');
  assert.equal(blockingReason(tab, facts({ openerConnected: () => true })), 'opener');
  assert.equal(blockingReason({ id: 'plain' }, facts({ openerConnected: () => true })), null);
});

test('a page-opened tab the person opened in the background never blocks (#1140)', () => {
  // Cmd/Ctrl+click on GitHub or YouTube: the site's script calls window.open,
  // so the child keeps window.opener, but nothing is handing off to it.
  const tab = { id: 'child', openerTabId: 'opener', openedInBackground: true };
  assert.equal(blockingReason(tab, facts({ openerConnected: () => true })), null);
  assert.equal(blockingReason({ ...tab, openedInBackground: false }, facts({ openerConnected: () => true })), 'opener');
  assert.equal(blockingReason({ ...tab, capturing: true }, facts({ openerConnected: () => true })), 'capture',
    'the other reasons still apply to a background child');
});

test('capture, pop-ups and quiet transitions still block', () => {
  assert.equal(blockingReason({ id: 'a', capturing: true }, facts()), 'capture');
  assert.equal(blockingReason({ id: 'a' }, facts({ popupCount: () => 1 })), 'popup');
  assert.equal(blockingReason({ id: 'a', sleeping: true }, facts()), 'loading');
  assert.equal(blockingReason({ id: 'a', waking: true }, facts()), 'loading');
});

test('capture outranks the other reasons for one page', () => {
  const tab = { id: 'a', capturing: true, isLoading: true, openerTabId: 'b' };
  assert.equal(blockingReason(tab, facts({ popupCount: () => 1, mainFrameLoading: () => true, openerConnected: () => true })), 'capture');
});

test('blocking pages are named in tab order and capped', () => {
  const list = [
    { id: 'a', title: 'Idle' },
    { id: 'b', title: 'Sign in', openerTabId: 'a' },
    { id: 'c', title: 'Call', capturing: true },
  ];
  assert.deepEqual(blockingPages(list, facts({ openerConnected: () => true })), [
    { id: 'b', title: 'Sign in', reason: 'opener' },
    { id: 'c', title: 'Call', reason: 'capture' },
  ]);
  const many = Array.from({ length: MAX_REPORTED + 5 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, capturing: true }));
  assert.equal(blockingPages(many, facts()).length, MAX_REPORTED);
});
