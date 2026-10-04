import { initHorizonShield } from "./horizon-shield.js";
initHorizonShield(document.querySelector(".horizon-study"));

(() => {
  const body = document.body;
  const layoutAssets = {
    ledger: {
      src: "/feature-captures/ledger-v1.21.0.png",
      label: "Ledger",
      caption: "Ledger — a simple list of Favorites.",
    },
    billboard: {
      src: "/feature-captures/billboard-v1.21.0.png",
      label: "Billboard",
      caption: "Billboard — a large clock and local frequently visited sites.",
    },
    shelf: {
      src: "/feature-captures/shelf-v1.21.0.png",
      label: "Shelf",
      caption: "Shelf — Favorites arranged as individual cards.",
    },
    tally: {
      src: "/feature-captures/tally-v1.21.0.png",
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
  const sceneVersions = new WeakMap();
  async function changeScene(target, src, alt) {
    const version = (sceneVersions.get(target) || 0) + 1;
    sceneVersions.set(target, version);
    const incoming = new Image();
    incoming.src = src;
    try {
      await incoming.decode();
    } catch {
      return;
    }
    if (sceneVersions.get(target) !== version) return;
    target.getAnimations().forEach((a) => a.cancel());
    target.parentElement
      .querySelectorAll(".scene-outgoing")
      .forEach((e) => e.remove());
    if (motionPreference.matches) {
      target.src = src;
      target.alt = alt;
      return;
    }
    const outgoing = target.cloneNode();
    outgoing.removeAttribute("id");
    outgoing.alt = "";
    outgoing.setAttribute("aria-hidden", "true");
    outgoing.classList.add("scene-outgoing");
    target.before(outgoing);
    target.src = src;
    target.alt = alt;
    const fade = target.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      easing: "ease-out",
    });
    fade.finished.catch(() => {}).finally(() => outgoing.remove());
  }
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
      ? "The reference is closed. Your main page stays here."
      : "Drag the divider to resize this desktop preview.";
    reportGlance(closed ? "Reference closed." : "Reference opened.");
  }
  function swapGlance() {
    const main = glanceMain.firstElementChild,
      reference = glanceReference.firstElementChild;
    glanceMain.append(reference);
    glanceReference.append(main);
    glanceSwapped = !glanceSwapped;
    document.querySelector(".reference-name").textContent = glanceSwapped
      ? "Straight answers"
      : "About Blanc";
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
  const mahjongImage = "/feature-captures/mahjong-v1.21.0.png",
    mahjongPeek = document.getElementById("mahjong-peek"),
    mahjongBack = document.getElementById("mahjong-back"),
    layoutImage = document.getElementById("layout-image");
  let currentStartLayout = "ledger",
    showingMahjong = false;
  function refreshStartIndicator() {
    document
      .querySelector("[data-layout]")
      .parentElement.dispatchEvent(new Event("click"));
  }
  function showStartLayout(name) {
    currentStartLayout = name;
    showingMahjong = false;
    const state = layoutAssets[name];
    layoutImage.parentElement.classList.remove("mahjong-scene");
    document.querySelector(".start-discovery").classList.remove("is-playing");
    changeScene(
      layoutImage,
      state.src,
      "Blanc v1.21.0 " + state.label + " Start Page capture",
    );
    document.getElementById("layout-caption").textContent = state.caption;
    document
      .querySelectorAll("[data-layout]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.layout === name),
        ),
      );
    mahjongPeek.setAttribute("aria-expanded", "false");
    mahjongBack.hidden = true;
    refreshStartIndicator();
  }
  mahjongPeek.addEventListener("click", () => {
    if (showingMahjong) {
      showStartLayout(currentStartLayout);
      return;
    }
    showingMahjong = true;
    layoutImage.parentElement.classList.add("mahjong-scene");
    document.querySelector(".start-discovery").classList.add("is-playing");
    changeScene(
      layoutImage,
      mahjongImage,
      "Blanc v1.21.0 Mahjong board preview",
    );
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

  const daylight = document.getElementById("hero-daylight"),
    timeInput = document.getElementById("hero-time"),
    appearanceButton = document.getElementById("hero-appearance"),
    daylightPlay = document.getElementById("hero-daylight-play");
  const daylightPhases = ["dawn", "day", "dusk", "night"],
    daylightTimes = ["6 am", "12 pm", "6 pm", "11 pm"];
  let daylightIndex = 0,
    daylightDark = false,
    daylightTimer = null,
    daylightRunning = false,
    daylightVisible = false,
    daylightGeneration = 0,
    daylightStarted = false;
  function stopDaylight() {
    clearTimeout(daylightTimer);
    daylightTimer = null;
    daylightRunning = false;
    daylightPlay.setAttribute("aria-label", "Play the wallpaper day");
    daylightPlay.querySelector("span").textContent = "▶";
  }
  async function setDaylight(index) {
    const request = ++daylightGeneration;
    index = Math.min(3, Math.max(0, index));
    const phase = daylightPhases[index],
      key = phase + (daylightDark ? "-dark" : "");
    const scene = daylight.querySelector('[data-hero-scene="' + key + '"]');
    try {
      await scene.querySelector("img").decode();
    } catch {
      return;
    }
    if (request !== daylightGeneration) return;
    daylightIndex = index;
    timeInput.value = String(index);
    timeInput.setAttribute(
      "aria-valuetext",
      phase[0].toUpperCase() + phase.slice(1) + ", " + daylightTimes[index],
    );
    daylight.dataset.phase = phase;
    daylight.dataset.appearance = daylightDark ? "dark" : "light";
    daylight
      .querySelectorAll("[data-hero-scene]")
      .forEach((el) => el.classList.toggle("is-current", el === scene));
    daylight
      .querySelectorAll("[data-aura]")
      .forEach((el) =>
        el.classList.toggle("is-current", el.dataset.aura === phase),
      );
    daylight
      .querySelectorAll(".daylight-ticks span")
      .forEach((el, i) => el.classList.toggle("is-current", i === index));
    document
      .getElementById("hero-daylight-screen")
      .setAttribute(
        "aria-label",
        "Blanc v1.25.0 Billboard Start Page with " +
          phase +
          " wallpaper in " +
          (daylightDark ? "dark" : "light") +
          " appearance",
      );
  }
  function playDaylight() {
    stopDaylight();
    if (motionPreference.matches) return;
    daylightRunning = true;
    daylightPlay.setAttribute("aria-label", "Pause the wallpaper day");
    daylightPlay.querySelector("span").textContent = "Ⅱ";
    const advance = async () => {
      if (!daylightRunning) return;
      await setDaylight((daylightIndex + 1) % 4);
      if (daylightRunning) daylightTimer = setTimeout(advance, 4200);
    };
    daylightTimer = setTimeout(advance, 4200);
  }
  timeInput.addEventListener("input", () => {
    stopDaylight();
    setDaylight(Number(timeInput.value));
  });
  timeInput.addEventListener("pointerdown", stopDaylight);
  timeInput.addEventListener("keydown", stopDaylight);
  appearanceButton.addEventListener("click", () => {
    stopDaylight();
    daylightDark = !daylightDark;
    appearanceButton.setAttribute("aria-pressed", String(daylightDark));
    appearanceButton.setAttribute(
      "aria-label",
      daylightDark ? "Show light appearance" : "Show dark appearance",
    );
    appearanceButton.querySelector(".appearance-label").textContent =
      daylightDark ? "Dark" : "Light";
    setDaylight(Number(timeInput.value));
  });
  daylight.addEventListener("focusin", (event) => {
    if (!daylightPlay.contains(event.target)) stopDaylight();
  });
  daylightPlay.addEventListener("click", () => {
    if (daylightRunning) stopDaylight();
    else playDaylight();
  });
  new IntersectionObserver(
    (entries) => {
      daylightVisible = entries[0].isIntersecting;
      if (!daylightVisible) stopDaylight();
      else if (!daylightStarted) {
        daylightStarted = true;
        playDaylight();
      }
    },
    { threshold: 0.25 },
  ).observe(daylight);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopDaylight();
  });
  motionPreference.addEventListener("change", () => {
    if (motionPreference.matches) stopDaylight();
  });
  window.addEventListener("pagehide", stopDaylight);
})();

const gestureStage = document.querySelector(".gesture-stage");
document.querySelectorAll("[data-gesture-preview]").forEach((button) =>
  button.addEventListener("click", () => {
    const gesture = button.dataset.gesturePreview;
    gestureStage.dataset.gesture = gesture;
    document
      .querySelectorAll("[data-gesture-preview]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    document.getElementById("gesture-label").textContent = {
      back: "Back",
      forward: "Forward",
      new: "New tab",
    }[gesture];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pointer = gestureStage.querySelector(".gesture-pointer");
    pointer.getAnimations().forEach((animation) => animation.cancel());
    pointer.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-160px)" }],
      { duration: 900, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
    );
    gestureStage
      .querySelector(".gesture-track")
      .animate([{ strokeDashoffset: 160 }, { strokeDashoffset: 0 }], {
        duration: 900,
        easing: "cubic-bezier(.4,0,.2,1)",
      });
  }),
);
