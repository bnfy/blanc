'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,source='85883b1afa11375e1300130914d6f40c5388af21';
const mapping={'reader.html':'reader.html','reader.js':'reader.js','reader.css':'reader.css','reader-content.js':'reader-content.js','i18n.js':'i18n.js','purify.js':'reader-purify.generated.js','strings.js':'strings.en.js','instrument.woff2':'instrument-sans-latin-wdth-normal.woff2','inter.woff2':'inter-latin.woff2','mono.woff2':'jetbrains-mono-latin.woff2','serif.woff2':'source-serif-4-regular.woff2'};
const files=Object.fromEntries(Object.entries(mapping).map(([name,src])=>[name,{source:'src/renderer/pages/'+src,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'presentation',name))).digest('hex')}]));const output=JSON.stringify({source,scope:'unintegrated presentation fixture; English catalog only',files},null,2)+'\n',target=path.join(dir,'presentation-manifest.json');
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw Error('presentation drift')}else fs.writeFileSync(target,output);
