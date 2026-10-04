// Select among real light/dark captures without altering product pixels.
export function initWallpaperPreview(daylight, { document = window.document, view = window } = {}) {
  const timeInput = document.getElementById("hero-time"),
    daylightPlay = document.getElementById("hero-daylight-play");
  const motionPreference = view.matchMedia("(prefers-reduced-motion: reduce)");
  const daylightPhases = ["dawn", "day", "dusk", "night"],
    daylightTimes = ["6 am", "12 pm", "6 pm", "11 pm"];
  let daylightIndex = 0,
    daylightTimer = null,
    daylightRunning = false,
    daylightVisible = false,
    daylightGeneration = 0,
    playbackGeneration = 0,
    daylightStarted = false;
  function stopDaylight() {
    ++playbackGeneration;
    view.clearTimeout(daylightTimer);
    daylightTimer = null;
    daylightRunning = false;
    daylightPlay.setAttribute("aria-label", "Play the wallpaper day");
    daylightPlay.querySelector("span").textContent = "▶";
  }
  async function setDaylight(index, playback = null) {
    const request = ++daylightGeneration;
    const appearance = document.documentElement.dataset.homeAppearance === "dark" ? "dark" : "light";
    const daylightDark = appearance === "dark";
    index = Math.min(3, Math.max(0, index));
    const phase = daylightPhases[index],
      key = phase + (daylightDark ? "-dark" : "");
    const scene = daylight.querySelector('[data-hero-scene="' + key + '"]');
    try {
      await scene.querySelector("img").decode();
    } catch {
      if (request === daylightGeneration) timeInput.value = String(daylightIndex);
      return false;
    }
    if (request !== daylightGeneration || (playback !== null && playback !== playbackGeneration)) return false;
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
    const playback = playbackGeneration;
    daylightPlay.setAttribute("aria-label", "Pause the wallpaper day");
    daylightPlay.querySelector("span").textContent = "Ⅱ";
    const advance = async () => {
      if (!daylightRunning) return;
      await setDaylight((daylightIndex + 1) % 4, playback);
      if (daylightRunning && playback === playbackGeneration) daylightTimer = view.setTimeout(advance, 4200);
    };
    daylightTimer = view.setTimeout(advance, 4200);
  }
  timeInput.addEventListener("input", () => {
    daylightStarted = true;
    stopDaylight();
    setDaylight(Number(timeInput.value));
  });
  timeInput.addEventListener("pointerdown", stopDaylight);
  timeInput.addEventListener("keydown", stopDaylight);
  daylight.addEventListener("focusin", (event) => {
    if (!daylightPlay.contains(event.target)) stopDaylight();
  });
  daylightPlay.addEventListener("click", () => {
    if (daylightRunning) stopDaylight();
    else playDaylight();
  });
  new view.IntersectionObserver(
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
  view.addEventListener("pagehide", stopDaylight);
  return {
    refreshAppearance({ manual = false } = {}) {
      if (manual) {
        daylightStarted = true;
        stopDaylight();
      }
      return setDaylight(Number(timeInput.value));
    },
  };
}
