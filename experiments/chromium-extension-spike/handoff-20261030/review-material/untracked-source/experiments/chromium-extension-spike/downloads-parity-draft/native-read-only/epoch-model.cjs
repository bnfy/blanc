'use strict';
// Synthetic lifecycle model, not Chromium implementation or security proof.
class Model {
  constructor(){this.closed=false;this.ownerShutdown=false;this.next=0;this.family=++this.next;this.slots=new Map()}
  adopt(scope,hook=()=>{}) {if(this.closed||this.ownerShutdown||!['regular','private'].includes(scope)||this.slots.has(scope))return false;const slot={epoch:++this.next,alive:true,shutdown:false};this.slots.set(scope,slot);hook();return !this.closed&&!this.ownerShutdown&&slot.alive&&!slot.shutdown&&this.slots.get(scope)===slot}
  capture(scope){const slot=this.slots.get(scope);return !this.closed&&!this.ownerShutdown&&slot?.alive&&!slot.shutdown?{scope,family:this.family,epoch:slot.epoch}:null}
  current(lease){const now=lease&&this.capture(lease.scope);return !!now&&now.family===lease.family&&now.epoch===lease.epoch}
  invalidate(scope){const slot=this.slots.get(scope);if(slot)slot.alive=false;this.slots.delete(scope)}
  beginOwnerShutdown(){this.ownerShutdown=true}
  beginContextShutdown(scope){const slot=this.slots.get(scope);if(slot)slot.shutdown=true}
  shutdown(){this.closed=true;for(const s of this.slots.values())s.alive=false;this.slots.clear();this.family=null}
}
module.exports={Model};
