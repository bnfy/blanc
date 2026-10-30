import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const native = path.resolve(here, '../../native/blocker/blocker_proxy.cc');
const out = path.join(here, 'event-candidate');
const original = fs.readFileSync(native, 'utf8');
let source = original;
const insert = '#include "chrome/services/blanc_blocker/decision_operation.h"\n#include "chrome/services/blanc_blocker/weekly_event_candidate.h"\n';
const include = '#include "chrome/services/blanc_blocker/blocker_proxy.h"\n';
if (source.split(include).length !== 2) throw Error('Unexpected include anchor');
source = source.replace(include, include + insert);
const paths = [
  ['ActivationGate', 'NavigationResponseGate', 'GetNavigationHandle().GetWebContents()->GetBrowserContext()->GetWeakPtr()'],
  ['NavigationResponseGate', 'SocketDecision', 'navigation_handle()->GetWebContents()->GetBrowserContext()->GetWeakPtr()'],
  ['SocketDecision', 'TransportDecision', 'context_'],
  ['TransportDecision', 'Type', 'context_'],
  ['Request', 'Factory', 'context_.browser_context'],
];
for (const [name, next, context] of paths) {
  const start = source.indexOf(`class ${name} `);
  // Type is a free function, not a class.
  const end = name === 'TransportDecision' ? source.indexOf('std::string Type(', start) : source.indexOf(`class ${next} `, start + 1);
  if (start < 0 || end < 0) throw Error(`Missing ${name} boundary`);
  let section = source.slice(start, end);
  const anchor = '    shield_count_.RecordRuleBlock(result);';
  if (section.split(anchor).length !== 2 || section.split('  ShieldCountTicket shield_count_;').length !== 2) throw Error(`Unexpected ${name} anchors`);
  const observed = `${anchor}\n    weekly_candidate_.OnDecision(result, [context = ${context}] {\n      blanc::blocker_stats::PostCandidateRuleBlock(std::move(context));\n    });`;
  section = section.replace(anchor, observed).replace('  ShieldCountTicket shield_count_;', '  ShieldCountTicket shield_count_;\n  blanc::blocker_stats::DecisionOperation weekly_candidate_;');
  source = source.slice(0, start) + section + source.slice(end);
}
fs.mkdirSync(out, {recursive:true});
fs.writeFileSync(path.join(out,'blocker_proxy.cc'),source);
for (const name of ['decision_operation.h','weekly_event_candidate.h','weekly_event_candidate.cc']) fs.copyFileSync(path.join(here,name),path.join(out,name));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const files = ['blocker_proxy.cc','decision_operation.h','weekly_event_candidate.h','weekly_event_candidate.cc'];
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({purpose:'review only: no coverage attestation, no counts',baseNativeSha256:sha(original),files:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(out,file)))])),paths:paths.map(p=>p[0])},null,2)+'\n');
console.log('Prepared five-path review candidate; no source staged, no coverage attested.');
