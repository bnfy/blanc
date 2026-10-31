'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname, source=path.join(root,'shipping/bangs-catalog.js');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(root,'result.json'),'utf8'));
if(sha(fs.readFileSync(source))!==receipt.shippingFilesSha256['bangs-catalog.js'])throw Error('released catalog changed');
const catalog=require(source);
if(!Array.isArray(catalog)||!Array.isArray(catalog.popular)||catalog.some(x=>!Array.isArray(x)||x.length!==7||!Array.isArray(x[1])||!Number.isInteger(x[5])))throw Error('invalid released catalog');
const output=JSON.stringify({version:1,entries:catalog,popular:catalog.popular})+'\n';
const target=path.join(root,'native/catalog.json'),manifest=path.join(root,'native/catalog-result.json');
if(fs.existsSync(manifest)){const old=JSON.parse(fs.readFileSync(manifest));if(old.sha256!==sha(output)||old.sourceSha256!==sha(fs.readFileSync(source)))throw Error('catalog drift');}
fs.writeFileSync(target,output);fs.writeFileSync(manifest,JSON.stringify({release:'v1.45.1',commit:'85883b1afa11375e1300130914d6f40c5388af21',sourceSha256:sha(fs.readFileSync(source)),sha256:sha(output),entries:catalog.length,popular:catalog.popular.length,scope:'deterministic source data conversion; native loader and validation not implemented'},null,2)+'\n');
console.log(JSON.stringify({entries:catalog.length,popular:catalog.popular.length,sha256:sha(output)}));
