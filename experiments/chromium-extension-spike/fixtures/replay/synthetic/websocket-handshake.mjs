// Authored bounded handshake fixture, not a general WebSocket server.
import {createHash} from 'node:crypto';
export function acceptFixtureWebSocket(req, socket, head, arrivals) {
  const key=req.headers['sec-websocket-key'];
  if(head.length || req.method!=='GET' || req.url!=='/socket' ||
     req.headers.upgrade?.toLowerCase()!=='websocket' ||
     req.headers['sec-websocket-version']!=='13' ||
     req.headers['sec-websocket-protocol']!=='blanc-fixture' ||
     typeof key!=='string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return false;
  }
  arrivals.push({host:req.headers.host,origin:req.headers.origin??null,path:req.url,
    protocol:'blanc-fixture'});
  const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\nSec-WebSocket-Protocol: blanc-fixture\r\n\r\n');
  const payload=Buffer.from('blanc-handshake-ok');
  socket.write(Buffer.concat([Buffer.from([0x81,payload.length]),payload]));
  socket.setTimeout(5000,()=>socket.destroy());
  // The only client frame accepted by this fixture is the end of the probe.
  socket.once('data',()=>socket.end(Buffer.from([0x88,0])));
  socket.on('error',()=>socket.destroy());
  return true;
}
