// Bring Your Tabs — direct open-tab migration and Named Group organization.
/** @typedef {'source' | 'tabs' | 'organize' | 'review'} TabImportStep */

const STEPS = /** @type {const} */ (['source', 'tabs', 'organize', 'review']);
const MAX_GROUP_NAME_LENGTH = 40;
const GENERIC_GROUP_NAMES = new Set([
  'misc', 'stuff', 'other', 'other 2', 'imported tabs', 'imported', 'tabs',
  'bookmarks', 'untitled', 'group', 'folder',
]);
const UNGROUPED_LANE = '__ungrouped__';
const EXCLUDED_LANE = '__excluded__';
const BROWSER_ORDER = ['brave', 'chrome', 'edge', 'vivaldi', 'chromium'];
const BROWSER_META = Object.freeze({
  brave: { name: 'Brave', image: 'import-browser-brave.png' },
  chrome: { name: 'Google Chrome', image: 'import-browser-chrome.png' },
  edge: { name: 'Microsoft Edge', image: 'import-browser-edge.png' },
  vivaldi: { name: 'Vivaldi', image: 'import-browser-vivaldi.png' },
  chromium: { name: 'Chromium', image: 'import-browser-chromium.png' },
});
const BROWSER_NAME_KEYS = new Map(Object.entries({
  Brave: 'brave',
  'Google Chrome': 'chrome',
  'Microsoft Edge': 'edge',
  Vivaldi: 'vivaldi',
  Chromium: 'chromium',
}));

const api = window.bowserPages?.tabImport;
const surface = window.bowserPages?.surface;
const el = (id) => document.getElementById(id);
const pageEl = document.querySelector('.tab-import-page');
const statusEl = el('tabImportStatus');
const browserListEl = el('tabImportBrowserList');
const sourceRecoveryEl = el('tabImportSourceRecovery');
const profileSectionEl = el('tabImportProfileSection');
const profileTitleEl = el('tabImportProfileTitle');
const profileHintEl = el('tabImportProfileHint');
const sourceListEl = el('tabImportSourceList');
const tabsListEl = el('tabImportTabsList');
const selectedCountEl = el('tabImportSelectedCount');
const continueToOrganizeBtn = el('tabImportContinueToOrganize');
const newGroupNameEl = el('tabImportNewGroupName');
const organizeBoardEl = el('tabImportOrganizeBoard');
const continueToReviewBtn = el('tabImportContinueToReview');
const reviewSummaryEl = el('tabImportReviewSummary');
const applyBtn = el('tabImportApplyBtn');

/** @type {TabImportStep} */
let step = 'source';
let sessionId = null;
let generation = null;
let candidates = [];
let sourceWindowCount = 0;
let unsupportedCount = 0;
let proposal = null;
let originalProposal = null;
let selectionSync = 0;
let pendingApplyPhase = null;
let selectedSourceBrowserKey = null;
let sourceBrowserGroups = [];

function setStatus(message = '') { statusEl.textContent = message; }

function cloneProposal(value) {
  return value ? {
    version: value.version,
    groups: (value.groups ?? []).map((group) => ({
      ...group,
      candidateIds: [...(group.candidateIds ?? [])],
    })),
    ungroupedCandidateIds: [...(value.ungroupedCandidateIds ?? [])],
  } : null;
}

function normalizeReviewGroupName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function reviewGroupNameError(value, reviewProposal, currentId = '') {
  const name = normalizeReviewGroupName(value);
  if (!name) return 'Type a group name.';
  if ([...name].length > MAX_GROUP_NAME_LENGTH) return `Keep group names to ${MAX_GROUP_NAME_LENGTH} characters.`;
  if (GENERIC_GROUP_NAMES.has(name)) return 'Choose a more specific group name.';
  if ((reviewProposal?.groups ?? []).some((group) =>
    group.suggestionId !== currentId && normalizeReviewGroupName(group.name) === name)) {
    return 'That group name is already in use.';
  }
  return '';
}

function proposalLaneFor(value, candidateId) {
  for (const group of value?.groups ?? []) {
    if (group.candidateIds.includes(candidateId)) return group.suggestionId;
  }
  return value?.ungroupedCandidateIds?.includes(candidateId) ? UNGROUPED_LANE : null;
}

