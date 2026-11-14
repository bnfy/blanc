// The Island opens on an animation frame. A browser on a sleeping or locked
// display gets none, so every case would fail for the screen, not the build:
// stop the run instead of recording those results.
export class EnvironmentStop extends Error{constructor(message){super(message);this.code='BLANC_ENVIRONMENT_STOP';}}
export const FRAME_PROBE=timeout=>`new Promise(r=>{const t=setTimeout(()=>r(false),${timeout});requestAnimationFrame(()=>{clearTimeout(t);r(true);});})`;
export async function assertRendering(evaluate,{timeout=2000}={}){
 if(await evaluate(FRAME_PROBE(timeout))!==true)throw new EnvironmentStop(`Stopping: the test browser received no animation frame in ${timeout} ms (display asleep or locked). No result recorded.`);
}
// The driver talks to the browser over a WebSocket, which Node has as a
// global only from 22. On an older Node every case fails before the browser
// does anything, so refuse to start rather than record those results.
export function assertNodeRuntime(g=globalThis,version=process.version){
 if(typeof g.WebSocket!=='function')throw new EnvironmentStop(`Stopping: Node ${version} has no global WebSocket; the runner needs Node 22 or later. No result recorded.`);
}
