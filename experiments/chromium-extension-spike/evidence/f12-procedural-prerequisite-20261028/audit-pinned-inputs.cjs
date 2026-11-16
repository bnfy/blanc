const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {CosmeticFilter}=require(path.resolve('node_modules/@ghostery/adblocker'));
const {classifySelector,SelectorType}=require(path.resolve('node_modules/@ghostery/adblocker-extended-selectors'));
const pinned=JSON.parse(fs.readFileSync('adblock/sources/pinned.json'));
const report={scope:'Pinned cosmetic parser compatibility; offline inventory, not browser outcomes',lists:[],total:0,accepted:0,rejected:[],extendedFamilies:{}};
for(const list of pinned.lists){const data=fs.readFileSync('adblock/sources/'+list.file);if(crypto.createHash('sha256').update(data).digest('hex')!==list.sha256)throw Error('list hash');report.lists.push({file:list.file,sha256:list.sha256});
for(const [i,line] of data.toString().split(/\r?\n/).entries()){
 if(!line||line.startsWith('!')||line.startsWith('['))continue;
 const m=/^([^#]*)(#@\?#|#\?#|#@#|##)(.+)$/.exec(line);if(!m)continue;
 const normalized=m[1]+(m[2].includes('@')?'#@#':'##')+m[3];
 report.total++;const filter=CosmeticFilter.parse(normalized);
 if(!filter){report.rejected.push({file:list.file,line:i+1,rule:line,normalized});continue}report.accepted++;
 for(const name of new Set([...m[3].matchAll(/:([-a-z]+)\(/g)].map(x=>x[1]))) report.extendedFamilies[name]=(report.extendedFamilies[name]||0)+1;
}}
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({total:report.total,accepted:report.accepted,rejected:report.rejected.length,families:report.extendedFamilies}));
