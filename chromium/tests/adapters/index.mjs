import {core} from './core.mjs';
const modules=[core];
export const adapters={};
for(const m of modules)for(const [name,fn] of Object.entries(m)){
 if(adapters[name])throw Error('Duplicate adapter: '+name);adapters[name]=fn;
}
