import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const photo=fs.readFileSync(path.join(dir,'../references/architecture-hero.png')).toString('base64');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const t=(x,y,s,size=30,weight=400,color='#202323',extra='')=>`<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(s)}</text>`;
const r=(x,y,w,h,rx,fill,stroke='none',sw=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const c=(x,y,rad,fill)=>`<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"/>`;
const shield=(x,y,k=2.4)=>`<g transform="translate(${x-8*k} ${y-8*k}) scale(${k})" fill="none" stroke="#202424" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l5 1.9v3.8c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.7z"/><path d="M4.4 11.47 12.61 3.55"/></g>`;
const plus=(x,y)=>`<path d="M${x} ${y-13}v26M${x-13} ${y}h26" fill="none" stroke="#202424" stroke-width="4" stroke-linecap="round"/>`;
function rail(x,y,side='right',compressed=false){
  const h=compressed?440:530;
  const step=compressed?64:69;
  const ys=Array.from({length:7},(_,i)=>y+41+i*step);
  return `${r(x-39,y,78,h,39,'#FCFDFD','#D9DDDD',2)}
    <path d="M${x+9} ${ys[0]-11}l-11 11 11 11" fill="none" stroke="#202424" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${c(x,ys[1],4,'#BCC1C1')}${c(x,ys[2],4,'#BCC1C1')}
    ${c(x,ys[3],24,'#ECEEEE')}${r(x-16,ys[3]-16,32,32,8,'#242829')}${t(x,ys[3]+9,'M',24,650,'#FFF','text-anchor="middle"')}
    ${t(x,ys[4]+7,'+2',22,550,'#555B5D','text-anchor="middle"')}
    ${plus(x,ys[5])}${shield(x,ys[6])}`;
}
function foldedRail(x,y){
  const ys=[y+30,y+86,y+142,y+198,y+254];
  return `${r(x-39,y,78,286,39,'#FCFDFD','#D9DDDD',2)}
    <path d="M${x+9} ${ys[0]-10}l-10 10 10 10" fill="none" stroke="#202424" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${c(x,ys[1],22,'#ECEEEE')}${r(x-15,ys[1]-15,30,30,8,'#242829')}${t(x,ys[1]+8,'M',22,650,'#FFF','text-anchor="middle"')}
    ${plus(x,ys[2])}${shield(x,ys[3])}${t(x,ys[4]+7,'•••',26,600,'#202424','text-anchor="middle"')}`;
}
function article(x,y,w,h){
  const photoY=y+201, photoH=Math.min(h-250,360);
  return `${t(x,y+42,'MARGIN',31,700,'#222423','letter-spacing="6"')}
    <path d="M${x} ${y+61}h${w}" stroke="#D8D9D6" stroke-width="2"/>
    ${t(x,y+111,'ARCHITECTURE / ISSUE 07',18,450,'#777A76')}
    ${t(x,y+168,'A house for the in-between',37,550)}
    <image x="${x}" y="${photoY}" width="${w}" height="${photoH}" href="data:image/png;base64,${photo}" preserveAspectRatio="xMidYMid slice"/>
    ${t(x,photoY+photoH+36,'A quiet pavilion between the olive grove and the sea.',19,400,'#656A68')}`;
}
function frame(x,y,w,h,content){
  const id=`clip${x}${y}`;
  return `${r(x-8,y-8,w+16,h+16,78,'#C8CAC8','#9B9D9B',3)}${r(x,y,w,h,70,'#202223')}${r(x+9,y+9,w-18,h-18,62,'#FBFAF8')}
    <defs><clipPath id="${id}">${r(x+9,y+9,w-18,h-18,62,'#FFF')}</clipPath></defs><g clip-path="url(#${id})">${content}</g>`;
}
function tile(x,y,label,content){
  return `${r(x,y,1390,935,56,'#FFF','#E0E1DF',2)}${t(x+58,y+80,label,46,620)}${content}`;
}
function book(){
  const x=260,y=380,w=1240,h=690;
  const content=`${article(x+76,y+76,910,560)}${r(x+614,y+9,29,h-18,13,'#D4D2CC')}${r(x+626,y+9,5,h-18,2,'#B9B8B3')}${rail(x+1130,y+100)}`;
  return tile(150,260,'Book fold',frame(x,y,w,h,content)+t(260,1130,'Controls stay on the outside edge',26,450,'#777D7B'));
}
function tabletop(){
  const x=1810,y=380,w=1240,h=690;
  const content=`${article(x+72,y+56,975,530)}${r(x+10,y+337,w-20,26,13,'#D4D2CC')}${r(x+10,y+348,w-20,5,2,'#B9B8B3')}${foldedRail(x+1132,y+376)}`;
  return tile(1660,260,'Tabletop',frame(x,y,w,h,content)+t(1810,1130,'Interactive chrome avoids the fold',26,450,'#777D7B'));
}
function split(side){
  const isLeft=side==='left',tx=isLeft?150:1660,x=tx+110,y=1475,w=1240,h=690;
  const mid=x+620;
  const blancX=isLeft?x+10:mid;
  const otherX=isLeft?mid:x+10;
  const content=`${r(otherX,y+10,610,h-20,0,'#F0F0ED')}${t(otherX+305,y+344,'Other app',40,450,'#8B908F','text-anchor="middle"')}
    ${r(mid-7,y+10,14,h-20,6,'#D5D8D7')}
    ${t(blancX+(isLeft?150:60),y+120,'MARGIN',28,700,'#202323','letter-spacing="5"')}
    ${t(blancX+(isLeft?150:60),y+181,'A house for',32,550)}
    ${t(blancX+(isLeft?150:60),y+221,'the in-between',32,550)}
    <image x="${blancX+(isLeft?150:60)}" y="${y+260}" width="${isLeft?360:425}" height="275" href="data:image/png;base64,${photo}" preserveAspectRatio="xMidYMid slice"/>
    ${rail(isLeft?x+75:x+w-75,y+126,'outside',true)}`;
  return tile(tx,1350,`Split View · Blanc ${side}`,frame(x,y,w,h,content)+t(tx+110,2240,'Bar follows this app’s outside edge',26,450,'#777D7B'));
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="2400" viewBox="0 0 3200 2400">${r(0,0,3200,2400,0,'#F7F6F3')}${t(150,115,'Blanc for iPhone Duo — concept',34,600)}${t(3050,115,'Pose adaptations',30,450,'#797E7C','text-anchor="end"')}${book()}${tabletop()}${split('left')}${split('right')}</svg>`;
fs.writeFileSync(path.join(dir,'adaptations.svg'),svg);
