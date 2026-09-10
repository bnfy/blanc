'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

function readPolicy(doc) {
  try {
    if (doc.permissionsPolicy && typeof doc.permissionsPolicy.allowsFeature === 'function') {
      return doc.permissionsPolicy.allowsFeature('display-capture') === true;
    }
  } catch {}
  try {
    if (doc.featurePolicy && typeof doc.featurePolicy.allowsFeature === 'function') {
      return doc.featurePolicy.allowsFeature('display-capture') === true;
    }
  } catch {}
  return null;
}

function readIsolatedFacts() {
  let displayCaptureAllowed = readPolicy(document);
  let userActivationActive = false;
  try {
    userActivationActive = navigator.userActivation?.isActive === true;
  } catch {
    userActivationActive = false;
  }
  let documentVisibilityState = null;
  try {
    documentVisibilityState = document.visibilityState;
  } catch {
    documentVisibilityState = null;
  }
  return {
    userActivationActive,
    displayCaptureAllowed,
    documentVisibilityState,
    href: location.href,
    isIframe: window !== window.top,
  };
}

async function readMainWorldPolicy() {
  try {
    const value = await webFrame.executeJavaScript(
      `(() => {
        try {
          if (document.permissionsPolicy && typeof document.permissionsPolicy.allowsFeature === 'function') {
            return document.permissionsPolicy.allowsFeature('display-capture') === true;
          }
          if (document.featurePolicy && typeof document.featurePolicy.allowsFeature === 'function') {
            return document.featurePolicy.allowsFeature('display-capture') === true;
          }
        } catch {}
        return null;
      })()`,
      false
    );
    return value === true || value === false ? value : null;
  } catch {
    return null;
  }
}

contextBridge.exposeInMainWorld('admissionProbe', {
  send: (kind) => {
    readMainWorldPolicy().then((mainWorldPolicy) => {
      ipcRenderer.send('admission-probe:facts', {
        kind,
        ...readIsolatedFacts(),
        mainWorldPolicy,
      });
    });
  },
});

ipcRenderer.on('admission-probe:ping', (_e, kind) => {
  readMainWorldPolicy().then((mainWorldPolicy) => {
    ipcRenderer.send('admission-probe:facts', {
      kind,
      ...readIsolatedFacts(),
      mainWorldPolicy,
    });
  });
});
