// A phone for Shared Spaces tests: the real bundle in Node, with a fake of what Java does. Used by
// chromium/tools/sync-spaces.test.mjs and, as the other device, by chromium/tests/android/shared-spaces.mjs.
import {createRequire} from 'node:module';

const {peer} = createRequire(import.meta.url)('./sync-peer.cjs');
const settled = () => new Promise(done => setTimeout(done, 20));

// What Java does: holds the library and the shown tabs, answers rows, and takes the runner's changes.
export class Phone {
  // `reopen` runs while a pass waits, for a test that has to get past the request limits.
  constructor(name, url, reopen = () => {}) {
    this.reopen = reopen;
    this.tabs = [];          // {local, shared, url, title, pinned, group}
    this.rows = [];
    this.shownId = null;
    this.revision = 0;
    this.nextLocal = 1;
    this.applied = [];
    this.layouts = [];
    this.deleted = [];
    this.refuse = false;
    this.device = peer(name, url, {emit: (event, text) => this.on(event, JSON.parse(text || 'null'))});
  }
  call(method, ...args) {
    return new Promise((done, fail) => this.device.context.__call(method, JSON.stringify(args),
      (ok, value) => ok ? done(JSON.parse(value)) : fail(Error(value))));
  }
  on(event, value) {
    if (event === 'spaces-library') {
      this.revision = value.revision;
      this.rows = value.rows;
      for (const row of this.rows) if (row.id === this.shownId && row.tabIds) {
        row.localIds?.forEach((local, index) => {
          const tab = this.tabs.find(item => item.local === local);
          if (tab) tab.shared = row.tabIds[index];
        });
      }
    }
    if (event === 'spaces-bindings') {
      value.localIds.forEach((local, index) => {
        const tab = this.tabs.find(item => item.local === local);
        if (tab && value.tabIds[index]) tab.shared = value.tabIds[index];
      });
    }
    if (event === 'spaces-layout') this.layouts.push(value);
    if (event === 'spaces-deleted') this.deleted.push(value.id);
    if (event === 'spaces-row') {
      this.applied.push(value.row);
      const ok = !this.refuse && this.applyRow(value.row);
      this.device.context.__call('spaces.rowDone', JSON.stringify([value.token, ok]), () => {});
    }
  }
  applyRow(row) {
    if (row.kind !== 'tabs') return true;
    const tab = this.tabs.find(item => item.shared === row.id);
    if (row.op === 'create') {
      if (!tab) this.tabs.push({local: `n${this.nextLocal++}`, shared: row.id, url: row.record.nav.v.url,
        title: row.record.nav.v.title, pinned: row.record.pinned.v, group: row.record.groupId.v, quiet: row.quiet === true});
      return true;
    }
    if (!tab) return true;
    if (row.op === 'close') this.tabs = this.tabs.filter(item => item !== tab);
    if (row.field === 'nav') tab.url = row.value.v.url;
    if (row.field === 'pinned') tab.pinned = row.value.v;
    if (row.field === 'groupId') tab.group = row.value.v;
    return true;
  }
  capture() {
    if (!this.shownId) return null;
    return {urls: this.tabs.map(tab => tab.url), tabIds: this.tabs.map(tab => tab.shared ?? null), localIds: this.tabs.map(tab => tab.local),
      meta: this.tabs.map(tab => ({title: tab.title})), pinned: this.tabs.map(tab => !!tab.pinned),
      groupIds: this.tabs.map(tab => tab.group ?? null), groups: this.groups ?? [], activeIndex: 0,
      documentPolicy: 1, inheritsDocumentPolicy: this.tabs.map(() => false), localFiles: this.tabs.map(() => false)};
  }
  async push(protectedIds = []) {
    const shown = this.capture();
    const rows = this.rows.map(row => row.id === this.shownId ? {...row, ...shown} : row);
    const answer = await this.call('spaces.push', {revision: this.revision, rows, shownId: this.shownId, capture: shown, protectedIds, recoveryFormat: '{name} · kept here'});
    await settled();
    return answer;
  }
  addRow(id, name, urls) {
    this.rows.push({id, name, color: '#376694', symbol: 'book', urls, tabIds: urls.map(() => null), localIds: urls.map((_, index) => `h${index}`),
      meta: urls.map(() => ({title: ''})), pinned: urls.map(() => false), groupIds: urls.map(() => null), groups: [], activeIndex: 0,
      documentPolicy: 1, inheritsDocumentPolicy: urls.map(() => false), localFiles: urls.map(() => false)});
  }
  show(id, urls) {
    this.shownId = id;
    this.tabs = urls.map(url => ({local: `l${this.nextLocal++}`, url, title: '', pinned: false}));
  }
  async pass() {
    // Spaces take more requests than one window allows; a phone would wait the window out.
    const reopen = () => { this.device.sync.resetRequestWindowForTest(); this.reopen(); };
    const open = setInterval(reopen, 100);
    reopen();
    try { await this.device.sync.syncNow(); } finally { clearInterval(open); }
    await settled();
  }
}

