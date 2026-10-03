'use strict';
const gate = require('../ublock/distribution.json');
if (!gate.cleared || !gate.assessment || !gate.correspondingSource || !gate.noticeReview) {
  console.error('uBlock distribution blocked: complete the concrete GPL boundary/source/notice assessment in docs/ublock-origin-distribution.md.');
  process.exitCode = 1;
}
