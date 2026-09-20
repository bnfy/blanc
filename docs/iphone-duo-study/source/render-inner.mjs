import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const heroData = fs.readFileSync(path.resolve(out, '../references/architecture-hero.png')).toString('base64');
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const text = (x, y, value, size, opts = {}) => `<text x="${x}" y="${y}" fill="${opts.fill || '#17191A'}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${opts.weight || 400}" letter-spacing="${opts.spacing || 0}" ${opts.anchor ? `text-anchor="${opts.anchor}"` : ''}>${esc(value)}</text>`;
const line = (x1, y1, x2, y2, stroke = '#D7D7D5', width = 2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${stroke}" stroke-width="${width}" fill="none"/>`;
const rect = (x, y, w, h, r, fill, stroke = 'none', sw = 0, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const circle = (cx, cy, r, fill, stroke = 'none', sw = 0, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;

const glyph = {
  // These paths are the desktop Island's 16-unit drawings, scaled as a unit.
  back: (x, y, color = '#1B1D1D') => `<g transform="translate(${x-40} ${y-40}) scale(5)"><path d="M9.75 3.5 5.25 8l4.5 4.5" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  search: (x, y) => `<g transform="translate(${x-40} ${y-40}) scale(5)" fill="none" stroke="#161819" stroke-width="1.4" stroke-linecap="round"><circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3 3"/></g>`,
  shield: (x, y, on = true) => `<g transform="translate(${x-40} ${y-40}) scale(5)" opacity="${on ? 1 : .42}" fill="none" stroke="#1C1F20" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l5 1.9v3.8c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.7z"/><path d="M4.4 11.47 12.61 3.55"/></g>`,
  plus: (x, y) => `<g transform="translate(${x-40} ${y-40}) scale(5)"><path d="M8 3v10M3 8h10" fill="none" stroke="#17191A" stroke-width="1.4" stroke-linecap="round"/></g>`,
  more: (x, y) => [-15,0,15].map(dx => circle(x+dx,y,5,'#1A1C1E')).join(''),
  lock: (x, y) => `<rect x="${x-12}" y="${y-3}" width="24" height="20" rx="4" fill="none" stroke="#666C70" stroke-width="3"/><path d="M${x-8} ${y-3}v-8a8 8 0 0 1 16 0v8" fill="none" stroke="#666C70" stroke-width="3"/>`,
};

function favicon(x, y, letter, color, selected = false, size = 62) {
  const r = size / 2;
  return `${selected ? circle(x,y,57,'#E6E8E8') : ''}${rect(x-r,y-r,size,size,Math.round(size*.27),color)}${text(x,y+size*.17,letter,Math.round(size*.56),{fill:'#fff',weight:650,anchor:'middle'})}${selected ? circle(x,y+64,6,'#1B1D1E') : ''}`;
}

const defs = `<defs>
  <clipPath id="screen"><rect x="265" y="275" width="2670" height="1878" rx="140"/></clipPath>
  <clipPath id="photo"><rect x="525" y="1040" width="1810" height="815" rx="7"/></clipPath>
  <filter id="deviceShadow" x="-20%" y="-25%" width="140%" height="160%"><feGaussianBlur stdDeviation="31"/></filter>
  <filter id="glassShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="16" stdDeviation="26" flood-color="#404343" flood-opacity=".12"/></filter>
</defs>`;

function hardware() {
  return `${rect(242,264,2740,1950,190,'#000', 'none',0,'opacity=".12" filter="url(#deviceShadow)"')}
  ${rect(225,235,2750,1958,193,'#C9C8C5','#8F8F8C',7)}
  ${rect(236,246,2728,1936,183,'#202122','#0D0E0E',7)}
  ${rect(260,270,2680,1888,146,'#FFF')}
  ${rect(1536,226,129,11,5,'#A2A29F')}${rect(1668,226,126,11,5,'#A2A29F')}
  ${rect(2972,775,9,283,4,'#555758')}
  ${line(1594,239,1604,247,'#686969',4)}${line(1594,2180,1604,2190,'#686969',4)}`;
}

function article() {
  return `<g clip-path="url(#screen)">
    ${rect(265,275,2670,1878,0,'#FBFAF8')}
    ${text(525,441,'MARGIN',42,{weight:650,spacing:11})}
    ${text(2335,442,'JOURNAL   /   PLACES',24,{fill:'#77756F',anchor:'end',spacing:1})}
    ${line(525,478,2520,478,'#D4D3CF',2)}
    ${text(525,588,'ARCHITECTURE     /     ISSUE 07',26,{fill:'#77766F',spacing:2})}
    ${text(518,718,'A house for',126,{fill:'#161716',weight:520})}
    ${text(518,849,'the in-between',126,{fill:'#161716',weight:520})}
    ${text(525,949,'A quiet pavilion between the olive grove and the sea.',34,{fill:'#65645F'})}
    <image x="525" y="1040" width="1810" height="815" xlink:href="data:image/png;base64,${heroData}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>
    ${text(525,1906,'FIELD NOTES     /     A STUDY IN LIGHT AND LIMESTONE',24,{fill:'#77766F',spacing:1})}
    ${text(525,1980,'Words by Elena Maren',27,{fill:'#343637'})}
    ${line(525,2034,2520,2034,'#D6D5D1',2)}
    ${text(525,2091,'01  /  06',23,{fill:'#858580',spacing:2})}
    ${rect(2721,275,214,1878,0,'#FEFEFE')}
    ${text(2829,370,'12:34',40,{weight:650,anchor:'middle'})}
    <path d="M2788 427q41-39 82 0M2803 442q26-24 52 0M2818 457q11-10 22 0" fill="none" stroke="#15191A" stroke-width="6" stroke-linecap="round"/>
    ${circle(2829,468,5,'#17191A')}
    ${rect(1365,2119,470,8,4,'#C8C9C9')}
  </g>`;
}

function rail() {
  const x = 2828;
  // The outer capsule follows the simulator's system-managed bar. Blanc owns
  // the three tab slots and glyphs, not this end-cap radius or position.
  // Each tab slot is 132px high (44pt in the 3x artwork). The active slot
  // blooms from a dot into its favicon, like desktop's dot peek. There is no
  // fourth, separate page-identity slot: +2 accounts for the two hidden tabs.
  return `<g filter="url(#glassShadow)">${rect(2758,655,140,1078,70,'#FCFDFD','#D7D9D9',2,'fill-opacity=".96"')}</g>
    ${glyph.back(x,723)}
    ${circle(x,855,7,'#BFC3C3')}
    ${circle(x,987,7,'#BFC3C3')}
    ${circle(x,1119,46,'#EFF0EF')}${favicon(x,1119,'M','#242728',false,54)}
    ${text(x,1262,'+2',32,{fill:'#555B5D',weight:500,anchor:'middle'})}
    ${glyph.plus(x,1383)}
    ${glyph.shield(x,1515,true)}
    ${glyph.more(x,1647)}`;
}

function panel(collapsed = false) {
  const px=1690, py=615, pw=1048, ph=collapsed ? 780 : 985;
  const panelRow=(y,letter,color,title,domain,selected=false)=>`
    ${selected ? rect(1735,y-43,966,78,24,'#E9EAEA') : ''}
    ${favicon(1785,y-5,letter,color,false,46)}
    ${text(1835,y+2,title,29,{weight:selected?650:500})}
    ${text(1835,y+31,domain,21,{fill:'#777B7C'})}
    ${selected ? circle(2655,y-4,7,'#17191A') : ''}`;
  const groupCaret = collapsed
    ? '<path d="M1750 1158l12 12-12 12" fill="none" stroke="#5E6365" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M1747 1164l12 12 12-12" fill="none" stroke="#5E6365" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  const groupRows = collapsed ? '' : `
    ${panelRow(1230,'I','#727C71','Material Index','materials.example')}
    ${panelRow(1313,'M','#242728','A house for the in-between','atelier-margin.example',true)}
    ${panelRow(1396,'R','#9A8168','Research Notes','notes.example')}`;
  const actionsY = collapsed ? 1267 : 1475;
  return `<g filter="url(#glassShadow)">${rect(px,py,pw,ph,57,'#FAFBFB','#D6D9D9',2)}</g>
    <path d="M2737 1065l47 54-47 54z" fill="#FAFBFB" stroke="#D6D9D9" stroke-width="2" stroke-linejoin="round"/>
    ${rect(2736,1083,10,72,0,'#FAFBFB')}
    ${favicon(1776,700,'M','#242728',false,56)}
    ${text(1835,695,'A house for the in-between',39,{weight:650})}
    ${glyph.lock(1846,733)}
    ${text(1874,743,'atelier-margin.example',24,{fill:'#697073'})}
    ${line(1735,767,2701,767,'#DADBDB',2)}
    ${rect(1735,791,966,87,28,'#F1F3F3')}
    ${glyph.search(1795,833)}
    ${text(1852,844,'Search or enter address',28,{fill:'#777D80'})}
    ${text(1735,937,'Pinned',26,{fill:'#5E6365',weight:550})}
    ${panelRow(985,'C','#907E6D','Correspondence','mail.example')}
    ${panelRow(1068,'L','#61716D','Landscape Archive','archive.example')}
    ${line(1735,1128,2701,1128,'#E0E2E2',2)}
    ${groupCaret}${text(1788,1182,'Inspiration',28,{fill:'#454B4C',weight:600})}${text(2672,1182,'3',24,{fill:'#868B8D',anchor:'end'})}
    ${groupRows}
    ${line(1735,actionsY-26,2701,actionsY-26,'#D7DADA',2)}
    ${rect(1735,actionsY,268,75,37,'#1B1E1F')}${text(1777,actionsY+50,'+',41,{fill:'#fff'})}${text(1830,actionsY+47,'New Tab',27,{fill:'#fff',weight:600})}
    ${rect(2020,actionsY,326,75,37,'#FFFFFF','#B9BFC0',2)}${text(2058,actionsY+50,'+',39,{fill:'#333738'})}${text(2111,actionsY+47,'New Private Tab',27,{fill:'#303435',weight:550})}`;
}

function plate(mode) {
  const expanded = mode !== 'resting';
  const collapsed = mode === 'group-collapsed';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="3200" height="2400" viewBox="0 0 3200 2400">
    ${defs}
    ${rect(0,0,3200,2400,0,'#F6F5F2')}
    ${text(225,126,'Blanc for iPhone Duo — concept',30,{weight:550})}
    ${text(2970,126,collapsed?'Group collapsed':expanded?'Island open':'At rest',28,{fill:'#7D807F',anchor:'end'})}
    ${hardware()}${article()}${rail()}${expanded?panel(collapsed):''}
  </svg>`;
}

for (const state of ['resting','expanded','group-collapsed']) {
  fs.writeFileSync(path.join(out,`inner-${state}.svg`),plate(state));
}
