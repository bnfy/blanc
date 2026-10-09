// Media page: the island index (scroll position, dot previews, floating
// state) and the copy buttons. The page reads and works without it; the
// script only adds feedback.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const status = document.querySelector('[data-media-status]');

/* ---------- copy ---------- */

function copyWithSelection(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('copy unavailable');
}

// The async clipboard can be missing (insecure contexts) or refuse the write
// (in-app browsers, webviews); the selection path still works in many of those.
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyWithSelection(text);
  }
}

for (const button of document.querySelectorAll('.media-copy[data-copy]')) {
  let reset = 0;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    try {
      await writeClipboard(button.dataset.copy);
      button.textContent = 'Copied';
      button.dataset.state = 'copied';
      if (status) status.textContent = button.dataset.copiedLabel || 'Copied';
    } catch {
      button.textContent = 'Select and copy';
      if (status) status.textContent = 'Copy is unavailable here. Select the text and copy it instead.';
    }
    reset = setTimeout(() => {
      button.textContent = 'Copy';
      delete button.dataset.state;
    }, 1800);
  });
}

/* ---------- island index ---------- */

const index = document.querySelector('[data-media-index]');
const now = index?.querySelector('[data-media-index-now]');
const links = index ? [...index.querySelectorAll('a[data-section]')] : [];
const order = links.map((link) => link.dataset.section);
const labelOf = (link) => link.querySelector('.sr-only').textContent;

let currentId = order[0];
let shownLabel = now?.textContent ?? '';

// Swap the label in the slot, entering from the side the reader is heading.
function showLabel(label, direction) {
  if (!now || label === shownLabel) return;
  shownLabel = label;
  now.textContent = label;
  if (reduceMotion.matches || !now.animate) return;
  now.animate(
    [
      { opacity: 0, transform: `translateY(${direction * 7}px)` },
      { opacity: 1, transform: 'none' },
    ],
    // The page's one spring curve lives in media.css as --media-spring.
    { duration: 420, easing: getComputedStyle(now).getPropertyValue('--media-spring').trim() || 'ease-out' },
  );
}

function setCurrent(id) {
  if (!id || id === currentId) return;
  const direction = order.indexOf(id) > order.indexOf(currentId) ? 1 : -1;
  currentId = id;
  for (const link of links) {
    if (link.dataset.section === id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (!index.classList.contains('is-previewing')) {
    showLabel(labelOf(links[order.indexOf(id)]), direction);
  }
}

if (index && now && links.length) {
  links[0].setAttribute('aria-current', 'location');
  const sections = order.map((id) => document.getElementById(id)).filter(Boolean);

  // The current section is the last one whose top has passed a line a third
  // of the way down the viewport.
  let frame = 0;
  function update() {
    frame = 0;
    const line = innerHeight / 3;
    let active = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) active = section;
    }
    // At the very bottom, the last section is current even if it is short.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
      active = sections[sections.length - 1];
    }
    setCurrent(active.id);
    const stuckTop = parseFloat(getComputedStyle(index).top) || 0;
    index.classList.toggle('is-stuck', index.getBoundingClientRect().top <= stuckTop + 0.5 && scrollY > 0);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  update();

  // Hovering or focusing a dot previews its section in the slot.
  const preview = (link) => {
    index.classList.add('is-previewing');
    const direction = order.indexOf(link.dataset.section) >= order.indexOf(currentId) ? 1 : -1;
    showLabel(labelOf(link), direction);
  };
  const endPreview = () => {
    if (index.matches(':hover') && links.some((link) => link.matches(':hover'))) return;
    if (links.some((link) => link === document.activeElement && link.matches(':focus-visible'))) return;
    index.classList.remove('is-previewing');
    showLabel(labelOf(links[order.indexOf(currentId)]), 0);
  };
  for (const link of links) {
    link.addEventListener('pointerenter', () => preview(link));
    link.addEventListener('pointerleave', () => requestAnimationFrame(endPreview));
    link.addEventListener('focus', () => { if (link.matches(':focus-visible')) preview(link); });
    link.addEventListener('blur', () => requestAnimationFrame(endPreview));
    link.addEventListener('click', (event) => {
      index.classList.remove('is-previewing');
      // A pointer click should not leave the dot bloomed; keyboard focus stays.
      if (event.detail > 0) link.blur();
    });
  }
}
