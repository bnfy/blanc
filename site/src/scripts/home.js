import { initHomeAppearance } from "./home-appearance.js";
import { initWallpaperPreview } from "./wallpaper-preview.js";
import { initGestureDemo } from "./gesture-demo.js";
import { initHorizonShield } from "./horizon-shield.js";
import { initMahjongPreview } from "./mahjong-preview.js";
import { createImagePreview } from "./image-preview.js";
import { initHandheldDownload } from "./handheld-download.js";
import { initToolDemos } from "./tool-demos.js";
initHorizonShield(document.querySelector(".horizon-study"));

(() => {
  const body = document.body;
  const layoutAssets = {
    ledger: {
      src: "/feature-captures/ledger-v1.21.0.webp",
      label: "Ledger",
      caption: "Ledger — a simple list of Favorites.",
    },
    billboard: {
      src: "/feature-captures/billboard-v1.21.0.webp",
      label: "Billboard",
      caption: "Billboard — a large clock and local frequently visited sites.",
    },
    shelf: {
      src: "/feature-captures/shelf-v1.21.0.webp",
      label: "Shelf",
      caption: "Shelf — Favorites arranged as individual cards.",
    },
    tally: {
      src: "/feature-captures/tally-v1.21.0.webp",
      label: "Tally",
      caption: "Tally — Favorites alongside local blocking activity.",
    },
  };
  document
    .querySelectorAll("[data-layout]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showStartLayout(button.dataset.layout),
      ),
    );
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll(".gallery-controls").forEach((group) => {
    const buttons = [...group.querySelectorAll("button")];
    const indicator = document.createElement("span");
    indicator.className = "gallery-indicator";
    indicator.setAttribute("aria-hidden", "true");
    group.prepend(indicator);
    const update = () => {
      const selected =
        buttons.find((b) => b.getAttribute("aria-pressed") === "true") ||
        buttons[0];
      indicator.style.width = selected.offsetWidth + "px";
      indicator.style.height = selected.offsetHeight + "px";
      indicator.style.top = selected.offsetTop + "px";
      indicator.style.bottom = "auto";
      indicator.style.transform =
        "translateX(" + (selected.offsetLeft - 4) + "px)";
      buttons.forEach((b) => (b.tabIndex = b === selected ? 0 : -1));
    };
    group.addEventListener("click", update);
    group.addEventListener("keydown", (event) => {
      const current = buttons.indexOf(document.activeElement);
      if (current < 0) return;
      let next;
      if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
      else if (event.key === "ArrowLeft")
        next = (current - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next].click();
      buttons[next].focus();
    });
    new ResizeObserver(update).observe(group);
    new MutationObserver(update).observe(body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    update();
  });

  // Website pacing between actual captured states; never presented as app video.
  const islandStage = document.getElementById("island-stage"),
    islandPlay = document.getElementById("island-play"),
    islandHotspot = document.querySelector(".island-hotspot"),
    islandButtons = [...document.querySelectorAll("[data-island]")];
  const islandCopy = {
    resting:
      "Each dot is a tab. Hover or focus a dot in Blanc to preview it; select it to switch. Open the Island for the full list.",
    tabs: "Open the Island to see your tabs together. The panel sits over the page, so the page stays in place.",
    commands:
      "Type / in the Island to reveal the available commands. Scroll the list in Blanc, or keep typing to filter it.",
  };
  const islandAlts = {
    resting:
      "Blanc v1.27.0: the resting Island above NASA’s Adopt a Pixel telescope scene",
    tabs: "Blanc v1.27.0: the open Island lists the Roman telescope, Adopt a Pixel and NASA Science pages",
    commands: "Blanc v1.27.0: typing / reveals the unfiltered slash-command list, starting with Favorites, Bring Your Tabs, Save, History, Downloads and Settings",
  };
  let islandTimer = null,
    islandPlaying = false,
    islandHasPlayed = false;
  function stopIsland() {
    clearTimeout(islandTimer);
    islandTimer = null;
    islandPlaying = false;
    islandPlay.querySelector(".play-label").textContent = islandHasPlayed
      ? "Replay sequence"
      : "Play sequence";
    islandPlay.querySelector(".play-glyph").textContent = "▶";
    islandPlay.setAttribute(
      "aria-label",
      islandHasPlayed
        ? "Replay the Island sequence"
        : "Play the Island sequence",
    );
    islandPlay.removeAttribute("aria-pressed");
  }
  function setIslandState(state) {
    islandStage.dataset.state = state;
    islandStage
      .querySelector('[role="img"]')
      .setAttribute("aria-label", islandAlts[state]);
    document.getElementById("island-caption").textContent = islandCopy[state];
    islandButtons.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.island === state)),
    );
    islandHotspot.setAttribute("aria-expanded", String(state !== "resting"));
    islandHotspot.setAttribute(
      "aria-label",
      state === "resting"
        ? "Open the Island preview"
        : "Close the Island preview",
    );
    islandButtons[0].parentElement.dispatchEvent(new Event("click"));
  }
  islandButtons.forEach((button) =>
    button.addEventListener("click", () => {
      stopIsland();
      setIslandState(button.dataset.island);
    }),
  );
  islandHotspot.addEventListener("click", () => {
    stopIsland();
    setIslandState(
      islandStage.dataset.state === "resting" ? "tabs" : "resting",
    );
  });
  islandStage.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      stopIsland();
      setIslandState("resting");
      islandHotspot.focus();
    }
  });
  islandPlay.addEventListener("click", () => {
    if (islandPlaying) {
      stopIsland();
      return;
    }
    if (motionPreference.matches) return;
    islandHasPlayed = true;
    islandPlaying = true;
    islandPlay.querySelector(".play-label").textContent = "Pause";
    islandPlay.querySelector(".play-glyph").textContent = "Ⅱ";
    islandPlay.setAttribute("aria-label", "Pause the Island sequence");
    islandPlay.setAttribute("aria-pressed", "true");
    const sequence = [
      ["resting", 850],
      ["tabs", 2300],
      ["commands", 2300],
      ["resting", 650],
    ];
    let step = 0;
    const advance = () => {
      if (!islandPlaying) return;
      if (step === sequence.length) {
        stopIsland();
        return;
      }
      const [state, duration] = sequence[step++];
      setIslandState(state);
      islandTimer = setTimeout(advance, duration);
    };
    advance();
  });
  new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) stopIsland();
    },
    { threshold: 0 },
  ).observe(islandStage);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopIsland();
  });
  motionPreference.addEventListener("change", () => {
    if (motionPreference.matches) stopIsland();
  });

  // The split is an interactive website illustration, not recorded app footage.
  const glanceWindow = document.getElementById("glance-window"),
    glanceDivider = document.getElementById("glance-divider");
  const glanceMain = document.getElementById("glance-main-document"),
    glanceReference = document.getElementById("glance-reference-document");
  const glanceSwap = document.getElementById("glance-swap"),
    glanceReset = document.getElementById("glance-reset"),
    glanceReopen = document.getElementById("glance-reopen");
  let split = 62,
    glanceClosed = false,
    glanceSwapped = false,
    glancePointer = null;
  function setSplit(value) {
    split = Math.min(78, Math.max(50, Math.round(value)));
    glanceWindow.style.setProperty(
      "--split",
      "calc((100% - 12px) * " + split / 100 + ")",
    );
    glanceDivider.setAttribute("aria-valuenow", String(split));
    glanceDivider.setAttribute(
      "aria-valuetext",
      `Main page ${split} percent, reference ${100 - split} percent`,
    );
  }
  function reportGlance(message) {
    document.getElementById("glance-status").textContent = message;
  }
  function setGlanceClosed(closed) {
    glanceClosed = closed;
    glanceWindow.classList.toggle("is-closed", closed);
    glanceSwap.hidden = closed;
    glanceReset.hidden = closed;
    document.getElementById("glance-close").hidden = closed;
    glanceReopen.hidden = !closed;
    document.getElementById("glance-hint").textContent = closed
      ? "Your main page stays open."
      : "Drag the divider to resize.";
    reportGlance(closed ? "Glance view closed." : "Glance view opened.");
  }
  function swapGlance() {
    const main = glanceMain.firstElementChild,
      reference = glanceReference.firstElementChild;
    glanceMain.append(reference);
    glanceReference.append(main);
    glanceSwapped = !glanceSwapped;
    document.querySelector(".reference-name").textContent = glanceReference.firstElementChild.dataset.title;
    glanceWindow.dataset.mainPage = glanceMain.firstElementChild.dataset.page;
    if (!motionPreference.matches) {
      [glanceMain, glanceReference].forEach((pane) => {
        pane.getAnimations().forEach((a) => a.cancel());
        pane.animate([{ opacity: 0.35 }, { opacity: 1 }], {
          duration: 220,
          easing: "ease-out",
        });
      });
    }
    reportGlance("Main and reference pages swapped.");
  }
  function endGlanceDrag() {
    glancePointer = null;
    glanceWindow.classList.remove("is-dragging");
  }
  function moveGlance(event) {
    const box = glanceWindow.getBoundingClientRect();
    setSplit(
      (100 * (event.clientX - box.left - (6 * box.width) / 960)) /
        (box.width - (12 * box.width) / 960),
    );
  }
  glanceDivider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || glanceClosed) return;
    event.preventDefault();
    glancePointer = event.pointerId;
    glanceDivider.setPointerCapture(event.pointerId);
    glanceDivider.focus({ preventScroll: true });
    glanceWindow.classList.add("is-dragging");
    moveGlance(event);
  });
  glanceDivider.addEventListener("pointermove", (event) => {
    if (event.pointerId === glancePointer) moveGlance(event);
  });
  glanceDivider.addEventListener("pointerup", (event) => {
    if (event.pointerId === glancePointer) {
      glanceDivider.releasePointerCapture(event.pointerId);
      endGlanceDrag();
    }
  });
  glanceDivider.addEventListener("pointercancel", endGlanceDrag);
  glanceDivider.addEventListener("lostpointercapture", endGlanceDrag);
  glanceDivider.addEventListener("keydown", (event) => {
    let next = split;
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next += step;
    else if (event.key === "Home") next = 50;
    else if (event.key === "End") next = 78;
    else return;
    event.preventDefault();
    setSplit(next);
  });
  glanceSwap.addEventListener("click", swapGlance);
  glanceReset.addEventListener("click", () => {
    if (glanceSwapped) swapGlance();
    setSplit(62);
    reportGlance("Original pages and split restored.");
  });
  document.getElementById("glance-close").addEventListener("click", () => {
    setGlanceClosed(true);
    glanceReopen.focus({ preventScroll: true });
  });
  glanceReopen.addEventListener("click", () => {
    setGlanceClosed(false);
    glanceDivider.focus({ preventScroll: true });
  });
  const glanceViewport = document.getElementById("glance-viewport");
  new ResizeObserver(() => {
    glanceViewport.style.setProperty(
      "--glance-scale",
      String(glanceViewport.getBoundingClientRect().width / 960),
    );
    glanceDivider.setAttribute("aria-orientation", "horizontal");
  }).observe(glanceViewport);
  setSplit(62);
  const mahjongPeek = document.getElementById("mahjong-peek"),
    mahjongBack = document.getElementById("mahjong-back"),
    layoutImage = document.getElementById("layout-image");
  const mahjongPreview = initMahjongPreview(
    document.getElementById("mahjong-video"),
    document.getElementById("mahjong-controls"),
  );
  const layoutPreview = createImagePreview(layoutImage);
  let currentStartLayout = "ledger",
    showingMahjong = false;
  function refreshStartIndicator() {
    document
      .querySelector("[data-layout]")
      .parentElement.dispatchEvent(new Event("click"));
  }
  function showStartLayout(name) {
    const state = layoutAssets[name];
    layoutPreview.show(
      state.src,
      "Blanc v1.21.0 " + state.label + " Start Page capture",
      () => {
        currentStartLayout = name;
        showingMahjong = false;
        mahjongPreview.hide();
        layoutImage.hidden = false;
        layoutImage.parentElement.classList.remove("mahjong-scene");
        document.querySelector(".start-discovery").classList.remove("is-playing");
        document.getElementById("layout-caption").textContent = state.caption;
        document.querySelectorAll("[data-layout]").forEach((button) =>
          button.setAttribute("aria-pressed", String(button.dataset.layout === name)),
        );
        mahjongPeek.setAttribute("aria-expanded", "false");
        mahjongBack.hidden = true;
        refreshStartIndicator();
      },
    );
  }
  mahjongPeek.addEventListener("click", () => {
    if (showingMahjong) {
      showStartLayout(currentStartLayout);
      return;
    }
    layoutPreview.cancel();
    showingMahjong = true;
    layoutImage.parentElement.classList.add("mahjong-scene");
    document.querySelector(".start-discovery").classList.add("is-playing");
    layoutImage.hidden = true;
    mahjongPreview.show();
    document.getElementById("layout-caption").textContent =
      "A little detour. Mahjong opens from the Start Page in its own tab.";
    mahjongPeek.setAttribute("aria-expanded", "true");
    mahjongBack.hidden = false;
    mahjongBack.textContent = "Back to " + layoutAssets[currentStartLayout].label;
  });
  mahjongBack.addEventListener("click", () => {
    showStartLayout(currentStartLayout);
    mahjongPeek.focus({ preventScroll: true });
  });
  document.getElementById("start").addEventListener("keydown", (event) => {
    if (event.key === "Escape" && showingMahjong) {
      event.preventDefault();
      showStartLayout(currentStartLayout);
      mahjongPeek.focus({ preventScroll: true });
    }
  });

  const wallpaper = initWallpaperPreview(document.getElementById("hero-daylight"));
  initHandheldDownload();
  initHomeAppearance({ onChange: (options) => wallpaper.refreshAppearance(options) });

})();

initGestureDemo(document.querySelector(".gesture-study"));
initToolDemos(document.getElementById("tools"));
