'use strict';

/**
 * A renderer may host more than one WebContents. Electron explicitly warns
 * that forcefullyCrashRenderer() kills every WebContents in that process, so
 * uncertainty here must leave the tab awake.
 */
function hasExclusiveRenderer(target, allContents) {
  let targetPid;
  try { targetPid = target.getOSProcessId(); } catch { return false; }
  if (!Number.isInteger(targetPid) || targetPid <= 0) return false;

  for (const candidate of allContents) {
    if (candidate === target) continue;
    try {
      if (candidate.isDestroyed()) continue;
      if (candidate.getOSProcessId() === targetPid) return false;
    } catch {
      return false;
    }
  }
  return true;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask Chromium for the event listeners installed on every frame's main-world
 * Window object. A renderer kill cannot run beforeunload, so any such handler
 * is a conservative exclusion. CDP failure is also an exclusion.
 */
async function hasBeforeUnloadListener(contents, { contextWaitMs = 50 } = {}) {
  const client = contents?.debugger;
  if (!client) return true;

  let attachedHere = false;
  const contexts = new Map();
  const onMessage = (_event, method, params) => {
    if (method !== 'Runtime.executionContextCreated') return;
    const context = params?.context;
    if (context?.auxData?.isDefault && context.auxData.frameId) {
      contexts.set(context.id, context);
    }
  };

  try {
    if (!client.isAttached()) {
      client.attach('1.3');
      attachedHere = true;
    }

    // Re-enable so Chromium reports every context that already exists. Blanc
    // also uses this debugger client for UA metadata, but not the Runtime
    // domain; resetting this domain does not disturb that override.
    await client.sendCommand('Runtime.disable').catch(() => {});
    client.on('message', onMessage);
    await client.sendCommand('Runtime.enable');
    await wait(contextWaitMs);
    if (contexts.size === 0) return true;

    for (const context of contexts.values()) {
      const evaluated = await client.sendCommand('Runtime.evaluate', {
        expression: 'window',
        contextId: context.id,
        returnByValue: false,
        silent: true,
      });
      const objectId = evaluated?.result?.objectId;
      if (!objectId) return true;
      const result = await client.sendCommand('DOMDebugger.getEventListeners', {
        objectId,
        depth: 1,
        pierce: true,
      });
      if (result?.listeners?.some((listener) => listener.type === 'beforeunload')) return true;
    }
    return false;
  } catch {
    return true;
  } finally {
    client.removeListener?.('message', onMessage);
    let stillAttached = false;
    try { stillAttached = client.isAttached(); } catch {}
    if (stillAttached) await client.sendCommand('Runtime.disable').catch(() => {});
    if (attachedHere && stillAttached) {
      try { client.detach(); } catch {}
    }
  }
}

module.exports = { hasExclusiveRenderer, hasBeforeUnloadListener };
