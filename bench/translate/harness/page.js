'use strict';
for (const kind of ['focus', 'blur', 'mousedown', 'pointerdown', 'keydown', 'wheel']) {
  window.addEventListener(kind, (e) => {
    const t = e.target;
    window.probe.report(kind, { target: (t && (t.id || t.nodeName)) || 'window' });
  }, true);
}
