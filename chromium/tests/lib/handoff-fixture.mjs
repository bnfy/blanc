// A tab handoff as the Bring Your Tabs extension makes one (shipping's
// tab-import-handoff.js is the reader): a blanc-import: link carrying the id
// and the key, and the relay's reply for it.
import crypto from 'node:crypto';
export function makeHandoff({tabs=[{url:'https://example.test/a',title:'A',active:true}],sourceBrowser='chrome',
  expiresIn=5*60*1000,expiresAt=Date.now()+expiresIn,payload,key=crypto.randomBytes(32),id=crypto.randomBytes(16),
  aadId,tamper=false}={}){
 const idText=id.toString('base64url'),iv=crypto.randomBytes(12);
 const plain=Buffer.from(JSON.stringify(payload??{v:1,sourceBrowser,tabs}));
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(JSON.stringify(['blanc-tab-handoff',2,aadId??idText,expiresAt])));
 const sealed=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 if(tamper)sealed[0]^=1;
 const envelope={v:2,algorithm:'AES-GCM',iv:iv.toString('base64url'),ciphertext:sealed.toString('base64url'),expiresAt};
 return {id:idText,key,link:`blanc-import://tabs?v=1&id=${idText}&key=${key.toString('base64url')}`,envelope,
  reply:Buffer.from(JSON.stringify(envelope))};
}
