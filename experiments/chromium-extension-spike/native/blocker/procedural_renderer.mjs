// Bundled into the Blanc isolated cosmetic world. Third-party evaluator remains
// MPL-2.0; no page-world bindings or renderer-supplied selection identity.
import {querySelectorAll, handlePseudoDirective} from '@ghostery/adblocker-extended-selectors';
export function installProceduralRenderer(scope = globalThis) {
  const document = scope.document;
  let rules = [], marked = new Map(), dirty = true;
  let propertyMarked = new Map();
  const metrics = {runs:0, lastMs:0, maxMs:0, matched:0, error:null};
  const observer = new scope.MutationObserver(() => { dirty = true; });
  observer.observe(document, {subtree:true, childList:true, attributes:true, characterData:true});
  function replace(next) {
    if (!Array.isArray(next) || next.length > 256) throw Error('Procedural rule limit');
    for (const rule of next) {
      if (!rule || !rule.ast || (!rule.directive && typeof rule.attribute !== 'string')) throw Error('Invalid procedural rule');
      if (rule.attribute && !/^[a-zA-Z_][a-zA-Z0-9_.:-]{0,127}$/.test(rule.attribute)) throw Error('Invalid procedural marker');
    }
    rules = next; dirty = true;
  }
  function clearProperties() {
    for(const [attribute,elements] of propertyMarked) for(const element of elements) element.removeAttribute(attribute);
    propertyMarked.clear();
  }
  function propertyMatches() {
    clearProperties();
    const wanted=new Map();
    for(const rule of rules) for(const item of rule.properties || []) {
      if(!/^data-blanc-property-[0-9]+$/.test(item.attribute) || typeof item.pattern!=='string' || item.pattern.length>2048) throw Error('Invalid property predicate');
      wanted.set(item.attribute,item.pattern);
    }
    if(!wanted.size)return;
    const patterns=[...wanted].map(([attribute,pattern])=>{
      const source=pattern.startsWith('/')&&pattern.endsWith('/') ? pattern.slice(1,-1) : pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
      return {attribute,regex:new RegExp(source,'i')};
    });
    // CSSOM access stays inside the document origin. Never fetch sheets or read
    // a cross-origin sheet, even when CORS would make it readable.
    for(const sheet of document.styleSheets) {
      if(sheet.href && new URL(sheet.href,document.baseURI).origin!==scope.location.origin)continue;
      let entries;try{entries=sheet.cssRules}catch{continue}
      for(const entry of entries) {
        if(entry.type!==1)continue;
        const declarations=Array.from(entry.style,property=>property+': '+entry.style.getPropertyValue(property)+(entry.style.getPropertyPriority(property)?' !'+entry.style.getPropertyPriority(property):'')+';').sort().join(' ');
        const selected=patterns.filter(item=>item.regex.test(declarations));
        if(!selected.length)continue;
        // Split only top-level selector commas; quoted values and function
        // arguments must keep their commas. Pseudo-elements select their owner.
        const selectors=[];let start=0,depth=0,quote=null,escaped=false;
        for(let i=0;i<=entry.selectorText.length;i++) {
          const ch=entry.selectorText[i];
          if(escaped){escaped=false;continue}if(ch==='\\'){escaped=true;continue}
          if(quote){if(ch===quote)quote=null;continue}
          if(ch==='"'||ch==="'"){quote=ch;continue}
          if(ch==='('||ch==='[')depth++;if(ch===')'||ch===']')depth--;
          if(i===entry.selectorText.length||(ch===','&&depth===0)){selectors.push(entry.selectorText.slice(start,i).replace(/::[a-zA-Z-]+(?:\([^)]*\))?\s*$/,''));start=i+1;}
        }
        for(const selector of selectors) {
          let elements;try{elements=document.querySelectorAll(selector)}catch{continue}
          for(const {attribute} of selected) {
            if(!propertyMarked.has(attribute))propertyMarked.set(attribute,new Set());
            for(const element of elements){element.setAttribute(attribute,'');propertyMarked.get(attribute).add(element)}
          }
        }
      }
    }
  }
  // Called only by the browser's document-owned 250ms lifecycle timer. Forced
  // reevaluation covers computed-style/timer changes that emit no DOM mutation.
  function tick(force = false) {
    if ((!dirty && !force) || !document.documentElement) return metrics;
    const start = scope.performance.now(), next = new Map();
    try {
      // Evaluate the page's style, not our own previous hiding stylesheet.
      // Removal and reapplication are synchronous within this isolated task.
      for (const [attribute,elements] of marked) for (const element of elements) element.removeAttribute(attribute);
      propertyMatches();
      for (const rule of rules) {
        for (const element of querySelectorAll(document.documentElement, rule.ast)) {
          if (rule.directive) handlePseudoDirective(element, rule.directive);
          else {
            if (!next.has(rule.attribute)) next.set(rule.attribute, new Set());
            next.get(rule.attribute).add(element);
          }
        }
      }
      for (const [attribute,elements] of marked) for (const element of elements) {
        if (!next.get(attribute)?.has(element)) element.removeAttribute(attribute);
      }
      for (const [attribute,elements] of next) for (const element of elements) {
        if (!element.hasAttribute(attribute)) element.setAttribute(attribute,'');
      }
      marked = next;
      // Discard only our synchronous marker changes; page mutations occur in
      // later tasks and remain observable. No self-triggered mutation loop.
      observer.takeRecords(); dirty = false; metrics.error = null;
      metrics.matched = [...marked.values()].reduce((n,set)=>n+set.size,0);
    } catch {
      for (const [attribute,elements] of marked) for (const element of elements) element.setAttribute(attribute,'');
      metrics.error = 'procedural-evaluation-failed';
      throw Error(metrics.error);
    } finally {
      clearProperties();
      observer.takeRecords();
      metrics.runs++; metrics.lastMs = scope.performance.now()-start;
      metrics.maxMs = Math.max(metrics.maxMs,metrics.lastMs);
    }
    return metrics;
  }
  function dispose() {
    observer.disconnect();
    clearProperties();
    for (const [attribute,elements] of marked) for (const element of elements) element.removeAttribute(attribute);
    marked.clear(); rules = [];
  }
  return {replace,tick,dispose,metrics};
}
