// Arc has no native Linux profile. Keep the shipping fixtures and outcome
// assertions, but perform previews and imports through the copied-file UI.
import assert from 'node:assert/strict';
import path from 'node:path';
import {chooseLinuxArcFile,importSheet} from '../adapters/import.mjs';

const view = w => importSheet(w,`() => {
  const panel = name => document.querySelector('[data-arc-panel="'+name+'"]');
  return {
    ready: document.getElementById('arcImportEntry').hidden === false,
    previewHidden: panel('preview').hidden, previewText: panel('preview').textContent,
    resultHidden: panel('result').hidden, resultText: panel('result').textContent,
  };
}`);
async function ready(w) {
  await w.call('openTabImport');
  await w.waitFor(()=>view(w), dom=>dom?.ready, 'Arc copied-file entry');
}
async function choose(w, projection=false) {
  // Shipping's shared fixtures write the copied sidebar in this synthetic
  // directory. F45-7 moves it to its own explicitly selected directory.
  const file = w.arcChosenFile ?? path.join(w.fixture.browserHome,'Library','Application Support','Arc','StorableSidebar.json');
  const select = () => chooseLinuxArcFile(file,w.fixture.process.pid);
  if (projection) {
    const [value] = await Promise.all([
      importSheet(w,"() => window.bowserPages.tabImport.arcRead('file')",20000), select(),
    ]);
    return value;
  }
  const clicked = await importSheet(w,`() => {
    const button = document.querySelector('#arcImportEntry button');
    if (button?.textContent !== 'Choose file…' || button.disabled) return false;
    button.click(); return true;
  }`);
  assert.equal(clicked,true,'Choose file… in the Linux Arc entry');
  await select();
  return w.waitFor(()=>view(w), dom=>dom?.previewHidden===false, 'preview from the chosen sidebar');
}
async function apply(w,favoritesOnly=false) {
  await ready(w);
  await choose(w);
  const clicked = await importSheet(w,`() => {
    const panel = document.querySelector('[data-arc-panel="preview"]');
    if (${favoritesOnly}) {
      const boxes = [...panel.querySelectorAll('input[type=checkbox]')];
      if (boxes.length !== 3) return false;
      for (const box of boxes.slice(0,2)) if (box.checked) box.click();
    }
    const button = panel.querySelector('button.tab-import-primary');
    if (!button || button.disabled || !${favoritesOnly?"/^Add Favorites$/":"/^Create 2/"} .test(button.textContent)) return false;
    button.click(); return true;
  }`);
  assert.equal(clicked,true,'Arc preview allows this selection');
  w.arcDom = await w.waitFor(()=>view(w), dom=>dom && (!dom.resultHidden || dom.previewText.includes('Only 1 more space fits.')), 'Arc apply result');
}
export const linuxArcSteps = new Map([
  ['Blanc offers to bring Spaces from Arc',function(){
    assert.deepEqual(this.arcDom.entryButtons,['Choose file…']);
    assert.match(this.arcDom.entryText,/Arc never came to Linux\./);
  }],
  ['I bring both Spaces from Arc',async function(){
    this.arcBefore = {records:await this.call('arcImport','records'),windows:await this.call('windowRuntimes'),state:await this.call('state')};
    await apply(this);
  }],
  ['I bring the Favorites from Arc',async function(){await apply(this,true);}],
  ['Blanc shows the Arc preview',async function(){
    await ready(this);
    this.arcProjection = await choose(this,true);
  }],
  ['offers to choose a copied StorableSidebar.json file',async function(){
    const dom = await choose(this);
    assert.match(dom.previewText,/Work/);
    assert.match(dom.previewText,/Reading/);
  }],
  ['I am previewing the Spaces from Arc',async function(){
    await ready(this);
    await choose(this);
    assert.equal(await this.call('arcImport','has-session'),true);
  }],
]);
