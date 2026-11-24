// The suite verdict of a night, with no imports and no I/O, so any night (the
// Mac's nightly.mjs, the Windows desktop-nightly-rules.mjs) can load it.
function check(condition, message) { if (!condition) throw new Error(message); }

// A night passes when every case passed, or failed only on the known list, after
// one rerun of anything else (pointer and window cases fail when the Mac is used).
export function judgeSuite(baseline, known, rerun = null) {
  check(!baseline.incomplete && !baseline.developmentSubset, 'the suite run is incomplete');
  const cases = baseline.scenarios.flatMap(s => s.cases);
  const knownIds = new Map(known.cases.map(k => [k.id, k]));
  const rerunPass = new Set(rerun ? rerun.scenarios.flatMap(s => s.cases).filter(c => c.result === 'pass').map(c => c.id) : []);
  const bad = cases.filter(c => c.result === 'fail' || c.result === 'undefined');
  const unknown = bad.filter(c => !(knownIds.has(c.id) && knownIds.get(c.id).results.includes(c.result)) && !rerunPass.has(c.id));
  return {
    status: unknown.length ? 'fail' : 'pass',
    pass: cases.filter(c => c.result === 'pass').length + bad.filter(c => rerunPass.has(c.id)).length,
    known: bad.filter(c => knownIds.has(c.id)).map(c => ({ id: c.id, result: c.result, reason: knownIds.get(c.id).reason })),
    passedOnRerun: bad.filter(c => rerunPass.has(c.id)).map(c => c.id),
    unknown: unknown.map(c => ({ id: c.id, result: c.result })),
    rerunCandidates: bad.filter(c => !(knownIds.has(c.id) && knownIds.get(c.id).results.includes(c.result))).map(c => c.id),
  };
}
