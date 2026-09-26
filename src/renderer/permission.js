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

  function describePermission({ permission, mediaTypes }) {
    if (permission === 'media') {
      const wantsAudio = mediaTypes.includes('audio');
      const wantsVideo = mediaTypes.includes('video');
      if (wantsAudio && wantsVideo) return 'use your camera and microphone';
      if (wantsVideo) return 'use your camera';
      return 'use your microphone';
    }
    if (permission === 'geolocation') return 'know your location';
    if (permission === 'notifications') return 'show notifications';
    return `use “${permission}”`;
  }

  function showNextPermissionPrompt() {
    activePermissionPrompt = permissionQueue.shift() ?? null;
    permissionBar.hidden = !activePermissionPrompt;
    if (activePermissionPrompt) {
      const host = new URL(activePermissionPrompt.origin).host;
      permissionText.textContent = `${host} wants to ${describePermission(activePermissionPrompt)}`;
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
