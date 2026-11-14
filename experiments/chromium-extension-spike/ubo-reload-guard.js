// Generated payload integration, used only by the offline component prototype.
// GPL-3.0-or-later when combined with the pinned uBO payload.
import { staticDeliveries, upstreamDeliveries } from './blanc-static-delivery.js';
let generation = 0, initialized = false, loaded = false, ready = false, starting = false;
async function command(action, epoch) {
    const response = await fetch(`http://blanc-ubo-control.invalid/${action}?${epoch}`, { cache: 'no-store' });
    if ( response.status !== 204 ) { throw Error('Browser hold acknowledgement refused'); }
}
async function destroyed(documentId) {
    const response = await fetch(`http://blanc-ubo-control.invalid/delivery-document?${generation}`,
        {method: 'POST', cache: 'no-store', body: JSON.stringify({documentId})});
    if ( response.status !== 200 ) { return false; }
    const value = await response.json();
    return value.documentId === documentId && value.exists === false;
}
let earlyEnabled = false;
export function enableEarlyDrain() { earlyEnabled = true; }
async function drainEarly() {
    if ( !earlyEnabled ) { return; }
    const deadline = Date.now() + 3000;
    do {
        const response = await fetch(`http://blanc-ubo-control.invalid/early-deliveries?${generation}`, {cache:'no-store'});
        if ( response.status !== 200 ) { throw Error('Native delivery state unavailable; reload remains held'); }
        const value = await response.json();
        if ( value.pending === 0 ) { return; }
        if ( !Number.isSafeInteger(value.pending) || value.pending < 0 ) { throw Error('Invalid native delivery state'); }
        await new Promise(resolve => setTimeout(resolve, 20));
    } while ( Date.now() < deadline );
    throw Error('Native delivery unacknowledged; reload remains held');
}
const drain = () => Promise.all([staticDeliveries.drain(destroyed), upstreamDeliveries.drain(), drainEarly()]);
const requireEpoch = epoch => {
    if ( starting || epoch !== generation ) { throw Error('Superseded reload completion'); }
};
export async function begin() {
    if ( starting ) { throw Error('Reload begin already pending'); }
    starting = true;
    try {
    loaded = false; ready = false;
    const epoch = ++generation;
    await command('begin', epoch);
    // The browser is held immediately. Already dispatched receivers may finish,
    // but no engine reset or ready acknowledgement can overtake their completion.
    await drain();
    return epoch;
    } finally { starting = false; }
}
export async function complete(epoch = generation) {
    requireEpoch(epoch);
    await drain();
    requireEpoch(epoch);
    loaded = true;
    if ( initialized ) { await command('ready', epoch); requireEpoch(epoch); ready = true; }
}
export async function activate(selfieValid) {
    const epoch = generation;
    requireEpoch(epoch);
    await drain();
    requireEpoch(epoch);
    initialized = true;
    if ( loaded || selfieValid ) { await command('ready', epoch); requireEpoch(epoch); ready = true; }
}
// Startup remains browser-held even if this handshake or subsequent imports fail.
await begin();

export function current() { return {generation, ready}; }
