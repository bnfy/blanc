'use strict';
const gate = require('../ublock/distribution.json');
const matrix = require('../src/main/ublock-platforms.json');
const cleared = gate.cleared && gate.assessment && gate.correspondingSource && gate.noticeReview;
if (!cleared && Object.values(matrix.platforms).some(platform => platform.enabled)) {
  console.error('uBlock distribution blocked: enabled platforms require GPL boundary/source/notice clearance.');
  process.exitCode = 1;
} else if (!cleared) {
  console.log('uBlock distribution uncleared: ordinary Blanc builds exclude its payload; platform selection stays disabled.');
}
