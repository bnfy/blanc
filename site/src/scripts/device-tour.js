// The homepage hero's device tour: Blanc on the desktop, iPhone, iPad and
// iPhone Duo, one at a time, with tabs to pick one. Without this script the
// desktop window shows alone and the tabs stay hidden.
//
// It moves on by itself only while nothing else asks it to wait: never with
// reduced motion, off screen, in a hidden tab, under the visitor's pointer or
// with focus inside it. Picking a tab, or the pause button, stops it until the
// play button starts it again.
import { isAppleHandheld } from './handheld-download.js';

// How long each slide stays, in milliseconds. The desktop slide waits for one
// whole hide-and-float loop of its Island (floating-island-hero.js).
export const DWELL = Object.freeze({ desktop: 7000, other: 5000 });

const dwellFor = (device) => (device === 'desktop' ? DWELL.desktop : DWELL.other);

// On an iPhone or iPad the tour opens on that device; nothing is sent.
export function firstDevice(nav = {}) {
  if (!isAppleHandheld(nav)) return 'desktop';
  return /iPhone|iPod/i.test(String(nav.userAgent || '')) ? 'iphone' : 'ipad';
}

export function initDeviceTour(root, { view = window } = {}) {
  if (!root) return { stop() {} };
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => root.querySelector(`#${tab.getAttribute('aria-controls')}`));
  const list = root.querySelector('[role="tablist"]');
  const controls = root.querySelector('[data-device-controls]');
  const toggle = root.querySelector('[data-device-toggle]');
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, timer = null, held = false, hovering = false, focused = false;
  let onScreen = !view.IntersectionObserver, stopped = false;

  const clear = () => {
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
    delete root.dataset.running;
  };
  const canRun = () => !stopped && !held && !hovering && !focused && onScreen
    && view.document.visibilityState !== 'hidden' && !motion.matches;
  const refreshToggle = () => {
    if (!toggle) return;
    toggle.hidden = motion.matches;
    toggle.dataset.state = held ? 'paused' : 'playing';
    toggle.setAttribute('aria-label', held ? 'Play the device tour' : 'Pause the device tour');
  };
  // Starts the current slide's wait; the active tab's bar fills over it. A
  // wait already running is left alone, so the bar and the timer stay together.
  const schedule = () => {
    if (timer !== null && canRun()) return;
    clear();
    if (!canRun()) return;
    const device = tabs[index].dataset.deviceTab;
    root.style.setProperty('--tour-dwell', `${dwellFor(device)}ms`);
    root.dataset.running = '';
    timer = view.setTimeout(() => {
      timer = null;
      select((index + 1) % tabs.length);
      schedule();
    }, dwellFor(device));
  };

  // Moves the chosen tab's plate under it (home.css slides it there).
  const placePlate = () => {
    const tab = tabs[index];
    if (!list || !tab.offsetWidth) return;
    list.style.setProperty('--tab-x', `${tab.offsetLeft}px`);
    list.style.setProperty('--tab-w', `${tab.offsetWidth}px`);
  };

  function select(next, { focus = false } = {}) {
    index = next;
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].dataset.state = on ? 'on' : 'off';
      panels[i].inert = !on;
    });
    root.dataset.device = tabs[index].dataset.deviceTab;
    placePlate();
    if (focus) tabs[index].focus();
  }

  // The visitor chose: the tour holds still until they press play.
  const choose = (next, options) => {
    held = true;
    select(next, options);
    refreshToggle();
    schedule();
  };

  const onClick = (event) => choose(tabs.indexOf(event.currentTarget));
  const onKeyDown = (event) => {
    const last = tabs.length - 1;
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose((next + tabs.length) % tabs.length, { focus: true });
  };
  // Play starts at once, though the pointer and focus are still on the button.
  const onToggle = () => {
    held = !held;
    if (!held) hovering = focused = false;
    refreshToggle();
    schedule();
  };
  const onPointerEnter = (event) => { if (event.pointerType !== 'touch') { hovering = true; schedule(); } };
  const onPointerLeave = (event) => { if (event.pointerType !== 'touch') { hovering = false; schedule(); } };
  const onFocusIn = () => { focused = true; schedule(); };
  const onFocusOut = (event) => {
    if (root.contains(event.relatedTarget)) return;
    focused = false;
    schedule();
  };
  const onMotion = () => { refreshToggle(); schedule(); };

  tabs.forEach((tab) => {
    tab.addEventListener('click', onClick);
    tab.addEventListener('keydown', onKeyDown);
  });
  toggle?.addEventListener('click', onToggle);
  root.addEventListener('pointerenter', onPointerEnter);
  root.addEventListener('pointerleave', onPointerLeave);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  view.document.addEventListener('visibilitychange', schedule);
  motion.addEventListener?.('change', onMotion);
  const observer = view.IntersectionObserver && new view.IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    schedule();
  });
  observer?.observe(root);
  const resize = view.ResizeObserver && new view.ResizeObserver(placePlate);
  if (list) resize?.observe(list);
  view.document.fonts?.ready.then(placePlate);

  const start = tabs.findIndex((tab) => tab.dataset.deviceTab === firstDevice(view.navigator));
  if (controls) controls.hidden = false;
  select(Math.max(start, 0));
  refreshToggle();
  schedule();

  return {
    stop() {
      stopped = true;
      clear();
      tabs.forEach((tab) => {
        tab.removeEventListener('click', onClick);
        tab.removeEventListener('keydown', onKeyDown);
      });
      toggle?.removeEventListener('click', onToggle);
      root.removeEventListener('pointerenter', onPointerEnter);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      view.document.removeEventListener('visibilitychange', schedule);
      motion.removeEventListener?.('change', onMotion);
      observer?.disconnect();
      resize?.disconnect();
    },
  };
}
