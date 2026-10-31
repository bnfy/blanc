'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {merge,LOCALES,KEYS}=require('./downloads-locales.cjs');
const i18n=require('./shipping/i18n.js');
test('each shipping locale gains all messages without changing released strings',()=>{
 for(const locale of LOCALES){
  const original=require(`./shipping/strings.${locale}.js`), before=JSON.stringify(original), result=merge(locale,original);
  assert.equal(JSON.stringify(original),before);for(const [key,value] of Object.entries(original.messages))assert.equal(result.messages[key],value);
  const t=i18n.createTranslator({locale,formatLocale:result.formatLocale||locale,messages:result.messages,fallback:result.fallback});
  for(const key of KEYS){assert.equal(t.has(key),true);assert.notEqual(t(key),key);assert.ok(t(key).trim());}
  if(locale==='en-XA')for(const key of KEYS)assert.match(t(key),/^⟦.+⟧$/u);
 }
});
test('unknown locales and pre-existing keys fail closed',()=>{
 const en=require('./shipping/strings.en.js');assert.throws(()=>merge('xx',en),TypeError);
 assert.throws(()=>merge('en',{...en,messages:{...en.messages,'downloads.loadError':'existing'}}),TypeError);
});
