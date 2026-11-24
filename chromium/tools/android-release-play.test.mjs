import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync, verify} from 'node:crypto';

const moduleURL = new URL('../android/release/play-api.mjs', import.meta.url);
async function api() {
  assert.ok(fs.existsSync(moduleURL), 'Play API module exists');
  return import(moduleURL);
}
const origin = 'https://androidpublisher.googleapis.com';
const edits = `${origin}/androidpublisher/v3/applications/me.bnfy.blanc/edits`;
const oauth = 'https://oauth2.googleapis.com/token';
const now = 1794700800123; // Unix milliseconds, including a fractional second.
const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const credential = {
  type: 'service_account', client_email: 'fixture@example.iam.gserviceaccount.com',
  private_key: privateKey.export({type: 'pkcs8', format: 'pem'}), token_uri: oauth,
};
const credentialJSON = JSON.stringify(credential);
function recordingFetch(steps) {
  const calls = [];
  return {calls, fetch: async (url, options = {}) => {
    calls.push({url: String(url), ...options});
    const step = steps.shift();
    assert.ok(step, 'unexpected request');
    if (step instanceof Error) throw step;
    if (step instanceof Response) return step;
    return Response.json(step);
  }};
}
function bundle(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'play-api-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const aabPath = path.join(dir, 'fixture.aab'), bytes = Buffer.from([0x50, 0x4b, 0, 0xff, 1]);
  fs.writeFileSync(aabPath, bytes);
  return {bytes, input: {packageName: 'me.bnfy.blanc', aabPath, versionCode: 7, releaseName: '1.0.0-beta.7', token: 'fixture-access-token', track: 'internal', status: 'draft'}};
}
function completed(editId = 'edit-1') { return [{id: editId}, {versionCode: 7}, {}, {id: editId}]; }
function safeError(error) {
  assert.equal(error instanceof Error, true);
  for (const secret of [credentialJSON, credential.private_key, 'fixture-access-token', 'sensitive-server-body']) {
    assert.equal(String(error).includes(secret), false, 'error must not expose credentials or server diagnostics');
  }
  assert.equal(error.cause, undefined, 'raw errors must not escape in a cause');
  return true;
}

test('accessToken signs an RS256 JWT with millisecond clock converted to seconds', async () => {
  const {accessToken} = await api(), fake = recordingFetch([{access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 3600}]);
  const token = await accessToken(credentialJSON, now, fake.fetch);
  assert.equal(token === 'fixture-access-token', true);
  assert.equal(fake.calls.length, 1);
  const request = fake.calls[0];
  assert.equal(request.url, oauth); assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'error');
  assert.equal(new Headers(request.headers).get('content-type'), 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(request.body);
  assert.deepEqual([...form.keys()].sort(), ['assertion', 'grant_type']);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [header, claims, signature] = form.get('assertion').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {alg: 'RS256', typ: 'JWT'});
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), {iss: credential.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: oauth, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600});
  assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url')), true);
  assert.equal(String(request.body).includes(credentialJSON), false);
  assert.equal(String(request.body).includes(credential.private_key), false);
});

test('uploadToTrack inserts, uploads binary media, sets the internal release and commits in order', async t => {
  const {uploadToTrack} = await api(), {input, bytes} = bundle(t), fake = recordingFetch(completed());
  assert.deepEqual(await uploadToTrack(input, fake.fetch), {editId: 'edit-1', versionCode: 7, track: 'internal'});
  assert.deepEqual(fake.calls.map(c => [c.method, c.url]), [
    ['POST', edits], ['POST', `${origin}/upload/androidpublisher/v3/applications/me.bnfy.blanc/edits/edit-1/bundles?uploadType=media`],
    ['PUT', `${edits}/edit-1/tracks/internal`], ['POST', `${edits}/edit-1:commit`],
  ]);
  assert.deepEqual(JSON.parse(fake.calls[0].body), {});
  assert.equal(Buffer.isBuffer(fake.calls[1].body), true, 'binary body owns no open file handles');
  assert.deepEqual(fake.calls[1].body, bytes);
  assert.equal(new Headers(fake.calls[1].headers).get('content-type'), 'application/octet-stream');
  assert.deepEqual(JSON.parse(fake.calls[2].body), {track: 'internal', releases: [{name: input.releaseName, versionCodes: ['7'], status: 'draft'}]});
  for (const call of fake.calls) {
    assert.equal(new Headers(call.headers).get('authorization') === `Bearer ${input.token}`, true);
    assert.equal(call.redirect, 'error');
    assert.equal(call.url.includes(input.token), false);
    assert.equal(String(call.body).includes(credentialJSON), false);
    assert.equal(String(call.body).includes(credential.private_key), false);
  }
});

