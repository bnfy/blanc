'use strict';

const helper = window.blancDisplayCaptureHelper;
if (helper) {
  helper.onAuthorize(() => {});
  helper.onSignal(() => {});
  helper.ready();
}
