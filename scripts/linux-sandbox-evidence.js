'use strict';

function parseBlancProcess(line) {
  const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)(.*)$/);
  if (!match || !match[3].endsWith('/blanc')) return null;
  return { pid: Number(match[1]), type: match[4].match(/ --type=(\S+)/)?.[1] ?? 'browser' };
}

module.exports = { parseBlancProcess };
