// Generated uBO integration; the marker prevents repeated payload execution in
// the same realm, not an authorization boundary against an adversarial page.
export function wrapMainWorld(code, key, observe = false) {
 if (typeof code !== 'string' || !/^__blancUboOnce_[a-f0-9]{32}$/.test(key)) throw Error('Invalid scriptlet wrapper');
 if (!code) return '';
 return `(()=>{const key=${JSON.stringify(key)};
 ${observe ? "const counts=globalThis.__blancScriptletGateCounts??={attempts:0,bodies:0};counts.attempts++;" : ''}
 if(globalThis[key]===true)return;
 Object.defineProperty(globalThis,key,{value:true});
 ${observe ? 'counts.bodies++;' : ''}
 ${code}
 })();`;
}
