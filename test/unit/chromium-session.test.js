const assert = require('node:assert/strict');
const test = require('node:test');

const {
  COMMAND,
  FILE_VERSION_CLEARTEXT,
  FILE_VERSION_ENCRYPTED,
  INITIAL_STATE_MARKER,
  parseCommandFrames,
  parseChromiumSession,
} = require('../../src/main/chromium-session');

function align4(value) {
  return (value + 3) & ~3;
}

function createPickleWriter() {
  let buffer = Buffer.alloc(0);
  const append = (bytes) => {
    const start = buffer.length;
    const end = align4(start + bytes.length);
    const next = Buffer.alloc(end);
    buffer.copy(next);
    bytes.copy(next, start);
    buffer = next;
  };
  return {
    int32(value) {
      const bytes = Buffer.alloc(4);
      bytes.writeInt32LE(value);
      append(bytes);
      return this;
    },
    uint32(value) {
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32LE(value);
      append(bytes);
      return this;
    },
    uint64(value) {
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64LE(BigInt(value));
      append(bytes);
      return this;
    },
    bool(value) {
      append(Buffer.from([value ? 1 : 0]));
      return this;
    },
    string(value) {
      const bytes = Buffer.from(value, 'utf8');
      this.int32(bytes.length);
      append(bytes);
      return this;
    },
    string16(value) {
      const bytes = Buffer.from(value, 'utf16le');
      this.int32(bytes.length / 2);
      append(bytes);
      return this;
    },
    done() {
      const header = Buffer.alloc(4);
      header.writeUInt32LE(buffer.length);
      return Buffer.concat([header, buffer]);
    },
  };
}

function intPayload(...values) {
  const payload = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => payload.writeInt32LE(value, index * 4));
  return payload;
}

function navigationPayload(tabId, index, url, title) {
  return createPickleWriter()
    .int32(tabId)
    .int32(index)
    .string(url)
    .string16(title)
    .string('')
    .int32(1)
    .done();
}

function pinnedPayload(tabId, pinned) {
  const payload = Buffer.alloc(8);
  payload.writeInt32LE(tabId, 0);
  payload[4] = pinned ? 1 : 0;
  return payload;
}

function groupPayload(tabId, high, low, hasGroup = true) {
  const payload = Buffer.alloc(32);
  payload.writeInt32LE(tabId, 0);
  payload.writeBigUInt64LE(BigInt(high), 8);
  payload.writeBigUInt64LE(BigInt(low), 16);
  payload[24] = hasGroup ? 1 : 0;
  return payload;
}

function groupMetadataPayload(high, low, title) {
  return createPickleWriter()
    .uint64(high)
    .uint64(low)
    .string16(title)
    .uint32(0)
    .bool(false)
    .bool(false)
    .done();
}

function frame(id, payload = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(3 + payload.length);
  bytes.writeUInt16LE(payload.length + 1, 0);
  bytes[2] = id;
  payload.copy(bytes, 3);
  return bytes;
}

function session(commands, { version = FILE_VERSION_CLEARTEXT, marker = true } = {}) {
  const header = Buffer.alloc(8);
  header.write('SNSS', 0, 'ascii');
  header.writeInt32LE(version, 4);
  return Buffer.concat([
    header,
    ...commands.map(({ id, payload }) => frame(id, payload)),
    ...(marker ? [frame(INITIAL_STATE_MARKER)] : []),
  ]);
}

function baseTabCommands({ windowId, tabId, index, url, title }) {
  return [
    { id: COMMAND.SET_TAB_WINDOW, payload: intPayload(windowId, tabId) },
    { id: COMMAND.SET_TAB_INDEX, payload: intPayload(tabId, index) },
    { id: COMMAND.UPDATE_NAVIGATION, payload: navigationPayload(tabId, 0, url, title) },
    { id: COMMAND.SET_SELECTED_NAVIGATION, payload: intPayload(tabId, 0) },
  ];
}

test('SNSS framing requires cleartext v3 and a completed initial-state marker', () => {
  assert.deepEqual(
    parseCommandFrames(session([], { version: FILE_VERSION_ENCRYPTED })),
    { error: 'encrypted-session', version: FILE_VERSION_ENCRYPTED },
  );
  assert.equal(parseCommandFrames(session([], { marker: false })).error, 'missing-session-marker');
  assert.equal(parseCommandFrames(Buffer.from('not a session')).error, 'invalid-session-header');

  const partial = Buffer.concat([
    session([{ id: 99, payload: Buffer.from([1, 2, 3]) }]),
    Buffer.from([20, 0, 6, 1]),
  ]);
  const parsed = parseCommandFrames(partial);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.partialTail, true);
  assert.equal(parsed.commands.length, 1);
});

