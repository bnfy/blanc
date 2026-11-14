import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {acceptFixtureWebSocket} from './websocket-handshake.mjs';
test('real RFC6455 handshake negotiates protocol and delivers fixture message',async()=>{
 const arrivals=[],sockets=new Set();
 const server=http.createServer((_req,res)=>{res.writeHead(404);res.end();});
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 server.on('upgrade',(req,socket,head)=>acceptFixtureWebSocket(req,socket,head,arrivals));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const result=await new Promise((resolve,reject)=>{
   const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`,'blanc-fixture');
   const timer=setTimeout(()=>{ws.close();reject(Error('handshake deadline'));},3000);
   ws.onerror=()=>{clearTimeout(timer);reject(Error('handshake failed'));};
   ws.onmessage=e=>{clearTimeout(timer);resolve({data:e.data,protocol:ws.protocol});ws.close();};
  });
  assert.deepEqual(result,{data:'blanc-handshake-ok',protocol:'blanc-fixture'});
  assert.equal(arrivals.length,1);
 } finally { for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve)); }
});
test('rejects malformed or unmanifested handshake without recording arrival',()=>{
 for(const change of [{url:'/outside'},{headers:{}},{method:'POST'}]){
  const arrivals=[],writes=[];
  const req={method:'GET',url:'/socket',headers:{upgrade:'websocket','sec-websocket-version':'13','sec-websocket-protocol':'blanc-fixture','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ=='},...change};
  assert.equal(acceptFixtureWebSocket(req,{end:v=>writes.push(v)},Buffer.alloc(0),arrivals),false);
  assert.equal(arrivals.length,0);assert.match(writes[0],/^HTTP\/1.1 400/);
 }
});
