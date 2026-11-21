import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './generate.mjs';
// Only called after the immutable authenticated ASAR has been verified/extracted.
export function applyReferenceCosmeticRepair(appPath) {
  const changes=[];
  const edit=(name, transform)=>{
    const target=path.join(appPath,name),before=fs.readFileSync(target,'utf8'),after=transform(before);
    assert.notEqual(before,after,name);fs.writeFileSync(target,after);
    changes.push({name,before:sha(before),after:sha(after)});
  };
  const replace=(text,a,b)=>{assert.equal(text.split(a).length,2,a);return text.replace(a,b);};
  edit('src/main/adblock.js',text=>{
    text=replace(text,'ElectronBlocker.parse(verified.raw)','ElectronBlocker.parse(verified.raw, {loadExtendedSelectors:true})');
    text=replace(text,'deserialize: (bytes) => ElectronBlocker.deserialize(bytes),',"deserialize: (bytes) => { const engine = ElectronBlocker.deserialize(bytes); if (!engine.config.loadExtendedSelectors) throw new Error('Reference correction requires extended-selector seed'); return engine; },");
    text=replace(text,
      '&& attachedSessions.has(wc.session) && blocker.isBlockingEnabled(facadeFor(wc.session)));',
      '&& attachedSessions.has(wc.session) && blocker.isBlockingEnabled(facadeFor(wc.session)) && !isWebContentsExcepted(wc, settings.getSettings().adblockExceptions));');
    const anchor='function applyBlockingWithExceptions(session) {';
    return replace(text,anchor,`const referenceChannel = 'blanc/reference-cosmetics/start';
let referenceListenerInstalled = false;
function applyBlockingWithExceptions(session) {
  if (!referenceListenerInstalled) {
    referenceListenerInstalled = true;
    ipcMain.on(referenceChannel, event => {
      const response = (() => {
      const wc = event.sender, frame = event.senderFrame;
      if (!wc || wc.isDestroyed() || !frame || frame !== wc.mainFrame ||
          !attachedSessions.has(wc.session) || !blocker ||
          !blocker.isBlockingEnabled(facadeFor(wc.session))) return {active:false};
      const hostname = blockableHostname(frame.url);
      if (!hostname || settings.getSettings().adblockExceptions.includes(hostname)) return {active:false};
      try {
        const parsed = require('tldts-experimental').parse(frame.url);
        const result = blocker.getCosmeticsFilters({url:frame.url,
          hostname:parsed.hostname || '', domain:parsed.domain || '',
          getBaseRules:true, getInjectionRules:true, getExtendedRules:true,
          getRulesFromHostname:true, getRulesFromDOM:false});
        if (result.active && result.styles) ownedCosmetics.insert(wc, result.styles).catch(console.error);
        return {active:result.active, scripts:result.scripts || [], extended:result.extended || []};
      } catch (error) { console.error('Reference cosmetics start failed', error); return {active:false}; }
      })();
      event.returnValue = response;
    });
  }`);
  });
  // Retain the reference's existing exception/disable cleanup and navigation ownership.
  edit('src/main/adblock-owned-css.js', text => {
    const anchor = '  return { clear, clearSession:';
    return replace(text, anchor, `  const insert = async (wc, styles) => {
    if (!allowed(wc)) return;
    if (!entries.has(wc)) {
      const entry = {keys:new Set(), generation:0};
      entries.set(wc, entry);
      wc.on('did-navigate', () => {entry.generation++; entry.keys.clear();});
      wc.once('destroyed', () => entries.delete(wc));
    }
    const entry=entries.get(wc), generation=entry.generation;
    if(entry.keys.size >= 1024) return;
    const key=await wc.insertCSS(styles,{cssOrigin:'user'});
    if(wc.isDestroyed() || entry.generation !== generation) return;
    if(!allowed(wc)) await wc.removeInsertedCSS(key);
    else entry.keys.add(key);
  };
  return { insert, clear, clearSession:`);
  });
  // Bundle only the original authenticated library files, preserving their notices.
  const directory='node_modules/@ghostery/adblocker-extended-selectors/dist/commonjs';
  const names=['types.js','parse.js','extended.js','eval.js'];
  const modules=names.map(name=>`${JSON.stringify('./'+name)}: function(module,exports,require){\n${fs.readFileSync(path.join(appPath,directory,name),'utf8')}\n}`).join(',\n');
  const source=fs.readFileSync(new URL('./reference-cosmetic-preload.cjs',import.meta.url),'utf8');
  edit('node_modules/@ghostery/adblocker-electron-preload/dist/index.cjs',text=>{
    text=replace(text,'        injectCosmeticFilters();','        // Initial delivery is synchronous through the isolated correction below.');
    return text+`\n;(()=>{const modules={${modules}},cache={};function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,load);return module.exports;}\n${source}\nstartReferenceCosmetics(electron,load('./eval.js'));})();\n`;
  });
  return {kind:'isolated-reference-correction',originalVersion:'1.36.0',changes,
    preloadSourceSha256:sha(source),repairSourceSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
}
