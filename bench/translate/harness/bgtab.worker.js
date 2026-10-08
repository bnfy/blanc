'use strict';
// Fixed-size work units; the count completed per second tracks how much CPU
// the background tab's renderer process is given.
function unit() {
  let x = 0;
  for (let i = 0; i < 200000; i++) x = (x + i * 7) % 1000003;
  return x;
}
let done = 0;
let lastPost = performance.now();
for (;;) {
  unit();
  done++;
  const now = performance.now();
  if (now - lastPost >= 250) {
    self.postMessage(done);
    done = 0;
    lastPost = now;
  }
}
