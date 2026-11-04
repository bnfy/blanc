// Pure readers for the Android acceptance harness: what the tab grid and the palette show, in a
// UI Automator dump, and the names of the fixture sites. No adb here, so they're unit-tested
// (chromium/tools/android-acceptance.test.mjs).

const attr = (node, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(node);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
};
const nodes = xml => [...xml.matchAll(/<node\b[^>]*>/g)].map(m => m[0]);

// The grid's tabs in display order, each with its group, and its groups. A group header reads
// "work, 2 tabs, Fold group" and is followed by its cards, or by "N tabs tucked away" when folded; private
// tabs follow the "Private" heading.
export function gridState(xml) {
  const tabs = [], groups = [];
  let group = null, left = 0, privateTabs = false;
  for (const node of nodes(xml)) {
    const desc = attr(node, 'content-desc'), text = attr(node, 'text');
    const header = /^(.+), (\d+) tabs?, (Fold|Unfold) group$/.exec(desc);
    if (header) {
      group = {name: header[1], count: Number(header[2]), collapsed: header[3] === 'Unfold'};
      groups.push(group);
      left = group.count;
      continue;
    }
    if (/^\d+ tabs? tucked away$/.test(text) && group) {
      left = 0;
      continue;
    }
    if (text === 'Private') {
      privateTabs = true;
      left = 0;
      continue;
    }
    const card = /^Switch to (.*)$/.exec(desc);
    if (!card) continue;
    tabs.push({title: card[1], group: left > 0 ? group.name : null, private: privateTabs, selected: /\sselected="true"/.test(node)});
    if (left > 0) left--;
  }
  return {tabs, groups};
}

// The palette's rows after its field: each a title and a subtitle. A command's title starts
// with "/", a group's subtitle counts its tabs, a favorite's is its address and an open tab's
// is its host.
export function paletteRows(xml) {
  const all = nodes(xml);
  const field = all.findIndex(n => /class="android\.widget\.EditText"/.test(n));
  const texts = all.slice(field + 1).map(n => attr(n, 'text')).filter(t => t && t !== 'No matches');
  const rows = [];
  for (let i = 0; i + 1 < texts.length; i += 2) {
    const [title, subtitle] = [texts[i], texts[i + 1]];
    const kind = title.startsWith('/') ? 'command' : /^\d+ tabs?$/.test(subtitle) ? 'group'
      : /^https?:\/\//.test(subtitle) ? 'favorite' : 'tab';
    rows.push({kind, title, subtitle});
  }
  return rows;
}

// A scenario's site name as an address: "a.example" as it is, "plain" under .example.
export function fixtureUrl(name, pathname = '/') {
  return `https://${name.includes('.') ? name : `${name}.example`}${pathname}`;
}

// The fixture server's page title: the host, and the path when it isn't "/".
export function pageTitle(host, pathname) {
  return pathname === '/' ? host : host + pathname;
}

// One pixel of `adb exec-out screencap` (raw RGBA after a 12- or 16-byte header) as [r, g, b].
export function rawPixel(raw, x, y) {
  const width = raw.readUInt32LE(0), height = raw.readUInt32LE(4);
  const offset = raw.length - width * height * 4 + (y * width + x) * 4;
  return [raw[offset], raw[offset + 1], raw[offset + 2]];
}
