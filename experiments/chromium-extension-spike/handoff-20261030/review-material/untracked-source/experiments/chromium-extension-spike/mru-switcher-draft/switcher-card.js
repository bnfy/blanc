/* Shipping-inspired Island recent-tab card. The native owner remains the
 * authority for keyboard routing and final activation. */
(function (root) {
  'use strict';
  let nextInstance = 0;
  function createSwitcherCard({container, translate, setFavicon, tabDomain, choose}) {
    if (!container || [translate,setFavicon,tabDomain,choose].some(fn => typeof fn !== 'function')) throw new TypeError('card dependencies required');
    const document = container.ownerDocument, instance = ++nextInstance;
    const card = document.createElement('section'), list = document.createElement('ul'), caption = document.createElement('div');
    const title = document.createElement('span'), host = document.createElement('span'), status = document.createElement('div');
    card.className = 'switcher-card'; card.hidden = true;
    list.className = 'switcher-tiles'; list.setAttribute('role','listbox'); list.setAttribute('aria-label',translate('switcher.label'));
    caption.className = 'switcher-caption'; title.className = 'switcher-title'; host.className = 'switcher-host';
    status.className = 'switcher-status'; status.setAttribute('aria-live','polite'); status.setAttribute('aria-atomic','true');
    caption.append(title,host); card.append(list,caption,status); container.append(card);
    let generation = 0, priorPick = null;
    function hide() { generation++; card.hidden = true; list.replaceChildren(); list.removeAttribute('aria-activedescendant'); title.textContent = ''; host.textContent = ''; status.textContent = ''; priorPick = null; }
    function render(model,tabs,{announce = null} = {}) {
      if (!Array.isArray(model?.tabIds) || !Array.isArray(tabs) || !Number.isInteger(model.pick) || model.pick < 0 || model.pick >= model.tabIds.length || new Set(model.tabIds).size !== model.tabIds.length) { hide(); return false; }
      const byId = new Map();
      for (const tab of tabs) {
        if (!tab || typeof tab.id !== 'string' || byId.has(tab.id)) { hide(); return false; }
        byId.set(tab.id,tab);
      }
      const entries = model.tabIds.map(id => byId.get(id)).filter(Boolean), pickedId = model.tabIds[model.pick], picked = byId.get(pickedId);
      if (!picked) { hide(); return false; }
      const epoch = ++generation;
      const tiles = entries.map((tab,index) => {
        const li = document.createElement('li'), icon = document.createElement('span');
        li.className = 'switcher-tile'; li.id = `switcher-tile-${instance}-${index}`; li.setAttribute('role','option');
        li.setAttribute('aria-selected',String(tab.id === pickedId)); li.setAttribute('aria-label',tab.title || translate('tab.untitled'));
        setFavicon(icon,tab); li.append(icon);
        li.addEventListener('mousedown',event => { event.preventDefault(); if (!card.hidden && epoch === generation) choose(tab.id); });
        return li;
      });
      list.replaceChildren(...tiles); const index = entries.indexOf(picked);
      list.setAttribute('aria-activedescendant',tiles[index].id); card.hidden = false;
      tiles[index].scrollIntoView({block:'nearest',inline:'nearest'});
      title.textContent = picked.title || translate('tab.untitled'); host.textContent = tabDomain(picked);
      if (announce === 'open' || (announce === 'step' && priorPick !== pickedId)) {
        status.textContent = translate(announce === 'open' ? 'switcher.opened' : 'switcher.step',{title:title.textContent,position:index+1,count:entries.length});
      }
      priorPick = pickedId; return true;
    }
    return {render,hide,element:card};
  }
  if (typeof module === 'object' && module.exports) module.exports = {createSwitcherCard};
  else root.BlancSwitcherCard = {createSwitcherCard};
})(globalThis);
