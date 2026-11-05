// The one door in: main calls __call(method, argsJson, done). `method` names a
// module and an export, from this list only.
const MODULES = {sync: 'sync', bookmarks: 'bookmarks', settings: 'settings'};
globalThis.__call = (method, argsJson, done) => {
  const [mod, fn] = String(method).split('.');
  const file = MODULES[mod];
  Promise.resolve().then(() => {
    const target = file && __require(`src/main/${file}.js`)[fn];
    if (typeof target !== 'function') throw new Error(`no method ${method}`);
    return target(...JSON.parse(argsJson || '[]'));
  }).then(value => done(true, JSON.stringify(value === undefined ? null : value)), error => done(false, String(error && error.message || error)));
};
