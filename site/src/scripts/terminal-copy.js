// The Homebrew command's Copy button on /download. Without scripting the
// button stays hidden and the command remains plain, selectable text.

// The async clipboard can be missing (insecure contexts) or refuse the write
// (in-app browsers, webviews); the selection path still works in many of those.
function copyWithSelection(text, view) {
  const field = view.document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  view.document.body.append(field);
  field.select();
  const copied = view.document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('copy unavailable');
}

async function writeClipboard(text, view) {
  try {
    await view.navigator.clipboard.writeText(text);
  } catch {
    copyWithSelection(text, view);
  }
}

export function initTerminalCopy(view = window) {
  const status = view.document.querySelector('[data-terminal-status]');
  for (const button of view.document.querySelectorAll('[data-terminal-copy]')) {
    let reset = 0;
    button.hidden = false;
    button.addEventListener('click', async () => {
      view.clearTimeout(reset);
      try {
        await writeClipboard(button.dataset.terminalCopy, view);
        button.textContent = 'Copied';
        button.dataset.state = 'copied';
        if (status) status.textContent = 'Command copied';
      } catch {
        button.textContent = 'Select and copy';
        if (status) status.textContent = 'Copy is unavailable here. Select the command and copy it instead.';
      }
      reset = view.setTimeout(() => {
        button.textContent = 'Copy';
        delete button.dataset.state;
      }, 1800);
    });
  }
}
