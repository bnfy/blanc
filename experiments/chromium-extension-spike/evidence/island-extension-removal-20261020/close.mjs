import{connect}from'/private/tmp/blanc-cdp.mjs';const c=await connect(await fetch('http://127.0.0.1:9277/json/version').then(r=>r.json()));await c.send('Browser.close').catch(()=>{});c.close();