function removeCandidateFromProposal(reviewProposal, candidateId) {
  for (const group of reviewProposal.groups) {
    group.candidateIds = group.candidateIds.filter((id) => id !== candidateId);
  }
  reviewProposal.ungroupedCandidateIds = reviewProposal.ungroupedCandidateIds
    .filter((id) => id !== candidateId);
}

function moveCandidateInProposal(reviewProposal, candidateId, lane) {
  removeCandidateFromProposal(reviewProposal, candidateId);
  if (lane === EXCLUDED_LANE) return true;
  if (lane === UNGROUPED_LANE) {
    reviewProposal.ungroupedCandidateIds.push(candidateId);
    return true;
  }
  const group = reviewProposal.groups.find((item) => item.suggestionId === lane);
  if (!group) return false;
  group.candidateIds.push(candidateId);
  return true;
}

function reviewProposalIssue(reviewProposal, reviewCandidates) {
  if (!reviewProposal || reviewProposal.version !== 1) return 'Groups are unavailable.';
  const expected = reviewCandidates.filter((candidate) => candidate.selected && !candidate.excluded)
    .map((candidate) => candidate.candidateId);
  if (!expected.length) return 'Select at least one tab.';
  const expectedSet = new Set(expected);
  const seen = new Set();
  const names = new Set();
  for (const group of reviewProposal.groups ?? []) {
    const issue = reviewGroupNameError(group.name, reviewProposal, group.suggestionId);
    if (issue) return issue;
    const name = normalizeReviewGroupName(group.name);
    if (names.has(name)) return 'Each group needs a different name.';
    names.add(name);
    if (!Array.isArray(group.candidateIds) || group.candidateIds.length < 2) {
      return `“${group.name}” needs at least two tabs.`;
    }
    for (const id of group.candidateIds) {
      if (!expectedSet.has(id) || seen.has(id)) return 'Review each tab placement before opening.';
      seen.add(id);
    }
  }
  for (const id of reviewProposal.ungroupedCandidateIds ?? []) {
    if (!expectedSet.has(id) || seen.has(id)) return 'Review each tab placement before opening.';
    seen.add(id);
  }
  return seen.size === expectedSet.size ? '' : 'Review each tab placement before opening.';
}

function reviewCounts(reviewProposal) {
  const grouped = (reviewProposal?.groups ?? []).reduce((sum, group) => sum + group.candidateIds.length, 0);
  const ungrouped = reviewProposal?.ungroupedCandidateIds?.length ?? 0;
  return { tabs: grouped + ungrouped, groups: reviewProposal?.groups?.length ?? 0, ungrouped };
}

function tabImportApplyLabel({ tabs }) {
  return `Open ${tabs} ${tabs === 1 ? 'tab' : 'tabs'} in Blanc`;
}

function tabImportApplyRequest(reviewProposal = proposal, currentGeneration = generation) {
  return {
    generation: currentGeneration,
    groups: reviewProposal.groups.map((group) => ({
      name: normalizeReviewGroupName(group.name),
      candidateIds: [...group.candidateIds],
    })),
    ungroupedCandidateIds: [...reviewProposal.ungroupedCandidateIds],
  };
}

function groupNameError(value, currentId = '') {
  return reviewGroupNameError(value, proposal, currentId);
}

function dispositionIssue() {
  return reviewProposalIssue(proposal, candidates);
}

function setStep(next) {
  if (!STEPS.includes(next)) return;
  step = next;
  if (pageEl) pageEl.dataset.activeStep = step;
  for (const panel of document.querySelectorAll('[data-step-panel]')) {
    panel.hidden = panel.dataset.stepPanel !== step;
  }
  for (const marker of document.querySelectorAll('[data-step-marker]')) {
    const markerIndex = STEPS.indexOf(marker.dataset.stepMarker);
    const currentIndex = STEPS.indexOf(step);
    marker.classList.toggle('current', markerIndex === currentIndex);
    marker.classList.toggle('complete', markerIndex >= 0 && markerIndex < currentIndex);
  }
  // Each wizard step starts at its own heading. A long Tabs or Organize
  // panel can leave the sheet scrollport near the bottom; carrying that
  // position into the next panel clips its heading beneath the sticky nav.
  if (pageEl) {
    const resetScroll = () => {
      pageEl.scrollTop = 0;
      pageEl.scrollLeft = 0;
    };
    resetScroll();
    // A clicked CTA can keep focus until the old panel is hidden. Chromium
    // may then perform its own focus reveal after this handler returns, so
    // reassert the step origin once the new panel has laid out.
    requestAnimationFrame(resetScroll);
  }
}

