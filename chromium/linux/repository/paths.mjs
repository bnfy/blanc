const version = '(\\d+\\.\\d+\\.\\d+\\.\\d+)';
const deb = new RegExp('^deb/pool/main/b/(blanc(?:-beta)?)/\\1_' + version + '-1_(amd64|arm64)\\.deb$');
const rpm = new RegExp('^rpm/stable/(x86_64|aarch64)/(blanc(?:-beta)?)-' + version + '-1\\.\\1\\.rpm$');
export const poolCache = 'public, max-age=31536000, immutable';

export function packageInfo(key) {
  let match = deb.exec(key);
  if (match) return {group: 'deb/' + match[1] + '/' + match[3], version: match[2]};
  match = rpm.exec(key);
  if (match) return {group: 'rpm/' + match[2] + '/' + match[1], version: match[3]};
}

// dep11/ holds the AppStream catalog App Center matches updates to apps with.
const aptMetadata = /^deb\/dists\/stable\/(?:InRelease|Release(?:\.gpg)?|main\/binary-(?:amd64|arm64)\/(?:Packages(?:\.gz)?|by-hash\/SHA256\/[a-f0-9]{64})|main\/dep11\/(?:Components-(?:amd64|arm64)\.yml\.gz|by-hash\/SHA256\/[a-f0-9]{64}))$/;
const rpmMetadata = /^rpm\/stable\/(?:x86_64|aarch64)\/repodata\/(?:repomd\.xml(?:\.asc)?|[a-f0-9]{64}-(?:primary|filelists|other)\.xml\.gz)$/;

export function isMetadataPath(key) {
  return key === 'blanc-repository.asc' || aptMetadata.test(key) || rpmMetadata.test(key);
}
