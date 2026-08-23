// Bring Your Tabs — source picker, folder tree, candidate preview, folder review.
/** @typedef {'source' | 'folder' | 'preview' | 'review'} TabImportStep */

const STEPS = /** @type {const} */ (['source', 'folder', 'preview', 'review']);
const FOLDER_HINTS = ['tab reset', 'open tabs', 'session', 'to migrate'];
const MAX_GROUP_NAME_LENGTH = 40;
const GENERIC_GROUP_NAMES = new Set([
  'misc', 'stuff', 'other', 'other 2', 'imported tabs', 'imported', 'tabs',
  'bookmarks', 'untitled', 'group', 'folder',
]);
const UNGROUPED_LANE = '__ungrouped__';
const EXCLUDED_LANE = '__excluded__';

const api = window.bowserPages?.tabImport;
const surface = window.bowserPages?.surface;

const statusEl = document.getElementById('tabImportStatus');
const sourceListEl = document.getElementById('tabImportSourceList');
const fileBtn = document.getElementById('tabImportFileBtn');
const folderTreeEl = document.getElementById('tabImportFolderTree');
const folderContinueBtn = document.getElementById('tabImportFolderContinue');
const previewListEl = document.getElementById('tabImportPreviewList');
const selectAllBtn = document.getElementById('tabImportSelectAll');
const selectNoneBtn = document.getElementById('tabImportSelectNone');
const duplicateBadgeEl = document.getElementById('tabImportDuplicateBadge');
const useFoldersBtn = document.getElementById('tabImportUseFolders');
const reviewBoardEl = document.getElementById('tabImportReviewBoard');
const backToPreviewBtn = document.getElementById('tabImportBackToPreview');
const applyBtn = document.getElementById('tabImportApplyBtn');

/** @type {TabImportStep} */
let step = 'source';
let sessionId = null;
let generation = null;
/** @type {string | null} */
let selectedFolderId = null;
/** @type {Array<{ folderId: string, name: string, pathLabels: string[], childFolderIds: string[], subtreeHttpCount: number }>} */
let folders = [];
/** @type {string[]} */
let rootFolderIds = [];
/** @type {Array<{ candidateId: string, title: string, hostname: string, folderPath: string[], selected: boolean, excluded: boolean }>} */
let candidates = [];
let duplicateCount = 0;
/** @type {{ version: number, groups: Array<{ suggestionId: string, name: string, candidateIds: string[], confidence?: string }>, ungroupedCandidateIds: string[] } | null} */
let proposal = null;
let originalProposal = null;
let selectionSync = 0;
/** @type {null | 'activation' | 'favorites'} */
let pendingApplyPhase = null;

function cloneProposal(value) {
  if (!value) return null;
  return {
    version: value.version,
    groups: (value.groups ?? []).map((group) => ({
      ...group,
      candidateIds: [...(group.candidateIds ?? [])],
    })),
    ungroupedCandidateIds: [...(value.ungroupedCandidateIds ?? [])],
  };
}

function normalizeReviewGroupName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function reviewGroupNameError(value, reviewProposal, currentSuggestionId) {
  const name = normalizeReviewGroupName(value);
  if (!name) return 'Type a group name.';
  if ([...name].length > MAX_GROUP_NAME_LENGTH) {
    return `Keep group names to ${MAX_GROUP_NAME_LENGTH} characters.`;
  }
  if (GENERIC_GROUP_NAMES.has(name)) return 'Choose a more specific group name.';
  const duplicate = (reviewProposal?.groups ?? []).some((group) =>
    group.suggestionId !== currentSuggestionId
      && normalizeReviewGroupName(group.name) === name);
  return duplicate ? 'That group name is already in use.' : '';
}

function proposalLaneFor(reviewProposal, candidateId) {
  for (const group of reviewProposal?.groups ?? []) {
    if (group.candidateIds.includes(candidateId)) return group.suggestionId;
  }
  if (reviewProposal?.ungroupedCandidateIds?.includes(candidateId)) return UNGROUPED_LANE;
  return null;
}

function removeCandidateFromProposal(reviewProposal, candidateId) {
  for (const group of reviewProposal?.groups ?? []) {
    group.candidateIds = group.candidateIds.filter((id) => id !== candidateId);
  }
  reviewProposal.groups = (reviewProposal?.groups ?? [])
    .filter((group) => group.candidateIds.length > 0);
  reviewProposal.ungroupedCandidateIds = (reviewProposal?.ungroupedCandidateIds ?? [])
    .filter((id) => id !== candidateId);
}

