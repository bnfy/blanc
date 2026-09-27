'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { currentSection } = require('../../src/renderer/pages/settings-nav-model');

const view = { top: 100, bottom: 700 }; // the sheet's scrolling card, not the window

test('the section filling most of the view is current', () => {
  const sections = [{ id: 'general', top: -400, bottom: 150 }, { id: 'sync', top: 150, bottom: 650 }];
  assert.deepEqual(currentSection(sections, view, null), { id: 'sync', anchored: false });
});

test('sections are measured against the given view, not the window', () => {
  // Fully inside a window starting at 0, but above this view.
  const sections = [{ id: 'general', top: 0, bottom: 90 }, { id: 'sync', top: 90, bottom: 1400 }];
  assert.equal(currentSection(sections, view, null).id, 'sync');
});

test('two short trailing sections both fully visible: the later one wins', () => {
  const sections = [{ id: 'patron', top: 300, bottom: 450 }, { id: 'help', top: 450, bottom: 600 }];
  assert.equal(currentSection(sections, view, null).id, 'help');
});

test('nothing visible keeps the first section rather than the last', () => {
  const sections = [{ id: 'general', top: 800, bottom: 900 }, { id: 'help', top: 900, bottom: 1000 }];
  assert.equal(currentSection(sections, view, null).id, 'general');
});

test('a deep-linked section keeps the marker while its heading is in the upper part of the view', () => {
  const sections = [{ id: 'profiles', top: 150, bottom: 300 }, { id: 'privacy', top: 300, bottom: 1500 }];
  assert.deepEqual(currentSection(sections, view, 'profiles'), { id: 'profiles', anchored: true });
});

test('a deep-linked section whose heading scrolled away releases the marker', () => {
  const sections = [{ id: 'profiles', top: -200, bottom: 120 }, { id: 'privacy', top: 120, bottom: 600 }];
  assert.deepEqual(currentSection(sections, view, 'profiles'), { id: 'privacy', anchored: false });
});
