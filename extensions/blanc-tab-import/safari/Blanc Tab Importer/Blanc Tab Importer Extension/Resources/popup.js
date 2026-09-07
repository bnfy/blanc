import {
  MAX_TABS,
  encryptSelectedTabs,
  sanitizeExtensionTabs,
  stageEncryptedHandoff,
} from './handoff.mjs';

const extension = globalThis.browser ?? globalThis.chrome;
const tabsRoot = document.getElementById('tabs');
const status = document.getElementById('status');
const count = document.getElementById('count');
const open = document.getElementById('open');
const toggleAll = document.getElementById('toggleAll');
let eligibleTabs = [];
let skippedCount = 0;

function sourceBrowser() {
  return /Firefox\//i.test(navigator.userAgent) ? 'firefox' : 'safari';
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function selectedTabs() {
  const ids = new Set([...tabsRoot.querySelectorAll('input:checked')].map((input) => Number(input.value)));
  return eligibleTabs.filter((tab) => ids.has(Number(tab.id)));
}

function updateSelection() {
  const selected = selectedTabs().length;
  count.textContent = `${selected} selected`;
  open.disabled = selected === 0 || selected > MAX_TABS;
  toggleAll.textContent = selected ? 'Clear' : 'Select all';
}

function renderTabs() {
  tabsRoot.replaceChildren();
  for (const [index, tab] of eligibleTabs.entries()) {
    const label = document.createElement('label');
    label.className = 'tab';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(tab.id);
    input.checked = index < MAX_TABS;
    input.addEventListener('change', () => {
      if (input.checked && selectedTabs().length > MAX_TABS) {
        input.checked = false;
        setStatus('Choose no more than 100 tabs.', true);
      } else {
        setStatus(skippedCount ? `${skippedCount} browser-internal or unsafe ${skippedCount === 1 ? 'tab is' : 'tabs are'} unavailable.` : '');
      }
      updateSelection();
    });
    const copy = document.createElement('span');
    copy.className = 'copy';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tab.title;
    const domain = document.createElement('span');
    domain.className = 'domain';
    domain.textContent = new URL(tab.url).hostname;
    copy.append(title, domain);
    label.append(input, copy);
    if (tab.active) {
      const active = document.createElement('span');
      active.className = 'active';
      active.textContent = 'active';
      label.append(active);
    }
    tabsRoot.append(label);
  }
  if (eligibleTabs.length > MAX_TABS) {
    setStatus(`This window has more than 100 web tabs. The first 100 are selected; choose a different subset if needed.`);
  } else if (skippedCount) {
    setStatus(`${skippedCount} browser-internal or unsafe ${skippedCount === 1 ? 'tab is' : 'tabs are'} unavailable.`);
  }
  updateSelection();
}

toggleAll.addEventListener('click', () => {
  const boxes = [...tabsRoot.querySelectorAll('input')];
  const shouldSelect = !boxes.some((box) => box.checked);
  boxes.forEach((box, index) => { box.checked = shouldSelect && index < MAX_TABS; });
  updateSelection();
});

open.addEventListener('click', async () => {
  const chosen = selectedTabs();
  if (!chosen.length || chosen.length > MAX_TABS) return;
  open.disabled = true;
  toggleAll.disabled = true;
  open.textContent = 'Securing…';
  setStatus('Encrypting the selected tab list…');
  try {
    let launchUrl = null;
    for (let attempt = 0; attempt < 2 && !launchUrl; attempt += 1) {
      const encrypted = await encryptSelectedTabs({ sourceBrowser: sourceBrowser(), tabs: chosen });
      try { launchUrl = await stageEncryptedHandoff(encrypted); } catch (error) {
        if (attempt || ['rate-limited', 'invalid-expiry'].includes(error.message)) throw error;
      }
    }
    await extension.tabs.create({ url: launchUrl });
    window.close();
  } catch (error) {
    setStatus(
      error?.message === 'rate-limited'
        ? 'Too many handoffs were requested. Wait a minute and try again.'
        : error?.message === 'invalid-expiry'
          ? 'This handoff has expired or your device clock is incorrect. Check the clock and create a new handoff.'
        : error?.message === 'too-large'
          ? 'That tab metadata is too large for one handoff. Choose fewer tabs and try again.'
          : 'The one-time handoff could not be created. Check your connection and try again.',
      true
    );
    open.disabled = false;
    toggleAll.disabled = false;
    open.textContent = 'Open in Blanc';
  }
});

async function init() {
  try {
    const currentWindow = await extension.windows.getCurrent();
    if (currentWindow?.incognito) {
      setStatus('Private windows cannot be imported.', true);
      toggleAll.disabled = true;
      return;
    }
    const rows = await extension.tabs.query({ currentWindow: true });
    const clean = sanitizeExtensionTabs(rows);
    eligibleTabs = clean.tabs;
    skippedCount = clean.skippedCount;
    if (!eligibleTabs.length) {
      setStatus('This window has no eligible web tabs.', true);
      toggleAll.disabled = true;
      return;
    }
    renderTabs();
  } catch {
    setStatus('The current browser window could not be read.', true);
    toggleAll.disabled = true;
  }
}

init();
