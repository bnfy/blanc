import path from 'node:path';
// fsync the new evidence directory entry and each ancestor through stop's parent.
export function syncLineage(fs, directory, stop) {
  let current=path.resolve(directory);stop=path.resolve(stop);
  if(current!==stop&&!current.startsWith(stop+path.sep))throw Error('evidence outside expected root');
  for(;;){const fd=fs.openSync(current,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)};if(current===stop)break;current=path.dirname(current)}
  const fd=fs.openSync(path.dirname(stop),'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
