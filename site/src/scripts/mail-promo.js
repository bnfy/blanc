// The homepage's Blanc Mail band: the example address steps through the five
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
    box.style.setProperty("--ending-width", `${endings[current].offsetWidth}px`);
  };
  show(0);
  if (!view.matchMedia("(prefers-reduced-motion: no-preference)").matches) return () => {};
  const timer = view.setInterval(() => {
    if (!view.document.hidden) show((current + 1) % endings.length);
  }, 2500);
  return () => view.clearInterval(timer);
}
