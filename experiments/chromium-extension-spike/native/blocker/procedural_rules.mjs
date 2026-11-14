// Preserve domains and exceptions. Property predicates become isolated renderer
// markers selected by the authenticated evaluator; list bytes remain unchanged.
export function proceduralRules(raw, CosmeticFilter) {
  const filters=[], translated=[], unsupported=[], properties=[];
  const markers=new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    const match=/^([^#]*)(#@\?#|#\?#|#@#|##)(.+)$/.exec(line);
    if (!match || (!match[2].includes('?') && !match[3].includes(':-abp-properties('))) continue;
    let selector=match[3], valid=true;
    // The pinned property patterns contain no nesting. Refuse unfamiliar syntax
    // rather than changing its meaning; unsupported entries remain in provenance.
    selector=selector.replace(/:-abp-properties\(([^()]*)\)/g,(_,pattern)=>{
      if (!pattern || pattern.length>2048) {valid=false;return '';}
      let attribute=markers.get(pattern);
      if(!attribute){attribute='data-blanc-property-'+markers.size;markers.set(pattern,attribute);properties.push({attribute,pattern});}
      return ':matches-attr('+attribute+')';
    });
    if(selector.includes(':-abp-properties('))valid=false;
    const normalized=match[1]+(match[2].includes('@')?'#@#':'##')+selector;
    const filter=valid?CosmeticFilter.parse(normalized):null;
    if (!filter) { unsupported.push(line); continue; }
    filters.push(filter);translated.push({original:line,normalized});
  }
  return {filters,translated,unsupported,properties};
}
