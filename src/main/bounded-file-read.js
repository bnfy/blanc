const fs = require('node:fs');

function fileError(code) {
  return Object.assign(new Error(code), { code });
}

// Size checks and reads share one handle, and the byte limit is enforced while
// reading so growth after stat cannot bypass the import memory bound.
async function readBoundedUtf8(filePath, maxBytes, fsPromises = fs.promises) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid byte limit');
  const handle = await fsPromises.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw fileError('ENOTFILE');
    if (stat.size > maxBytes) throw fileError('EFBIG');
    let total = 0;
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    while (true) {
      const length = Math.min(64 * 1024, maxBytes - total + 1);
      const { bytesRead } = await handle.read(buffer, total, length, total);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw fileError('EFBIG');
    }
    return buffer.subarray(0, total).toString('utf8');
  } finally {
    await handle.close();
  }
}

module.exports = { readBoundedUtf8 };
