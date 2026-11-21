import fs from 'node:fs';import assert from 'node:assert/strict';import {connect,pause} from './cdp.mjs';
const ts=await fetch('http://127.0.0.1:9297/json/list').then(r=>r.json());const h=await connect(ts.find(t=>t.url.includes('/host.html')));await h.eval('BlancPrototypeHost.extensions()');await pause(300);
const before=await h.eval('document.getElementById("extensionsPanel").innerText');assert(before.includes('Theme fixture a'));assert(before.includes('Theme fixture b'));
await h.eval('document.querySelector("[data-theme-action=applyTheme]:not(:disabled)").click()');await pause(900);const after=await h.eval('document.getElementById("extensionsPanel").innerText');assert.notEqual(before,after);
await h.eval('BlancPrototypeHost.api.openPage("extensions")');await pause(900);
const icon=await h.eval(`(()=>{const d=document.getElementById('strip').contentDocument,e=d.getElementById('pillFavicon');return {marker:d.documentElement.hasAttribute('data-extensions-page'),class:e.className,filter:getComputedStyle(e).filter}})()`);assert(icon.marker);assert.notEqual(icon.filter,'none');
await h.eval('BlancPrototypeHost.extensions()');await pause(200);await h.eval('document.querySelector("[data-theme-action=removeTheme]").click()');
fs.writeFileSync('/private/tmp/blanc-theme-manager/runtime.json',JSON.stringify({before,after,icon},null,2));console.log({before,after,icon});h.close();
