const topics = [...document.querySelectorAll("[data-search-topic]")];
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
window.addEventListener("hashchange", openDestination);
// Same-hash links must also reopen an answer that the reader has closed.
document.addEventListener("click", (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && anchor.hash === location.hash) openDestination();
});
openDestination();
