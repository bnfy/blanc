# M7b: Send to device

**Date:** 2026-10-24
**Status:** Draft for the owner's review. Nothing is built. Plan: [`2026-10-24-ios-m7b-send-to-device.md`](../plans/2026-10-24-ios-m7b-send-to-device.md).
**Milestone:** the second half of M7 in
[`2026-10-21-ios-port-revisit.md`](2026-10-21-ios-port-revisit.md) §6; it
completes
[`2026-10-23-ios-m7-profile-sync-design.md`](2026-10-23-ios-m7-profile-sync-design.md)
§7, which this document replaces in detail.
**Builds on:** M7a (#1068, `71490797e`): the phone joins desktop Profile Sync,
reads every device's open tabs and publishes its own.
**Asked for by:** a mobile user on Threads (2026-10-23): "Pin pages to send them
from your phone to your laptop, so you can pick up where you left off"
([`2026-10-23-ios-user-feedback-plan.md`](2026-10-23-ios-user-feedback-plan.md)).

---

## 1. What it does

On any Blanc device that syncs, a person can send the page they're on to one of
their other devices. On that device the page waits in a short **Sent to this
device** list until they open it or dismiss it. Nothing opens by itself.

Desktop sends from the tab menu (**Send to Device ▸**) and `/send <device>`. The
phone sends from a **Send** button on the pill. Desktop shows what it received in
the ⌘L panel's Other devices drawer and on the start page; the phone shows it at
the top of the palette and on the start page.

## 2. Decisions taken in this design

1. **A new sync store, `sends`.** Older desktops never request it, so they can't
   damage it. Each device writes only its own entry, so two devices never
   conflict over one record.
2. **Every syncing device publishes a presence entry** in `sends` (its name and
   platform, possibly with no items). Without it, a device that doesn't share
   its tabs couldn't be chosen as a target: today's device list comes only from
   shared tab lists.
3. **The store is optional on both sides** until the Worker serves it, as the
   icons store is. A send to a Worker without `sends` must say "not available"
   and never look successful (§6).
4. **"Sent", never "delivered".** The Worker's storage can lose a write under
   concurrency (`docs/security-assessment.md` R5), and Blanc never learns
   whether the other device saw it. The sender's confirmation says the page was
   sent.
5. **Opening and dismissing are local to the receiving device.** No device ever
   writes to another device's entry (the tab-sync design's §11 rule holds).
   Items leave the sender's entry when they expire.
6. **Private tabs can't be sent**, and the send controls don't appear in them.

## 3. The `sends` store

Plaintext, before the usual AES-GCM envelope (unchanged from M7a):

```
{ "devices": {
    "<deviceId>": {
      "name": "MacBook Pro",        // the name the device publishes (≤80)
      "platform": "darwin" | "win32" | "linux" | "ios",
      "updatedAt": 1800000000000,   // per-entry clock, as in session
      "items": [
        { "id": "<uuid>", "to": "<deviceId>", "url": "https://…",
          "title": "…", "sentAt": 1800000000000 }
      ] } } }
```

- **Items:** http(s) only, URL ≤2048 UTF-16 units, title ≤200 (the tab-sync
  limits); `to` must be another device's id; at most **20 items per sender**,
  newest kept; an item expires **7 days** after `sentAt` and is dropped by every
  writer and reader.
- **Entries:** merged per device by last writer wins on `updatedAt`, with the
  tab-sync tie rule (own entry wins locally, then the smaller canonical string).
  An entry not updated for **30 days** is pruned, as in session. A device
  refreshes its own entry's `updatedAt` at most once a day while it syncs
  (presence heartbeat), and whenever it sends.
- **Budget:** the whole store stays under 64 KiB of canonical JSON, far below
  the Worker's 512 KiB cap; over budget, the stalest other entries are dropped
  first, never the device's own.
- **Leaving a sync:** turning sync off or switching accounts publishes the
  device's entry with no items (best effort, like M7a's retraction) and clears
  the local store and dismissed ids.

## 4. Choosing a target

