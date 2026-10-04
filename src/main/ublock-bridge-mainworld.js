'use strict';
// The page and preload both belong to the exact managed extension bridge URL.
/* global chrome */
const port = chrome.runtime.connect({ name: 'blanc-host-v1' });
port.onMessage.addListener(message => window.blancUboBridge.send(message));
window.blancUboBridge.listen(message => port.postMessage(message));
port.onDisconnect.addListener(() => window.blancUboBridge.disconnected());
