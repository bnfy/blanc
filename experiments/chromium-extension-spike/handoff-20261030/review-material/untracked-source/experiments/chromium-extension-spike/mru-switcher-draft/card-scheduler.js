/* Window-local presentation timing for the shipping recent-tab card.
 * Host callbacks must verify they still own the switcher surface. */
(function(root){
  'use strict';
  function createCardScheduler({setTimer,clearTimer,isBusy,show,update,hide,delayMs=150}) {
    if ([setTimer,clearTimer,isBusy,show,update,hide].some(fn=>typeof fn!=='function') || !Number.isFinite(delayMs) || delayMs<0) throw new TypeError('scheduler dependencies required');
    const states=new WeakMap();
    function stateFor(window) {let state=states.get(window);if(!state){state={timer:null,session:null,shown:false,version:0};states.set(window,state)}return state}
    function clear(state) {state.version++;if(state.timer!==null){clearTimer(state.timer);state.timer=null}}
    function changed(window,session) {
      if(!window||typeof window!=='object')throw new TypeError('window required');
      const state=stateFor(window);
      if(!session){clear(state);state.session=null;if(state.shown){state.shown=false;hide(window)}return}
      if(!Array.isArray(session.order)||!Number.isInteger(session.pick)||session.pick<0||session.pick>=session.order.length||!Number.isInteger(session.steps)||session.steps<1) {changed(window,null);throw new TypeError('invalid switch session')}
      state.session={...session,order:[...session.order]};
      if(state.shown){update(window,state.session);return}
      if(isBusy(window)){clear(state);return}
      if(session.steps>=2){clear(state);state.shown=true;show(window,state.session);return}
      if(state.timer!==null)return;
      const version=state.version;
      state.timer=setTimer(()=>{if(state.version!==version)return;state.timer=null;if(!state.session||state.shown||isBusy(window))return;state.shown=true;show(window,state.session)},delayMs);
    }
    return {changed,dispose(window){const state=states.get(window);if(!state)return;changed(window,null);states.delete(window)}};
  }
  if(typeof module==='object'&&module.exports)module.exports={createCardScheduler};else root.BlancSwitcherScheduler={createCardScheduler};
})(globalThis);
