'use strict';

let nextCallId = 1;

const isCollectedInspectorReply = (error) =>
  /Execution context was destroyed/i.test(String(error?.message || error));

/** Invoke one main-process test hook, retrying only the inspector reply with
 * the same id. __blancCall owns idempotency, so a mutating hook never runs
 * twice when Playwright loses the first response. */
async function callTestHook(electronApp, method, args = []) {
  const request = { id: nextCallId++, method, args };
  const invoke = () => electronApp.evaluate(
    (_electron, p) => globalThis.__blancCall(p.id, p.method, p.args),
    request
  );
  try {
    return await invoke();
  } catch (error) {
    if (!isCollectedInspectorReply(error)) throw error;
    return invoke();
  }
}

module.exports = { callTestHook, isCollectedInspectorReply };
