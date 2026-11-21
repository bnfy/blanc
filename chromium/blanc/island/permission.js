// The floating permission-prompt surface: a small always-on-top
// WebContentsView main attaches bottom-center over the page while prompts
// are pending (it must be its own view — the strip document only paints the
// top band; everything below chromeHeight is covered by the tab's view).
// One visible prompt at a time, FIFO, exactly the queue the strip used to
// run. Main attaches/detaches the view on queue transitions; this document
// only renders and answers.
(() => {
  const permissionBar = document.getElementById('permissionBar');
  const permissionText = document.getElementById('permissionText');
  const permissionGlyphs = document.getElementById('permissionGlyphs');
  const permGlyphMic = document.getElementById('permGlyphMic');
  const permGlyphCam = document.getElementById('permGlyphCam');
  const permAllowBtn = document.getElementById('permAllowBtn');
  const permBlockBtn = document.getElementById('permBlockBtn');

  const permissionQueue = [];
  let activePermissionPrompt = null;

  // A long host is shortened from the START so its registrable domain stays
  // visible: cutting the end could turn accounts.google.com.evil.example into
  // a reassuring "accounts.google.com.ev…". The full host is the tooltip.
  // Capping the host also keeps the whole request within the bar's two lines.
  function elideHost(host) {
    const max = 32;
    return host.length <= max ? host : `…${host.slice(host.length - (max - 1))}`;
  }

  // One complete message per request (F44: no sentence assembly); tag 0 is
  // the host.
  function promptParts({ permission, mediaTypes }, host) {
    if (permission === 'media') {
      const wantsAudio = mediaTypes.includes('audio');
      const wantsVideo = mediaTypes.includes('video');
      if (wantsAudio && wantsVideo) return blancI18n.parts('permission.prompt.cameraMicrophone', { host });
      if (wantsVideo) return blancI18n.parts('permission.prompt.camera', { host });
      return blancI18n.parts('permission.prompt.microphone', { host });
    }
    if (permission === 'geolocation') return blancI18n.parts('permission.prompt.geolocation', { host });
    if (permission === 'notifications') return blancI18n.parts('permission.prompt.notifications', { host });
    return blancI18n.parts('permission.prompt.other', { host, permission });
  }

  function renderPrompt(prompt) {
    const host = new URL(prompt.origin).host;
    permissionText.replaceChildren(...promptParts(prompt, elideHost(host)).map((part) => {
      if (part.tag === undefined) return document.createTextNode(part.text);
      const hostEl = document.createElement('span');
      hostEl.className = 'permission-host';
      hostEl.textContent = part.text;
      hostEl.title = host;
      hostEl.dataset.i18nIgnore = 'title'; // the full host is page data
      return hostEl;
    }));
  }

  function showNextPermissionPrompt() {
    activePermissionPrompt = permissionQueue.shift() ?? null;
    permissionBar.hidden = !activePermissionPrompt;
    if (activePermissionPrompt) {
      renderPrompt(activePermissionPrompt);
      const isMedia = activePermissionPrompt.permission === 'media';
      permissionGlyphs.hidden = !isMedia;
      // toggleAttribute — SVGElement has no hidden IDL property.
      permGlyphMic.toggleAttribute('hidden', !(isMedia && activePermissionPrompt.mediaTypes.includes('audio')));
      permGlyphCam.toggleAttribute('hidden', !(isMedia && activePermissionPrompt.mediaTypes.includes('video')));
    }
  }

  function answerPermissionPrompt(allow) {
    if (!activePermissionPrompt) return;
    window.browserAPI.respondPermission(activePermissionPrompt.id, allow);
    showNextPermissionPrompt();
  }

  permAllowBtn.addEventListener('click', () => answerPermissionPrompt(true));
  permBlockBtn.addEventListener('click', () => answerPermissionPrompt(false));

  window.browserAPI.onPermissionPrompt((payload) => {
    // Main replays pending prompts on this document's first load; a replayed
    // id may already be queued or showing — never show one prompt twice.
    if (activePermissionPrompt?.id === payload.id) return;
    if (permissionQueue.some((entry) => entry.id === payload.id)) return;
    permissionQueue.push(payload);
    if (!activePermissionPrompt) showNextPermissionPrompt();
  });
})();
