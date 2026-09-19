// Pure parser for Chromium-family Session_* command logs.
//
// Chromium documents this format in components/sessions/core:
// - command_storage_backend.cc / session_command.cc (SNSS framing)
// - session_service_commands.cc (command IDs and payloads)
// - serialized_navigation_entry.cc (navigation pickle order)
//
// No Electron dependency. Full URLs remain in the main process.

const MAX_SESSION_BYTES = 64 * 1024 * 1024;
const MAX_SESSION_CANDIDATES = 500;
const MAX_PICKLE_STRING_BYTES = 2 * 1024 * 1024;
const MAX_URL_CHARS = 16_384;
const MAX_TITLE_CODE_POINTS = 240;

const FILE_VERSION_CLEARTEXT = 3;
const FILE_VERSION_ENCRYPTED = 5;
const INITIAL_STATE_MARKER = 255;

const COMMAND = Object.freeze({
  SET_TAB_WINDOW: 0,
  SET_TAB_INDEX: 2,
  PRUNE_BACK: 5,
  UPDATE_NAVIGATION: 6,
  SET_SELECTED_NAVIGATION: 7,
  SET_SELECTED_TAB: 8,
  SET_WINDOW_TYPE: 9,
  PRUNE_FRONT: 11,
  SET_PINNED: 12,
  TAB_CLOSED: 16,
  WINDOW_CLOSED: 17,
  SET_ACTIVE_WINDOW: 20,
  SET_LAST_ACTIVE_TIME: 21,
  PRUNE_RANGE: 24,
  SET_TAB_GROUP: 25,
  SET_TAB_GROUP_METADATA: 27,
});

function align4(value) {
  return (value + 3) & ~3;
}

function boundedText(value, maxCodePoints) {
  if (typeof value !== 'string') return '';
  return Array.from(value).slice(0, maxCodePoints).join('').trim();
}

class PickleCursor {
  constructor(buffer, { withHeader = false } = {}) {
    if (!Buffer.isBuffer(buffer)) throw new TypeError('pickle-buffer-required');
    this.buffer = buffer;
    this.offset = 0;
    this.valid = true;
    if (withHeader) {
      if (buffer.length < 4 || buffer.readUInt32LE(0) !== buffer.length - 4) {
        this.valid = false;
      } else {
        this.offset = 4;
      }
    }
  }

  take(byteLength) {
    if (!this.valid || !Number.isSafeInteger(byteLength) || byteLength < 0) return null;
    const end = this.offset + byteLength;
    if (end > this.buffer.length) return null;
    const value = this.buffer.subarray(this.offset, end);
    this.offset = align4(end);
    if (this.offset > this.buffer.length) return null;
    return value;
  }

  int32() {
    const bytes = this.take(4);
    return bytes ? bytes.readInt32LE(0) : null;
  }

  uint32() {
    const bytes = this.take(4);
    return bytes ? bytes.readUInt32LE(0) : null;
  }

  int64() {
    const bytes = this.take(8);
    return bytes ? bytes.readBigInt64LE(0) : null;
  }

  uint64() {
    const bytes = this.take(8);
    return bytes ? bytes.readBigUInt64LE(0) : null;
  }

  bool() {
    const bytes = this.take(1);
    return bytes ? bytes[0] !== 0 : null;
  }

  length() {
    const value = this.int32();
    return value !== null && value >= 0 ? value : null;
  }

  string({ maxBytes = MAX_PICKLE_STRING_BYTES } = {}) {
    const byteLength = this.length();
    if (byteLength === null || byteLength > maxBytes) return null;
    const bytes = this.take(byteLength);
    return bytes ? bytes.toString('utf8') : null;
  }

  string16({ maxBytes = MAX_PICKLE_STRING_BYTES } = {}) {
    const codeUnits = this.length();
    if (codeUnits === null) return null;
    const byteLength = codeUnits * 2;
    if (!Number.isSafeInteger(byteLength) || byteLength > maxBytes) return null;
    const bytes = this.take(byteLength);
    return bytes ? bytes.toString('utf16le') : null;
  }
}

