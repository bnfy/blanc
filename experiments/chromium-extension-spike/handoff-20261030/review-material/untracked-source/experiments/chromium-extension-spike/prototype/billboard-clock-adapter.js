// Clock-specific adapter for the shipping Start Page contract. The host
// supplies its profile-local read/save functions and the reviewed model.
// Nothing is stored by this module itself and no page can access new native
// capabilities through it.
(() => {
  'use strict';
  function create({ read, save, model }) {
    if (typeof read !== 'function' || typeof save !== 'function' ||
        typeof model?.settingsForClock !== 'function' ||
        typeof model?.clockStyleFromSettings !== 'function')
      throw new TypeError('Clock adapter requires settings access and clock rules');
    const data = async () => model.clockStyleFromSettings(await read());
    let pending = Promise.resolve();
    const setClock = partial => {
      const write = model.settingsForClock(partial);
      // Keep order when a user quickly changes multiple controls and the
      // native profile store acknowledges writes asynchronously.
      const operation = pending.then(async () => {
        if (Object.keys(write).length) await save(write);
        return data();
      });
      pending = operation.catch(() => {});
      return operation;
    };
    return Object.freeze({ data, setClock });
  }
  globalThis.BlancBillboardClock = Object.freeze({ create });
})();
