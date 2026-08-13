const assert = require('node:assert/strict');
const test = require('node:test');
const { setupPermissionPolicy, setPermissionPrompter } = require('../../src/main/permissions');

// Electron's boolean permission-CHECK API cannot express 'prompt'. Mapping
// the undecided state to denied breaks preflighting sites: they read
// navigator.permissions.query({name:'microphone'}) === 'denied', show their
// own "mic is blocked" help UI, and never call getUserMedia — so Blanc's
// real prompt never gets a chance to run. Undecided MEDIA must therefore
// read as grantable; the actual gate stays the REQUEST handler.
function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}
const request = (session, permission, details) =>
  new Promise((resolve) => session.request(null, permission, resolve, details));

test('undecided media reads grantable so preflighting sites proceed to getUserMedia', () => {
  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });
  assert.equal(ses.check(null, 'media', 'https://novo.example', { mediaType: 'audio' }), true);
  assert.equal(ses.check(null, 'media', 'https://novo.example', { mediaType: 'video' }), true);
});

test('a stored deny still reads denied; a stored allow reads granted', async (t) => {
  setPermissionPrompter(async ({ mediaTypes }) => mediaTypes.includes('audio'));
  t.after(() => setPermissionPrompter(null));
  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });
  await request(ses, 'media', { requestingUrl: 'https://a.example/', mediaTypes: ['audio'] });
  await request(ses, 'media', { requestingUrl: 'https://a.example/', mediaTypes: ['video'] });
  assert.equal(ses.check(null, 'media', 'https://a.example', { mediaType: 'audio' }), true);
  assert.equal(ses.check(null, 'media', 'https://a.example', { mediaType: 'video' }), false,
    'the remembered Block must keep reading as denied');
});

test('undecided geolocation and notifications stay strict (false)', () => {
  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });
  assert.equal(ses.check(null, 'geolocation', 'https://a.example', {}), false);
  assert.equal(ses.check(null, 'notifications', 'https://a.example', {}), false,
    'Notification.permission === granted would let sites notify with no prompt ever');
});

test('opaque origins still read denied for media', () => {
  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });
  assert.equal(ses.check(null, 'media', 'file:///tmp/x.html', { mediaType: 'audio' }), false);
});
