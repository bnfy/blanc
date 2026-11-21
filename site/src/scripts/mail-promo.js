// The homepage's Blanc Mail band: the example address steps through the
// endings, one every 2.5 seconds. The endings' box takes the width of the one
// showing, so the whole address stays centred and glides as the ending
// changes length (home.css animates --ending-width). Without this script, or
// when motion is unwanted, the first ending simply stays.

export function initMailPromo(root, { view = window } = {}) {
  const box = root?.querySelector(".mail-promo-endings");
  if (!box) return () => {};
  const endings = [...box.children];
  let current = 0;
  // The ending leaving rises out as the next one rises in.
  const show = (index) => {
    endings.forEach((ending) => ending.classList.remove("is-leaving"));
    if (index !== current) endings[current].classList.replace("is-current", "is-leaving");
    current = index;
    endings[current].classList.add("is-current");
    measure();
  };
  const measure = () => box.style.setProperty("--ending-width", `${endings[current].offsetWidth}px`);
  show(0);
  // The width changes once the web font arrives and when the window resizes.
  view.document.fonts?.ready.then(measure);
  view.addEventListener("resize", measure);
  if (!view.matchMedia("(prefers-reduced-motion: no-preference)").matches) return () => {};
  // Steps only while the band is on screen and the tab is visible.
  let timer = 0;
  const observer = new view.IntersectionObserver(([entry]) => {
    view.clearInterval(timer);
    if (entry.isIntersecting) timer = view.setInterval(() => {
      if (!view.document.hidden) show((current + 1) % endings.length);
    }, 2500);
  });
  observer.observe(root);
  return () => { view.clearInterval(timer); observer.disconnect(); };
}
