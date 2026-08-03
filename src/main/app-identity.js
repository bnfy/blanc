// Stable application identity shared by runtime integrations. Keep package.json
// build.appId aligned; unit coverage fails if packaging and runtime ever drift.
// The historical Bowser id is intentional so updates and OS identity survive
// the Blanc rename.
const APP_ID = 'me.bnfy.bowser';

module.exports = { APP_ID };
