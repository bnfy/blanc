import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { startProxy, urls } from './proxy.mjs';

const request = (port, url) => new Promise((resolve, reject) => {
  const req = http.request({hostname:'127.0.0.1',port,path:url,
    headers:{Host:new URL(url).host}}, res => {
    let body='';res.setEncoding('utf8');res.on('data',part=>body+=part);
    res.on('end',()=>resolve({status:res.statusCode,body}));
  });req.on('error',reject);req.end();
});
test('absolute fixture URL and original Host survive the proxy', async () => {
  const p=await startProxy();
  try {
    const response=await request(p.port,urls.data);
    assert.equal(response.status,200);
    assert.equal(response.body,'{"fixture":"allowed"}');
    assert.equal(p.requests[0].url,urls.data);
    assert.equal(p.requests[0].host,new URL(urls.data).host);
  } finally {await p.close();}
});
test('unknown URLs including changed scheme, port and query are refused', async () => {
  const p=await startProxy();
  try {
    for(const url of [urls.data+'?new=1',urls.data.replace('http:','https:'),
      urls.data.replace('.test/','.test:8888/'),'http://unlisted.invalid/']) {
      assert.equal((await request(p.port,url)).status,502);
    }
    assert(p.requests.every(r=>!r.known));
  } finally {await p.close();}
});
test('CONNECT fails instead of tunnelling to an external host', async () => {
  const p=await startProxy();
  try {
    const response=await new Promise((resolve,reject)=>{
      const socket=net.connect(p.port,'127.0.0.1',()=>socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n'));
      let data='';socket.on('data',part=>data+=part);socket.on('end',()=>resolve(data));socket.on('error',reject);
    });
    assert.match(response,/502 Fixture TLS not implemented/);
    assert.equal(p.requests[0].method,'CONNECT');
  } finally {await p.close();}
});