function moveCandidateInProposal(reviewProposal, candidateId, lane) {
  const targetGroup = lane !== UNGROUPED_LANE && lane !== EXCLUDED_LANE
    ? reviewProposal.groups.find((candidate) => candidate.suggestionId === lane)
    : null;
  removeCandidateFromProposal(reviewProposal, candidateId);
  if (lane === EXCLUDED_LANE) return true;
  if (lane === UNGROUPED_LANE) {
    reviewProposal.ungroupedCandidateIds.push(candidateId);
    return true;
  }
  let group = reviewProposal.groups.find((candidate) => candidate.suggestionId === lane);
  // Moving the sole remaining tab out and then restoring it can temporarily
  // remove its original column. Re-add that same suggestion record rather
  // than inventing a new group identity.
  if (!group && targetGroup) {
    group = { ...targetGroup, candidateIds: [] };
    reviewProposal.groups.push(group);
  }
  if (!group) return false;
  group.candidateIds.push(candidateId);
  return true;
}

function reviewProposalIssue(reviewProposal, reviewCandidates) {
  if (!reviewProposal || reviewProposal.version !== 1) return 'Groups are unavailable.';
  const expected = reviewCandidates
    .filter((candidate) => candidate.selected && !candidate.excluded)
    .map((candidate) => candidate.candidateId);
  if (!expected.length) return 'Select at least one tab.';
  const expectedSet = new Set(expected);
  const seen = new Set();
  const names = new Set();
  for (const group of reviewProposal.groups ?? []) {
    const nameError = reviewGroupNameError(group.name, reviewProposal, group.suggestionId);
    if (nameError) return nameError;
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
  const grouped = (reviewProposal?.groups ?? [])
    .reduce((count, group) => count + group.candidateIds.length, 0);
  const ungrouped = reviewProposal?.ungroupedCandidateIds?.length ?? 0;
  return { tabs: grouped + ungrouped, groups: reviewProposal?.groups?.length ?? 0, ungrouped };
}

function tabImportApplyLabel({ tabs, groups, ungrouped }) {
  const tabWord = tabs === 1 ? 'tab' : 'tabs';
  const groupWord = groups === 1 ? 'group' : 'groups';
  return ungrouped > 0
    ? `Open ${tabs} ${tabWord} in ${groups} ${groupWord} · ${ungrouped} ungrouped`
    : `Open ${tabs} ${tabWord} in ${groups} ${groupWord}`;
}

function tabImportApplyRequest(reviewProposal, currentGeneration) {
  return {
    generation: currentGeneration,
    groups: (reviewProposal?.groups ?? []).map((group) => ({
      name: normalizeReviewGroupName(group.name),
      candidateIds: [...group.candidateIds],
    })),
    ungroupedCandidateIds: [...(reviewProposal?.ungroupedCandidateIds ?? [])],
  };
}

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message ?? '';
}

function setStep(next) {
  if (!STEPS.includes(next)) return;
  step = next;
  renderStep();
}

function renderStep() {
  for (const panel of document.querySelectorAll('[data-step-panel]')) {
    panel.hidden = panel.dataset.stepPanel !== step;
  }
  for (const marker of document.querySelectorAll('[data-step-marker]')) {
    marker.classList.toggle('current', marker.dataset.stepMarker === step);
  }
}

function candidateMap() {
  return new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
}

function folderHintMatch(folder) {
  const name = String(folder.name ?? '').trim().toLowerCase();
  return FOLDER_HINTS.some((hint) => name === hint || name.includes(hint));
}

function formatFolderPath(pathLabels) {
  return Array.isArray(pathLabels) ? pathLabels.join(' / ') : '';
}

function resetFlow({ keepStatus = false } = {}) {
  sessionId = null;
  generation = null;
  selectedFolderId = null;
  folders = [];
  rootFolderIds = [];
  candidates = [];
  duplicateCount = 0;
  proposal = null;
  originalProposal = null;
  pendingApplyPhase = null;
  if (!keepStatus) setStatus('');
  renderSourcesLoading();
  folderTreeEl.replaceChildren();
  folderContinueBtn.disabled = true;
  previewListEl.replaceChildren();
  duplicateBadgeEl.hidden = true;
  reviewBoardEl.replaceChildren();
  applyBtn.disabled = true;
  setStep('source');
}

