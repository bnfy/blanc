# Same-machine relay + tampered-destination probe

- Date: 2026-09-08T01:48:14.508Z
- Electron: 44.1.1
- Chromium: 152.0.7977.65
- Platform: darwin arm64

## 1. Legitimate same-machine relay

- Helper getDisplayMedia + handler audio loopback: ok
- Video: {"kind":"video","readyState":"live","muted":false,"label":"Entire screen","width":3024,"height":1964,"displaySurface":"monitor"}
- Receiver energy peak: 1
- Receiver iceConnectionState: connected

## 2–3. Tampered destination (SDP-embedded and separate ICE)

- Public candidate forwarded to helper: false
- Public SDP (c= + a=candidate 8.8.8.8) accepted: false reason=remote
- Payloads that would have been sent to helper.addIceCandidate / setRemoteDescription: 0

A dropped-candidate log is supporting only. Confinement is the filter refusing
off-machine IPs before they reach the helper peer connection, plus the
legitimate relay above staying connected on same-machine ICE.

```json
{
  "helperResult": {
    "name": "relay-legit",
    "api": "getDisplayMedia",
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
    "helperLocalPeak": 0,
    "helperAudioContextState": "running",
    "ok": true
  },
  "energy": {
    "name": "relay-legit",
    "peak": 1,
    "readyState": "live",
    "muted": false,
    "mutedAfterWait": false,
    "audioContextState": "running",
    "iceConnectionState": "connected",
    "usedMicGetUserMedia": false
  },
  "filteredCandidate": {
    "ok": false,
    "reason": "remote"
  },
  "filteredSdp": {
    "ok": false,
    "reason": "remote"
  },
  "helperStats": {
    "ice": null
  }
}
```

