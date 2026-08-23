// Bring Your Tabs utility sheet — multi-step shell. Step state only; IPC lands in Task 8+.
/** @typedef {'source' | 'folder' | 'preview' | 'review'} TabImportStep */

const STEPS = /** @type {const} */ (['source', 'folder', 'preview', 'review']);

/** @type {TabImportStep} */
let step = 'source';

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

renderStep();
