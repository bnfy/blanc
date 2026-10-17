// Local TLS termination only. No upstream client, DNS or forwarding in this module.
import http from 'node:http';
import tls from 'node:tls';
export async function serve({hosts,tlsMaterial,respond,fault}) {
  const allowed=new Set(hosts.map(h=>h+':443')),sockets=new Set();
  const parser=http.createServer(async(req,res)=>{
    const authority=req.socket.fixtureAuthority;
    if(!allowed.has(authority) || req.headers.host!==authority.slice(0,-4) || req.socket.servername!==authority.slice(0,-4)){
      fault('authority-mismatch');res.writeHead(502);res.end();return;
    }
    try {await respond(req,res,{httpVersion:req.httpVersion,alpn:req.socket.alpnProtocol||null});}
    catch {fault('responder-failed');if(!res.headersSent)res.writeHead(502);res.end();}
  });
  const server=http.createServer((_req,res)=>{fault('plaintext-refused');res.writeHead(502);res.end();});
  const context=tls.createSecureContext({key:tlsMaterial.key,cert:tlsMaterial.cert});
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  server.on('connect',(req,socket,head)=>{
    if(!allowed.has(req.url)||head.length){fault('connect-refused');socket.end('HTTP/1.1 502 Refused\r\nConnection: close\r\n\r\n');return;}
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const secure=new tls.TLSSocket(socket,{isServer:true,secureContext:context});
    secure.fixtureAuthority=req.url;secure.on('error',()=>secure.destroy());
    parser.emit('connection',secure);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {port:server.address().port,close:()=>new Promise(resolve=>{server.close(resolve);for(const s of sockets)s.destroy();})};
}
