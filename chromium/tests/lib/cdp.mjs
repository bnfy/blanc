export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  const pending = new Map();
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    const call = pending.get(message.id);
    if (!call) return;
    clearTimeout(call.timer); pending.delete(message.id);
    message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result);
  };
  socket.onclose = () => {
    for (const call of pending.values()) { clearTimeout(call.timer); call.reject(Error('CDP connection closed')); }
    pending.clear();
  };
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({id, method, params}));
      });
    },
    async eval(expression) {
      const reply = await this.send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true, userGesture:true});
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
  throw Error(`Timeout waiting for ${label}: ${JSON.stringify(last)}`);
}
