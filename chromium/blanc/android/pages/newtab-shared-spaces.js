'use strict';
(()=>{
  const api=window.bowserPages?.start;if(!api?.sharedQuestion)return;
  let notice=null;
  async function refresh(){
    const question=await api.sharedQuestion();notice?.remove();notice=null;if(!question)return;
    const {t}=blancI18n;notice=document.createElement('section');notice.className='shared-spaces-notice';notice.setAttribute('role','status');
    const heading=document.createElement('p'),detail=document.createElement('p'),yes=document.createElement('button'),no=document.createElement('button');
    heading.textContent=t('sharedSpaces.pairQuestion',{name:question.name});detail.textContent=t('sharedSpaces.pairDetail');yes.textContent=t('sharedSpaces.confirm');no.textContent=t('sharedSpaces.notNow');
    for(const [button,on] of [[yes,true],[no,false]])button.addEventListener('click',async()=>{if(await api.sharedQuestionAnswer(question.deviceId,on)){notice?.remove();notice=null;}});
    notice.append(heading,detail,yes,no);document.body.append(notice);
  }
  const update=()=>{refresh().catch(()=>{});};api.onStatus?.(update);api.onRemoteTabs?.(update);api.onSentItems?.(update);update();
})();