test('a returned bundle code mismatch deletes the edit before any track update', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t), fake = recordingFetch([{id: 'edit-1'}, {versionCode: 8}, new Response(null, {status: 204})]);
  await assert.rejects(uploadToTrack(input, fake.fetch), /version code/i);
  assert.deepEqual(fake.calls.map(c => c.method), ['POST', 'POST', 'DELETE']);
  assert.equal(fake.calls[2].url, `${edits}/edit-1`);
});

for (const [label, index] of [['insert', 0], ['upload', 1], ['track update', 2], ['commit', 3]]) {
  test(`HTTP failure at ${label} is sanitized and deletes only a known edit`, async t => {
    const {uploadToTrack} = await api(), {input} = bundle(t), steps = completed().slice(0, index);
    steps.push(new Response('sensitive-server-body', {status: 403}), new Response(null, {status: 204}));
    const fake = recordingFetch(steps);
    await assert.rejects(uploadToTrack(input, fake.fetch), safeError);
    assert.equal(fake.calls.length, index + 1 + (index ? 1 : 0));
    if (index) { assert.equal(fake.calls.at(-1).method, 'DELETE'); assert.equal(fake.calls.at(-1).url, `${edits}/edit-1`); }
    assert.equal(fake.calls.filter(c => c.url.endsWith(':commit')).length, index === 3 ? 1 : 0);
  });
}

test('an interrupted upload is cleaned up and a retry opens a new edit', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t);
  const fake = recordingFetch([{id: 'abandoned'}, new Error('sensitive-server-body'), new Response(null, {status: 204}), ...completed('fresh')]);
  await assert.rejects(uploadToTrack(input, fake.fetch), safeError);
  assert.deepEqual(await uploadToTrack(input, fake.fetch), {editId: 'fresh', versionCode: 7, track: 'internal'});
  assert.deepEqual(fake.calls.map(c => c.method), ['POST', 'POST', 'DELETE', 'POST', 'POST', 'PUT', 'POST']);
  assert.equal(fake.calls[2].url, `${edits}/abandoned`);
  assert.equal(fake.calls[3].url, edits);
  assert.equal(fake.calls.at(-1).url, `${edits}/fresh:commit`);
});

test('a successful commit stays successful if discarding its response body fails', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t);
  const response = new Response(new ReadableStream({cancel() { throw new Error('sensitive-server-body'); }}));
  const fake = recordingFetch([...completed().slice(0, 3), response]);
  assert.deepEqual(await uploadToTrack(input, fake.fetch), {editId: 'edit-1', versionCode: 7, track: 'internal'});
  assert.equal(fake.calls.length, 4, 'an acknowledged commit must not trigger deletion');
});

test('cleanup failure preserves the sanitized original upload failure', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t);
  const fake = recordingFetch([{id: 'edit-1'}, {versionCode: 8}, new Error('sensitive-server-body')]);
  await assert.rejects(uploadToTrack(input, fake.fetch), error => { safeError(error); assert.match(error.message, /version code/i); return true; });
  assert.equal(fake.calls.at(-1).method, 'DELETE');
});

test('malformed API JSON is sanitized and an existing edit is deleted', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t);
  const fake = recordingFetch([{id: 'edit-1'}, new Response('sensitive-server-body'), new Response(null, {status: 204})]);
  await assert.rejects(uploadToTrack(input, fake.fetch), safeError);
  assert.equal(fake.calls.at(-1).method, 'DELETE');
});

test('missing edit ID and missing uploaded version code cannot commit', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t);
  for (const steps of [[{}], [{id: 'edit-1'}, {}, new Response(null, {status: 204})]]) {
    const fake = recordingFetch(steps);
    await assert.rejects(uploadToTrack(input, fake.fetch), safeError);
    assert.equal(fake.calls.some(c => c.method === 'PUT' || c.url.endsWith(':commit')), false);
  }
});

test('credential parse, key and endpoint errors are generic and make no requests', async () => {
  const {accessToken} = await api();
  const ec = generateKeyPairSync('ec', {namedCurve: 'prime256v1'}).privateKey.export({type: 'pkcs8', format: 'pem'});
  for (const value of ['sensitive-server-body', 'null', JSON.stringify({...credential, private_key: 'sensitive-server-body'}), JSON.stringify({...credential, private_key: ec}), JSON.stringify({...credential, token_uri: 'https://example.invalid/token'}), JSON.stringify({...credential, client_email: ''})]) {
    const fake = recordingFetch([]);
    await assert.rejects(accessToken(value, now, fake.fetch), safeError);
    assert.equal(fake.calls.length, 0);
  }
});

