import {HandoffError} from './handoff-bridge.mjs';
export function parsePoint(line){
 const match=/^point (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)$/.exec(line.trim());
 if(!match)throw new HandoffError('invalid_point');
 const p=[Number(match[1]),Number(match[2])];if(!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))throw new HandoffError('invalid_point');return p;
}
export function boundedLine(reader,deadline){
 const remaining=deadline-Date.now();if(remaining<=0)return Promise.reject(new HandoffError('handoff_timeout'));
 return new Promise((resolve,reject)=>{let timer;const finish=(fn,v)=>{clearTimeout(timer);reader.off('line',onLine);reader.off('close',onClose);fn(v)};const onLine=line=>finish(resolve,line);const onClose=()=>finish(reject,new HandoffError('handoff_input_closed'));reader.once('line',onLine);reader.once('close',onClose);timer=setTimeout(()=>finish(reject,new HandoffError('handoff_timeout')),remaining);});
}