test('reconstructs active-window order, duplicate tabs, pin, and named source groups', () => {
  const commands = [
    { id: COMMAND.SET_WINDOW_TYPE, payload: intPayload(10, 0) },
    { id: COMMAND.SET_WINDOW_TYPE, payload: intPayload(20, 0) },
    ...baseTabCommands({
      windowId: 10,
      tabId: 101,
      index: 0,
      url: 'https://example.com/same',
      title: 'First copy',
    }),
    ...baseTabCommands({
      windowId: 20,
      tabId: 201,
      index: 1,
      url: 'https://example.com/same',
      title: 'Second copy',
    }),
    ...baseTabCommands({
      windowId: 20,
      tabId: 202,
      index: 0,
      url: 'https://docs.example.com/',
      title: 'Docs',
    }),
    { id: COMMAND.SET_PINNED, payload: pinnedPayload(202, true) },
    { id: COMMAND.SET_TAB_GROUP, payload: groupPayload(201, 11n, 22n) },
    { id: COMMAND.SET_TAB_GROUP, payload: groupPayload(202, 11n, 22n) },
    { id: COMMAND.SET_TAB_GROUP_METADATA, payload: groupMetadataPayload(11n, 22n, 'Research') },
    { id: COMMAND.SET_ACTIVE_WINDOW, payload: intPayload(20) },
  ];

  const parsed = parseChromiumSession(session(commands));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.windowCount, 2);
  assert.equal(parsed.candidates.length, 3);
  assert.deepEqual(
    parsed.candidates.map((candidate) => ({
      title: candidate.title,
      sourceWindow: candidate.sourceWindow,
      group: candidate.sourceGroupName,
      pinned: candidate.pinned,
    })),
    [
      { title: 'Docs', sourceWindow: 1, group: 'Research', pinned: true },
      { title: 'Second copy', sourceWindow: 1, group: 'Research', pinned: false },
      { title: 'First copy', sourceWindow: 2, group: null, pinned: false },
    ],
  );
  assert.equal(parsed.candidates[1].url, parsed.candidates[2].url);
});

test('uses current navigation and excludes closed, internal, and non-normal window tabs', () => {
  const commands = [
    { id: COMMAND.SET_WINDOW_TYPE, payload: intPayload(1, 0) },
    { id: COMMAND.SET_WINDOW_TYPE, payload: intPayload(2, 2) },
    ...baseTabCommands({
      windowId: 1,
      tabId: 10,
      index: 0,
      url: 'https://old.example/',
      title: 'Old',
    }),
    { id: COMMAND.UPDATE_NAVIGATION, payload: navigationPayload(10, 1, 'https://current.example/', 'Current') },
    { id: COMMAND.SET_SELECTED_NAVIGATION, payload: intPayload(10, 1) },
    ...baseTabCommands({
      windowId: 1,
      tabId: 11,
      index: 1,
      url: 'chrome://settings/',
      title: 'Settings',
    }),
    ...baseTabCommands({
      windowId: 1,
      tabId: 12,
      index: 2,
      url: 'https://closed.example/',
      title: 'Closed',
    }),
    { id: COMMAND.TAB_CLOSED, payload: Buffer.concat([intPayload(12), Buffer.alloc(12)]) },
    ...baseTabCommands({
      windowId: 2,
      tabId: 20,
      index: 0,
      url: 'https://app.example/',
      title: 'App',
    }),
  ];

  const parsed = parseChromiumSession(session(commands));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.candidates.map(({ url, title }) => ({ url, title })), [
    { url: 'https://current.example/', title: 'Current' },
  ]);
  assert.equal(parsed.excludedCount, 1);
});

test('prune commands prevent stale navigation entries from becoming imported tabs', () => {
  const commands = [
    { id: COMMAND.SET_WINDOW_TYPE, payload: intPayload(1, 0) },
    ...baseTabCommands({
      windowId: 1,
      tabId: 10,
      index: 0,
      url: 'https://one.example/',
      title: 'One',
    }),
    { id: COMMAND.UPDATE_NAVIGATION, payload: navigationPayload(10, 1, 'https://two.example/', 'Two') },
    { id: COMMAND.UPDATE_NAVIGATION, payload: navigationPayload(10, 2, 'https://three.example/', 'Three') },
    { id: COMMAND.SET_SELECTED_NAVIGATION, payload: intPayload(10, 2) },
    { id: COMMAND.PRUNE_RANGE, payload: intPayload(10, 1, 1) },
  ];
  const parsed = parseChromiumSession(session(commands));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.candidates[0].url, 'https://three.example/');
});

test('candidate cap and malformed known commands fail closed', () => {
  const commands = [
    { id: COMMAND.SET_WINDOW_TYPE, payload: intPayload(1, 0) },
    ...baseTabCommands({
      windowId: 1,
      tabId: 10,
      index: 0,
      url: 'https://one.example/',
      title: 'One',
    }),
    ...baseTabCommands({
      windowId: 1,
      tabId: 11,
      index: 1,
      url: 'https://two.example/',
      title: 'Two',
    }),
  ];
  assert.deepEqual(
    parseChromiumSession(session(commands), { maxCandidates: 1 }),
    { error: 'too-many-candidates', count: 2 },
  );

  const malformed = session([
    { id: COMMAND.SET_WINDOW_TYPE, payload: Buffer.from([1]) },
  ]);
  assert.equal(parseChromiumSession(malformed).error, 'invalid-session-command');
});
