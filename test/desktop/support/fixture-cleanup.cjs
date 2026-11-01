'use strict';

// Save the measured result before teardown; a locked fixture must never erase
// the original failure. Run every cleanup step even when an earlier one fails.
async function finishFixture(report, steps, persist) {
  const measuredPassed = report.passed === true;
  report.measurementsPassed = measuredPassed;
  report.passed = false;
  report.cleanupErrors = [];
  const record = (stage, error) => {
    report.cleanupErrors.push({stage, code: String(error.code || error.name || 'Error').slice(0, 80)});
    report.passed = false;
  };
  try { await persist(); } catch (error) { record('initial-evidence', error); }
  for (const [stage, action] of steps) {
    try { await action(); } catch (error) { record(stage, error); }
  }
  report.cleanupComplete = report.cleanupErrors.length === 0;
  report.passed = measuredPassed && report.cleanupComplete;
  await persist();
}

module.exports = {finishFixture};
