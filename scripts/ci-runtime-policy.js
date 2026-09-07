'use strict';
function validateRuntimeRun(run, { repo, workflow, jobs, platform }) {
  if (run?.path !== workflow || run.event !== 'workflow_dispatch' || run.status !== 'completed'
      || !['success', 'failure'].includes(run.conclusion)
      || run.head_repository?.full_name !== repo || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) {
    throw new Error('Runtime input must come from a completed native workflow in the canonical repository.');
  }
  const runner = { linux: 'ubuntu-latest', win32: 'windows-latest' }[platform];
  const matches = jobs?.filter((job) => job.name === `capture-runtime (${runner})`);
  if (!runner || matches?.length !== 1 || matches[0].status !== 'completed'
      || matches[0].conclusion !== 'success' || matches[0].head_sha !== run.head_sha) {
    throw new Error('The selected platform runtime job must succeed at this exact source revision.');
  }
  return run.head_sha;
}
module.exports = { validateRuntimeRun };
