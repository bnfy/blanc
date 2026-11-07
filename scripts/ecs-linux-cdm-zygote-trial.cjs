'use strict';
// Diagnostic only: the exact ECS 45.2.1+wvcus Linux x64 binary returns a null
// zygote for kCdm (4). Restore Chromium's generic-zygote choice for that type.
// Never apply this to a shipped installation or an unrecognized runtime.
const { createHash } = require('node:crypto');
const ORIGINAL_SHA256 = '83b1440e7627de8d3c3e5064029346249b6691b3c05fe9866ae0414d5cc45d68';
const OFFSET = 0x87c6d62;
const INSTRUCTION = Buffer.from('b9b00000000fa3c1731831c0eb04', 'hex');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function restoreCdmMask(instruction) {
  if (!Buffer.isBuffer(instruction) || !instruction.equals(INSTRUCTION)) throw Error('Unrecognized CDM zygote instruction');
  const result = Buffer.from(instruction);
  result[1] = 0xa0; // Clear only bit 4; network/no-sandbox exclusions stay intact.
  return result;
}
function patchVerifiedRuntime(bytes) {
  if (!Buffer.isBuffer(bytes) || hash(bytes) !== ORIGINAL_SHA256) throw Error('CDM zygote trial requires the exact pinned vendor binary');
  const result = Buffer.from(bytes);
  restoreCdmMask(bytes.subarray(OFFSET, OFFSET + INSTRUCTION.length)).copy(result, OFFSET);
  return { bytes: result, receipt: { experimental: true, platform: 'linux-x64', runtime: '45.2.1+wvcus',
    originalSha256: ORIGINAL_SHA256, patchedSha256: hash(result), offset: OFFSET,
    before: INSTRUCTION.toString('hex'), after: result.subarray(OFFSET, OFFSET + INSTRUCTION.length).toString('hex'),
    change: 'Restore generic zygote for kCdm only; not a production-qualified runtime' } };
}
module.exports = { patchVerifiedRuntime, restoreCdmMask };