function clearRecovery() {
  sourceRecoveryEl.hidden = true;
  sourceRecoveryEl.replaceChildren();
  for (const button of sourceListEl.querySelectorAll('.tab-import-source-btn')) {
    button.classList.remove('waiting');
    button.removeAttribute('aria-busy');
  }
}

function clearImport() {
  sessionId = null;
  generation = null;
  candidates = [];
  sourceWindowCount = 0;
  unsupportedCount = 0;
  proposal = null;
  originalProposal = null;
  pendingApplyPhase = null;
  tabsListEl.replaceChildren();
  organizeBoardEl.replaceChildren();
  reviewSummaryEl.replaceChildren();
}

async function cancelSession() {
  if (!sessionId || !api) return;
  try { await api.cancel(sessionId); } catch { /* expiry and close may race */ }
}

async function returnToSource() {
  await cancelSession();
  clearImport();
  clearRecovery();
  setStatus();
  setStep('source');
}

function wrapSurfaceClose() {
  if (!surface?.close) return;
  const close = surface.close.bind(surface);
  surface.close = async () => {
    await cancelSession();
    clearImport();
    return close();
  };
}

function browserKey(entry) {
  return BROWSER_META[entry?.browserId] ? entry.browserId : BROWSER_NAME_KEYS.get(entry?.browser);
}

function groupedSources(result) {
  const groups = new Map(BROWSER_ORDER.map((key) => [key, {
    key,
    name: BROWSER_META[key].name,
    sources: [],
    unavailable: null,
  }]));
  for (const source of result?.sources ?? []) {
    const key = browserKey(source);
    if (key) groups.get(key).sources.push(source);
  }
  for (const unavailable of result?.unavailable ?? []) {
    const key = browserKey(unavailable);
    if (key) groups.get(key).unavailable = unavailable;
  }
  return BROWSER_ORDER.map((key) => groups.get(key))
    .filter((group) => group.sources.length || group.unavailable);
}

function renderProfiles() {
  sourceListEl.replaceChildren();
  const group = sourceBrowserGroups.find((item) => item.key === selectedSourceBrowserKey);
  profileSectionEl.hidden = !group;
  if (!group) return;
  const name = BROWSER_META[group.key].name;
  const unavailable = !group.sources.length && group.unavailable;
  profileTitleEl.textContent = unavailable
    ? `${name} needs access`
    : `Choose ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} profile`;
  profileHintEl.textContent = unavailable
    ? 'Blanc can see this browser, but macOS is blocking its profile.'
    : 'Profiles keep separate windows and open tabs.';
  if (unavailable) {
    const row = document.createElement('div');
    row.className = 'tab-import-source-unavailable';
    const title = document.createElement('span');
    title.className = 'tab-import-source-unavailable-name';
    title.textContent = 'Permission needed';
    const hint = document.createElement('p');
    hint.className = 'tab-import-source-unavailable-hint';
    hint.textContent = group.unavailable.guidance ?? '';
    row.append(title, hint);
    sourceListEl.append(row);
    return;
  }
  for (const source of group.sources) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-import-source-btn';
    button.dataset.sourceLabel = source.label;
    button.setAttribute('aria-label', `Read open tabs from ${source.label}`);
    const copy = document.createElement('span');
    copy.className = 'tab-import-source-copy';
    const profile = document.createElement('span');
    profile.className = 'tab-import-source-name';
    profile.textContent = source.profile;
    copy.append(profile);
    const arrow = document.createElement('img');
    arrow.className = 'tab-import-source-arrow';
    arrow.src = 'import-chevron-right.svg';
    arrow.alt = '';
    const waiting = document.createElement('span');
    waiting.className = 'tab-import-source-waiting';
    waiting.textContent = 'Waiting…';
    button.dataset.sourceId = source.id;
    button.append(copy, arrow, waiting);
    button.addEventListener('click', () => openSource(source.id, source.label, {
      browserName: source.browser,
    }));
    sourceListEl.append(button);
  }
}