test('OAuth network, HTTP, malformed JSON and missing token errors never expose diagnostics', async () => {
  const {accessToken} = await api();
  for (const response of [new Error('sensitive-server-body'), new Response('sensitive-server-body', {status: 400}), new Response('sensitive-server-body'), {}, {access_token: ''}]) {
    const fake = recordingFetch([response]);
    await assert.rejects(accessToken(credentialJSON, now, fake.fetch), safeError);
    assert.equal(fake.calls.length, 1);
  }
});

test('invalid clock values are refused before an OAuth request', async () => {
  const {accessToken} = await api();
  for (const clock of [NaN, Infinity, -1, '1794700800123']) {
    const fake = recordingFetch([]);
    await assert.rejects(accessToken(credentialJSON, clock, fake.fetch), safeError);
    assert.equal(fake.calls.length, 0);
  }
});

test('invalid upload input and unreadable bundle are refused before creating an edit', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t);
  for (const invalid of [{packageName: '../escape'}, {versionCode: 0}, {versionCode: '7'}, {releaseName: ''}, {token: ''}, {token: 'bad\nheader'},
    {track: 'qa'}, {track: undefined}, {status: 'halted'}, {status: 'halted', userFraction: 0.5}, {status: 'inProgress'}, {status: 'inProgress', userFraction: 1}, {status: 'inProgress', userFraction: 0}, {status: 'completed', userFraction: 0.5},
    {notes: ''}, {notes: 'x'.repeat(501)}, {notes: 7}, {aabPath: path.join(path.dirname(input.aabPath), 'missing.aab')}]) {
    const fake = recordingFetch([]);
    await assert.rejects(uploadToTrack({...input, ...invalid}, fake.fetch), safeError);
    assert.equal(fake.calls.length, 0);
  }
});

test('a beta goes to the beta track as a completed release with its notes', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t), fake = recordingFetch(completed());
  assert.deepEqual(await uploadToTrack({...input, track: 'beta', status: 'completed', notes: 'New Start Page.'}, fake.fetch), {editId: 'edit-1', versionCode: 7, track: 'beta'});
  assert.equal(fake.calls[2].url, `${edits}/edit-1/tracks/beta`);
  assert.deepEqual(JSON.parse(fake.calls[2].body), {track: 'beta', releases: [{name: '1.0.0-beta.7', versionCodes: ['7'], status: 'completed', releaseNotes: [{language: 'en-US', text: 'New Start Page.'}]}]});
});

test('production at 10% is inProgress with userFraction 0.1, and notes are trimmed', async t => {
  const {uploadToTrack} = await api(), {input} = bundle(t), fake = recordingFetch(completed());
  await uploadToTrack({...input, releaseName: '1.0.0', track: 'production', status: 'inProgress', userFraction: 0.1, notes: '  First stable.\n'}, fake.fetch);
  assert.deepEqual(JSON.parse(fake.calls[2].body).releases, [{name: '1.0.0', versionCodes: ['7'], status: 'inProgress', userFraction: 0.1, releaseNotes: [{language: 'en-US', text: 'First stable.'}]}]);
});

test('updateTrack opens an edit, replaces the track with one release and commits, with no upload', async () => {
  const {updateTrack} = await api(), fake = recordingFetch([{id: 'e2'}, {}, {}]);
  const release = {name: '1.0.0', versionCodes: ['6'], status: 'inProgress', userFraction: 0.5};
  assert.deepEqual(await updateTrack({packageName: 'me.bnfy.blanc', token: 'fixture-access-token', track: 'production', release}, fake.fetch), {editId: 'e2'});
  assert.deepEqual(fake.calls.map(c => [c.method, c.url]), [['POST', edits], ['PUT', `${edits}/e2/tracks/production`], ['POST', `${edits}/e2:commit`]]);
  assert.deepEqual(JSON.parse(fake.calls[1].body), {track: 'production', releases: [release]});
});

test('updateTrack refuses bad input before any request and deletes its edit on failure', async () => {
  const {updateTrack} = await api();
  const good = {packageName: 'me.bnfy.blanc', token: 'fixture-access-token', track: 'beta', release: {name: '1.1.0-beta.1', versionCodes: ['9'], status: 'completed'}};
  for (const bad of [{track: 'qa'}, {release: {...good.release, versionCodes: []}}, {release: {...good.release, versionCodes: ['x']}}, {release: {...good.release, status: 'inProgress'}}, {release: {...good.release, name: ''}}]) {
    const fake = recordingFetch([]);
    await assert.rejects(updateTrack({...good, ...bad}, fake.fetch), safeError);
    assert.equal(fake.calls.length, 0);
  }
  const fake = recordingFetch([{id: 'e3'}, new Response('sensitive-server-body', {status: 500}), new Response(null, {status: 204})]);
  await assert.rejects(updateTrack(good, fake.fetch), safeError);
  assert.deepEqual(fake.calls.at(-1).method, 'DELETE');
});