async function cancelSession() {
  if (!sessionId || !api) return;
  try {
    await api.cancel(sessionId);
  } catch {
    // Sheet dismissal still proceeds if cancel fails.
  }
}

async function dismissSheet() {
  await cancelSession();
  resetFlow();
  if (surface?.close) await surface.close();
}

function wrapSurfaceClose() {
  if (!surface?.close) return;
  const originalClose = surface.close.bind(surface);
  surface.close = async () => {
    await cancelSession();
    resetFlow();
    return originalClose();
  };
}

function renderSourcesLoading() {
  sourceListEl.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'section-hint';
  loading.textContent = 'Loading browser profiles…';
  sourceListEl.append(loading);
}

function renderSourceButtons(result) {
  const sources = result?.sources ?? [];
  const unavailable = result?.unavailable ?? [];
  sourceListEl.replaceChildren();
  if (!sources.length && !unavailable.length) {
    const empty = document.createElement('p');
    empty.className = 'section-hint';
    empty.textContent = 'No other browser profiles found on this device.';
    sourceListEl.append(empty);
    return;
  }
  for (const source of sources) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-import-source-btn';
    btn.textContent = source.label;
    btn.addEventListener('click', () => openBrowserSource(source.id, source.label));
    sourceListEl.append(btn);
  }
  for (const entry of unavailable) {
    const row = document.createElement('div');
    row.className = 'tab-import-source-unavailable';
    const name = document.createElement('span');
    name.className = 'tab-import-source-unavailable-name';
    name.textContent = entry.label;
    const hint = document.createElement('p');
    hint.className = 'tab-import-source-unavailable-hint';
    hint.textContent = entry.guidance ?? '';
    row.append(name, hint);
    sourceListEl.append(row);
  }
}

async function loadSources() {
  if (!api) return;
  renderSourcesLoading();
  try {
    const result = await api.sources();
    renderSourceButtons(result);
  } catch {
    sourceListEl.replaceChildren();
    const err = document.createElement('p');
    err.className = 'section-hint';
    err.textContent = "Couldn't load browser profiles.";
    sourceListEl.append(err);
  }
}

async function handleSessionError(result) {
  if (result?.error === 'session-unavailable') {
    setStatus('This import session expired. Start again from a source.');
    await cancelSession();
    resetFlow({ keepStatus: true });
    await loadSources();
    return true;
  }
  return false;
}

async function openBrowserSource(id, label) {
  if (!api) return;
  setStatus(`Reading ${label}…`);
  fileBtn.disabled = true;
  try {
    const opened = await api.openSource(id);
    if (await handleSessionError(opened)) return;
    if (opened.error === 'source-unavailable') {
      setStatus('That browser profile is no longer available.');
      await loadSources();
      return;
    }
    if (opened.error === 'too-large') {
      setStatus('That browser profile is too large to import safely.');
      return;
    }
    if (opened.error === 'unreadable' || opened.error === 'empty') {
      setStatus('No bookmarks found in that profile.');
      return;
    }
    if (opened.error) {
      setStatus("Couldn't read that browser profile.");
      return;
    }
    beginFolderStep(opened);
    setStatus('');
  } finally {
    fileBtn.disabled = false;
  }
}

async function openBookmarksFile() {
  if (!api) return;
  setStatus('Choose a bookmarks file…');
  fileBtn.disabled = true;
  try {
    const opened = await api.openFile();
    if (opened.cancelled) {
      setStatus('');
      return;
    }
    if (await handleSessionError(opened)) return;
    if (opened.error === 'too-large') {
      setStatus('That file is too large to import.');
      return;
    }
    if (opened.error === 'unreadable') {
      setStatus("Couldn't read that file.");
      return;
    }
    if (opened.error === 'empty') {
      setStatus('No bookmarks found in that file.');
      return;
    }
    if (opened.error) {
      setStatus("Couldn't import that file.");
      return;
    }
    beginFolderStep(opened);
    setStatus('');
  } finally {
    fileBtn.disabled = false;
  }
}

