// Generated payload integration, used only by the offline component prototype.
// GPL-3.0-or-later when combined with the pinned uBO payload.
let generation = 0, initialized = false, loaded = false, ready = false;
async function command(action, epoch) {
    const response = await fetch(`http://blanc-ubo-control.invalid/${action}?${epoch}`, { cache: 'no-store' });
    if ( response.status !== 204 ) { throw Error('Browser hold acknowledgement refused'); }
}
export async function begin() {
    loaded = false; ready = false;
    const epoch = ++generation;
    await command('begin', epoch);
    return epoch;
}
export async function complete() {
    loaded = true;
    if ( initialized ) { await command('ready', generation); ready = true; }
}
export async function activate(selfieValid) {
    initialized = true;
    if ( loaded || selfieValid ) { await command('ready', generation); ready = true; }
}
// Startup remains browser-held even if this handshake or subsequent imports fail.
await begin();

export function current() { return {generation, ready}; }