function renderBrowserCards() {
  browserListEl.replaceChildren();
  for (const group of sourceBrowserGroups) {
    const meta = BROWSER_META[group.key];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tab-import-browser-btn';
    card.classList.toggle('selected', group.key === selectedSourceBrowserKey);
    card.classList.toggle('unavailable', !group.sources.length);
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', group.key === selectedSourceBrowserKey ? 'true' : 'false');
    const logo = document.createElement('img');
    logo.className = 'tab-import-browser-logo';
    logo.src = meta.image;
    logo.alt = '';
    const name = document.createElement('span');
    name.className = 'tab-import-browser-name';
    name.textContent = meta.name;
    const count = document.createElement('span');
    count.className = 'tab-import-browser-count';
    count.textContent = group.sources.length
      ? `${group.sources.length} ${group.sources.length === 1 ? 'profile' : 'profiles'}`
      : 'Permission needed';
    card.append(logo, name, count);
    card.addEventListener('click', () => {
      clearRecovery();
      selectedSourceBrowserKey = group.key;
      renderBrowserCards();
      renderProfiles();
    });
    browserListEl.append(card);
  }
}

async function loadSources() {
  if (!api) return;
  browserListEl.replaceChildren();
  profileSectionEl.hidden = true;
  const loading = document.createElement('p');
  loading.className = 'section-hint';
  loading.textContent = 'Loading browser profiles…';
  browserListEl.append(loading);
  try {
    sourceBrowserGroups = groupedSources(await api.sources());
    if (!sourceBrowserGroups.length) {
      loading.textContent = 'No supported browser profiles found on this device.';
      return;
    }
    selectedSourceBrowserKey = (sourceBrowserGroups.find((group) => group.sources.length)
      ?? sourceBrowserGroups[0]).key;
    renderBrowserCards();
    renderProfiles();
  } catch {
    loading.textContent = "Couldn't load browser profiles.";
  }
}

function showQuitGate(id, label, result, browserName = label) {
  clearRecovery();
  sourceRecoveryEl.hidden = false;
  for (const button of sourceListEl.querySelectorAll('.tab-import-source-btn')) {
    const waiting = button.dataset.sourceId === String(id);
    button.disabled = true;
    button.classList.toggle('waiting', waiting);
    if (waiting) button.setAttribute('aria-busy', 'true');
  }
  const title = document.createElement('strong');
  title.textContent = `Finish saving tabs in ${browserName}`;
  const count = Number(result.recoverableTabCount) || 0;
  const copy = document.createElement('p');
  copy.textContent = `Blanc found a saved, restorable session${count ? ` with ${count} ${count === 1 ? 'tab' : 'tabs'}` : ''}. Quit ${browserName} normally so it can finish saving the latest session. Blanc only reads it and never removes tabs from ${browserName}.`;
  const note = document.createElement('p');
  note.className = 'section-hint';
  note.textContent = `Whether those tabs reopen automatically in ${browserName} depends on its startup setting.`;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'tab-import-primary';
  retry.textContent = `I’ve quit ${browserName} — check again`;
  retry.addEventListener('click', () => openSource(id, label, {
    afterQuit: true,
    browserName,
  }));
  sourceRecoveryEl.append(title, copy, note, retry);
  setStatus();
}

function sourceError(result, label, afterQuit, browserName = label) {
  if (afterQuit && ['source-locked', 'source-saving', 'incomplete-session', 'missing-session-marker'].includes(result.error)) {
    return `The latest ${label} session is not safely readable. Reopen ${browserName}; Blanc will not use an older snapshot.`;
  }
  return ({
    'source-unavailable': 'That browser profile is no longer available.',
    permission: 'macOS blocked this profile. Grant Blanc Full Disk Access, then try again.',
    'session-too-large': 'That saved session is too large to import safely.',
    'too-many-candidates': 'This profile has more than 500 open tabs. Nothing was changed.',
    'encrypted-session': `${label} uses an encrypted session format Blanc does not access.`,
    empty: `No restorable open tabs were found in ${label}.`,
    unreadable: `Blanc couldn’t read the saved ${label} session.`,
  })[result.error] ?? `Blanc couldn’t read open tabs from ${label}.`;
}

