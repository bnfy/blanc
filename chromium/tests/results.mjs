export function aggregateCases(cases){
 if(!cases.length)throw Error('Scenario has no executable cases');
 if(cases.some(c=>!['pass','fail','undefined','excluded','not-run'].includes(c.result)))throw Error('Unknown executable result');
 if(cases.every(c=>c.result==='excluded')){
  if(cases.some(c=>!c.exclusionReason))throw Error('Excluded case has no reason');
  return 'excluded';
 }
 if(cases.every(c=>c.result==='pass'))return 'pass';
 if(cases.some(c=>c.result==='fail'))return 'fail';
 return 'undefined';
}
