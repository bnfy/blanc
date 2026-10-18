// GPL-3.0-or-later with the generated pinned uBO payload.
// Dispatch commits a bounded delivery. Reload must drain it before engine reset;
// timeout is a failed, held reload, never permission to discard an outstanding lease.
export function createDeliveryBarrier(timeoutMs = 3000) {
    const pending = new Map(), waiters = new Set();
    const identity = sender => JSON.stringify([sender.id, sender.tab?.id,
        sender.frameId, sender.documentId, sender.url, sender.origin]);
    return {
        acquire(sender) {
            if ( pending.size >= 64 ) { return; }
            const token = crypto.randomUUID();
            pending.set(token, identity(sender));
            return token;
        },
        acknowledge(token, sender) {
            if ( typeof token !== 'string' || !pending.has(token) ||
                 pending.get(token) !== identity(sender) ) { return false; }
            pending.delete(token);
            if ( pending.size === 0 ) {
                for ( const resolve of waiters ) { resolve(); }
            }
            return true;
        },
        drain() {
            if ( pending.size === 0 ) { return Promise.resolve(); }
            return new Promise((resolve, reject) => {
                const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
                const timer = setTimeout(() => {
                    waiters.delete(done);
                    reject(Error('Static delivery unacknowledged; reload remains held'));
                }, timeoutMs);
                waiters.add(done);
            });
        },
        size() { return pending.size; },
    };
}
export const staticDeliveries = createDeliveryBarrier();
