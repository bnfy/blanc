import { initHandheldDownload } from "./handheld-download.js";

// The homepage works without this script: every switching path and every
// system's default-browser steps are in the page, and the questions are
// native disclosures. With it, the two switchers show one path at a time.

export function initSwitcher(group, panels, key, initial) {
  if (!group || !panels.length) return () => {};
  const buttons = [...group.querySelectorAll("button")];
  const select = (value) => {
    buttons.forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset[key] === value)),
    );
    panels.forEach((panel) => {
      panel.hidden = panel.dataset[`${key}Panel`] !== value;
    });
  };
  buttons.forEach((button) =>
    button.addEventListener("click", () => select(button.dataset[key])),
  );
  group.hidden = false;
  group.closest(".switch")?.setAttribute("data-enhanced", "");
  select(initial);
  return select;
}

// Reads the visitor's system on the page itself to preselect it; nothing is sent.
export function localSystem(nav = {}) {
  const ua = String(nav.userAgent || "");
  const platform = String(nav.userAgentData?.platform || nav.platform || ua);
  if (/win/i.test(platform)) return "win";
  if (/linux|x11|cros/i.test(platform) && !/android/i.test(ua)) return "linux";
  return "mac";
}

export function initFaq(toggle, questions) {
  if (!toggle || !questions.length) return;
  const refresh = () => {
    toggle.textContent = questions.every((item) => item.open)
      ? "Collapse all"
      : "Expand all";
  };
  toggle.addEventListener("click", () => {
    const open = !questions.every((item) => item.open);
    questions.forEach((item) => {
      item.open = open;
    });
    refresh();
  });
  questions.forEach((item) => item.addEventListener("toggle", refresh));
  toggle.hidden = false;
  refresh();
}

export function initHome({ document = window.document, view = window } = {}) {
  initHandheldDownload({ document, view });
  const selectSource = initSwitcher(
    document.querySelector("[data-switch-sources]"),
    [...document.querySelectorAll("[data-source-panel]")],
    "source",
    "chromium",
  );
  initSwitcher(
    document.querySelector("[data-switch-systems]"),
    [...document.querySelectorAll("[data-os-panel]")],
    "os",
    localSystem(view.navigator),
  );
  // "Coming from" links in the hero and Spaces open that browser's steps.
  document.querySelectorAll("a[data-switch-source]").forEach((link) =>
    link.addEventListener("click", () => selectSource(link.dataset.switchSource)),
  );
  initFaq(
    document.querySelector("[data-faq-toggle]"),
    [...document.querySelectorAll(".faq-list details")],
  );
}

if (typeof window !== "undefined") initHome();
