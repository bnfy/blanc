'use strict';
const fs=require('node:fs'),path=require('node:path');
const dir=__dirname, shipping=fs.readFileSync(path.join(dir,'shipping-tab-switcher.cjs'),'utf8'), controller=fs.readFileSync(path.join(dir,'snapshot-controller.cjs'),'utf8');
const output=`// Generated from the exact shipping model and snapshot adapter.\n(function(root){'use strict';\nconst shippingModule={exports:{}};\n(function(module){\n${shipping}\n})(shippingModule);\nconst controllerModule={exports:{}};\n(function(module,require){\n${controller}\n})(controllerModule,name=>{if(name!=='./shipping-tab-switcher.cjs')throw new Error('unexpected module');return shippingModule.exports});\nroot.BlancMruController=controllerModule.exports;\n})(globalThis);\n`;
const target=path.join(dir,'snapshot-controller.browser.js');if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error('browser bundle out of date')}else fs.writeFileSync(target,output);
