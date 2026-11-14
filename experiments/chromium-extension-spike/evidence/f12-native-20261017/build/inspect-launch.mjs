import fs from 'node:fs';import {chromium} from '/private/tmp/blanc-electron-drag-fix/node_modules/playwright/index.mjs';
const p='/private/tmp/blanc-f12-inspect-profile';fs.mkdirSync(p,{recursive:true});
const context=await chromium.launchPersistentContext(p,{executablePath:'/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-first-run','--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--blanc-blocker-assets=/private/tmp/blanc-f12-native-assets','--host-resolver-rules=MAP * ~NOTFOUND','--enable-logging=stderr']});
await new Promise(r=>setTimeout(r,2000));const cdp=await context.browser().newBrowserCDPSession();
console.log(JSON.stringify(await cdp.send('Target.getTargets')));
for(const page of context.pages())console.log(page.url(),await page.title().catch(String));
await context.close();fs.rmSync(p,{recursive:true});
