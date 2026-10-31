import {core} from './core.mjs';
import {island} from './island.mjs';
import {commands} from './commands.mjs';
import {pages} from './pages.mjs';
import {tabs} from './tabs.mjs';
const modules=[core,island,commands,pages,tabs];
export const adapters={};
for(const m of modules)for(const [name,fn] of Object.entries(m)){
 if(adapters[name])throw Error('Duplicate adapter: '+name);adapters[name]=fn;
}