async function openSource(id, label, { afterQuit = false, browserName = label } = {}) {
  if (!api) return;
  clearRecovery();
  setStatus(afterQuit ? `Checking the saved ${label} session…` : `Reading open tabs from ${label}…`);
  for (const button of sourceListEl.querySelectorAll('button')) button.disabled = true;
  try {
    const result = await api.openSource(id, { afterQuit });
    if (result.error === 'source-locked' && !afterQuit && result.recoverable === true) {
      showQuitGate(id, label, result, browserName);
      return;
    }
    if (result.error) {
      setStatus(sourceError(result, label, afterQuit, browserName));
      return;
    }
    sessionId = result.sessionId;
    generation = result.generation;
    candidates = result.candidates ?? [];
    sourceWindowCount = Number(result.windowCount) || 0;
    unsupportedCount = Number(result.excludedCount) || 0;
    proposal = null;
    originalProposal = null;
    renderTabs();
    setStep('tabs');
    setStatus();
  } catch {
    setStatus(`Blanc couldn’t read open tabs from ${label}.`);
  } finally {
    const waitingForQuit = !sourceRecoveryEl.hidden;
    for (const button of sourceListEl.querySelectorAll('button')) {
      button.disabled = waitingForQuit;
    }
  }
}

function selectionPayload() {
  return {
    selectedIds: candidates.filter((candidate) => candidate.selected && !candidate.excluded)
      .map((candidate) => candidate.candidateId),
    excludedIds: candidates.filter((candidate) => candidate.excluded)
      .map((candidate) => candidate.candidateId),
  };
}

async function syncSelection({ keepProposal = false } = {}) {
  if (!api || !sessionId) return null;
  const ticket = ++selectionSync;
  try {
    const result = await api.setSelection(sessionId, selectionPayload());
    if (ticket !== selectionSync) return null;
    if (result.error) {
      setStatus(result.error === 'session-unavailable'
        ? 'This import expired. Choose the source again.'
        : "Couldn't update that selection.");
      return null;
    }
    generation = result.generation ?? generation;
    if (result.candidates) candidates = result.candidates;
    if (!keepProposal) {
      proposal = null;
      originalProposal = null;
    }
    return result;
  } catch {
    if (ticket === selectionSync) setStatus("Couldn't update that selection.");
    return null;
  }
}

function selectedCount() {
  return candidates.filter((candidate) => candidate.selected && !candidate.excluded).length;
}

function candidateMeta(candidate) {
  const parts = [candidate.hostname || 'site'];
  if (candidate.sourceGroupName) parts.push(`group: ${candidate.sourceGroupName}`);
  if (candidate.pinned) parts.push('pinned');
  return parts.join(' · ');
}

function candidateRow(candidate, selectable = true) {
  const row = document.createElement(selectable ? 'label' : 'div');
  row.className = `row ${selectable ? 'tab-import-preview-row' : 'tab-import-review-row'}`;
  if (selectable) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tab-import-row-check';
    checkbox.checked = candidate.selected && !candidate.excluded;
    checkbox.setAttribute('aria-label', `Bring ${candidate.title || candidate.hostname || 'untitled tab'}`);
    checkbox.addEventListener('change', async () => {
      candidate.selected = checkbox.checked;
      if (checkbox.checked) candidate.excluded = false;
      await syncSelection();
      renderTabs();
    });
    row.append(checkbox);
  }
  const main = document.createElement('div');
  main.className = 'main';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = candidate.title || candidate.hostname || 'Untitled';
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = candidateMeta(candidate);
  main.append(title, meta);
  row.append(main);
  return row;
}

function renderTabs() {
  tabsListEl.replaceChildren();
  const windows = new Map();
  const ordered = [...candidates].sort((a, b) =>
    a.sourceWindow - b.sourceWindow || a.sourceTabOrder - b.sourceTabOrder);
  for (const candidate of ordered) {
    if (!windows.has(candidate.sourceWindow)) windows.set(candidate.sourceWindow, []);
    windows.get(candidate.sourceWindow).push(candidate);
  }
  for (const [windowNumber, tabs] of windows) {
    const section = document.createElement('section');
    section.className = 'tab-import-window';
    const heading = document.createElement('div');
    heading.className = 'tab-import-window-heading';
    const title = document.createElement('h3');
    title.textContent = sourceWindowCount > 1 ? `Window ${windowNumber}` : 'Open tabs';
    const count = document.createElement('span');
    count.textContent = `${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'}`;
    heading.append(title, count);
    const list = document.createElement('div');
    list.className = 'row-list';
    for (const candidate of tabs) list.append(candidateRow(candidate));
    section.append(heading, list);
    tabsListEl.append(section);
  }
  if (unsupportedCount) {
    const note = document.createElement('p');
    note.className = 'section-hint tab-import-unsupported-note';
    note.textContent = `${unsupportedCount} unsupported ${unsupportedCount === 1 ? 'tab was' : 'tabs were'} left out.`;
    tabsListEl.append(note);
  }
  selectedCountEl.textContent = `${selectedCount()} of ${candidates.length} selected`;
  continueToOrganizeBtn.disabled = selectedCount() < 1;
}

