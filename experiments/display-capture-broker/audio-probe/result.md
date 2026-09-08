# Helper system-audio probe

- Date: 2026-09-08T01:40:51.424Z
- Electron: 44.1.1
- Chromium: 152.0.7977.65
- Platform: darwin arm64
- disable-features: MacCatapLoopbackAudioForScreenShare
- desktopCapturer sources: 1
- Microphone getUserMedia: not used

## Successful helper invocation (copy this into Task 8)

**Primary (use this in the helper):** `getDisplayMedia` + helper-session handler.

```js
helperSession.setDisplayMediaRequestHandler((_request, callback) => {
  callback({ video: desktopCapturerSource, audio: 'loopback' });
});
await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
```

- Receiver peak: `0.11163330078125` (live, unmuted, `iceConnectionState: connected`)
- Helper-local peak: `0.76764315366745`
- Video: 3024×1964 `displaySurface: monitor`
- Audio label: `System audio`
- Flags: `disable-features=MacCatapLoopbackAudioForScreenShare` (darwin). No `MacSckSystemAudioLoopbackOverride`.
- Microphone `getUserMedia` was not used.
- These two APIs are not interchangeable: the handler is only for helper `getDisplayMedia`. Legacy source-id capture stays `getUserMedia` if a later platform requires it.

Also produced receiver energy (do not treat as the primary product path):

- `getUserMedia` `{ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId } }, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId } } }` peak=`0.533905029296875`
- `getUserMedia` `{ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId } } }` peak=`1`

## Windows / Linux

Not run from this macOS host. Energy-at-receiver still required on those guests before Island picker lock-in.

## Raw cases

```json
{
  "flags": "MacCatapLoopbackAudioForScreenShare",
  "source": {
    "idPrefix": "screen:1:0",
    "name": "Entire screen"
  },
  "cases": [
    {
      "name": "handler-getDisplayMedia-loopback",
      "api": "getDisplayMedia",
      "handlerAudio": "loopback",
      "sourceIdPresent": true,
      "sourceName": "Entire screen",
      "tracks": [
        {
          "kind": "audio",
          "readyState": "live",
          "muted": false,
          "label": "System audio",
          "width": null,
          "height": null,
          "displaySurface": null
        },
        {
          "kind": "video",
          "readyState": "live",
          "muted": false,
          "label": "Entire screen",
          "width": 3024,
          "height": 1964,
          "displaySurface": "monitor"
        }
      ],
      "helperLocalPeak": 0.76764315366745,
      "helperAudioContextState": "running",
      "ok": true,
      "energy": {
        "name": "handler-getDisplayMedia-loopback",
        "peak": 0.11163330078125,
        "readyState": "live",
        "muted": false,
        "mutedAfterWait": false,
        "audioContextState": "running",
        "iceConnectionState": "connected",
        "usedMicGetUserMedia": false
      }
    },
    {
      "name": "gum-video-id-audio-id",
      "api": "getUserMedia",
      "handlerAudio": null,
      "sourceIdPresent": true,
      "sourceName": "Entire screen",
      "tracks": [
        {
          "kind": "audio",
          "readyState": "live",
          "muted": false,
          "label": "System Audio",
          "width": null,
          "height": null,
          "displaySurface": null
        },
        {
          "kind": "video",
          "readyState": "live",
          "muted": false,
          "label": "Screen",
          "width": 3024,
          "height": 1964,
          "displaySurface": null
        }
      ],
      "helperLocalPeak": 0.44998788833618164,
      "helperAudioContextState": "running",
      "ok": true,
      "energy": {
        "name": "gum-video-id-audio-id",
        "peak": 0.533905029296875,
        "readyState": "live",
        "muted": false,
        "mutedAfterWait": false,
        "audioContextState": "running",
        "iceConnectionState": "connected",
        "usedMicGetUserMedia": false
      }
    },
    {
      "name": "gum-video-id-audio-desktop",
      "api": "getUserMedia",
      "handlerAudio": null,
      "sourceIdPresent": true,
      "sourceName": "Entire screen",
      "tracks": [
        {
          "kind": "audio",
          "readyState": "live",
          "muted": false,
          "label": "System Audio",
          "width": null,
          "height": null,
          "displaySurface": null
        },
        {
          "kind": "video",
          "readyState": "live",
          "muted": false,
          "label": "Screen",
          "width": 3024,
          "height": 1964,
          "displaySurface": null
        }
      ],
      "helperLocalPeak": 0.44998788833618164,
      "helperAudioContextState": "running",
      "ok": true,
      "energy": {
        "name": "gum-video-id-audio-desktop",
        "peak": 1,
        "readyState": "live",
        "muted": false,
        "mutedAfterWait": false,
        "audioContextState": "running",
        "iceConnectionState": "connected",
        "usedMicGetUserMedia": false
      }
    }
  ]
}
```

