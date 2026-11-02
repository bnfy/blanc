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
  // While the switch is on: choose more Spaces without switching it off.
  const actions=document.createElement('div');actions.className='shared-spaces-actions';
  const choose=document.createElement('button');choose.type='button';choose.id='sharedSpacesChoose';choose.textContent=t('sharedSpaces.title');
  const summary=document.createElement('p');actions.append(choose,summary);
  row.append(detail,actions,note);anchor.parentElement.after(row);
  const dialog=document.createElement('dialog');dialog.className='shared-spaces-dialog';dialog.setAttribute('aria-labelledby','sharedSpacesHeading');
  const heading=document.createElement('h2');heading.id='sharedSpacesHeading';heading.textContent=t('sharedSpaces.title');
  const explanation=document.createElement('p');explanation.textContent=t('sharedSpaces.explanation');
  const checking=document.createElement('p');checking.className='shared-spaces-checking';checking.setAttribute('role','status');checking.textContent=t('sharedSpaces.checking');
  const count=document.createElement('p'),list=document.createElement('div'),error=document.createElement('p');error.setAttribute('role','alert');
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('sharedSpaces.cancel');
  const confirm=document.createElement('button');confirm.type='button';
  dialog.append(heading,explanation,checking,count,list,error,cancel,confirm);document.body.append(dialog);
  function showActions(){actions.hidden=!status.enabled;summary.textContent=t('sharedSpaces.count',{count:status.spaces??0,limit:status.spaceLimit??25});}
  showActions();
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
  // The sheet opens at once from the index this device already holds, then
  // updates in place when the fresh check lands. Confirming waits for that
  // check, and main re-checks again before anything is uploaded.
  // Cancel and Escape always close the sheet. After Turn on or Share they
  // only close it: the save already asked for goes on in the background.
  let choices=[],view=null,check=null,sheet=0,confirming=false,saving=false,uploading=false;
  const reset=()=>{toggle.checked=!!status.enabled;};
  const dismissed=()=>{sheet++;confirming=false;if(saving){toggle.checked=true;note.textContent=t('sharedSpaces.uploading');}else reset();};
  const close=()=>{if(dialog.open)dialog.close();dismissed();};
  const unavailable=()=>{close();note.textContent=t('sharedSpaces.unavailable');};
  cancel.addEventListener('click',close);
  dialog.addEventListener('cancel',dismissed);
  function selected(){return choices.filter(row=>!row.choice.shared&&row.check.checked).map(row=>({id:row.choice.id,mode:row.mode.value}));}
  function capacity(){const copies=selected().filter(row=>row.mode==='copy').length,n=view.count+copies;count.textContent=t('sharedSpaces.count',{count:n,limit:view.limit});confirm.disabled=confirming||copies>0&&n>view.limit;}
  const shape=next=>JSON.stringify(next.choices.map(choice=>[choice.id,choice.rejoin,choice.shared,choice.reason]));
  function render(next) {
    // Keep what the person already ticked or picked, unless the fresh index
    // changed that Space's choices.
    const before=new Map(choices.map(row=>[row.choice.id,{row,checked:row.check.checked,mode:row.mode.value}]));
    view=next;choices=[];list.replaceChildren();
    for(const choice of next.choices){
      const prior=before.get(choice.id),same=prior&&prior.row.choice.rejoin===choice.rejoin&&prior.row.choice.reason===choice.reason&&prior.row.choice.shared===choice.shared;
      const item=document.createElement('div');item.className='shared-spaces-choice';
      const check=document.createElement('input');check.type='checkbox';check.checked=same?prior.checked:choice.checked;check.disabled=!!choice.reason||choice.shared;
      const text=document.createElement('label'),name=document.createElement('span'),total=document.createElement('span');name.textContent=choice.name;name.dataset.i18nIgnore='';total.textContent=' — '+t('sharedSpaces.tabs',{count:choice.tabCount});text.append(check,name,total);
      const mode=document.createElement('select');mode.setAttribute('aria-label',choice.name);mode.dataset.i18nIgnore='aria-label';
      for(const value of choice.rejoin?['rejoin','copy']:['copy']){const option=document.createElement('option');option.value=value;option.textContent=t('sharedSpaces.'+value);mode.append(option);}mode.value=same?prior.mode:choice.mode;
      if(choice.shared){const tag=document.createElement('span');tag.className='shared-spaces-tag';tag.textContent=t('sharedSpaces.shared');item.append(text,tag);}
      else item.append(text,mode);
      if(choice.reason){const reason=document.createElement('p');reason.textContent=t('sharedSpaces.full');const split=document.createElement('button');split.type='button';split.textContent=t('sharedSpaces.split');split.addEventListener('click',async()=>{await api.sharedSpacesOpen(choice.id);close();note.textContent=t('sharedSpaces.splitHint');});item.append(reason,split);}
      check.addEventListener('change',capacity);mode.addEventListener('change',capacity);
      choices.push({choice,check,mode});list.append(item);
    }
    capacity();
  }
  async function openSheet() {
    const local=await api.sharedSpacesPreview({local:true});if(!local.ok)throw new Error();
    const id=++sheet;confirming=false;error.textContent='';choices=[];
    confirm.textContent=status.enabled?t('sharedSpaces.share'):t('sharedSpaces.confirm');
    render(local);checking.hidden=false;note.textContent='';dialog.showModal();
    check=api.sharedSpacesPreview().then(next=>{
      if(id!==sheet)return null;
      if(!next.ok)return {failed:true};
      const changed=shape(next)!==shape(view);checking.hidden=true;render(next);return {changed};
    },()=>({failed:true}));
    check.then(result=>{if(result?.failed&&id===sheet&&!confirming)unavailable();});
  }
  async function openFromControl() {
    toggle.disabled=true;choose.disabled=true;
    try{await openSheet();}catch{unavailable();}finally{toggle.disabled=false;choose.disabled=false;}
  }
  toggle.addEventListener('change',async()=>{
    if(toggle.checked)return openFromControl();
    toggle.disabled=true;
    try {const result=await api.sharedSpacesApply({enabled:false});if(!result.ok)throw new Error();status.enabled=false;note.textContent='';showActions();}
    catch{note.textContent=t('sharedSpaces.unavailable');reset();}finally{toggle.disabled=false;}
  });
  choose.addEventListener('click',openFromControl);
  confirm.addEventListener('click',async()=>{
    // A change that landed before this press is already on screen.
    const id=sheet,label=confirm.textContent,landed=checking.hidden;
    confirming=true;saving=true;confirm.disabled=true;confirm.textContent=t('sharedSpaces.checkingButton');
    try{
      const result=await check;
      if(result?.failed){saving=false;if(id===sheet)unavailable();else{reset();note.textContent=t('sharedSpaces.unavailable');}return;}
      // The check changed the choices after the press: ask again, or, if
      // the sheet was closed meanwhile, save nothing they didn't see.
      if(result?.changed&&!landed&&(id!==sheet||!error.textContent)){saving=false;if(id===sheet)error.textContent=t('sharedSpaces.listUpdated');else{reset();note.textContent='';}return;}
      const applied=await api.sharedSpacesApply({enabled:true,selections:selected()});if(!applied.ok)throw new Error();
      saving=false;status.enabled=true;Object.assign(status,await api.sharedSpacesStatus());toggle.checked=true;showActions();
      uploading=true;note.textContent=t('sharedSpaces.uploading');if(id===sheet)close();
    }
    catch{saving=false;reset();if(id===sheet)error.textContent=t('sharedSpaces.unavailable');else note.textContent=t('sharedSpaces.unavailable');}
    finally{saving=false;confirm.textContent=label;if(id===sheet){confirming=false;capacity();}}
  });
  if(status.openSheet&&!status.enabled)toggle.click();
  const timer=setInterval(async()=>{
    try {const next=await api.sharedSpacesStatus();const wasFull=status.accountFull;Object.assign(status,next);showQuestion(next.question);if(uploading&&!next.waiting&&!next.running){uploading=false;if(note.textContent===t('sharedSpaces.uploading'))note.textContent='';}
    if(!dialog.open&&!toggle.disabled&&!saving){toggle.checked=!!next.enabled;showActions();if(next.accountFull)note.textContent=t('sharedSpaces.accountFull');else if(wasFull)note.textContent='';}if(next.openSheet&&!next.enabled)toggle.click();}catch{/* retry on the next local status refresh */}
  },2000);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
