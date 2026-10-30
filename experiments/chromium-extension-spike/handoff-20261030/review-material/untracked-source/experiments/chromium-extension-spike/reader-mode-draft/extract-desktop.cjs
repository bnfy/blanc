'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,input=fs.readFileSync(path.join(dir,'shipping/reader-extract.generated.js'),'utf8');
const digest=crypto.createHash('sha256').update(input).digest('hex');if(digest!=='1f4ed2433c81b735eee155a6da863e78d3314ad2f915cab6f3049f7281a7df28')throw Error('shipping generated extractor changed');
const prefix='(() => {\n  const article = ',boundary='\n  if (!article) return null;\n  article.imageData = {};';
if(!input.startsWith(prefix)||input.split(boundary).length!==2)throw Error('wrapper changed');const inner=input.slice(prefix.length,input.indexOf(boundary));if(!inner.endsWith(';'))throw Error('unexpected inner expression');const output=inner.slice(0,-1)+'\n',target=path.join(dir,'desktop-extract.js');
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw Error('extractor drift')}else fs.writeFileSync(target,output);
