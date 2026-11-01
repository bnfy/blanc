'use strict';
// The entire control is created only after main confirms this build offers it.
// Consent is never changed by opening or cancelling the selection dialog.
(async()=>{
  const api=window.bowserPages?.settings;
  if(!api?.sharedSpacesStatus)return;
  const status=await api.sharedSpacesStatus();if(!status.offered)return;
  const {t}=blancI18n,anchor=document.getElementById('syncTabsShareSetting');if(!anchor)return;
  // A tile in What syncs beside Open tabs; its explanation, live status and
  // pairing question sit under the grid, in #sharedSpacesControl.
  const svgNs='http://www.w3.org/2000/svg',icon=document.createElementNS(svgNs,'svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('class','sync-what-icon');icon.setAttribute('aria-hidden','true');
  for(const [x,y] of [[4.5,4.5],[13.5,4.5],[4.5,13.5],[13.5,13.5]]){const r=document.createElementNS(svgNs,'rect');r.setAttribute('x',x);r.setAttribute('y',y);r.setAttribute('width','6');r.setAttribute('height','6');r.setAttribute('rx','1.5');icon.append(r);}
  const tile=document.createElement('label');tile.className='sync-what sync-what-toggle';tile.id='sharedSpacesTile';tile.setAttribute('role','listitem');
  const text=document.createElement('span');text.className='sync-what-text';
  const title=document.createElement('span');title.className='sync-what-label';title.id='sharedSpacesLabel';title.textContent=t('settings.sync.what.spaces');
  const state=document.createElement('span');state.className='sync-what-state';state.textContent=t('settings.sync.what.spacesHint');
  text.append(title,state);
  const label=document.createElement('span');label.className='toggle';
  const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!status.enabled;toggle.id='sharedSpacesToggle';
  toggle.setAttribute('aria-labelledby','sharedSpacesLabel');toggle.setAttribute('aria-describedby','sharedSpacesHint');
  const track=document.createElement('span');track.className='track';
  label.append(toggle,track);tile.append(icon,text,label);anchor.after(tile);
  const row=document.createElement('div');row.className='sync-what-note';row.id='sharedSpacesControl';
  const detail=document.createElement('p');detail.id='sharedSpacesHint';detail.textContent=t('sharedSpaces.accountLine')+' '+t('sharedSpaces.offLine');
  const note=document.createElement('p');note.className='sync-row-status';note.setAttribute('role','status');
  row.append(detail,note);anchor.parentElement.after(row);
  const dialog=document.createElement('dialog');dialog.className='shared-spaces-dialog';dialog.setAttribute('aria-labelledby','sharedSpacesHeading');
  const heading=document.createElement('h2');heading.id='sharedSpacesHeading';heading.textContent=t('sharedSpaces.title');
  const explanation=document.createElement('p');explanation.textContent=t('sharedSpaces.explanation');
  const count=document.createElement('p'),list=document.createElement('div'),error=document.createElement('p');error.setAttribute('role','alert');
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('sharedSpaces.cancel');
  const confirm=document.createElement('button');confirm.type='button';confirm.textContent=t('sharedSpaces.confirm');
  dialog.append(heading,explanation,count,list,error,cancel,confirm);document.body.append(dialog);
  let prompt=null,promptId=null;
  function showQuestion(question) {
    if(promptId===question?.deviceId)return;
    prompt?.remove();prompt=null;promptId=question?.deviceId??null;if(!question)return;
    prompt=document.createElement('div');prompt.className='sync-panel';const text=document.createElement('strong'),detail=document.createElement('p'),actions=document.createElement('div'),yes=document.createElement('button'),no=document.createElement('button');
    detail.className='sync-panel-body';actions.className='sync-panel-actions';no.className='quiet';
    text.textContent=t('sharedSpaces.pairQuestion',{name:question.name});detail.textContent=t('sharedSpaces.pairDetail');yes.textContent=t('sharedSpaces.confirm');no.textContent=t('sharedSpaces.notNow');
    const dismiss=async()=>{if(await api.sharedSpacesAcknowledge(question.deviceId)){prompt?.remove();prompt=null;promptId=null;}};
    yes.addEventListener('click',async()=>{await dismiss();toggle.click();});no.addEventListener('click',dismiss);actions.append(yes,no);prompt.append(text,detail,actions);row.append(prompt);
  }
  showQuestion(status.question);
  if(status.accountFull)note.textContent=t('sharedSpaces.accountFull');
  let choices=[];
  const reset=()=>{toggle.checked=!!status.enabled;};
  cancel.addEventListener('click',()=>{dialog.close();reset();});
  dialog.addEventListener('cancel',reset);
  function selected(){return choices.filter(row=>row.check.checked).map(row=>({id:row.choice.id,mode:row.mode.value}));}
  function capacity(view){const copies=selected().filter(row=>row.mode==='copy').length,n=view.count+copies;count.textContent=t('sharedSpaces.count',{count:n,limit:view.limit});confirm.disabled=copies>0&&n>view.limit;}
  toggle.addEventListener('change',async()=>{
    toggle.disabled=true;note.textContent=t('sharedSpaces.busy');
    try {
      if(!toggle.checked){const result=await api.sharedSpacesApply({enabled:false});if(!result.ok)throw new Error();status.enabled=false;note.textContent='';return;}
      const view=await api.sharedSpacesPreview();if(!view.ok)throw new Error();
      choices=[];list.replaceChildren();error.textContent='';
      for(const choice of view.choices){
        const item=document.createElement('div');item.className='shared-spaces-choice';
        const check=document.createElement('input');check.type='checkbox';check.checked=choice.checked;check.disabled=!!choice.reason;
        const text=document.createElement('label'),name=document.createElement('span'),total=document.createElement('span');name.textContent=choice.name;name.dataset.i18nIgnore='';total.textContent=' — '+t('sharedSpaces.tabs',{count:choice.tabCount});text.append(check,name,total);
        const mode=document.createElement('select');mode.setAttribute('aria-label',choice.name);mode.dataset.i18nIgnore='aria-label';
        for(const value of choice.rejoin?['rejoin','copy']:['copy']){const option=document.createElement('option');option.value=value;option.textContent=t('sharedSpaces.'+value);mode.append(option);}mode.value=choice.mode;
        item.append(text,mode);
        if(choice.reason){const reason=document.createElement('p');reason.textContent=t('sharedSpaces.full');const split=document.createElement('button');split.type='button';split.textContent=t('sharedSpaces.split');split.addEventListener('click',async()=>{await api.sharedSpacesOpen(choice.id);dialog.close();reset();note.textContent=t('sharedSpaces.splitHint');});item.append(reason,split);}
        check.addEventListener('change',()=>capacity(view));mode.addEventListener('change',()=>capacity(view));
        choices.push({choice,check,mode});list.append(item);
      }
      capacity(view);note.textContent='';dialog.showModal();
    }catch{note.textContent=t('sharedSpaces.unavailable');reset();}finally{toggle.disabled=false;}
  });
  confirm.addEventListener('click',async()=>{
    confirm.disabled=true;cancel.disabled=true;
    try{const result=await api.sharedSpacesApply({enabled:true,selections:selected()});if(!result.ok)throw new Error();status.enabled=true;toggle.checked=true;dialog.close();}
    catch{error.textContent=t('sharedSpaces.unavailable');reset();}
    finally{confirm.disabled=false;cancel.disabled=false;}
  });
  if(status.openSheet&&!status.enabled)toggle.click();
  const timer=setInterval(async()=>{
    try {const next=await api.sharedSpacesStatus();const wasFull=status.accountFull;Object.assign(status,next);showQuestion(next.question);if(!dialog.open&&!toggle.disabled){toggle.checked=!!next.enabled;if(next.accountFull)note.textContent=t('sharedSpaces.accountFull');else if(wasFull)note.textContent='';}if(next.openSheet&&!next.enabled)toggle.click();}catch{/* retry on the next local status refresh */}
  },2000);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
