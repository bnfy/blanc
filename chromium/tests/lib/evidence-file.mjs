// An evidence report only this run writes. The file is claimed with 'wx' before
// the run, so earlier evidence is never overwritten, and the claim and every
// later write share one descriptor, so nothing can swap the file in between.
// A claim that was never written is removed on close, so a run that stops
// early can be run again.
import fs from 'node:fs';

export function claimEvidence(file, message = `Refusing to overwrite ${file}`) {
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o644); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(message);
    throw error;
  }
  let written = false;
  return {
    write(text) {
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, text, 0);
      written = true;
    },
    close() {
      fs.closeSync(fd);
      if (!written) fs.rmSync(file, {force: true});
    },
  };
}
