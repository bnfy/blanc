// Review calculator, not production code. USD, decimal billing GB, 30-day month.
// Rates/assumptions and excluded costs are documented in the adjacent review.
const assert = require('node:assert/strict');
const M = 1e6, GB = 1e9;
const excess = (n, included, unit, price) => Math.max(0, n - included) / unit * price;
const rounded = (n, included, unit, price) => Math.ceil(Math.max(0, n - included) / unit) * price;
const fixedReservation = 4 * (3 * 524288 + 58 + 256) + 4 * (524288 + 58 + 256);
assert.equal(fixedReservation, 8391120);
assert.equal(fixedReservation + 25 * (436980 + 58 + 256), 19323470);
function traffic(accounts, doSeconds = 0.1) {
  // Two devices/account, eight hours/day, 30 days, ten GETs/min/device.
  // Eight fixed GETs + two Space GETs/min. 20 Space + 40 fixed PUTs/device/day.
  const minutes = accounts * 2 * 8 * 60 * 30;
  const fg = minutes * 8, sg = minutes * 2;
  const sp = accounts * 2 * 30 * 20, fp = accounts * 2 * 30 * 40;
  const requests = fg + sg + sp + fp;
  const kvReads = 4 * fg + 3 * sg + 2 * sp + 3 * fp;
  const kvWrites = 2 * (fg + sg) + sp + 2 * fp;
  const doRequests = sg + sp + fp;
  // Cold existing ledger on every call: conservative read sensitivity.
  const sqlReads = 3 * sg + 2 * sp + fp;
  const sqlWrites = 2 * sp;
  const gbSeconds = doRequests * doSeconds * 0.128;
  const costs = {
    kvReads: excess(kvReads, 10*M, M, 0.5),
    kvWrites: excess(kvWrites, M, M, 5),
    workerRequests: excess(requests, 10*M, M, 0.3),
    workerCpu: excess(requests * 5, 30*M, M, 0.02),
    doRequests: rounded(doRequests, M, M, 0.15),
    doDuration: rounded(gbSeconds, 400000, M, 12.5),
    sqlReads: rounded(sqlReads, 25000*M, M, 0.001),
    sqlWrites: rounded(sqlWrites, 50*M, M, 1),
  };
  return {accounts, requests, kvReads, kvWrites, doRequests, sqlReads, sqlWrites,
    gbSeconds, costs, totalWithBase: 5 + Object.values(costs).reduce((a,b)=>a+b,0)};
}
function storage(accounts) {
  // Payload estimates plus illustrative 10% SQLite physical overhead; NOT a bound.
  const kvGB = accounts * (fixedReservation - 8*256) / GB;
  const sqliteGB = accounts * (25*(436980+58)*1.1 + 12288) / GB;
  return {accounts, kvGB, sqliteGB,
    monthly: excess(kvGB, 1, 1, 0.5) + rounded(sqliteGB, 5, 1, 0.2)};
}
assert.equal(traffic(1).kvWrites, 582000);
assert.equal(traffic(1).requests, 291600);
console.log(JSON.stringify({traffic:[10,100,1000].map(n=>traffic(n)),
  oneSecondDuration:[10,100,1000].map(n=>({accounts:n,total:traffic(n,1).totalWithBase})),
  storage:[300,3650,10950].map(storage)},null,2));
