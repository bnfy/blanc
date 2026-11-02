// Authored fixture shared by document and worker execution contexts.
globalThis.runTransport = async ({url,fingerprint}) => {
 const transport=new WebTransport(url,{serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array(fingerprint)}]});
 transport.closed.catch(()=>{});
 let deadline;
 try {
  await Promise.race([transport.ready,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('fixture deadline')),50000);})]);
  const writer=transport.datagrams.writable.getWriter();await writer.write(new TextEncoder().encode('blanc-http3-proof'));
  const reader=transport.datagrams.readable.getReader();const echo=await reader.read();
  return {ready:true,echo:new TextDecoder().decode(echo.value)};
 } catch(e) {return {ready:false,error:String(e)};} finally {clearTimeout(deadline);transport.close();}
};
