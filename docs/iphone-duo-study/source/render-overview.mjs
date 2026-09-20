import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const image=(name,x,y,w,h)=>{
  const data=fs.readFileSync(path.join(dir,`../plates/${name}.png`)).toString('base64');
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${data}"/>`;
};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const t=(x,y,s,size=30,weight=400,color='#202324',extra='')=>`<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(s)}</text>`;
const r=(x,y,w,h,rx,fill,stroke='none',sw=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const chip=(x,y,n)=>`${r(x,y,54,54,27,'#242829')}${t(x+27,y+38,n,29,650,'#FFF','text-anchor="middle"')}`;
const card=(x,y,w,title,lines)=>`${r(x,y,w,560,40,'#FFFFFF','#DBDEDD',2)}${t(x+48,y+78,title,47,650)}${lines.map((s,i)=>t(x+48,y+162+i*72,s,32,430,'#62696A')).join('')}`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="2400" viewBox="0 0 3200 2400">
  ${r(0,0,3200,2400,0,'#F7F6F3')}
  ${t(150,115,'Blanc for iPhone Duo — concept',36,600)}
  ${t(3050,115,'Island design study',30,450,'#7A807E','text-anchor="end"')}
  ${r(150,260,1390,1120,46,'#FFF','#DFE1DF',2)}
  ${r(1660,260,1390,1120,46,'#FFF','#DFE1DF',2)}
  ${t(215,337,'At rest',42,600)}${t(1725,337,'Island open',42,600)}
  ${image('inner-resting',205,400,1280,960)}
  ${image('inner-expanded',1715,400,1280,960)}
  ${chip(1420,535,'1')}${chip(1420,872,'2')}${chip(2930,925,'3')}
  ${card(150,1490,900,'1  System-owned',[
    'Shared bar silhouette and placement',
    'Camera, status, and fold clearance',
    'Adaptive grouping and overflow'
  ])}
  ${card(1150,1490,900,'2  Blanc-owned',[
    'Three tab slots; active favicon',
    'Back, New Tab, cut-shield',
    'Page identity and Island card'
  ])}
  ${card(2150,1490,900,'3  Future iOS work',[
    'Collapsible named groups',
    'Private tabs',
    'Per-site Blocker toggle'
  ])}
  ${t(155,2190,'Art direction follows simulator bar placement; exact control grouping and overflow require implementation validation.',27,430,'#777E7D')}
</svg>`;
fs.writeFileSync(path.join(dir,'overview.svg'),svg);
