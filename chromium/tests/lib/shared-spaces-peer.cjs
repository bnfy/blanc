'use strict';
// Execute shipping's unchanged protocol assertions against the fork's bundle.
// Window convergence remains a separate native gate, never inferred here.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {execFileSync}=require('node:child_process');
const {peer}=require('./desktop-sync-peer.cjs');
const {syncDevice:sourceFixture,virtualClock}=require('../../../test/unit/support/sync-device.js');
const reference=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../scenarios/inventory.json'),'utf8')).shippingCommit;
const repo=path.resolve(__dirname,'../../..');
const clone=v=>JSON.parse(JSON.stringify(v));
function observed(module,names){
 return new Proxy(module,{get(target,key){const value=target[key];
  return names.includes(key)?(...args)=>clone(value.apply(target,args)):value;
 }});
}
function syncDevice(options){
 // Only the local workspace collection uses shipping's fixture filesystem.
 // Sync, its queue, shared state and stores below come from the fork bundle.
 const local=sourceFixture(options);
 const stores=Object.fromEntries(fs.readdirSync(local.tmp).map(name=>[name,Uint8Array.from(fs.readFileSync(path.join(local.tmp,name)))]));
 const d=peer(options.record.deviceId,options.endpoint,{stores,clock:options.clock,request:options.fetch,
  writeStore:(name,bytes)=>fs.writeFileSync(path.join(local.tmp,name),Buffer.from(bytes)),
 });
 return {sync:observed(d.sync,['spaceStatus','sharedStatus','listRemoteDevices']),
  spaces:observed(d.module('shared-spaces'),['snapshot']),tabsync:d.module('tabsync'),
  closed:d.module('synced-closed'),sends:d.module('sends'),workspaces:local.workspaces,
  tmp:local.tmp,record:local.record,
  async dispose(){d.context.__require('shim:electron').__flush();await local.dispose();},
 };
}
const file='test/desktop/support/shared-spaces-peer-cases.js';
const source=execFileSync('git',['show',`${reference}:${file}`],{cwd:repo,encoding:'utf8'});
const driver=new Module(path.join(repo,'.shipping-reference',reference,file));
driver.filename=driver.id;
const ordinary=Module.createRequire(path.join(repo,file));
driver.require=name=>name==='../../unit/support/sync-device'?{syncDevice,virtualClock}:ordinary(name);
driver._compile(source,driver.filename);
module.exports={...driver.exports,reference};
