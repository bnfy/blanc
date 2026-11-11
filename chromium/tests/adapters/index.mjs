import {observations} from './observations.mjs';
import {imports} from './import.mjs';
import {mahjong} from './mahjong.mjs';
import {core} from './core.mjs';
import {island} from './island.mjs';
import {commands} from './commands.mjs';
import {pages} from './pages.mjs';
import {quietNative} from './quiet-native.mjs';
import {quietChrome} from './quiet-chrome.mjs';
import {quietProtections} from './quiet-protections.mjs';
import {quietProcess} from './quiet-process.mjs';
import {tabs} from './tabs.mjs';
import {sync} from './sync.mjs';
import {vertical} from './vertical.mjs';
import {sends} from './sends.mjs';
const modules=[observations,imports,sends,vertical,sync,mahjong,core,island,commands,pages,tabs,quietNative,quietChrome,quietProtections,quietProcess];
export const adapters={};
for(const m of modules)for(const [name,fn] of Object.entries(m)){
 if(adapters[name])throw Error('Duplicate adapter: '+name);adapters[name]=fn;
}
