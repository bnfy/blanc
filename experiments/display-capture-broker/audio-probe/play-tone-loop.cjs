'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const player = process.argv[2];
const tonePath = process.argv[3];
if (!new Set(['afplay', 'aplay']).has(player) || !path.isAbsolute(tonePath || '')) {
  process.exit(2);
}

let active = null;
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  if (active && !active.killed) active.kill('SIGTERM');
  else process.exit(0);
}

function play() {
  active = spawn(player, [tonePath], { stdio: 'ignore' });
  active.once('error', () => process.exit(1));
  active.once('exit', (code) => {
    if (stopping) process.exit(0);
    if (code !== 0) process.exit(code || 1);
    play();
  });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
play();
