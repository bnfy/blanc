(() => {
  const key = '__blancCosmeticCollector';
  if (!globalThis[key]) {
    const sets = {ids: new Set(), classes: new Set(), hrefs: new Set()};
    const add = (key, value) => { if (value && value.length <= 256 && sets[key].size < 2048) sets[key].add(value); };
    const collect = node => {
      if (node.nodeType !== 1) return;
      add('ids', node.id);
      for (const value of node.classList) add('classes', value);
      add('hrefs', node.getAttribute('href'));
    };
    const scan = node => {
      collect(node);
      if (node.querySelectorAll) {
        let count = 0;
        for (const child of node.querySelectorAll('[id],[class],[href]')) {
          if (++count > 8192) break;
          collect(child);
        }
      }
    };
    scan(document);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') collect(record.target);
        else for (const node of record.addedNodes) scan(node);
      }
    });
    observer.observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['id', 'class', 'href']});
    globalThis[key] = rescan => {
      if (rescan) scan(document);
      const result = {};
      for (const key of Object.keys(sets)) { result[key] = [...sets[key]]; sets[key].clear(); }
      return JSON.stringify(result);
    };
  }
  const rescan = globalThis.__blancCosmeticRescan === true;
  globalThis.__blancCosmeticRescan = false;
  return globalThis[key](rescan);
})()
