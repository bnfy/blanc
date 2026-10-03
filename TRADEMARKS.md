# Blanc trademark policy

_Last updated: October 3, 2026_

Blanc is open source. The [MIT License](LICENSE) lets anyone study, build,
change, share, and sell Bananify Creative's code. This policy covers something
the license does not: the names and logos that tell people a browser comes
from us.

We want two things at once. People should be able to trust that anything
called Blanc was made by Bananify Creative. And forking Blanc, packaging it,
and writing about it should stay easy. Most uses need no permission at all.

This policy does not limit uses the law already allows, such as truthfully
naming Blanc to refer to it. It also does not change the MIT License. Breaking
this policy affects only your use of our names and logos, never your rights
to the code.

## What this covers

- **Blanc**, used as the name of a web browser, software, or a related
  service. We don't claim the ordinary French word in other contexts.
- **Bananify Creative** and **Bananify**.
- Product names built on Blanc, including **Blanc Patron** and
  **Blanc Blocker**.
- The Blanc logo (the Sunrise mark), the app icons, the Horizon Shield, and
  the other identity artwork listed in [ASSET-LICENSE.md](ASSET-LICENSE.md).

These are our trademarks whether or not they are registered. The policy also
covers names and logos close enough to be confused with them.

Names of other projects that ship with Blanc, such as Electron, Chromium,
EasyList, and 1Password, belong to their owners. See
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Uses that need no permission

- **Talking about Blanc.** News, reviews, tutorials, videos, comparisons,
  research, and social posts can use the name. They can also show the logo,
  unmodified, to refer to Blanc.
- **Saying your project is based on Blanc.** A fork can state this in its
  description, README, or About box, as long as its own name is the product
  name and appears more prominently. For example: "Foo is a browser based on
  Blanc. It is not made or endorsed by Bananify Creative."
- **Saying something works with Blanc,** or offering services such as setup
  or support for Blanc, when that's true and doesn't suggest you're official.
- **Sharing official releases unchanged.** You may mirror or deploy the exact
  files we publish on [GitHub](https://github.com/bnfy/blanc/releases) and
  [blancbrowser.com](https://blancbrowser.com) under the Blanc name, free of
  charge.
- **Building Blanc for yourself.** You can build and use it privately or
  inside your organization without renaming it, as long as you don't
  distribute that build publicly.
- **Community groups and events** about Blanc, if they are clearly unofficial.
  "Blanc users in Berlin" is fine; "Official Blanc Community" is not.

## Forks and modified builds

If you change Blanc and publish the result, give it your own name and icon.

- Don't use "Blanc", or a name that could be confused with it, in your
  product name, app ID, package name, domain, store listing title, or social
  handle. "Blanc Plus", "Blanc Lite", and "BlancX" are examples of names we
  would object to.
- Replace every file reserved in [ASSET-LICENSE.md](ASSET-LICENSE.md). Don't
  make a new logo by altering ours.
- Don't say or suggest that your build is official, endorsed, certified, or
  supported by Bananify Creative.
- You're free to sell your fork under your own name.

### Renaming checklist

These are the places in this repository where the Blanc identity lives. If
you skip them, your build can collide with an installed copy of Blanc or
look like it comes from us.

- **App name.** Change `name` and `productName` in `package.json`. The product
  name sets window titles, menus, installers, the Linux desktop entry, and
  the folder where the app stores its data. If you keep it, your build will
  share Blanc's profile on the same machine.
- **App identity.** Change `build.appId` (`me.bnfy.bowser`). That ID is the
  official app's identity on macOS and Windows.
- **Updates.** Change `build.publish`, which points at Blanc's official
  releases. Otherwise your users get offered our updates instead of yours, or
  updates that fail.
- **Windows browser registration.** Change the hard-coded `BlancURL` ID in
  `build/installer.nsh` so your installer doesn't overwrite Blanc's
  default-browser entry.
- **Old-profile import.** Remove the one-time Bowser-to-Blanc profile copy in
  `src/main/main.js`. It would import an old Blanc profile on your build's
  first launch.
- **Artwork.** Replace the icons and marks listed in
  [ASSET-LICENSE.md](ASSET-LICENSE.md), including `build/app-icons/`,
  `build/windows-icons/`, `build/icon.png`, `src/renderer/pages/icon*`, and
  `src/renderer/shield-horizon.png`.
- **Visible text.** Rename "Blanc", "Blanc Patron", "Blanc Blocker", and
  "Bananify Creative" wherever users see them: menus, Settings, the start page,
  the About box, dialogs, and the installer. You don't have to rename internal
  identifiers users never see, such as module names, IPC channels, or the
  internal `blanc://` and `blanc-chrome://` schemes.
- **Our hosted services.** Point the sync service (`src/main/sync.js`), usage
  measurement (`src/main/telemetry.js`), the tab-import relay
  (`src/main/tab-import-handoff.js`), and Blanc Patron activation
  (`src/main/patron.js`) at your own services, or remove them.

### Bananify's hosted services

The MIT License covers code, not our servers. We run sync, usage
measurement, the tab-import relay, and Patron activation, and publish the
update feed, for official Blanc builds. A build under another name needs our
written permission to use them. Your users would otherwise reasonably assume
we operate, secure, and support a service for a browser we don't make.

## Community packages

Some people package Blanc for Linux stores and package managers, such as
Snap, Flatpak, the AUR, or a distribution's repository. A community package
may use the Blanc name only while all of the following are true:

1. **It's built from an unmodified tagged Blanc release.** Changes are limited
   to what the package format needs, such as file paths, launch scripts, and
   dependency wiring.
2. **It keeps Blanc's security and privacy intact.** The Chromium sandbox
   stays on, ad and tracker blocking work as shipped, update and signature
   checks are not bypassed, and nothing collects extra data. Launching with
   `--no-sandbox` breaks this rule.
3. **It says clearly that it's unofficial.** The listing names the packager as
   publisher, links to the official downloads, and says who to contact about
   packaging problems. For example: "Unofficial community package of Blanc,
   maintained by Alex. Not made or supported by Bananify Creative."
4. **It's free of charge.**
5. **It keeps up with Blanc releases,** especially security fixes. If you stop
   maintaining it, mark it unmaintained or remove it.

We may withdraw this permission for a particular package if it stops meeting
these conditions or confuses users. We'll tell the packager in writing, and
the package must then be renamed or removed. If you'd like your package to
become official, contact us.

## Uses that need permission

Ask us before:

- using "Blanc" or "Bananify", or a similar name, in a company name, product
  name, domain, app or package name, or social handle;
- putting the name or logo on merchandise;
- suggesting a partnership, sponsorship, or certification, such as "Official
  Blanc partner" or "Blanc certified";
- changing the logo, or combining it with your own mark;
- any other use this policy doesn't cover.

## Bananify Creative

You can refer to Bananify Creative truthfully, for example to say who makes
Blanc. Don't use the name to endorse or identify your own product.

## Questions and reports

Email [support@blancbrowser.com](mailto:support@blancbrowser.com) with
"Trademark" in the subject line. That covers permission requests and
packaging questions. To report a misuse, include a link to it and a short
description.

## Changes to this policy

We may update this policy. The current version is always this file. Its
history in the repository shows what changed and when.
