// The Glance demo (GlanceDemo.astro): an interactive website illustration of
// the split, not recorded app footage. Drag or arrow-key the divider to
// resize it. The full demo also swaps the pages, resets and closes the
// reference; the compact homepage card has only the divider, so every other
// control is optional.

const MIN = 50;
const MAX = 78;
const START = 62;

export function initGlanceDemo(root, { view = window } = {}) {
  const glanceWindow = root?.querySelector("#glance-window");
  const divider = root?.querySelector("#glance-divider");
  const viewport = root?.querySelector("#glance-viewport");
  if (!glanceWindow || !divider || !viewport) return;
  const main = root.querySelector("#glance-main-document");
  const reference = root.querySelector("#glance-reference-document");
  const swap = root.querySelector("#glance-swap");
  const reset = root.querySelector("#glance-reset");
  const close = root.querySelector("#glance-close");
  const reopen = root.querySelector("#glance-reopen");
  const hint = root.querySelector("#glance-hint");
  const status = root.querySelector("#glance-status");
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  let split = START;
  let closed = false;
  let swapped = false;
  let pointer = null;

  const report = (message) => {
    if (status) status.textContent = message;
  };
  const setSplit = (value) => {
    split = Math.min(MAX, Math.max(MIN, Math.round(value)));
    glanceWindow.style.setProperty("--split", `calc((100% - 12px) * ${split / 100})`);
    divider.setAttribute("aria-valuenow", String(split));
    divider.setAttribute("aria-valuetext", `Main page ${split} percent, reference ${100 - split} percent`);
  };
  const setClosed = (value) => {
    closed = value;
    glanceWindow.classList.toggle("is-closed", value);
    if (swap) swap.hidden = value;
    if (reset) reset.hidden = value;
    if (close) close.hidden = value;
    if (reopen) reopen.hidden = !value;
    if (hint) hint.textContent = value ? "Your main page stays open." : "Drag the divider to resize.";
    report(value ? "Glance view closed." : "Glance view opened.");
  };
  const swapPages = () => {
    const first = main.firstElementChild;
    const second = reference.firstElementChild;
    main.append(second);
    reference.append(first);
    swapped = !swapped;
    root.querySelector(".reference-name").textContent = reference.firstElementChild.dataset.title;
    glanceWindow.dataset.mainPage = main.firstElementChild.dataset.page;
    if (!motion.matches) {
      [main, reference].forEach((pane) => {
        pane.getAnimations().forEach((animation) => animation.cancel());
        pane.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
      });
    }
    report("Main and reference pages swapped.");
  };
  const endDrag = () => {
    pointer = null;
    glanceWindow.classList.remove("is-dragging");
  };
  // The window is drawn at 960px and scaled to its column; 12px is the
  // divider at that size.
  const moveTo = (event) => {
    const box = glanceWindow.getBoundingClientRect();
    setSplit((100 * (event.clientX - box.left - (6 * box.width) / 960)) / (box.width - (12 * box.width) / 960));
  };

  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || closed) return;
    event.preventDefault();
    pointer = event.pointerId;
    divider.setPointerCapture(event.pointerId);
    divider.focus({ preventScroll: true });
    glanceWindow.classList.add("is-dragging");
    moveTo(event);
  });
  divider.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointer) moveTo(event);
  });
  divider.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointer) return;
    divider.releasePointerCapture(event.pointerId);
    endDrag();
  });
  divider.addEventListener("pointercancel", endDrag);
  divider.addEventListener("lostpointercapture", endDrag);
  divider.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 5 : 1;
    let next = split;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") next += step;
    else if (event.key === "Home") next = MIN;
    else if (event.key === "End") next = MAX;
    else return;
    event.preventDefault();
    setSplit(next);
  });
  swap?.addEventListener("click", swapPages);
  reset?.addEventListener("click", () => {
    if (swapped) swapPages();
    setSplit(START);
    report("Original pages and split restored.");
  });
  close?.addEventListener("click", () => {
    setClosed(true);
    reopen?.focus({ preventScroll: true });
  });
  reopen?.addEventListener("click", () => {
    setClosed(false);
    divider.focus({ preventScroll: true });
  });
  new view.ResizeObserver(() => {
    viewport.style.setProperty("--glance-scale", String(viewport.getBoundingClientRect().width / 960));
  }).observe(viewport);
  setSplit(START);
}
