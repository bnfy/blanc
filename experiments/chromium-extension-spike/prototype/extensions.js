'use strict';
// Installed actions and Store discovery share the picker. Chromium owns installation and popups.
window.BlancExtensions = class {
  constructor({ request, close, refreshGeometry, back }) {
    this.request = request;
    this.close = close;
    this.refreshGeometry = refreshGeometry;
    this.back = back;
    this.panel = document.getElementById('extensionsPanel');
    this.search = document.getElementById('extensionSearch');
    this.list = document.getElementById('extensionList');
    this.message = document.getElementById('extensionMessage');
    this.items = [];
    this.selected = null;
    this.busy = false;
    this.search.addEventListener('input', () => this.render());
    this.panel.addEventListener('keydown', event => this.keydown(event));
    document.getElementById('extensionsBack').addEventListener('click', () => back());
    document.getElementById('extensionsEscape').addEventListener('click', () => close());
    document.getElementById('extensionsManage').addEventListener('click', () => this.openPage('chrome://extensions/'));
    document.getElementById('extensionsGet').addEventListener('click', () => this.openPage('https://chromewebstore.google.com/category/extensions'));
    this.list.addEventListener('click', event => {
      const button = event.target.closest('[data-extension-id]');
      if (button && !button.disabled) this.activate(button.dataset.extensionId);
    });
    this.list.addEventListener('pointermove', event => {
      const button = event.target.closest('[data-extension-id]');
      if (button && !button.disabled) this.select(button.dataset.extensionId, false);
    });
  }
  async show() {
    this.panel.hidden = false;
    this.search.value = '';
    this.render();
    this.search.focus();
    if (!this.items.length) this.message.textContent = 'Loading extensions…';
    await this.update();
    this.refreshGeometry();
    this.search.focus();
  }
  hide() { this.panel.hidden = true; }
  async update() {
    if (this.panel.hidden || this.busy || this.updating) return;
    this.updating = true;
    try {
      const result = await this.request('extensions');
      this.tabId = result.tabId;
      const items = result.items.sort((a, b) => a.name.localeCompare(b.name));
      const key = JSON.stringify(items);
      if (key !== this.serialized) {
        this.serialized = key;
        this.items = items;
        this.render();
      } else if (!this.items.length) this.render();
    } catch (error) {
      this.message.textContent = error.message;
    } finally { this.updating = false; }
  }
  render() {
    const query = this.search.value.trim().toLocaleLowerCase();
    this.visible = this.items.filter(item => item.name.toLocaleLowerCase().includes(query));
    if (query) this.visible.push({
      id: 'store-search', enabled: true, icon: '', storeSearch: true,
      name: `Search Chrome Web Store for “${this.search.value.trim()}”`,
    });
    if (!this.visible.some(item => item.id === this.selected && item.enabled)) {
      this.selected = this.visible.find(item => item.enabled)?.id ?? null;
    }
    this.list.replaceChildren();
    for (const item of this.visible) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'extension-row';
      row.id = `extension-${item.id}`;
      row.dataset.extensionId = item.id;
      row.setAttribute('role', 'option');
      row.tabIndex = -1;
      row.disabled = !item.enabled;
      row.title = item.title || item.name;
      const icon = document.createElement('img');
      icon.className = 'extension-icon';
      icon.alt = '';
      if (item.icon.startsWith('data:image/png;base64,')) icon.src = item.icon;
      else icon.hidden = true;
      const text = document.createElement('span');
      text.className = 'extension-text';
      const name = document.createElement('span');
      name.className = 'extension-name';
      name.textContent = item.name;
      const detail = document.createElement('span');
      detail.className = 'extension-detail';
      detail.textContent = item.storeSearch ? 'Find and install new extensions' : item.enabled ? 'Open extension' : 'Unavailable on this page';
      text.append(name, detail);
      const hint = document.createElement('span');
      hint.className = 'extension-enter';
      hint.textContent = 'Enter';
      hint.setAttribute('aria-hidden', 'true');
      row.append(icon, text, hint);
      this.list.append(row);
    }
    this.message.textContent = this.visible.length ? '' : this.items.length ? 'No matching extensions' : 'No extensions installed. Get extensions to add your first one.';
    this.select(this.selected, false);
  }
  select(id, scroll = true) {
    this.selected = id;
    for (const row of this.list.children) row.setAttribute('aria-selected', String(row.dataset.extensionId === id));
    if (id) {
      this.search.setAttribute('aria-activedescendant', `extension-${id}`);
      if (scroll) document.getElementById(`extension-${id}`)?.scrollIntoView({ block: 'nearest' });
    } else this.search.removeAttribute('aria-activedescendant');
  }
  keydown(event) {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a' && event.target === this.search) {
      event.preventDefault();
      this.search.select();
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
    if (event.target !== this.search) return;
    const choices = this.visible?.filter(item => item.enabled) ?? [];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = choices.findIndex(item => item.id === this.selected);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.select(choices[(index + direction + choices.length) % choices.length]?.id ?? null);
    } else if (event.key === 'Enter' && this.selected) {
      event.preventDefault();
      this.activate(this.selected);
    }
  }
  async activate(id) {
    if (this.busy) return;
    if (id === 'store-search') {
      const query = this.search.value.trim();
      if (query) await this.openPage(`https://chromewebstore.google.com/search/${encodeURIComponent(query)}`);
      return;
    }
    this.busy = true;
    try {
      const tabId = this.tabId;
      await this.close(false);
      // Let the native anchor become visible before Chromium opens its popup.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await this.request('extensionAction', [id, tabId]);
    } catch (error) {
      await window.BlancPrototypeHost.extensions();
      this.message.textContent = error.message;
    } finally { this.busy = false; }
  }
  async openPage(url) {
    await this.close();
    await this.request('createTab', [url]);
  }
};
