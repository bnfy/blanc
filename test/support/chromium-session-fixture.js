const {
  COMMAND,
  FILE_VERSION_CLEARTEXT,
  INITIAL_STATE_MARKER,
} = require('../../src/main/chromium-session');

const align4 = (value) => (value + 3) & ~3;

function pickleWriter() {
  let buffer = Buffer.alloc(0);
  const append = (bytes) => {
    const start = buffer.length;
    const next = Buffer.alloc(align4(start + bytes.length));
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
      const bytes = Buffer.from(String(value), 'utf8');
      this.int32(bytes.length);
      append(bytes);
      return this;
    },
    string16(value) {
      const bytes = Buffer.from(String(value), 'utf16le');
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

function ints(...values) {
  const payload = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => payload.writeInt32LE(value, index * 4));
  return payload;
}

function navigation(tabId, url, title) {
  return pickleWriter()
    .int32(tabId)
    .int32(0)
    .string(url)
    .string16(title)
    .string('')
    .int32(1)
    .done();
}

function pinned(tabId, value) {
  const payload = Buffer.alloc(8);
  payload.writeInt32LE(tabId, 0);
  payload[4] = value ? 1 : 0;
  return payload;
}

function group(tabId, high, low) {
  const payload = Buffer.alloc(32);
  payload.writeInt32LE(tabId, 0);
  payload.writeBigUInt64LE(BigInt(high), 8);
  payload.writeBigUInt64LE(BigInt(low), 16);
  payload[24] = 1;
  return payload;
}

function groupMetadata(high, low, title) {
  return pickleWriter()
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

function createChromiumSession({ windows = [], activeWindowId = null } = {}) {
  const commands = [];
  const groupTokens = new Map();
  let nextGroup = 1;
  for (const window of windows) {
    commands.push({ id: COMMAND.SET_WINDOW_TYPE, payload: ints(window.id, window.type ?? 0) });
    for (const [position, tab] of (window.tabs ?? []).entries()) {
      const index = Number.isInteger(tab.index) ? tab.index : position;
      commands.push(
        { id: COMMAND.SET_TAB_WINDOW, payload: ints(window.id, tab.id) },
        { id: COMMAND.SET_TAB_INDEX, payload: ints(tab.id, index) },
        { id: COMMAND.UPDATE_NAVIGATION, payload: navigation(tab.id, tab.url, tab.title ?? tab.url) },
        { id: COMMAND.SET_SELECTED_NAVIGATION, payload: ints(tab.id, 0) },
      );
      if (tab.pinned) commands.push({ id: COMMAND.SET_PINNED, payload: pinned(tab.id, true) });
      if (tab.groupName) {
        if (!groupTokens.has(tab.groupName)) {
          groupTokens.set(tab.groupName, { high: nextGroup, low: nextGroup + 100 });
          nextGroup += 1;
        }
        const token = groupTokens.get(tab.groupName);
        commands.push({ id: COMMAND.SET_TAB_GROUP, payload: group(tab.id, token.high, token.low) });
      }
    }
  }
  for (const [name, token] of groupTokens) {
    commands.push({
      id: COMMAND.SET_TAB_GROUP_METADATA,
      payload: groupMetadata(token.high, token.low, name),
    });
  }
  if (activeWindowId !== null) {
    commands.push({ id: COMMAND.SET_ACTIVE_WINDOW, payload: ints(activeWindowId) });
  }
  const header = Buffer.alloc(8);
  header.write('SNSS', 0, 'ascii');
  header.writeInt32LE(FILE_VERSION_CLEARTEXT, 4);
  return Buffer.concat([
    header,
    ...commands.map((command) => frame(command.id, command.payload)),
    frame(INITIAL_STATE_MARKER),
  ]);
}

module.exports = { createChromiumSession };
