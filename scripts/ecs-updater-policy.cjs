'use strict';

// Candidate entrypoint only. Never infer production mode from absent/invalid
// staging configuration; even an explicitly requested production channel is
// disabled. The ordinary updater retains its existing URL validation.
function applyCandidateUpdaterPolicy({ metadata, env, resolveUpdaterPolicy }) {
  if (metadata.blancEcsFullCandidate !== true) throw Error('Candidate identity required');
  if (metadata.blancEcsStagingUpdater === true && env.BLANC_UPDATE_CHANNEL === 'staging') {
    const policy = resolveUpdaterPolicy({ isPackaged: true, env });
    if (policy.enabled && policy.mode === 'staging') return 'staging';
  }
  env.BLANC_UPDATE_CHANNEL = 'ecs-candidate-disabled';
  return 'disabled';
}
module.exports = { applyCandidateUpdaterPolicy };
