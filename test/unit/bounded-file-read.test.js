const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readBoundedUtf8 } = require('../../src/main/bounded-file-read');

test('bounded reader handles empty, exact-limit, oversized and multi-byte files', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-bounded-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'input');
  for (const text of ['', 'abcd', 'éé']) {
    await fs.writeFile(file, text);
    assert.equal(await readBoundedUtf8(file, 4), text);
  }
  await fs.writeFile(file, 'abcde');
  await assert.rejects(readBoundedUtf8(file, 4), { code: 'EFBIG' });
  await assert.rejects(readBoundedUtf8(file, 0), RangeError);
});

test('growth after stat cannot exceed the byte budget and always closes the handle', async () => {
  let closed = false;
  let readBytes = 0;
  const provider = { async open() { return {
    async stat() { return { size: 1, isFile: () => true }; },
    async read(buffer, offset, length) {
      // Simulate a file that grows forever after the initial size observation.
      buffer.fill(65);
      readBytes += length;
      return { bytesRead: length };
    },
    async close() { closed = true; },
  }; } };
  await assert.rejects(readBoundedUtf8('unused', 70000, provider), { code: 'EFBIG' });
  assert.equal(readBytes, 70001);
  assert.equal(closed, true);
});

test('reader uses the open handle even if the path changes, handles short reads, and closes on failure', async () => {
  let closes = 0;
  const provider = { async open() { return {
    async stat() { return { size: 3, isFile: () => true }; },
    async read(buffer, offset, length, position) {
      if (position >= 3) return { bytesRead: 0 };
      buffer[offset] = 'abc'.charCodeAt(position);
      return { bytesRead: 1 };
    },
    async close() { closes++; },
  }; }, stat() { throw Error('Path stat must not be used'); }, readFile() { throw Error('Path read must not be used'); } };
  assert.equal(await readBoundedUtf8('replaced-path', 3, provider), 'abc');
  assert.equal(closes, 1);
  const failing = { async open() { return {
    async stat() { throw Error('stat failed'); },
    async close() { closes++; },
  }; } };
  await assert.rejects(readBoundedUtf8('unused', 3, failing), /stat failed/);
  assert.equal(closes, 2);
});
