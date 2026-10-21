// The Glance demo (GlanceDemo.astro): an interactive website illustration of
// the floating Glance card, not recorded app footage. Drag the card's header
// to move it; the arrow keys move it 16 px (Shift: 64 px), and Enter or a
// double-click puts it back, as in the app. The card stays wholly inside the
// page area below the Island, as the app keeps it.

// The window is drawn at 960 x 520; the page area is everything below the
// 52 px Island band.
const WIDTH = 960;
const HEIGHT = 520;
const BAND = 52;
// The app's first-open frame: 80% of the page area's width (at most 1100),
// centered, 16 px below the band, 32 px clear of the bottom.
export const START = Object.freeze({ x: 96, y: BAND + 16, width: 768, height: HEIGHT - BAND - 16 - 32 });

export function clampCard({ x, y, width, height }) {
  return {
    width,
    height,
    x: Math.min(WIDTH - width, Math.max(0, Math.round(x))),
    y: Math.min(HEIGHT - height, Math.max(BAND, Math.round(y))),
  };
}

export function initGlanceDemo(root, { view = window } = {}) {
  const viewport = root?.querySelector("#glance-viewport");
  const glanceWindow = root?.querySelector("#glance-window");
  const card = root?.querySelector("#glance-card");
  const handle = root?.querySelector("#glance-handle");
  if (!viewport || !glanceWindow || !card || !handle) return;
  const status = root.querySelector("#glance-status");
  let frame = { ...START };
  let drag = null;
  let scale = 1;

  const place = (next) => {
    frame = clampCard(next);
    card.style.setProperty("--card-x", `${frame.x}px`);
    card.style.setProperty("--card-y", `${frame.y}px`);
    card.style.setProperty("--card-w", `${frame.width}px`);
    card.style.setProperty("--card-h", `${frame.height}px`);
  };
  const report = (message) => {
    if (status) status.textContent = message;
  };
  const reset = () => {
    place(START);
    report("Glance card put back.");
  };
  const end = () => {
    if (!drag) return;
    drag = null;
    glanceWindow.classList.remove("is-dragging");
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, from: { ...frame } };
    handle.setPointerCapture?.(event.pointerId);
    handle.focus({ preventScroll: true });
    glanceWindow.classList.add("is-dragging");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    place({ ...drag.from, x: drag.from.x + (event.clientX - drag.x) / scale, y: drag.from.y + (event.clientY - drag.y) / scale });
  });
  handle.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    handle.releasePointerCapture?.(event.pointerId);
    end();
  });
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("lostpointercapture", end);
  handle.addEventListener("dblclick", reset);
  handle.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      reset();
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = arrows[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 64 : 16;
    place({ ...frame, x: frame.x + direction[0] * step, y: frame.y + direction[1] * step });
    report("Glance card moved.");
  });
  new view.ResizeObserver(() => {
    scale = viewport.getBoundingClientRect().width / WIDTH || 1;
    viewport.style.setProperty("--glance-scale", String(scale));
  }).observe(viewport);
  place(START);
}
