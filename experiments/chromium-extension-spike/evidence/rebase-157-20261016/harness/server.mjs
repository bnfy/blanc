import http from 'node:http';
import fs from 'node:fs';
const icon = fs.readFileSync('/private/tmp/blanc-chromium157-work/src/renderer/pages/sunrise-mark.png');
http.createServer((req,res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8786');
  if(url.pathname === '/favicon.ico') {res.writeHead(404);res.end();return;}
  if(url.pathname === '/icon.png') {res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(icon);return;}
  const label = url.pathname.slice(1).replace(/[^a-zA-Z0-9-]/g,' ') || 'Alpha';
  const delay = url.searchParams.has('late') ? 5000 : 0;
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
  res.end(`<!doctype html><meta charset="utf-8"><title>Rebase157 ${label}</title><style>body{font:24px system-ui;padding:48px;background:#f8f2df;color:#282412}</style><h1>Rebase157 ${label}</h1><p>Local keyboard and mouse test fixture.</p><input id="typing" placeholder="Typing test"><button id="popup">Open non-Island window</button><script>
  setTimeout(()=>{const l=document.createElement('link');l.rel='icon';l.href='/icon.png?'+Date.now();document.head.append(l)},${delay});
  document.querySelector('#popup').onclick=()=>window.open('/Popup','native858-popup','popup,width=800,height=600');
  </script>`);
}).listen(8786,'127.0.0.1',()=>console.log('Rebase157 fixtures: http://127.0.0.1:8786'));