function beginFolderStep(opened) {
  sessionId = opened.sessionId;
  generation = opened.generation ?? null;
  folders = opened.folders ?? [];
  rootFolderIds = opened.rootFolderIds ?? [];
  selectedFolderId = null;
  candidates = [];
  duplicateCount = 0;
  proposal = null;
  originalProposal = null;
  pendingApplyPhase = null;
  renderFolderTree();
  folderContinueBtn.disabled = true;
  setStep('folder');
}

function renderFolderTree() {
  folderTreeEl.replaceChildren();
  const byId = new Map(folders.map((folder) => [folder.folderId, folder]));

  function renderNodes(folderIds) {
    const list = document.createElement('ul');
    list.className = 'tab-import-folder-children';
    for (const folderId of folderIds) {
      const folder = byId.get(folderId);
      if (!folder) continue;
      const item = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tab-import-folder-row';
      if (folderHintMatch(folder)) row.classList.add('hint');
      if (selectedFolderId === folder.folderId) row.classList.add('selected');
      const count = Number(folder.subtreeHttpCount) || 0;
      row.textContent = `${folder.name} (${count})`;
      row.title = formatFolderPath(folder.pathLabels);
      row.addEventListener('click', () => {
        selectedFolderId = folder.folderId;
        folderContinueBtn.disabled = false;
        renderFolderTree();
      });
      item.append(row);
      if (folder.childFolderIds?.length) item.append(renderNodes(folder.childFolderIds));
      list.append(item);
    }
    return list;
  }

  if (!rootFolderIds.length) {
    const empty = document.createElement('p');
    empty.className = 'section-hint';
    empty.textContent = 'No folders found in this source.';
    folderTreeEl.append(empty);
    return;
  }
  folderTreeEl.append(renderNodes(rootFolderIds));
}

async function continueWithFolder() {
  if (!api || !sessionId || !selectedFolderId) return;
  folderContinueBtn.disabled = true;
  setStatus('Loading pages from this folder…');
  try {
    const result = await api.selectFolder(sessionId, selectedFolderId);
    if (await handleSessionError(result)) return;
    if (result.error === 'too-many-candidates') {
      setStatus('This folder has more than 500 pages. Choose a smaller folder before continuing.');
      return;
    }
    if (result.error === 'empty') {
      setStatus('No pages found in this folder.');
      return;
    }
    if (result.error) {
      setStatus("Couldn't read this folder.");
      return;
    }
    candidates = result.candidates ?? [];
    generation = result.generation ?? generation;
    duplicateCount = Number(result.duplicateCount) || 0;
    proposal = null;
    originalProposal = null;
    renderPreview();
    setStep('preview');
    setStatus('');
  } finally {
    folderContinueBtn.disabled = !selectedFolderId;
  }
}

function selectionPayload() {
  const selectedIds = candidates
    .filter((candidate) => candidate.selected && !candidate.excluded)
    .map((candidate) => candidate.candidateId);
  const excludedIds = candidates
    .filter((candidate) => candidate.excluded)
    .map((candidate) => candidate.candidateId);
  return { selectedIds, excludedIds };
}

async function syncSelection({ invalidateProposal = true } = {}) {
  if (!api || !sessionId) return;
  const ticket = ++selectionSync;
  const payload = selectionPayload();
  let result;
  try {
    result = await api.setSelection(sessionId, payload);
  } catch {
    if (ticket === selectionSync) setStatus("Couldn't update that tab selection.");
    return null;
  }
  if (ticket !== selectionSync) return;
  if (await handleSessionError(result)) return;
  if (result?.error) {
    setStatus("Couldn't update that tab selection.");
    return null;
  }
  generation = result.generation ?? generation;
  if (result.candidates) candidates = result.candidates;
  if (invalidateProposal) {
    proposal = null;
    originalProposal = null;
  }
  return result;
}

