// Bring Your Tabs — source picker, folder tree, candidate preview, folder review.
/** @typedef {'source' | 'folder' | 'preview' | 'review'} TabImportStep */

const STEPS = /** @type {const} */ (['source', 'folder', 'preview', 'review']);
const FOLDER_HINTS = ['tab reset', 'open tabs', 'session', 'to migrate'];

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
let selectionSync = 0;

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
  selectedFolderId = null;
  folders = [];
  rootFolderIds = [];
  candidates = [];
  duplicateCount = 0;
  proposal = null;
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

function renderSourceButtons(sources) {
  sourceListEl.replaceChildren();
  if (!sources.length) {
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
}

async function loadSources() {
  if (!api) return;
  renderSourcesLoading();
  try {
    const sources = await api.sources();
    renderSourceButtons(sources);
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
  folders = opened.folders ?? [];
  rootFolderIds = opened.rootFolderIds ?? [];
  selectedFolderId = null;
  candidates = [];
  duplicateCount = 0;
  proposal = null;
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
    duplicateCount = Number(result.duplicateCount) || 0;
    proposal = null;
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

async function syncSelection() {
  if (!api || !sessionId) return;
  const ticket = ++selectionSync;
  const payload = selectionPayload();
  const result = await api.setSelection(sessionId, payload);
  if (ticket !== selectionSync) return;
  if (await handleSessionError(result)) return;
  if (result.candidates) candidates = result.candidates;
  proposal = null;
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
    proposal = result.proposal;
    renderReview();
    setStep('review');
    setStatus('');
  } finally {
    updatePreviewActions();
  }
}

function renderReview() {
  reviewBoardEl.replaceChildren();
  if (!proposal) return;

  const byId = candidateMap();
  const selectedCount = selectedCandidateCount();
  const groupCount = proposal.groups?.length ?? 0;
  const ungroupedCount = proposal.ungroupedCandidateIds?.length ?? 0;
  applyBtn.disabled = selectedCount === 0;
  applyBtn.textContent = ungroupedCount > 0
    ? `Open ${selectedCount} tabs in ${groupCount} groups · ${ungroupedCount} ungrouped`
    : `Open ${selectedCount} tabs in ${groupCount} groups`;

  for (const group of proposal.groups ?? []) {
    const section = document.createElement('section');
    section.className = 'tab-import-review-group';
    const heading = document.createElement('h3');
    heading.className = 'section-title';
    heading.textContent = group.name;
    if (group.confidence === 'review') {
      const tag = document.createElement('span');
      tag.className = 'tab-import-confidence';
      tag.textContent = 'needs a look';
      heading.append(' ', tag);
    }
    section.append(heading);
    const list = document.createElement('div');
    list.className = 'row-list';
    for (const candidateId of group.candidateIds) {
      const candidate = byId.get(candidateId);
      if (!candidate) continue;
      const row = document.createElement('div');
      row.className = 'row';
      const main = document.createElement('div');
      main.className = 'main';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = candidate.title || candidate.hostname || 'Untitled';
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = candidate.hostname || 'site';
      main.append(title, meta);
      row.append(main);
      list.append(row);
    }
    section.append(list);
    reviewBoardEl.append(section);
  }

  if (ungroupedCount > 0) {
    const section = document.createElement('section');
    section.className = 'tab-import-review-group';
    const heading = document.createElement('h3');
    heading.className = 'section-title';
    heading.textContent = 'ungrouped';
    section.append(heading);
    const list = document.createElement('div');
    list.className = 'row-list';
    for (const candidateId of proposal.ungroupedCandidateIds) {
      const candidate = byId.get(candidateId);
      if (!candidate) continue;
      const row = document.createElement('div');
      row.className = 'row';
      const main = document.createElement('div');
      main.className = 'main';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = candidate.title || candidate.hostname || 'Untitled';
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = candidate.hostname || 'site';
      main.append(title, meta);
      row.append(main);
      list.append(row);
    }
    section.append(list);
    reviewBoardEl.append(section);
  }
}

async function tryApply() {
  if (!api || !sessionId || !proposal) return;
  applyBtn.disabled = true;
  setStatus('Applying…');
  try {
    const result = await api.apply(sessionId, { proposal });
    if (await handleSessionError(result)) return;
    if (result.error === 'apply-unavailable') {
      setStatus('Apply lands in Task 11 — groups are ready to review.');
      return;
    }
    if (result.error) {
      setStatus("Couldn't apply this import.");
      return;
    }
    setStatus('Import applied.');
    await dismissSheet();
  } finally {
    applyBtn.disabled = selectedCandidateCount() === 0;
  }
}

fileBtn.addEventListener('click', () => openBookmarksFile());
folderContinueBtn.addEventListener('click', () => continueWithFolder());
selectAllBtn.addEventListener('click', () => selectAllCandidates());
selectNoneBtn.addEventListener('click', () => selectNoCandidates());
useFoldersBtn.addEventListener('click', () => suggestFromFolders());
backToPreviewBtn.addEventListener('click', () => {
  proposal = null;
  setStep('preview');
  setStatus('');
});
applyBtn.addEventListener('click', () => tryApply());

wrapSurfaceClose();
renderStep();
loadSources();
