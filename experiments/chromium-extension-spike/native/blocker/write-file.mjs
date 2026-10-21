import fs from 'node:fs';
import path from 'node:path';
// Preserve unchanged mtimes (and the warm build). Read through one descriptor,
// reject symlinks, then publish changed bytes with a same-directory rename.
export function writeIfChanged(file, data) {
  const bytes = Buffer.from(data);
  let descriptor, mode = 0o644;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error('Expected a regular file');
    mode = stat.mode & 0o777;
    if (fs.readFileSync(descriptor).equals(bytes)) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  const parent = path.dirname(file);
  fs.mkdirSync(parent, {recursive:true});
  const temporary = fs.mkdtempSync(path.join(parent, '.blanc-write-'));
  try {
    const staged = path.join(temporary, 'content');
    fs.writeFileSync(staged, bytes, {flag:'wx', mode});
    fs.renameSync(staged, file);
    return true;
  } finally {
    fs.rmSync(temporary, {recursive:true, force:true});
  }
}
