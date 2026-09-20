import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const t = (x,y,s,size=34,weight=400,color='#202324',extra='') => `<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(s)}</text>`;
const r = (x,y,w,h,rx,fill,stroke='none',sw=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const c = (x,y,rad,fill) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"/>`;
const line = (x1,y1,x2,y2,stroke='#DFE0DF') => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
const defs = `<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="25" flood-color="#363B3B" flood-opacity=".13"/></filter></defs>`;
const shield = (x,y,on=true,k=5) => `<g transform="translate(${x-8*k} ${y-8*k}) scale(${k})" fill="none" stroke="${on?'#1D2021':'#8F9595'}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l5 1.9v3.8c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.7z"/><path d="M4.4 11.47 12.61 3.55"/></g>`;
const back = (x,y) => `<g transform="translate(${x-40} ${y-40}) scale(5)"><path d="M9.75 3.5 5.25 8l4.5 4.5" fill="none" stroke="#1D2021" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const plus = (x,y) => `<g transform="translate(${x-40} ${y-40}) scale(5)"><path d="M8 3v10M3 8h10" fill="none" stroke="#1D2021" stroke-width="1.4" stroke-linecap="round"/></g>`;
const more = (x,y) => [-15,0,15].map(dx=>c(x+dx,y,5,'#1D2021')).join('');
const favicon = (x,y,letter,color='#242728',size=55) => `${r(x-size/2,y-size/2,size,size,size*.26,color)}${t(x,y+size*.18,letter,size*.58,650,'#FFF','text-anchor="middle"')}`;
function rail(x,y,on=true,focus='none') {
  const ys=Array.from({length:8},(_,i)=>y+68+i*132);
  return `<g filter="url(#shadow)">${r(x-70,y,140,1078,70,'#FCFDFD','#D9DCDD',2)}</g>
    ${back(x,ys[0])}${c(x,ys[1],7,'#BDC1C1')}${c(x,ys[2],7,'#BDC1C1')}
    ${c(x,ys[3],46,'#EFF0EF')}${favicon(x,ys[3],'M')}
    ${focus==='tabs'?c(x,ys[4],46,'#ECEEEE'):''}${t(x,ys[4]+11,'+2',32,550,'#555B5D','text-anchor="middle"')}
    ${plus(x,ys[5])}${focus==='blocker'?c(x,ys[6],46,'#ECEEEE'):''}${shield(x,ys[6],on)}${more(x,ys[7])}`;
}
const board=(title,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="2400" viewBox="0 0 3200 2400">${defs}${r(0,0,3200,2400,0,'#F7F6F3')}${t(210,120,'Blanc for iPhone Duo — concept',34,600)}${t(2990,120,title,30,450,'#797E7C','text-anchor="end"')}${body}</svg>`;

function blocker(on) {
  const x=2610,y=555;
  const cardX=1000,cardY=895;
  const status=on?'On for this site':'Off for this site';
  const detail=on?'Ads and trackers are blocked here.':'Ads and trackers are allowed here.';
  return board(on?'Blocker on':'Blocker off',`
    ${t(290,470,'Blanc Blocker',86,600)}
    ${r(222,690,2750,1360,82,'#FBFAF8','#E1E2DF',3)}
    ${rail(x,y,on,'blocker')}
    <g filter="url(#shadow)">${r(cardX,cardY,1530,930,55,'#FCFDFD','#D8DBDB',2)}</g>
    <path d="M2528 1418l43 48-43 48z" fill="#FCFDFD" stroke="#D8DBDB" stroke-width="2"/>
    ${r(2527,1434,12,62,0,'#FCFDFD')}
    ${shield(1106,1020,on,5.4)}
    ${t(1195,1025,'Blanc Blocker',47,650)}
    ${line(1060,1087,2470,1087)}
    ${t(1060,1180,'atelier-margin.example',34,500,'#62696A')}
    ${t(1060,1285,status,69,650)}
    ${t(1060,1360,detail,36,400,'#62696A')}
    ${r(1060,1452,1410,105,30,'#F1F3F3')}
    ${t(1098,1518,'Site protection',37,550)}
    ${r(2260,1470,164,70,35,on?'#242829':'#BBC0C0')}${c(on?2382:2302,1505,28,'#FFF')}
    ${t(1060,1660,'Global blocking',31,450,'#777D7E')}${t(2470,1660,'Settings',31,550,'#454B4C','text-anchor="end"')}
  `);
}

function tabRow(y,letter,color,title,domain,selected=false) {
  return `${selected?r(440,y-55,1660,124,26,'#E9EBEB'):''}${favicon(510,y,letter,color,58)}${t(568,y-8,title,40,selected?650:500)}${t(568,y+37,domain,28,400,'#777C7D')}${selected?c(2030,y,8,'#1C2021'):''}`;
}

function overflow() {
  return board('Tab overflow',`
    ${t(290,425,'All open tabs',84,600)}
    ${r(222,610,2750,1530,82,'#FBFAF8','#E1E2DF',3)}
    <g filter="url(#shadow)">${r(360,745,1810,1220,58,'#FCFDFD','#D8DBDB',2)}</g>
    <path d="M2170 1275l42 48-42 48z" fill="#FCFDFD" stroke="#D8DBDB" stroke-width="2"/>
    ${r(2168,1291,12,61,0,'#FCFDFD')}
    ${t(440,842,'Tabs',53,650)}${t(2080,842,'5 open',32,450,'#7A8080','text-anchor="end"')}
    ${t(440,938,'Pinned',32,550,'#676D6E')}
    ${tabRow(1022,'C','#907E6D','Correspondence','mail.example')}
    ${tabRow(1151,'L','#61716D','Landscape Archive','archive.example')}
    ${line(440,1235,2090,1235)}
    <path d="M448 1291l16 16 16-16" fill="none" stroke="#62696A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${t(510,1318,'Inspiration',38,600)}${t(2055,1318,'3',31,400,'#858B8C','text-anchor="end"')}
    ${tabRow(1408,'I','#727C71','Material Index','materials.example')}
    ${tabRow(1538,'M','#242728','A house for the in-between','atelier-margin.example',true)}
    ${tabRow(1668,'R','#9A8168','Research Notes','notes.example')}
    ${line(440,1753,2090,1753)}
    ${r(440,1790,370,104,50,'#242829')}${t(490,1858,'+  New Tab',36,600,'#FFF')}
    ${rail(2570,710,true,'tabs')}
    ${t(2240,1955,'Tab overflow',31,500,'#777C7D')}
    ${t(2870,1955,'•••  Browser actions',31,500,'#777C7D','text-anchor="end"')}
  `);
}

for (const [name,svg] of [['blocker-on',blocker(true)],['blocker-off',blocker(false)],['tab-overflow',overflow()]]) {
  fs.writeFileSync(path.join(dir,`${name}.svg`),svg);
}
