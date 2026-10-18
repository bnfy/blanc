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
            pending.set(token, {key: identity(sender), documentId: sender.documentId});
            return token;
        },
        acknowledge(token, sender) {
            if ( typeof token !== 'string' || !pending.has(token) ||
                 pending.get(token).key !== identity(sender) ) { return false; }
            pending.delete(token);
            if ( pending.size === 0 ) {
                for ( const resolve of waiters ) { resolve(); }
            }
            return true;
        },
        drain(destroyed) {
            if ( pending.size === 0 ) { return Promise.resolve(); }
            return new Promise((resolve, reject) => {
                let active = true, querying = false;
                const stop = () => { active = false; clearTimeout(timer); clearInterval(poll); waiters.delete(done); };
                const done = () => { stop(); resolve(); };
                const timer = setTimeout(() => {
                    stop();
                    reject(Error('Static delivery unacknowledged; reload remains held'));
                }, timeoutMs);
                // Never retire on a timeout, transport error, inactive frame,
                // missing reply or a document ID supplied by the page.
                const check = async () => {
                    if ( !active || querying || !destroyed ) { return; }
                    querying = true;
                    try {
                        for ( const [token, lease] of [...pending] ) {
                            const gone = await destroyed(lease.documentId);
                            if ( active && gone === true && pending.get(token) === lease ) {
                                pending.delete(token);
                            }
                        }
                        if ( active && pending.size === 0 ) { for ( const resolve of waiters ) { resolve(); } }
                    } catch { /* unknown remains held */ }
                    finally { querying = false; }
                };
                const poll = setInterval(check, 100);
                waiters.add(done);
                void check();
            });
        },
        size() { return pending.size; },
    };
}
export const staticDeliveries = createDeliveryBarrier();
