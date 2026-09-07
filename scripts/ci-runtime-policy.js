'use strict';
function validateRuntimeRun(run, { repo, workflow }) {
  if (run?.path !== workflow || run.event !== 'workflow_dispatch' || run.conclusion !== 'success'
      || run.head_repository?.full_name !== repo || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) {
    throw new Error('Runtime input must come from a successful native workflow in the canonical repository.');
  }
  return run.head_sha;
}
module.exports = { validateRuntimeRun };
