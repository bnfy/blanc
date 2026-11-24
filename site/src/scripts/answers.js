// Searchable answers on Support and Privacy & Security. On Support, answers
// sit in product panels (radios switch them in CSS): a search shows every
// panel's matches, and a deep link checks its panel's radio first.
const topics = [...document.querySelectorAll("[data-search-topic]")];
const products = document.querySelector("[data-support-products]");
const input = document.querySelector("#answer-search");
const clear = document.querySelector("#clear-search");
const normalize = (value) =>
  value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
const searchable = topics.map((topic) => ({
  topic,
  text: normalize(topic.textContent),
}));
function search() {
  const terms = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
  let count = 0;
  for (const { topic, text } of searchable) {
    const match = terms.every((term) => text.includes(term));
    topic.hidden = !match;
    if (match) count++;
  }
  document
    .querySelectorAll(".answer-group")
    .forEach(
      (group) =>
        (group.hidden = ![
          ...group.querySelectorAll("[data-search-topic]"),
        ].some((topic) => !topic.hidden)),
    );
  document
    .querySelectorAll("[data-search-panel]")
    .forEach(
      (panel) =>
        (panel.hidden =
          terms.length > 0 &&
          ![...panel.querySelectorAll("[data-search-topic]")].some(
            (topic) => !topic.hidden,
          )),
    );
  products?.toggleAttribute("data-searching", terms.length > 0);
  document.querySelector("#search-count").textContent = terms.length
    ? `${count} matching ${count === 1 ? "topic" : "topics"}`
    : "";
  document.querySelector("#search-empty").hidden = count !== 0;
  clear.hidden = !terms.length;
}
if (input) {
  document.querySelector("[data-search-ui]").hidden = false;
  input.addEventListener("input", search);
  clear.addEventListener("click", () => {
    input.value = "";
    search();
    input.focus();
  });
}
function openDestination() {
  let id;
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return;
  }
  const query = new URLSearchParams(location.search).get("topic");
  const target =
    (id && document.getElementById(id)) ||
    (query && document.getElementById(query));
  if (!target) return;
  if (input) {
    input.value = "";
    search();
  }
  const panel = target.closest("[data-panel-radio]");
  if (panel) {
    const radio = document.getElementById(panel.dataset.panelRadio);
    radio.checked = true;
    writeProduct(radio.value, true);
  }
  let parent = target;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  if (query) {
    const url = new URL(location.href);
    url.searchParams.delete("topic");
    url.hash = target.id;
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
}
// Support's opening tab: ?product= (as on /changelog), else iPhone & iPad on
// an iPhone or iPad, else the desktop tab checked in the markup. A deep link
// to an answer, handled by openDestination below, wins over both. iPadOS
// asks for desktop sites with a Mac user agent, so touch decides it is an
// iPad. Nothing is stored or sent. The address names the tab whenever it
// differs from the one the page would open by itself, so a reload or a
// shared link shows what the reader chose.
const appleDevice =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const ownProduct = appleDevice ? "iphone" : "desktop";
function writeProduct(id, keepHash) {
  const url = new URL(location.href);
  if (id === ownProduct) url.searchParams.delete("product");
  else url.searchParams.set("product", id);
  if (!keepHash) url.hash = "";
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}
if (products) {
  products.dataset.scripted = "";
  const asked = new URLSearchParams(location.search).get("product");
  const radios = [...products.querySelectorAll('input[name="support-product"]')];
  const choice =
    radios.find((radio) => radio.value === asked) ||
    radios.find((radio) => radio.value === ownProduct);
  if (choice) choice.checked = true;
  products.addEventListener("change", (event) => writeProduct(event.target.value, false));
}
window.addEventListener("hashchange", openDestination);
// Same-hash links must also reopen an answer that the reader has closed.
document.addEventListener("click", (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && anchor.hash === location.hash) openDestination();
});
openDestination();
