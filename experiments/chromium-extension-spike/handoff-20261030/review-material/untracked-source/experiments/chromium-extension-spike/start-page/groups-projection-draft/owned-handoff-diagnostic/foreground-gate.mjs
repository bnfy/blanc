import {HandoffError} from './handoff-bridge.mjs';
export function requireOwnedForeground(sample,{requireBirth=false}={}) {
 if(sample?.status!=='window_unique'||sample.frontmost!==true||sample.owned_matches!==1)throw new HandoffError('owned_foreground_unverified');
 if(requireBirth&&(!Array.isArray(sample.birth)||sample.birth.length!==2||!sample.birth.every(Number.isSafeInteger)))throw new HandoffError('owned_birth_unverified');
 return sample;
}
