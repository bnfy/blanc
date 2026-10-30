import fs from 'node:fs';
import {redact} from './redact.mjs';
export function writeAndSync(file,value,flags) {
  const fd=fs.openSync(file,flags,0o600);
  try {fs.writeFileSync(fd,JSON.stringify(redact(value),null,2)+'\n');fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
}
