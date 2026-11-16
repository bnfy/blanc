// Outbound-isolation leak probe (S1.1): with no test fixture, a suggestion
// request really goes out, and the recording proxy is the only way out. An
// ordinary prefix must reach the selected engine (DuckDuckGo on a fresh
// profile); credential- and card-shaped text, a bang, text typed with
// suggestions off and text typed in a private window must not leave at all.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NativeFixture} from '../lib/fixture.mjs';
import {connect, waitFor} from '../lib/cdp.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';

const [configPath, outFile] = process.argv.slice(2);
if (!configPath || !outFile) throw Error('Usage: leak-probe.mjs runtime-config.json result.json');
const config = JSON.parse(fs.readFileSync(configPath));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = {candidate: config.candidate, probes: [], status: 'started'};

async function probe(fixture, label, query, expectEngine) {
  const before = fixture.egress.length;
  const answer = await fixture.host.eval(`window.BlancPrototypeHost.api.searchSuggestions(${jsLiteral(query)})
    .then(r => r && r.engine, e => 'error: ' + e.message)`);
  // The request is sent before the 2.5 s timeout; wait past it.
  await pause(3500);
  const sent = fixture.egress.slice(before).map(r => r.target);
  result.probes.push({label, query, engine: answer, sent});
  // Exactly one CONNECT, and its whole target is DuckDuckGo's.
  const reached = sent.length === 1 && sent[0] === 'duckduckgo.com:443';
  if (expectEngine ? !reached : sent.length !== 0)
    throw Error(`${label}: expected ${expectEngine ? 'one request to duckduckgo.com' : 'nothing'}, saw ${JSON.stringify(sent)}`);
}

const fixtures = [];
try {
  const normal = new NativeFixture();
  fixtures.push(normal);
  await normal.launch(config, fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-leak-')) + '/case', {diskAssets: false});
  await waitFor(() => normal.host.eval('typeof window.BlancBrowserApi?.invoke'), t => t === 'function', 'typed interface');
  await probe(normal, 'ordinary prefix', 'blanc outbound probe', true);
  await probe(normal, 'credential', 'password: hunter2', false);
  await probe(normal, 'card number', '4111 1111 1111 1111', false);
  await probe(normal, 'bang', '!yt lofi', false);
  // Suggestions off through Settings → Search engine's own switch (S1.7).
  await normal.host.eval(`window.BlancPrototypeHost.api.openPage('settings', 'search')`);
  const isSettings = t => t.url.startsWith('chrome://settings/search');
  const settings = (await waitFor(normal.targets, ts => ts.some(isSettings), 'Settings sheet')).find(isSettings);
  const page = await connect(settings);
  normal.connections.push(page);
  const deep = `const find=(sel,root=document)=>{const e=root.querySelector(sel);if(e)return e;for(const el of root.querySelectorAll('*'))if(el.shadowRoot){const x=find(sel,el.shadowRoot);if(x)return x;}return null;};`;
  await waitFor(() => page.eval(`(()=>{${deep}return find('#blancSearchSuggestions')?.checked;})()`), v => v === true, 'Search suggestions switch');
  await page.eval(`(()=>{${deep}find('#blancSearchSuggestions').click();})()`);
  await waitFor(() => page.eval(`(()=>{${deep}return find('#blancSearchSuggestions').checked;})()`), v => v === false, 'suggestions off');
  await probe(normal, 'suggestions off', 'opted out probe', false);
  result.normalExit = await normal.close();
  fixtures.length = 0;

  const privateWindow = new NativeFixture();
  fixtures.push(privateWindow);
  await privateWindow.launch(config, fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-leak-private-')) + '/case',
    {diskAssets: false, privateMode: true});
  await waitFor(() => privateWindow.host.eval('typeof window.BlancBrowserApi?.invoke'), t => t === 'function', 'typed interface');
  await probe(privateWindow, 'private window', 'private outbound probe', false);
  result.status = 'passed';
} catch (e) {
  result.status = 'failed';
  result.error = String(e.stack || e);
} finally {
  for (const fixture of fixtures) result.exit = await fixture.close().catch(e => String(e));
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({status: result.status, probes: result.probes.map(p => `${p.label}: ${p.sent.join(',') || 'nothing'}`), error: result.error?.split('\n')[0]}));
}
if (result.status !== 'passed') process.exitCode = 1;