The **send targets** are every device of the account other than this one that
appears in the `sends` store or in the tab-sync store, newest first, named by
the account's synced device names (`deviceNames`) when one is set, else by the
name it publishes. With no other device, the desktop menu item is disabled with
"No other devices", the phone's Send button is hidden, and `/send` says so.

## 5. Receiving

The **inbox** is every unexpired item whose `to` is this device, from any
sender, minus the ids this device opened or dismissed, newest first, at most 20
shown.

- **Desktop ⌘L panel:** a **Sent to this device** group at the top of the Other
  devices drawer. Each row: the page's favicon placeholder, title, and "From
  {device} · {time}"; clicking opens it in a new tab and hides it; a × dismisses
  it. The drawer's footer button shows whenever there are other devices **or**
  inbox items, with the inbox count.
- **Desktop and phone start page:** a **Sent to this device** row above Other
  devices in the layouts that show Other devices (Ledger); same rows.
- **Phone palette:** a **Sent to this device** section at the top of the list
  at rest; tap opens it in a new tab, swipe left dismisses.
- Opened and dismissed ids are kept locally per account (in the sends store's
  local file), for 8 days, and are never synced.

## 6. Sending, and an older Worker

1. The device adds the item to its own entry, sets `updatedAt`, and PUTs
   `sends` at once (no debounce), with the usual 409 re-pull-and-merge, at most
   3 retries.
2. **Result shown to the sender:**
   - success → "Sent to {device}." (a toast on desktop, a short banner on the
     phone);
   - the Worker answers `404` with the plain-text body `unknown store` →
     "Sending isn't available yet." The item is removed from the local entry;
   - offline, rate limited or server error → "Couldn't send. Check your
     connection and try again." The item stays out of the local entry.
3. A missing `sends` blob on a Worker that serves the store is normal (no device
   has sent yet): the first PUT creates it with `ifVersion: null`. A desktop or
   phone pass never creates an empty `sends` blob just to publish presence on an
   older Worker, and treats `unknown store` like icons' optional outage: no
   `lastError`, no `lastSyncedAt`.

## 7. Requests and the rate limit

The Worker allows 30 GETs per minute per account, shared by its devices.
`sends` joins the existing passes rather than adding a timer:

- desktop's focus refresh pulls `session`, `icons`, `settings` and now `sends`
  (4 GETs, at most once a minute per device);
- the phone's pass becomes 5 GETs (at most once a minute in the foreground);
- sending is one PUT plus, on conflict, one GET per retry.

Three devices refreshing every minute use about 13 of the 30.

## 8. Security and privacy

- Same confidentiality as tab sync: the Worker sees only ciphertext. Every
  device on the account can read every item, including items addressed to
  another device; this is one person's account, as with shared tab lists.
- No new Worker route, host or credential; the Worker change is one store name.
- The account locator stays a bearer capability (R3). Nothing here raises the
  trigger in the tab-sync spec §8 for the authenticated v2 protocol, since the
  payload is no deeper than tab lists.
- Private tabs never send; a received page opens in a normal tab.

## 9. Deploying

The Worker must serve `sends` **before any client release offers sending**,
following the pairing route's precedent (`cloudflare/sync-worker/README.md`).
Deploying is the owner's action (`wrangler deploy` from
`cloudflare/sync-worker`). Clients built before the deploy degrade as §6
describes.

## 10. Not in M7b

Sending to several devices at once, a share extension for other iPhone apps,
push notifications, read receipts, sending a whole group or split, sending from
private tabs, and any change to how tab lists sync.

## 11. Testing

- A pure desktop model (`src/main/sends-model.js`) with unit tests; the phone's
  Swift port is checked against vectors generated from it, as in M7a.
- Worker tests for the new store, including account deletion.
- Desktop: the optional-store and send-result paths, the tab menu, `/send`, the
  drawer and start page, the bridge contracts, all six languages.
- Phone: the engine (presence, send, inbox, dismiss, old-Worker result) with the
  fake transport, the palette and pill, the start page bridge.
- By hand, after the Worker deploy and before release: send both ways between a
  packaged desktop and the phone (simulator; a real iPhone when the M7a device
  check runs), and against a Worker without `sends`.