async function selectAll(value) {
  for (const candidate of candidates) {
    candidate.selected = value;
    candidate.excluded = false;
  }
  renderTabs();
  await syncSelection();
  renderTabs();
}

async function beginOrganize() {
  if (!sessionId || selectedCount() < 1) return;
  continueToOrganizeBtn.disabled = true;
  setStatus('Preparing your Named Groups…');
  try {
    const result = await api.suggestSourceGroups(sessionId);
    if (result.error) {
      setStatus("Couldn't prepare these tabs for organization.");
      return;
    }
    proposal = cloneProposal(result.proposal);
    originalProposal = cloneProposal(result.proposal);
    renderOrganize();
    setStep('organize');
    setStatus();
  } finally {
    continueToOrganizeBtn.disabled = selectedCount() < 1;
  }
}

function removeFromProposal(candidateId) {
  for (const group of proposal.groups) {
    group.candidateIds = group.candidateIds.filter((id) => id !== candidateId);
  }
  proposal.ungroupedCandidateIds = proposal.ungroupedCandidateIds.filter((id) => id !== candidateId);
}

async function moveCandidate(candidateId, lane, restoring = false) {
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  if (!candidate || !proposal) return;
  const oldProposal = cloneProposal(proposal);
  const oldSelection = { selected: candidate.selected, excluded: candidate.excluded };
  removeFromProposal(candidateId);
  candidate.excluded = lane === EXCLUDED_LANE;
  candidate.selected = lane !== EXCLUDED_LANE;
  if (lane === UNGROUPED_LANE) proposal.ungroupedCandidateIds.push(candidateId);
  else if (lane !== EXCLUDED_LANE) {
    const group = proposal.groups.find((item) => item.suggestionId === lane);
    if (!group) {
      proposal = oldProposal;
      Object.assign(candidate, oldSelection);
      return;
    }
    group.candidateIds.push(candidateId);
  }
  if (!await syncSelection({ keepProposal: true })) {
    proposal = oldProposal;
    const current = candidates.find((item) => item.candidateId === candidateId);
    if (current) Object.assign(current, oldSelection);
  } else {
    setStatus(restoring ? 'Restored the original placement.' : 'Tab placement updated.');
  }
  renderOrganize();
}

async function restoreCandidate(candidateId) {
  let lane = proposalLaneFor(originalProposal, candidateId) ?? UNGROUPED_LANE;
  if (lane !== UNGROUPED_LANE && !proposal.groups.some((group) => group.suggestionId === lane)) {
    const original = originalProposal?.groups?.find((group) => group.suggestionId === lane);
    if (original) proposal.groups.push({ ...original, candidateIds: [] });
    else lane = UNGROUPED_LANE;
  }
  await moveCandidate(candidateId, lane, true);
}

