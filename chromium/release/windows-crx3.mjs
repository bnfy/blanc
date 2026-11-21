// CRX3 packages for Blanc's Windows updates (W3 Task D1), in the format
// components/crx_file/crx3.proto and crx_verifier.cc define:
//   "Cr24" | u32 3 | u32 header length | CrxFileHeader | ZIP archive
// with one sha256_with_rsa proof by Blanc's publisher key over
//   "CRX3 SignedData\0" | u32 length | SignedData{crx_id} | archive
// and crx_id = the first 16 bytes of SHA-256 of that key. The private key
// never comes here: `sign` is the owner's signing step.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const varint = n => { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; out.push(b); } while (n); return Buffer.from(out); };
const field = (number, bytes) => Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
const SIGNED_DATA_PREFIX = Buffer.from('CRX3 SignedData\x00', 'latin1');

function fields(buf) {
  const out = [];
  for (let i = 0; i < buf.length;) {
    let tag = 0, mul = 1, b;
    do { b = buf[i++]; tag += (b & 127) * mul; mul *= 128; } while (b & 128);
    if ((tag & 7) !== 2) throw new Error('unexpected protobuf wire type');
    let len = 0; mul = 1;
    do { b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
    out.push({number: Math.floor(tag / 8), bytes: buf.subarray(i, i + len)}); i += len;
  }
  return out;
}

// A ZIP with every file stored (no compression), fixed timestamps.
export function storedZip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const {name, bytes} of files) {
    const n = Buffer.from(name, 'utf8'), crc = zlib.crc32(bytes);
    const common = Buffer.concat([u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(bytes.length), u32(bytes.length), u16(n.length), u16(0)]);
    const local = Buffer.concat([u32(0x04034b50), common, n, bytes]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset), n]));
    locals.push(local); offset += local.length;
  }
  const central = Buffer.concat(centrals);
  return Buffer.concat([...locals, central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]);
}
export function unzipStored(zip) {
  const files = [];
  for (let i = 0; zip.readUInt32LE(i) === 0x04034b50;) {
    const size = zip.readUInt32LE(i + 18), nameLen = zip.readUInt16LE(i + 26), extra = zip.readUInt16LE(i + 28);
    const start = i + 30 + nameLen + extra;
    files.push({name: zip.subarray(i + 30, i + 30 + nameLen).toString('utf8'), bytes: zip.subarray(start, start + size)});
    i = start + size;
  }
  return files;
}

export async function makeCrx3({files, publicKeyDer, sign}) {
  const archive = storedZip(files);
  const crxId = crypto.createHash('sha256').update(publicKeyDer).digest().subarray(0, 16);
  const signedHeaderData = field(1, crxId);
  const signature = Buffer.from(await sign(Buffer.concat([SIGNED_DATA_PREFIX, u32(signedHeaderData.length), signedHeaderData, archive])));
  const header = Buffer.concat([field(2, Buffer.concat([field(1, publicKeyDer), field(2, signature)])), field(10000, signedHeaderData)]);
  return Buffer.concat([Buffer.from('Cr24', 'latin1'), u32(3), u32(header.length), header, archive]);
}

export function readCrx3(crx) {
  if (crx.subarray(0, 4).toString('latin1') !== 'Cr24' || crx.readUInt32LE(4) !== 3) throw new Error('not a CRX3 file');
  const headerLength = crx.readUInt32LE(8), header = crx.subarray(12, 12 + headerLength), archive = crx.subarray(12 + headerLength);
  const proofs = [];
  let signedHeaderData = null;
  for (const f of fields(header)) {
    if (f.number === 2) { const p = Object.fromEntries(fields(f.bytes).map(x => [x.number, x.bytes])); proofs.push({publicKey: p[1], signature: p[2]}); }
    if (f.number === 10000) signedHeaderData = f.bytes;
  }
  const crxId = signedHeaderData ? fields(signedHeaderData).find(f => f.number === 1)?.bytes : undefined;
  return {proofs, signedHeaderData, crxId, archive};
}

// The verifier's rules for CRX3 with a required key hash (crx_verifier.cc).
export function verifyCrx3(crx, requiredKeyHash) {
  let parsed;
  try { parsed = readCrx3(crx); } catch (e) { return {ok: false, reason: e.message}; }
  const {proofs, signedHeaderData, crxId, archive} = parsed;
  if (!signedHeaderData || !crxId || crxId.length !== 16) return {ok: false, reason: 'no crx id'};
  const message = Buffer.concat([SIGNED_DATA_PREFIX, u32(signedHeaderData.length), signedHeaderData, archive]);
  const verified = [];
  for (const {publicKey, signature} of proofs) {
    let key;
    try { key = crypto.createPublicKey({key: publicKey, format: 'der', type: 'spki'}); } catch { return {ok: false, reason: 'bad key'}; }
    if (!crypto.verify('sha256', message, key, signature)) return {ok: false, reason: 'bad signature'};
    verified.push(crypto.createHash('sha256').update(publicKey).digest());
  }
  if (!verified.some(h => h.subarray(0, 16).equals(crxId))) return {ok: false, reason: 'no proof for the crx id'};
  if (!verified.some(h => h.equals(requiredKeyHash))) return {ok: false, reason: 'required key missing'};
  return {ok: true};
}
