const assert = require('node:assert/strict');
const test = require('node:test');
const {
  setupPermissionPolicy, setPermissionPrompter, setCaptureGrantObserver,
} = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}
const request = (session, permission, details) =>
  new Promise((resolve) => session.request({ id: 7 }, permission, resolve, details));

test('grant observer fires on the prompt path AND the stored-allow path', async (t) => {
  setPermissionPrompter(async () => true);
  const grants = [];
  setCaptureGrantObserver((grant) => grants.push(grant));
  t.after(() => { setPermissionPrompter(null); setCaptureGrantObserver(null); });

  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });

  const details = { requestingUrl: 'https://meet.example/room', mediaTypes: ['audio'], isMainFrame: true };
  await request(ses, 'media', details);   // prompt path
  await request(ses, 'media', details);   // stored-allow path (no second prompt)
  assert.equal(grants.length, 2, 'every allowed media request notifies, prompted or remembered');
  assert.deepEqual(grants[1].mediaTypes, ['audio']);
  assert.equal(grants[1].requestingUrl, 'https://meet.example/room');
  assert.equal(grants[1].isMainFrame, true);
  assert.equal(grants[1].requestingWebContents.id, 7);
});

test('denials and non-media permissions never notify', async (t) => {
  setPermissionPrompter(async () => false);
  const grants = [];
  setCaptureGrantObserver((grant) => grants.push(grant));
  t.after(() => { setPermissionPrompter(null); setCaptureGrantObserver(null); });

  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });
  await request(ses, 'media', { requestingUrl: 'https://a.example/', mediaTypes: ['audio'] });
  await request(ses, 'fullscreen', { requestingUrl: 'https://a.example/' }); // AUTO_ALLOWED
  assert.equal(grants.length, 0);
});
