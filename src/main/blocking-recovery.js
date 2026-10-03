'use strict';
// Settings recovery must release the same startup gate/session restore that
// owns initialization. A later background failure only restarts the provider.
function createBlockingRecovery({ startup, providers }) {
  return {
    retry: () => startup()?.status().phase === 'failed'
      ? startup().retry() : providers().retry(),
    async continueIfDisabled(enabled) {
      const controller = startup();
      if (enabled || controller?.status().phase !== 'failed') return false;
      await controller.continueWithoutBlocking();
      return true;
    },
  };
}
module.exports = { createBlockingRecovery };
