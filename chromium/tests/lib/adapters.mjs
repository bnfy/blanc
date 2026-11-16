export class UndefinedNativeAdapterError extends Error {
 constructor(message){super(message);this.name='UndefinedNativeAdapterError';this.code='BLANC_ADAPTER_UNDEFINED';}
}
export function observedState(value,label='state',cache=new WeakMap()){
 if(!value||typeof value!=='object')return value;
 if(cache.has(value))return cache.get(value);
 const proxy=new Proxy(value,{get(target,key,receiver){
  // Arrays are positional: a missing key is a probe (assert's .size), not a field.
  if(typeof key==='symbol'||key in target||Array.isArray(target))return observedState(Reflect.get(target,key,receiver),label+'.'+String(key),cache);
  if(key==='then'||key==='toJSON')return undefined;
  throw new UndefinedNativeAdapterError('Native snapshot adapter does not expose '+label+'.'+key);
 }});cache.set(value,proxy);return proxy;
}
// The fork's native ids are integers; shipping's are strings.
export const nativeId=value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Not a native tab id: '+value);return n;};