function moveSelect(candidate) {
  const select = document.createElement('select');
  select.className = 'tab-import-move-select';
  select.setAttribute('aria-label', `Move ${candidate.title || candidate.hostname || 'tab'}`);
  for (const group of proposal.groups) {
    const option = document.createElement('option');
    option.value = group.suggestionId;
    option.textContent = `group: ${group.name}`;
    select.append(option);
  }
  for (const [value, label] of [[UNGROUPED_LANE, 'ungrouped'], [EXCLUDED_LANE, 'leave out']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = candidate.excluded ? EXCLUDED_LANE : (proposalLaneFor(proposal, candidate.candidateId) ?? UNGROUPED_LANE);
  select.addEventListener('change', () => moveCandidate(candidate.candidateId, select.value));
  return select;
}

function organizeRow(candidate) {
  const row = candidateRow(candidate, false);
  const actions = document.createElement('div');
  actions.className = 'tab-import-review-actions';
  actions.append(moveSelect(candidate));
  const current = candidate.excluded ? EXCLUDED_LANE : proposalLaneFor(proposal, candidate.candidateId);
  const original = proposalLaneFor(originalProposal, candidate.candidateId) ?? UNGROUPED_LANE;
  if (current !== original) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'tab-import-restore-btn';
    restore.textContent = 'restore';
    restore.addEventListener('click', () => restoreCandidate(candidate.candidateId));
    actions.append(restore);
  }
  row.append(actions);
  return row;
}

function removeGroup(group) {
  proposal.groups = proposal.groups.filter((item) => item.suggestionId !== group.suggestionId);
  for (const id of group.candidateIds) {
    if (!proposal.ungroupedCandidateIds.includes(id)) proposal.ungroupedCandidateIds.push(id);
  }
  setStatus(`Removed ${group.name}; its tabs are now ungrouped.`);
  renderOrganize();
}

function groupSection(group, byId) {
  const section = document.createElement('section');
  section.className = 'tab-import-review-group';
  section.dataset.confidence = group.confidence === 'review' ? 'review' : 'solid';
  const heading = document.createElement('div');
  heading.className = 'tab-import-review-heading';
  const input = document.createElement('input');
  input.className = 'tab-import-group-name';
  input.value = group.name;
  input.maxLength = MAX_GROUP_NAME_LENGTH;
  input.setAttribute('aria-label', `Rename ${group.name} group`);
  const badge = document.createElement('span');
  badge.className = 'tab-import-confidence';
  badge.textContent = group.confidence === 'high' ? 'from source' : 'new';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'tab-import-restore-btn';
  remove.textContent = 'remove group';
  remove.addEventListener('click', () => removeGroup(group));
  heading.append(input, badge, remove);
  const error = document.createElement('p');
  error.className = 'tab-import-name-error';
  input.addEventListener('input', () => {
    const issue = groupNameError(input.value, group.suggestionId);
    input.setCustomValidity(issue);
    error.textContent = issue;
    continueToReviewBtn.disabled = !!issue || !!dispositionIssue();
  });
  input.addEventListener('change', () => {
    const issue = groupNameError(input.value, group.suggestionId);
    if (issue) return;
    group.name = normalizeReviewGroupName(input.value);
    renderOrganize();
  });
  section.append(heading, error);
  if (group.candidateIds.length < 2) {
    const warning = document.createElement('p');
    warning.className = 'tab-import-group-warning';
    warning.textContent = 'A Named Group needs at least two tabs.';
    section.append(warning);
  }
  const list = document.createElement('div');
  list.className = 'row-list';
  for (const id of group.candidateIds) {
    const candidate = byId.get(id);
    if (candidate) list.append(organizeRow(candidate));
  }
  section.append(list);
  return section;
}

function laneSection(title, ids, byId, className = '') {
  const section = document.createElement('section');
  section.className = `tab-import-review-group tab-import-review-lane ${className}`.trim();
  const headingRow = document.createElement('div');
  headingRow.className = 'tab-import-lane-heading';
  const heading = document.createElement('h3');
  heading.className = 'section-title';
  heading.textContent = title;
  const count = document.createElement('span');
  count.className = 'tab-import-lane-count';
  count.textContent = `${ids.length} ${ids.length === 1 ? 'tab' : 'tabs'}`;
  headingRow.append(heading, count);
  section.append(headingRow);
  const list = document.createElement('div');
  list.className = 'row-list';
  if (!ids.length) {
    const empty = document.createElement('p');
    empty.className = 'section-hint';
    empty.textContent = 'No tabs here.';
    list.append(empty);
  } else {
    for (const id of ids) {
      const candidate = byId.get(id);
      if (candidate) list.append(organizeRow(candidate));
    }
  }
  section.append(list);
  return section;
}

function renderOrganize() {
  organizeBoardEl.replaceChildren();
  if (!proposal) return;
  const issue = dispositionIssue();
  continueToReviewBtn.disabled = !!issue;
  if (issue) {
    const warning = document.createElement('p');
    warning.className = 'tab-import-review-warning';
    warning.textContent = issue;
    organizeBoardEl.append(warning);
  }
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const group of proposal.groups) organizeBoardEl.append(groupSection(group, byId));
  organizeBoardEl.append(laneSection('ungrouped', proposal.ungroupedCandidateIds, byId));
  const excluded = candidates.filter((candidate) => candidate.excluded)
    .map((candidate) => candidate.candidateId);
  if (excluded.length) organizeBoardEl.append(laneSection('left out', excluded, byId, 'excluded'));
}