function renderPreview() {
  previewListEl.replaceChildren();
  duplicateBadgeEl.hidden = duplicateCount <= 0;
  duplicateBadgeEl.textContent = duplicateCount > 0
    ? `${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} removed`
    : '';

  for (const candidate of candidates) {
    const row = document.createElement('div');
    row.className = 'row tab-import-preview-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tab-import-row-check';
    checkbox.checked = candidate.selected && !candidate.excluded;
    checkbox.setAttribute(
      'aria-label',
      `Include ${candidate.title || candidate.hostname || 'untitled tab'}`,
    );
    checkbox.addEventListener('change', async () => {
      candidate.selected = checkbox.checked;
      if (checkbox.checked) candidate.excluded = false;
      await syncSelection();
      updatePreviewActions();
    });

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = candidate.title || candidate.hostname || 'Untitled';
    const meta = document.createElement('span');
    meta.className = 'meta';
    const folderPath = candidate.folderPath?.length
      ? candidate.folderPath.join(' / ')
      : 'root';
    meta.textContent = `${candidate.hostname || 'site'} · ${folderPath}`;
    main.append(title, meta);

    row.append(checkbox, main);
    previewListEl.append(row);
  }
  updatePreviewActions();
}

function selectedCandidateCount() {
  return candidates.filter((candidate) => candidate.selected && !candidate.excluded).length;
}

function updatePreviewActions() {
  const count = selectedCandidateCount();
  useFoldersBtn.disabled = count < 1;
}

async function selectAllCandidates() {
  for (const candidate of candidates) {
    candidate.selected = true;
    candidate.excluded = false;
  }
  renderPreview();
  await syncSelection();
}

async function selectNoCandidates() {
  for (const candidate of candidates) {
    candidate.selected = false;
    candidate.excluded = false;
  }
  renderPreview();
  await syncSelection();
}

async function suggestFromFolders() {
  if (!api || !sessionId) return;
  useFoldersBtn.disabled = true;
  setStatus('Organizing from bookmark folders…');
  try {
    const result = await api.suggestFolders(sessionId);
    if (await handleSessionError(result)) return;
    if (result.error === 'invalid-proposal') {
      setStatus('Folder groups could not be built. Try a different folder.');
      return;
    }
    if (result.error) {
      setStatus("Couldn't build folder groups.");
      return;
    }
    proposal = cloneProposal(result.proposal);
    originalProposal = cloneProposal(result.proposal);
    renderReview();
    setStep('review');
    setStatus('');
  } finally {
    updatePreviewActions();
  }
}

function currentReviewLane(candidate) {
  return candidate.excluded ? EXCLUDED_LANE : proposalLaneFor(proposal, candidate.candidateId);
}

function originalReviewLane(candidateId) {
  return proposalLaneFor(originalProposal, candidateId) ?? UNGROUPED_LANE;
}

function ensureOriginalGroup(candidateId) {
  const lane = originalReviewLane(candidateId);
  if (lane === UNGROUPED_LANE || proposal.groups.some((group) => group.suggestionId === lane)) {
    return lane;
  }
  const original = originalProposal?.groups?.find((group) => group.suggestionId === lane);
  if (original) proposal.groups.push({ ...original, candidateIds: [] });
  return lane;
}

async function changeReviewLane(candidateId, lane, { restoring = false } = {}) {
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  if (!proposal || !candidate) return;
  const previousProposal = cloneProposal(proposal);
  const previousSelection = { selected: candidate.selected, excluded: candidate.excluded };
  const selectionChanged = lane === EXCLUDED_LANE || candidate.excluded || !candidate.selected;
  candidate.excluded = lane === EXCLUDED_LANE;
  candidate.selected = lane !== EXCLUDED_LANE;
  if (!moveCandidateInProposal(proposal, candidateId, lane)) {
    proposal = previousProposal;
    candidate.selected = previousSelection.selected;
    candidate.excluded = previousSelection.excluded;
    setStatus("Couldn't move that tab.");
    renderReview();
    return;
  }
  if (selectionChanged) {
    const synced = await syncSelection({ invalidateProposal: false });
    if (!synced) {
      proposal = previousProposal;
      const current = candidates.find((item) => item.candidateId === candidateId);
      if (current) Object.assign(current, previousSelection);
      renderReview();
      return;
    }
  }
  const label = candidate.title || candidate.hostname || 'Tab';
  setStatus(restoring
    ? `Restored the original suggestion for ${label}.`
    : lane === EXCLUDED_LANE
      ? `Excluded ${label}.`
      : lane === UNGROUPED_LANE
        ? `Moved ${label} to ungrouped.`
        : `Moved ${label}.`);
  renderReview();
}

async function restoreCandidateSuggestion(candidateId) {
  const lane = ensureOriginalGroup(candidateId);
  await changeReviewLane(candidateId, lane, { restoring: true });
}

