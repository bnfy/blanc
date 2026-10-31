export class UndefinedNativeAdapterError extends Error {
 constructor(message){super(message);this.name='UndefinedNativeAdapterError';this.code='BLANC_ADAPTER_UNDEFINED';}
}
export function observedState(value,label='state',cache=new WeakMap()){
 if(!value||typeof value!=='object')return value;
 if(cache.has(value))return cache.get(value);
 const proxy=new Proxy(value,{get(target,key,receiver){
  if(typeof key==='symbol'||key in target)return observedState(Reflect.get(target,key,receiver),label+'.'+String(key),cache);
  if(key==='then'||key==='toJSON')return undefined;
  throw new UndefinedNativeAdapterError('Native snapshot adapter does not expose '+label+'.'+key);
 }});cache.set(value,proxy);return proxy;
}
