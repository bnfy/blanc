const { spawnSync } = require('node:child_process');
const { isPublicAddress } = require('../shipping/dark-websites');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
let x=0x12567d9a;
function word(){x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;}
const addresses=[];
for(let i=0;i<5000;i++) { const v=word(); addresses.push([v>>>24,(v>>>16)&255,(v>>>8)&255,v&255].join('.')); }
for(let i=0;i<5000;i++) { const a=[];for(let k=0;k<8;k++)a.push((word()&65535).toString(16)); addresses.push(a.join(':')); }
addresses.push('0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.0.1','172.31.255.255','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','64:ff9b::1','64:ff9b:1::1','100::1','2001:db8::1','2002::1','fc00::1','fe80::1','fec0::1','ff00::1','8.8.8.8','2606:4700:4700::1111');
const p=spawnSync(path.join(__dirname,'reader-address-policy-test'),['oracle'],{input:addresses.join('\n')+'\n',encoding:'utf8'});
if(p.status!==0)throw Error(`native oracle exit ${p.status}: ${p.stderr}`);
const rows=p.stdout.trim().split('\n');if(rows.length!==addresses.length)throw Error('bad row count');
const mismatch=addresses.filter((v,i)=>(rows[i]==='1')!==isPublicAddress(v));
const mapped=['::ffff:8.8.8.8','::ffff:127.0.0.1'];
const m=spawnSync(path.join(__dirname,'reader-address-policy-test'),['oracle'],{input:mapped.join('\n')+'\n',encoding:'utf8'});
const mappedNative=m.stdout.trim().split('\n');if(m.status!==0||mappedNative.some(v=>v!=='0'))throw Error('mapped addresses must be rejected');
const result={status:mismatch.length?'failed':'passed',scope:'standalone address policy only; no DNS, connection pinning, proxy or blocker',samples:addresses.length,mismatches:mismatch,mapped:mapped.map((address,i)=>({address,shipping:isPublicAddress(address),native:mappedNative[i]==='1'})),shippingSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../shipping/dark-websites.js'))).digest('hex')};
fs.writeFileSync(path.join(__dirname,'reader-address-oracle-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(mismatch.length)process.exitCode=1;
