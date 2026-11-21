import {parse} from 'acorn';

// Build-time allowlist: only packaged SVG literals and static row skeletons.
// Page titles, URLs, translations and counters never enter TrustedHTML.
export function hardenMarkup(input, name) {
  let source = input.toString();
  source = source.replace('row.innerHTML = `${CARET}<span class="ghead-name"></span><span class="ghead-n"></span><span class="ghead-kbd">${modKey}${clusterIndex + 1}</span>`;', 'row.innerHTML = `${CARET}<span class="ghead-name"></span><span class="ghead-n"></span><span class="ghead-kbd"></span>`;\n    row.querySelector(\'.ghead-kbd\').textContent = modKey + (clusterIndex + 1);');
  // Resolve the one packaged SVG path interpolation at build time only.
  const downloadPath = source.match(/const DOWNLOAD_D = '([MmLlHhVvCcSsQqTtAaZz0-9., -]+)';/);
  if (downloadPath) source = source.replace('`<svg viewBox="0 0 16 16"><path d="${DOWNLOAD_D}"/></svg>`', JSON.stringify('<svg viewBox="0 0 16 16"><path d="' + downloadPath[1] + '"/></svg>'));
  const tree = parse(source, {ecmaVersion: 'latest', sourceType: 'script'});
  const nodes=[];
  function walk(node) { if (!node || typeof node !== 'object') return; if(node.type) nodes.push(node); for(const value of Object.values(node)) {if(Array.isArray(value)) value.forEach(walk);else if(value && typeof value==='object')walk(value);} }
  walk(tree);
  const allowed=new Set(), constants=new Map();
  for(const n of nodes) {
    if(n.type==='Literal' && typeof n.value==='string' && n.value.startsWith('<svg') && n.value.endsWith('</svg>')) {
      if(/on\w+\s*=|javascript:|<\s*(script|foreignObject|iframe)/i.test(n.value))throw Error('Unsafe static SVG');
      allowed.add(n.value);
    }
    if(n.type==='VariableDeclarator' && n.id.type==='Identifier' && n.init?.type==='Literal')constants.set(n.id.name,n.init.value);
  }
  const edits=[];
  for(const n of nodes) if(n.type==='AssignmentExpression' && n.left.type==='MemberExpression' && n.left.property.name==='innerHTML') {
    if(n.operator!=='=')throw Error('Unsupported markup assignment');
    const rhs=n.right;
    if(rhs.type==='TemplateLiteral') {
      let value=rhs.quasis[0].value.cooked;
      rhs.expressions.forEach((v,i)=>{if(v.type!=='Identifier'||v.name!=='CARET'||!allowed.has(constants.get(v.name)))throw Error('Dynamic markup must use DOM text');value+=constants.get(v.name)+rhs.quasis[i+1].value.cooked;});
      if(!/^<svg[\s\S]+<\/svg>(<span class="[a-z -]+"><\/span>)+$/.test(value))throw Error('Unexpected row skeleton');
      allowed.add(value);
    }
    edits.push({start:rhs.start,end:rhs.end,value:`__blancMarkup.createHTML(${source.slice(rhs.start,rhs.end)})`});
  }
  for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.value+source.slice(e.end);
  if(!edits.length)throw Error('Expected reviewed HTML sinks');
  return `{\nconst __blancAllowed = new Set(${JSON.stringify([...allowed])});\nconst __blancMarkup = trustedTypes.createPolicy(${JSON.stringify('blanc-static-'+name)}, {createHTML(value) { if (!__blancAllowed.has(value)) throw new TypeError('Unapproved static markup'); return value; }});\n${source}\n}\n`;
}
