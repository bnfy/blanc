// Read the real Island rows, dots and their layout.
import {nativeId} from '../lib/adapters.mjs';
const overlay=w=>w.frame('overlay');
const strip=w=>w.frame('strip');
const row=(kind,id)=>`${kind}[data-tab-id="${nativeId(id)}"]`;
export function dimStyle(el){
 if(!el)return {error:'missing row'};
 if(!el.classList.contains('quiet'))return {error:'missing quiet class'};
 let ancestorOpacity=1;
 for(let node=el;node;node=node.parentElement||node.ownerDocument?.defaultView?.frameElement){
  const style=getComputedStyle(node);
  if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return {error:'hidden row or ancestor'};
  if(node!==el)ancestorOpacity*=Number(style.opacity);
 }
 const rect=el.getBoundingClientRect();
 return {rowOpacity:getComputedStyle(el).opacity,ancestorOpacity,rectWidth:rect.width,rectHeight:rect.height,
  hovered:el.matches(':hover'),focused:el.matches(':focus-within')};
}
export const quietChrome={
 addressCommandNotice:w=>overlay(w).evaluate(()=>{
  const el=document.querySelector('#islandList .command-notice');
  return el?{text:el.textContent.trim(),role:el.getAttribute('role')}:null;
 }),
 async quietChromeState(w,id){
  const dot=await strip(w).locator(row('.island-dot',id)).evaluateAll(els=>{
   const el=els[0],r=el?.getBoundingClientRect();
   return {dotPresent:!!el&&r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden',
    dotQuiet:!!el?.classList.contains('quiet'),dotLabel:el?.getAttribute('aria-label')??''};
  });
  const rail=await strip(w).locator(row('.vertical-tab-row',id)).evaluateAll(els=>{
   const el=els[0];return {railQuiet:!!el?.classList.contains('quiet'),railPrivate:!!el?.classList.contains('private'),
    railLabel:el?.querySelector('.vertical-tab-primary')?.getAttribute('aria-label')??''};
  });
  return {...dot,...rail};
 },
 async clickIslandDot(w,id){
  const dot=strip(w).locator(row('.island-dot',id));
  if(!await dot.isVisible())return false;
  await dot.click();return true;
 },
 async quietRowDimStyles(w,id){
  const panel=await overlay(w).evalExpression(`(${dimStyle.toString()})(document.querySelector(${JSON.stringify(row('#islandList .island-row',id))}))`);
  const rail=await strip(w).evalExpression(`(${dimStyle.toString()})(document.querySelector(${JSON.stringify(row('.vertical-tab-row',id))}))`);
  return {panel,rail};
 },
};
