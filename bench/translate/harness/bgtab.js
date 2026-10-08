'use strict';
// CPU work runs in a worker (measures process scheduling); the main-thread
// interval measures timer scheduling. Both are reported once per second.
const worker = new Worker('bgtab.worker.js');
let ops = 0;
worker.onmessage = ({ data }) => { ops += data; };
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  window.probe.report('rate', { ops, intervalMs: now - last });
  ops = 0;
  last = now;
}, 1000);
