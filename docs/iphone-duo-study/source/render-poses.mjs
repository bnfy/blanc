import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const hero = fs.readFileSync(path.resolve(sourceDir, '../references/architecture-hero.png')).toString('base64');
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const t = (x,y,s,size,weight=400,color='#1A1C1D',extra='') => `<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(s)}</text>`;
const r = (x,y,w,h,rx,fill,stroke='none',sw=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const c = (x,y,rad,fill) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"/>`;
const ln = (x1,y1,x2,y2,color='#D7D8D5',sw=2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${sw}"/>`;
const defs = `<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="22" stdDeviation="27" flood-color="#34393A" flood-opacity=".13"/></filter></defs>`;

const icon = {
  back(x,y,size=5) { return `<g transform="translate(${x-8*size} ${y-8*size}) scale(${size})"><path d="M9.75 3.5 5.25 8l4.5 4.5" fill="none" stroke="#1B1D1D" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g>`; },
  plus(x,y,size=5) { return `<g transform="translate(${x-8*size} ${y-8*size}) scale(${size})"><path d="M8 3v10M3 8h10" fill="none" stroke="#1B1D1D" stroke-width="1.4" stroke-linecap="round"/></g>`; },
  shield(x,y,size=5,enabled=true) { return `<g transform="translate(${x-8*size} ${y-8*size}) scale(${size})" opacity="${enabled?1:.4}" fill="none" stroke="#1B1D1D" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l5 1.9v3.8c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.7z"/><path d="M4.4 11.47 12.61 3.55"/></g>`; },
  more(x,y) { return [-16,0,16].map(dx=>c(x+dx,y,5,'#1B1D1D')).join(''); },
};

function favicon(x,y,size=54) {
  return `${r(x-size/2,y-size/2,size,size,Math.round(size*.25),'#242728')}${t(x,y+size*.18,'M',Math.round(size*.57),650,'#FFF','text-anchor="middle"')}`;
}

function rail(x,y) {
  // Artwork matches the screen's 3x scale: 132px per independent 44pt slot.
  const centers=[y+68,y+200,y+332,y+464,y+596,y+728,y+860,y+992];
  return `<g filter="url(#shadow)">${r(x-70,y,140,1078,70,'#FCFDFD','#D7D9D9',2)}</g>
    ${icon.back(x,centers[0])}
    ${c(x,centers[1],7,'#BFC3C3')}${c(x,centers[2],7,'#BFC3C3')}
    ${c(x,centers[3],46,'#EFF0EF')}${favicon(x,centers[3])}
    ${t(x,centers[4]+11,'+2',32,500,'#555B5D','text-anchor="middle"')}
    ${icon.plus(x,centers[5])}${icon.shield(x,centers[6])}${icon.more(x,centers[7])}`;
}

function horizontalBar(x,y,w) {
  const cx=[x+100,x+245,x+390,x+535,x+680,x+825,x+970,x+1115];
  return `<g filter="url(#shadow)">${r(x,y,w,132,66,'#FCFDFD','#D7D9D9',2)}</g>
    ${icon.back(cx[0],y+66,4)}
    ${c(cx[1],y+66,7,'#BFC3C3')}${c(cx[2],y+66,7,'#BFC3C3')}
    ${c(cx[3],y+66,43,'#EFF0EF')}${favicon(cx[3],y+66,52)}
    ${t(cx[4],y+78,'+2',30,500,'#555B5D','text-anchor="middle"')}
    ${icon.plus(cx[5],y+66,4)}${icon.shield(cx[6],y+66,4)}${icon.more(cx[7],y+66)}`;
}

function page(x,y,w,scale=1) {
  const p=(n)=>n*scale;
  return `${t(x,y+p(43),'MARGIN',p(46),700,'#1D1E1D','letter-spacing="8"')}
    ${ln(x,y+p(78),x+w,y+p(78),'#D8D8D3',2)}
    ${t(x,y+p(175),'ARCHITECTURE / ISSUE 07',p(25),500,'#777872')}
    ${t(x,y+p(310),'A house for',p(106),520)}
    ${t(x,y+p(425),'the in-between',p(106),520)}
    ${t(x,y+p(510),'A quiet pavilion between the olive grove and the sea.',p(31),400,'#62645F')}
    <image x="${x}" y="${y+p(575)}" width="${w}" height="${p(870)}" href="data:image/png;base64,${hero}" preserveAspectRatio="xMidYMid slice"/>
    ${t(x,y+p(1502),'FIELD NOTES / A STUDY IN LIGHT AND LIMESTONE',p(23),500,'#777872')}
    ${t(x,y+p(1575),'Words by Elena Maren',p(27),400,'#424442')}`;
}

function frame(x,y,w,h,corner=175) {
  return `<g filter="url(#shadow)">${r(x-18,y-18,w+36,h+36,corner+16,'#C9C9C6','#8C8E8D',6)}</g>
    ${r(x-8,y-8,w+16,h+16,corner+7,'#1D1F20')}
    ${r(x,y,w,h,corner,'#FBFAF8')}`;
}

const board=(title,body,w=2400,h=3200)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${r(0,0,w,h,0,'#F7F6F3')}${t(240,110,'Blanc for iPhone Duo — concept',30,600)}${t(w-240,110,title,27,500,'#737876','text-anchor="end"')}${body}</svg>`;

function outerPortrait() {
  const sx=310,sy=242,sw=1780,sh=2590;
  const body=`${frame(sx,sy,sw,sh,180)}
    <defs><clipPath id="outerScreen">${r(sx,sy,sw,sh,180,'#FFF')}</clipPath></defs>
    <g clip-path="url(#outerScreen)">
    ${r(sx+1500,sy,280,sh,0,'#FEFEFE')}
    ${page(sx+105,sy+190,1265,.79)}
    ${t(sx+1640,sy+250,'12:34',38,650,'#1A1D1F','text-anchor="middle"')}
    <path d="M${sx+1605} ${sy+309}q35-33 70 0M${sx+1618} ${sy+323}q22-19 44 0" fill="none" stroke="#1A1D1F" stroke-width="5" stroke-linecap="round"/>
    <g transform="translate(${sx+1640} ${sy+575}) scale(1.27) translate(${-sx-1640} ${-sy-575})">${rail(sx+1640,sy+575)}</g>
    ${c(sx+1665,sy+132,38,'#070808')}
    ${r(sx+722,sy+2544,336,7,4,'#C7C9C9')}
    </g>`;
  return board('Outer portrait',body);
}

function innerPortrait() {
  const sx=300,sy=242,sw=1800,sh=2560;
  const body=`${frame(sx,sy,sw,sh,165)}
    ${page(sx+130,sy+210,1540,.9)}
    ${t(sx+1570,sy+120,'12:34',38,650,'#1A1D1F','text-anchor="middle"')}
    <path d="M${sx+1590} ${sy+162}q32-30 64 0M${sx+1602} ${sy+176}q20-18 40 0" fill="none" stroke="#1A1D1F" stroke-width="5" stroke-linecap="round"/>
    ${horizontalBar(sx+287,sy+2338,1226)}
    ${r(sx+735,sy+2525,330,7,4,'#C7C9C9')}`;
  return board('Inner portrait',body);
}

fs.writeFileSync(path.join(sourceDir,'outer-portrait.svg'),outerPortrait());
fs.writeFileSync(path.join(sourceDir,'inner-portrait.svg'),innerPortrait());
