// Trusted chrome renderer adapter. Native code owns profile/account routing,
// filtering and authorization. This module cannot grant publication authority.
export function createRemoteTabsReader(request) {
  if (typeof request !== 'function') throw new TypeError('Native request required');
  let generation = 0;
  let closed = false;
  const stale = () => Object.assign(new Error('Remote tabs view invalidated'), { code: 'STALE_REMOTE_TABS' });
  return Object.freeze({
    async listRemoteTabs() {
      if (closed) throw stale();
      const started = generation;
      const devices = await request('listRemoteTabs', []);
      // Account changes, disable and teardown must invalidate in-flight reads.
      // Native code must independently reject stale account/profile replies.
      if (closed || started !== generation) throw stale();
      if (!Array.isArray(devices)) throw new TypeError('Invalid native remote tabs response');
      return devices;
    },
    invalidate() { generation += 1; },
    dispose() { closed = true; generation += 1; },
  });
}
