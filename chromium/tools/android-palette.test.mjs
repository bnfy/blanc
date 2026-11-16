// The palette's emulator check (tests/android/palette.mjs) reads the dump and the keyboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {keyboardTop, matching, paletteField} from '../tests/android/palette.mjs';

test('the focused field is found, an unfocused one isn\'t', () => {
  const xml = '<node class="android.widget.EditText" focused="true" bounds="[10,1500][900,1600]" />';
  assert.deepEqual(paletteField(xml), {left: 10, top: 1500, right: 900, bottom: 1600});
  assert.equal(paletteField(xml.replace('true', 'false')), null);
});

test('nodes match by text or description', () => {
  const xml = '<node text="Open tabs  3" content-desc="" bounds="[0,10][100,40]" /><node text="" content-desc="Domains, www.iana.org" bounds="[0,50][100,90]" />';
  assert.deepEqual(matching(xml, /^Open tabs {2}\d+$/), {left: 0, top: 10, right: 100, bottom: 40});
  assert.deepEqual(matching(xml, /, www\.iana\.org$/, 'content-desc'), {left: 0, top: 50, right: 100, bottom: 90});
  assert.equal(matching(xml, /nothing/), null);
});

test('the keyboard is read from its inset frame, only while it shows', () => {
  const shown = '        InsetsSource id=3 type=ime frame=[0,1023][1080,1920] visibleFrame=[0,1023][1080,1920] visible=true flags=';
  assert.equal(keyboardTop(shown), 1023);
  assert.equal(keyboardTop(shown.replace('visible=true', 'visible=false')), null);
  assert.equal(keyboardTop(''), null);
});
