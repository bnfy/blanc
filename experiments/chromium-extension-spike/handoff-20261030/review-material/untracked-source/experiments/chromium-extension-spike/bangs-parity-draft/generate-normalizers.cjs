'use strict';
// Extract unchanged release functions; output is a build input, not a live asset.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const dir=__dirname, file=path.join(dir,'shipping/settings.js'), text=fs.readFileSync(file,'utf8');
const start=text.indexOf('const MAX_CUSTOM_BANGS = 100;'), end=text.indexOf('\nconst DEFAULTS = {',start);
if(start<0||end<0||text.indexOf('function normalizeRecentBangs',start)<0)throw Error('unexpected release input');
const snippet=text.slice(start,end);
const out="'use strict';\nconst Bangs = require('./shipping/bangs');\nconst { isValidSearchTemplate } = require('./shipping/search-engine-template');\n"+snippet+'\nmodule.exports = { normalizeCustomBangs, normalizeRecentBangs };\n';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const output=path.join(dir,'shipping-normalizers.js'), manifest=path.join(dir,'normalizers-manifest.json');
if(fs.existsSync(manifest)){const old=JSON.parse(fs.readFileSync(manifest));if(old.inputSha256!==sha(text)||old.outputSha256!==sha(out))throw Error('source or output drift');}
fs.writeFileSync(output,out);fs.writeFileSync(manifest,JSON.stringify({release:'v1.45.1',commit:'85883b1afa11375e1300130914d6f40c5388af21',inputSha256:sha(text),outputSha256:sha(out),snippetSha256:sha(snippet),scope:'exact released normalizer functions; no native integration'},null,2)+'\n');
