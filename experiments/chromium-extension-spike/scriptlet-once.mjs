// Generated uBO integration; the marker prevents repeated payload execution in
// the same realm, not an authorization boundary against an adversarial page.
export function wrapMainWorld(code, key, observe = false) {
 if (typeof code !== 'string' || typeof key !== 'string' || key.length !== 47 || !/^__blancUboOnce_[a-f0-9]{32}$/.test(key)) throw Error('Invalid scriptlet wrapper');
 if (!code) return '';
 // Keep this serializer self-contained: generateComponent embeds the function.
 // JSON quoting alone is not an HTML-script-safe JavaScript literal.
 const escapes = {'<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'};
 const literal = JSON.stringify(key).replace(/[<>&\u2028\u2029]/g, character => escapes[character]);
 return `(()=>{const key=${literal};
 ${observe ? "const counts=globalThis.__blancScriptletGateCounts??={attempts:0,bodies:0};counts.attempts++;" : ''}
 if(globalThis[key]===true)return;
 Object.defineProperty(globalThis,key,{value:true});
 ${observe ? 'counts.bodies++;' : ''}
 ${code}
 })();`;
}
