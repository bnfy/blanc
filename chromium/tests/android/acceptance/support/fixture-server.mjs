// The acceptance harness's HTTPS fixture server, in a worker thread (see startFixtures in
// device.mjs). Importing it outside a worker only gives fixturePage, for its test.
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {isMainThread, workerData} from 'node:worker_threads';
import {pageTitle} from './parse.mjs';

// A page per address: its title is its host (and path), "/words?w=widget&n=3" repeats a word,
// "/link" is one link to child.example filling the page (target=_blank), and every page has a
// button that counts its clicks in document.title's data-clicks.
const text = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fixturePage(url) {
  const title = text(decodeURIComponent(pageTitle(url.hostname, url.pathname)));
  const word = text(url.searchParams.get('w') ?? '');
  const words = word ? Array.from({length: Number(url.searchParams.get('n'))}, (_, i) => `<p>${word} number ${i + 1}</p>`).join('') : '';
  const link = url.pathname === '/link'
    ? '<a id="child" href="https://child.example/" target="_blank" style="position:fixed;inset:0;z-index:1;display:block;font-size:40px">Open child</a>' : '';
  // "/ads": a request EasyList blocks, one it doesn't, and an element it hides. The second blocked
  // request comes after load: a request racing the page's commit can miss the shield count.
  const ads = url.pathname === '/ads' ? `<script src="https://ad.doubleclick.net/tag.js"></script>
<script src="https://lib.example/lib.js"></script><div id="hidden-ad" class="ADBox">ad</div>
<script>addEventListener('load',()=>document.head.append(Object.assign(document.createElement('script'),{src:'https://ad.doubleclick.net/late.js'})))</script>` : '';
  // Requests no tab makes: a service worker's fetch, and a prefetch.
  const worker = url.pathname === '/sw' ? `<script>window.workerReady=navigator.serviceWorker.register('/worker.js').then(()=>navigator.serviceWorker.ready).then(()=>{window.workerUp=true});</script>` : '';
  const prefetch = url.pathname === '/prefetch' ? '<link rel="prefetch" href="https://ad.doubleclick.net/prefetch.js"><link rel="prefetch" href="https://lib.example/prefetch-allowed.js"><script type="speculationrules">{"prefetch":[{"source":"list","urls":["https://ad.doubleclick.net/speculation.js"]}]}</script>' : '';
  // "/first-ad": the page's first bytes ask for a blocked script, so the request can reach the
  // browser before the browser has processed the commit.
  // Back to it from the back-forward cache, it asks for another.
  const first = url.pathname === '/first-ad' ? `<script src="https://ad.doubleclick.net/first.js"></script>
<script>addEventListener('pageshow',e=>{if(e.persisted){document.title='restored';document.head.append(Object.assign(document.createElement('script'),{src:'https://ad.doubleclick.net/back.js?'+Date.now()}))}})</script>` : '';
  return `<!doctype html>${first}<meta name="viewport" content="width=device-width"><title>${title}</title>
<button id="clicker" style="width:100%;height:40vh;font-size:30px" onclick="this.dataset.clicks=(+this.dataset.clicks||0)+1">${title}</button>
${words}${link}${ads}${worker}${prefetch}<div style="height:150vh"></div>`;
}

if (!isMainThread) {
  const {dir, port, requestLog} = workerData;
  const size = new Int32Array(requestLog, 0, 1);
  const bytes = new Uint8Array(requestLog, 4);
  const encoder = new TextEncoder();
  const record = line => {
    const encoded = encoder.encode(`${line}\n`);
    const at = Atomics.load(size, 0);
    if (at + encoded.length > bytes.length) return;
    bytes.set(encoded, at);
    Atomics.store(size, 0, at + encoded.length);
  };
  https.createServer({key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem'))},
    (request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      // no-store would keep a page out of the back-forward cache.
      if (!request.url.endsWith('?cached')) response.setHeader('cache-control', 'no-store');
      record(`${request.headers.host}${request.url}`);
      if (request.url === '/worker.js') {
        response.setHeader('content-type', 'text/javascript');
        response.end(`self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(Promise.all(['https://ad.doubleclick.net/sw-fetch.js','https://lib.example/sw-allowed.js'].map(u=>fetch(u,{mode:'no-cors'}).catch(()=>{}))))});`);
        return;
      }
      if (request.url.endsWith('.js')) {
        response.setHeader('content-type', 'text/javascript');
        response.end(`window.loaded=(window.loaded||[]).concat(location.hostname);`);
        return;
      }
      response.end(fixturePage(new URL(request.url, `https://${request.headers.host}`)));
    }).listen(port);
}
