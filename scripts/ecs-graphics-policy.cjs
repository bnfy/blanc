'use strict';

// Candidate-only workaround. Do not import into the production entrypoint.
function applyCandidateGraphicsPolicy({ app, metadata, platform = process.platform }) {
  if (metadata?.blancEcsFullCandidate !== true) throw Error('ECS graphics policy requires candidate identity');
  const configured = metadata.blancEcsGraphicsPolicy === 'copy-video-frames';
  const overridden = app.commandLine.hasSwitch('blanc-ecs-original-graphics');
  const applied = configured && platform === 'darwin' && !overridden;
  if (applied) app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
  return { policy: configured ? 'copy-video-frames' : 'none', applied, overridden, platform };
}

module.exports = { applyCandidateGraphicsPolicy };
