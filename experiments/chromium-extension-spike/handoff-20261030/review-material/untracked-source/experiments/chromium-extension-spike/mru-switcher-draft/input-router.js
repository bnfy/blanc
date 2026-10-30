/* A semantic adapter for trusted, window-owned native key events only. It does
 * not install hooks, consume OS events, or grant a renderer activation authority. */
(function(root){
  'use strict';
  function createInputRouter({controller,enabled}) {
    if (!controller || typeof enabled !== 'function') throw new TypeError('router dependencies required');
    const pending = new WeakMap();
    let closeSequence = 0;
    const pass = () => ({action:'pass'});
    function cancel(window) { pending.delete(window); return controller.cancel(window); }
    function route(window,event) {
      if (!window || typeof window!=='object' || !event || !['down','up','blur'].includes(event.type)) throw new TypeError('native event required');
      if (!enabled(window)) {cancel(window);return pass()}
      if (event.type==='blur') {const was=cancel(window);return {action:was?'cancel':'pass'}}
      const session=controller.session(window);
      if(event.type==='up' && event.key==='Control' && session) {
        const close=pending.get(window);
        if(close){close.releasePending=true;return {action:'defer-release'}}
        return {action:controller.release(window)?'land':'end'};
      }
      if(event.type!=='down')return pass();
      const shortcut=event.ctrl===true && !event.alt && !event.meta && !event.altGraph && !event.composing;
      if(event.key==='Tab' && shortcut) {
        if(pending.has(window))return {action:'await-close'};
        return {action:controller.step(window,event.shift?-1:1)?'step':'pass'};
      }
      if(!session)return pass();
      if(shortcut && String(event.key).toLowerCase()==='w') {
        if(pending.has(window))return {action:'await-close'};
        if(session.pick===0)return {action:'keep'};
        const id=session.order[session.pick], token=String(++closeSequence);pending.set(window,{id,token,releasePending:false});
        return {action:'close-picked',id,token};
      }
      if(['Control','Shift'].includes(event.key))return {action:'keep'};
      cancel(window);return {action:event.key==='Escape'?'cancel-escape':'cancel'};
    }
    function closeResolved(window,id,token,closed) {
      const close=pending.get(window);
      if(!close || close.id!==id || close.token!==token)return {action:'ignore'};
      pending.delete(window);
      const session=controller.session(window);
      // The host must first observe the native post-close snapshot; an
      // accepted close without updated membership is not proof of removal.
      if(!closed || (session && session.order.includes(id))) {cancel(window);return {action:'cancel'}}
      if(close.releasePending && session)return {action:controller.release(window)?'land':'end'};
      return {action:session?'keep':'end'};
    }
    return {route,closeResolved,cancel};
  }
  if(typeof module==='object'&&module.exports)module.exports={createInputRouter};else root.BlancSwitcherInputRouter={createInputRouter};
})(globalThis);
