import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const read = file => fs.readFileSync(new URL(file,import.meta.url),'utf8');

test('Linux enables the packaged blocker and verifies the selected engine before use', () => {
 const available = read('../blanc/services/blocker/blocker_available.h').split('inline bool BlockerAvailable()')[1];
 assert.match(available, /#(?:if|elif) [^\n]*BUILDFLAG\(IS_LINUX\)[^\n]*\n\s*return true;/);
 const proxy = read('../blanc/services/blocker/blocker_proxy.cc');
 const reader = proxy.split('std::string ReadBundle()')[1].split('class Engine')[0];
 const [override, fallback] = reader.split(/} else \{\s*#if BUILDFLAG\(IS_LINUX\)/);
 assert.match(override, /GetSwitchValuePath\("blanc-blocker-assets"\).AppendASCII\("engine.js"\)/);
 const linuxLookup = fallback.split('#elif')[0];
 assert.ok(linuxLookup.includes('base::PathService::Get(base::DIR_EXE, &path)'));
 assert.ok(linuxLookup.includes('path.AppendASCII("blanc_blocker").AppendASCII("engine.js")'));
 assert.match(reader, /ReadFileToStringWithMaxSize[\s\S]*Sha256\(script\)[^\n]*!= kBlancBlockerBundleSha256\) return std::string\(\)/);
 assert.match(proxy, /void Loaded\([^)]*\) \{[^}]*if \(script.empty\(\)\) \{ Fail\(\); return;/);
});

test('installed suite runs the import check, generates locales and repeats Island layout at 2x', () => {
 const workflow = YAML.parse(read('../../.github/workflows/chromium-linux-candidate.yml'));
 assert.ok(workflow.on.workflow_dispatch.inputs.check.options.includes('suite'));
 const job = workflow.jobs.suite;
 assert.match(job.if,/inputs.check == 'suite'/);
 const script = job.steps.map(step=>step.run || '').join('\n');
 for(const part of ['QUIT_INSTALLED_SHA256','de_DE.UTF-8','en_US.UTF-8','--scale=2','vertical-tabs','island-and-commands','openbox'])assert.ok(script.includes(part),part);
});

test('Linux counts capture requests made on live widgets while pairing', () => {
 const src=read('../blanc/browser/ui/blanc_prototype_ui.cc').split('== "windowsContentProtected"')[1].split('Reply(id')[0];
 assert.match(src,/#if BUILDFLAG\(IS_LINUX\)[\s\S]*sync_capture_requested[\s\S]*#else[\s\S]*AreScreenshotsAllowed/);
 const settings=read('../blanc/browser/ui/chromium_settings_handler.inc');
 assert.match(settings,/sync_capture_requested = active;[\s\S]*SetAllowScreenshots\(!active\)/);
});

test('only missing Brave on Linux takes the native Manage search engines fallback', async () => {
 const {missingEngineTemplate} = await import('../tests/adapters/commands.mjs');
 assert.equal(missingEngineTemplate('brave','linux'),'https://search.brave.com/search?q=%s');
 for(const platform of ['win32','darwin'])assert.equal(missingEngineTemplate('brave',platform),null);
 assert.equal(missingEngineTemplate('not-an-engine','linux'),null);
});