function createGroup(name) {
  const normalized = normalizeReviewGroupName(name);
  const issue = groupNameError(normalized, '__new__');
  if (issue) {
    setStatus(issue);
    newGroupNameEl.focus();
    return;
  }
  proposal.groups.push({
    suggestionId: `manual-${crypto.randomUUID()}`,
    name: normalized,
    candidateIds: [],
    confidence: 'review',
  });
  newGroupNameEl.value = '';
  setStatus(`Created ${normalized}. Move at least two tabs into it.`);
  renderOrganize();
}

function renderReview() {
  reviewSummaryEl.replaceChildren();
  const counts = reviewCounts(proposal);
  const metrics = document.createElement('div');
  metrics.className = 'tab-import-summary-metrics';
  for (const [value, label] of [
    [counts.tabs, counts.tabs === 1 ? 'quiet tab' : 'quiet tabs'],
    [counts.groups, counts.groups === 1 ? 'Named Group' : 'Named Groups'],
    [counts.ungrouped, 'ungrouped'],
  ]) {
    const metric = document.createElement('div');
    const number = document.createElement('strong');
    number.textContent = String(value);
    const caption = document.createElement('span');
    caption.textContent = label;
    metric.append(number, caption);
    metrics.append(metric);
  }
  reviewSummaryEl.append(metrics);
  if (proposal.groups.length) {
    const list = document.createElement('ul');
    list.className = 'tab-import-summary-groups';
    for (const group of proposal.groups) {
      const item = document.createElement('li');
      item.textContent = `${group.name} · ${group.candidateIds.length} tabs`;
      list.append(item);
    }
    reviewSummaryEl.append(list);
  }
  applyBtn.textContent = tabImportApplyLabel(counts);
  applyBtn.disabled = !!dispositionIssue();
}

function continueToReview() {
  const issue = dispositionIssue();
  if (issue) {
    setStatus(issue);
    renderOrganize();
    return;
  }
  renderReview();
  setStep('review');
  setStatus();
}

async function applyImport() {
  if (!sessionId || !proposal || dispositionIssue()) return;
  applyBtn.disabled = true;
  setStatus('Opening your tabs…');
  try {
    const request = tabImportApplyRequest();
    if (pendingApplyPhase === 'activation') request.retryActivation = true;
    const result = await api.apply(sessionId, request);
    if (result.retryable && result.phase === 'activation') {
      pendingApplyPhase = 'activation';
      generation = result.generation ?? generation;
      setStatus('Your tabs are ready, but Blanc could not focus the first one.');
      applyBtn.textContent = 'Focus the first imported tab';
      applyBtn.disabled = false;
      return;
    }
    if (result.ok) {
      sessionId = null;
      proposal = null;
      originalProposal = null;
      setStatus();
      return;
    }
    setStatus("Blanc couldn't open these tabs. Nothing was partially imported.");
    applyBtn.disabled = false;
  } catch {
    setStatus("Blanc couldn't open these tabs. Nothing was partially imported.");
    applyBtn.disabled = false;
  }
}

el('tabImportSelectAll').addEventListener('click', () => selectAll(true));
el('tabImportSelectNone').addEventListener('click', () => selectAll(false));
el('tabImportBackToSource').addEventListener('click', () => returnToSource());
continueToOrganizeBtn.addEventListener('click', () => beginOrganize());
el('tabImportNewGroupForm').addEventListener('submit', (event) => {
  event.preventDefault();
  createGroup(newGroupNameEl.value);
});
el('tabImportBackToTabs').addEventListener('click', () => {
  proposal = null;
  originalProposal = null;
  renderTabs();
  setStep('tabs');
  setStatus();
});
continueToReviewBtn.addEventListener('click', () => continueToReview());
el('tabImportBackToOrganize').addEventListener('click', () => {
  renderOrganize();
  setStep('organize');
  setStatus();
});
applyBtn.addEventListener('click', () => applyImport());

wrapSurfaceClose();
setStep('source');
loadSources();
