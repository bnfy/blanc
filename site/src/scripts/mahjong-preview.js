const scenes = [
  { id: 'peaks', label: 'Peaks' },
  { id: 'butterfly', label: 'Butterfly' },
  { id: 'fortress', label: 'Fortress' },
];

export function initMahjongPreview(video, controls, { view = window } = {}) {
  const toggle = controls.querySelector('[data-mahjong-play]');
  const choices = [...controls.querySelectorAll('[data-mahjong-scene]')];
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let visible = false;
  let pausedByUser = false;
  let explicitPlay = false;
  let selected = 0;
  let request = 0;

  const updateToggle = () => {
    toggle.textContent = video.paused ? 'Play demo' : 'Pause';
    toggle.setAttribute('aria-label', video.paused ? 'Play Mahjong demo' : 'Pause Mahjong demo');
  };
  const syncPlayback = () => {
    const generation = ++request;
    if (!active || !visible || view.document.hidden || pausedByUser || (motion.matches && !explicitPlay)) {
      video.pause();
      updateToggle();
      return;
    }
    video.play().catch(() => {
      if (request === generation) updateToggle();
    });
  };
  const select = (index) => {
    selected = index;
    const scene = scenes[index];
    video.poster = `/revamp/mahjong-${scene.id}-v1.27.0.webp`;
    video.src = `/revamp/mahjong-${scene.id}-v1.27.0.mp4`;
    video.setAttribute('aria-label', `Recorded Blanc v1.27.0 Mahjong gameplay: ${scene.label}`);
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mahjongScene === scene.id)));
    video.load();
    syncPlayback();
  };
  choices.forEach(button => button.addEventListener('click', () => {
    select(scenes.findIndex(scene => scene.id === button.dataset.mahjongScene));
  }));
  toggle.addEventListener('click', () => {
    pausedByUser = !video.paused;
    explicitPlay = !pausedByUser;
    syncPlayback();
  });
  video.addEventListener('play', updateToggle);
  video.addEventListener('pause', updateToggle);
  video.addEventListener('error', updateToggle);
  video.addEventListener('ended', () => {
    if (active && visible && !pausedByUser && !view.document.hidden && (!motion.matches || explicitPlay)) select((selected + 1) % scenes.length);
  });
  const observer = new view.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncPlayback();
  }, { threshold: 0.15 });
  observer.observe(video);
  view.document.addEventListener('visibilitychange', syncPlayback);
  motion.addEventListener('change', () => {
    explicitPlay = false;
    syncPlayback();
  });
  updateToggle();
  return {
    show() {
      active = true;
      video.hidden = false;
      controls.hidden = false;
      if (!video.getAttribute('src')) select(selected);
      else syncPlayback();
    },
    hide() {
      active = false;
      video.hidden = true;
      controls.hidden = true;
      syncPlayback();
    },
  };
}