function parseCommandFrames(input, { maxBytes = MAX_SESSION_BYTES } = {}) {
  if (!Buffer.isBuffer(input)) return { error: 'invalid-session' };
  if (input.length > maxBytes) return { error: 'session-too-large', count: input.length };
  if (input.length < 8 || input.subarray(0, 4).toString('ascii') !== 'SNSS') {
    return { error: 'invalid-session-header' };
  }
  const version = input.readInt32LE(4);
  if (version === FILE_VERSION_ENCRYPTED) return { error: 'encrypted-session', version };
  if (version !== FILE_VERSION_CLEARTEXT) {
    return { error: 'unsupported-session-version', version };
  }

  const commands = [];
  let offset = 8;
  let markerSeen = false;
  let partialTail = false;
  while (offset < input.length) {
    if (input.length - offset < 2) {
      if (!markerSeen) return { error: 'incomplete-session' };
      partialTail = true;
      break;
    }
    const framedSize = input.readUInt16LE(offset);
    if (framedSize < 1) return { error: 'invalid-session-command' };
    const end = offset + 2 + framedSize;
    if (end > input.length) {
      if (!markerSeen) return { error: 'incomplete-session' };
      partialTail = true;
      break;
    }
    const id = input[offset + 2];
    const payload = input.subarray(offset + 3, end);
    if (id === INITIAL_STATE_MARKER) markerSeen = true;
    else commands.push({ id, payload });
    offset = end;
  }
  if (!markerSeen) return { error: 'missing-session-marker' };
  return { ok: true, version, commands, partialTail };
}

function readInt32At(payload, offset) {
  return Buffer.isBuffer(payload) && offset >= 0 && offset + 4 <= payload.length
    ? payload.readInt32LE(offset)
    : null;
}

function readBigUInt64At(payload, offset) {
  return Buffer.isBuffer(payload) && offset >= 0 && offset + 8 <= payload.length
    ? payload.readBigUInt64LE(offset)
    : null;
}

function tokenKey(high, low) {
  if (high === null || low === null || (high === 0n && low === 0n)) return null;
  return `${high.toString(16).padStart(16, '0')}${low.toString(16).padStart(16, '0')}`;
}

function parseNavigationPayload(payload) {
  const cursor = new PickleCursor(payload, { withHeader: true });
  const tabId = cursor.int32();
  const index = cursor.int32();
  const url = cursor.string({ maxBytes: MAX_URL_CHARS * 4 });
  const title = cursor.string16({ maxBytes: MAX_PICKLE_STRING_BYTES });
  const pageStateLength = cursor.length();
  if (tabId === null || index === null || url === null || title === null
    || pageStateLength === null || pageStateLength > MAX_PICKLE_STRING_BYTES
    || cursor.take(pageStateLength) === null || cursor.int32() === null) {
    return null;
  }
  return {
    tabId,
    index,
    url: url.slice(0, MAX_URL_CHARS),
    title: boundedText(title, MAX_TITLE_CODE_POINTS),
  };
}

function parseGroupMetadata(payload) {
  const cursor = new PickleCursor(payload, { withHeader: true });
  const high = cursor.uint64();
  const low = cursor.uint64();
  const title = cursor.string16({ maxBytes: 8_192 });
  const key = tokenKey(high, low);
  if (!key || title === null) return null;
  return { key, title: boundedText(title, 40) };
}

function normalHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function reconstructChromiumSession(commands, {
  maxCandidates = MAX_SESSION_CANDIDATES,
} = {}) {
  if (!Array.isArray(commands)) return { error: 'invalid-session-commands' };
  const tabs = new Map();
  const windows = new Map();
  const discardedWindowIds = new Set();
  const groupNames = new Map();
  let activeWindowId = null;
  let sequence = 0;

  const tabFor = (id) => {
    if (!tabs.has(id)) {
      tabs.set(id, {
        id,
        windowId: null,
        tabVisualIndex: Number.MAX_SAFE_INTEGER,
        currentNavigationIndex: -1,
        navigations: new Map(),
        pinned: false,
        groupToken: null,
        lastActiveAt: 0n,
        firstSeen: sequence++,
      });
    }
    return tabs.get(id);
  };
  const windowFor = (id) => {
    if (!windows.has(id)) {
      windows.set(id, {
        id,
        type: null,
        selectedTabIndex: -1,
        firstSeen: sequence++,
      });
    }
    return windows.get(id);
  };

  const pruneRange = (tab, index, count) => {
    if (!tab || index < 0 || count <= 0) return false;
    if (tab.currentNavigationIndex >= index
      && tab.currentNavigationIndex < index + count) {
      tab.currentNavigationIndex = index - 1;
    } else if (tab.currentNavigationIndex >= index + count) {
      tab.currentNavigationIndex -= count;
    }
    const next = new Map();
    for (const [navIndex, navigation] of tab.navigations) {
      if (navIndex >= index && navIndex < index + count) continue;
      const adjusted = navIndex >= index ? navIndex - count : navIndex;
      next.set(adjusted, { ...navigation, index: adjusted });
    }
    tab.navigations = next;
    return true;
  };

  for (const command of commands) {
    const payload = command?.payload;
    if (!Buffer.isBuffer(payload)) return { error: 'invalid-session-command' };
    switch (command.id) {
      case COMMAND.SET_TAB_WINDOW: {
        const windowId = readInt32At(payload, 0);
        const tabId = readInt32At(payload, 4);
        if (windowId === null || tabId === null) return { error: 'invalid-session-command' };
        windowFor(windowId);
        tabFor(tabId).windowId = windowId;
        break;
      }
      case COMMAND.SET_TAB_INDEX: {
        const tabId = readInt32At(payload, 0);
        const index = readInt32At(payload, 4);
        if (tabId === null || index === null) return { error: 'invalid-session-command' };
        tabFor(tabId).tabVisualIndex = index;
        break;
      }
      case COMMAND.UPDATE_NAVIGATION: {
        const navigation = parseNavigationPayload(payload);
        if (!navigation) return { error: 'invalid-session-command' };
        tabFor(navigation.tabId).navigations.set(navigation.index, navigation);
        break;
      }
      case COMMAND.SET_SELECTED_NAVIGATION: {
        const tabId = readInt32At(payload, 0);
        const index = readInt32At(payload, 4);
        if (tabId === null || index === null) return { error: 'invalid-session-command' };
        tabFor(tabId).currentNavigationIndex = index;
        break;
      }
      case COMMAND.SET_SELECTED_TAB: {
        const windowId = readInt32At(payload, 0);
        const index = readInt32At(payload, 4);
        if (windowId === null || index === null) return { error: 'invalid-session-command' };
        windowFor(windowId).selectedTabIndex = index;
        break;
      }
      case COMMAND.SET_WINDOW_TYPE: {
        const windowId = readInt32At(payload, 0);
        const type = readInt32At(payload, 4);
        if (windowId === null || type === null) return { error: 'invalid-session-command' };
        windowFor(windowId).type = type;
        break;
      }
      case COMMAND.PRUNE_BACK: {
        const tabId = readInt32At(payload, 0);
        const index = readInt32At(payload, 4);
        if (tabId === null || index === null) return { error: 'invalid-session-command' };
        const tab = tabFor(tabId);
        for (const navIndex of [...tab.navigations.keys()]) {
          if (navIndex >= index) tab.navigations.delete(navIndex);
        }
        break;
      }
      case COMMAND.PRUNE_FRONT: {
        const tabId = readInt32At(payload, 0);
        const count = readInt32At(payload, 4);
        if (tabId === null || count === null || count <= 0
          || !pruneRange(tabFor(tabId), 0, count)) {
          return { error: 'invalid-session-command' };
        }
        break;
      }
      case COMMAND.PRUNE_RANGE: {
        const tabId = readInt32At(payload, 0);
        const index = readInt32At(payload, 4);
        const count = readInt32At(payload, 8);
        if (tabId === null || index === null || count === null
          || !pruneRange(tabFor(tabId), index, count)) {
          return { error: 'invalid-session-command' };
        }
        break;
      }
      case COMMAND.SET_PINNED: {
        const tabId = readInt32At(payload, 0);
        if (tabId === null || payload.length < 5) return { error: 'invalid-session-command' };
        tabFor(tabId).pinned = payload[4] !== 0;
        break;
      }
      case COMMAND.TAB_CLOSED: {
        const tabId = readInt32At(payload, 0);
        if (tabId === null) return { error: 'invalid-session-command' };
        tabs.delete(tabId);
        break;
      }
      case COMMAND.WINDOW_CLOSED: {
        const windowId = readInt32At(payload, 0);
        if (windowId === null) return { error: 'invalid-session-command' };
        windows.delete(windowId);
        discardedWindowIds.add(windowId);
        break;
      }
      case COMMAND.SET_ACTIVE_WINDOW: {
        const windowId = readInt32At(payload, 0);
        if (windowId === null) return { error: 'invalid-session-command' };
        activeWindowId = windowId;
        break;
      }
      case COMMAND.SET_LAST_ACTIVE_TIME: {
        // Vendor forks can reuse upstream command IDs for private payloads.
        // Last-active metadata is optional, so an unexpected shape must not
        // make otherwise valid tabs unreadable.
        if (payload.length !== 16) break;
        const tabId = readInt32At(payload, 0);
        const lastActiveAt = payload.readBigInt64LE(8);
        if (tabId === null || lastActiveAt === null) return { error: 'invalid-session-command' };
        tabFor(tabId).lastActiveAt = lastActiveAt;
        break;
      }
      case COMMAND.SET_TAB_GROUP: {
        // Upstream's current token payload is 32 bytes on supported 64-bit
        // builds. Vivaldi has shipped a shorter vendor payload under this ID;
        // ignore that optional metadata instead of rejecting the open tabs.
        if (payload.length < 25) break;
        const tabId = readInt32At(payload, 0);
        const high = readBigUInt64At(payload, 8);
        const low = readBigUInt64At(payload, 16);
        if (tabId === null || high === null || low === null || payload.length < 25) {
          return { error: 'invalid-session-command' };
        }
        tabFor(tabId).groupToken = payload[24] ? tokenKey(high, low) : null;
        break;
      }
      case COMMAND.SET_TAB_GROUP_METADATA: {
        const metadata = parseGroupMetadata(payload);
        if (!metadata) break;
        groupNames.set(metadata.key, metadata.title);
        break;
      }
      default:
        break;
    }
  }

  const orderedWindows = [...windows.values()]
    .filter((window) => !discardedWindowIds.has(window.id) && window.type === 0)
    .sort((a, b) => {
      if (a.id === activeWindowId) return -1;
      if (b.id === activeWindowId) return 1;
      return a.firstSeen - b.firstSeen || a.id - b.id;
    });

  const candidates = [];
  let excludedCount = 0;
  for (let sourceWindow = 0; sourceWindow < orderedWindows.length; sourceWindow += 1) {
    const window = orderedWindows[sourceWindow];
    const windowTabs = [...tabs.values()]
      .filter((tab) => tab.windowId === window.id)
      .sort((a, b) => a.tabVisualIndex - b.tabVisualIndex || a.firstSeen - b.firstSeen);
    for (const tab of windowTabs) {
      const navigation = tab.navigations.get(tab.currentNavigationIndex)
        ?? [...tab.navigations.values()].sort((a, b) => b.index - a.index)[0];
      const url = normalHttpUrl(navigation?.url);
      if (!url) {
        excludedCount += 1;
        continue;
      }
      candidates.push({
        sourceWindowId: String(window.id),
        sourceWindow: sourceWindow + 1,
        sourceTabId: String(tab.id),
        sourceTabOrder: tab.tabVisualIndex,
        url,
        title: navigation.title || url,
        sourceGroupToken: tab.groupToken,
        sourceGroupName: boundedText(groupNames.get(tab.groupToken) ?? '', 40) || null,
        pinned: tab.pinned,
        lastActiveAt: Number(tab.lastActiveAt > BigInt(Number.MAX_SAFE_INTEGER)
          ? BigInt(Number.MAX_SAFE_INTEGER)
          : tab.lastActiveAt),
      });
      if (candidates.length > maxCandidates) {
        return { error: 'too-many-candidates', count: candidates.length };
      }
    }
  }

  if (!candidates.length) return { error: 'empty' };
  return {
    ok: true,
    candidates,
    windowCount: orderedWindows.length,
    excludedCount,
  };
}

function parseChromiumSession(input, options = {}) {
  const framed = parseCommandFrames(input, options);
  if (framed.error) return framed;
  const reconstructed = reconstructChromiumSession(framed.commands, options);
  if (reconstructed.error) return reconstructed;
  return {
    ...reconstructed,
    version: framed.version,
    commandCount: framed.commands.length,
    partialTail: framed.partialTail,
  };
}

module.exports = {
  COMMAND,
  FILE_VERSION_CLEARTEXT,
  FILE_VERSION_ENCRYPTED,
  INITIAL_STATE_MARKER,
  MAX_SESSION_BYTES,
  MAX_SESSION_CANDIDATES,
  PickleCursor,
  parseCommandFrames,
  parseNavigationPayload,
  reconstructChromiumSession,
  parseChromiumSession,
};
