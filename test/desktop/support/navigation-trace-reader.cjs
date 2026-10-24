'use strict';
// Reads a navigation trace (src/main/navigation-trace.js) and decides whether
// it is complete evidence: start and end markers present, sequence unbroken,
// no malformed line, the end marker's written count equals the event lines
// present, no failed write, no cap reached, and nothing retained was dropped.
const RETAINED = 200;
function readNavigationTrace(text, { retained = RETAINED } = {}) {
  if (text === null || text === undefined) return { active: false, complete: false };
  let malformedLines = 0;
  const lines = String(text).split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { malformedLines += 1; return []; }
  });
  const start = lines[0]?.event === 'trace-start' ? lines[0] : null;
  const end = lines.at(-1)?.event === 'trace-end' ? lines.at(-1) : null;
  const sequenceUnbroken = lines.every((line, index) => line.seq === index);
  const capReached = lines.some(line => line.event === 'trace-truncated');
  const events = lines.filter(line => !/^trace-(start|end|truncated)$/.test(line.event));
  const countsReconcile = !!end && end.written === events.length;
  const writesFailed = !end || end.failed !== 0;
  const retainedTruncated = events.length > retained;
  return {
    active: !!start,
    complete: !!start && !!end && sequenceUnbroken && malformedLines === 0 && countsReconcile && !writesFailed && !capReached && !retainedTruncated,
    ended: !!end, sequenceUnbroken, malformedLines, countsReconcile, writesFailed, capReached, retainedTruncated,
    totalEvents: events.length, events: events.slice(0, retained),
  };
}
module.exports = { readNavigationTrace, RETAINED };
