// Keep a preview's pixels and selection together, including failed and racing loads.
export function createImagePreview(target, { view = window } = {}) {
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let revision = 0;
  let outgoing;
  let fade;
  const clearFade = () => {
    fade?.cancel();
    outgoing?.remove();
    fade = outgoing = undefined;
  };
  return {
    cancel() {
      ++revision;
      clearFade();
    },
    async show(src, alt, commit) {
      const request = ++revision;
      // Returning from Mahjong can reuse the already displayed, decoded image.
      if (target.getAttribute('src') !== src || !target.complete || !target.naturalWidth) {
        const incoming = new view.Image();
        incoming.src = src;
        try { await incoming.decode(); } catch { return false; }
      }
      if (request !== revision) return false;
      clearFade();
      if (!motion.matches && !target.hidden && target.getAttribute('src') !== src) {
        const previous = target.cloneNode();
        previous.removeAttribute('id');
        previous.alt = '';
        previous.setAttribute('aria-hidden', 'true');
        previous.classList.add('scene-outgoing');
        target.before(previous);
        outgoing = previous;
        fade = target.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 260,
          easing: 'ease-out',
        });
        fade.finished.catch(() => {}).finally(() => previous.remove());
      }
      target.src = src;
      target.alt = alt;
      commit();
      return true;
    },
  };
}
