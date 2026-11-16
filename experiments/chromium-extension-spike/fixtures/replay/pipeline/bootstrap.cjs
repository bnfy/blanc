'use strict';
// Copied into an extracted disposable app. Observe the existing coordinator's
// provider, never replace native listeners, rules, decisions or browser APIs.
const fs = require('node:fs');
const scrub = require('./scrub.cjs');
const { app, webContents } = require('electron');
if (process.env.BLANC_TEST === '1') throw new Error('Capture requires the real blocker');
const expected = process.env.BLANC_F12_PROFILE;
if (!expected || fs.realpathSync(app.getPath('userData')) !== fs.realpathSync(expected)) {
  throw new Error('Unexpected capture profile: ' + app.getPath('userData'));
}
const log = process.env.BLANC_F12_LOG;
if (!log) throw new Error('Capture log required');
const modulePath = './src/main/blocking-coordinator.js';
const coordinatorModule = require(modulePath);
const create = coordinatorModule.createBlockingCoordinator;
const providers = [];
const summaryOnly = process.env.BLANC_F12_SUMMARY_ONLY === '1';
const getDomain=summaryOnly?require('tldts-experimental').getDomain:null;
const categories=new Map();
const metrics = {decisions:{},faults:{},trust:{accepted:0,refused:0}};
const increment = (map,key) => {map[key]=(map[key]||0)+1;};
function saveFault(code) {
  if(summaryOnly)increment(metrics.faults,code);
  else fs.appendFileSync(log,JSON.stringify({fault:code})+'\n');
}
let excludedInternal = 0;
function saveDecision(row) {
  if(summaryOnly){
    const type=['mainFrame','subFrame','script','image','stylesheet','xhr','font','ping','other'].includes(row.resourceType)?row.resourceType:'unknown';
    let party='unknown';
    try{const top=row.resourceType==='mainFrame'?row.url:row.frame?.topOrigin;const a=new URL(row.url).hostname,b=new URL(top).hostname;
      if(b)party=(getDomain(a,{allowPrivateDomains:true})||a)===(getDomain(b,{allowPrivateDomains:true})||b)?'first-party':'third-party';}catch{ /* Missing or opaque top frame stays unknown. */ }
    if(categories.size<10000){const value=JSON.stringify({resourceType:type,party});if(!categories.has(row.url))categories.set(row.url,new Set());categories.get(row.url).add(value);}
    else increment(metrics.faults,'category-cap');
    let reason='admitted';try{scrub.decision(row);}catch(error){reason=error instanceof scrub.Refusal?error.code:'scrub-failed';}
    increment(metrics.decisions,[type,party,row.result?.cancel===true?'block':'allow',reason].join('|'));
    return;
  }
  try { fs.appendFileSync(log, JSON.stringify(scrub.decision(row))+'\n'); }
  catch { saveFault('decision-scrub-refused'); }
}
const fixtureTrust = process.env.BLANC_F12_TRUST && JSON.parse(fs.readFileSync(process.env.BLANC_F12_TRUST));
const verifyFixture = fixtureTrust && require('./fixture-trust.cjs').createVerifier(fixtureTrust);
const trustedSessions = new WeakSet();
function installFixtureTrust(session) {
  if (!verifyFixture || trustedSessions.has(session)) return;
  session.setCertificateVerifyProc((request, callback) => {
    const accepted = verifyFixture(request.hostname, request.certificate.data);
    if(summaryOnly)metrics.trust[accepted?'accepted':'refused']++;
    else fs.appendFileSync(process.env.BLANC_F12_TRUST_LOG, JSON.stringify({hostname:request.hostname,
      accepted,profileKind:session.isPersistent()?'regular':'private',
      originalResult:request.verificationResult})+'\n');
    callback(accepted ? 0 : -2);
  });
  trustedSessions.add(session);
}
const activeGates = new Set();
const safe = fn => { try { return fn() ?? null; } catch { return null; } };
coordinatorModule.createBlockingCoordinator = function(...args) {
  const coordinator = create(...args);
  const setGate = coordinator.setGate;
  coordinator.setGate = function(session, listener) {
    installFixtureTrust(session);
    if (listener) activeGates.add(session); else activeGates.delete(session);
    return setGate(session, listener);
  };
  const set = coordinator.setProvider;
  const wrapped = new WeakMap();
  coordinator.setProvider = function(session, provider) {
    installFixtureTrust(session);
    if (!provider) return set(session, provider);
    if (!wrapped.has(provider)) {
      const observer = Object.create(provider);
      const profileKind = session.isPersistent() ? 'regular' : 'private';
      observer.decide = async function(event, details) {
        if (event !== 'onBeforeRequest') {
          return provider.decide(event, details);
        }
        if (!/^https?:/.test(details.url)) {
          if (/^(?:file|blanc|blanc-chrome|data|devtools):/.test(details.url)) excludedInternal++;
          else saveFault('unsupported-network-scheme');
          return provider.decide(event, details);
        }
        const wc = safe(() => webContents.fromId(details.webContentsId));
        // These are raw values at the real hook, not expected fixture context.
        const observed = {
          requestId: String(details.id), url: details.url, method: details.method,
          resourceType: details.resourceType, referrer: details.referrer ?? null,
          initiatorOrigin: details.initiatorOrigin ?? null,
          initiatorOriginPresent: Object.hasOwn(details, 'initiatorOrigin'), webContentsId: details.webContentsId ?? null,
          frame: safe(() => ({ url: details.frame.url, origin: details.frame.origin,
            routingId: details.frame.routingId, processId: details.frame.processId,
            topUrl: details.frame.top.url, topOrigin: details.frame.top.origin })),
          tabUrl: safe(() => wc.getURL()), profileKind,
          sessionPersistent: session.isPersistent(), provider: provider.id,
          status: provider.status?.() ?? { id: 'startup-gate', phase: 'initializing' }, timestamp: new Date().toISOString(),
        };
        try {
          const result = await provider.decide(event, details);
          saveDecision({ ...observed, result: result ?? {} });
          return result;
        } catch (error) {
          saveFault('provider-error');
          throw error;
        }
      };
      wrapped.set(provider, observer);
      providers.push({ session, provider });
    }
    return set(session, wrapped.get(provider));
  };
  return coordinator;
};
globalThis.__blancF12Capture = {
  classifyRequest: url => {const found=categories.get(url);return found?.size===1?JSON.parse([...found][0]):{resourceType:'unknown',party:'unknown'};},
  resetMetrics: () => {categories.clear();metrics.decisions={};metrics.faults={};metrics.trust={accepted:0,refused:0};},
  state: () => ({ metrics, userData: app.getPath('userData'), versions: process.versions, activeGates: activeGates.size, excludedInternal,
    providers: providers.map(({session, provider}) => ({persistent: session.isPersistent(),
      status: provider.status?.() ?? { id: 'startup-gate', phase: 'initializing' }})) }),
};
require('./src/main/main.js');
