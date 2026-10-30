const fs = require('node:fs');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const m = require('./shipping-glance-card.js');
let seed = 0x151458;
const random = n => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n);
const rect = a => ({x:a[0],y:a[1],width:a[2],height:a[3]});
const arr = r => [r.x,r.y,r.width,r.height];
const input = [], expected = [];
const edges = ['n','s','e','w','ne','nw','se','sw','invalid'];
for (let i=0;i<600;i++) {
  const area = [random(801)-400,random(801)-400,random(2001),random(1401)].map((x,j)=>x+(j<2?0.5:0));
  const frame = [random(2401)-800,random(1801)-600,random(2401)-200,random(1801)-200].map((x,j)=>x+(j<2?0.5:0));
  const delta = [random(1201)-600,random(1201)-600], edge=edges[random(edges.length)];
  const a=rect(area),f=rect(frame);
  for(const op of ['default','clamp','fractions','restore','move','resize','geometry']){
    input.push([op,...area,...frame,...delta,edge].join(' '));
    let v;
    switch(op){
      case 'default':v=arr(m.defaultCardFrame(a));break;
      case 'clamp':v=arr(m.clampCardFrame(f,a));break;
      case 'fractions':v=arr(m.frameToFractions(f,a));break;
      case 'restore':v=arr(m.fractionsToFrame(f,a));break;
      case 'move':v=arr(m.moveCardFrame(f,...delta,a));break;
      case 'resize':v=arr(m.resizeCardFrame(f,edge,...delta,a));break;
      case 'geometry':{const g=m.cardGeometry(f,a);v=[arr(g.chrome),arr(g.frame),arr(g.header),arr(g.page)];break;}
    }
    expected.push(v);
  }
}
const run=spawnSync('./geometry-oracle',[],{input:input.join('\n')+'\n',encoding:'utf8',maxBuffer:4*1024*1024});
if(run.status!==0)throw Error(`native oracle failed: ${run.status} ${run.stderr}`);
const actual=run.stdout.trim().split('\n').map(JSON.parse);
const equal=(a,b)=>Array.isArray(a)?Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>equal(x,b[i])):Math.abs(a-b)<1e-12;
const mismatches=[];for(let i=0;i<expected.length;i++)if(!equal(expected[i],actual[i]))mismatches.push({i,input:input[i],expected:expected[i],actual:actual[i]});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const result={cases:expected.length,outputs:actual.length,mismatches,sourceSha256:sha('glance_geometry.cc'),shippingSha256:sha('shipping-glance-card.js'),scope:'finite geometry arithmetic only; no native view, hit testing, lifetime, visual or browser proof'};
fs.writeFileSync('geometry-oracle-result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cases:result.cases,outputs:result.outputs,mismatches:mismatches.length}));
if(mismatches.length||actual.length!==expected.length)process.exitCode=1;
