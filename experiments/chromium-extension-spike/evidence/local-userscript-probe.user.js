// ==UserScript==
// @name         Blanc compatibility probe
// @namespace    local.blanc.prototype
// @version      1.0.0
// @description  Local-only script execution and storage check
// @match        http://127.0.0.1:18763/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==
const count = GM_getValue('blancProbeCount', 0) + 1;
GM_setValue('blancProbeCount', count);
document.documentElement.dataset.blancUserscript = String(count);
const marker = document.createElement('p');
marker.id = 'blanc-userscript-marker';
marker.textContent = 'Blanc userscript executed: ' + count;
document.body.append(marker);
