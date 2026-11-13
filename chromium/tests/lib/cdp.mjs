import {timedOut} from './timing.mjs';
import {jsLiteral} from './js-literal.mjs';
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Playwright's wording: shipping's steps recognise a page that closed under a
// call by this message (isTargetClosedError in poll.js).
const closedError = () => Error('CDP connection closed: Target page, context or browser has been closed');
export async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.method) for (const listener of listeners.get(message.method) || []) listener(message.params);
    const call = pending.get(message.id);
    if (!call) return;
    clearTimeout(call.timer); pending.delete(message.id);
    message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result);
  };
  socket.onclose = () => {
    for (const call of pending.values()) { clearTimeout(call.timer); call.reject(closedError()); }
    pending.clear();
  };
  return {
    close: () => socket.close(),
    on(method, listener) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(listener);
      return () => listeners.get(method).delete(listener);
    },
    send(method, params = {}, timeout = 15000) {
      return new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) { reject(closedError()); return; }
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); timedOut('cdp',method,timeout); reject(Error('CDP timeout: ' + method)); }, timeout);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({id, method, params}));
      });
    },
    async eval(expression, contextId, timeout = 15000) {
      const reply = await this.send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true, userGesture:true, ...(contextId ? {contextId} : {})}, timeout);
      if (reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails));
      return reply.result.value;
    },
  };
}
export async function waitFor(read, accepts, label, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await read(); if (accepts(last)) return last; } catch (e) { if (e.code === 'BLANC_ADAPTER_UNDEFINED') throw e; last = e.message; }
    await pause(100);
  }
  timedOut('poll',label,Date.now()-(end-timeout));
  throw Error(`Timeout waiting for ${label}: ${jsLiteral(last)}`);
}