function reviewMoveSelect(candidate) {
  const select = document.createElement('select');
  select.className = 'tab-import-move-select';
  const label = candidate.title || candidate.hostname || 'tab';
  select.setAttribute('aria-label', `Move ${label}`);
  for (const group of proposal.groups) {
    const option = document.createElement('option');
    option.value = group.suggestionId;
    option.textContent = `group: ${group.name}`;
    select.append(option);
  }
  const ungrouped = document.createElement('option');
  ungrouped.value = UNGROUPED_LANE;
  ungrouped.textContent = 'ungrouped';
  const excluded = document.createElement('option');
  excluded.value = EXCLUDED_LANE;
  excluded.textContent = 'exclude from import';
  select.append(ungrouped, excluded);
  select.value = currentReviewLane(candidate) ?? UNGROUPED_LANE;
  select.addEventListener('change', () => changeReviewLane(candidate.candidateId, select.value));
  return select;
}

function reviewCandidateRow(candidate) {
  const row = document.createElement('div');
  row.className = 'row tab-import-review-row';
  const main = document.createElement('div');
  main.className = 'main';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = candidate.title || candidate.hostname || 'Untitled';
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = candidate.hostname || 'site';
  main.append(title, meta);
  const actions = document.createElement('div');
  actions.className = 'tab-import-review-actions';
  actions.append(reviewMoveSelect(candidate));
  if (currentReviewLane(candidate) !== originalReviewLane(candidate.candidateId)) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'tab-import-restore-btn';
    restore.textContent = 'restore suggestion';
    restore.setAttribute('aria-label', `Restore original suggestion for ${title.textContent}`);
    restore.addEventListener('click', () => restoreCandidateSuggestion(candidate.candidateId));
    actions.append(restore);
  }
  row.append(main, actions);
  return row;
}

function commitReviewGroupName(group, input, error) {
  const issue = reviewGroupNameError(input.value, proposal, group.suggestionId);
  input.setCustomValidity(issue);
  error.textContent = issue;
  if (issue) {
    applyBtn.disabled = true;
    return false;
  }
  const nextName = normalizeReviewGroupName(input.value);
  if (nextName === group.name) return true;
  group.name = nextName;
  setStatus(`Renamed group to ${nextName}.`);
  renderReview();
  return true;
}

function reviewGroupSection(group, byId) {
  const section = document.createElement('section');
  section.className = 'tab-import-review-group';
  section.dataset.confidence = group.confidence === 'review' ? 'review' : 'solid';

  const heading = document.createElement('div');
  heading.className = 'tab-import-review-heading';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-import-group-name';
  input.value = group.name;
  input.maxLength = MAX_GROUP_NAME_LENGTH;
  input.setAttribute('aria-label', `Rename ${group.name} group`);
  const confidence = document.createElement('span');
  confidence.className = `tab-import-confidence ${group.confidence === 'review' ? 'review' : 'solid'}`;
  confidence.textContent = group.confidence === 'review' ? 'needs a look' : 'solid';
  heading.append(input, confidence);

  const error = document.createElement('p');
  error.className = 'tab-import-name-error';
  error.id = `tabImportNameError-${group.suggestionId}`;
  error.setAttribute('aria-live', 'polite');
  input.setAttribute('aria-describedby', error.id);
  input.addEventListener('input', () => {
    const issue = reviewGroupNameError(input.value, proposal, group.suggestionId);
    input.setCustomValidity(issue);
    error.textContent = issue;
    applyBtn.disabled = !!issue || !!reviewProposalIssue(proposal, candidates);
  });
  input.addEventListener('change', () => commitReviewGroupName(group, input, error));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitReviewGroupName(group, input, error);
  });
  section.append(heading, error);

  if (group.candidateIds.length < 2) {
    const warning = document.createElement('p');
    warning.className = 'tab-import-group-warning';
    warning.textContent = 'Move at least one more tab here, or move this tab to another lane.';
    section.append(warning);
  }
  const list = document.createElement('div');
  list.className = 'row-list';
  for (const candidateId of group.candidateIds) {
    const candidate = byId.get(candidateId);
    if (candidate) list.append(reviewCandidateRow(candidate));
  }
  section.append(list);
  return section;
}

