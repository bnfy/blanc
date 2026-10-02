const preview = document.getElementById('heroWallpaper');
if (preview) {
  const frame = preview.querySelector('.hero-wallpaper-frame');
  const scenes = [...preview.querySelectorAll('[data-wallpaper-scene]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let visible = false;
  let hovered = false;
  let focused = false;
  let timer = null;
  let generation = 0;

  function stop() {
    clearTimeout(timer);
    timer = null;
  }
  function schedule() {
    stop();
    const running = visible && !document.hidden && !motion.matches && !hovered && !focused;
    preview.dataset.running = String(running);
    if (!running) {
      generation += 1;
      return;
    }
    timer = setTimeout(async () => {
      await select((current + 1) % scenes.length);
      schedule();
    }, 4000);
  }
  async function select(index) {
    const request = ++generation;
    try { await scenes[index].querySelector('img').decode(); } catch { return; }
    if (request !== generation) return;
    current = index;
    scenes.forEach((scene, i) => scene.classList.toggle('is-current', i === index));
    preview.dataset.phase = scenes[index].dataset.wallpaperScene;
  }

  // A quiet preview, with no button bar. Holding focus or hovering pauses it.
  preview.tabIndex = 0;
  preview.setAttribute('aria-label', 'Dynamic wallpaper preview. Focus to pause.');
  frame.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      hovered = true;
      schedule();
    }
  });
  frame.addEventListener('pointerleave', () => { hovered = false; schedule(); });
  preview.addEventListener('focusin', () => { focused = true; schedule(); });
  preview.addEventListener('focusout', event => {
    focused = event.relatedTarget instanceof Node && preview.contains(event.relatedTarget);
    schedule();
  });
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    schedule();
  });
  observer.observe(frame);
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  window.addEventListener('pagehide', () => { generation += 1; stop(); });
  window.addEventListener('pageshow', schedule);
}
