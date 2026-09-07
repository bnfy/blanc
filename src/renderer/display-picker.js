'use strict';
(async () => {
  const data = await window.displayPicker.state();
  if (!data) return;
  const share = document.querySelector('#share');
  const audio = document.querySelector('#audio');
  let selected = null;
  document.querySelector('#origin').textContent = data.origin;
  document.querySelector('#cancel').onclick = () => window.displayPicker.reply({ id: data.id, cancel: true });
  share.onclick = () => window.displayPicker.reply({ id: data.id, source: selected, audio: audio.checked });
  if (data.nativePicker) {
    document.querySelector('#explanation').textContent = data.audioRequested
      ? 'Continue to macOS to choose a screen or window. This request includes computer audio, which may include sounds from other applications.'
      : 'Continue to macOS to choose the screen or window this site can see.';
    share.textContent = data.audioRequested ? 'Continue with audio' : 'Continue';
    share.disabled = false;
  } else {
    document.querySelector('#audioLabel').hidden = !data.audioRequested;
    document.querySelector('#audioNote').hidden = !data.audioRequested;
    const root = document.querySelector('#sources');
    for (const source of data.sources) {
      const button = document.createElement('button');
      button.className = 'source'; button.type = 'button';
      button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', 'false');
      const img = document.createElement('img'); img.alt = '';
      if (source.thumbnail.startsWith('data:image/')) img.src = source.thumbnail;
      const name = document.createElement('span'); name.textContent = source.name;
      button.append(img, name);
      button.onclick = () => {
        selected = source.key;
        for (const sibling of root.children) sibling.setAttribute('aria-checked', String(sibling === button));
        share.disabled = false;
      };
      button.onkeydown = (event) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const items = [...root.children];
        const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        const next = items[(items.indexOf(button) + delta + items.length) % items.length];
        next.focus(); next.click();
      };
      root.append(button);
    }
  }
  document.querySelector('#cancel').focus();
})();
