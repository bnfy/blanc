import test from 'node:test';
import assert from 'node:assert/strict';

test('the Linux leave step measures the settled card and sends a point outside its slack', async () => {
  const {moveOffSettledPanel} = await import('./fork-steps/window-layout.mjs');
  const rect = {left:140, right:760, top:12, bottom:460};
  const delivered = [];
  const world = {
    hoverPanelRect:{left:340,right:500,top:2,bottom:42},
    frame() {return {waitForSelector:async selector => assert.match(selector, /:not\(\.morph-run\)/)};},
    call:async (name,input) => {
      if (name === 'overlayPanelRect') return rect;
      assert.equal(name,'sendOverlayInput');
      delivered.push(input);
      return true;
    },
  };
  await moveOffSettledPanel.call(world);
  assert.equal(delivered.length,1);
  assert.ok(delivered[0].x < rect.left - 8);
});

test('the Personal picker may destroy its CDP target only after selection takes effect', async () => {
  const {selectLinuxPersonalProfile} = await import('./fork-steps/profiles.mjs');
  let clicks = 0;
  const pick = {eval:async () => {clicks++; throw Error('CDP connection closed: Target page, context or browser has been closed');}};
  const remaining = [{id:'picker',url:'chrome://profile-picker/'}];
  const world = {
    fixture:{targets:async () => remaining},
    snapshot:async () => ({windowActive:true}),
    waitFor:async (read,accepts) => {
      assert.equal(accepts(await read()),false);
      remaining.length = 0;
      assert.equal(accepts(await read()),true);
    },
  };
  await selectLinuxPersonalProfile(world,pick,'picker');
  assert.equal(clicks,1);
  await assert.rejects(selectLinuxPersonalProfile(world,{eval:async()=>{throw Error('Personal card missing');}},'picker'), /Personal card missing/);
});

test('a large Linux import submits once, even while its native reply is pending', async () => {
  const {applyLinuxImportBatch} = await import('./fork-steps/import.mjs');
  let calls = 0, complete;
  const result = {ok:true,tabIds:['1','2']};
  const host = {document:{getElementById:()=>({contentWindow:{
    document:{location:{pathname:'/pages/tab-import.html'}},
    bowserPages:{tabImport:{apply:(id,selection)=>{
      assert.equal(id,'session'); assert.deepEqual(selection,{generation:1});
      calls++;
      return new Promise(resolve=>{complete=resolve;});
    }}}
  }})}};
  const w = {
    hostEval:source=>Function('globalThis','window','return ('+source+');')(host,host),
    waitFor:async (read,accepts)=>{
      assert.ok(!accepts(await read()));
      complete(result);
      await Promise.resolve();
      const state=await read(); assert.ok(accepts(state)); return state;
    },
  };
  assert.deepEqual(await applyLinuxImportBatch(w,'session',{generation:1}),result);
  assert.equal(calls,1);
});

test('the Glance observer samples the slide while pointer delivery is still outstanding', async () => {
  const {observeLinuxGlanceSlide} = await import('./fork-steps/glance.mjs');
  let revealed = false, samples = 0, finishDelivery;
  const delivered = new Promise(resolve => {finishDelivery = resolve;});
  const bounds = {x:100,y:98,width:300,height:200};
  const read = async () => {
    const sliding = revealed && ++samples === 1;
    if (revealed && !sliding) finishDelivery();
    return {state:{revealed,sliding},card:bounds,page:bounds};
  };
  const watch = await observeLinuxGlanceSlide(read,async () => {revealed = true; await delivered;});
  assert.equal(watch.slid,true);
  assert.equal(watch.final.revealed,true);
  assert.deepEqual([...watch.seen],[JSON.stringify({card:bounds,page:bounds})]);
});

test('Glance keeps sampling through a settled frame started after pointer delivery', async () => {
  const {observeLinuxGlanceSlide} = await import('./fork-steps/glance.mjs');
  const nextFrame = () => new Promise(resolve => setImmediate(resolve));
  const bounds = {x:100,y:98,width:300,height:200};
  const moved = {...bounds,x:101};
  let phase = 'covered', finishSlide;
  const settled = new Promise(resolve => {finishSlide = resolve;});
  const read = async () => {
    const frame = phase;
    await nextFrame();
    if (frame === 'sliding') phase = 'settled';
    if (frame === 'settled') finishSlide();
    return {state:{revealed:frame !== 'covered',sliding:frame === 'sliding',frame},
      card:frame === 'dispatching' ? moved : bounds,page:bounds};
  };
  const watch = await observeLinuxGlanceSlide(read, async () => {
    phase = 'sliding';
    await settled;
    phase = 'dispatching';
    await nextFrame();
    await nextFrame();
    phase = 'delivered';
  });
  assert.equal(watch.final.frame,'delivered');
  assert.ok(watch.seen.has(JSON.stringify({card:moved,page:bounds})), 'recorded motion during dispatch');
});
