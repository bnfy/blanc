const gestures = {
  back: {
    title: 'Back.', direction: 'Drag left', description: 'Return to the previous page.',
    before: 'nasa', after: 'start', from: [460, 220], to: [170, 220],
    result: 'Dragging left returns to the previous page.',
  },
  forward: {
    title: 'Forward.', direction: 'Drag right', description: 'Move forward in your history.',
    before: 'start', after: 'nasa', from: [170, 220], to: [460, 220],
    result: 'Dragging right moves forward in your history.',
  },
  new: {
    title: 'New tab.', direction: 'Drag up', description: 'Open a fresh Start Page.',
    before: 'nasa', after: 'start', from: [340, 300], to: [340, 110],
    result: 'Dragging up opens a new tab with the Start Page.',
  },
};

export function initGestureDemo(root, { view = window } = {}) {
  if (!root) return;
  const demo = root.querySelector('.gesture-demo');
  const visual = root.querySelector('.gesture-visual');
  const choices = [...root.querySelectorAll('[data-gesture-preview]')];
  const replay = root.querySelector('.gesture-replay');
  const cursor = root.querySelector('.gesture-cursor');
  const trail = root.querySelector('.gesture-trail');
  const halo = root.querySelector('.gesture-trail-halo');
  const origin = root.querySelector('.gesture-origin');
  const status = root.querySelector('[data-gesture-status]');
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 'back';
  let started = false;
  let timer;
  let animations = [];
  let revision = 0;

  const stop = () => {
    revision++;
    view.clearTimeout(timer);
    animations.forEach(animation => animation.cancel());
    animations = [];
  };
  const settle = (announce = false) => {
    stop();
    const gesture = gestures[selected];
    demo.dataset.phase = 'result';
    demo.dataset.page = gesture.after;
    visual.setAttribute('aria-label', `Gesture illustration: ${gesture.result}`);
    if (announce) status.textContent = gesture.result;
  };
  const play = (id = selected, announce = true) => {
    stop();
    started = true;
    selected = id;
    const gesture = gestures[id];
    demo.dataset.gesture = id;
    demo.dataset.page = gesture.before;
    demo.dataset.phase = 'drawing';
    root.querySelector('[data-gesture-title]').textContent = gesture.title;
    root.querySelector('[data-gesture-direction]').textContent = gesture.direction;
    root.querySelector('[data-gesture-description]').textContent = gesture.description;
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.gesturePreview === id)));
    status.textContent = '';
    visual.setAttribute('aria-label', `Gesture illustration: ${gesture.direction.toLowerCase()}, then release. ${gesture.description}`);
    const [x, y] = gesture.to;
    const [startX, startY] = gesture.from;
    const path = `M${startX} ${startY}L${x} ${y}`;
    trail.setAttribute('d', path);
    halo.setAttribute('d', path);
    origin.setAttribute('cx', startX);
    origin.setAttribute('cy', startY);
    cursor.setAttribute('transform', `translate(${x} ${y})`);
    if (motion.matches || view.document.hidden) {
      settle(announce);
      return;
    }
    const currentRevision = revision;
    const timing = { duration: 1150, delay: 250, fill: 'both', easing: 'cubic-bezier(.45,0,.2,1)' };
    animations = [
      cursor.animate([
        { transform: `translate(${startX}px, ${startY}px)` },
        { transform: `translate(${x}px, ${y}px)` },
      ], timing),
      trail.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], timing),
    ];
    // The native action happens on release; show the destination only after the stroke.
    timer = view.setTimeout(() => {
      if (revision === currentRevision) settle(announce);
    }, 1450);
  };

  choices.forEach(button => button.addEventListener('click', () => play(button.dataset.gesturePreview)));
  replay.addEventListener('click', () => play());
  root.querySelector('.gesture-controls').hidden = false;
  replay.hidden = false;
  const observer = new view.IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) settle();
    else if (!started) play('back', false);
  }, { threshold: 0.35 });
  observer.observe(demo);
  view.document.addEventListener('visibilitychange', () => {
    if (view.document.hidden) settle();
  });
  motion.addEventListener('change', () => { if (motion.matches) settle(); });
  view.addEventListener('pagehide', () => { settle(); observer.disconnect(); });
}
