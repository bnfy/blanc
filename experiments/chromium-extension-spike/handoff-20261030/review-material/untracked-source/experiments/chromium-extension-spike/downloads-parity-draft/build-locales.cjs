'use strict';
// Produces only a new isolated asset directory; it never edits shipping files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {merge,LOCALES}=require('./downloads-locales.cjs');
const root=__dirname,out=path.join(root,'generated-locales-v3');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const wrapper=data=>`(function (root, data) { if (typeof module !== 'undefined' && module && module.exports) module.exports = data; else root.blancStrings = data; })(typeof self !== 'undefined' ? self : this, ${JSON.stringify(data)});\n`;
function expected(){
 const files={},inputs={};
 const pinBytes=fs.readFileSync(path.join(root,'shipping-source-sha256.json'));
 const pins=JSON.parse(pinBytes);
 if(pins.commit!=='6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d' || Object.keys(pins.files).length!==LOCALES.length)throw Error('Invalid released-source pin');
 for(const locale of LOCALES){const name=`strings.${locale}.js`,p=path.join(root,'shipping',name);inputs[name]=sha(fs.readFileSync(p));if(inputs[name]!==pins.files[name])throw Error('Released source mismatch: '+name);files[name]=wrapper(merge(locale,require(p)));}
 const additions=fs.readFileSync(path.join(root,'downloads-locales.json'));inputs['downloads-locales.json']=sha(additions);
 inputs['shipping-source-sha256.json']=sha(pinBytes);
 inputs['build-locales.cjs']=sha(fs.readFileSync(__filename));
 inputs['downloads-locales.cjs']=sha(fs.readFileSync(path.join(root,'downloads-locales.cjs')));
 const manifest={reference:'v1.45.0 / 6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d',inputs,outputs:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,sha(content)]))};
 files['manifest.json']=JSON.stringify(manifest,null,2)+'\n';return files;
}
const mode=process.argv[2],files=expected();
if(mode==='--write'){
 fs.mkdirSync(out);for(const [name,content] of Object.entries(files))fs.writeFileSync(path.join(out,name),content,{flag:'wx'});
 console.log('Wrote isolated locale assets; no production assets changed.');
}else if(mode==='--check'){
 const names=fs.readdirSync(out).sort();if(JSON.stringify(names)!==JSON.stringify(Object.keys(files).sort()))throw Error('Locale inventory mismatch');
 for(const [name,content] of Object.entries(files))if(fs.readFileSync(path.join(out,name),'utf8')!==content)throw Error('Locale asset drift: '+name);
 console.log('PASS isolated locale assets match pinned inputs.');
}else throw Error('Use --write once or --check.');
