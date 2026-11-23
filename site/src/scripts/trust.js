import { initHorizonShield } from "./horizon-shield.js";

// The bronze shield turns slowly while it is on screen. three.js loads only
// once the page is idle; until then, and with reduced motion or no WebGL,
// the artwork stays upright.
const idle = new Promise((resolve) => {
  const settle = () =>
    window.requestIdleCallback
      ? requestIdleCallback(() => resolve(), { timeout: 4000 })
      : setTimeout(resolve, 1500);
  if (document.readyState === "complete") settle();
  else addEventListener("load", settle, { once: true });
});
initHorizonShield(document.querySelector(".trust-intro .horizon-study"), {
  spin: "time",
  period: 16000,
  ready: idle,
});

// The section bar marks the section being read with a pill that slides to
// it, as the Download page's switch does. Without scripting the bar is plain
// links.
const bar = document.querySelector("[data-trust-contents]");
if (bar) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const links = [...bar.querySelectorAll('a[href^="#"]')];
  const sections = links.map((link) =>
    document.getElementById(decodeURIComponent(link.hash.slice(1))),
  );
  const marker = document.createElement("span");
  marker.className = "trust-contents-marker";
  marker.setAttribute("aria-hidden", "true");
  bar.prepend(marker);
  let current = null;
  let frame = 0;

  const place = (link) => {
    if (!link) {
      marker.removeAttribute("data-shown");
      return;
    }
    // The first placement appears in place instead of sliding in from 0.
    if (!marker.hasAttribute("data-shown")) marker.style.transition = "none";
    marker.style.width = `${link.offsetWidth}px`;
    marker.style.transform = `translateX(${link.offsetLeft}px)`;
    marker.setAttribute("data-shown", "");
    if (marker.style.transition) {
      marker.getBoundingClientRect();
      marker.style.transition = "";
    }
    // On a narrow window the bar scrolls sideways: keep its marked link in view.
    if (bar.scrollWidth > bar.clientWidth) {
      const left = link.offsetLeft - (bar.clientWidth - link.offsetWidth) / 2;
      bar.scrollTo({ left, behavior: reducedMotion.matches ? "auto" : "smooth" });
    }
  };

  const update = () => {
    frame = 0;
    const barBox = bar.getBoundingClientRect();
    const stuckAt = parseFloat(getComputedStyle(bar).top) || 0;
    bar.toggleAttribute("data-stuck", barBox.top <= stuckAt + 0.5);
    // The section being read is the last one whose top has reached the upper
    // part of the window; at the end of the page, the last one on screen.
    const atEnd =
      scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    const line = atEnd
      ? innerHeight
      : barBox.bottom + Math.min(innerHeight * 0.3, 240);
    let index = -1;
    sections.forEach((section, i) => {
      if (section && section.getBoundingClientRect().top <= line) index = i;
    });
    const link = links[index] || null;
    if (link === current) return;
    current?.removeAttribute("aria-current");
    link?.setAttribute("aria-current", "location");
    current = link;
    place(link);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", () => {
    if (current) place(current);
    schedule();
  });
  // Opening or closing a guide moves everything below it.
  document.addEventListener("toggle", schedule, true);
  document.fonts?.ready.then(() => current && place(current));
  update();
}
