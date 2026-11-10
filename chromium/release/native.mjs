// Local macOS inspections only. Importing this module performs no operations.
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { check, fingerprint } from './policy.mjs';
export function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  // Never include arguments, stdout, stderr, environment or exception text in errors.
  check(result.status === 0 && !result.error, `local inspection failed: ${command}`);
  return result.stdout;
}
export function plist(data) {
  // Python plistlib preserves dates and data; plutil JSON cannot represent data.
  return JSON.parse(run('python3', ['-c', `import sys,plistlib,json,datetime,base64
print(json.dumps(plistlib.loads(sys.stdin.buffer.read()),default=lambda x:base64.b64encode(x).decode() if isinstance(x,bytes) else x.isoformat()+'Z'))`], data));
}
export function profileAt(file) {
  const data = plist(run('/usr/bin/security', ['cms', '-D', '-i', file]));
  const certificates = (data.DeveloperCertificates || []).map(value => {
    const bytes = Buffer.from(value, 'base64'), cert = new X509Certificate(bytes);
    return { fingerprint: fingerprint(bytes), validFrom: cert.validFrom, validTo: cert.validTo, subject: cert.subject };
  });
  return { data, certificates };
}
// The DER slot, not just codesign's legacy XML display, is enforced by AMFI.
// Strictly decode the openssl listing's dictionary entries (same depth as stable's verifier).
// Unknown structures fail closed; qualification must confirm this on a real signed app.
export function derEntitlements(listing) {
  if (!listing.trim()) return {};
  const lines = listing.split(/\r?\n/).filter(Boolean), result = {};
  const depth = l => Number(l.match(/\bd=(\d+)\b/)?.[1] ?? -1);
  for (let i = 0; i < lines.length; i++) {
    if (depth(lines[i]) !== 3) continue;
    const key = lines[i].match(/prim: UTF8STRING\s+:(.*)$/)?.[1];
    check(key && !Object.hasOwn(result, key), 'unrecognized or duplicate DER key');
    const value = lines[++i] || '';
    check(depth(value) === 3, 'invalid DER value');
    if (/prim: BOOLEAN\s+:255\s*$/.test(value)) result[key] = true;
    else if (/prim: BOOLEAN\s+:0\s*$/.test(value)) result[key] = false;
    else if (/prim: UTF8STRING\s+:/.test(value)) result[key] = value.match(/prim: UTF8STRING\s+:(.*)$/)[1];
    else if (/cons: (?:SEQUENCE|SET)\s*$/.test(value)) {
      result[key] = [];
      while (i + 1 < lines.length && depth(lines[i + 1]) > 3) {
        const entry = lines[++i].match(/prim: UTF8STRING\s+:(.*)$/)?.[1];
        check(entry !== undefined, 'unsupported DER array'); result[key].push(entry);
      }
    } else throw new Error('unsupported DER value');
  }
  check(Object.keys(result).length > 0 || !/UTF8STRING/.test(listing), 'unparsed DER entitlements');
  return result;
}
export function readPlist(file) { return plist(readFileSync(file)); }