function reviewLaneSection(name, candidateIds, byId, { emptyCopy, className = '' } = {}) {
  const section = document.createElement('section');
  section.className = `tab-import-review-group tab-import-review-lane ${className}`.trim();
  const heading = document.createElement('h3');
  heading.className = 'section-title';
  heading.textContent = name;
  section.append(heading);
  if (!candidateIds.length) {
    const empty = document.createElement('p');
    empty.className = 'section-hint';
    empty.textContent = emptyCopy;
    section.append(empty);
    return section;
  }
  const list = document.createElement('div');
  list.className = 'row-list';
  for (const candidateId of candidateIds) {
    const candidate = byId.get(candidateId);
    if (candidate) list.append(reviewCandidateRow(candidate));
  }
  section.append(list);
  return section;
}

function renderReview() {
  reviewBoardEl.replaceChildren();
  if (!proposal) return;
  const byId = candidateMap();
  const counts = reviewCounts(proposal);
  const issue = reviewProposalIssue(proposal, candidates);
  applyBtn.disabled = !!issue;
  if (proposal) applyBtn.textContent = tabImportApplyLabel(counts);

  if (issue) {
    const warning = document.createElement('p');
    warning.className = 'tab-import-review-warning';
    warning.setAttribute('role', 'status');
    warning.textContent = issue;
    reviewBoardEl.append(warning);
  }
  for (const group of proposal.groups ?? []) {
    reviewBoardEl.append(reviewGroupSection(group, byId));
  }
  reviewBoardEl.append(reviewLaneSection(
    'ungrouped',
    proposal.ungroupedCandidateIds ?? [],
    byId,
    { emptyCopy: 'No tabs are ungrouped.' },
  ));
  const excludedIds = candidates
    .filter((candidate) => candidate.excluded)
    .map((candidate) => candidate.candidateId);
  if (excludedIds.length) {
    reviewBoardEl.append(reviewLaneSection(
      'excluded',
      excludedIds,
      byId,
      { emptyCopy: '', className: 'excluded' },
    ));
  }
}

async function tryApply() {
  if (!api || !sessionId || !proposal) return;
  const issue = reviewProposalIssue(proposal, candidates);
  if (issue) {
    setStatus(issue);
    renderReview();
    return;
  }
  applyBtn.disabled = true;
  setStatus('Applying…');
  try {
    const request = tabImportApplyRequest(proposal, generation);
    if (pendingApplyPhase === 'favorites') {
      request.retryFavorites = true;
    } else if (pendingApplyPhase === 'activation') {
      request.retryActivation = true;
    }
    const result = await api.apply(sessionId, request);
    if (await handleSessionError(result)) return;
    if (result.error) {
      setStatus("Couldn't apply this import.");
      return;
    }
    if (result.retryable && result.phase === 'activation') {
      pendingApplyPhase = 'activation';
      generation = result.generation ?? generation;
      setStatus('Tabs are ready, but Blanc could not focus the first one. Try again.');
      applyBtn.textContent = 'Retry focusing first tab';
      applyBtn.disabled = false;
      return;
    }
    if (result.retryable && result.phase === 'favorites') {
      pendingApplyPhase = 'favorites';
      generation = result.generation ?? generation;
      setStatus('Tabs are open, but favorites could not be saved. Try again.');
      applyBtn.textContent = 'Retry saving favorites';
      applyBtn.disabled = false;
      return;
    }
    if (result.ok) {
      pendingApplyPhase = null;
      sessionId = null;
      proposal = null;
      originalProposal = null;
      setStatus('');
      return;
    }
    setStatus("Couldn't apply this import.");
  } finally {
    if (proposal && pendingApplyPhase === null) {
      applyBtn.disabled = !!reviewProposalIssue(proposal, candidates);
    }
  }
}

fileBtn.addEventListener('click', () => openBookmarksFile());
folderContinueBtn.addEventListener('click', () => continueWithFolder());
selectAllBtn.addEventListener('click', () => selectAllCandidates());
selectNoneBtn.addEventListener('click', () => selectNoCandidates());
useFoldersBtn.addEventListener('click', () => suggestFromFolders());
backToPreviewBtn.addEventListener('click', () => {
  proposal = null;
  originalProposal = null;
  pendingApplyPhase = null;
  setStep('preview');
  setStatus('');
});
applyBtn.addEventListener('click', () => tryApply());

wrapSurfaceClose();
renderStep();
loadSources();
