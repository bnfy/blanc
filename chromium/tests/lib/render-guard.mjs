// The Island opens on an animation frame. A browser on a sleeping or locked
// display gets none, so every case would fail for the screen, not the build:
// stop the run instead of recording those results.
export class EnvironmentStop extends Error{constructor(message){super(message);this.code='BLANC_ENVIRONMENT_STOP';}}
export const FRAME_PROBE=timeout=>`new Promise(r=>{const t=setTimeout(()=>r(false),${timeout});requestAnimationFrame(()=>{clearTimeout(t);r(true);});})`;
export async function assertRendering(evaluate,{timeout=2000}={}){
 if(await evaluate(FRAME_PROBE(timeout))!==true)throw new EnvironmentStop(`Stopping: the test browser received no animation frame in ${timeout} ms (display asleep or locked). No result recorded.`);
}
