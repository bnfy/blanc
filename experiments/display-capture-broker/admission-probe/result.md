# Admission probe results

- Date: 2026-09-08T01:34:53.550Z
- Electron: 44.1.1
- Chromium: 152.0.7977.65
- Platform: darwin arm64

WebContents has `isFocused()` and no `isVisible()`. Visibility used owning
window `isVisible()`/`isMinimized()` plus tab attachment. Frame visibility
was read from `webFrameMain.visibilityState` when present, else recorded null.

## Findings

- Isolated `document.permissionsPolicy`/`featurePolicy` on this Electron: available.
- Main-world policy via isolated preload `webFrame.executeJavaScript(..., false)`: available (true). Product must use this trusted preload read, not a page-posted boolean.
- Click admission: PASS.
- No-gesture after fresh load + 6.2s: activation=false admission={"ok":false,"reason":"activation"}.
- Hidden window: windowVisible=false admission=denied visible/activation as recorded.
- Minimized window: windowMinimized=true documentVisible=false.
- Unattached view: admission reason visible.
- Picker took page focus: pageFocusedAfterPicker=false. In-flight remains admitted only if the click case passed (true). New request after picker: {"ok":false,"reason":"activation"}.
- Permissions-Policy header deny: false / isolated false.
- Iframe preload reach: preload did not answer child frames — do not claim iframe sharing.
- Launch: unset ELECTRON_RUN_AS_NODE before invoking the Electron binary; the npm wrapper inherits that env and resolves require('electron') to a string.

```json
[
  {
    "name": "click-on-focused-visible-window",
    "isolated": {
      "kind": "click",
      "userActivationActive": true,
      "displayCaptureAllowed": true,
      "documentVisibilityState": "visible",
      "href": "http://127.0.0.1:64895/ok",
      "isIframe": false,
      "mainWorldPolicy": true
    },
    "trusted": {
      "webContentsFocused": true,
      "windowVisible": true,
      "windowMinimized": false,
      "tabAttached": true,
      "frameVisible": true,
      "documentVisible": true
    },
    "policySource": "isolated",
    "admission": {
      "ok": true,
      "reason": null
    }
  },
  {
    "name": "no-gesture-ipc",
    "isolated": {
      "kind": "no-gesture",
      "userActivationActive": false,
      "displayCaptureAllowed": true,
      "documentVisibilityState": "visible",
      "href": "http://127.0.0.1:64895/ok",
      "isIframe": false,
      "mainWorldPolicy": true
    },
    "trusted": {
      "webContentsFocused": true,
      "windowVisible": true,
      "windowMinimized": false,
      "tabAttached": true,
      "frameVisible": true,
      "documentVisible": true
    },
    "admission": {
      "ok": false,
      "reason": "activation"
    }
  },
  {
    "name": "hidden-window",
    "isolated": {
      "kind": "hidden",
      "userActivationActive": false,
      "displayCaptureAllowed": true,
      "documentVisibilityState": "visible",
      "href": "http://127.0.0.1:64895/ok",
      "isIframe": false,
      "mainWorldPolicy": true
    },
    "trusted": {
      "webContentsFocused": false,
      "windowVisible": false,
      "windowMinimized": false,
      "tabAttached": true,
      "frameVisible": true,
      "documentVisible": false
    },
    "admission": {
      "ok": false,
      "reason": "activation"
    }
  },
  {
    "name": "minimized-window",
    "isolated": {
      "kind": "minimized",
      "userActivationActive": false,
      "displayCaptureAllowed": true,
      "documentVisibilityState": "hidden",
      "href": "http://127.0.0.1:64895/ok",
      "isIframe": false,
      "mainWorldPolicy": true
    },
    "trusted": {
      "webContentsFocused": false,
      "windowVisible": false,
      "windowMinimized": true,
      "tabAttached": true,
      "frameVisible": false,
      "documentVisible": false
    },
    "admission": {
      "ok": false,
      "reason": "activation"
    }
  },
  {
    "name": "unattached-view",
    "trusted": {
      "webContentsFocused": true,
      "windowVisible": true,
      "windowMinimized": false,
      "tabAttached": false,
      "frameVisible": true,
      "documentVisible": false
    },
    "admission": {
      "ok": false,
      "reason": "visible"
    }
  },
  {
    "name": "picker-focus-transfer",
    "inFlightRemainsAdmitted": true,
    "pageFocusedAfterPicker": false,
    "newRequest": {
      "ok": false,
      "reason": "activation"
    }
  },
  {
    "name": "permissions-policy-header-deny",
    "isolated": {
      "kind": "click",
      "userActivationActive": true,
      "displayCaptureAllowed": false,
      "documentVisibilityState": "visible",
      "href": "http://127.0.0.1:64895/deny",
      "isIframe": false,
      "mainWorldPolicy": false
    },
    "policySource": "isolated",
    "admission": {
      "ok": false,
      "reason": "policy"
    }
  },
  {
    "name": "iframe-preload-reach",
    "childFrameCount": 2,
    "iframeFacts": [
      {
        "kind": "iframe-0",
        "error": "timeout waiting for iframe-0"
      },
      {
        "kind": "iframe-1",
        "error": "timeout waiting for iframe-1"
      }
    ],
    "frames": [
      "http://127.0.0.1:64895/iframe-host",
      "http://127.0.0.1:64895/iframe-child",
      "http://127.0.0.1:64895/iframe-child"
    ]
  }
]
```

