import assert from 'node:assert/strict';
import test from 'node:test';
import {checkUpdateNetLog} from './linux-relaunch.mjs';

const control = 'http://127.0.0.1:4242/after-relaunch';
const dict = 'https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-2.bdic';
const log = (...params) => JSON.stringify({events: [{params: {url: control}}, ...params.map(p => ({params: p}))]});

test('a Hunspell dictionary download is not an update check', () => {
  const hosts = checkUpdateNetLog(log({url: dict}, {original_url: dict}, {host: 'redirector.gvt1.com'}), control);
  assert.equal(hosts['redirector.gvt1.com'], 3);
});

test('any other request to the dictionary host still fails', () => {
  for (const other of [
    'https://redirector.gvt1.com/edgedl/release2/chrome_component/abc.crx3',
    'https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-2.bdic?x=1',
    'http://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-2.bdic',
  ]) {
    assert.throws(() => checkUpdateNetLog(log({url: dict}, {url: other}), control),
      /contacted an update or Chrome releases host: redirector\.gvt1\.com/, other);
  }
});

test('a resolution of the dictionary host with no dictionary request fails', () => {
  assert.throws(() => checkUpdateNetLog(log({host: 'redirector.gvt1.com'}), control), /redirector\.gvt1\.com/);
});

test('other gvt1 and Google update hosts still fail beside a dictionary download', () => {
  for (const url of ['https://r1---sn-abc.gvt1.com/edgedl/chrome/dict/en-us-10-2.bdic',
    'https://update.googleapis.com/service/update2/json', 'https://versionhistory.googleapis.com/v1/chrome']) {
    assert.throws(() => checkUpdateNetLog(log({url: dict}, {url}), control), /contacted an update/, url);
  }
});

test('the control request must be in the log', () => {
  assert.throws(() => checkUpdateNetLog(JSON.stringify({events: [{params: {url: dict}}]}), control), /Missing NetLog control/);
});
