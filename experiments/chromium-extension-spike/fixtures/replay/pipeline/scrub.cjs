'use strict';
const {createHash} = require('node:crypto');
const zlib = require('node:zlib');
const LIMIT = 2 * 1024 * 1024;
const digest = data => createHash('sha256').update(data).digest('hex');
// Narrow admission policy, not a claim that heuristics prove arbitrary content private.
class Refusal extends Error { constructor(code) { super(code); this.code=code; } }
const refuse = code => { throw new Refusal(code); };
const sensitive = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:access[_-]?token|refresh[_-]?token|session[_-]?id|password|authorization|document\.cookie|localStorage)\s*[=:])/i;
function safeUrl(value) {
  if(typeof value!=='string') refuse('invalid-url');
  let u; try { u=new URL(value); } catch { refuse('invalid-url'); }
  if(!['http:','https:'].includes(u.protocol) || u.username || u.password || u.hash) refuse('unsupported-url');
  let decoded=value;
  try { for(let i=0;i<3;i++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;} } catch { refuse('url-encoding'); }
  if(sensitive.test(decoded) || /[a-f0-9]{24,}|[A-Za-z0-9_-]{40,}|\d{10,}/i.test(decoded)) refuse('identifier-url');
  for(const [key,val] of u.searchParams) {
    if(/(?:^|[_-])(?:id|uid|sid|token|key|auth|session|email|user|cookie|clickid|gclid|fbclid|msclkid|signature|sig)(?:$|[_-])/i.test(key) ||
       /^(?:utm_|x-amz-|x-goog-)|(?:token|session|userid|clientid|deviceid|visitorid|trackingid)/i.test(key) || sensitive.test(val)) refuse('identifier-query');
  }
  return value; // Never normalize or rewrite blocker-visible URLs.
}
const requestAllowed=new Set(['accept','accept-language','content-type','referer','user-agent']);
const responseAllowed=new Set(['content-type','content-language','cache-control','content-security-policy','x-content-type-options','access-control-allow-origin','vary']);
function headers(raw, side) {
  if(!Array.isArray(raw) || raw.length%2) refuse('invalid-headers');
  const output={},removed={}; const allowed=side==='request'?requestAllowed:responseAllowed;
  for(let i=0;i<raw.length;i+=2) {
    const name=String(raw[i]).toLowerCase(),value=String(raw[i+1]);
    if(!allowed.has(name)) {removed[name]=(removed[name]||0)+1;continue;}
    if(Object.hasOwn(output,name)) refuse('duplicate-header');
    if(sensitive.test(value) || /[\r\n]/.test(value)) refuse('sensitive-header');
    if(name==='referer' && value) safeUrl(value);
    if(name==='vary' && value.trim()) refuse('vary-unsupported');
    output[name]=value;
  }
  // Header names are untrusted too. Only aggregate counts leave memory.
  return {headers:output,removedCount:Object.values(removed).reduce((a,b)=>a+b,0)};
}
function decodeBody(body, encoding) {
  if(!Buffer.isBuffer(body) || body.length>LIMIT) refuse('body-limit');
  try {
    if(!encoding || encoding==='identity') return body;
    if(encoding==='gzip')return zlib.gunzipSync(body,{maxOutputLength:LIMIT});
    if(encoding==='deflate')return zlib.inflateSync(body,{maxOutputLength:LIMIT});
    if(encoding==='br')return zlib.brotliDecompressSync(body,{maxOutputLength:LIMIT});
  } catch { refuse('body-decode'); }
  refuse('encoding-unsupported');
}
function sanitizeExchange({url,method,requestHeaders,status,responseHeaders,body,protocol}) {
  safeUrl(url); if(method!=='GET')refuse('method-unsupported');
  if(status!==200)refuse('status-unsupported'); // Redirect correlation is not implemented.
  const request=headers(requestHeaders,'request'),response=headers(responseHeaders,'response');
  const enc=[];for(let i=0;i<responseHeaders.length;i+=2)if(responseHeaders[i].toLowerCase()==='content-encoding')enc.push(responseHeaders[i+1]);
  if(enc.length>1)refuse('duplicate-encoding');
  const bytes=decodeBody(body,enc[0]);
  const type=response.headers['content-type']||'';
  if(!/^(?:text\/(?:html|plain|css|javascript)|application\/(?:javascript|json))(?:;|$)/i.test(type))refuse('body-type-unsupported');
  if(/charset\s*=\s*(?!utf-8(?:\s|;|$))[^;]+/i.test(type))refuse('charset-unsupported');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{refuse('body-not-utf8');}
  if(/\\[ux][0-9a-f]{2,4}|[a-f0-9]{24,}|[A-Za-z0-9_-]{60,}/i.test(text))refuse('encoded-or-opaque-body');
  if(sensitive.test(text) || /(?:["'](?:token|password|sessionId|userId|email|authorization)["']\s*:|[?&](?:uid|sid|gclid|fbclid|token|session)=)/i.test(text))refuse('sensitive-body');
  for(const match of text.matchAll(/https?:\/\/[^\s"'<>`\\]+/g))safeUrl(match[0]);
  return {url,method,status,requestHeaders:request.headers,headers:response.headers,
    body:bytes.toString('base64'),sha256:digest(bytes),protocol,
    transformations:{removedRequestHeaders:request.removedCount,removedResponseHeaders:response.removedCount,decoded:enc[0]||'identity'}};
}
function decision(row) {
  safeUrl(row.url);
  for(const value of [row.referrer,row.initiatorOrigin,row.frame?.url,row.frame?.topUrl,row.tabUrl]) {
    if(value && value!=='null')safeUrl(value);
  }
  if(row.result?.redirectURL)safeUrl(row.result.redirectURL);
  if(row.error)refuse('provider-error');
  if(sensitive.test(JSON.stringify(row)))refuse('sensitive-decision');
  return row;
}
module.exports={Refusal,refuse,safeUrl,headers,sanitizeExchange,decision,digest,LIMIT};
