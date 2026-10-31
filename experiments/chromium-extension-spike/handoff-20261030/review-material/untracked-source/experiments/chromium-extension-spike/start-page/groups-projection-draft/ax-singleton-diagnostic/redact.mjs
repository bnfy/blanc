// Proof is deliberately limited to synthetic test data; never persist titles or URLs.
export function redact(value) {
  if(Array.isArray(value))return value.map(redact);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k,v])=>!/(?:url|title|text|args)/i.test(k)&&(k!=='name'||v==='before-click'||v==='after-reply')).map(([k,v])=>[k,redact(v)]));
  if(typeof value==='string'&&/(?:https?:\/\/|chrome:\/\/|file:\/\/|about:)/i.test(value))return '[redacted]';
  return value;
}
